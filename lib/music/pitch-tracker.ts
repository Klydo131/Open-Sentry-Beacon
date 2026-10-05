// From a stream of microphone windows to one steady, quick pitch: the part of
// the tuner between "pitchy found a frequency in these samples" and "this is
// the note to show".
//
// Reworked on 6 October 2026, when the owner reported: "detecting its notes is
// not accurate and fast enough which most users dont like it. It should be
// fast and perfectly accurate like a real perfect pitch tuner." The first
// tuner took the median of its last five readings, 30 ms apart, so a new note
// showed only once three of them agreed; it always listened over 85 ms, which
// only a bass's low notes need; and it threw away readings a breathy voice
// makes. This one, measured by tests/the-music-room.mjs on the same sounds:
//
//   - LISTENS OVER THE SHORTEST WINDOW THAT IS ENOUGH. A note above about
//     190 Hz (a tenor's G and up) is read from the newest 2048 samples; a
//     lower one, or a doubtful one, from 4096. A window needs a few cycles of
//     the note in it, and a low note's cycles are longer.
//   - JUMPS TO A NEW NOTE AT ONCE, ONCE TWO READINGS AGREE. A reading more
//     than half a semitone from the one shown is held back for one frame; if
//     the next agrees, the display moves straight to it. One stray reading
//     never moves it.
//   - IGNORES OCTAVE SLIPS. The McLeod method can, on a single frame, land an
//     octave off; a reading an octave from two that agree is dropped.
//   - SMOOTHS ONLY WITHIN A NOTE, in cents, so the needle is steady on a held
//     note without lagging behind a change of note.
//   - HOLDS THE LAST NOTE FOR A MOMENT after the sound stops, so it can be
//     read, then clears.
//
// Pure: no microphone, no clock of its own. The tuner feeds it windows and the
// time; the tests feed it made-up voices.

import { PitchDetector } from 'pitchy';

/** The two windows. The short one answers sooner; the long one hears low notes. */
export const SHORT_WINDOW = 2048;
export const LONG_WINDOW = 4096;
/** Above this, the short window has enough cycles of the note in it. */
export const SHORT_ENOUGH_HZ = 190;
/** pitchy's clarity, 0 to 1: how sure it is there is one pitch in the sound. */
export const CLARITY_SHORT = 0.9;
export const CLARITY_LONG = 0.82;
/** The range a choir and its instruments live in. */
export const LOWEST_HZ = 55;
export const HIGHEST_HZ = 1600;
/** A reading further than this from the one shown is a new note, not a wobble. */
export const NEW_NOTE_CENTS = 50;
/** Two readings this close are the same note. */
export const AGREE_CENTS = 35;
/** An octave slip: this close to 1200 cents from the note shown. */
const OCTAVE_SLIP_CENTS = 80;
/**
 * How much of each new reading goes into the shown pitch, within a note: about
 * an eighth of a second of memory at sixty frames a second, which averages a
 * singer's vibrato (five or six wobbles a second) into the note they mean.
 */
export const SMOOTHING = 0.12;
/** A reading this clear starts a note at once, without waiting for a second. */
export const CLARITY_AT_ONCE = 0.93;
/** After the sound stops, the last note stays this long. */
export const HOLD_MS = 450;

const cents = (hz: number, from: number) => 1200 * Math.log2(hz / from);

export interface Heard {
  /** The pitch to show, smoothed within the note. */
  hz: number;
  /** True while the sound has stopped and the last note is being held. */
  held: boolean;
}

export class PitchTracker {
  private readonly short = PitchDetector.forFloat32Array(SHORT_WINDOW);
  private readonly long = PitchDetector.forFloat32Array(LONG_WINDOW);
  private shown: number | null = null;
  private pending: number | null = null;
  private lastAt = -Infinity;

  constructor(private readonly sampleRate: number) {}

  /** Forget everything: a new start. */
  reset(): void {
    this.shown = null;
    this.pending = null;
    this.lastAt = -Infinity;
  }

  /**
   * One raw reading from a window of LONG_WINDOW samples (the newest last), or
   * null if there is no clear single pitch in it. Exported for the tests.
   */
  measure(samples: Float32Array): [hz: number, clarity: number] | null {
    const newest = samples.subarray(samples.length - SHORT_WINDOW);
    const [quick, quickClarity] = this.short.findPitch(newest, this.sampleRate);
    if (quickClarity >= CLARITY_SHORT && quick >= SHORT_ENOUGH_HZ && quick <= HIGHEST_HZ) return [quick, quickClarity];
    const [slow, slowClarity] = this.long.findPitch(samples.subarray(samples.length - LONG_WINDOW), this.sampleRate);
    if (slowClarity >= CLARITY_LONG && slow >= LOWEST_HZ && slow <= HIGHEST_HZ) return [slow, slowClarity];
    return null;
  }

  /** Feed one window, at `now` milliseconds. What to show, or null for nothing. */
  push(samples: Float32Array, now: number): Heard | null {
    const heard = this.measure(samples);
    if (heard === null) return this.quiet(now);
    const [hz, clarity] = heard;
    this.lastAt = now;

    if (this.shown === null) {
      // The first sound after silence: shown at once if it is very clear, or
      // if the reading before it agreed.
      if (clarity >= CLARITY_AT_ONCE || (this.pending !== null && Math.abs(cents(hz, this.pending)) <= AGREE_CENTS)) {
        this.shown = hz;
        this.pending = null;
      } else {
        this.pending = hz;
        return null;
      }
      return { hz: this.shown, held: false };
    }

    const off = cents(hz, this.shown);
    if (Math.abs(off) > NEW_NOTE_CENTS) {
      // An octave from the note shown, with nothing yet to say the note has
      // really moved: one frame of the method landing on a harmonic.
      const slip = Math.abs(Math.abs(off) - 1200) <= OCTAVE_SLIP_CENTS;
      if (this.pending !== null && Math.abs(cents(hz, this.pending)) <= AGREE_CENTS) {
        // Two readings agree on a new note: go straight there.
        this.shown = hz;
        this.pending = null;
      } else {
        this.pending = slip ? null : hz;
      }
      return { hz: this.shown, held: false };
    }

    // The same note: smoothed, in cents, so a wobble does not shake the needle.
    this.pending = null;
    this.shown = this.shown * 2 ** ((SMOOTHING * off) / 1200);
    return { hz: this.shown, held: false };
  }

  private quiet(now: number): Heard | null {
    this.pending = null;
    if (this.shown === null) return null;
    if (now - this.lastAt <= HOLD_MS) return { hz: this.shown, held: true };
    this.shown = null;
    return null;
  }
}
