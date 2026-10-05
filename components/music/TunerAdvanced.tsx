'use client';

// The Tuner's Advanced settings: a trail of your voice, a drone to sing
// against, and notes as a transposing instrument reads them.
//
// The trail draws only what the tuner has already measured; it keeps the last
// ten seconds in memory and nothing else, and forgets it when the folder is
// left. The drone is made on the phone like every other sound in the room.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { INSTRUMENT_KEYS, midiName, midiToHz, toSemitones, trailBand, type InstrumentKey, type Reading } from '@/lib/music/notes';
import { TIMBRES, TIMBRE_NAME, closeAudio, openAudio, sustain, type Timbre } from '@/lib/music/audio';

/** How much of the voice the trail shows. */
const TRAIL_SECONDS = 10;
/** A gap longer than this is a breath: the line is lifted, not drawn across it. */
const BREATH_MS = 250;

/**
 * Your voice over the last ten seconds, as a line against the notes: flat and
 * level is a steady note, a wave is a wobble, a slope is a slide. Drawn on a
 * canvas from the tuner's readings, and only while it is listening.
 */
export function PitchTrail({ reading, a4, listening }: { reading: Reading | null; a4: number; listening: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const points = useRef<{ t: number; s: number }[]>([]);

  // Every reading the tuner shows becomes a point; older than ten seconds is forgotten.
  useEffect(() => {
    if (!reading) return;
    const s = toSemitones(reading.hz, a4);
    if (s === null) return;
    const t = performance.now();
    points.current = [...points.current.filter((p) => t - p.t <= TRAIL_SECONDS * 1000), { t, s }];
  }, [reading, a4]);

  useEffect(() => {
    if (!listening) return;
    let frame = 0;
    const draw = () => {
      const c = canvas.current;
      const g = c?.getContext('2d');
      if (c && g) paint(c, g, points.current);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [listening]);

  return (
    <Card className="p-5">
      <div data-tuner-trail>
        <h2 className="text-xl font-bold text-navy">Your voice, the last 10 seconds</h2>
        <p className="mt-1 text-sm text-gray-600">
          A flat line is a steady note. A wave is a wobble; a slope is a slide. Each line across is a note.
        </p>
        <canvas
          ref={canvas}
          className="mt-3 block h-44 w-full rounded-2xl bg-gray-50 text-navy"
          role="img"
          aria-label={reading ? `Your voice now: ${reading.name}${reading.octave}` : 'Your voice: nothing heard yet'}
        />
        {!listening && (
          <p className="mt-2 text-sm text-gray-600">Press Start listening, above, and sing.</p>
        )}
      </div>
    </Card>
  );
}

function paint(c: HTMLCanvasElement, g: CanvasRenderingContext2D, points: { t: number; s: number }[]) {
  const ratio = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (c.width !== Math.round(w * ratio) || c.height !== Math.round(h * ratio)) {
    c.width = Math.round(w * ratio);
    c.height = Math.round(h * ratio);
  }
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, w, h);
  const now = performance.now();
  const recent = points.filter((p) => now - p.t <= TRAIL_SECONDS * 1000);
  const [low, high] = trailBand(recent.map((p) => p.s));
  const left = 34;
  const yOf = (s: number) => h - 8 - ((s - low) / (high - low)) * (h - 16);
  const xOf = (t: number) => left + (1 - (now - t) / (TRAIL_SECONDS * 1000)) * (w - left - 6);
  // The text colour of the look, so a dark look draws the lines light.
  const ink = getComputedStyle(c).color || '#1e2a4a';
  g.font = '10px system-ui, sans-serif';
  g.textBaseline = 'middle';
  for (let m = Math.ceil(low); m <= Math.floor(high); m++) {
    const natural = ![1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);
    g.globalAlpha = natural ? 0.22 : 0.08;
    g.strokeStyle = ink;
    g.beginPath();
    g.moveTo(left, yOf(m));
    g.lineTo(w - 4, yOf(m));
    g.stroke();
    if (natural) {
      g.globalAlpha = 0.7;
      g.fillStyle = ink;
      g.fillText(midiName(m), 2, yOf(m));
    }
  }
  g.globalAlpha = 1;
  g.strokeStyle = '#0d9488';
  g.lineWidth = 3;
  g.lineJoin = 'round';
  g.beginPath();
  recent.forEach((p, i) => {
    const x = xOf(p.t);
    const y = yOf(p.s);
    if (i === 0 || p.t - recent[i - 1].t > BREATH_MS) g.moveTo(x, y);
    else g.lineTo(x, y);
  });
  g.stroke();
  const last = recent[recent.length - 1];
  if (last && now - last.t < BREATH_MS) {
    g.fillStyle = '#0d9488';
    g.beginPath();
    g.arc(xOf(last.t), yOf(last.s), 5, 0, Math.PI * 2);
    g.fill();
  }
}

/** The drone's notes: the same range as the starting note. */
const DRONE_NOTES = Array.from({ length: 25 }, (_, i) => 48 + i);

/**
 * One note held for as long as it is wanted, to sing against: the surest way
 * to hear whether a voice is drifting. At the choir's concert pitch.
 */
export function Drone({ a4 }: { a4: number }) {
  const [midi, setMidi] = useState(60);
  const [timbre, setTimbre] = useState<Timbre>('organ');
  const [on, setOn] = useState(false);
  const ctx = useRef<AudioContext | null>(null);
  const release = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    release.current?.();
    release.current = null;
    const clock = ctx.current;
    ctx.current = null;
    // A moment for the note to fade, then its clock is closed.
    if (clock) window.setTimeout(() => closeAudio(clock), 300);
    setOn(false);
  }, []);

  const start = (note = midi, sound = timbre) => {
    release.current?.();
    let clock = ctx.current;
    if (!clock || clock.state === 'closed') {
      clock = openAudio();
      if (!clock) return;
      ctx.current = clock;
    }
    release.current = sustain(clock, clock.destination, midiToHz(note, a4), 0.8, sound);
    setOn(true);
  };

  // A change while it sounds is heard at once.
  const choose = (note: number, sound: Timbre) => {
    setMidi(note);
    setTimbre(sound);
    if (on) start(note, sound);
  };

  // Silent when the folder is left or the phone locks.
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      release.current?.();
      closeAudio(ctx.current);
      ctx.current = null;
    };
  }, [stop]);

  return (
    <Card className="p-5">
      <div data-tuner-drone>
        <h2 className="text-xl font-bold text-navy">Drone</h2>
        <p className="mt-1 text-sm text-gray-600">
          One note, held, to sing against. If your voice drifts you hear it rub against the drone.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <label htmlFor="drone-note" className="sr-only">Drone note</label>
          <select
            id="drone-note"
            value={midi}
            onChange={(e) => choose(Number(e.target.value), timbre)}
            className="tap rounded-xl bg-white px-4 text-base font-semibold text-navy ring-1 ring-navy/20"
          >
            {DRONE_NOTES.map((m) => <option key={m} value={m}>{midiName(m)}</option>)}
          </select>
          <label htmlFor="drone-sound" className="sr-only">Drone sound</label>
          <select
            id="drone-sound"
            value={timbre}
            onChange={(e) => choose(midi, e.target.value as Timbre)}
            className="tap rounded-xl bg-white px-4 text-base font-semibold text-navy ring-1 ring-navy/20"
          >
            {TIMBRES.map((t) => <option key={t} value={t}>{TIMBRE_NAME[t]}</option>)}
          </select>
          {on
            ? <Button variant="ghost" onClick={stop}>■ Stop the drone</Button>
            : <Button onClick={() => start()}>▶ Start the drone</Button>}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          With the tuner listening as well, wear headphones, or it hears the drone instead of you.
        </p>
      </div>
    </Card>
  );
}

/** Which instrument's notes the tuner shows. */
export function InstrumentChoice({ value, onChange }: { value: InstrumentKey; onChange: (k: InstrumentKey) => void }) {
  return (
    <Card className="p-5">
      <div data-tuner-instrument>
        <h2 className="text-xl font-bold text-navy">Your instrument</h2>
        <p className="mt-1 text-sm text-gray-600">
          A clarinet, trumpet, saxophone or horn reads its music higher than it sounds. Choose yours and the tuner
          shows the note you would read.
        </p>
        <label htmlFor="tuner-instrument" className="sr-only">Instrument</label>
        <select
          id="tuner-instrument"
          value={value}
          onChange={(e) => onChange(e.target.value as InstrumentKey)}
          className="tap mt-3 block w-full rounded-xl bg-white px-4 text-base font-semibold text-navy ring-1 ring-navy/20"
        >
          {INSTRUMENT_KEYS.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
        </select>
      </div>
    </Card>
  );
}
