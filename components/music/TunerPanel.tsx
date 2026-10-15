// The Tuner folder: the note you are singing or playing, how far off it is,
// and a pitch pipe to give the choir its starting note.
//
// The microphone is opened by lib/music/tuner.ts only after the round button
// is tapped, and released on a second tap, on leaving this folder, and when
// the phone locks. What it hears is measured on the phone and thrown away.
//
// LET THE DESIGN SPEAK (15 October 2026). The owner: "The basic settings are
// just complicated with so many words on it. Let the design speaks for itself
// please." So the folder is a dial with the note in it and one round button,
// and every setting is a line of its own: the starting note, and the concert
// pitch, which opens when tapped. Nothing was taken away. Concert pitch still
// plays the new A at every change (the owner, 4 October 2026: "I just put the
// Hertz and nothing much is happening"), and can still take its A from the
// organ or piano in the room.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Card } from '@/components/ui';
import { useTuner } from '@/lib/music/tuner';
import {
  A4_DEFAULT, A4_MAX, A4_MIN, CONCERT_PITCHES, IN_TUNE_CENTS, STEADY_READINGS,
  clampA4, heardA, midiName, midiToHz, pitchWords, writtenFor, type InstrumentKey,
} from '@/lib/music/notes';
import { closeAudio, note, openAudio } from '@/lib/music/audio';
import { AdvancedToggle, useAdvanced } from '@/components/music/Advanced';
import { Drone, InstrumentChoice, PitchTrail } from '@/components/music/TunerAdvanced';
import { SingTheNote } from '@/components/music/SingTheNote';

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
  const { status, reading, held, a4, setA4, start: listen, stop: stopListening } = tuner;
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
    if (match.state !== 'listening' || !reading || held) return;
    samples.current = [...samples.current, reading.hz].slice(-STEADY_READINGS * 2);
    const hz = heardA(samples.current);
    if (hz !== null) endMatch({ state: 'heard', hz });
  }, [reading, held, match.state, endMatch]);
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
  const [pitchOpen, setPitchOpen] = useState(false);
  const [more, setMore] = useState(false);

  return (
    <div className="space-y-4" data-music-tuner>
      <Card className="p-5">
        <h2 className="sr-only">Tuner</h2>
        <div className="flex flex-col items-center text-center" data-tuner-reading>
          <Gauge cents={reading ? cents : null} inTune={inTune}>
            <p className="text-7xl font-extrabold leading-none tabular-nums text-navy" aria-label={shown ? `${shown.name} ${shown.octave}` : 'No note'}>
              {shown ? <>{shown.name}<span className="text-3xl text-gray-500">{shown.octave}</span></> : <span className="opacity-25">♪</span>}
            </p>
          </Gauge>
          {reads !== null && reading && (
            <p className="mt-1 text-sm font-semibold text-gray-600" data-tuner-sounds>Sounds as {reading.name}{reading.octave}</p>
          )}
          <p className={`mt-3 min-h-7 text-lg font-bold tabular-nums ${inTune ? 'text-[color:var(--music-accent)]' : 'text-navy'}`} data-tuner-verdict>
            {!reading ? '' : inTune ? '✓ In tune' : cents < 0 ? `♭ ${Math.abs(cents)}` : `♯ ${cents}`}
          </p>
          <p className="min-h-5 text-xs tabular-nums text-gray-500">
            {reading ? `${reading.hz.toFixed(1)} Hz` : ''}
            {a4 !== A4_DEFAULT && <span className="font-semibold text-[color:var(--music-accent)]" data-tuner-against>{reading ? ' · ' : ''}A = {a4}</span>}
          </p>
          <button
            type="button"
            onClick={() => (listening ? tuner.stop() : void tuner.start())}
            disabled={status === 'asking'}
            aria-label={listening ? 'Stop listening' : 'Start listening'}
            className={`tap mt-3 grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full shadow-md disabled:opacity-50 ${listening ? 'tuner-mic-on' : 'bg-navy text-white'}`}
            data-tuner-mic
          >
            {listening ? <span aria-hidden="true" className="block h-5 w-5 rounded-md bg-current" /> : <MicIcon />}
          </button>
          <p className="mt-2 text-xs font-semibold text-gray-500" aria-hidden="true">{listening ? 'Listening' : 'Tap to listen'}</p>
        </div>

        {status === 'denied' && (
          <p role="alert" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            The microphone is not allowed. Allow it for this site in your browser&rsquo;s settings, then tap again.
          </p>
        )}
        {status === 'unavailable' && (
          <p role="alert" className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
            This browser cannot use a microphone here. Try another browser.
          </p>
        )}
        <p className="mt-4 text-center text-xs text-gray-500">🔒 Nothing is recorded.</p>
      </Card>

      <PitchPipe a4={a4} />

      <Card className="p-4">
        <div data-concert-pitch>
          <button
            type="button"
            aria-expanded={pitchOpen}
            onClick={() => setPitchOpen((o) => !o)}
            className="tap flex w-full items-center justify-between gap-3 text-left"
            data-pitch-toggle
          >
            <span className="text-base font-bold text-navy">Concert pitch</span>
            <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-base font-bold tabular-nums text-navy" data-tuner-a4>
              A = {a4} Hz <Chevron open={pitchOpen} />
            </span>
          </button>
          {pitchOpen && (
            <div className="mt-3 space-y-4">
              <div role="group" aria-label="Common concert pitches" className="grid grid-cols-4 gap-2">
                {CONCERT_PITCHES.map((p) => {
                  const on = a4 === p.hz;
                  return (
                    <button
                      key={p.hz}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${p.hz} Hz, ${p.name}`}
                      disabled={matching}
                      onClick={() => calibrate(p.hz)}
                      title={p.about}
                      className={`tap rounded-xl px-1 py-2 text-center ring-1 disabled:opacity-50 ${on ? 'bg-navy text-white ring-navy' : 'bg-white text-navy ring-navy/20'}`}
                      data-pitch-choice={p.hz}
                    >
                      <span className="block text-base font-bold tabular-nums">{p.hz}</span>
                      <span className={`block text-[0.7rem] leading-tight ${on ? 'text-white/80' : 'text-gray-600'}`}>{p.name}</span>
                    </button>
                  );
                })}
              </div>
              <p className="text-center text-xs text-gray-600" data-pitch-words>{pitchWords(a4)}</p>
              <div className="flex items-center justify-center gap-3">
                <RoundButton label="1 Hz lower" onClick={() => calibrate(a4 - 1)} disabled={matching || a4 <= A4_MIN}>−</RoundButton>
                {tone.now
                  ? <Button variant="ghost" onClick={tone.quiet}>■ Stop</Button>
                  : <Button onClick={() => tone.play([{ hz: a4, seconds: 1.5, label: `A at ${a4} Hz` }])} disabled={matching}>🔔 Hear A</Button>}
                <RoundButton label="1 Hz higher" onClick={() => calibrate(a4 + 1)} disabled={matching || a4 >= A4_MAX}>+</RoundButton>
              </div>
              <p role="status" aria-live="polite" className="sr-only" data-pitch-now>{tone.now ? `Playing ${tone.now}` : ''}</p>

              <div className="border-t border-navy/10 pt-4 text-center" data-pitch-match>
                {matching
                  ? <Button variant="ghost" onClick={() => endMatch({ state: 'idle' })}>■ Stop listening for the A</Button>
                  : <Button variant="ghost" onClick={startMatch} disabled={status === 'asking'}>🎙️ Listen for the A</Button>}
                <div role="status" aria-live="polite" className="mt-2 text-sm" data-pitch-heard>
                  {matching && <p className="text-navy">Play an A on the organ or piano, and hold it.</p>}
                  {match.state === 'lost' && <p className="text-navy">No steady A heard. Hold it a little longer and try again.</p>}
                  {match.state === 'heard' && (
                    <div>
                      <p className="text-navy">Heard <strong className="tabular-nums">{match.hz.toFixed(1)} Hz</strong></p>
                      {clampA4(match.hz) === a4
                        ? <p className="mt-1 text-gray-600">That is your concert pitch already.</p>
                        : (
                          <div className="mt-2 flex flex-wrap justify-center gap-2">
                            <Button onClick={() => { const hz = clampA4(match.hz); calibrate(hz); setMatch({ state: 'used', hz }); }}>
                              Use {clampA4(match.hz)} Hz
                            </Button>
                            <Button variant="ghost" onClick={() => setMatch({ state: 'idle' })}>Keep {a4} Hz</Button>
                          </div>
                        )}
                    </div>
                  )}
                  {match.state === 'used' && (
                    <p className="font-semibold text-[color:var(--music-accent)]">✓ A = {match.hz} Hz</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-4">
        <AdvancedToggle folder="tuner" on={advanced} onChange={setAdvanced} what="Sing a note and see if you hit it." />
      </Card>
      {advanced && (
        <>
          <SingTheNote tuner={tuner} a4={a4} />
          <Card className="p-4">
            <button
              type="button"
              aria-expanded={more}
              onClick={() => setMore((o) => !o)}
              className="tap flex w-full items-center justify-between gap-3 text-left"
              data-tuner-more
            >
              <span>
                <span className="block text-base font-bold text-navy">More tools</span>
                <span className="block text-xs text-gray-500">Voice trail · Drone · Instrument</span>
              </span>
              <Chevron open={more} />
            </button>
          </Card>
          {more && (
            <>
              <PitchTrail reading={held ? null : reading} a4={a4} listening={listening} />
              <Drone a4={a4} />
              <InstrumentChoice value={instrument} onChange={setInstrument} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className={`h-5 w-5 shrink-0 text-gray-500 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 8 5 5 5-5" />
    </svg>
  );
}

function RoundButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="tap grid h-11 w-11 place-items-center rounded-full bg-white text-2xl font-bold text-navy ring-1 ring-navy/20 disabled:opacity-40"
    >
      {children}
    </button>
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
 * How far off, as a dial: flat to the left, sharp to the right, the zone that
 * counts as in tune (IN_TUNE_CENTS either side) in the Music room's green, a
 * bold line for perfect pitch, and a marker on the arc that turns green inside
 * the zone.
 * The note sits in the middle of it. Ink and green both follow the look.
 *
 * The first scale (6 October 2026) was redrawn after the owner, in Dark Aero,
 * said: "I can't see where's the fine line for perfect pitch." This dial, of
 * 15 October 2026, keeps that bold centre and green zone, and drops the words
 * around it: "Let the design speak for itself."
 */
const DIAL = { cx: 120, cy: 126, r: 104, sweep: 62 };
const onDial = (cents: number, r: number) => {
  const a = ((Math.max(-50, Math.min(50, cents)) / 50) * DIAL.sweep * Math.PI) / 180;
  return { x: DIAL.cx + r * Math.sin(a), y: DIAL.cy - r * Math.cos(a) };
};
const arc = (from: number, to: number, r: number) => {
  const a = onDial(from, r);
  const b = onDial(to, r);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${r} ${r} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
};

function Gauge({ cents, inTune, children }: { cents: number | null; inTune: boolean; children: ReactNode }) {
  const outer = onDial(cents ?? 0, DIAL.r + 10);
  const inner = onDial(cents ?? 0, DIAL.r - 22);
  return (
    <div
      className="relative w-full max-w-[20rem] text-navy"
      role="meter"
      aria-label="How far off the note"
      aria-valuemin={-50}
      aria-valuemax={50}
      aria-valuenow={cents ?? 0}
      aria-valuetext={cents === null ? 'No note' : inTune ? 'In tune' : `${cents} cents ${cents < 0 ? 'flat' : 'sharp'}`}
    >
      <svg viewBox="0 0 240 140" className="block w-full" aria-hidden="true">
        <path d={arc(-50, 50, DIAL.r)} fill="none" stroke="currentColor" strokeOpacity="0.14" strokeWidth="10" strokeLinecap="round" />
        <path
          d={arc(-IN_TUNE_CENTS, IN_TUNE_CENTS, DIAL.r)}
          fill="none"
          stroke="var(--music-accent)"
          strokeOpacity={inTune ? 0.9 : 0.5}
          strokeWidth="16"
          data-tuner-zone
        />
        {Array.from({ length: 11 }, (_, i) => i * 10 - 50).filter((c) => c !== 0).map((c) => {
          const a = onDial(c, DIAL.r - 14);
          const b = onDial(c, DIAL.r - (c % 50 === 0 ? 26 : 20));
          return <line key={c} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeOpacity={c % 50 === 0 ? 0.55 : 0.3} strokeWidth="2" strokeLinecap="round" />;
        })}
        {/* Perfect pitch: the bold line at the top. */}
        <line
          x1={onDial(0, DIAL.r + 12).x} y1={onDial(0, DIAL.r + 12).y} x2={onDial(0, DIAL.r - 24).x} y2={onDial(0, DIAL.r - 24).y}
          stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-navy" data-tuner-centre
        />
        <text x={onDial(-50, DIAL.r).x - 6} y={DIAL.cy - 18} textAnchor="middle" className="fill-current text-[15px] font-bold" opacity="0.45">♭</text>
        <text x={onDial(50, DIAL.r).x + 6} y={DIAL.cy - 18} textAnchor="middle" className="fill-current text-[15px] font-bold" opacity="0.45">♯</text>
        {cents !== null && (
          // The marker rides the arc, so the note in the middle is never crossed.
          <line
            x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y}
            stroke="currentColor" strokeWidth="9" strokeLinecap="round"
            className={inTune ? 'text-[color:var(--music-accent)]' : 'text-navy'}
            data-tuner-needle
          />
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-6 flex justify-center">{children}</div>
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

  const sound = (m = midi) => {
    quiet();
    const audio = openAudio();
    if (!audio) return;
    ctx.current = audio;
    note(audio, audio.destination, midiToHz(m, a4), audio.currentTime + 0.05, PIPE_SECONDS, 1);
    setSounding(true);
    done.current = window.setTimeout(quiet, (PIPE_SECONDS + 0.3) * 1000);
  };
  const step = (by: number) => {
    const next = Math.max(PIPE_NOTES[0], Math.min(PIPE_NOTES[PIPE_NOTES.length - 1], midi + by));
    setMidi(next);
    if (sounding) sound(next);
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2" data-pitch-pipe>
        <h2 className="min-w-0 text-base font-bold leading-tight text-navy">Starting note</h2>
        <div className="flex shrink-0 items-center gap-1">
          <RoundButton label="A semitone lower" onClick={() => step(-1)} disabled={midi <= PIPE_NOTES[0]}>−</RoundButton>
          <span
            className="w-12 text-center text-2xl font-extrabold tabular-nums text-navy"
            title={`${midiToHz(midi, a4).toFixed(1)} Hz`}
            data-pipe-note
          >
            {midiName(midi)}
          </span>
          <RoundButton label="A semitone higher" onClick={() => step(1)} disabled={midi >= PIPE_NOTES[PIPE_NOTES.length - 1]}>+</RoundButton>
          <button
            type="button"
            onClick={() => (sounding ? quiet() : sound())}
            aria-label={sounding ? 'Stop' : `Play ${midiName(midi)}`}
            className="tap ml-1 grid h-11 w-11 place-items-center rounded-full bg-navy text-white shadow-sm"
            data-pipe-play
          >
            {sounding
              ? <span aria-hidden="true" className="block h-3.5 w-3.5 rounded-sm bg-current" />
              : <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z" /></svg>}
          </button>
        </div>
      </div>
    </Card>
  );
}
