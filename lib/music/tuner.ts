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
// McLeod and Wyvill, 2005), through pitchy (MIT, github.com/ianprime0509/pitchy):
// accurate on a held voice or instrument, and quick enough for every frame.

import { useCallback, useEffect, useRef, useState } from 'react';
import { PitchDetector } from 'pitchy';
import { clampA4, readFrequency, A4_DEFAULT, type Reading } from '@/lib/music/notes';

/** Below this, the sound is too noisy to name a note. pitchy's clarity is 0 to 1. */
const CLARITY = 0.88;
/** The range a choir and its instruments live in, bass's low E to a soprano's top C and beyond. */
const LOWEST_HZ = 55;
const HIGHEST_HZ = 1600;
/** Readings smoothed over, so the needle does not shiver. */
const SMOOTH = 5;
/**
 * The screen is told at most this often. The pitch is still measured every
 * frame; drawing it sixty times a second only made the phone warm.
 */
const SHOW_EVERY_MS = 50;
/** The pitch is worked out this often: half the frames, and no reading is lost. */
const LISTEN_EVERY_MS = 30;

export type TunerStatus = 'off' | 'asking' | 'listening' | 'denied' | 'unavailable';

export interface Tuner {
  status: TunerStatus;
  reading: Reading | null;
  a4: number;
  setA4: (hz: number) => void;
  start: () => Promise<void>;
  stop: () => void;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export function useTuner(): Tuner {
  const [status, setStatus] = useState<TunerStatus>('off');
  const [reading, setReading] = useState<Reading | null>(null);
  const [a4, setA4State] = useState(A4_DEFAULT);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const frame = useRef(0);
  const heard = useRef<number[]>([]);
  const shownAt = useRef(0);
  const heardAt = useRef(0);
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
    heard.current = [];
    setReading(null);
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
    analyser.fftSize = 4096;
    // Into the analyser only: nothing is connected to the speakers, so the
    // tuner never plays the room back to itself.
    audio.createMediaStreamSource(media).connect(analyser);
    const detector = PitchDetector.forFloat32Array(analyser.fftSize);
    const buffer = new Float32Array(detector.inputLength);
    stream.current = media;
    ctx.current = audio;
    setStatus('listening');

    const listen = () => {
      frame.current = requestAnimationFrame(listen);
      const now = performance.now();
      if (now - heardAt.current < LISTEN_EVERY_MS) return;
      heardAt.current = now;
      analyser.getFloatTimeDomainData(buffer);
      const [hz, clarity] = detector.findPitch(buffer, audio.sampleRate);
      if (clarity >= CLARITY && hz >= LOWEST_HZ && hz <= HIGHEST_HZ) {
        heard.current = [...heard.current, hz].slice(-SMOOTH);
        if (now - shownAt.current >= SHOW_EVERY_MS) {
          shownAt.current = now;
          setReading(readFrequency(median(heard.current), a4Now.current));
        }
      } else if (heard.current.length) {
        // Silence for a moment empties the smoothing, so the next note is read fresh.
        heard.current = heard.current.slice(1);
        if (!heard.current.length) setReading(null);
      }
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

  return { status, reading, a4, setA4, start, stop };
}
