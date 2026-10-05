'use client';

// The Tuner folder: the note you are singing or playing, how far off it is,
// and a pitch pipe to give the choir its starting note.
//
// The microphone is opened by lib/music/tuner.ts only after Start is pressed,
// and released on Stop, on leaving this folder, and when the phone locks. What
// it hears is measured on the phone and thrown away.
//
// CONCERT PITCH YOU CAN HEAR. It used to be a number and two buttons, and
// changing it moved only the tuner's reference, which nobody notices until
// they sing (the owner, 4 October 2026: "I just put the Hertz and nothing much
// is happening"). Now every change plays the new A, the card says in words what
// it does to every note, it compares the choir's A with 440 side by side, and
// it can take its A from the organ or piano in the room.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { useTuner } from '@/lib/music/tuner';
import {
  A4_DEFAULT, A4_MAX, A4_MIN, CONCERT_PITCHES, IN_TUNE_CENTS, STEADY_READINGS,
  clampA4, heardA, midiName, midiToHz, pitchWords, writtenFor, type InstrumentKey,
} from '@/lib/music/notes';
import { closeAudio, note, openAudio } from '@/lib/music/audio';
import { AdvancedToggle, useAdvanced } from '@/components/music/Advanced';
import { Drone, InstrumentChoice, PitchTrail } from '@/components/music/TunerAdvanced';

/** The calibration a choir chose, remembered on this phone. A convenience only. */
const A4_KEY = 'beacon:music-a4';
/** The instrument whose notes the tuner shows (Advanced), remembered on this phone. */
const INSTRUMENT_KEY = 'beacon:music-instrument';

/** The pitch pipe's notes: low C for the basses to high C for the sopranos. */
const PIPE_NOTES = Array.from({ length: 25 }, (_, i) => 48 + i);
const PIPE_SECONDS = 2;
/** The A played when concert pitch changes: long enough to hear, short enough to tap again. */
const CHANGE_SECONDS = 0.7;
/** How long Listen for the A waits for a steady A before saying it heard none. */
const MATCH_SECONDS = 10;

type Match =
  | { state: 'idle' }
  | { state: 'listening' }
  | { state: 'heard'; hz: number }
  | { state: 'used'; hz: number }
  | { state: 'lost' };

export function TunerPanel() {
  const tuner = useTuner();
  const { status, reading, a4, setA4, start: listen, stop: stopListening } = tuner;
  const tone = useTone();
  const [advanced, setAdvanced] = useAdvanced('tuner');
  const [instrument, setInstrumentState] = useState<InstrumentKey>('C');
  useEffect(() => {
    try {
      const kept = localStorage.getItem(INSTRUMENT_KEY);
      if (kept === 'Bb' || kept === 'Eb' || kept === 'F') setInstrumentState(kept);
    } catch { /* a convenience only */ }
  }, []);
  const setInstrument = (k: InstrumentKey) => {
    setInstrumentState(k);
    try { localStorage.setItem(INSTRUMENT_KEY, k); } catch { /* a convenience only */ }
  };
  // What the big letter shows: the note as it sounds, or as a transposing instrument reads it.
  const reads = advanced && instrument !== 'C' && reading ? writtenFor(reading.midi, instrument) : null;
  const shown = reads !== null ? { name: midiName(reads).replace(/-?\d+$/, ''), octave: Number(midiName(reads).match(/-?\d+$/)?.[0]) } : reading;

  // Remembered calibration, read after mount (no storage on the server).
  useEffect(() => {
    try {
      const kept = Number(localStorage.getItem(A4_KEY));
      if (kept) setA4(clampA4(kept));
    } catch { /* a convenience only */ }
  }, [setA4]);
  // Every change is heard: the new A, once, as soon as it is chosen.
  const calibrate = (hz: number) => {
    const next = clampA4(hz);
    setA4(next);
    try { localStorage.setItem(A4_KEY, String(next)); } catch { /* a convenience only */ }
    tone.play([{ hz: next, seconds: CHANGE_SECONDS, label: `A at ${next} Hz` }]);
  };

  // MATCH AN INSTRUMENT. The tuner listens while somebody holds an A on the
  // organ or piano; once a dozen readings agree, that A is offered as the
  // concert pitch. The microphone is the tuner's own, opened and let go the
  // same way, and released as soon as the A is heard if this opened it.
  const [match, setMatch] = useState<Match>({ state: 'idle' });
  const samples = useRef<number[]>([]);
  const openedMic = useRef(false);
  const giveUp = useRef(0);
  const endMatch = useCallback((next: Match) => {
    window.clearTimeout(giveUp.current);
    if (openedMic.current) { openedMic.current = false; stopListening(); }
    setMatch(next);
  }, [stopListening]);
  const startMatch = () => {
    tone.quiet();
    samples.current = [];
    setMatch({ state: 'listening' });
    window.clearTimeout(giveUp.current);
    giveUp.current = window.setTimeout(() => endMatch({ state: 'lost' }), MATCH_SECONDS * 1000);
    if (status !== 'listening') { openedMic.current = true; void listen(); }
  };
  useEffect(() => {
    if (match.state !== 'listening' || !reading) return;
    samples.current = [...samples.current, reading.hz].slice(-STEADY_READINGS * 2);
    const hz = heardA(samples.current);
    if (hz !== null) endMatch({ state: 'heard', hz });
  }, [reading, match.state, endMatch]);
  // The microphone refused, or Stop listening pressed on the Tuner card: no match.
  const was = useRef(status);
  useEffect(() => {
    const before = was.current;
    was.current = status;
    if (match.state !== 'listening') return;
    if (status === 'denied' || status === 'unavailable' || (before === 'listening' && status === 'off')) {
      window.clearTimeout(giveUp.current);
      openedMic.current = false;
      setMatch({ state: 'idle' });
    }
  }, [status, match.state]);
  useEffect(() => () => window.clearTimeout(giveUp.current), []);
  const matching = match.state === 'listening';

  const listening = status === 'listening';
  const cents = reading?.cents ?? 0;
  const inTune = reading !== null && Math.abs(cents) <= IN_TUNE_CENTS;
  const verdict = !reading
    ? listening ? 'Sing or play one note and hold it.' : ''
    : inTune ? 'In tune'
    : cents < 0 ? `${Math.abs(cents)} cents flat: a little higher`
    : `${cents} cents sharp: a little lower`;

  return (
    <div className="space-y-5" data-music-tuner>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-navy">Tuner</h2>
            <p className="mt-1 text-sm text-gray-600">
              Shows the note you are singing or playing, and whether it is flat or sharp.
            </p>
          </div>
          {listening
            ? <Button variant="ghost" onClick={tuner.stop}>■ Stop listening</Button>
            : <Button onClick={() => void tuner.start()} disabled={status === 'asking'}>🎙️ Start listening</Button>}
        </div>

        <div className="mt-5 rounded-2xl bg-gray-50 p-5 text-center" data-tuner-reading>
          <p className="text-6xl font-extrabold tabular-nums text-navy" aria-label={shown ? `${shown.name} ${shown.octave}` : 'No note'}>
            {shown ? <>{shown.name}<span className="text-3xl text-gray-500">{shown.octave}</span></> : '·'}
          </p>
          {reads !== null && reading && (
            <p className="mt-1 text-sm font-semibold text-gray-600" data-tuner-sounds>
              As your instrument reads it. Sounds as {reading.name}{reading.octave}.
            </p>
          )}
          <Needle cents={reading ? cents : null} inTune={inTune} />
          <p className={`mt-8 min-h-6 font-bold ${inTune ? 'text-teal-700' : 'text-navy'}`} data-tuner-verdict>
            {inTune ? '✓ ' : ''}{verdict}
          </p>
          <p className="mt-1 text-sm tabular-nums text-gray-500">
            {reading ? `${reading.hz.toFixed(1)} Hz` : ' '}
          </p>
          {a4 !== A4_DEFAULT && (
            <p className="mt-1 text-xs font-semibold text-teal-700" data-tuner-against>
              Measured against your concert pitch, A = {a4} Hz
            </p>
          )}
        </div>

        {status === 'asking' && (
          <p role="status" className="mt-4 text-sm text-gray-700">Your browser is asking whether this app may use the microphone.</p>
        )}
        {status === 'denied' && (
          <p role="alert" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            The microphone was not allowed, so the tuner cannot hear anything. To use it, allow the microphone for
            this site in your browser&rsquo;s settings, then press Start listening again.
          </p>
        )}
        {status === 'unavailable' && (
          <p role="alert" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            This browser cannot use a microphone here. Try another browser, or open the app from its own icon.
          </p>
        )}
        <p className="mt-4 text-xs text-gray-500">
          The microphone is used only while the tuner is listening. What it hears is measured on this phone and
          thrown away: nothing is recorded, kept or sent.
        </p>
      </Card>

      <Card className="p-5">
        <div data-concert-pitch>
          <h2 className="text-xl font-bold text-navy">Concert pitch</h2>
          <p className="mt-1 text-sm text-gray-600">
            Where your choir&rsquo;s A sits. Every note follows it: the tuner measures against it, and the starting
            note below plays at it. Set it to match an organ or piano that is tuned differently.
          </p>

          <div role="group" aria-label="Common concert pitches" className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CONCERT_PITCHES.map((p) => {
              const on = a4 === p.hz;
              return (
                <button
                  key={p.hz}
                  type="button"
                  aria-pressed={on}
                  disabled={matching}
                  onClick={() => calibrate(p.hz)}
                  title={p.about}
                  className={`tap rounded-xl px-3 py-2 text-left ring-1 disabled:opacity-50 ${on ? 'bg-navy text-white ring-navy' : 'bg-white text-navy ring-navy/20'}`}
                  data-pitch-choice={p.hz}
                >
                  <span className="block text-base font-bold tabular-nums">{p.hz} Hz</span>
                  <span className={`block text-xs ${on ? 'text-white/80' : 'text-gray-600'}`}>{p.name}</span>
                </button>
              );
            })}
          </div>

          {/* The number on a line of its own, so it never wraps or hides
              behind the buttons on a narrow phone at a large text size. */}
          <p className="mt-5 text-center text-3xl font-extrabold tabular-nums text-navy" data-tuner-a4>A = {a4} Hz</p>
          <div className="mt-3 flex items-center justify-center gap-3">
            <Button variant="ghost" className="px-6" onClick={() => calibrate(a4 - 1)} disabled={matching || a4 <= A4_MIN}>− 1</Button>
            <Button variant="ghost" className="px-6" onClick={() => calibrate(a4 + 1)} disabled={matching || a4 >= A4_MAX}>+ 1</Button>
          </div>
          <PitchRuler a4={a4} />
          <p className="mt-3 text-sm font-semibold text-navy" data-pitch-words>{pitchWords(a4)}</p>
          {a4 !== A4_DEFAULT && (
            <p className="mt-1 text-xs text-gray-500">A hundred cents is one semitone: one key on a piano.</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {tone.now
              ? <Button variant="ghost" onClick={tone.quiet}>■ Stop the A</Button>
              : (
                <>
                  <Button onClick={() => tone.play([{ hz: a4, seconds: 1.5, label: `your A, ${a4} Hz` }])} disabled={matching}>
                    🔔 Hear A at {a4} Hz
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={matching || a4 === A4_DEFAULT}
                    onClick={() => tone.play([
                      { hz: A4_DEFAULT, seconds: 1.3, label: 'the standard A, 440 Hz' },
                      { hz: a4, seconds: 1.3, label: `your A, ${a4} Hz` },
                    ])}
                  >
                    Compare with 440
                  </Button>
                </>
              )}
          </div>
          <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm font-semibold text-teal-700" data-pitch-now>
            {tone.now ? `Playing ${tone.now}` : ''}
          </p>

          <div className="mt-4 border-t border-navy/10 pt-4" data-pitch-match>
            <h3 className="font-bold text-navy">Match an instrument</h3>
            <p className="mt-1 text-sm text-gray-600">
              Ask the organist or pianist to hold an A. Tap Listen for the A: the app measures it and offers it as your
              concert pitch, so the tuner and the starting note agree with that instrument. Nothing is recorded.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {matching
                ? <Button variant="ghost" onClick={() => endMatch({ state: 'idle' })}>■ Stop listening for the A</Button>
                : <Button onClick={startMatch} disabled={status === 'asking'}>🎙️ Listen for the A</Button>}
            </div>
            <div role="status" aria-live="polite" className="mt-3 text-sm" data-pitch-heard>
              {matching && <p className="text-navy">Listening for a steady A. Hold it for a second or two, near the phone.</p>}
              {match.state === 'lost' && (
                <p className="text-navy">
                  No steady A was heard. Ask for the A again, held a little longer and nearer the phone, then tap Listen
                  for the A.
                </p>
              )}
              {match.state === 'heard' && (
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-navy">The A you played is <strong className="tabular-nums">{match.hz.toFixed(1)} Hz</strong>.</p>
                  {clampA4(match.hz) === a4
                    ? <p className="mt-1 text-gray-600">That is your concert pitch already: the tuner and the starting note match it.</p>
                    : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Button onClick={() => { const hz = clampA4(match.hz); calibrate(hz); setMatch({ state: 'used', hz }); }}>
                          Use {clampA4(match.hz)} Hz
                        </Button>
                        <Button variant="ghost" onClick={() => setMatch({ state: 'idle' })}>Keep {a4} Hz</Button>
                      </div>
                    )}
                </div>
              )}
              {match.state === 'used' && (
                <p className="font-semibold text-teal-700">✓ Concert pitch is now A = {match.hz} Hz, from your instrument.</p>
              )}
            </div>
          </div>
        </div>
      </Card>

      <PitchPipe a4={a4} />

      <Card className="p-5">
        <AdvancedToggle
          folder="tuner"
          on={advanced}
          onChange={setAdvanced}
          what="A trail of your voice over ten seconds, a drone to sing against, and notes as a clarinet, trumpet, saxophone or horn reads them."
        />
      </Card>
      {advanced && (
        <>
          <PitchTrail reading={reading} a4={a4} listening={listening} />
          <Drone a4={a4} />
          <InstrumentChoice value={instrument} onChange={setInstrument} />
        </>
      )}
    </div>
  );
}

/**
 * Where this A sits between the lowest and highest a tuner takes, with the
 * common pitches marked. The words beside it say the same thing; this is so it
 * can be seen at a glance.
 */
function PitchRuler({ a4 }: { a4: number }) {
  const at = (hz: number) => ((hz - A4_MIN) / (A4_MAX - A4_MIN)) * 100;
  return (
    // The line and its marks are drawn in the text colour at low strength, so
    // a dark look (Focus, Dark Aero) draws them light, the same as the words.
    <div aria-hidden="true" className="relative mx-auto mt-4 h-10 max-w-md text-navy" data-pitch-ruler>
      <div className="absolute inset-x-0 top-3 h-1 rounded-full bg-current opacity-20" />
      {CONCERT_PITCHES.map((p) => (
        <div key={p.hz} className="absolute top-2 h-3 w-px bg-current opacity-50" style={{ left: `${at(p.hz)}%` }} />
      ))}
      <div
        className="absolute top-1 h-5 w-2 -translate-x-1/2 rounded-full bg-teal-600 transition-[left] duration-200 motion-reduce:transition-none"
        style={{ left: `${at(a4)}%` }}
      />
      <span className="absolute left-0 top-6 text-xs text-gray-500">lower</span>
      <span className="absolute top-6 -translate-x-1/2 text-xs text-gray-500" style={{ left: `${at(A4_DEFAULT)}%` }}>440</span>
      <span className="absolute right-0 top-6 text-xs text-gray-500">higher</span>
    </div>
  );
}

/**
 * Short notes for the Concert pitch card: the new A when it changes, the A on
 * its own, or 440 then yours to compare. One audio clock at a time, closed
 * when the last note ends, when another starts, and when the folder is left.
 * `now` names what is sounding, for the line under the buttons.
 */
function useTone() {
  const ctx = useRef<AudioContext | null>(null);
  const timers = useRef<number[]>([]);
  const [now, setNow] = useState<string | null>(null);
  const quiet = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    closeAudio(ctx.current);
    ctx.current = null;
    setNow(null);
  }, []);
  useEffect(() => () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    closeAudio(ctx.current);
  }, []);
  const play = useCallback((parts: { hz: number; seconds: number; label: string }[]) => {
    quiet();
    const audio = openAudio();
    if (!audio) return;
    ctx.current = audio;
    let at = 0.05;
    for (const part of parts) {
      note(audio, audio.destination, part.hz, audio.currentTime + at, part.seconds, 1);
      const label = part.label;
      timers.current.push(window.setTimeout(() => setNow(label), at * 1000));
      at += part.seconds + 0.3;
    }
    timers.current.push(window.setTimeout(quiet, at * 1000));
  }, [quiet]);
  return { now, play, quiet };
}

/**
 * How far off, drawn as a line with the centre marked. Flat to the left,
 * sharp to the right, and said in words beside it, so colour is never the
 * only way to tell.
 */
function Needle({ cents, inTune }: { cents: number | null; inTune: boolean }) {
  const at = cents === null ? 50 : 50 + Math.max(-50, Math.min(50, cents));
  return (
    <div
      className="relative mx-auto mt-4 h-10 max-w-md"
      role="meter"
      aria-label="How far off the note"
      aria-valuemin={-50}
      aria-valuemax={50}
      aria-valuenow={cents ?? 0}
      aria-valuetext={cents === null ? 'No note' : inTune ? 'In tune' : `${cents} cents`}
    >
      {/* In the text colour, so a dark look draws the line light. */}
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-current text-navy opacity-20" />
      <div className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-current text-navy opacity-50" style={{ left: '50%' }} />
      <span className="absolute -bottom-5 left-0 text-xs text-gray-500">flat</span>
      <span className="absolute -bottom-5 right-0 text-xs text-gray-500">sharp</span>
      {cents !== null && (
        <div
          className={`absolute top-1/2 h-8 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left] duration-75 ${inTune ? 'bg-teal-600' : 'bg-navy'}`}
          style={{ left: `${at}%` }}
          data-tuner-needle
        />
      )}
    </div>
  );
}

/** A pitch pipe: one note, held for two seconds, at the chosen concert pitch. */
function PitchPipe({ a4 }: { a4: number }) {
  const [midi, setMidi] = useState(60);
  const [sounding, setSounding] = useState(false);
  const ctx = useRef<AudioContext | null>(null);
  const done = useRef(0);

  const quiet = () => {
    window.clearTimeout(done.current);
    closeAudio(ctx.current);
    ctx.current = null;
    setSounding(false);
  };
  // Leaving the folder mid-note stops it.
  useEffect(() => () => {
    window.clearTimeout(done.current);
    closeAudio(ctx.current);
  }, []);

  const sound = () => {
    quiet();
    const audio = openAudio();
    if (!audio) return;
    ctx.current = audio;
    note(audio, audio.destination, midiToHz(midi, a4), audio.currentTime + 0.05, PIPE_SECONDS, 1);
    setSounding(true);
    done.current = window.setTimeout(quiet, (PIPE_SECONDS + 0.3) * 1000);
  };

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">Starting note</h2>
      <p className="mt-1 text-sm text-gray-600">Give the choir its first note, like a pitch pipe.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="pitch-pipe-note" className="sr-only">Note</label>
        <select
          id="pitch-pipe-note"
          value={midi}
          onChange={(e) => setMidi(Number(e.target.value))}
          className="tap rounded-xl bg-white px-4 text-base font-semibold text-navy ring-1 ring-navy/20"
        >
          {PIPE_NOTES.map((m) => <option key={m} value={m}>{midiName(m)}</option>)}
        </select>
        {sounding
          ? <Button variant="ghost" onClick={quiet}>■ Stop</Button>
          : <Button onClick={sound}>🔔 Play {midiName(midi)}</Button>}
      </div>
      <p className="mt-2 text-sm tabular-nums text-gray-600" data-pipe-hz>
        {midiName(midi)} sounds at {midiToHz(midi, a4).toFixed(1)} Hz
        {a4 !== A4_DEFAULT ? `, from your concert pitch A = ${a4} Hz` : ''}
      </p>
    </Card>
  );
}
