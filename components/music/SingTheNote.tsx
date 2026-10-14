'use client';

// Sing the note: the Tuner's practice, in its Advanced settings. Choose a note,
// or a run of five to ten, sing each one and hold it, and the tuner says
// whether you hit it. Every note hit is perfect pitch, and it says so.
//
// Asked for on 14 October 2026 (the owner's words are at the top of
// lib/music/sing-the-note.ts, which judges each note). The microphone is the
// Tuner's own, opened and let go the same way; what it hears is measured on
// the phone and thrown away. Nothing about a practice leaves the phone: the
// notes chosen are remembered on it, as a convenience, and nothing else is.
//
// THE APP'S OWN SOUND IS NEVER JUDGED. Hear it plays the note through the
// phone's speaker, which the microphone hears. While it plays, and for a
// moment after, the judge is told to start again, so a note cannot be passed
// by the phone singing it to itself. The drone is stopped for the same reason.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Card } from '@/components/ui';
import type { Tuner } from '@/lib/music/tuner';
import { midiName, midiToHz } from '@/lib/music/notes';
import { closeAudio, note, openAudio } from '@/lib/music/audio';
import { prefersLessMotion } from '@/lib/motion';
import {
  MOST_NOTES, NoteJudge, RUN_NOTES, TOLERANCES, VOICE_PARTS, centsFor, partFor, pickNotes, verdictWords,
  type Judging, type Tolerance, type Verdict, type VoicePart,
} from '@/lib/music/sing-the-note';

/** The notes, voice part, strictness and Hear-first choice, remembered on this phone. */
const KEY = 'beacon:music-sing';
/** The note played by Hear it, and how long after it the judge waits for the room to go quiet. */
const HEAR_SECONDS = 1;
const ECHO_MS = 350;
/** How long each verdict stays before the next note. */
const VERDICT_MS = 900;
/** Told to the drone, so it stops when a practice starts. */
export const QUIET_EVENT = 'beacon:music-quiet';

type Mode = 'one' | 'run';
interface Kept { mode: Mode; single: number; notes: number[]; part: VoicePart; tolerance: Tolerance; hearFirst: boolean }
const singable = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 28 && (n as number) <= 96;

function readKept(): Kept | null {
  try {
    const kept = JSON.parse(localStorage.getItem(KEY) || 'null') as Partial<Kept> | null;
    if (!kept || typeof kept !== 'object') return null;
    const notes = Array.isArray(kept.notes) ? kept.notes.filter(singable).slice(0, MOST_NOTES) : [];
    return {
      mode: kept.mode === 'one' ? 'one' : 'run',
      single: singable(kept.single) ? kept.single : 60,
      notes,
      part: VOICE_PARTS.some((p) => p.id === kept.part) ? (kept.part as VoicePart) : 'any',
      tolerance: TOLERANCES.some((t) => t.id === kept.tolerance) ? (kept.tolerance as Tolerance) : 'choir',
      hearFirst: kept.hearFirst === true,
    };
  } catch {
    return null;
  }
}

type Result = Verdict | { target: number; skipped: true };
const skipped = (r: Result): r is { target: number; skipped: true } => 'skipped' in r;

export function SingTheNote({ tuner, a4 }: { tuner: Tuner; a4: number }) {
  // One note, or a run of five to ten: the two ways the owner asked for.
  const [mode, setMode] = useState<Mode>('run');
  const [single, setSingle] = useState(60);
  const [run, setRun] = useState<number[]>([60, 62, 64, 65, 67]);
  const notes = mode === 'one' ? [single] : run;
  const [part, setPart] = useState<VoicePart>('any');
  const [tolerance, setTolerance] = useState<Tolerance>('choir');
  const [hearFirst, setHearFirst] = useState(false);
  const [adding, setAdding] = useState(60);
  const [count, setCount] = useState(RUN_NOTES);

  const [phase, setPhase] = useState<'setup' | 'singing' | 'done'>('setup');
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [live, setLive] = useState<Judging>({ state: 'waiting' });
  const [shown, setShown] = useState<Verdict | null>(null);
  const [heardFirst, setHeardFirst] = useState(0);
  const [stopped, setStopped] = useState('');

  // Remembered choices, read after mount (no storage on the server).
  useEffect(() => {
    const kept = readKept();
    if (!kept) return;
    setMode(kept.mode);
    setSingle(kept.single);
    if (kept.notes.length) setRun(kept.notes);
    setPart(kept.part);
    setTolerance(kept.tolerance);
    setHearFirst(kept.hearFirst);
  }, []);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify({ mode, single, notes: run, part, tolerance, hearFirst })); } catch { /* a convenience only */ }
  }, [mode, single, run, part, tolerance, hearFirst]);

  const range = partFor(part);
  const choices = Array.from({ length: range.high - range.low + 1 }, (_, i) => range.low + i);
  // A voice part chosen keeps every note offered inside it.
  useEffect(() => {
    if (adding < range.low || adding > range.high) setAdding(Math.round((range.low + range.high) / 2));
    if (single < range.low || single > range.high) setSingle(Math.round((range.low + range.high) / 2));
  }, [range.low, range.high, adding, single]);
  const ready = mode === 'one' || run.length >= RUN_NOTES;

  // ---- The practice ---------------------------------------------------------
  // The settings as they are now, for the callbacks a microphone frame and a
  // timer run long after the render that made them.
  const now = useRef({ notes, a4, tolerance, hearFirst });
  now.current = { notes, a4, tolerance, hearFirst };
  const { onReading, start: listen, stop: stopListening, status } = tuner;
  const judge = useRef<NoteJudge | null>(null);
  const at = useRef(0);
  const quietUntil = useRef(0);
  const openedMic = useRef(false);
  const timer = useRef(0);
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

  const finish = useCallback((why = '') => {
    window.clearTimeout(timer.current);
    judge.current = null;
    hush();
    if (openedMic.current) { openedMic.current = false; stopListening(); }
    setStopped(why);
  }, [hush, stopListening]);

  /** The note at `i` is the one being sung now. */
  const begin = useCallback((i: number, after: number | null) => {
    const { notes: list, a4: pitch, tolerance: how, hearFirst: hear } = now.current;
    at.current = i;
    judge.current = new NoteJudge(list[i], pitch, centsFor(how), after);
    setIndex(i);
    setShown(null);
    setLive({ state: 'waiting' });
    if (hear) { play(list[i]); setHeardFirst((n) => n + 1); }
  }, [play]);

  const start = async () => {
    if (!ready) return;
    window.dispatchEvent(new Event(QUIET_EVENT));
    setStopped('');
    setResults([]);
    setHeardFirst(0);
    setPhase('singing');
    if (status !== 'listening') { openedMic.current = true; await listen(); }
    begin(0, null);
  };

  /** A note is judged (or skipped): show it for a moment, then the next one. */
  const record = useCallback((r: Result) => {
    judge.current = null;
    setResults((all) => [...all, r]);
    if (!skipped(r)) setShown(r);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const next = at.current + 1;
      if (next >= now.current.notes.length) {
        setPhase('done');
        finish();
      } else {
        begin(next, skipped(r) ? null : r.sung);
      }
    }, skipped(r) ? 0 : VERDICT_MS);
  }, [begin, finish]);

  // Every reading, sixty a second, to the judge of the note being sung.
  useEffect(() => {
    if (phase !== 'singing') return;
    return onReading((raw, t) => {
      const j = judge.current;
      if (!j) return;
      if (t < quietUntil.current) { j.restart(); return; }
      const said = j.push(raw, t);
      if (said.state === 'judged') { record(said.verdict); return; }
      // The screen is told at most twenty times a second.
      if (t - shownAt.current < 50) return;
      shownAt.current = t;
      setLive(said);
    });
  }, [phase, onReading, record]);

  // The microphone refused, or let go (Stop listening, the folder left, the
  // phone locked): the practice stops, and says why.
  const was = useRef(status);
  useEffect(() => {
    const before = was.current;
    was.current = status;
    if (phase !== 'singing') return;
    if (status === 'denied' || status === 'unavailable') {
      setPhase('setup');
      openedMic.current = false;
      finish('The microphone is not available here, so nothing can be heard. Allow it for this site, then try again.');
    } else if (before === 'listening' && status === 'off') {
      setPhase('setup');
      openedMic.current = false;
      finish('Stopped: the microphone was let go.');
    }
  }, [status, phase, finish]);
  useEffect(() => () => { window.clearTimeout(timer.current); hush(); }, [hush]);

  const stop = () => { setPhase('setup'); finish(); };
  const skip = () => { if (judge.current) record({ target: judge.current.target, skipped: true }); };

  // ---- What is shown --------------------------------------------------------
  const hits = results.filter((r) => !skipped(r) && r.hit).length;
  const perfect = phase === 'done' && results.length === notes.length && hits === notes.length;
  const target = notes[index];

  return (
    <Card className="p-5">
      <div data-sing>
        <h2 className="text-xl font-bold text-navy">Sing the note</h2>
        <p className="mt-1 text-sm text-gray-600">
          Choose a note, sing it and hold it. The tuner tells you if you hit it, in the right octave. Hit every one:
          perfect pitch.
        </p>

        {phase === 'setup' && (
          <div className="mt-4 space-y-5" data-sing-setup>
            {/* One note, or a run: the first choice, and the only one needed. */}
            <div role="radiogroup" aria-label="What to sing" className="grid grid-cols-2 gap-1 rounded-2xl bg-gray-50 p-1 ring-1 ring-navy/10" data-sing-mode>
              {([['one', 'One note', 'One note'], ['run', '5–10 notes', '5 to 10 notes']] as const).map(([id, label, said]) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={mode === id}
                  aria-label={said}
                  onClick={() => setMode(id)}
                  className={`tap whitespace-nowrap rounded-xl px-3 text-base font-bold transition-colors ${mode === id ? 'bg-navy text-white shadow-sm' : 'text-navy'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {mode === 'one' ? (
              <div className="text-center" data-sing-one>
                <div className="flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setSingle((n) => Math.max(range.low, n - 1))}
                    disabled={single <= range.low}
                    aria-label="A semitone lower"
                    className="tap grid h-12 w-12 place-items-center rounded-full bg-white text-2xl font-bold text-navy ring-1 ring-navy/20 disabled:opacity-40"
                  >
                    −
                  </button>
                  <p className="grid h-28 w-28 place-items-center rounded-full bg-gray-50 ring-2 ring-[color:var(--music-accent)]" aria-live="polite">
                    <span className="text-4xl font-extrabold tabular-nums text-navy" data-sing-single>{midiName(single)}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setSingle((n) => Math.min(range.high, n + 1))}
                    disabled={single >= range.high}
                    aria-label="A semitone higher"
                    className="tap grid h-12 w-12 place-items-center rounded-full bg-white text-2xl font-bold text-navy ring-1 ring-navy/20 disabled:opacity-40"
                  >
                    +
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <Button variant="ghost" onClick={() => play(single)}>🔔 Hear {midiName(single)}</Button>
                  <Button variant="ghost" onClick={() => setSingle(pickNotes(1, part)[0])}>🎲 Surprise me</Button>
                </div>
              </div>
            ) : (
              <div data-sing-run>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-navy" id="sing-notes-label">
                    Your notes <span className="font-normal text-gray-500">({run.length} of {MOST_NOTES})</span>
                  </p>
                  {run.length > 0 && (
                    <button type="button" onClick={() => setRun([])} className="tap rounded-xl px-3 text-sm font-semibold text-navy underline underline-offset-2">
                      Clear
                    </button>
                  )}
                </div>
                <ul aria-labelledby="sing-notes-label" className="mt-2 flex min-h-11 flex-wrap gap-2" data-sing-notes>
                  {run.map((n, i) => (
                    <li key={`${i}-${n}`}>
                      <button
                        type="button"
                        onClick={() => setRun((all) => all.filter((_, k) => k !== i))}
                        aria-label={`Remove ${midiName(n)}`}
                        className="tap rounded-full bg-gray-50 px-4 text-base font-bold tabular-nums text-navy ring-1 ring-navy/20"
                        data-sing-note-chip
                      >
                        {midiName(n)} <span aria-hidden="true" className="ml-1 font-normal text-gray-500">×</span>
                      </button>
                    </li>
                  ))}
                  {!run.length && <li className="self-center text-sm text-gray-600">No notes yet.</li>}
                </ul>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor="sing-add" className="w-full text-xs font-semibold text-gray-600">Add a note</label>
                  <select
                    id="sing-add"
                    value={adding}
                    onChange={(e) => setAdding(Number(e.target.value))}
                    className="tap rounded-xl bg-white px-4 text-base font-semibold text-navy ring-1 ring-navy/20"
                  >
                    {choices.map((m) => <option key={m} value={m}>{midiName(m)}</option>)}
                  </select>
                  <Button variant="ghost" onClick={() => setRun((all) => [...all, adding].slice(0, MOST_NOTES))} disabled={run.length >= MOST_NOTES}>
                    + Add
                  </Button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor="sing-count" className="w-full text-xs font-semibold text-gray-600">Or let the app pick</label>
                  <select
                    id="sing-count"
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="tap rounded-xl bg-white px-4 text-base font-semibold text-navy ring-1 ring-navy/20"
                  >
                    {[5, 6, 7, 8, 9, 10].map((c) => <option key={c} value={c}>{c} notes</option>)}
                  </select>
                  <Button variant="ghost" onClick={() => setRun(pickNotes(count, part))}>🎲 Pick for me</Button>
                </div>
                {run.length < RUN_NOTES && (
                  <p className="mt-2 text-sm text-gray-600" data-sing-need>
                    A run is five to ten notes: add {RUN_NOTES - run.length} more, or tap Pick for me.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-4 border-t border-navy/10 pt-4">
              <Pills
                label="Your voice"
                value={part}
                onChange={(v) => setPart(v as VoicePart)}
                options={VOICE_PARTS.map((p) => ({ id: p.id, name: p.id === 'any' ? 'Any' : p.name, hint: `${midiName(p.low)} to ${midiName(p.high)}` }))}
                data="part"
              />
              <Pills
                label="How close counts"
                value={tolerance}
                onChange={(v) => setTolerance(v as Tolerance)}
                options={TOLERANCES.map((t) => ({ id: t.id, name: t.name, hint: `within ${t.cents} cents` }))}
                data="tolerance"
              />
              <label className="flex items-start gap-3 text-navy">
                <input
                  type="checkbox"
                  checked={hearFirst}
                  onChange={(e) => setHearFirst(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
                />
                <span>
                  <span className="block font-semibold">Play each note before I sing it</span>
                  <span className="block text-sm text-gray-500">Leave it off for the real test: from memory, as perfect pitch is.</span>
                </span>
              </label>
            </div>

            <Button onClick={() => void start()} disabled={!ready || status === 'asking'} className="w-full justify-center">
              🎙️ {mode === 'one' ? `Sing ${midiName(single)}` : `Sing the ${run.length} notes`}
            </Button>
            {stopped && <p role="status" className="text-sm text-navy">{stopped}</p>}
            <p className="text-xs text-gray-500">
              The microphone listens only while you sing here, and nothing is recorded. Wear headphones if you play
              notes or the drone, or the tuner hears them instead of you.
            </p>
          </div>
        )}

        {phase === 'singing' && target !== undefined && (
          <div className="mt-4" data-sing-now>
            <p className="text-sm font-semibold text-gray-600" data-sing-count>Note {index + 1} of {notes.length}</p>
            <div className="mt-2 flex items-center gap-5">
              <Ring progress={shown ? 1 : live.state === 'holding' ? live.progress : 0} hit={shown ? shown.hit : null}>
                <span className="text-4xl font-extrabold tabular-nums text-navy" data-sing-target>{midiName(target)}</span>
              </Ring>
              <div className="min-w-0 flex-1" role="status" aria-live="polite" data-sing-live>
                {shown ? (
                  <p className={`text-lg font-bold ${shown.hit ? 'text-[color:var(--music-accent)]' : 'text-navy'}`} data-sing-verdict={shown.hit ? 'hit' : 'miss'}>
                    {shown.hit ? '✓ Hit: ' : '✗ '}{verdictWords(shown)}
                  </p>
                ) : live.state === 'holding' ? (
                  <p className="text-lg font-semibold text-navy">
                    Hold it… you are on {midiName(Math.round(live.sung))}
                  </p>
                ) : (
                  <p className="text-lg font-semibold text-navy">Sing {midiName(target)} and hold it.</p>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => play(target)} disabled={!!shown}>🔔 Hear it</Button>
              <Button variant="ghost" onClick={skip} disabled={!!shown}>Skip</Button>
              <Button variant="ghost" onClick={stop}>■ Stop</Button>
            </div>
          </div>
        )}

        {phase === 'done' && (
          <div className="mt-4" data-sing-results>
            {perfect && <PerfectPitch notes={notes.length} heard={heardFirst} />}
            <p className="text-lg font-bold text-navy" data-sing-score>
              {hits} of {notes.length} {notes.length === 1 ? 'note' : 'notes'} hit
            </p>
            <ol className="mt-2 space-y-1">
              {results.map((r, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm" data-sing-result={skipped(r) ? 'skipped' : r.hit ? 'hit' : 'miss'}>
                  <span aria-hidden="true" className={`w-5 font-bold ${!skipped(r) && r.hit ? 'text-[color:var(--music-accent)]' : 'text-gray-500'}`}>
                    {skipped(r) ? '–' : r.hit ? '✓' : '✗'}
                  </span>
                  <span className="text-navy">{skipped(r) ? `${midiName(r.target)}: skipped` : verdictWords(r)}</span>
                </li>
              ))}
            </ol>
            {heardFirst > 0 && (
              <p className="mt-2 text-xs text-gray-500">You heard {heardFirst === notes.length ? 'every note' : `${heardFirst} of the notes`} played first.</p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void start()}>{notes.length === 1 ? 'Sing it again' : 'Sing them again'}</Button>
              <Button variant="ghost" onClick={() => { setPhase('setup'); setResults([]); }}>{notes.length === 1 ? 'Change the note' : 'Change the notes'}</Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/** A row of choices, one pressed: the voice part, how close counts. */
function Pills({ label, value, onChange, options, data }: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  options: { id: string; name: string; hint: string }[];
  data: string;
}) {
  return (
    <div role="group" aria-label={label}>
      <p className="text-sm font-semibold text-navy">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            aria-pressed={value === o.id}
            onClick={() => onChange(o.id)}
            className={`tap rounded-full px-4 py-1 text-left ring-1 transition-colors ${value === o.id ? 'bg-navy text-white ring-navy' : 'bg-white text-navy ring-navy/20'}`}
            data-sing-choice={`${data}:${o.id}`}
          >
            <span className="block text-sm font-bold leading-tight">{o.name}</span>
            <span className={`block text-xs leading-tight ${value === o.id ? 'text-white/80' : 'text-gray-600'}`}>{o.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The note, inside a ring that fills while it is held: full and green is a hit. */
function Ring({ progress, hit, children }: { progress: number; hit: boolean | null; children: ReactNode }) {
  const r = 44;
  const around = 2 * Math.PI * r;
  return (
    <div className="relative grid h-28 w-28 shrink-0 place-items-center text-navy" data-sing-ring>
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="8" />
        <circle
          cx="50" cy="50" r={r} fill="none" strokeWidth="8" strokeLinecap="round"
          stroke={hit === false ? 'currentColor' : 'var(--music-accent)'}
          strokeOpacity={hit === false ? 0.45 : 1}
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
 * Every note hit: perfect pitch. A burst of notes and a glow; under Reduce
 * Motion, the same words and badge, standing still.
 */
function PerfectPitch({ notes, heard }: { notes: number; heard: number }) {
  const [still] = useState(() => prefersLessMotion());
  const sparks = ['♪', '♫', '♩', '♬', '♪', '♫', '♩', '♬'];
  return (
    <div className="perfect-pitch relative mb-4 overflow-hidden rounded-2xl p-5 text-center" role="status" aria-live="polite" data-perfect-pitch>
      {!still && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          {sparks.map((s, i) => (
            // Up the two outer edges, clear of the words in the middle.
            <span key={i} className="perfect-pitch-spark" style={{ ['--i' as string]: i, left: `${i % 2 ? 87 + (i % 4) * 2 : 1 + (i % 4) * 2}%` }}>{s}</span>
          ))}
        </div>
      )}
      <p className="perfect-pitch-badge relative z-10 mx-auto grid h-16 w-16 place-items-center rounded-full text-3xl" aria-hidden="true">🎯</p>
      <p className="relative z-10 mt-2 text-2xl font-extrabold text-navy">Perfect pitch!</p>
      <p className="relative z-10 mx-auto mt-1 max-w-[16rem] text-sm text-gray-600">
        {notes === 1 ? 'You hit the note.' : `Every one of the ${notes} notes, hit.`}
        {heard === 0 ? ' From memory, with none played first.' : ''}
      </p>
    </div>
  );
}
