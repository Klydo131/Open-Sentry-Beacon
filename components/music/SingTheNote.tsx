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
// EVERY DEVICE (15 October 2026: "Not just on phone but on desktop too ... make
// it more convenient to ALL devices"). The card measures its own width: a
// phone shows one octave and the grade under the ring; a tablet or a computer
// shows two octaves and the grade beside it, so nothing needs scrolling to.
// On a computer a note can be typed (lib/music/computer-keys.ts: A S D F G H J
// K for the white keys, Z and X for the octave), and the letters are shown on
// the keys wherever there is a mouse to point with.
//
// THE APP'S OWN SOUND IS NEVER JUDGED. The speaker button plays the note, which
// the microphone hears. While it plays, and for a moment after, the judge is
// told to start again, so a note cannot be passed by the phone singing it to
// itself. The drone is stopped for the same reason.

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Card } from '@/components/ui';
import type { Tuner } from '@/lib/music/tuner';
import { midiName, midiToHz } from '@/lib/music/notes';
import { closeAudio, note, openAudio } from '@/lib/music/audio';
import { prefersLessMotion } from '@/lib/motion';
import {
  CLOSE_CENTS, NoteJudge, PERFECT_CENTS, gradeHint, gradeOf, type Grade, type Judging, type Verdict,
} from '@/lib/music/sing-the-note';
import { keyLetter, noteKey, octaveKey, playable } from '@/lib/music/computer-keys';

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
/**
 * A card at least this wide shows two octaves, and the grade beside the ring:
 * keys about 36px wide, plenty for a mouse. 540 until 15 October 2026, when a
 * 1280px window with the Music room's full width measured 533 and showed one.
 */
const WIDE_PX = 500;
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
  const [octave, setOctaveState] = useState(4);
  const card = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  const octaves = wide ? 2 : 1;
  /** The octave the keyboard starts from: a second octave shown must still be one a voice sings. */
  const fit = useCallback((o: number) => Math.max(LOWEST_OCTAVE, Math.min(HIGHEST_OCTAVE - (octaves - 1), o)), [octaves]);
  const setOctave = useCallback((next: number | ((o: number) => number)) => {
    setOctaveState((o) => fit(typeof next === 'function' ? next(o) : next));
  }, [fit]);
  useEffect(() => { setOctaveState((o) => fit(o)); }, [fit]);
  // The card's own width, not the window's: the same card sits in a phone's
  // single column and beside the dial on a computer. Measured once before the
  // first paint too, or a computer saw one octave, then two, a moment later.
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    setWide(el.clientWidth >= WIDE_PX);
    if (typeof ResizeObserver === 'undefined') return;
    const watch = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= WIDE_PX));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
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
  const now = useRef({ a4, target, octave, octaves });
  now.current = { a4, target, octave, octaves };
  const { onReading, start: listen, stop: stopListening, status } = tuner;
  const judge = useRef<NoteJudge | null>(null);
  const quietUntil = useRef(0);
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
    judge.current = new NoteJudge(midi, a4, CLOSE_CENTS);
    if (status !== 'listening') { openedMic.current = true; await listen(); }
  };

  // On a computer, a note can be typed: the row A S D F G H J K is the white
  // keys from the C shown, the row above the black ones, Z and X the octave.
  const chooseNow = useRef(choose);
  chooseNow.current = choose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!playable(e)) return;
      const shift = octaveKey(e.code);
      if (shift) { e.preventDefault(); setOctave((o) => o + shift); return; }
      const step = noteKey(e.code);
      if (step === null || step >= 12 * now.current.octaves) return;
      e.preventDefault();
      void chooseNow.current(12 * (now.current.octave + 1) + step);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOctave]);

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
  // the voice has left the note just graded (a breath, or another note). The
  // judge hears the readings while the grade shows too, or a breath taken
  // then would be missed (lib/music/sing-the-note.ts, `rest`).
  useEffect(() => {
    if (target === null) return;
    return onReading((raw, t) => {
      const j = judge.current;
      if (!j) return;
      if (t < quietUntil.current) { j.restart(); return; }
      const said = j.push(raw, t);
      if (said.state === 'judged') {
        setShown(said.verdict);
        setLive({ state: 'waiting' });
        judge.current = new NoteJudge(j.target, now.current.a4, CLOSE_CENTS, said.verdict.sung, { from: t, until: t + GRADE_MS });
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
      <div ref={card} data-sing data-sing-octaves={octaves}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="whitespace-nowrap text-xl font-bold text-navy">Sing the note</h2>
          <div className="flex shrink-0 items-center" data-sing-octave>
            <span className="key-hint mr-1" aria-hidden="true">Z</span>
            <button
              type="button"
              onClick={() => setOctave((o) => o - 1)}
              disabled={octave <= LOWEST_OCTAVE}
              aria-label="Lower octave"
              aria-keyshortcuts="Z"
              className="tap grid h-10 w-10 place-items-center rounded-full text-2xl font-bold text-navy hover:bg-navy/5 disabled:opacity-30"
            >
              ‹
            </button>
            <span className="text-center text-sm font-semibold tabular-nums text-gray-600" data-sing-octave-label>
              {octaves === 2 ? `Octaves ${octave} and ${octave + 1}` : `Octave ${octave}`}
            </span>
            <button
              type="button"
              onClick={() => setOctave((o) => o + 1)}
              disabled={octave >= HIGHEST_OCTAVE - (octaves - 1)}
              aria-label="Higher octave"
              aria-keyshortcuts="X"
              className="tap grid h-10 w-10 place-items-center rounded-full text-2xl font-bold text-navy hover:bg-navy/5 disabled:opacity-30"
            >
              ›
            </button>
            <span className="key-hint ml-1" aria-hidden="true">X</span>
          </div>
        </div>

        <Piano octave={octave} octaves={octaves} chosen={target} onPick={(m) => void choose(m)} />

        <div
          className={`mt-6 flex items-center text-center ${wide ? 'flex-row justify-center gap-10' : 'flex-col'}`}
          data-sing-now
        >
          <div className="relative shrink-0">
            <Ring progress={shown ? 1 : holding ? (live as { progress: number }).progress : 0} grade={grade}>
              <span className={`font-extrabold tabular-nums text-navy ${target ? 'text-4xl' : 'text-3xl opacity-40'}`} data-sing-target>
                {target ? midiName(target) : '♪'}
              </span>
            </Ring>
            {grade === 'perfect' && <Burst key={shown?.sung} />}
          </div>
          <div className={`flex flex-col items-center ${wide ? 'min-w-[15rem]' : ''}`}>
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
      </div>
    </Card>
  );
}

/**
 * A piano, C to B, one octave or two. White keys take the width; the black
 * keys sit between them, as on a piano. Drawn in a piano's own colours in
 * every look (sing-piano in app/globals.css), so it always reads as a
 * keyboard. Where there is a mouse, each key shows the letter that plays it.
 */
function Piano({ octave, octaves, chosen, onPick }: { octave: number; octaves: number; chosen: number | null; onPick: (midi: number) => void }) {
  const c = 12 * (octave + 1);
  const whites = Array.from({ length: octaves }, (_, o) => WHITE.map((step) => o * 12 + step)).flat();
  const blacks = Array.from({ length: octaves }, (_, o) => BLACK.map(({ step, after }) => ({ step: o * 12 + step, after: o * 7 + after }))).flat();
  const width = 100 / whites.length;
  return (
    <div className="sing-piano relative mt-4 h-40 select-none sm:h-44" role="group" aria-label={`Notes, from ${midiName(c)}`} data-sing-keys>
      <div className="flex h-full gap-[3px]">
        {whites.map((step) => {
          const midi = c + step;
          return (
            <button
              key={midi}
              type="button"
              onClick={() => onPick(midi)}
              aria-label={midiName(midi)}
              aria-pressed={chosen === midi}
              className="sing-key sing-key-white relative flex flex-1 items-end justify-center pb-2 text-sm font-bold"
            >
              <span className="key-hint" aria-hidden="true">{keyLetter(step)}</span>
              <span aria-hidden="true">{step % 12 === 0 ? midiName(midi) : midiName(midi).replace(/\d+$/, '')}</span>
            </button>
          );
        })}
      </div>
      {blacks.map(({ step, after }) => {
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
          >
            <span className="key-hint key-hint-on-black" aria-hidden="true">{keyLetter(step)}</span>
          </button>
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
