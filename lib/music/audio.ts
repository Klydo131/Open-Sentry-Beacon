'use client';

// The Music room's sound: one place that opens the audio clock, schedules
// ahead of it, and makes the two sounds the room needs, a click and a sung
// note. lib/music/metronome.ts and lib/music/score-player.ts both use it, so
// the scheduling is written once.
//
// NOTHING IS DOWNLOADED. The click and the voice are made by oscillators on
// the phone, so the room works with no signal and sends nothing anywhere.

/** How often the scheduler wakes, and how far ahead it hands sound to the audio clock. */
export const WAKE_MS = 25;
export const AHEAD_S = 0.12;

type Ctor = typeof AudioContext;

/** An audio clock, or null on a browser without Web Audio. Opened on a tap (iOS requires it). */
export function openAudio(): AudioContext | null {
  const W = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  const C = W.AudioContext ?? W.webkitAudioContext;
  if (!C) return null;
  const ctx = new C();
  // Safari starts a context suspended even inside a tap on some versions.
  void ctx.resume().catch(() => {});
  return ctx;
}

/** Close an audio clock and everything on it. Safe to call twice. */
export function closeAudio(ctx: AudioContext | null): void {
  if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
}

/**
 * Wake every WAKE_MS and let `fill` hand over everything due before
 * now + AHEAD_S. Returns the stop. The first fill runs at once, so the first
 * sound is not a wake late.
 */
export function schedule(ctx: AudioContext, fill: (until: number) => void): () => void {
  const wake = () => fill(ctx.currentTime + AHEAD_S);
  wake();
  const id = window.setInterval(wake, WAKE_MS);
  return () => window.clearInterval(id);
}

/** A click: short, bright on the first beat of the bar, softer on the others. */
export function click(ctx: AudioContext, at: number, accent: boolean, volume = 0.6): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = accent ? 1760 : 1175;
  const peak = Math.max(0.0001, Math.min(1, volume) * (accent ? 0.5 : 0.32));
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.06);
}

/**
 * How a note sounds (Advanced). Every one is a few oscillators on the phone;
 * nothing is downloaded.
 *
 *   voice  a soft triangle, an "oo" rather than a beep (the default)
 *   organ  the note with its octave and twelfth above, like a few organ stops
 *   flute  a pure tone that breathes in more slowly
 */
export const TIMBRES = ['voice', 'organ', 'flute'] as const;
export type Timbre = (typeof TIMBRES)[number];
export const TIMBRE_NAME: Record<Timbre, string> = { voice: 'Soft voice', organ: 'Organ', flute: 'Flute' };

/** The partials of each sound: [multiple of the note, share of the level, wave]. */
const PARTIALS: Record<Timbre, [number, number, OscillatorType][]> = {
  voice: [[1, 1, 'triangle']],
  organ: [[1, 0.6, 'sine'], [2, 0.3, 'sine'], [3, 0.15, 'sine']],
  flute: [[1, 1, 'sine']],
};
const ATTACK: Record<Timbre, number> = { voice: 0.04, organ: 0.02, flute: 0.09 };

/** Oscillators for one note of a sound, into `gain`, started at `at`. */
function voices(ctx: AudioContext, gain: GainNode, hz: number, at: number, timbre: Timbre): OscillatorNode[] {
  return PARTIALS[timbre].map(([multiple, share, wave]) => {
    const osc = ctx.createOscillator();
    const part = ctx.createGain();
    osc.type = wave;
    osc.frequency.value = hz * multiple;
    part.gain.value = share;
    osc.connect(part).connect(gain);
    osc.start(at);
    return osc;
  });
}

/**
 * A sung note: a soft triangle with a slow swell and release, which reads as
 * an "oo" rather than a beep. Good for hearing a part, not a performance.
 * Advanced chooses another sound for it.
 */
export function note(ctx: AudioContext, out: AudioNode, hz: number, at: number, seconds: number, level: number, timbre: Timbre = 'voice'): void {
  const gain = ctx.createGain();
  const end = at + Math.max(0.08, seconds);
  const peak = Math.max(0.0001, Math.min(1, level) * 0.22);
  const attack = ATTACK[timbre] ?? 0.04;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + attack);
  gain.gain.setValueAtTime(peak, Math.max(at + attack, end - 0.08));
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  gain.connect(out);
  for (const osc of voices(ctx, gain, hz, at, timbre)) osc.stop(end + 0.02);
}

/**
 * A note held for as long as it is wanted: a drone to sing against, or a key
 * held down on the keyboard. Returns its release, which fades it out and lets
 * its oscillators go. Safe to call twice.
 */
export function sustain(ctx: AudioContext, out: AudioNode, hz: number, level: number, timbre: Timbre = 'voice'): () => void {
  const gain = ctx.createGain();
  const at = ctx.currentTime;
  const peak = Math.max(0.0001, Math.min(1, level) * 0.22);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + Math.max(0.03, ATTACK[timbre] ?? 0.04));
  gain.connect(out);
  const oscillators = voices(ctx, gain, hz, at, timbre);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const now = ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
      for (const osc of oscillators) osc.stop(now + 0.2);
    } catch { /* the clock was already closed: nothing is sounding */ }
  };
}

// ---- DRUMS, for the beat maker ---------------------------------------------
//
// Made on the phone like everything else here: a bass drum is a low tone
// falling fast, a snare and a hi-hat are short bursts of noise through a
// filter. One second of noise is made once per audio clock and reused.

const noises = new WeakMap<AudioContext, AudioBuffer>();
function noise(ctx: AudioContext): AudioBuffer {
  let buffer = noises.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noises.set(ctx, buffer);
  }
  return buffer;
}

export function drum(ctx: AudioContext, out: AudioNode, kind: 'kick' | 'snare' | 'hat', at: number, level = 1): void {
  const gain = ctx.createGain();
  gain.connect(out);
  const v = Math.max(0.0001, Math.min(1, level));
  if (kind === 'kick') {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    gain.gain.setValueAtTime(0.9 * v, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + 0.32);
    return;
  }
  const src = ctx.createBufferSource();
  src.buffer = noise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = kind === 'snare' ? 1200 : 7000;
  const length = kind === 'snare' ? 0.16 : 0.05;
  gain.gain.setValueAtTime((kind === 'snare' ? 0.5 : 0.25) * v, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  src.connect(filter).connect(gain);
  src.start(at);
  src.stop(at + length + 0.02);
}
