'use client';

// The Mission pulse at the top of the church's numbers: what to act on first,
// how the journeys are moving, and whether the app itself is healthy. The
// arithmetic is lib/mission-pulse.ts; this only draws it, the same for the
// tutorial's sample church and a live one.
//
// MOVES, BUT ONLY TO SAY SOMETHING. Numbers count up to their value when the
// period changes, bars grow to their length, and a little bar chart in each
// tile shows the shape of the period. All of it is skipped for somebody who
// asked for less movement, and every number is plain text first.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/components/ui';
import { STAGES } from '@/lib/brand';
import { prefersLessMotion } from '@/lib/motion';
import {
  change, missionPulse, PERIODS, STALLED_AFTER_DAYS,
  type Measure, type PulseInput,
} from '@/lib/mission-pulse';

const PERIOD_KEY = 'hb-pulse-period';

function useCountUp(value: number): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (prefersLessMotion() || typeof requestAnimationFrame !== 'function') { setShown(value); from.current = value; return undefined; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / 450);
      const eased = 1 - (1 - k) ** 3;
      setShown(Math.round(a + (value - a) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

function Spark({ series, colour }: { series: number[]; colour: string }) {
  const peak = Math.max(1, ...series);
  const w = 100 / series.length;
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="mt-2 h-7 w-full" aria-hidden>
      {series.map((v, i) => {
        const h = v === 0 ? 1.5 : 3 + (v / peak) * 25;
        return <rect key={i} x={i * w + w * 0.15} width={w * 0.7} y={28 - h} height={h} rx={1} fill={v === 0 ? '#d7dce4' : colour} />;
      })}
    </svg>
  );
}

function Delta({ m, better }: { m: Measure; better: 'up' | 'down' | 'none' }) {
  const { diff, pct } = change(m);
  if (diff === 0) return <span className="text-xs font-semibold text-gray-500">Same as before</span>;
  const up = diff > 0;
  const good = better === 'none' ? null : (better === 'up') === up;
  const ink = good === null ? 'text-gray-600' : good ? 'text-green-700' : 'text-amber-800';
  return (
    <span className={`text-xs font-bold ${ink}`}>
      <span aria-hidden>{up ? '▲' : '▼'}</span> {up ? '+' : '−'}{Math.abs(diff)}{pct !== null ? ` (${up ? '+' : '−'}${Math.abs(pct)}%)` : ''}
      <span className="font-semibold text-gray-500"> vs before</span>
    </span>
  );
}

function Tile({ label, m, hint, better = 'up', colour = '#2F80ED' }: {
  label: string; m: Measure; hint: string; better?: 'up' | 'down' | 'none'; colour?: string;
}) {
  const n = useCountUp(m.now);
  return (
    <div className="flex flex-col rounded-2xl bg-white p-4 ring-1 ring-navy/10" data-pulse-tile>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tabular-nums text-navy" aria-label={`${m.now}`}>{n}</p>
      <Delta m={m} better={better} />
      <Spark series={m.series} colour={colour} />
      <p className="mt-1 text-xs text-gray-500">{hint}</p>
    </div>
  );
}

const TONE = {
  act: { ring: 'ring-amber-300', bg: 'bg-amber-50', ink: 'text-amber-900', badge: 'Act now' },
  watch: { ring: 'ring-sky-200', bg: 'bg-sky-50', ink: 'text-sky-900', badge: 'Keep an eye' },
  good: { ring: 'ring-green-200', bg: 'bg-green-50', ink: 'text-green-900', badge: 'All clear' },
} as const;

const days = (d: number | null) => (d === null ? 'not known' : d < 1 ? 'under a day' : `${Math.round(d)} day${Math.round(d) === 1 ? '' : 's'}`);
const pct = (r: number | null) => (r === null ? 'not known' : `${Math.round(r * 100)}%`);

export function MissionPulse({ load, live }: { load: () => Promise<PulseInput>; live: boolean }) {
  const [input, setInput] = useState<PulseInput | null>(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<number>(30);
  const [busy, setBusy] = useState(false);
  const [loadedIn, setLoadedIn] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    try { const saved = Number(localStorage.getItem(PERIOD_KEY)); if (PERIODS.some((p) => p.days === saved)) setPeriod(saved); } catch { /* private window */ }
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    const t0 = performance.now();
    try {
      setInput(await load());
      setLoadedIn(Math.round(performance.now() - t0));
      setError('');
    } catch {
      setError('The pulse could not be worked out just now. Try Refresh in a moment.');
    } finally { setBusy(false); }
  }, [load]);
  useEffect(() => { void refresh(); }, [refresh]);
  // "Updated 3 minutes ago" stays true without anybody touching the screen.
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  const pulse = useMemo(() => (input ? missionPulse(input, period) : null), [input, period]);
  const choose = (d: number) => { setPeriod(d); try { localStorage.setItem(PERIOD_KEY, String(d)); } catch { /* private window */ } };
  const ago = input ? Math.max(0, Math.round((Date.now() - input.now) / 60_000)) : 0;

  return (
    <Card className="p-4 sm:p-5" data-panel="mission-pulse">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-navy">💓 Mission pulse</h2>
          <p className="text-sm text-gray-500">
            What to act on first, how journeys are moving, and how the app is doing.
            {input && <> Updated {ago === 0 ? 'just now' : `${ago} min ago`}.</>}
          </p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={busy}
          className="tap-sm rounded-full bg-navy/5 px-4 text-sm font-bold text-navy hover:bg-navy/10 disabled:opacity-50" data-pulse-refresh>
          {busy ? 'Refreshing…' : '↻ Refresh'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p.days} type="button" aria-pressed={period === p.days} onClick={() => choose(p.days)}
            className="tap-sm rounded-full px-4 text-sm font-bold ring-1 ring-navy/15 aria-pressed:bg-navy aria-pressed:text-white aria-pressed:ring-navy"
            data-pulse-period={p.days}>
            {p.label}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
      {!pulse && !error && <p role="status" className="mt-6 text-center text-gray-500">Working out the pulse…</p>}

      {pulse && (
        <div className="mt-4 space-y-5">
          {/* 1. LEAD: what a leader can act on this week. */}
          <section aria-labelledby="pulse-attention">
            <h3 id="pulse-attention" className="text-base font-bold text-navy">Needs attention</h3>
            <ul className="mt-2 grid gap-2 md:grid-cols-2" data-pulse-attention>
              {pulse.attention.map((a) => {
                const t = TONE[a.tone];
                return (
                  <li key={a.key} className={`flex items-start gap-3 rounded-xl p-3 ring-1 ${t.ring} ${t.bg}`} data-attention={a.key}>
                    <span className={`shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${t.ink}`}>{t.badge}</span>
                    <span className={`text-sm ${t.ink}`}>{a.text}</span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* 2. LAG: what happened in the period, against the one before. */}
          <section aria-labelledby="pulse-outcomes">
            <h3 id="pulse-outcomes" className="text-base font-bold text-navy">In the last {PERIODS.find((p) => p.days === period)?.label}</h3>
            <div className="mt-2 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
              <Tile label="New Explorers" m={pulse.newExplorers} hint="Finished signing up." />
              <Tile label="Journey steps" m={pulse.steps} hint="Explorers moved on to a next stage." colour="#16a34a" />
              <Tile label="Commissioned" m={pulse.commissioned} hint="Reached the last stage." colour="#A9C24A" />
              <Tile label="Meetings held" m={pulse.meetingsHeld} hint="Guide and Explorer met, marked done." colour="#7c3aed" />
              <Tile label="New pairings" m={pulse.newPairings} hint="An Explorer given a Guide." />
              <Tile label="New Guides" m={pulse.newGuides} hint="Finished signing up." colour="#0f766e" />
              <Tile label="Invitations sent" m={pulse.invitesSent} hint={`${pulse.invitesWaiting} still waiting to be used.`} better="none" colour="#64748b" />
              <Tile label="Invitations used" m={pulse.invitesJoined} hint="The person finished signing up." colour="#0f766e" />
            </div>
          </section>

          {/* 3. The pathway: where every active journey is, and how long it has been there. */}
          <section aria-labelledby="pulse-pathway">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="pulse-pathway" className="text-base font-bold text-navy">The journey, right now</h3>
              <p className="text-xs text-gray-500">{pulse.activeJourneys} active · “stalled” = no step in {STALLED_AFTER_DAYS}+ days</p>
            </div>
            <ol className="mt-2 space-y-2" data-pulse-pathway>
              {pulse.pathway.map((row) => {
                const s = STAGES.find((x) => x.key === row.stage);
                const peak = Math.max(1, ...pulse.pathway.map((r) => r.count));
                return (
                  <li key={row.stage} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-sm sm:grid-cols-[8rem_1fr_auto]" data-stage={row.stage}>
                    <span className="truncate font-semibold text-navy">{s?.label ?? row.stage}</span>
                    <span className="h-6 overflow-hidden rounded-full bg-gray-100">
                      <span className="block h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${row.count ? Math.max(6, (row.count / peak) * 100) : 0}%`, background: s?.color ?? '#2F80ED' }} />
                    </span>
                    <span className="whitespace-nowrap text-right tabular-nums text-gray-700">
                      <strong className="text-navy">{row.count}</strong>
                      {row.count > 0 && <span className="hidden text-xs text-gray-500 sm:inline"> · {days(row.medianDays)} here</span>}
                      {row.stalled > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-900">{row.stalled} stalled</span>}
                    </span>
                  </li>
                );
              })}
            </ol>
          </section>

          {/* 4. People and engagement (lead), and 5. the app's own health (for IT). */}
          <div className="grid gap-3 md:grid-cols-2">
            <section aria-labelledby="pulse-people" className="rounded-2xl bg-slate-50 p-4">
              <h3 id="pulse-people" className="text-base font-bold text-navy">People and engagement</h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm" data-pulse-people>
                <dt className="text-gray-600">Explorers</dt><dd className="text-right font-bold tabular-nums text-navy">{pulse.explorers}</dd>
                <dt className="text-gray-600">Guides</dt><dd className="text-right font-bold tabular-nums text-navy">{pulse.guides}</dd>
                <dt className="text-gray-600">Waiting for a Guide</dt><dd className="text-right font-bold tabular-nums text-navy">{pulse.unpaired}{pulse.unpaired > 0 && <span className="font-normal text-gray-500"> · middle wait {days(pulse.waitMedianDays)}</span>}</dd>
                <dt className="text-gray-600">New Explorers given a Guide</dt><dd className="text-right font-bold tabular-nums text-navy">{pct(pulse.pairedShare)}</dd>
                {pulse.stickiness.map((s) => (
                  <Fragment key={s.role}><dt className="text-gray-600">{s.role === 'ds' ? 'Explorers' : 'Guides'} back this week</dt>
                    <dd className="text-right font-bold tabular-nums text-navy" title="Active this week out of active this month">{pct(s.ratio)}<span className="font-normal text-gray-500"> · {s.weekly} of {s.monthly}</span></dd></Fragment>
                ))}
              </dl>
              <p className="mt-2 text-xs text-gray-500">“Back this week” is weekly active out of monthly active: the usual measure of whether people keep coming back.</p>
            </section>
            <section aria-labelledby="pulse-system" className="rounded-2xl bg-slate-50 p-4">
              <h3 id="pulse-system" className="text-base font-bold text-navy">The app itself</h3>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm" data-pulse-system>
                <dt className="text-gray-600">Feedback not closed</dt><dd className="text-right font-bold tabular-nums text-navy">{pulse.feedbackOpen}</dd>
                <dt className="text-gray-600">Invitations waiting</dt><dd className="text-right font-bold tabular-nums text-navy">{pulse.invitesWaiting}</dd>
                <dt className="text-gray-600">Invitations expired</dt><dd className="text-right font-bold tabular-nums text-navy">{pulse.invitesExpired}</dd>
                <dt className="text-gray-600">Meetings in the next 14 days</dt><dd className="text-right font-bold tabular-nums text-navy">{pulse.meetingsAhead}</dd>
                <dt className="text-gray-600">These numbers loaded in</dt><dd className="text-right font-bold tabular-nums text-navy">{loadedIn === null ? 'not yet' : loadedIn < 100 ? 'under 0.1 s' : `${(loadedIn / 1000).toFixed(1)} s`}</dd>
                <dt className="text-gray-600">Data</dt><dd className="text-right font-bold text-navy">{live ? 'Your church' : 'Sample church'}</dd>
              </dl>
              <p className="mt-2 text-xs text-gray-500">A load time that keeps rising is the first sign the app needs attention. Errors and speed per screen are in your hosting dashboard.</p>
            </section>
          </div>
        </div>
      )}
    </Card>
  );
}
