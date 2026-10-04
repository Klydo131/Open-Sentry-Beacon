'use client';

// The conductor's metronome: clicks on the audio clock, and where the baton is
// for the picture. lib/music/beat.ts holds the arithmetic; this holds the clock.

import { useCallback, useEffect, useRef, useState } from 'react';
import { closeAudio, click, openAudio, schedule } from '@/lib/music/audio';
import { beatAt, clampTempo, due, TEMPO_DEFAULT, type BeatState, type Click, type Meter } from '@/lib/music/beat';

export interface Metronome {
  running: boolean;
  bpm: number;
  meter: Meter;
  setBpm: (bpm: number) => void;
  setMeter: (meter: Meter) => void;
  /** Clicks heard, or a silent baton to follow during a service. */
  sound: boolean;
  setSound: (on: boolean) => void;
  start: () => boolean;
  stop: () => void;
  /** The beat and how far towards the next, now; null when stopped. Read every frame. */
  now: () => { beat: number; phase: number } | null;
}

export function useMetronome(): Metronome {
  const [running, setRunning] = useState(false);
  const [bpm, setBpmState] = useState(TEMPO_DEFAULT);
  const [meter, setMeterState] = useState<Meter>(4);
  const [sound, setSound] = useState(true);
  const ctx = useRef<AudioContext | null>(null);
  const halt = useRef<(() => void) | null>(null);
  const state = useRef<BeatState>({ nextAt: 0, nextBeat: 0 });
  const recent = useRef<Click[]>([]);
  // Read by the scheduler on every wake, so a change applies from the next click.
  const live = useRef({ bpm, meter, sound });
  live.current = { bpm, meter, sound };

  const stop = useCallback(() => {
    halt.current?.();
    halt.current = null;
    closeAudio(ctx.current);
    ctx.current = null;
    recent.current = [];
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    stop();
    const audio = openAudio();
    if (!audio) return false;
    ctx.current = audio;
    // A short breath before the first click, so it is not clipped.
    state.current = { nextAt: audio.currentTime + 0.1, nextBeat: 0 };
    halt.current = schedule(audio, (until) => {
      const { bpm: b, meter: m, sound: heard } = live.current;
      const { clicks, state: next } = due(state.current, b, m, until);
      state.current = next;
      // Silent still keeps time: the clicks are counted, only not sounded, so
      // the baton follows the same clock either way.
      if (!clicks.length) return;
      if (heard) for (const c of clicks) click(audio, c.at, c.beat === 0);
      recent.current = [...recent.current, ...clicks].slice(-16);
    });
    setRunning(true);
    return true;
  }, [stop]);

  // Leaving the room, or the phone locking, stops the click: a metronome
  // ticking in a pocket is a bug, and a background tab's timers are slowed
  // until it would tick out of time anyway.
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      stop();
    };
  }, [stop]);

  const now = useCallback(() => {
    const audio = ctx.current;
    if (!audio) return null;
    return beatAt(recent.current, live.current.bpm, audio.currentTime);
  }, []);

  return {
    running,
    bpm,
    meter,
    setBpm: (b) => setBpmState(clampTempo(b)),
    setMeter: (m) => {
      setMeterState(m);
      // A new pattern starts on its first beat.
      state.current = { ...state.current, nextBeat: 0 };
    },
    sound,
    setSound,
    start,
    stop,
    now,
  };
}
