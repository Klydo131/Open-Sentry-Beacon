// The conductor's beat: when each click falls, which beat of the bar it is,
// and where the baton is between them. Pure functions, no browser, so
// tests/the-music-room.mjs runs them.
//
// WHY THE CLICKS ARE SCHEDULED, NOT TIMED. A browser timer (setTimeout) can
// fire tens of milliseconds late whenever the phone is busy, and a metronome
// that wanders by that much is worse than none: a choir hears it at once. The
// Web Audio clock does not wander. So a cheap timer wakes every 25 ms and
// hands the audio clock every click due in the next tenth of a second, each at
// its exact time ("A tale of two clocks", web.dev/articles/audio-scheduling).
// `due` below is that hand-over, written so it can be tested.

export const TEMPO_MIN = 30;
export const TEMPO_MAX = 240;
export const TEMPO_DEFAULT = 80;

export function clampTempo(bpm: number): number {
  if (!Number.isFinite(bpm)) return TEMPO_DEFAULT;
  return Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(bpm)));
}

/**
 * The word printed over the music for a tempo, so a number means something to
 * somebody who reads "Andante" on the page and not "92". The bands are the
 * ones most metronomes print; composers disagree at the edges, and that is
 * fine for a label.
 */
export function tempoName(bpm: number): string {
  if (bpm < 66) return 'Largo';
  if (bpm < 76) return 'Adagio';
  if (bpm < 108) return 'Andante';
  if (bpm < 120) return 'Moderato';
  if (bpm < 168) return 'Allegro';
  return 'Presto';
}

/**
 * The patterns a conductor beats. Six is beaten as two groups of three on the
 * page of most choir handbooks; it is drawn here as six, so a choir counting
 * quavers in 6/8 sees every one.
 */
export const METERS = [2, 3, 4, 6] as const;
export type Meter = (typeof METERS)[number];

export interface Click {
  /** On the audio clock, in seconds. */
  at: number;
  /** 0 for the first beat of the bar, which is accented. */
  beat: number;
  /** 0 on the beat; 1, 2, 3 for the clicks between beats (Advanced). */
  sub?: number;
}

/** Where the scheduler has got to: the next click not yet handed over. */
export interface BeatState {
  nextAt: number;
  nextBeat: number;
  /** Which click between beats comes next; 0 is the beat itself. */
  nextSub?: number;
}

/** Clicks to a beat (Advanced): 1 the beat alone, 2 halves, 3 triplets, 4 quarters of a beat. */
export const SUBDIVISIONS = [1, 2, 3, 4] as const;
export type Subdivision = (typeof SUBDIVISIONS)[number];

/**
 * Every click due before `until`, and where to carry on from. One click at a
 * time, each a beat (or a part of one) after the last at the tempo of that
 * moment, so changing the tempo mid-song carries on from the next click
 * instead of jumping.
 */
export function due(state: BeatState, bpm: number, meter: number, until: number, subdivision = 1): { clicks: Click[]; state: BeatState } {
  const parts = Math.max(1, Math.min(4, Math.round(subdivision) || 1));
  const step = 60 / clampTempo(bpm) / parts;
  const clicks: Click[] = [];
  let { nextAt, nextBeat } = state;
  let nextSub = state.nextSub ?? 0;
  // Fewer parts chosen part-way through a beat: carry on from the next beat.
  if (nextSub >= parts) { nextSub = 0; nextBeat = (nextBeat + 1) % meter; }
  while (nextAt < until && clicks.length < 64) {
    clicks.push({ at: nextAt, beat: nextBeat % meter, sub: nextSub });
    nextAt += step;
    nextSub += 1;
    if (nextSub >= parts) { nextSub = 0; nextBeat = (nextBeat + 1) % meter; }
  }
  return { clicks, state: { nextAt, nextBeat, nextSub } };
}

/**
 * Which beat the hand is on at `now`, and how far towards the next (0 to 1),
 * from the clicks already handed over. Null before the first. Only the beats
 * count: the clicks between them do not move the hand.
 */
export function beatAt(clicks: Click[], bpm: number, now: number): { beat: number; phase: number } | null {
  let last: Click | undefined;
  for (const click of clicks) if (click.at <= now && !click.sub) last = click;
  if (!last) return null;
  const step = 60 / clampTempo(bpm);
  return { beat: last.beat, phase: Math.min(1, (now - last.at) / step) };
}

// ---- TAP TEMPO ------------------------------------------------------------
//
// A choir director taps the beat they want and the metronome takes it up. The
// last four gaps are averaged, so one rushed tap does not throw it; a pause of
// two seconds starts a new count, so yesterday's taps do not either.

const TAP_FORGET_MS = 2000;
const TAP_KEEP = 4;

/** The taps to keep after one more, and the tempo they give (null until two). */
export function tap(taps: number[], at: number): { taps: number[]; bpm: number | null } {
  const recent = taps.length && at - taps[taps.length - 1] > TAP_FORGET_MS ? [] : taps;
  const kept = [...recent, at].slice(-(TAP_KEEP + 1));
  if (kept.length < 2) return { taps: kept, bpm: null };
  const gaps = kept.slice(1).map((t, i) => t - kept[i]);
  const mean = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
  return { taps: kept, bpm: clampTempo(60000 / mean) };
}

// ---- THE BATON ------------------------------------------------------------
//
// Where a conductor's hand is on each beat of each pattern, on a 100 by 100
// square, the way the diagrams in a choir handbook draw them: the first beat
// always comes down to the bottom, the last always rises to the top. Drawn as
// points, and the hand moves between them in an arc that dips to the beat, so
// the moment of the beat is the bottom of each bounce.

export const PATTERNS: Record<Meter, [number, number][]> = {
  2: [[50, 88], [50, 22]],
  3: [[50, 88], [84, 70], [50, 22]],
  4: [[50, 88], [16, 66], [84, 66], [50, 22]],
  6: [[50, 88], [32, 74], [16, 60], [84, 60], [68, 74], [50, 22]],
};

/** The hand's position at `phase` of the way from beat `beat` to the next. */
export function batonAt(meter: Meter, beat: number, phase: number): [number, number] {
  const points = PATTERNS[meter];
  const [x0, y0] = points[beat % points.length];
  const [x1, y1] = points[(beat + 1) % points.length];
  const p = Math.min(1, Math.max(0, phase));
  // Rise out of the beat and fall into the next one: a parabola that lifts
  // the hand by a fifth of the square at the middle of the way.
  const lift = 4 * p * (1 - p) * 20;
  return [x0 + (x1 - x0) * p, y0 + (y1 - y0) * p - lift];
}

// ---- ADVANCED: accents, the speed trainer, saved tempos -------------------
//
// Asked for on 5 October 2026, with the rest of the Music room's Advanced
// settings: "more dynamic but also simple ... for users to play and be more
// creative". Off by default; the Conductor is exactly as simple without them.

/** How a beat sounds: loud, ordinary, or not at all. Tapping a beat goes round these. */
export type Accent = 'loud' | 'normal' | 'silent';
export const ACCENT_CYCLE: readonly Accent[] = ['loud', 'normal', 'silent'];

/** The first beat loud and the rest ordinary: what every metronome does. */
export function defaultAccents(meter: Meter): Accent[] {
  return Array.from({ length: meter }, (_, i) => (i === 0 ? 'loud' : 'normal'));
}

export function nextAccent(accent: Accent): Accent {
  return ACCENT_CYCLE[(ACCENT_CYCLE.indexOf(accent) + 1) % ACCENT_CYCLE.length];
}

/** The speed trainer: faster by `step` every `every` bars, up to `target`. */
export interface Trainer {
  step: number;
  every: number;
  target: number;
}

export const TRAINER_DEFAULT: Trainer = { step: 2, every: 4, target: 120 };

/**
 * The tempo after `bars` whole bars of the speed trainer. It only ever gets
 * faster, and never past the target: a target slower than the start leaves
 * the start alone.
 */
export function trainerTempo(start: number, bars: number, trainer: Trainer): number {
  const from = clampTempo(start);
  const target = clampTempo(trainer.target);
  const every = Math.max(1, Math.round(trainer.every) || 1);
  const step = Math.max(1, Math.round(trainer.step) || 1);
  if (target <= from) return from;
  return Math.min(target, from + Math.floor(Math.max(0, bars) / every) * step);
}

/** A tempo kept on the phone for one tap later: "Hymn 100" at 88, in 3/4. */
export interface SavedTempo {
  name: string;
  bpm: number;
  meter: Meter;
}

export const SAVED_TEMPOS_MAX = 50;
const NAME_MAX = 60;

/** A name as somebody typed it, without control characters, trimmed to fit. */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw.replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

/**
 * Saved tempos as read back from the phone's storage, which anything on the
 * phone could have written: only well-formed entries, one per name (the
 * latest wins), at most SAVED_TEMPOS_MAX.
 */
export function cleanTempos(raw: unknown): SavedTempo[] {
  if (!Array.isArray(raw)) return [];
  const byName = new Map<string, SavedTempo>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { name, bpm, meter } = item as Record<string, unknown>;
    const clean = cleanName(name);
    if (!clean || typeof bpm !== 'number' || !METERS.includes(meter as Meter)) continue;
    byName.delete(clean);
    byName.set(clean, { name: clean, bpm: clampTempo(bpm), meter: meter as Meter });
  }
  return [...byName.values()].slice(-SAVED_TEMPOS_MAX);
}
