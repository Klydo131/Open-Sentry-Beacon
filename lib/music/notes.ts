// Notes, frequencies and cents: the arithmetic every tool in the Music room
// shares. Pure functions, no browser, so tests/the-music-room.mjs runs them.
//
// Equal temperament, the tuning a piano, a keyboard and every tuner app
// assume: each semitone is the twelfth root of two, and A above middle C is
// the reference, 440 Hz unless a choir tunes to something else (some baroque
// groups use 415, some orchestras 442).

/** The note names, sharps only: what a tuner shows and a choir reads aloud. */
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;

/** A4's MIDI number. MIDI counts semitones from C-1 = 0; middle C is 60. */
const A4_MIDI = 69;

/** The range a tuner will accept as a reference A. Beyond it is a typo, not a tuning. */
export const A4_MIN = 400;
export const A4_MAX = 480;
export const A4_DEFAULT = 440;

export function clampA4(hz: number): number {
  if (!Number.isFinite(hz)) return A4_DEFAULT;
  return Math.min(A4_MAX, Math.max(A4_MIN, Math.round(hz)));
}

/** The frequency of a MIDI note, at a given A4. */
export function midiToHz(midi: number, a4 = A4_DEFAULT): number {
  return a4 * 2 ** ((midi - A4_MIDI) / 12);
}

/** C4, F♯3: a MIDI note as a choir would say it. */
export function midiName(midi: number): string {
  const n = Math.round(midi);
  return `${NOTE_NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12) - 1}`;
}

export interface Reading {
  /** The nearest note, as a MIDI number. */
  midi: number;
  /** Its name without the octave: "A", "C♯". */
  name: string;
  octave: number;
  /** How far off the nearest note, -50 to +50. Flat is negative. */
  cents: number;
  /** The frequency heard. */
  hz: number;
}

/**
 * The nearest note to a frequency, and how far off it is. Null for anything
 * that is not a number a voice or an instrument makes.
 */
export function readFrequency(hz: number, a4 = A4_DEFAULT): Reading | null {
  if (!Number.isFinite(hz) || hz <= 0) return null;
  const exact = A4_MIDI + 12 * Math.log2(hz / a4);
  const midi = Math.round(exact);
  const cents = Math.round((exact - midi) * 100);
  return {
    midi,
    name: NOTE_NAMES[((midi % 12) + 12) % 12],
    octave: Math.floor(midi / 12) - 1,
    cents,
    hz,
  };
}

/**
 * Close enough to call in tune. Five cents is about what a trained ear can
 * tell apart on a held note; a tuner that demanded zero would never say yes.
 */
export const IN_TUNE_CENTS = 5;
