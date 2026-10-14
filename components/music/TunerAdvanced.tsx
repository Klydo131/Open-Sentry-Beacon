'use client';

// The Tuner's Advanced settings: a trail of your voice, a drone to sing
// against, and notes as a transposing instrument reads them.
//
// The trail draws only what the tuner has already measured; it keeps the last
// ten seconds in memory and nothing else, and forgets it when the folder is
// left. The drone is made on the phone like every other sound in the room.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { INSTRUMENT_KEYS, TRAIL_BREATH_MS, TRAIL_SPAN, midiName, midiToHz, toSemitones, trailBand, trailLines, type InstrumentKey, type Reading } from '@/lib/music/notes';
import { TIMBRES, TIMBRE_NAME, closeAudio, openAudio, sustain, type Timbre } from '@/lib/music/audio';
import { QUIET_EVENT } from '@/components/music/SingTheNote';

/** How much of the voice the trail shows. */
const TRAIL_SECONDS = 10;
/** How far the octave shown moves toward the voice each frame: a glide, not a jump. */
const GLIDE = 0.12;

type Point = { t: number; s: number };

/**
 * Your voice over the last ten seconds, against the notes, as a piano roll
 * shows them: a row for each semitone, one octave at a time, the octave
 * following the voice. Level is a steady note, a wave is a wobble, a slope is
 * a slide, and each note sung is a line of its own. Drawn on a canvas from the
 * tuner's readings, and only while it is listening.
 *
 * Redrawn on 14 October 2026, from the owner's phone: the old trail fitted
 * everything sung into one band, up to three octaves, so a stray reading
 * squeezed 31 rows into the chart with their names printed over each other,
 * and drew itself as a wall two octaves tall. "Not aesthetically pleasing...
 * it's too small to see." Now an octave is shown, every row is tall enough to
 * name, and a stray is left off (trailBand and trailLines, lib/music/notes.ts).
 */
export function PitchTrail({ reading, a4, listening }: { reading: Reading | null; a4: number; listening: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const points = useRef<Point[]>([]);
  /** The middle of the octave shown, gliding toward where the voice is. */
  const middle = useRef<number | null>(null);
  // The note heard now, and the last one heard, kept (dimmed) through a breath.
  const name = reading ? `${reading.name}${reading.octave}` : null;
  const [lastName, setLastName] = useState<string | null>(null);
  if (name && name !== lastName) setLastName(name);

  // Every reading the tuner shows becomes a point; older than ten seconds is forgotten.
  useEffect(() => {
    if (!reading) return;
    const s = toSemitones(reading.hz, a4);
    if (s === null) return;
    const t = performance.now();
    points.current = [...points.current.filter((p) => t - p.t <= TRAIL_SECONDS * 1000), { t, s }];
  }, [reading, a4]);

  useEffect(() => {
    const still = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const once = () => {
      const c = canvas.current;
      const g = c?.getContext('2d');
      if (c && g) paint(c, g, points.current, middle, still);
    };
    // Not listening: the rows are drawn once, so the chart is ready to read.
    if (!listening) {
      once();
      return;
    }
    let frame = 0;
    const draw = () => {
      once();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [listening]);

  return (
    <Card className="p-5">
      <div data-tuner-trail>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-navy">Your voice</h2>
            <p className="mt-1 text-sm text-gray-600">The last 10 seconds. Each row is a note.</p>
          </div>
          {lastName && (
            <p
              aria-hidden="true"
              data-tuner-trail-now
              className={`min-w-[4.5rem] shrink-0 rounded-2xl bg-gray-50 px-3 py-1.5 text-center text-3xl font-extrabold tabular-nums text-navy ring-2 ring-[color:var(--music-accent)] transition-opacity ${name ? '' : 'opacity-50'}`}
            >
              {lastName}
            </p>
          )}
        </div>
        <canvas
          ref={canvas}
          className="mt-4 block h-72 w-full rounded-2xl bg-gray-50 text-navy ring-1 ring-navy/10"
          // A canvas cannot read a CSS variable, so the Music room's green is
          // put on a border nobody sees and read back as a colour (paint, below).
          style={{ borderColor: 'var(--music-accent)' }}
          role="img"
          aria-label={reading ? `Your voice now: ${reading.name}${reading.octave}` : 'Your voice: nothing heard yet'}
        />
        <ul className="mt-3 grid grid-cols-3 gap-2 text-sm font-medium text-gray-600" aria-label="How to read it" data-tuner-trail-key>
          {TRAIL_KEY.map(([word, d]) => (
            <li key={word} className="flex items-center justify-center gap-2">
              <svg viewBox="0 0 28 16" className="h-4 w-7 shrink-0" aria-hidden="true">
                <path d={d} fill="none" stroke="var(--music-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {word}
            </li>
          ))}
        </ul>
        {!listening && (
          <p className="mt-2 text-sm text-gray-600">Press Start listening, above, and sing.</p>
        )}
      </div>
    </Card>
  );
}

/** The three shapes a voice draws, and what each means. */
const TRAIL_KEY: [string, string][] = [
  ['Steady', 'M3 8 H25'],
  ['Wobble', 'M3 8 C6 2 9 2 11 8 S16 14 18 8 S23 2 25 8'],
  ['Slide', 'M3 13 L25 3'],
];

/** A colour the browser reports ("rgb(…)", or "color(srgb …)" from light-dark()), at an opacity. */
function faded(colour: string, alpha: number): string {
  const n = colour.match(/[\d.]+/g)?.map(Number);
  if (!n || n.length < 3) return colour;
  const k = /^color\(srgb\b/.test(colour) ? 255 : 1;
  return `rgba(${Math.round(n[0] * k)}, ${Math.round(n[1] * k)}, ${Math.round(n[2] * k)}, ${alpha})`;
}

function paint(c: HTMLCanvasElement, g: CanvasRenderingContext2D, points: Point[], middle: { current: number | null }, still: boolean) {
  const ratio = window.devicePixelRatio || 1;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return;
  if (c.width !== Math.round(w * ratio) || c.height !== Math.round(h * ratio)) {
    c.width = Math.round(w * ratio);
    c.height = Math.round(h * ratio);
  }
  g.setTransform(ratio, 0, 0, ratio, 0, 0);
  g.clearRect(0, 0, w, h);
  const now = performance.now();
  const lines = trailLines(points.filter((p) => now - p.t <= TRAIL_SECONDS * 1000));
  const drawn = lines.flat();
  const newest = drawn[drawn.length - 1];
  const singing = newest && now - newest.t < TRAIL_BREATH_MS ? newest : null;

  // The octave shown glides to where the voice is (at once under Reduce Motion).
  const [low0, high0] = trailBand(drawn.map((p) => p.s));
  const target = (low0 + high0) / 2;
  const m0 = middle.current === null || still ? target : middle.current + (target - middle.current) * GLIDE;
  middle.current = Math.abs(m0 - target) < 0.01 ? target : m0;
  const low = middle.current - TRAIL_SPAN / 2;

  const left = 54;
  const right = w - 16;
  const top = 12;
  const bottom = h - 12;
  const row = (bottom - top) / TRAIL_SPAN;
  // How tall a note's row is, for the walk that checks a name fits in it.
  const tall = String(Math.round(row));
  if (c.dataset.rowPx !== tall) c.dataset.rowPx = tall;
  const yOf = (s: number) => bottom - (s - low) * row;
  const xOf = (t: number) => left + (1 - (now - t) / (TRAIL_SECONDS * 1000)) * (right - left);
  // The look's own text colour and font, so a dark look draws the rows light.
  const style = getComputedStyle(c);
  const ink = style.color || '#1e2a4a';
  const green = style.borderTopColor || '#0d9488';
  const font = style.fontFamily || 'system-ui, sans-serif';
  const sung = singing ? Math.round(singing.s) : null;

  g.textAlign = 'right';
  g.textBaseline = 'middle';
  for (let m = Math.floor(low); m <= Math.ceil(low + TRAIL_SPAN); m++) {
    const y = yOf(m);
    // A row half off the top or bottom fades, so no name is half shown.
    const edge = Math.max(0, Math.min(1, (Math.min(y - top, bottom - y) + row / 2) / row));
    if (edge <= 0) continue;
    const k = ((m % 12) + 12) % 12;
    const sharp = [1, 3, 6, 8, 10].includes(k);
    if (m === sung) {
      // The note being sung: its row lit in the Music room's green.
      g.globalAlpha = 0.16 * edge;
      g.fillStyle = green;
      g.fillRect(left, y - row / 2, right - left, row);
    } else if (sharp) {
      // Sharps and flats shaded, as the black keys are on a piano.
      g.globalAlpha = 0.06 * edge;
      g.fillStyle = ink;
      g.fillRect(left, y - row / 2, right - left, row);
    }
    // The line a note sung exactly in tune sits on; every C a little stronger.
    g.globalAlpha = (k === 0 ? 0.28 : 0.12) * edge;
    g.strokeStyle = ink;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(left, Math.round(y) + 0.5);
    g.lineTo(right, Math.round(y) + 0.5);
    g.stroke();
    if (!sharp || m === sung) {
      g.globalAlpha = (m === sung ? 1 : k === 0 ? 0.9 : 0.62) * edge;
      g.fillStyle = m === sung ? green : ink;
      g.font = `${m === sung || k === 0 ? 700 : 600} 14px ${font}`;
      g.fillText(midiName(m), left - 10, y);
    }
  }

  // The voice: each note a line of its own, the older part fainter.
  g.globalAlpha = 1;
  g.save();
  g.beginPath();
  g.rect(left - 8, top - 2, right - left + 16, bottom - top + 4);
  g.clip();
  const fade = g.createLinearGradient(left, 0, right, 0);
  fade.addColorStop(0, faded(green, 0.3));
  fade.addColorStop(1, faded(green, 1));
  g.strokeStyle = fade;
  g.lineWidth = 4;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.beginPath();
  for (const line of lines) {
    // Averaged over five readings (a twelfth of a second) and drawn as a
    // curve, so a vibrato is a wave and not a coil.
    const s = line.map((_, i) => {
      const near = line.slice(Math.max(0, i - 2), i + 3);
      return near.reduce((t, p) => t + p.s, 0) / near.length;
    });
    g.moveTo(xOf(line[0].t), yOf(s[0]));
    for (let i = 1; i < line.length; i++) {
      const x = xOf(line[i].t);
      const y = yOf(s[i]);
      if (i === line.length - 1) g.lineTo(x, y);
      else g.quadraticCurveTo(x, y, (x + xOf(line[i + 1].t)) / 2, (y + yOf(s[i + 1])) / 2);
    }
  }
  g.stroke();
  if (singing) {
    const x = xOf(singing.t);
    const y = yOf(singing.s);
    g.fillStyle = green;
    g.globalAlpha = 0.22;
    g.beginPath();
    g.arc(x, y, 11, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
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

  // Silent when the folder is left or the phone locks, and when Sing the note
  // starts: the tuner would hear the drone, not the singer.
  useEffect(() => {
    const hidden = () => { if (document.hidden) stop(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener(QUIET_EVENT, stop);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener(QUIET_EVENT, stop);
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
