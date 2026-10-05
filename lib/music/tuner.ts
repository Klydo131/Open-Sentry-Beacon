'use client';

// The tuner: listen through the microphone and say which note is sounding and
// how far off it is.
//
// THE MICROPHONE, AND WHAT HAPPENS TO WHAT IT HEARS. It is opened only when
// somebody presses Start, and the browser asks them first. The sound is
// measured on the phone, a few thousand samples at a time, and thrown away:
// nothing is recorded, kept or sent anywhere. The microphone is released (the
// browser's recording light goes off) the moment they press Stop, leave the
// room, or the phone locks or switches apps.
//
// THE PITCH is found by the McLeod pitch method ("A smarter way to find pitch",
// McLeod and Wyvill, 2005), through pitchy (MIT, github.com/ianprime0509/pitchy),
// on every frame. What to show from those readings (which window, when a note
// has changed, how steady to hold the needle) is lib/music/pitch-tracker.ts,
// reworked on 6 October 2026 to be quicker on a change of note and steadier on
// a held one.

import { useCallback, useEffect, useRef, useState } from 'react';
import { clampA4, readFrequency, A4_DEFAULT, type Reading } from '@/lib/music/notes';
import { LONG_WINDOW, PitchTracker } from '@/lib/music/pitch-tracker';

/**
 * The screen is told at most this often, about thirty times a second: as fast
 * as an eye follows a needle. The pitch is still measured every frame.
 */
const SHOW_EVERY_MS = 33;

export type TunerStatus = 'off' | 'asking' | 'listening' | 'denied' | 'unavailable';

export interface Tuner {
  status: TunerStatus;
  reading: Reading | null;
  /** The sound has stopped and the last note is being held for a moment. */
  held: boolean;
  a4: number;
  setA4: (hz: number) => void;
  start: () => Promise<void>;
  stop: () => void;
}

export function useTuner(): Tuner {
  const [status, setStatus] = useState<TunerStatus>('off');
  const [reading, setReading] = useState<Reading | null>(null);
  const [held, setHeld] = useState(false);
  const [a4, setA4State] = useState(A4_DEFAULT);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const frame = useRef(0);
  const shownAt = useRef(0);
  // Every start and every stop takes a new number. A start whose permission
  // prompt is answered after a stop (the room left, the phone locked) finds
  // its number stale and lets the microphone go at once.
  const turn = useRef(0);
  const a4Now = useRef(a4);
  a4Now.current = a4;

  const stop = useCallback(() => {
    turn.current += 1;
    cancelAnimationFrame(frame.current);
    // Every track stopped: this is what turns the browser's recording light off.
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (ctx.current && ctx.current.state !== 'closed') void ctx.current.close().catch(() => {});
    ctx.current = null;
    setReading(null);
    setHeld(false);
    setStatus((s) => (s === 'denied' || s === 'unavailable' ? s : 'off'));
  }, []);

  const start = useCallback(async () => {
    stop();
    const mine = turn.current;
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('unavailable'); return; }
    setStatus('asking');
    let media: MediaStream;
    try {
      // The voice as it is: the phone's call-cleaning (echo cancelling, noise
      // suppression, automatic level) bends exactly what a tuner measures.
      media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
    } catch {
      if (mine === turn.current) setStatus('denied');
      return;
    }
    if (mine !== turn.current) {
      // Stopped while the browser was asking: never start listening late.
      media.getTracks().forEach((t) => t.stop());
      return;
    }
    const W = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const C = W.AudioContext ?? W.webkitAudioContext;
    if (!C) { media.getTracks().forEach((t) => t.stop()); setStatus('unavailable'); return; }
    const audio = new C();
    void audio.resume().catch(() => {});
    const analyser = audio.createAnalyser();
    analyser.fftSize = LONG_WINDOW;
    // Into the analyser only: nothing is connected to the speakers, so the
    // tuner never plays the room back to itself.
    audio.createMediaStreamSource(media).connect(analyser);
    const tracker = new PitchTracker(audio.sampleRate);
    const buffer = new Float32Array(LONG_WINDOW);
    stream.current = media;
    ctx.current = audio;
    setStatus('listening');

    let showing = false;
    const listen = () => {
      frame.current = requestAnimationFrame(listen);
      const now = performance.now();
      analyser.getFloatTimeDomainData(buffer);
      const heard = tracker.push(buffer, now);
      if (!heard) {
        // Cleared at once when the held note runs out, not on the next tick.
        if (showing) { showing = false; setReading(null); setHeld(false); }
        return;
      }
      if (now - shownAt.current < SHOW_EVERY_MS) return;
      shownAt.current = now;
      showing = true;
      setReading(readFrequency(heard.hz, a4Now.current));
      setHeld(heard.held);
    };
    frame.current = requestAnimationFrame(listen);
  }, [stop]);

  // Released when the room is left, and when the phone locks or another app
  // comes to the front: a microphone left open in a pocket is the one thing
  // this must never do.
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', stop);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', stop);
      stop();
    };
  }, [stop]);

  // Stable, so a screen can call it from an effect without running it again.
  const setA4 = useCallback((hz: number) => setA4State(clampA4(hz)), []);

  return { status, reading, held, a4, setA4, start, stop };
}
