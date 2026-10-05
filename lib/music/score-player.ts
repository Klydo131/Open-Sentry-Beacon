'use client';

// Playing a score's voices so a singer can learn theirs: every line at once,
// or one alone, or one louder than the rest, at any tempo, from any point.
// The notes are sung by the phone (lib/music/audio.ts), scheduled ahead on the
// audio clock the same way the metronome's clicks are.

import { useCallback, useEffect, useRef, useState } from 'react';
import { closeAudio, note, openAudio, schedule, type Timbre } from '@/lib/music/audio';
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

  // ADVANCED. Each leaves the score as written until changed, and each change
  // while playing carries on from where it is.
  /** Semitones up (positive) or down, -12 to 12. */
  transpose: number;
  setTranspose: (semitones: number) => void;
  /** Play this stretch over and over, in quarter notes [from, to); null for the whole piece. */
  loop: Loop | null;
  setLoop: (loop: Loop | null) => void;
  /** How the notes sound. */
  timbre: Timbre;
  setTimbre: (t: Timbre) => void;
}

export interface Loop {
  from: number;
  to: number;
}

export const TRANSPOSE_MAX = 12;
export const clampTranspose = (n: number) => Math.max(-TRANSPOSE_MAX, Math.min(TRANSPOSE_MAX, Math.round(n) || 0));

/**
 * A loop that can be played: inside the piece, at least one beat long, whole
 * beats. Null for anything else, which plays the whole piece.
 */
export function cleanLoop(loop: Loop | null, length: number): Loop | null {
  if (!loop) return null;
  const end = Math.max(1, Math.ceil(length));
  const from = Math.max(0, Math.min(end - 1, Math.round(loop.from)));
  const to = Math.max(from + 1, Math.min(end, Math.round(loop.to)));
  return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
}

/** Where a loop has got to after `quarters` of playing from its start. */
export function loopPosition(loop: Loop, quarters: number): number {
  const length = loop.to - loop.from;
  return loop.from + (((Math.max(0, quarters) % length) + length) % length);
}

export function useScorePlayer(score: Score | null): ScorePlayer {
  const [playing, setPlaying] = useState(false);
  const [tempo, setTempoState] = useState(score?.tempo ?? 90);
  const [mix, setMixState] = useState<Record<string, Mix>>({});
  const [transpose, setTransposeState] = useState(0);
  const [loop, setLoopState] = useState<Loop | null>(null);
  const [timbre, setTimbreState] = useState<Timbre>('voice');
  const ctx = useRef<AudioContext | null>(null);
  const master = useRef<GainNode | null>(null);
  const halt = useRef<(() => void) | null>(null);
  const clock = useRef<{ startAt: number; fromQuarter: number; tempo: number; loop: Loop | null }>({ startAt: 0, fromQuarter: 0, tempo: 90, loop: null });

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
    setTransposeState(0);
    setLoopState(null);
  }, [score, stop]);

  /**
   * Play from a point, at a tempo and mix. Changing either while playing comes
   * through here too, ON THE SAME AUDIO CLOCK: an iPhone lets a clock start
   * only inside a tap, so a restart that opened a new one from anywhere else
   * would be silent there.
   */
  const run = useCallback((fromQuarter: number, bpm: number, heard: Record<string, Mix>, shift = 0, round: Loop | null = null, sound: Timbre = 'voice') => {
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
    // A loop starts where it is, or at its beginning when that is outside it.
    const from = round && (fromQuarter < round.from || fromQuarter >= round.to) ? round.from : fromQuarter;
    clock.current = { startAt, fromQuarter: from, tempo: bpm, loop: round };
    // Every note of every line that is heard, in time order. Looping: the notes
    // of the stretch, each cut at its end, played round and round; the first
    // time round starts at `from`, which may be part-way in.
    const inLoop = (n: { start: number }) => !round || (n.start >= round.from && n.start < round.to);
    const queue = score.lines
      .flatMap((line) => {
        const level = LEVEL[heard[line.id] ?? 'normal'];
        return level === 0 ? [] : line.notes.filter(inLoop).map((n) => ({
          n: round ? { ...n, length: Math.min(n.length, round.to - n.start) } : n,
          level,
        }));
      })
      .sort((a, b) => a.n.start - b.n.start);
    let next = round ? queue.findIndex((q) => q.n.start >= from) : queue.findIndex((q) => q.n.start >= from);
    if (next < 0) next = queue.length;
    // Seconds from `from` to the start of each time round: the first is a part.
    let roundAt = 0;
    const roundLength = round ? (round.to - round.from) * secondsPerQuarter : 0;
    const clockNow = audio;
    halt.current = schedule(clockNow, (until) => {
      for (;;) {
        if (next >= queue.length) {
          if (!round || !queue.length) break;
          // Round again: the next time round begins where this one ends.
          roundAt = (roundAt === 0 ? (round.to - from) * secondsPerQuarter : roundAt + roundLength);
          next = 0;
          if (startAt + roundAt >= until) break;
        }
        const { n, level } = queue[next];
        const offset = round && roundAt > 0 ? roundAt + (n.start - round.from) * secondsPerQuarter : (n.start - from) * secondsPerQuarter;
        const at = startAt + offset;
        if (at >= until) break;
        note(clockNow, out, midiToHz(n.midi + shift), at, n.length * secondsPerQuarter * 0.95, level, sound);
        next++;
      }
      // The end of the piece, and a beat to let the last note ring. A loop plays until stopped.
      if (!round && clockNow.currentTime > startAt + (score.length - from) * secondsPerQuarter + 1) stop();
    });
    setPlaying(true);
    return true;
  }, [score, hush, stop]);

  const position = useCallback(() => {
    const audio = ctx.current;
    if (!audio || !master.current) return null;
    const { startAt, fromQuarter, tempo: t, loop: round } = clock.current;
    const played = Math.max(0, audio.currentTime - startAt) * (t / 60);
    if (!round) return fromQuarter + played;
    // Round and round: the first time round started at fromQuarter.
    return loopPosition(round, fromQuarter - round.from + played);
  }, []);

  const play = useCallback((fromQuarter = 0) => run(fromQuarter, tempo, mix, transpose, loop, timbre), [run, tempo, mix, transpose, loop, timbre]);

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
      if (playing && at !== null) run(at, next, mix, transpose, loop, timbre);
    },
    mix,
    setMix: (changes) => {
      const next = { ...mix, ...changes };
      const at = position();
      setMixState(next);
      if (playing && at !== null) run(at, tempo, next, transpose, loop, timbre);
    },
    play,
    stop,
    position,
    transpose,
    setTranspose: (semitones) => {
      const next = clampTranspose(semitones);
      const at = position();
      setTransposeState(next);
      if (playing && at !== null) run(at, tempo, mix, next, loop, timbre);
    },
    loop,
    setLoop: (wanted) => {
      const next = score ? cleanLoop(wanted, score.length) : null;
      const at = position();
      setLoopState(next);
      if (playing && at !== null) run(next ? next.from : at, tempo, mix, transpose, next, timbre);
    },
    timbre,
    setTimbre: (t) => {
      const at = position();
      setTimbreState(t);
      if (playing && at !== null) run(at, tempo, mix, transpose, loop, t);
    },
  };
}
