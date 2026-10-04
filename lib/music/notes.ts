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

// ---------------------------------------------------------------------------
// CONCERT PITCH, IN WORDS AND IN SOUND
//
// Asked for on 4 October 2026, with a picture of the Concert pitch card: "I
// just put the Hertz and nothing much is happening, can you develop that
// where users can really feel it?" Changing A moved only the tuner's
// reference, which nobody can see until they sing. So the card now says what
// the change does, plays it, compares it with 440, and can take its A from
// the instrument in the room. The arithmetic for all of that is here.
// ---------------------------------------------------------------------------

/** How far apart two frequencies are, in cents: 100 to a semitone, 1200 to an octave. */
export function centsBetween(hz: number, from: number): number {
  return 1200 * Math.log2(hz / from);
}

/** The concert pitches choirs actually meet, each with what it is for. */
export const CONCERT_PITCHES = [
  { hz: 415, name: 'Baroque', about: 'Early music, about a semitone lower' },
  { hz: 432, name: 'Some choirs', about: 'A little lower; some choirs prefer it' },
  { hz: 440, name: 'Standard', about: 'Most choirs, pianos and recordings' },
  { hz: 442, name: 'Orchestra', about: 'Many orchestras; a touch brighter' },
] as const;

/** What a concert pitch does to every note, in a sentence a singer can use. */
export function pitchWords(a4: number): string {
  const hz = clampA4(a4);
  if (hz === A4_DEFAULT) return 'The standard most choirs, pianos and recordings use.';
  const up = hz > A4_DEFAULT;
  const cents = Math.round(Math.abs(centsBetween(hz, A4_DEFAULT)));
  const how = cents >= 85 && cents <= 115 ? 'about a semitone' : `about ${cents} cents`;
  return `${Math.abs(hz - A4_DEFAULT)} Hz ${up ? 'above' : 'below'} the standard 440: every note sounds ${how} ${up ? 'higher' : 'lower'}.`;
}

/**
 * A frequency moved by octaves into the range a reference A may take, or null
 * when no octave of it lands there. An organ's A2, A3, A4 or A5 all fold to
 * the same A; a C or an E folds nowhere, which is how "that was not an A" is
 * told without naming notes against a reference that may itself be wrong.
 */
export function foldToA4(hz: number): number | null {
  if (!Number.isFinite(hz) || hz <= 0) return null;
  let f = hz;
  while (f > A4_MAX) f /= 2;
  while (f < A4_MIN) f *= 2;
  return f >= A4_MIN && f <= A4_MAX ? f : null;
}

/** Readings a held A must give before it is believed: about two-thirds of a second. */
export const STEADY_READINGS = 12;
/** And how close together they must be. A held organ note is far steadier than this. */
export const STEADY_CENTS = 10;

/**
 * The A an instrument is holding, from the tuner's latest readings: their
 * middle value, to a tenth of a hertz, once the last STEADY_READINGS all fold
 * to an A and lie within STEADY_CENTS of each other. Null until then.
 */
export function heardA(readings: number[]): number | null {
  if (readings.length < STEADY_READINGS) return null;
  const folded = readings.slice(-STEADY_READINGS).map(foldToA4);
  if (folded.some((f) => f === null)) return null;
  const sorted = (folded as number[]).sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)];
  if (centsBetween(sorted[sorted.length - 1], sorted[0]) > STEADY_CENTS) return null;
  return Math.round(middle * 10) / 10;
}
