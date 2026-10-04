'use client';

// Playing a score's voices so a singer can learn theirs: every line at once,
// or one alone, or one louder than the rest, at any tempo, from any point.
// The notes are sung by the phone (lib/music/audio.ts), scheduled ahead on the
// audio clock the same way the metronome's clicks are.

import { useCallback, useEffect, useRef, useState } from 'react';
import { closeAudio, note, openAudio, schedule } from '@/lib/music/audio';
import { midiToHz } from '@/lib/music/notes';
import { clampTempo } from '@/lib/music/beat';
import type { Score } from '@/lib/music/musicxml';

/** How a line is heard: as written, brought forward, or not at all. */
export type Mix = 'normal' | 'loud' | 'off';

const LEVEL: Record<Mix, number> = { normal: 0.45, loud: 1, off: 0 };

export interface ScorePlayer {
  playing: boolean;
  /** Quarter notes per minute, the score's own until changed. */
  tempo: number;
  /** Change the tempo; while playing, carries on from where it is at the new one. */
  setTempo: (bpm: number) => void;
  mix: Record<string, Mix>;
  /**
   * Change how lines are heard, several at once ({ soprano: 'loud', alto:
   * 'normal' }); while playing, carries on from where it is.
   */
  setMix: (changes: Record<string, Mix>) => void;
  play: (fromQuarter?: number) => boolean;
  stop: () => void;
  /** Where playing has got to, in quarter notes; null when stopped. Read every frame. */
  position: () => number | null;
}

export function useScorePlayer(score: Score | null): ScorePlayer {
  const [playing, setPlaying] = useState(false);
  const [tempo, setTempoState] = useState(score?.tempo ?? 90);
  const [mix, setMixState] = useState<Record<string, Mix>>({});
  const ctx = useRef<AudioContext | null>(null);
  const master = useRef<GainNode | null>(null);
  const halt = useRef<(() => void) | null>(null);
  const clock = useRef({ startAt: 0, fromQuarter: 0, tempo: 90 });

  /** Silence what is scheduled, but keep the audio clock open. */
  const hush = useCallback(() => {
    halt.current?.();
    halt.current = null;
    // Notes already handed to the clock play through this; cutting it cuts them.
    master.current?.disconnect();
    master.current = null;
  }, []);

  const stop = useCallback(() => {
    hush();
    closeAudio(ctx.current);
    ctx.current = null;
    setPlaying(false);
  }, [hush]);

  // A new score starts at its own tempo, every line as written.
  useEffect(() => {
    stop();
    setTempoState(score?.tempo ?? 90);
    setMixState({});
  }, [score, stop]);

  /**
   * Play from a point, at a tempo and mix. Changing either while playing comes
   * through here too, ON THE SAME AUDIO CLOCK: an iPhone lets a clock start
   * only inside a tap, so a restart that opened a new one from anywhere else
   * would be silent there.
   */
  const run = useCallback((fromQuarter: number, bpm: number, heard: Record<string, Mix>) => {
    if (!score) return false;
    hush();
    let audio = ctx.current;
    if (!audio || audio.state === 'closed') {
      audio = openAudio();
      if (!audio) return false;
      ctx.current = audio;
    }
    const out = audio.createGain();
    out.gain.value = 0.9;
    out.connect(audio.destination);
    master.current = out;

    const secondsPerQuarter = 60 / bpm;
    const startAt = audio.currentTime + 0.15;
    clock.current = { startAt, fromQuarter, tempo: bpm };
    // Every note of every line that is heard, in time order, from the start point.
    const queue = score.lines
      .flatMap((line) => {
        const level = LEVEL[heard[line.id] ?? 'normal'];
        return level === 0 ? [] : line.notes.filter((n) => n.start >= fromQuarter).map((n) => ({ n, level }));
      })
      .sort((a, b) => a.n.start - b.n.start);
    let next = 0;
    const clockNow = audio;
    halt.current = schedule(clockNow, (until) => {
      while (next < queue.length) {
        const { n, level } = queue[next];
        const at = startAt + (n.start - fromQuarter) * secondsPerQuarter;
        if (at >= until) break;
        note(clockNow, out, midiToHz(n.midi), at, n.length * secondsPerQuarter * 0.95, level);
        next++;
      }
      // The end of the piece, and a beat to let the last note ring.
      if (clockNow.currentTime > startAt + (score.length - fromQuarter) * secondsPerQuarter + 1) stop();
    });
    setPlaying(true);
    return true;
  }, [score, hush, stop]);

  const position = useCallback(() => {
    const audio = ctx.current;
    if (!audio || !master.current) return null;
    const { startAt, fromQuarter, tempo: t } = clock.current;
    return fromQuarter + Math.max(0, audio.currentTime - startAt) * (t / 60);
  }, []);

  const play = useCallback((fromQuarter = 0) => run(fromQuarter, tempo, mix), [run, tempo, mix]);

  // Hidden or left: silent, like the metronome.
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      stop();
    };
  }, [stop]);

  return {
    playing,
    tempo,
    setTempo: (bpm) => {
      const next = clampTempo(bpm);
      const at = position();
      setTempoState(next);
      if (playing && at !== null) run(at, next, mix);
    },
    mix,
    setMix: (changes) => {
      const next = { ...mix, ...changes };
      const at = position();
      setMixState(next);
      if (playing && at !== null) run(at, tempo, next);
    },
    play,
    stop,
    position,
  };
}
