'use client';

// The conductor's metronome: clicks on the audio clock, and where the baton is
// for the picture. lib/music/beat.ts holds the arithmetic; this holds the clock.

import { useCallback, useEffect, useRef, useState } from 'react';
import { closeAudio, click, openAudio, schedule } from '@/lib/music/audio';
import {
  beatAt, clampTempo, defaultAccents, due, trainerTempo, TEMPO_DEFAULT,
  type Accent, type BeatState, type Click, type Meter, type Subdivision, type Trainer,
} from '@/lib/music/beat';

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

  // ADVANCED. All of these leave the metronome exactly as it was until changed.
  /** Clicks to a beat: 1, 2, 3 or 4. */
  subdivision: Subdivision;
  setSubdivision: (s: Subdivision) => void;
  /** How each beat of the bar sounds. */
  accents: Accent[];
  setAccents: (a: Accent[]) => void;
  /** Sound the first bar only, then keep time in silence. */
  countIn: boolean;
  setCountIn: (on: boolean) => void;
  /** Get faster as it goes; null for off. */
  trainer: Trainer | null;
  setTrainer: (t: Trainer | null) => void;
}

export function useMetronome(): Metronome {
  const [running, setRunning] = useState(false);
  const [bpm, setBpmState] = useState(TEMPO_DEFAULT);
  const [meter, setMeterState] = useState<Meter>(4);
  const [sound, setSound] = useState(true);
  const [subdivision, setSubdivision] = useState<Subdivision>(1);
  const [accents, setAccents] = useState<Accent[]>(defaultAccents(4));
  const [countIn, setCountIn] = useState(false);
  const [trainer, setTrainer] = useState<Trainer | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const halt = useRef<(() => void) | null>(null);
  const state = useRef<BeatState>({ nextAt: 0, nextBeat: 0 });
  const recent = useRef<Click[]>([]);
  // First beats heard since Start (1 during the first bar), and the tempo it
  // started at: what the count-in and the speed trainer go by.
  const downbeats = useRef(0);
  const startBpm = useRef(bpm);
  // Read by the scheduler on every wake, so a change applies from the next click.
  const live = useRef({ bpm, meter, sound, subdivision, accents, countIn, trainer });
  live.current = { bpm, meter, sound, subdivision, accents, countIn, trainer };

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
    state.current = { nextAt: audio.currentTime + 0.1, nextBeat: 0, nextSub: 0 };
    downbeats.current = 0;
    startBpm.current = live.current.bpm;
    halt.current = schedule(audio, (until) => {
      const { bpm: b, meter: m, sound: heard, subdivision: parts, accents: loud, countIn: counting, trainer: training } = live.current;
      const { clicks, state: next } = due(state.current, b, m, until, parts);
      state.current = next;
      // Silent still keeps time: the clicks are counted, only not sounded, so
      // the baton follows the same clock either way.
      if (!clicks.length) return;
      for (const c of clicks) {
        if (c.beat === 0 && !c.sub) {
          // A new bar. The trainer moves the tempo on from the next wake.
          downbeats.current += 1;
          const played = downbeats.current - 1;
          if (training && played > 0) {
            const faster = trainerTempo(startBpm.current, played, training);
            if (faster !== live.current.bpm) { live.current = { ...live.current, bpm: faster }; setBpmState(faster); }
          }
        }
        const accent = loud[c.beat] ?? (c.beat === 0 ? 'loud' : 'normal');
        const inCount = !counting || downbeats.current <= 1;
        if (!heard || !inCount || accent === 'silent') continue;
        if (c.sub) click(audio, c.at, false, 0.3);
        else click(audio, c.at, accent === 'loud');
      }
      recent.current = [...recent.current, ...clicks].slice(-32);
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
      setAccents(defaultAccents(m));
      // A new pattern starts on its first beat.
      state.current = { ...state.current, nextBeat: 0, nextSub: 0 };
    },
    sound,
    setSound,
    start,
    stop,
    now,
    subdivision,
    setSubdivision,
    accents,
    setAccents,
    countIn,
    setCountIn,
    trainer,
    setTrainer,
  };
}
