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
// And on 14 October 2026, for singing practice ("MAKE SURE the tuner for voice
// is extremely accurate with 1 to 1 on voice to notes"), two things made-up
// voices showed it getting wrong (tests/e2e/_made-up-voice.js makes them):
//
//   - IT HEARS THE NOTE, NOT A LOUD OVERTONE. On "ee" at the top of a tenor's,
//     alto's or soprano's range one harmonic can sit on a resonance of the
//     mouth and be thirty times louder than the note itself. The McLeod method
//     takes the first repeat at least nine-tenths as good as the best, and the
//     harmonic's repeat is that good. Now a clearly better repeat that falls
//     between the harmonic's own (where only the note's can fall) wins.
//     (Before, such a note was read as silence, or, below 1600 Hz, as the
//     wrong note.) And the delays it looks at stop at half the window, as the
//     paper says, so a bass's low note is no longer lost to a chance repeat
//     near the end of it (see Ear, below).
//   - A WIDE VIBRATO IS ONE NOTE. An opera singer's vibrato swings 60 cents or
//     more either side, past the line between two notes, five or six times a
//     second. The letter flipped to the neighbour at every swing. A move of
//     less than a semitone and a half now has to move the average of the last
//     130 ms (most of one swing) as well; a bigger leap still shows at once.
//
// Pure: no microphone, no clock of its own. The tuner feeds it windows and the
// time; the tests feed it made-up voices.

import { Autocorrelator } from 'pitchy';

/** The two windows. The short one answers sooner; the long one hears low notes. */
export const SHORT_WINDOW = 2048;
export const LONG_WINDOW = 4096;
/** Above this, the short window has enough cycles of the note in it. */
export const SHORT_ENOUGH_HZ = 190;
/** Clarity, 0 to 1: how alike the sound is to itself one period on. 1 is a perfect repeat. */
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
 * A slip that keeps happening is not a slip. When this many readings in a row
 * agree on a note an octave from the one shown, it is the note shown that was
 * wrong (the first reading of a note, in the scrape of its start, can land an
 * octave out) and the tuner moves to them. Before 14 October 2026 it never
 * did: every right reading after a wrong first one was thrown away as a slip,
 * and the wrong octave stayed for the whole note.
 */
const SLIPS_TO_MOVE = 6;
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
/**
 * A vibrato's swing, averaged out: most of one wobble at five or six a
 * second, so the average of this long stays within a semitone's half of the
 * note it circles. A move smaller than BIG_STEP_CENTS must move this average
 * too. (180 ms was tried first; on real singing it held a semitone step back
 * longer than it had to, and 130 does the same job on a vibrato.)
 */
export const VIBRATO_MS = 130;
export const BIG_STEP_CENTS = 150;
/** Readings the average needs before it can say a note has moved. */
const ENOUGH_READINGS = 5;
/**
 * Which repeat is the note. McLeod's rule: the first (the shortest delay) at
 * least KEY as alike as the best.
 *
 * Then one correction. A later repeat that is NOT a whole number of the first
 * one's periods away, and is clearly better (by NEAR_MIN, or by NEAR_SHARE of
 * what it leaves unexplained, whichever is more), means the first was a loud
 * overtone: a note's own repeats fall only on whole numbers of its period, an
 * overtone's fall in between. A repeat a whole number of periods on is never
 * taken over the first, however good it looks: far along the window there is
 * less of the sound to compare, and a chance match there is how a rough voice
 * was read an octave and a fifth low.
 */
const KEY = 0.9;
const NEAR_SHARE = 0.4;
const NEAR_MIN = 0.02;
/** How far from a whole number of periods a repeat must be to be an overtone's. */
const IN_BETWEEN = 0.12;

const cents = (hz: number, from: number) => 1200 * Math.log2(hz / from);

export interface Heard {
  /** The pitch to show, smoothed within the note. */
  hz: number;
  /** True while the sound has stopped and the last note is being held. */
  held: boolean;
  /**
   * This window's own reading, before any smoothing, or null when it had none
   * (while held). What a judge of a sung note averages: the voice itself.
   */
  raw: number | null;
}

/**
 * One window's ear. McLeod's curve of how alike the sound is to itself after
 * every delay, worked out from pitchy's autocorrelation (an FFT, so every
 * delay at once), and the note read from it.
 *
 * Why not pitchy's own reading: it looks at every delay up to the whole
 * window. Past half the window too little of the sound overlaps itself to
 * judge, and there a bass's note can look like a perfect repeat by chance,
 * six periods on; pitchy then reads a note far too low, and the tuner had to
 * throw the reading away. The paper keeps to the first half, and so does this.
 */
class Ear {
  private readonly auto: Autocorrelator<Float64Array>;
  private readonly curve: Float64Array;
  /** The delays a note can have, in samples: from the highest to the lowest, with a semitone of room. */
  private readonly shortest: number;
  private readonly longest: number;

  constructor(private readonly size: number, private readonly rate: number) {
    this.auto = Autocorrelator.forFloat64Array(size);
    this.curve = new Float64Array(size);
    this.shortest = Math.max(2, Math.floor(rate / HIGHEST_HZ / 1.06));
    this.longest = Math.min(size >> 1, Math.ceil((rate / LOWEST_HZ) * 1.06));
  }

  /** The pitch in a window of `size` samples, and how clear it is; [0, 0] for none. */
  hear(x: Float32Array): [hz: number, clarity: number] {
    const c = this.curve;
    const n = this.size;
    this.auto.autocorrelate(x, c);
    // Normalised by the sound's own strength at each delay (the paper's m'),
    // so a repeat reads 1 however loud it is.
    let m = 2 * c[0];
    if (!(m > 0)) return [0, 0];
    for (let i = 0; i <= this.longest + 1; i++) {
      c[i] = m > 0 ? (2 * c[i]) / m : 0;
      m -= x[i] * x[i] + x[n - 1 - i] * x[n - 1 - i];
    }
    // The key maxima: the highest point between each rise through zero and the
    // next fall through it.
    const peaks: number[] = [];
    let looking = false;
    let at = -1;
    for (let i = 1; i <= this.longest; i++) {
      if (c[i - 1] <= 0 && c[i] > 0) { looking = true; at = i; }
      else if (c[i - 1] > 0 && c[i] <= 0) { if (looking && at >= this.shortest) peaks.push(at); looking = false; }
      else if (looking && c[i] > c[at]) at = i;
    }
    if (looking && at >= this.shortest && at < this.longest) peaks.push(at);
    if (!peaks.length) return [0, 0];
    let top = 0;
    for (const p of peaks) top = Math.max(top, c[p]);
    let lag = peaks.find((p) => c[p] >= KEY * top) as number;
    for (const q of peaks) {
      if (q <= lag) continue;
      const times = q / lag;
      if (Math.abs(times - Math.round(times)) > IN_BETWEEN && c[q] - c[lag] >= Math.max(NEAR_MIN, NEAR_SHARE * (1 - c[q]))) lag = q;
    }
    // Between two samples, by a parabola through the peak and its neighbours.
    const y0 = c[lag - 1], y1 = c[lag], y2 = c[lag + 1];
    const bend = y0 - 2 * y1 + y2;
    const shift = bend < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / bend)) : 0;
    return [this.rate / (lag + shift), Math.min(1, y1 - 0.25 * (y0 - y2) * shift)];
  }
}

export class PitchTracker {
  private readonly short: Ear;
  private readonly long: Ear;
  private shown: number | null = null;
  private pending: number | null = null;
  private lastAt = -Infinity;
  /** Readings in a row an octave from the note shown, and where they agree. */
  private slips = 0;
  private slipHz: number | null = null;
  /** The last VIBRATO_MS of readings, in cents from A4, for the average. */
  private recent: { at: number; cents: number }[] = [];

  constructor(sampleRate: number) {
    this.short = new Ear(SHORT_WINDOW, sampleRate);
    this.long = new Ear(LONG_WINDOW, sampleRate);
  }

  /** Forget everything: a new start. */
  reset(): void {
    this.shown = null;
    this.pending = null;
    this.lastAt = -Infinity;
    this.recent = [];
    this.slips = 0;
    this.slipHz = null;
  }

  /**
   * One raw reading from a window of LONG_WINDOW samples (the newest last), or
   * null if there is no clear single pitch in it. Exported for the tests.
   */
  measure(samples: Float32Array): [hz: number, clarity: number] | null {
    const [quick, quickClarity] = this.short.hear(samples.subarray(samples.length - SHORT_WINDOW));
    if (quickClarity >= CLARITY_SHORT && quick >= SHORT_ENOUGH_HZ && quick <= HIGHEST_HZ) return [quick, quickClarity];
    const [slow, slowClarity] = this.long.hear(samples.subarray(samples.length - LONG_WINDOW));
    if (slowClarity >= CLARITY_LONG && slow >= LOWEST_HZ && slow <= HIGHEST_HZ) return [slow, slowClarity];
    // A low note under a vibrato bends further across the long window than
    // across the short one: when the long one cannot say, a clear short one may.
    if (quickClarity >= CLARITY_SHORT && quick >= LOWEST_HZ && quick <= HIGHEST_HZ) return [quick, quickClarity];
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
        this.remember(hz, now);
      } else {
        this.pending = hz;
        return null;
      }
      return { hz: this.shown, held: false, raw: hz };
    }

    const off = cents(hz, this.shown);
    // An octave from the note shown, with nothing yet to say the note has
    // really moved: one frame of the method landing on a harmonic.
    const slip = Math.abs(off) > NEW_NOTE_CENTS && Math.abs(Math.abs(off) - 1200) <= OCTAVE_SLIP_CENTS;
    if (slip) {
      if (this.slipHz !== null && Math.abs(cents(hz, this.slipHz)) <= AGREE_CENTS) this.slips++;
      else { this.slipHz = hz; this.slips = 1; }
      if (this.slips >= SLIPS_TO_MOVE) {
        // Not a slip: the note shown was an octave out. Move, and start afresh.
        this.shown = hz;
        this.pending = null;
        this.slips = 0;
        this.slipHz = null;
        this.recent = [];
        this.remember(hz, now);
        return { hz, held: false, raw: hz };
      }
    } else {
      this.slips = 0;
      this.slipHz = null;
      this.remember(hz, now);
    }
    if (Math.abs(off) > NEW_NOTE_CENTS) {
      if (this.pending !== null && Math.abs(cents(hz, this.pending)) <= AGREE_CENTS && this.moved(off)) {
        // Two readings agree on a new note, and it is not a vibrato's swing:
        // go straight there.
        this.shown = hz;
        this.pending = null;
      } else if (slip) {
        this.pending = null;
      } else {
        // A swing past the line, or the first sign of a new note. It is
        // smoothed in like any other reading: leaving the far swings out made
        // the needle sit off the middle of a wide vibrato, and stay there.
        this.pending = hz;
        this.shown = this.shown * 2 ** ((SMOOTHING * off) / 1200);
      }
      return { hz: this.shown, held: false, raw: slip ? null : hz };
    }

    // The same note: smoothed, in cents, so a wobble does not shake the needle.
    this.pending = null;
    this.shown = this.shown * 2 ** ((SMOOTHING * off) / 1200);
    return { hz: this.shown, held: false, raw: hz };
  }

  /** Keep a reading for the average, and forget those older than a swing. */
  private remember(hz: number, now: number): void {
    this.recent.push({ at: now, cents: cents(hz, 440) });
    while (this.recent.length && now - this.recent[0].at > VIBRATO_MS) this.recent.shift();
  }

  /**
   * Whether a reading `off` cents from the note shown is a new note rather
   * than a vibrato swinging past the line between two notes. A leap is; a
   * smaller move is when the average of the last swing has moved as well.
   */
  private moved(off: number): boolean {
    if (Math.abs(off) >= BIG_STEP_CENTS) return true;
    if (this.shown === null) return true;
    // Too few readings to see a whole swing (a low note under a wide vibrato
    // is read only at the top and bottom of each swing): an average of one
    // end of it would look like a new note, so the note shown stays.
    const r = this.recent;
    if (r.length < ENOUGH_READINGS || r[r.length - 1].at - r[0].at < VIBRATO_MS / 2) return false;
    const average = r.reduce((t, q) => t + q.cents, 0) / r.length;
    return Math.abs(average - cents(this.shown, 440)) > NEW_NOTE_CENTS;
  }

  private quiet(now: number): Heard | null {
    this.pending = null;
    this.slips = 0;
    this.slipHz = null;
    if (this.shown === null) return null;
    if (now - this.lastAt <= HOLD_MS) return { hz: this.shown, held: true, raw: null };
    this.shown = null;
    this.recent = [];
    return null;
  }
}
