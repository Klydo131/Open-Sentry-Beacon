'use client';

// Ambient sound, generated rather than downloaded.
//
// WHY NOT AUDIO FILES. An hour of white noise is tens of megabytes. Serving it
// to a congregation would cost real egress every time somebody pressed play,
// on a project whose whole point is running for nothing, and it would not work
// on the bus. Generated noise is a few lines of arithmetic: no file, no
// bandwidth, no network, and it never ends because there is nothing to end.
//
// ---------------------------------------------------------------------------
// WHAT WAS WRONG WITH IT, reported by the people using it: (a bug report) Three things were true at once, and each one is fixed below.
//
//   1. ALL THREE OPTIONS WERE NOISE, and one of them was raw white noise --
//      flat all the way up, which is the harshest thing a speaker can make and
//      the sound most people mean when they say noise is unpleasant. It sat in
//      the same undifferentiated list as the gentle ones, so somebody looking
//      for something calming had a one-in-three chance of an ear full of hiss.
//
//   2. NOTHING MOVED. A buffer looped forever at one level is a wall. What the
//      ear finds restful about rain and surf is that they swell and fall; a
//      static hiss at a fixed volume is fatiguing within minutes, and no amount
//      of choosing the right colour fixes that.
//
//   3. THE APP KNEW WHAT EACH ONE SOUNDED LIKE AND NEVER SAID. Every entry has
//      carried a `blurb` since the day it was written and no screen has ever
//      drawn one. The information that would have let somebody avoid the harsh
//      one was sitting in this file, unused.
//
// THE COLOURS, and they are not decoration. White is flat and harsh and masks
// speech best. Pink falls 3dB per octave, which is roughly how rain and wind
// actually sound, and is what most people mean by "white noise". Brown falls
// 6dB and reads as distant surf.
// ---------------------------------------------------------------------------

export type NoiseColour = 'white' | 'pink' | 'brown';

/**
 * What a sound is FOR, which is the only division that matters to a listener.
 *
 * `calm` is chosen to sit with for an hour. `masking` is chosen to cover the
 * people talking in the next room, and is brighter and harder on purpose --
 * that brightness is the working part, not a defect. Putting them in one list
 * meant the second kind kept being picked by people who wanted the first.
 */
export type AmbienceKind = 'gentle' | 'calm' | 'masking';

/**
 * HOW a voice is made, which is not the same question as what it is for.
 *
 * `noise` fills a two-second buffer with arithmetic and loops it forever.
 * Everything here used to be that, and the result was fairly judged as white
 * noise in different flavours of static.
 * Filtering and swelling a hiss makes it a nicer hiss. It does not make it
 * music, and no amount of shaping will.
 *
 * `chime` and `pad` are not looped at all. They SCHEDULE notes -- a struck bell
 * with a long decay, or a held chord that drifts -- so nothing repeats, because
 * there is no loop to repeat. That is the whole difference between something
 * you stop hearing and something you keep noticing.
 */
export type VoiceEngine = 'noise' | 'chime' | 'pad';

export interface Voice {
  /** How it is made. Absent means the looped-noise engine, which most are. */
  engine?: VoiceEngine;
  /**
   * The notes a chime strikes or a pad holds, in Hz.
   *
   * A PENTATONIC SET, AND THAT IS THE WHOLE TRICK. Five notes with no semitone
   * steps between them: any two of them played together sound intentional, so
   * a chime that picks at random can never land on a sour interval. It is why
   * real wind chimes are tuned this way, and it is what lets this be random
   * without ever needing a composer.
   */
  notes?: number[];
  /**
   * Stable, and saved inside playlists as `ambience-<key>`. RENAMING ONE
   * ORPHANS EVERY PLAYLIST THAT HOLDS IT, silently -- the entry stays in the
   * list and never plays again. Add keys; do not rename them.
   */
  key: string;
  label: string;
  blurb: string;
  kind: AmbienceKind;
  colour: NoiseColour;
  icon: string;
  /**
   * A gentle low-pass, in Hz. This is most of what "pleasing" means here: the
   * energy above about 2kHz is what makes noise sound like a hiss rather than
   * like weather. Absent leaves the sound raw, which only `white` wants.
   */
  cutoff?: number;
  /**
   * A slow swell, so the sound breathes instead of sitting flat.
   *
   * `hz` is the rate -- 0.05Hz is one full rise and fall every twenty seconds.
   * `depth` is how far it drops at the bottom of the swell, 0 to 1.
   *
   * DELIBERATELY NOT BAKED INTO THE BUFFER. The buffer is two seconds long and
   * loops; a swell inside it would repeat every two seconds, which is a pulse,
   * which is the exact artefact the buffer is two seconds long to avoid. It is
   * applied in the audio graph instead, where it runs on its own clock and
   * never lines up with the loop. See `startNoise` in lib/player.tsx.
   */
  sway?: { hz: number; depth: number };
  /**
   * A level correction for what the filter took away, applied after it.
   *
   * The raw colours are normalised to one loudness (see `noiseBuffer`), but a
   * low-pass removes real energy and a heavy one removes a lot: cutting white
   * noise at 2.6kHz throws away most of its power, because a flat spectrum
   * carries most of its energy in the top octaves. Without this, choosing the
   * gentler option would read as "the volume broke".
   *
   * THESE ARE CALCULATED, NOT LISTENED TO. They come from how much of each
   * spectrum sits below the cutoff, and nobody has yet heard the result on a
   * real speaker. They are single constants on purpose so they are easy to
   * nudge. Erring low is deliberate: too quiet is a slider away from fixed,
   * too loud is a fright.
   */
  trim?: number;
}

/**
 * Every ambient sound the app offers, gentlest first inside each kind.
 *
 * THE ORDER IS THE RECOMMENDATION. Whatever is first in `calm` is what plays
 * when somebody presses play on the bar without choosing anything, so it has
 * to be the one that is hardest to dislike.
 */
export const VOICES: Voice[] = [
  // A MAJOR PENTATONIC ON C, two octaves. C D E G A -- no semitone steps, so
  // any two of these sound deliberate together and a random pick cannot land
  // on a sour interval.
  {
    key: 'chimes',
    label: 'Wind chimes',
    blurb: 'Single notes, struck now and then, fading slowly.',
    kind: 'gentle',
    colour: 'pink',
    icon: '🎐',
    engine: 'chime',
    notes: [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51],
  },
  {
    key: 'quiet-song',
    label: 'Quiet song',
    blurb: 'A soft chord that drifts and changes. No words, nothing to follow.',
    kind: 'gentle',
    colour: 'pink',
    icon: '🎵',
    engine: 'pad',
    // A ninth chord, low and open: C E G D. Wide spacing keeps it from
    // sounding thick, and the ninth is what stops it sounding like a hymn
    // anybody is expected to recognise.
    notes: [130.81, 164.81, 196.00, 293.66],
  },
  {
    key: 'chapel-bells',
    label: 'Far-off bells',
    blurb: 'Deeper, further away, and further apart.',
    kind: 'gentle',
    colour: 'pink',
    icon: '🔔',
    engine: 'chime',
    notes: [196.00, 220.00, 261.63, 293.66, 329.63, 392.00],
  },
  {
    key: 'pink',
    label: 'Rainfall',
    blurb: 'Soft and even, like rain on a roof.',
    kind: 'calm',
    colour: 'pink',
    icon: '🌧️',
    cutoff: 2400,
    sway: { hz: 0.07, depth: 0.18 },
    trim: 1.15,
  },
  {
    key: 'brown',
    label: 'Distant surf',
    blurb: 'Deep and slow, like waves a long way off.',
    kind: 'calm',
    colour: 'brown',
    icon: '🌊',
    cutoff: 900,
    sway: { hz: 0.05, depth: 0.34 },
  },
  {
    key: 'wind',
    label: 'Night wind',
    blurb: 'Air moving through trees, rising and falling.',
    kind: 'calm',
    colour: 'pink',
    icon: '🌬️',
    cutoff: 700,
    sway: { hz: 0.03, depth: 0.45 },
    trim: 1.35,
  },
  {
    key: 'soft-hush',
    label: 'Soft hush',
    blurb: 'Covers voices, with the sharp top edge taken off. Start here.',
    kind: 'masking',
    colour: 'white',
    icon: '☁️',
    cutoff: 2600,
    trim: 2.2,
  },
  {
    // KEPT, AND KEPT LAST. It is the harshest thing here and somebody
    // genuinely wants it: it is the best of these at covering a conversation
    // through a wall. The answer to "some of it are not pleasing" is to label
    // it and put it where nobody meets it by accident, not to delete it and
    // leave that person with nothing.
    key: 'white',
    label: 'Plain hush',
    blurb: 'Flat and bright. Covers voices best, and is the harshest to sit with.',
    kind: 'masking',
    colour: 'white',
    icon: '🌫️',
  },
];

/** What each group is called, and why somebody would want it. */
export const KINDS: { kind: AmbienceKind; heading: string; note: string }[] = [
  {
    kind: 'gentle',
    heading: 'Music and chimes',
    note: 'Notes rather than noise. Nothing repeats, and there is nothing to follow.',
  },
  { kind: 'calm', heading: 'Weather', note: 'Rain, surf and wind. Made to sit with while you read or pray.' },
  {
    kind: 'masking',
    heading: 'White noise',
    note: 'Brighter and flatter, to cover noise around you. Not everybody finds these restful.',
  },
];

export const voiceFor = (key: string): Voice | undefined =>
  VOICES.find((v) => v.key === key);

/**
 * The loudness every colour is brought to, as RMS.
 *
 * WHY THIS IS HERE. Measured, the three generators came out at wildly
 * different levels: white at 0.58 against pink at 0.20 and brown at 0.20 --
 * nearly three times as loud from the same slider position. So tapping the
 * white one after listening to rain was not merely a change of character, it
 * was a jump in volume, and a jump in volume is most of what "not pleasing"
 * feels like from the other side of a phone speaker. Nobody would report that
 * as a level bug; they would report that the sound is horrible, which is
 * exactly what was reported.
 *
 * 0.2 rather than something higher because these are then filtered, trimmed
 * and swelled, and headroom is cheaper to give back with the slider than to
 * recover from a clipped peak.
 */
const LEVEL = 0.2;

/**
 * Scale a buffer to LEVEL, or lower if one peak would still pass ±1: hardware
 * squares such a sample off, heard as a crackle (about 1 start in 120 of the
 * brown noise at 48 kHz). A silent buffer is left alone.
 */
function normalise(out: Float32Array): void {
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < out.length; i += 1) {
    sum += out[i] * out[i];
    peak = Math.max(peak, Math.abs(out[i]));
  }
  const rms = Math.sqrt(sum / out.length);
  if (rms < 1e-6) return;
  const scale = Math.min(LEVEL / rms, 0.999 / peak);
  for (let i = 0; i < out.length; i += 1) out[i] *= scale;
}

/**
 * A few seconds of noise, looped, at a consistent loudness.
 *
 * Two seconds rather than a fraction of one: a short buffer repeats often
 * enough that the ear finds the seam and starts hearing a pulse.
 */
export function noiseBuffer(ctx: AudioContext, colour: NoiseColour): AudioBuffer {
  const seconds = 2;
  const length = ctx.sampleRate * seconds;
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const out = buffer.getChannelData(0);

  if (colour === 'white') {
    for (let i = 0; i < length; i += 1) out[i] = Math.random() * 2 - 1;
    normalise(out);
    return buffer;
  }

  if (colour === 'brown') {
    // A running sum, damped. Left undamped it wanders off the rails and
    // clips; 0.02 keeps it inside while still falling 6dB per octave.
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      out[i] = last * 3.5;
    }
    normalise(out);
    return buffer;
  }

  // Pink: Paul Kellet's economy filter. Seven poles, cheap enough to fill two
  // seconds of buffer without the page stuttering on a low-end phone.
  let b0 = 0; let b1 = 0; let b2 = 0; let b3 = 0; let b4 = 0; let b5 = 0; let b6 = 0;
  for (let i = 0; i < length; i += 1) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  normalise(out);
  return buffer;
}
