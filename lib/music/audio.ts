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
 * A sung note: a soft triangle with a slow swell and release, which reads as
 * an "oo" rather than a beep. Good for hearing a part, not a performance.
 */
export function note(ctx: AudioContext, out: AudioNode, hz: number, at: number, seconds: number, level: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = hz;
  const end = at + Math.max(0.08, seconds);
  const peak = Math.max(0.0001, Math.min(1, level) * 0.22);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.04);
  gain.gain.setValueAtTime(peak, Math.max(at + 0.04, end - 0.08));
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain).connect(out);
  osc.start(at);
  osc.stop(end + 0.02);
}
