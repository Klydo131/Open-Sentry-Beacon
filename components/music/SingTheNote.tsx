'use client';

// Sing the note: the Tuner's practice, in its Advanced settings. Tap a key,
// sing that note and hold it, and the card says Perfect, Close, or Try again.
// A perfect note is rewarded: perfect pitch.
//
// Asked for on 14 October 2026, and made this simple on 15 October 2026: "just
// tap or click a note and I will just sing ... and it will detect if I hit a
// perfect note or close enough, that's all ... Let the design speak for
// itself." So: a keyboard, a ring that fills while the note is held, a marker
// that shows how near the voice is, and one word. No settings. The owner's
// words and how a note is graded are at the top of lib/music/sing-the-note.ts.
//
// The microphone is the Tuner's own, opened by the first key tapped and let go
// the same way; what it hears is measured on the phone and thrown away. The
// octave shown is remembered on the phone, as a convenience, and nothing else.
//
// THE APP'S OWN SOUND IS NEVER JUDGED. The speaker button plays the note, which
// the microphone hears. While it plays, and for a moment after, the judge is
// told to start again, so a note cannot be passed by the phone singing it to
// itself. The drone is stopped for the same reason.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui';
import type { Tuner } from '@/lib/music/tuner';
import { midiName, midiToHz } from '@/lib/music/notes';
import { closeAudio, note, openAudio } from '@/lib/music/audio';
import { prefersLessMotion } from '@/lib/motion';
import {
  CLOSE_CENTS, NoteJudge, PERFECT_CENTS, gradeHint, gradeOf, type Grade, type Judging, type Verdict,
} from '@/lib/music/sing-the-note';

/** The octave shown, remembered on this phone. */
const KEY = 'beacon:music-sing';
/** The octaves a voice sings in: a bass's low E to a soprano's top C sit in these. */
const LOWEST_OCTAVE = 2;
const HIGHEST_OCTAVE = 5;
/** The note the speaker plays, and how long after it the judge waits for the room to go quiet. */
const HEAR_SECONDS = 1;
const ECHO_MS = 350;
/** How long a grade stays before the next try is listened for. */
const GRADE_MS = 1400;
/** Told to the drone, so it stops when a practice starts. */
export const QUIET_EVENT = 'beacon:music-quiet';

/** A piano's octave: the seven white keys, and the five black ones between them. */
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK = [
  { step: 1, after: 0 }, { step: 3, after: 1 }, { step: 6, after: 3 }, { step: 8, after: 4 }, { step: 10, after: 5 },
];

function readOctave(): number | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) || 'null') as { octave?: unknown } | null;
    const o = kept && typeof kept === 'object' ? kept.octave : null;
    return Number.isInteger(o) && (o as number) >= LOWEST_OCTAVE && (o as number) <= HIGHEST_OCTAVE ? (o as number) : null;
  } catch {
    return null;
  }
}

export function SingTheNote({ tuner, a4 }: { tuner: Tuner; a4: number }) {
  const [octave, setOctave] = useState(4);
  const [target, setTarget] = useState<number | null>(null);
  const [live, setLive] = useState<Judging>({ state: 'waiting' });
  const [shown, setShown] = useState<Verdict | null>(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    const kept = readOctave();
    if (kept !== null) setOctave(kept);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ octave })); } catch { /* a convenience only */ }
  }, [octave]);

  // The settings as they are now, for the callbacks a microphone frame and a
  // timer run long after the render that made them.
  const now = useRef({ a4, target });
  now.current = { a4, target };
  const { onReading, start: listen, stop: stopListening, status } = tuner;
  const judge = useRef<NoteJudge | null>(null);
  const quietUntil = useRef(0);
  const restUntil = useRef(0);
  const openedMic = useRef(false);
  const shownAt = useRef(0);
  const sound = useRef<AudioContext | null>(null);
  const soundTimer = useRef(0);

  const hush = useCallback(() => {
    window.clearTimeout(soundTimer.current);
    closeAudio(sound.current);
    sound.current = null;
  }, []);

  /** Play a note through the speaker; the judge does not listen while it sounds. */
  const play = useCallback((midi: number) => {
    hush();
    const audio = openAudio();
    if (!audio) return;
    sound.current = audio;
    note(audio, audio.destination, midiToHz(midi, now.current.a4), audio.currentTime + 0.05, HEAR_SECONDS, 1);
    quietUntil.current = performance.now() + (HEAR_SECONDS + 0.05) * 1000 + ECHO_MS;
    judge.current?.restart();
    soundTimer.current = window.setTimeout(hush, (HEAR_SECONDS + 0.3) * 1000);
  }, [hush]);

  /** A key tapped: that note is the one to sing, from now. */
  const choose = async (midi: number) => {
    window.dispatchEvent(new Event(QUIET_EVENT));
    setProblem('');
    setTarget(midi);
    setShown(null);
    setLive({ state: 'waiting' });
    restUntil.current = 0;
    judge.current = new NoteJudge(midi, a4, CLOSE_CENTS);
    if (status !== 'listening') { openedMic.current = true; await listen(); }
  };

  const stop = useCallback(() => {
    judge.current = null;
    hush();
    setTarget(null);
    setShown(null);
    setLive({ state: 'waiting' });
    if (openedMic.current) { openedMic.current = false; stopListening(); }
  }, [hush, stopListening]);

  // Every reading, sixty a second, to the judge of the note chosen. After a
  // grade, the next try is listened for once it has been seen, and only once
  // the voice has left the note just graded (a breath, or another note).
  useEffect(() => {
    if (target === null) return;
    return onReading((raw, t) => {
      const j = judge.current;
      if (!j || t < restUntil.current) return;
      if (t < quietUntil.current) { j.restart(); return; }
      const said = j.push(raw, t);
      if (said.state === 'judged') {
        setShown(said.verdict);
        setLive({ state: 'waiting' });
        restUntil.current = t + GRADE_MS;
        judge.current = new NoteJudge(j.target, now.current.a4, CLOSE_CENTS, said.verdict.sung);
        return;
      }
      // The screen is told at most twenty times a second.
      if (t - shownAt.current < 50) return;
      shownAt.current = t;
      if (said.state === 'holding') setShown(null);
      setLive(said);
    });
  }, [target, onReading]);

  // The microphone refused, or let go (the Tuner's own button, the folder
  // left, the phone locked): the practice rests until a key is tapped again.
  const was = useRef(status);
  useEffect(() => {
    const before = was.current;
    was.current = status;
    if (target === null) return;
    if (status === 'denied' || status === 'unavailable') {
      openedMic.current = false;
      stop();
      setProblem('The microphone is not allowed here. Allow it for this site, then tap a note again.');
    } else if (before === 'listening' && status === 'off') {
      openedMic.current = false;
      stop();
    }
  }, [status, target, stop]);
  useEffect(() => () => hush(), [hush]);

  const grade: Grade | null = shown ? gradeOf(shown) : null;
  const hint = shown ? gradeHint(shown) : null;
  const holding = live.state === 'holding' && target !== null;
  const off = holding ? Math.round((live.sung - (target as number)) * 100) : null;
  const word = !target ? 'Tap a note'
    : grade === 'perfect' ? 'Perfect'
    : grade === 'close' ? 'Close'
    : grade === 'off' ? 'Try again'
    : holding ? 'Hold it'
    : 'Sing it';

  return (
    <Card className="p-5">
      <div data-sing>
        <div className="flex items-center justify-between gap-3">
          <h2 className="whitespace-nowrap text-xl font-bold text-navy">Sing the note</h2>
          <div className="flex shrink-0 items-center" data-sing-octave>
            <button
              type="button"
              onClick={() => setOctave((o) => Math.max(LOWEST_OCTAVE, o - 1))}
              disabled={octave <= LOWEST_OCTAVE}
              aria-label="Lower octave"
              className="tap grid h-10 w-10 place-items-center rounded-full text-2xl font-bold text-navy disabled:opacity-30"
            >
              ‹
            </button>
            <span className="text-center text-sm font-semibold tabular-nums text-gray-600">Octave {octave}</span>
            <button
              type="button"
              onClick={() => setOctave((o) => Math.min(HIGHEST_OCTAVE, o + 1))}
              disabled={octave >= HIGHEST_OCTAVE}
              aria-label="Higher octave"
              className="tap grid h-10 w-10 place-items-center rounded-full text-2xl font-bold text-navy disabled:opacity-30"
            >
              ›
            </button>
          </div>
        </div>

        <Piano octave={octave} chosen={target} onPick={(m) => void choose(m)} />

        <div className="mt-6 flex flex-col items-center text-center" data-sing-now>
          <div className="relative">
            <Ring progress={shown ? 1 : holding ? (live as { progress: number }).progress : 0} grade={grade}>
              <span className={`font-extrabold tabular-nums text-navy ${target ? 'text-4xl' : 'text-3xl opacity-40'}`} data-sing-target>
                {target ? midiName(target) : '♪'}
              </span>
            </Ring>
            {grade === 'perfect' && <Burst key={shown?.sung} />}
          </div>
          {target !== null && <Nearness cents={shown ? shown.cents : off} />}
          <div role="status" aria-live="polite" className="mt-3 min-h-[4.25rem]" data-sing-live>
            <p
              className={`text-3xl font-extrabold ${grade === 'perfect' || grade === 'close' ? 'text-[color:var(--music-accent)]' : 'text-navy'}`}
              data-sing-verdict={grade ?? (target ? 'listening' : 'idle')}
            >
              {word}
            </p>
            {hint && (
              <p className="mt-1 text-base font-semibold text-gray-600" data-sing-hint>
                {hint.words}{hint.go === 'up' ? ' ↑' : hint.go === 'down' ? ' ↓' : ''}
              </p>
            )}
            {grade === 'perfect' && <p className="sr-only">Perfect pitch!</p>}
          </div>
          {target !== null && (
            <div className="mt-2 flex items-center gap-3">
              <button
                type="button"
                onClick={() => play(target)}
                aria-label={`Hear ${midiName(target)}`}
                className="tap grid h-12 w-12 place-items-center rounded-full bg-gray-50 text-navy ring-1 ring-navy/15"
              >
                <SpeakerIcon />
              </button>
              <button
                type="button"
                onClick={stop}
                aria-label="Stop"
                className="tap grid h-12 w-12 place-items-center rounded-full bg-gray-50 text-navy ring-1 ring-navy/15"
              >
                <span aria-hidden="true" className="block h-3.5 w-3.5 rounded-sm bg-current" />
              </button>
            </div>
          )}
          {problem && <p role="alert" className="mt-3 text-sm text-navy">{problem}</p>}
        </div>
      </div>
    </Card>
  );
}

/**
 * One octave of a piano, C to B. White keys take the width; the black keys sit
 * between them, as on a piano. Drawn in a piano's own colours in every look
 * (sing-piano in app/globals.css), so it always reads as a keyboard.
 */
function Piano({ octave, chosen, onPick }: { octave: number; chosen: number | null; onPick: (midi: number) => void }) {
  const c = 12 * (octave + 1);
  const width = 100 / WHITE.length;
  return (
    <div className="sing-piano relative mt-4 h-40 select-none" role="group" aria-label={`Notes, octave ${octave}`} data-sing-keys>
      <div className="flex h-full gap-[3px]">
        {WHITE.map((step) => {
          const midi = c + step;
          return (
            <button
              key={midi}
              type="button"
              onClick={() => onPick(midi)}
              aria-label={midiName(midi)}
              aria-pressed={chosen === midi}
              className="sing-key sing-key-white flex flex-1 items-end justify-center pb-2 text-sm font-bold"
            >
              <span aria-hidden="true">{step === 0 ? midiName(midi) : midiName(midi).replace(/\d+$/, '')}</span>
            </button>
          );
        })}
      </div>
      {BLACK.map(({ step, after }) => {
        const midi = c + step;
        return (
          <button
            key={midi}
            type="button"
            onClick={() => onPick(midi)}
            aria-label={midiName(midi)}
            aria-pressed={chosen === midi}
            className="sing-key sing-key-black absolute top-0 h-[60%]"
            style={{ left: `calc(${(after + 1) * width}% - ${width * 0.3}%)`, width: `${width * 0.6}%` }}
          />
        );
      })}
    </div>
  );
}

/** The note, inside a ring that fills while it is held. */
function Ring({ progress, grade, children }: { progress: number; grade: Grade | null; children: ReactNode }) {
  const r = 44;
  const around = 2 * Math.PI * r;
  const miss = grade === 'off';
  return (
    <div className="relative grid h-32 w-32 place-items-center text-navy" data-sing-ring>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="7" />
        <circle
          cx="50" cy="50" r={r} fill="none" strokeWidth="7" strokeLinecap="round"
          stroke={miss ? 'currentColor' : 'var(--music-accent)'}
          strokeOpacity={miss ? 0.4 : 1}
          strokeDasharray={around}
          strokeDashoffset={around * (1 - Math.max(0, Math.min(1, progress)))}
          className="sing-ring-fill"
        />
      </svg>
      <div className="relative">{children}</div>
    </div>
  );
}

/**
 * How near the voice is to the note: a marker on a short line, flat to the
 * left and sharp to the right, with the perfect band in the middle and the
 * close band either side. Shown while a note is held, and for its grade.
 */
function Nearness({ cents }: { cents: number | null }) {
  const at = (c: number) => 50 + Math.max(-50, Math.min(50, c));
  const perfect = cents !== null && Math.abs(cents) <= PERFECT_CENTS;
  return (
    <div aria-hidden="true" className="relative mt-4 h-6 w-56 text-navy" data-sing-meter>
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-current opacity-15" />
      <div
        className="absolute top-1/2 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-25"
        style={{ left: '50%', width: `${CLOSE_CENTS * 2}%`, background: 'var(--music-accent)' }}
      />
      <div
        className="absolute top-1/2 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60"
        style={{ left: '50%', width: `${PERFECT_CENTS * 2}%`, background: 'var(--music-accent)' }}
      />
      <span className="absolute -left-5 top-1/2 -translate-y-1/2 text-sm font-bold opacity-50">♭</span>
      <span className="absolute -right-5 top-1/2 -translate-y-1/2 text-sm font-bold opacity-50">♯</span>
      {cents !== null && (
        <div
          className={`absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white/80 transition-[left] duration-100 motion-reduce:transition-none ${perfect ? 'bg-[color:var(--music-accent)]' : 'bg-current'}`}
          style={{ left: `${at(cents)}%` }}
          data-sing-marker
        />
      )}
    </div>
  );
}

/** Perfect pitch: a burst of notes around the ring, and a glow. None under Reduce Motion. */
function Burst() {
  const [still] = useState(() => prefersLessMotion());
  if (still) return <div aria-hidden="true" className="perfect-pitch-glow pointer-events-none absolute inset-0 rounded-full" data-perfect-pitch />;
  const sparks = ['♪', '♫', '♩', '♬', '♪', '♫', '♩', '♬'];
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0" data-perfect-pitch>
      <div className="perfect-pitch-glow absolute inset-0 rounded-full" />
      {sparks.map((s, i) => (
        <span key={i} className="perfect-pitch-spark" style={{ ['--i' as string]: i, ['--a' as string]: `${i * 45}deg` }}>{s}</span>
      ))}
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" stroke="none" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </svg>
  );
}
