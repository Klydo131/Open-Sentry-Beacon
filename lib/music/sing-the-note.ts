// Sing the note: the Tuner's practice. Tap a note, sing it, and this says
// whether you hit it: Perfect, Close, or Try again.
//
// Asked for on 14 October 2026: "place a note that you are looking for voice
// and see if you hit the note correctly ... rewarded for 'perfect pitch' ...
// MAKE SURE the tuner for voice is extremely accurate with 1 to 1 on voice to
// notes", then "the accuracy of notes from voice to notes needs to be 99%
// accurate and fast". Made simpler on 15 October 2026: "just tap or click a
// note and I will just sing ... and it will detect if I hit a perfect note or
// close enough, that's all." So a note sung is graded in three (gradeOf, at
// the end): PERFECT within a tenth of a semitone, CLOSE within a quarter (as
// near as a choir needs), and anything further, or another note, is a try
// again that says what was sung. The run of five to ten notes, the voice
// parts and the two strictness settings went with that change.
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

/** Perfect: within this many cents (a tenth of a semitone) of the note. */
export const PERFECT_CENTS = 10;
/** Close: within this many (a quarter of a semitone), as near as a choir needs. Also the judge's hit. */
export const CLOSE_CENTS = 25;

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
 *
 * `rest`: when that grade was given (`from`) and until when it stays on the
 * screen (`until`). Until then nothing is shown or judged, but every reading
 * is heard: a breath taken while the grade shows is a breath, and a new try
 * begun then is timed from its first moment. Before 15 October 2026 the card
 * fed the judge nothing while a grade showed, so a breath taken then was
 * missed, and the same note sung again was taken for the old one still held
 * and never graded ("it bugs out after using it one time").
 */
export class NoteJudge {
  private run: { at: number; semi: number }[] = [];
  private startedAt = 0;
  private lastAt = -Infinity;
  private done: Verdict | null = null;
  private after: number | null;
  /** The last moments of the voice while it may still be on the note before. */
  private lingering: { at: number; semi: number }[] = [];
  private notBefore = -Infinity;

  constructor(
    readonly target: number,
    private readonly a4: number,
    private readonly tolerance: number,
    after: number | null = null,
    rest: { from: number; until: number } | null = null,
  ) {
    this.after = after;
    // The voice was sounding when the last grade was given: a gap is counted
    // from then, so one unclear frame straight after it is not a breath.
    if (rest) { this.lastAt = rest.from; this.notBefore = rest.until; }
  }

  /** Forget the note being held, as if the singer had paused (while a note plays, say). */
  restart(): void {
    this.run = [];
    this.lastAt = -Infinity;
  }

  push(hz: number | null, now: number): Judging {
    if (this.done) return { state: 'judged', verdict: this.done };
    // The last grade is still showing: everything is heard, nothing is shown.
    const resting = now < this.notBefore;
    if (hz === null || !(hz > 0)) {
      // A breath: the note being held ends, and so does the last one's hold.
      if (now - this.lastAt > GAP_MS) {
        this.run = [];
        this.after = null;
      }
      return this.run.length && !resting ? this.holding(now) : { state: 'waiting' };
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
    if (resting) return { state: 'waiting' };
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

export type Grade = 'perfect' | 'close' | 'off';

/** A note sung, graded: within PERFECT_CENTS, within CLOSE_CENTS, or not. */
export function gradeOf(v: Verdict): Grade {
  const off = Math.abs(v.cents);
  return off <= PERFECT_CENTS ? 'perfect' : off <= CLOSE_CENTS ? 'close' : 'off';
}

/** The few words under a grade, and which way to go (up, down, or nowhere). */
export function gradeHint(v: Verdict): { words: string; go: 'up' | 'down' | null } {
  const grade = gradeOf(v);
  if (grade === 'perfect') return { words: 'Right on the note', go: null };
  const go = v.cents < 0 ? 'up' : 'down';
  if (grade === 'close') return { words: v.cents < 0 ? 'A little flat' : 'A little sharp', go };
  const near = Math.round(v.sung);
  if (near === v.target) return { words: v.cents < 0 ? 'Too flat' : 'Too sharp', go };
  return { words: `You sang ${midiName(near)}`, go };
}
