'use client';

// The Play folder: somewhere to make music, not only learn it.
//
// Asked for on 5 October 2026: "more dynamic but also simple ... for users to
// play and be more creative in music play". Simple is a keyboard: an octave
// to pick out a tune, played by touch, several keys at once. Advanced adds a
// choice of sound, chord buttons in the keys a church sings in, and a beat
// maker: sixteen steps of bass drum, snare and hi-hat, kept on the phone.
//
// One audio clock for the whole folder, opened by the first tap (an iPhone
// allows nothing else), closed when the folder is left or the phone locks,
// and closed again after half a minute of quiet so it never runs in a pocket.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { AdvancedToggle, useAdvanced } from '@/components/music/Advanced';
import { TIMBRES, TIMBRE_NAME, closeAudio, drum, note, openAudio, schedule, sustain, type Timbre } from '@/lib/music/audio';
import { A4_DEFAULT, clampA4, midiName, midiToHz } from '@/lib/music/notes';
import {
  BEAT_TEMPO_MAX, BEAT_TEMPO_MIN, DRUMS, DRUM_NAME, OCTAVE_KEYS, OCTAVE_MAX, OCTAVE_MIN, SONG_KEYS, STARTER_PATTERNS, STEPS,
  chordsInKey, clampBeatTempo, clampOctave, cleanPatterns, emptyPattern, octaveC, stepsDue,
  type Pattern, type SongKey, type StepState,
} from '@/lib/music/play';
import { cleanName } from '@/lib/music/beat';

/** Quiet for this long, with nothing running, and the audio clock is closed. */
const IDLE_MS = 30_000;
/** Beat patterns kept on this phone. */
const PATTERNS_KEY = 'beacon:music-patterns';

interface Clock {
  /** The folder's audio clock, opened if need be. Call it inside a tap. */
  get: () => AudioContext | null;
  /**
   * Something is sounding (a held key, the beat maker): do not close for quiet
   * until every one of them has said it is done.
   */
  busy: (who: 'keys' | 'beat', on: boolean) => void;
  /** A sound has finished: close after IDLE_MS of quiet. */
  idle: () => void;
  /** Bumped whenever the clock is closed, so whatever was using it stops. */
  epoch: number;
}

function useClock(): Clock {
  const ctx = useRef<AudioContext | null>(null);
  const holders = useRef(new Set<string>());
  const timer = useRef(0);
  const [epoch, setEpoch] = useState(0);
  const close = useCallback(() => {
    window.clearTimeout(timer.current);
    holders.current.clear();
    if (!ctx.current) return;
    closeAudio(ctx.current);
    ctx.current = null;
    setEpoch((e) => e + 1);
  }, []);
  const get = useCallback(() => {
    window.clearTimeout(timer.current);
    if (!ctx.current || ctx.current.state === 'closed') ctx.current = openAudio();
    return ctx.current;
  }, []);
  const idle = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { if (holders.current.size === 0) close(); }, IDLE_MS);
  }, [close]);
  const busy = useCallback((who: string, on: boolean) => {
    if (on) holders.current.add(who);
    else { holders.current.delete(who); idle(); }
  }, [idle]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) close(); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.clearTimeout(timer.current);
      closeAudio(ctx.current);
      ctx.current = null;
    };
  }, [close]);
  // One object for as long as the clock stays open, so what depends on it
  // reacts only when it closes, not on every render.
  return useMemo(() => ({ get, busy, idle, epoch }), [get, busy, idle, epoch]);
}

/** The choir's concert pitch, if one was chosen in the Tuner: the keyboard plays at it. */
function useConcertPitch(): number {
  const [a4, setA4] = useState(A4_DEFAULT);
  useEffect(() => {
    try { const kept = Number(localStorage.getItem('beacon:music-a4')); if (kept) setA4(clampA4(kept)); } catch { /* 440 */ }
  }, []);
  return a4;
}

export function PlayPanel() {
  const clock = useClock();
  const a4 = useConcertPitch();
  const [advanced, setAdvanced] = useAdvanced('play');
  const [timbre, setTimbre] = useState<Timbre>('organ');
  const sound: Timbre = advanced ? timbre : 'organ';

  return (
    <div className="space-y-5" data-music-play>
      <Keyboard clock={clock} a4={a4} timbre={sound} />
      <Card className="p-5">
        <AdvancedToggle
          folder="play"
          on={advanced}
          onChange={setAdvanced}
          what="Choose the sound, play chords in any key, and make your own beat."
        />
      </Card>
      {advanced && (
        <>
          <Card className="p-5">
            <label htmlFor="play-sound" className="block text-xl font-bold text-navy">Sound</label>
            <p className="mt-1 text-sm text-gray-600">For the keyboard and the chords.</p>
            <select
              id="play-sound"
              value={timbre}
              onChange={(e) => setTimbre(e.target.value as Timbre)}
              className="tap mt-3 block w-full rounded-xl bg-white px-4 text-base font-semibold text-navy ring-1 ring-navy/20 sm:w-72"
            >
              {TIMBRES.map((t) => <option key={t} value={t}>{TIMBRE_NAME[t]}</option>)}
            </select>
          </Card>
          <Chords clock={clock} a4={a4} timbre={sound} />
          <BeatMaker clock={clock} />
        </>
      )}
    </div>
  );
}

// ---- THE KEYBOARD ---------------------------------------------------------

function Keyboard({ clock, a4, timbre }: { clock: Clock; a4: number; timbre: Timbre }) {
  const [octave, setOctave] = useState(4);
  const [lit, setLit] = useState<number[]>([]);
  const [last, setLast] = useState<number | null>(null);
  // Each finger (pointer) holds at most one key, so a chord of fingers is a chord of notes.
  const held = useRef(new Map<number, { midi: number; release: () => void }>());

  const liftAll = useCallback(() => {
    held.current.forEach((h) => h.release());
    held.current.clear();
    setLit([]);
  }, []);
  // The clock was closed (left, locked, or quiet): nothing is held any more.
  useEffect(() => { liftAll(); }, [clock.epoch, liftAll]);
  useEffect(() => liftAll, [liftAll]);

  const press = (midi: number, finger: number) => {
    const ctx = clock.get();
    if (!ctx) return;
    held.current.get(finger)?.release();
    held.current.set(finger, { midi, release: sustain(ctx, ctx.destination, midiToHz(midi, a4), 0.8, timbre) });
    clock.busy('keys', true);
    setLit([...held.current.values()].map((h) => h.midi));
    setLast(midi);
  };
  const lift = (finger: number) => {
    const h = held.current.get(finger);
    if (!h) return;
    h.release();
    held.current.delete(finger);
    setLit([...held.current.values()].map((x) => x.midi));
    // Quiet only once the last finger is up: a key held down keeps the clock open.
    if (held.current.size === 0) clock.busy('keys', false);
  };
  // From a keyboard (Enter or Space on a focused key): a short note.
  const tapKey = (midi: number) => {
    const ctx = clock.get();
    if (!ctx) return;
    note(ctx, ctx.destination, midiToHz(midi, a4), ctx.currentTime + 0.01, 0.6, 0.8, timbre);
    setLast(midi);
    clock.idle();
  };

  const base = octaveC(octave);
  const whites = OCTAVE_KEYS.filter((k) => !k.black);
  const whiteIndex = (step: number) => whites.findIndex((k) => k.step === step);

  const keyProps = (midi: number) => ({
    type: 'button' as const,
    'aria-label': midiName(midi),
    'aria-pressed': lit.includes(midi),
    'data-key': midiName(midi),
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not every browser */ }
      press(midi, e.pointerId);
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => lift(e.pointerId),
    onPointerCancel: (e: React.PointerEvent<HTMLButtonElement>) => lift(e.pointerId),
    onLostPointerCapture: (e: React.PointerEvent<HTMLButtonElement>) => lift(e.pointerId),
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapKey(midi); }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  return (
    <Card className="p-5">
      <div data-play-keyboard>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-navy">Keyboard</h2>
            <p className="mt-1 text-sm text-gray-600">Press and hold a key to play it. Several fingers play several notes.</p>
          </div>
          <p className="min-w-16 text-right text-3xl font-extrabold tabular-nums text-navy" aria-live="polite" data-play-last>
            {last !== null ? midiName(last) : ''}
          </p>
        </div>

        <div className="relative mt-4 h-44 touch-none select-none sm:h-52" role="group" aria-label={`Keyboard, from ${midiName(base)}`}>
          <div className="flex h-full gap-1">
            {whites.map((k) => {
              const midi = base + k.step;
              const on = lit.includes(midi);
              return (
                <button
                  key={k.step}
                  {...keyProps(midi)}
                  className={`flex h-full flex-1 items-end justify-center rounded-b-xl pb-2 text-xs font-bold ring-1 ring-[#1e2a4a]/30 ${on ? 'bg-[#0d9488] text-white' : 'bg-[#fdfdfb] text-[#6b7280]'}`}
                >
                  {midiName(midi)}
                </button>
              );
            })}
          </div>
          {OCTAVE_KEYS.filter((k) => k.black).map((k) => {
            const midi = base + k.step;
            const on = lit.includes(midi);
            const left = ((whiteIndex(k.step - 1) + 1) / whites.length) * 100;
            return (
              <button
                key={k.step}
                {...keyProps(midi)}
                className={`absolute top-0 h-[58%] w-[9%] -translate-x-1/2 rounded-b-lg ${on ? 'bg-[#14b8a6]' : 'bg-[#16181d]'}`}
                style={{ left: `${left}%` }}
              />
            );
          })}
        </div>

        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex">
          <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setOctave(clampOctave(octave - 1))} disabled={octave <= OCTAVE_MIN}>
            Lower
          </Button>
          <p className="whitespace-nowrap text-center text-sm font-semibold text-gray-600 sm:min-w-24" data-play-octave>From {midiName(base)}</p>
          <Button variant="ghost" className="w-full sm:w-auto" onClick={() => setOctave(clampOctave(octave + 1))} disabled={octave >= OCTAVE_MAX}>
            Higher
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ---- CHORDS ---------------------------------------------------------------

function Chords({ clock, a4, timbre }: { clock: Clock; a4: number; timbre: Timbre }) {
  const [key, setKey] = useState<SongKey>('C');
  const [last, setLast] = useState('');
  const chords = chordsInKey(key);
  const play = (midis: number[], name: string) => {
    const ctx = clock.get();
    if (!ctx) return;
    const at = ctx.currentTime + 0.02;
    for (const m of midis) note(ctx, ctx.destination, midiToHz(m, a4), at, 1.6, 0.55, timbre);
    setLast(name);
    clock.idle();
  };
  return (
    <Card className="p-5">
      <div data-play-chords>
        <h2 className="text-xl font-bold text-navy">Chords</h2>
        <p className="mt-1 text-sm text-gray-600">
          The six chords most songs in a key are built from. Tap them in time to accompany a tune.
        </p>
        <label htmlFor="play-key" className="mt-3 block text-sm font-bold text-navy">Key</label>
        <select
          id="play-key"
          value={key}
          onChange={(e) => setKey(e.target.value as SongKey)}
          className="tap mt-1 block rounded-xl bg-white px-4 text-base font-semibold text-navy ring-1 ring-navy/20"
        >
          {SONG_KEYS.map((k) => <option key={k.id} value={k.id}>{k.id} major</option>)}
        </select>
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {chords.map((c) => (
            <button
              key={c.roman}
              type="button"
              onClick={() => play(c.midis, c.name)}
              className="tap rounded-2xl bg-white py-3 text-center ring-1 ring-navy/20 hover:bg-sky-50"
              data-chord={c.name}
            >
              <span className="block text-xl font-extrabold text-navy">{c.name}</span>
              <span className="block text-xs text-gray-500">{c.roman}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 min-h-5 text-sm font-semibold text-[color:var(--music-accent)]" aria-live="polite" data-play-chord-now>
          {last ? `Playing ${last}` : ''}
        </p>
      </div>
    </Card>
  );
}

// ---- THE BEAT MAKER -------------------------------------------------------

function copyPattern(p: Pattern): Pattern {
  return { name: p.name, bpm: p.bpm, steps: { kick: [...p.steps.kick], snare: [...p.steps.snare], hat: [...p.steps.hat] } };
}

function BeatMaker({ clock }: { clock: Clock }) {
  const [pattern, setPattern] = useState<Pattern>(() => copyPattern(STARTER_PATTERNS[0]));
  const [saved, setSaved] = useState<Pattern[]>([]);
  const [name, setName] = useState('');
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const live = useRef(pattern);
  live.current = pattern;
  const halt = useRef<(() => void) | null>(null);
  const state = useRef<StepState>({ nextAt: 0, nextStep: 0 });
  const recent = useRef<{ at: number; step: number }[]>([]);
  const ctxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    try { setSaved(cleanPatterns(JSON.parse(localStorage.getItem(PATTERNS_KEY) || '[]'))); } catch { /* none yet */ }
  }, []);

  const stop = useCallback(() => {
    halt.current?.();
    halt.current = null;
    ctxRef.current = null;
    recent.current = [];
    setRunning(false);
    setStep(-1);
    clock.busy('beat', false);
  }, [clock]);
  // The folder's clock closed under it: stop.
  useEffect(() => { stop(); }, [clock.epoch, stop]);
  useEffect(() => () => { halt.current?.(); }, []);

  const start = () => {
    const ctx = clock.get();
    if (!ctx) return;
    ctxRef.current = ctx;
    clock.busy('beat', true);
    state.current = { nextAt: ctx.currentTime + 0.1, nextStep: 0 };
    recent.current = [];
    halt.current = schedule(ctx, (until) => {
      const { steps, state: next } = stepsDue(state.current, live.current.bpm, until);
      state.current = next;
      for (const s of steps) {
        for (const d of DRUMS) {
          // The off-beat hi-hats a little softer, the way a drummer plays them.
          if (live.current.steps[d][s.step]) drum(ctx, ctx.destination, d, s.at, d === 'hat' && s.step % 4 !== 0 ? 0.65 : 1);
        }
      }
      recent.current = [...recent.current, ...steps].slice(-32);
    });
    setRunning(true);
  };

  // The step lit as it sounds, read from the audio clock every frame.
  useEffect(() => {
    if (!running) return;
    let frame = 0;
    let shown = -1;
    const draw = () => {
      const ctx = ctxRef.current;
      if (ctx) {
        let now = -1;
        for (const s of recent.current) if (s.at <= ctx.currentTime) now = s.step;
        if (now !== shown) { shown = now; setStep(now); }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [running]);

  const toggle = (d: (typeof DRUMS)[number], i: number) => {
    setPattern((p) => {
      const next = copyPattern(p);
      next.steps[d][i] = !next.steps[d][i];
      return next;
    });
  };
  const setBpm = (bpm: number) => setPattern((p) => ({ ...copyPattern(p), bpm: clampBeatTempo(bpm) }));
  const keep = (next: Pattern[]) => {
    const clean = cleanPatterns(next);
    setSaved(clean);
    try { localStorage.setItem(PATTERNS_KEY, JSON.stringify(clean)); } catch { /* a convenience only */ }
  };
  const save = () => {
    const clean = cleanName(name);
    if (!clean) return;
    keep([...saved.filter((p) => p.name !== clean), { ...copyPattern(pattern), name: clean }]);
    setName('');
  };
  const choose = (value: string) => {
    if (value === 'empty') { setPattern(emptyPattern()); return; }
    const [kind, index] = value.split(':');
    const from = kind === 'starter' ? STARTER_PATTERNS[Number(index)] : saved[Number(index)];
    if (from) setPattern(copyPattern(from));
  };

  return (
    <Card className="p-5">
      <div data-play-beats>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-navy">Beat maker</h2>
            <p className="mt-1 text-sm text-gray-600">Tap the squares to make a beat. Each row is a drum; each square is a quarter of a beat.</p>
          </div>
          {running
            ? <Button variant="ghost" onClick={stop}>■ Stop the beat</Button>
            : <Button onClick={start}>▶ Play the beat</Button>}
        </div>

        <div className="mt-4 space-y-3">
          {DRUMS.map((d) => (
            <div key={d}>
              <p className="text-sm font-bold text-navy">{DRUM_NAME[d]}</p>
              <div className="mt-1 grid grid-cols-8 gap-1 sm:[grid-template-columns:repeat(16,minmax(0,1fr))]" role="group" aria-label={DRUM_NAME[d]}>
                {Array.from({ length: STEPS }, (_, i) => {
                  const on = pattern.steps[d][i];
                  const now = step === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggle(d, i)}
                      aria-pressed={on}
                      aria-label={`${DRUM_NAME[d]}, step ${i + 1}`}
                      className={`h-9 rounded-lg ring-1 ${on ? 'bg-navy ring-navy' : i % 4 === 0 ? 'bg-gray-100 ring-navy/20' : 'bg-white ring-navy/20'} ${now ? 'outline outline-2 outline-[color:var(--music-accent)]' : ''}`}
                      data-step={i}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div>
            <p className="text-sm font-bold text-navy">Tempo, beats a minute</p>
            <div className="mt-1 flex items-center gap-2">
              <Button variant="ghost" className="px-4" onClick={() => setBpm(pattern.bpm - 5)} disabled={pattern.bpm <= BEAT_TEMPO_MIN}>− 5</Button>
              <p className="min-w-12 text-center text-lg font-bold tabular-nums text-navy" data-play-tempo>{pattern.bpm}</p>
              <Button variant="ghost" className="px-4" onClick={() => setBpm(pattern.bpm + 5)} disabled={pattern.bpm >= BEAT_TEMPO_MAX}>+ 5</Button>
            </div>
          </div>
          <label className="block">
            <span className="text-sm font-bold text-navy">Start from</span>
            <select
              id="play-pattern"
              value=""
              onChange={(e) => choose(e.target.value)}
              className="tap mt-1 block rounded-xl bg-white px-4 text-base font-semibold text-navy ring-1 ring-navy/20"
            >
              <option value="" disabled>Choose a beat</option>
              {STARTER_PATTERNS.map((p, i) => <option key={p.name} value={`starter:${i}`}>{p.name}</option>)}
              {saved.map((p, i) => <option key={`s${p.name}`} value={`saved:${i}`}>{p.name} (yours)</option>)}
              <option value="empty">Empty grid</option>
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-2 sm:flex sm:items-center">
          <label htmlFor="play-pattern-name" className="sr-only">Name for this beat</label>
          <input
            id="play-pattern-name"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
            placeholder="A name for this beat"
            className="tap w-full rounded-xl sm:min-w-0 sm:flex-1 bg-white px-4 text-base text-navy ring-1 ring-navy/20"
          />
          <Button onClick={save} disabled={!cleanName(name)}>Save this beat</Button>
        </div>
        {saved.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {saved.map((p) => (
              <li key={p.name} className="flex items-center gap-1 rounded-xl bg-gray-50 py-1 pl-3 pr-1 ring-1 ring-navy/10">
                <span className="text-sm font-semibold text-navy">{p.name}</span>
                <button
                  type="button"
                  onClick={() => keep(saved.filter((x) => x.name !== p.name))}
                  className="tap-sm rounded-lg px-2 text-gray-500 hover:bg-white"
                  aria-label={`Remove ${p.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-gray-500">Saved beats stay on this phone.</p>
      </div>
    </Card>
  );
}
