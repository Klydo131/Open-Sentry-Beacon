'use client';

// The Conductor folder: a metronome that beats the way a conductor does.
//
// The clicks come from lib/music/metronome.ts, on the audio clock. The baton
// is drawn from the same clock every frame: a dot that falls into each beat
// of the pattern (2, 3, 4 or 6) and rises out of it, so the choir can watch
// the beat as well as hear it. It can also run silent, the baton alone, for a
// conductor following it during a service.
//
// The dot is moved by setting its position directly each frame rather than
// through React state, so the page does not re-render sixty times a second;
// only the beat number does, once a beat.

import { useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { useMetronome } from '@/lib/music/metronome';
import { METERS, PATTERNS, TEMPO_MAX, TEMPO_MIN, batonAt, tap, tempoName, type Meter } from '@/lib/music/beat';
import { prefersLessMotion } from '@/lib/motion';

const METER_LABEL: Record<Meter, string> = { 2: '2/4', 3: '3/4', 4: '4/4', 6: '6/8' };

export function ConductorPanel() {
  const metronome = useMetronome();
  const { running, bpm, meter, setBpm, setMeter, sound, setSound, now } = metronome;
  const hand = useRef<SVGCircleElement>(null);
  const taps = useRef<number[]>([]);
  const [beat, setBeat] = useState<number | null>(null);

  // The baton, every frame while running.
  useEffect(() => {
    if (!running) { setBeat(null); return; }
    // Under reduced motion the dot steps from beat to beat instead of flying.
    const still = prefersLessMotion();
    let frame = 0;
    let shown = -1;
    const draw = () => {
      const at = now();
      if (at) {
        const [x, y] = batonAt(meter, at.beat, still ? 0 : at.phase);
        hand.current?.setAttribute('cx', x.toFixed(2));
        hand.current?.setAttribute('cy', y.toFixed(2));
        if (at.beat !== shown) { shown = at.beat; setBeat(at.beat); }
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [running, meter, now]);

  // The screen stays on while the baton is moving: a conductor's phone going
  // dark mid-hymn is the failure this prevents. Released when it stops.
  useEffect(() => {
    if (!running) return;
    type Lock = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (kind: 'screen') => Promise<Lock> } };
    let lock: Lock | null = null;
    let gone = false;
    nav.wakeLock?.request('screen')
      .then((l) => { if (gone) void l.release().catch(() => {}); else lock = l; })
      .catch(() => { /* not offered here; the baton still works */ });
    return () => { gone = true; void lock?.release().catch(() => {}); };
  }, [running]);

  const onTap = () => {
    const next = tap(taps.current, performance.now());
    taps.current = next.taps;
    if (next.bpm) setBpm(next.bpm);
  };

  const points = PATTERNS[meter];
  const [restX, restY] = points[0];

  return (
    <div className="space-y-5" data-music-conductor>
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-navy">Conductor</h2>
            <p className="mt-1 text-sm text-gray-600">Keeps the beat, and shows it the way a conductor&rsquo;s hand does.</p>
          </div>
          {running
            ? <Button variant="ghost" onClick={metronome.stop}>■ Stop</Button>
            : <Button onClick={() => { metronome.start(); }}>▶ Start</Button>}
        </div>

        <div className="mt-4 grid items-center gap-5 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <svg
            viewBox="0 0 100 100"
            className="mx-auto aspect-square w-full max-w-72 rounded-2xl bg-gray-50"
            role="img"
            aria-label={`${METER_LABEL[meter]} beat pattern${beat !== null ? `, beat ${beat + 1}` : ''}`}
            data-baton
          >
            {/* The pattern's path, faint, so the shape is there before it moves. */}
            <polyline
              points={[...points, points[0]].map(([x, y]) => `${x},${y}`).join(' ')}
              fill="none"
              stroke="currentColor"
              className="text-navy/15"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
            {points.map(([x, y], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r="5.5" className={beat === i ? 'fill-teal-700' : 'fill-white'} stroke="currentColor" strokeWidth="0.8" />
                <text
                  x={x}
                  y={y + 2.2}
                  textAnchor="middle"
                  fontSize="6"
                  fontWeight="700"
                  className={beat === i ? 'fill-white' : 'fill-navy'}
                >
                  {i + 1}
                </text>
              </g>
            ))}
            <circle ref={hand} cx={restX} cy={restY} r="4" className="fill-navy" opacity={running ? 0.9 : 0} data-baton-hand />
          </svg>

          <div className="space-y-4">
            <div>
              <p className="text-5xl font-extrabold tabular-nums text-navy" data-tempo>{bpm}</p>
              <p className="text-sm font-semibold text-gray-600">beats a minute · <span className="italic">{tempoName(bpm)}</span></p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" onClick={() => setBpm(bpm - 1)} disabled={bpm <= TEMPO_MIN}>− 1</Button>
              <Button variant="ghost" onClick={() => setBpm(bpm + 1)} disabled={bpm >= TEMPO_MAX}>+ 1</Button>
              <Button variant="gold" className="whitespace-nowrap" onClick={onTap}>👆 Tap the beat</Button>
            </div>
            <label className="block">
              <span className="sr-only">Tempo</span>
              <input
                id="conductor-tempo"
                type="range"
                min={TEMPO_MIN}
                max={TEMPO_MAX}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-full accent-teal-700"
              />
            </label>
            <p className="text-sm text-gray-600">Tap the beat a few times and the tempo follows your taps.</p>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">Time signature</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Time signature">
          {METERS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMeter(m)}
              aria-pressed={meter === m}
              className={`tap-sm rounded-xl px-4 font-bold ring-1 ${meter === m ? 'bg-navy text-white ring-navy' : 'bg-white text-navy ring-navy/20 hover:bg-sky-50'}`}
            >
              {METER_LABEL[m]}
            </button>
          ))}
        </div>
        <label className="mt-4 flex items-start gap-3 text-navy">
          <input
            id="conductor-sound"
            type="checkbox"
            checked={sound}
            onChange={(e) => setSound(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
          />
          <span>
            <span className="block font-semibold">Sound the clicks</span>
            <span className="block text-sm text-gray-500">Off, the baton keeps time in silence, for following during a service.</span>
          </span>
        </label>
      </Card>
    </div>
  );
}
