'use client';

// The Tuner folder: the note you are singing or playing, how far off it is,
// and a pitch pipe to give the choir its starting note.
//
// The microphone is opened by lib/music/tuner.ts only after Start is pressed,
// and released on Stop, on leaving this folder, and when the phone locks. What
// it hears is measured on the phone and thrown away.

import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { useTuner } from '@/lib/music/tuner';
import { A4_DEFAULT, A4_MAX, A4_MIN, IN_TUNE_CENTS, clampA4, midiName, midiToHz } from '@/lib/music/notes';
import { closeAudio, note, openAudio } from '@/lib/music/audio';

/** The calibration a choir chose, remembered on this phone. A convenience only. */
const A4_KEY = 'beacon:music-a4';

/** The pitch pipe's notes: low C for the basses to high C for the sopranos. */
const PIPE_NOTES = Array.from({ length: 25 }, (_, i) => 48 + i);
const PIPE_SECONDS = 2;

export function TunerPanel() {
  const tuner = useTuner();
  const { status, reading, a4, setA4 } = tuner;

  // Remembered calibration, read after mount (no storage on the server).
  useEffect(() => {
    try {
      const kept = Number(localStorage.getItem(A4_KEY));
      if (kept) setA4(clampA4(kept));
    } catch { /* a convenience only */ }
  }, [setA4]);
  const calibrate = (hz: number) => {
    const next = clampA4(hz);
    setA4(next);
    try { localStorage.setItem(A4_KEY, String(next)); } catch { /* a convenience only */ }
  };

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
          <p className="text-6xl font-extrabold tabular-nums text-navy" aria-label={reading ? `${reading.name} ${reading.octave}` : 'No note'}>
            {reading ? <>{reading.name}<span className="text-3xl text-gray-500">{reading.octave}</span></> : '–'}
          </p>
          <Needle cents={reading ? cents : null} inTune={inTune} />
          <p className={`mt-8 min-h-6 font-bold ${inTune ? 'text-teal-700' : 'text-navy'}`} data-tuner-verdict>
            {inTune ? '✓ ' : ''}{verdict}
          </p>
          <p className="mt-1 text-sm tabular-nums text-gray-500">
            {reading ? `${reading.hz.toFixed(1)} Hz` : ' '}
          </p>
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
        <h2 className="text-xl font-bold text-navy">Concert pitch</h2>
        <p className="mt-1 text-sm text-gray-600">
          Most choirs and pianos tune A to 440 Hz. Change it only to match an instrument tuned differently, such as an
          older organ.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Button variant="ghost" className="px-4" onClick={() => calibrate(a4 - 1)} disabled={a4 <= A4_MIN}>− 1</Button>
          <p className="min-w-0 flex-1 text-center text-lg font-bold tabular-nums text-navy sm:flex-none sm:px-3" data-tuner-a4>A = {a4} Hz</p>
          <Button variant="ghost" className="px-4" onClick={() => calibrate(a4 + 1)} disabled={a4 >= A4_MAX}>+ 1</Button>
        </div>
        {a4 !== A4_DEFAULT && (
          <button type="button" onClick={() => calibrate(A4_DEFAULT)} className="tap-sm mt-2 text-sm font-semibold text-teal-700 underline">
            Back to 440
          </button>
        )}
      </Card>

      <PitchPipe a4={a4} />
    </div>
  );
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
      <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-navy/15" />
      <div className="absolute top-0 h-full w-0.5 -translate-x-1/2 bg-navy/40" style={{ left: '50%' }} />
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
    </Card>
  );
}
