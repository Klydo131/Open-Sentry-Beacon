// Sing the note: the Tuner's practice. A note (or a run of five to ten) is
// shown, the singer sings it, and this says whether they hit it.
//
// Asked for on 14 October 2026: "place a note that you are looking for voice
// and see if you hit the note correctly or if you put at least 5-10 notes and
// see if you hit those correctly and the user will be rewarded for 'perfect
// pitch' ... MAKE SURE the tuner for voice is extremely accurate with 1 to 1
// on voice to notes", then "the accuracy of notes from voice to notes needs to
// be 99% accurate and fast".
//
// WHAT IS JUDGED. Not the first thing heard. A singer scoops into a note,
// wobbles on it, and takes a moment to settle, so a sung note counts once it
// has been held for HOLD_MS. Its pitch is the middle (the median) of the
// tuner's own readings over that time, leaving out the first SETTLE_MS of the
// scoop: a vibrato's swings either side cancel, and one stray reading cannot
// move a median. A hit is that pitch within the tolerance of the note asked
// for, in the same octave: C3 is not C4, however well it is sung.
//
// THE READINGS are lib/music/pitch-tracker.ts's raw readings, one a frame,
// before the needle's smoothing. Measured there on made-up voices (every note
// of five voice parts on five vowels, under vibrato, breath, echo and a phone's
// microphone) and on real singing with pitch marked by people (vocadito,
// CC BY 4.0); the numbers are in docs/MUSIC-RESEARCH.md and tests/the-music-room.mjs.
//
// Pure: no microphone, no clock. The Tuner card feeds it readings and the time.

import { midiName } from '@/lib/music/notes';

/** How long a note must be held to be judged. Long enough to settle, short enough to feel quick. */
export const HOLD_MS = 600;
/** The scoop into a note: readings this soon after a note starts are not judged. */
export const SETTLE_MS = 150;
/** A gap in the readings shorter than this is not a breath: the note goes on. */
export const GAP_MS = 160;
/** Further than this from the note being held is a different note: start again. */
export const NEW_NOTE_CENTS = 120;

/** How close counts as a hit, in cents (a hundred to a semitone). */
export const TOLERANCES = [
  { id: 'choir', cents: 25, name: 'Choir', about: 'Within a quarter of a semitone' },
  { id: 'exact', cents: 10, name: 'Exact', about: 'Within a tenth of a semitone' },
] as const;
export type Tolerance = (typeof TOLERANCES)[number]['id'];
export const centsFor = (t: Tolerance) => TOLERANCES.find((x) => x.id === t)?.cents ?? 25;

/** The most notes in one practice, and the fewest that make a run. */
export const MOST_NOTES = 10;
export const RUN_NOTES = 5;

/** The voice parts, each with the notes it can sing comfortably (MIDI). */
export const VOICE_PARTS = [
  { id: 'any', name: 'Any voice', low: 48, high: 72 }, //  C3 to C5
  { id: 'soprano', name: 'Soprano', low: 60, high: 81 }, // C4 to A5
  { id: 'alto', name: 'Alto', low: 53, high: 74 }, //       F3 to D5
  { id: 'tenor', name: 'Tenor', low: 48, high: 69 }, //     C3 to A4
  { id: 'bass', name: 'Bass', low: 40, high: 64 }, //       E2 to E4
] as const;
export type VoicePart = (typeof VOICE_PARTS)[number]['id'];
export const partFor = (id: VoicePart) => VOICE_PARTS.find((p) => p.id === id) ?? VOICE_PARTS[0];

export interface Verdict {
  /** The note asked for (MIDI). */
  target: number;
  /** What was sung: the middle of the readings, as a MIDI number with its fraction. */
  sung: number;
  /** How far the sung pitch was from the note asked for, in cents. */
  cents: number;
  hit: boolean;
}

export type Judging =
  | { state: 'waiting' }
  | { state: 'holding'; progress: number; sung: number }
  | { state: 'judged'; verdict: Verdict };

const semis = (hz: number, a4: number) => 69 + 12 * Math.log2(hz / a4);

function middle(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/**
 * Judges one note. Feed it the tuner's readings (Hz, or null for a frame with
 * none) and the time; it answers waiting, holding (and how far through), or
 * judged. After `judged` it is done: make a new one for the next note.
 *
 * `after`: the pitch (MIDI) of the note just judged. A singer still holding it
 * when the next note is shown is not judged on it: the voice must stop, or
 * move a note away, first.
 */
export class NoteJudge {
  private run: { at: number; semi: number }[] = [];
  private startedAt = 0;
  private lastAt = -Infinity;
  private done: Verdict | null = null;
  private after: number | null;
  /** The last moments of the voice while it may still be on the note before. */
  private lingering: { at: number; semi: number }[] = [];

  constructor(
    readonly target: number,
    private readonly a4: number,
    private readonly tolerance: number,
    after: number | null = null,
  ) {
    this.after = after;
  }

  /** Forget the note being held, as if the singer had paused (while a note plays, say). */
  restart(): void {
    this.run = [];
    this.lastAt = -Infinity;
  }

  push(hz: number | null, now: number): Judging {
    if (this.done) return { state: 'judged', verdict: this.done };
    if (hz === null || !(hz > 0)) {
      // A breath: the note being held ends, and so does the last one's hold.
      if (now - this.lastAt > GAP_MS) {
        this.run = [];
        this.after = null;
      }
      return this.run.length ? this.holding(now) : { state: 'waiting' };
    }
    const semi = semis(hz, this.a4);
    if (this.after !== null) {
      // Still on the note just judged (the middle of the last moments within
      // half a semitone of it, so a vibrato's swing does not count as leaving):
      // not an answer to this one.
      this.lingering = [...this.lingering.filter((r) => now - r.at <= 150), { at: now, semi }];
      this.lastAt = now;
      if (Math.abs(middle(this.lingering.map((r) => r.semi)) - this.after) < 0.5) return { state: 'waiting' };
      this.after = null;
      this.run = [];
    }
    const gap = now - this.lastAt > GAP_MS;
    const recent = this.run.filter((r) => now - r.at <= 200).map((r) => r.semi);
    const moved = recent.length > 0 && Math.abs(semi - middle(recent)) * 100 > NEW_NOTE_CENTS;
    if (gap || moved || !this.run.length) {
      this.run = [];
      this.startedAt = now;
    }
    this.run.push({ at: now, semi });
    this.lastAt = now;
    if (now - this.startedAt < HOLD_MS) return this.holding(now);
    const settled = this.run.filter((r) => r.at - this.startedAt >= SETTLE_MS).map((r) => r.semi);
    const sung = middle(settled.length ? settled : this.run.map((r) => r.semi));
    const cents = Math.round((sung - this.target) * 100);
    this.done = { target: this.target, sung, cents, hit: Math.abs(cents) <= this.tolerance };
    return { state: 'judged', verdict: this.done };
  }

  private holding(now: number): Judging {
    const sung = middle(this.run.slice(-8).map((r) => r.semi));
    return { state: 'holding', progress: Math.min(1, (now - this.startedAt) / HOLD_MS), sung };
  }
}

/** A run of notes for a voice part, picked at random but singable: no leap wider than a fifth. */
export function pickNotes(count: number, part: VoicePart, random: () => number = Math.random): number[] {
  const { low, high } = partFor(part);
  const n = Math.max(1, Math.min(MOST_NOTES, Math.round(count)));
  const notes: number[] = [];
  let at = Math.round(low + (high - low) * (0.3 + 0.4 * random()));
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      let step = 0;
      while (step === 0) step = Math.round((random() * 2 - 1) * 7);
      at = Math.max(low, Math.min(high, at + step));
      if (at === notes[i - 1]) at = at + (at < high ? 1 : -1);
    }
    notes.push(at);
  }
  return notes;
}

/** What was sung, in words a singer can use. */
export function verdictWords(v: Verdict): string {
  const asked = midiName(v.target);
  const near = Math.round(v.sung);
  const off = Math.abs(v.cents);
  if (v.hit) {
    return off <= 2 ? `${asked}, right in the middle` : `${asked}, ${off} cents ${v.cents < 0 ? 'flat' : 'sharp'}`;
  }
  if (near === v.target) return `${asked}, but ${off} cents ${v.cents < 0 ? 'flat' : 'sharp'}`;
  const apart = near - v.target;
  if (Math.abs(apart) % 12 === 0) {
    const octaves = Math.abs(apart) / 12;
    return `${midiName(near)}: ${octaves === 1 ? 'an octave' : `${octaves} octaves`} ${apart < 0 ? 'below' : 'above'} ${asked}`;
  }
  const semitones = Math.abs(apart);
  const how = semitones === 1 ? 'a semitone' : semitones === 2 ? 'a whole tone' : `${semitones} semitones`;
  return `${midiName(near)}: ${how} ${apart < 0 ? 'below' : 'above'} ${asked}`;
}
