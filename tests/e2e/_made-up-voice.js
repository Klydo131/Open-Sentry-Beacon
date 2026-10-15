// Made-up singing, for the checks that hold the tuner to one promise: the note
// a person sings is the note it hears.
//
// WHY MADE UP. A test cannot carry a choir, and a recording of one person
// proves one voice. This builds a voice the way a voice is built (a source and
// a filter): a buzz from the vocal folds, rich in harmonics, shaped by the
// mouth into a vowel. Then it adds what makes real singing hard to measure:
//
//   - VOWELS. Each shapes the harmonics differently. "ee" and "oo" put their
//     first resonance at 250 to 400 Hz, which on a low voice lifts the 2nd to
//     4th harmonic above the note itself: the classic way a tuner reads a bass
//     an octave up.
//   - A SCOOP into the note, and a VIBRATO once it is held.
//   - JITTER and SHIMMER: no two cycles of a real voice are the same length or
//     the same loudness.
//   - BREATH, and the noise of a room.
//   - A PHONE'S MICROPHONE, which hears little below 150 Hz, so a bass's own
//     note arrives weaker than its overtones.
//   - OPTIONALLY, A ROOM'S ECHO, which smears one note into the next.
//
// And one thing singers do that a speech model does not: when a note climbs
// above a vowel's first resonance, a trained voice raises that resonance to
// sit on the note (sopranos do it on every vowel above about C5: Joliveau,
// Smith and Wolfe, "Vocal tract resonances in singing: the soprano voice",
// Nature 427, 2004). `tune: false` turns it off, for the hardest case there is:
// a closed "ee" at the top of a soprano's range with the note itself weak.
//
// It is not a person, and nothing here claims it is. It is the hardest honest
// version of a voice that can be made without one. Every sound is made the same
// way every time (the noise comes from a seeded generator), so a result can be
// repeated.
//
// Used by tests/the-music-room.mjs (in Node) and by
// tests/e2e/a-sung-note-is-heard-as-itself.js (as the browser's microphone).

'use strict';

/**
 * The first three resonances of each vowel, [Hz, bandwidth], for a man's and a
 * woman's voice: averages from the vowel studies every speech text quotes
 * (Peterson and Barney 1952; Hillenbrand and others 1995).
 */
const VOWELS = {
  ah: { m: [[730, 90], [1090, 110], [2440, 160]], f: [[850, 90], [1220, 110], [2810, 160]] },
  eh: { m: [[530, 70], [1840, 100], [2480, 160]], f: [[610, 70], [2330, 100], [2990, 160]] },
  ee: { m: [[270, 60], [2290, 100], [3010, 160]], f: [[310, 60], [2790, 100], [3310, 160]] },
  oh: { m: [[570, 70], [840, 90], [2410, 160]], f: [[590, 70], [920, 90], [2710, 160]] },
  oo: { m: [[300, 60], [870, 90], [2240, 160]], f: [[370, 60], [950, 90], [2670, 160]] },
};

/** A choir's five voices: the notes each can sing (MIDI), and whose vowels. */
const VOICES = {
  bass: { low: 40, high: 62, sex: 'm' }, //     E2 to D4
  baritone: { low: 43, high: 66, sex: 'm' }, // G2 to F♯4
  tenor: { low: 48, high: 71, sex: 'm' }, //    C3 to B4
  alto: { low: 53, high: 77, sex: 'f' }, //     F3 to F5
  soprano: { low: 60, high: 84, sex: 'f' }, //  C4 to C6
};

const hzOf = (midi, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);

/** A repeatable source of noise: the same seed, the same sound. */
function seeded(seed) {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
  const gauss = () => {
    let t = 0;
    for (let i = 0; i < 6; i += 1) t += rand();
    return (t - 3) / Math.sqrt(0.5);
  };
  return { rand, gauss };
}

/** How loud a cascade of resonances leaves a harmonic at `f` Hz (1 at the bottom). */
function shape(f, formants) {
  let g = 1;
  for (const [F, B] of formants) {
    const w = f / F;
    const q = F / B;
    g *= 1 / Math.sqrt((1 - w * w) ** 2 + (w / q) ** 2);
  }
  return g;
}

/** A two-pole high-pass at `fc`: the phone's microphone. */
function highPass(x, fc, rate) {
  const w = (2 * Math.PI * fc) / rate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / Math.SQRT2;
  const a0 = 1 + alpha;
  const b0 = (1 + cos) / 2 / a0, b1 = -(1 + cos) / a0, b2 = b0;
  const a1 = (-2 * cos) / a0, a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i += 1) {
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    x[i] = y;
  }
}

/** A small room: four echoes that fade, mixed in under the voice. */
function room(x, rate, mix) {
  const out = Float32Array.from(x);
  for (const [ms, fade] of [[29.7, 0.77], [37.1, 0.74], [41.1, 0.71], [43.7, 0.69]]) {
    const d = Math.round((ms / 1000) * rate);
    const line = new Float32Array(x.length);
    for (let i = 0; i < x.length; i += 1) line[i] = x[i] + (i >= d ? fade * line[i - d] : 0);
    for (let i = 0; i < x.length; i += 1) out[i] += (mix / 4) * (line[i] - x[i]);
  }
  return out;
}

/**
 * Sing. `notes` is a list of [seconds, MIDI note or null for a breath]. The
 * note may carry a fraction: 60.3 is C4 sung 30 cents sharp.
 *
 * Options, each a thing that makes a voice harder to measure:
 *   vowel     'ah' | 'eh' | 'ee' | 'oh' | 'oo'
 *   sex       'm' | 'f' (whose vowel resonances)
 *   vibrato   cents either side, after the first quarter second (0 for none)
 *   rate      vibrato wobbles a second
 *   scoop     cents below the note the voice starts, sliding up into it
 *   jitter    how much each cycle's length varies (0.006 is 0.6 per cent)
 *   shimmer   how much each cycle's loudness varies
 *   breath    breath noise, against the voice
 *   noise     the room's own noise
 *   mic       the microphone's low cut-off in Hz (0 for none)
 *   echo      how much of a room's echo to mix in (0 for none)
 *   a4        the concert pitch the notes are sung at
 *   tune      raise the first resonance onto a high note, as singers do (on)
 *   seed      which made-up voice: the same seed is the same sound
 */
function sing(notes, opts = {}) {
  const {
    rate = 48000, vowel = 'ah', sex = 'm', vibrato = 35, vibratoRate = 5.8, scoop = 60,
    jitter = 0.006, shimmer = 0.04, breath = 0.03, noise = 0.002, mic = 150, echo = 0, a4 = 440, seed = 1,
    tune = true,
  } = opts;
  const { rand, gauss } = seeded(seed);
  const vowelFormants = [...VOWELS[vowel][sex], [3500, 250]];
  const total = Math.round(notes.reduce((t, [s]) => t + s, 0) * rate);
  const x = new Float32Array(total);
  const H = 48;
  const amps = new Float64Array(H + 1);
  let phase = 0;
  let cycleScale = 1;
  let cycleLoud = 1;
  let i = 0;
  const vibPhase = rand() * 2 * Math.PI;
  for (const [seconds, midi] of notes) {
    const n = Math.round(seconds * rate);
    if (midi === null || midi === undefined) {
      for (let k = 0; k < n; k += 1, i += 1) x[i] = 0;
      continue;
    }
    const base = hzOf(midi, a4);
    // The first resonance raised onto a note that has climbed above it.
    const formants = vowelFormants.map((f, j) => (tune && j === 0 && base * 1.05 > f[0] ? [base * 1.05, f[1] * 1.5] : f));
    let harmonics = 0;
    for (let k = 0; k < n; k += 1, i += 1) {
      const t = k / rate;
      // Into the note from below, then the vibrato, growing in after a moment.
      let cents = -scoop * Math.exp(-t / 0.035);
      const grow = Math.min(1, Math.max(0, (t - 0.25) / 0.2));
      cents += vibrato * grow * Math.sin(2 * Math.PI * vibratoRate * t + vibPhase);
      const f0 = base * 2 ** (cents / 1200) * cycleScale;
      if (k % 64 === 0) {
        // The harmonics that fit below 5 kHz and below half the sample rate,
        // each as loud as the vocal folds make it (falling by 1/h) and the
        // vowel leaves it.
        harmonics = Math.min(H, Math.floor(Math.min(5000, rate * 0.45) / f0));
        for (let h = 1; h <= harmonics; h += 1) amps[h] = shape(h * f0, formants) / h;
      }
      const before = phase;
      phase += (2 * Math.PI * f0) / rate;
      if (phase >= 2 * Math.PI) {
        // A new cycle of the vocal folds: a slightly different length and loudness.
        phase -= 2 * Math.PI;
        cycleScale = 1 + jitter * gauss();
        cycleLoud = 1 + shimmer * gauss();
      }
      // sin(h·φ) for every h from one sine and one cosine (Chebyshev's recurrence).
      const s1 = Math.sin(phase), c2 = 2 * Math.cos(phase);
      let prev = 0, cur = s1, v = 0;
      for (let h = 1; h <= harmonics; h += 1) {
        v += amps[h] * cur;
        const next = c2 * cur - prev;
        prev = cur;
        cur = next;
      }
      // Breath comes in puffs, with each opening of the folds.
      const puff = 0.5 + 0.5 * Math.cos(before);
      const attack = Math.min(1, t / 0.04) * Math.min(1, (n - k) / rate / 0.06);
      x[i] = attack * (cycleLoud * v + breath * puff * gauss() * 4);
    }
  }
  if (mic) highPass(x, mic, rate);
  let y = echo ? room(x, rate, echo) : x;
  let peak = 0;
  for (let j = 0; j < y.length; j += 1) peak = Math.max(peak, Math.abs(y[j]));
  const scale = peak ? 0.5 / peak : 1;
  for (let j = 0; j < y.length; j += 1) y[j] = y[j] * scale + noise * gauss();
  return y;
}

/** Samples from -1 to 1 as a 16-bit mono WAV file. */
function wav(samples, rate = 48000) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return buf;
}

module.exports = { VOWELS, VOICES, sing, wav, hzOf };
