// The Play folder's arithmetic: the keyboard's keys, the chords of a key, and
// the beat maker's grid. Pure functions, no browser, so tests/the-music-room.mjs
// runs them.
//
// Asked for on 5 October 2026: a place "for users to play and be more creative
// in music play", simple first and Advanced when wanted. Simple is a keyboard;
// Advanced adds chord buttons in any key and a beat maker.

import { clampTempo, cleanName } from '@/lib/music/beat';

// ---- THE KEYBOARD ---------------------------------------------------------

/** One octave and the C above, as a keyboard draws it: which are black keys. */
export const OCTAVE_KEYS = [
  { step: 0, black: false }, { step: 1, black: true }, { step: 2, black: false }, { step: 3, black: true },
  { step: 4, black: false }, { step: 5, black: false }, { step: 6, black: true }, { step: 7, black: false },
  { step: 8, black: true }, { step: 9, black: false }, { step: 10, black: true }, { step: 11, black: false },
  { step: 12, black: false },
] as const;

/** The keyboard's lowest C may move from C2 to C6: low enough for a bass, high enough for a descant. */
export const OCTAVE_MIN = 2;
export const OCTAVE_MAX = 6;
export const clampOctave = (n: number) => Math.min(OCTAVE_MAX, Math.max(OCTAVE_MIN, Math.round(n) || 4));
/** MIDI number of the C that starts octave `n` (C4, middle C, is 60). */
export const octaveC = (n: number) => 12 * (clampOctave(n) + 1);

// ---- CHORDS ---------------------------------------------------------------

const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/** The keys a church sings in most, each with its home note near middle C. */
export const SONG_KEYS = [
  { id: 'C', root: 60, flats: false },
  { id: 'G', root: 55, flats: false },
  { id: 'D', root: 62, flats: false },
  { id: 'A', root: 57, flats: false },
  { id: 'E', root: 64, flats: false },
  { id: 'F', root: 53, flats: true },
  { id: 'B♭', root: 58, flats: true },
  { id: 'E♭', root: 63, flats: true },
] as const;
export type SongKey = (typeof SONG_KEYS)[number]['id'];

export interface Chord {
  /** What a guitarist would call it: "G", "Am". */
  name: string;
  /** Where it sits in the key: I, ii, iii, IV, V, vi. */
  roman: string;
  /** Three notes, close together, near middle C. */
  midis: number[];
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const ROMANS = ['I', 'ii', 'iii', 'IV', 'V', 'vi'];

/**
 * The six chords most hymns and songs in a major key are built from: I, ii,
 * iii, IV, V and vi. Each is three notes of the scale stacked in thirds, kept
 * between G3 and G5 so every chord sits where a voice or a hand would play it.
 */
export function chordsInKey(key: SongKey): Chord[] {
  const found = SONG_KEYS.find((k) => k.id === key) ?? SONG_KEYS[0];
  const names = found.flats ? FLAT_NAMES : SHARP_NAMES;
  return ROMANS.map((roman, degree) => {
    const tones = [0, 2, 4].map((third) => {
      const d = degree + third;
      return found.root + MAJOR_SCALE[d % 7] + 12 * Math.floor(d / 7);
    });
    // Down an octave together if the chord climbs too high.
    const shift = tones[2] > 79 ? -12 : 0;
    const midis = tones.map((m) => m + shift);
    const minor = roman === roman.toLowerCase();
    return { name: `${names[((midis[0] % 12) + 12) % 12]}${minor ? 'm' : ''}`, roman, midis };
  });
}

// ---- THE BEAT MAKER -------------------------------------------------------

export const DRUMS = ['kick', 'snare', 'hat'] as const;
export type Drum = (typeof DRUMS)[number];
export const DRUM_NAME: Record<Drum, string> = { kick: 'Bass drum', snare: 'Snare', hat: 'Hi-hat' };

/** Sixteen steps: a bar of four beats, four steps to a beat. */
export const STEPS = 16;
export const BEAT_TEMPO_MIN = 40;
export const BEAT_TEMPO_MAX = 200;
export const clampBeatTempo = (bpm: number) => Math.min(BEAT_TEMPO_MAX, Math.max(BEAT_TEMPO_MIN, clampTempo(bpm)));

export interface Pattern {
  name: string;
  bpm: number;
  steps: Record<Drum, boolean[]>;
}

const row = (on: number[]) => Array.from({ length: STEPS }, (_, i) => on.includes(i));

/** Patterns to start from, so the grid is never a blank page. */
export const STARTER_PATTERNS: Pattern[] = [
  { name: 'Steady four', bpm: 90, steps: { kick: row([0, 4, 8, 12]), snare: row([]), hat: row([0, 2, 4, 6, 8, 10, 12, 14]) } },
  { name: 'Rock', bpm: 100, steps: { kick: row([0, 8, 10]), snare: row([4, 12]), hat: row([0, 2, 4, 6, 8, 10, 12, 14]) } },
  { name: 'Ballad', bpm: 70, steps: { kick: row([0, 10]), snare: row([8]), hat: row([0, 4, 8, 12]) } },
  { name: 'Praise', bpm: 118, steps: { kick: row([0, 6, 8, 14]), snare: row([4, 12]), hat: row([0, 2, 3, 4, 6, 8, 10, 11, 12, 14]) } },
];

export function emptyPattern(): Pattern {
  return { name: '', bpm: 90, steps: { kick: row([]), snare: row([]), hat: row([]) } };
}

export const SAVED_PATTERNS_MAX = 20;

/**
 * Patterns read back from the phone's storage: only well-formed ones, sixteen
 * steps a drum, one per name, at most SAVED_PATTERNS_MAX.
 */
export function cleanPatterns(raw: unknown): Pattern[] {
  if (!Array.isArray(raw)) return [];
  const byName = new Map<string, Pattern>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { name, bpm, steps } = item as Record<string, unknown>;
    const clean = cleanName(name);
    if (!clean || typeof bpm !== 'number' || !steps || typeof steps !== 'object') continue;
    const grid = steps as Record<string, unknown>;
    if (!DRUMS.every((d) => Array.isArray(grid[d]) && (grid[d] as unknown[]).length === STEPS)) continue;
    const kept = Object.fromEntries(DRUMS.map((d) => [d, (grid[d] as unknown[]).map((v) => v === true)])) as Record<Drum, boolean[]>;
    byName.delete(clean);
    byName.set(clean, { name: clean, bpm: clampBeatTempo(bpm), steps: kept });
  }
  return [...byName.values()].slice(-SAVED_PATTERNS_MAX);
}

export interface StepState {
  nextAt: number;
  nextStep: number;
}

/**
 * Every step due before `until` on the audio clock, and where to carry on
 * from: a sixteenth of a bar each, at the tempo of that moment. The same
 * hand-over the metronome uses (lib/music/beat.ts, `due`).
 */
export function stepsDue(state: StepState, bpm: number, until: number): { steps: { at: number; step: number }[]; state: StepState } {
  const each = 60 / clampBeatTempo(bpm) / 4;
  const steps: { at: number; step: number }[] = [];
  let { nextAt, nextStep } = state;
  while (nextAt < until && steps.length < 64) {
    steps.push({ at: nextAt, step: nextStep % STEPS });
    nextAt += each;
    nextStep = (nextStep + 1) % STEPS;
  }
  return { steps, state: { nextAt, nextStep } };
}
