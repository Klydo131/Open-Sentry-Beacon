'use client';

// The Conductor's Advanced settings: clicks between beats, how each beat
// sounds, a count-in, a speed trainer, and tempos kept for the hymns a choir
// sings often. Every one leaves the metronome as it was until it is changed,
// and turning Advanced off puts them all back.

import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import type { Metronome } from '@/lib/music/metronome';
import {
  ACCENT_CYCLE, SUBDIVISIONS, TEMPO_MAX, TEMPO_MIN, TRAINER_DEFAULT,
  cleanName, cleanTempos, clampTempo, nextAccent, type Accent, type Meter, type SavedTempo, type Subdivision,
} from '@/lib/music/beat';

const METER_LABEL: Record<Meter, string> = { 2: '2/4', 3: '3/4', 4: '4/4', 6: '6/8' };
const SUB_LABEL: Record<Subdivision, string> = { 1: 'Beats only', 2: '2 to a beat', 3: '3 to a beat', 4: '4 to a beat' };
const ACCENT_LABEL: Record<Accent, string> = { loud: 'Loud', normal: 'Normal', silent: 'Silent' };
/** Tempos kept for the hymns a choir sings, on this phone. */
const TEMPOS_KEY = 'beacon:music-tempos';

export function ConductorAdvanced({ metronome }: { metronome: Metronome }) {
  const { meter, bpm, subdivision, setSubdivision, accents, setAccents, countIn, setCountIn, trainer, setTrainer } = metronome;
  const [saved, setSaved] = useState<SavedTempo[]>([]);
  const [name, setName] = useState('');

  useEffect(() => {
    try { setSaved(cleanTempos(JSON.parse(localStorage.getItem(TEMPOS_KEY) || '[]'))); } catch { /* none yet */ }
  }, []);
  const keep = (next: SavedTempo[]) => {
    const clean = cleanTempos(next);
    setSaved(clean);
    try { localStorage.setItem(TEMPOS_KEY, JSON.stringify(clean)); } catch { /* a convenience only */ }
  };
  const save = () => {
    const clean = cleanName(name);
    if (!clean) return;
    keep([...saved.filter((t) => t.name !== clean), { name: clean, bpm, meter }]);
    setName('');
  };

  const cycle = (beat: number) => setAccents(accents.map((a, i) => (i === beat ? nextAccent(a) : a)));
  const t = trainer ?? TRAINER_DEFAULT;
  const setT = (change: Partial<typeof t>) => setTrainer({ ...t, ...change });

  return (
    <>
      <Card className="p-5">
        <div data-conductor-subdivision>
          <h2 className="text-xl font-bold text-navy">Clicks between beats</h2>
          <p className="mt-1 text-sm text-gray-600">Quieter clicks between the beats, for fast notes and triplets.</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" role="group" aria-label="Clicks between beats">
            {SUBDIVISIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSubdivision(s)}
                aria-pressed={subdivision === s}
                className={`tap-sm rounded-xl px-3 font-bold ring-1 ${subdivision === s ? 'bg-navy text-white ring-navy' : 'bg-white text-navy ring-navy/20 hover:bg-sky-50'}`}
              >
                {SUB_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div data-conductor-accents>
          <h2 className="text-xl font-bold text-navy">Each beat</h2>
          <p className="mt-1 text-sm text-gray-600">
            Tap a beat to make it loud, normal or silent. A silent beat still moves the hand.
          </p>
          <div
            className="mt-3 grid gap-2"
            // Six beats of 6/8 are two groups of three; two to four beats sit in one row.
            style={{ gridTemplateColumns: `repeat(${accents.length === 6 ? 3 : accents.length}, minmax(0, 1fr))` }}
            role="group"
            aria-label="How each beat sounds"
          >
            {accents.map((a, i) => (
              <button
                key={i}
                type="button"
                onClick={() => cycle(i)}
                aria-label={`Beat ${i + 1}: ${ACCENT_LABEL[a]}. Tap to change.`}
                className={`tap-sm rounded-xl px-1 text-center ring-1 ${a === 'loud' ? 'bg-navy text-white ring-navy' : a === 'silent' ? 'bg-white text-gray-500 ring-navy/20 opacity-70' : 'bg-white text-navy ring-navy/20'}`}
                data-accent={a}
              >
                <span className="block text-xs">Beat {i + 1}</span>
                <span className="block text-sm font-bold">{ACCENT_LABEL[a]}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">{ACCENT_CYCLE.map((a) => ACCENT_LABEL[a]).join(', then ')}, then round again.</p>
        </div>
      </Card>

      <Card className="p-5">
        <div className="space-y-4" data-conductor-practice>
          <label className="flex items-start gap-3 text-navy">
            <input
              id="conductor-count-in"
              type="checkbox"
              checked={countIn}
              onChange={(e) => setCountIn(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
            />
            <span>
              <span className="block font-semibold">Count in, then silent</span>
              <span className="block text-sm text-gray-500">One bar of clicks to start the choir, then the hand keeps time without a sound.</span>
            </span>
          </label>

          <label className="flex items-start gap-3 text-navy">
            <input
              id="conductor-trainer"
              type="checkbox"
              checked={trainer !== null}
              onChange={(e) => setTrainer(e.target.checked ? { ...TRAINER_DEFAULT, target: Math.max(clampTempo(bpm + 20), TRAINER_DEFAULT.target) } : null)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-teal-700"
            />
            <span>
              <span className="block font-semibold">Speed trainer</span>
              <span className="block text-sm text-gray-500">Starts where you set it and gets a little faster as you go, for learning a hard passage.</span>
            </span>
          </label>
          {trainer && (
            <div className="grid gap-2 sm:grid-cols-3" data-conductor-trainer>
              <Stepper label="Faster by" unit="a minute" value={t.step} min={1} max={20} onChange={(v) => setT({ step: v })} />
              <Stepper label="Every" unit={t.every === 1 ? 'bar' : 'bars'} value={t.every} min={1} max={16} onChange={(v) => setT({ every: v })} />
              <Stepper label="Up to" unit="a minute" value={t.target} min={TEMPO_MIN} max={TEMPO_MAX} step={5} onChange={(v) => setT({ target: v })} />
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div data-conductor-saved>
          <h2 className="text-xl font-bold text-navy">Saved tempos</h2>
          <p className="mt-1 text-sm text-gray-600">Keep the tempo for a hymn, and pick it again with one tap. Kept on this phone.</p>
          <div className="mt-3 grid gap-2 sm:flex sm:items-center">
            <label htmlFor="conductor-tempo-name" className="sr-only">Name</label>
            <input
              id="conductor-tempo-name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              placeholder="A name, such as Hymn 100"
              className="tap w-full rounded-xl bg-white px-4 text-base text-navy ring-1 ring-navy/20 sm:min-w-0 sm:flex-1"
            />
            <Button onClick={save} disabled={!cleanName(name)}>Save {bpm} in {METER_LABEL[meter]}</Button>
          </div>
          {saved.length > 0 && (
            <ul className="mt-3 space-y-2">
              {[...saved].reverse().map((s) => (
                <li key={s.name} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { metronome.setMeter(s.meter); metronome.setBpm(s.bpm); }}
                    className="tap-sm min-w-0 flex-1 rounded-xl bg-white px-4 text-left ring-1 ring-navy/20 hover:bg-sky-50"
                    data-saved-tempo
                  >
                    <span className="block truncate font-bold text-navy">{s.name}</span>
                    <span className="block text-sm text-gray-600">{s.bpm} a minute · {METER_LABEL[s.meter]}</span>
                  </button>
                  <Button variant="ghost" onClick={() => keep(saved.filter((x) => x.name !== s.name))}>
                    <span aria-hidden>✕</span><span className="sr-only">Remove {s.name}</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </>
  );
}

function Stepper({ label, unit, value, min, max, step = 1, onChange }: {
  label: string; unit: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-gray-50 p-3 sm:block">
      <div className="shrink-0 whitespace-nowrap">
        <p className="text-sm font-bold text-navy">{label}</p>
        <p className="text-xs text-gray-500">{unit}</p>
      </div>
      <div className="flex items-center gap-2 sm:mt-1">
        <Button variant="ghost" className="px-3" onClick={() => onChange(Math.max(min, value - step))} disabled={value <= min}>
          <span aria-hidden>−</span><span className="sr-only">Less: {label}</span>
        </Button>
        <p className="min-w-10 text-center text-lg font-bold tabular-nums text-navy">{value}</p>
        <Button variant="ghost" className="px-3" onClick={() => onChange(Math.min(max, value + step))} disabled={value >= max}>
          <span aria-hidden>+</span><span className="sr-only">More: {label}</span>
        </Button>
      </div>
    </div>
  );
}
