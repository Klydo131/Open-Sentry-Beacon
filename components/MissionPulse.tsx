'use client';

// The Mission pulse at the top of the church's numbers. Five views over one
// set of records: what to act on, how journeys move, what goes with progress
// (correlations), the raw counts behind it all, and the app's own health. The
// arithmetic is lib/mission-pulse.ts and lib/mission-analysis.ts; this only
// draws it, the same for the tutorial's sample church and a live one.
//
// MOVES, BUT ONLY TO SAY SOMETHING. Numbers count up when the period changes,
// bars grow, a view settles in when chosen. All of it is skipped for somebody
// who asked for less movement, and every number is plain text first.

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { STAGES } from '@/lib/brand';
import { prefersLessMotion, settleIn } from '@/lib/motion';
import {
  change, missionPulse, PERIODS, STALLED_AFTER_DAYS,
  type Measure, type PulseInput,
} from '@/lib/mission-pulse';
import {
  chanceLine, countTable, findings, journeyRows, MIN_N, toCsv, type Finding,
} from '@/lib/mission-analysis';
import {
  AUTOMATIONS, briefing, defaultSettings, due, evaluate, guidesMessage, notification, planFollowUps,
  tidyAutomations, tidySettings, type AutomationKey, type AutomationMode, type AutomationState, type RuleSettings,
} from '@/lib/pulse-alerts';
import { AlertsView, AutomationsView } from '@/components/PulseAlerts';
import type { PulseActions } from '@/lib/pulse-alerts';
import { showLocalNotification } from '@/lib/push';

const PERIOD_KEY = 'hb-pulse-period';
const RULES_KEY = 'hb-pulse-rules';
const AUTO_KEY = 'hb-pulse-auto';
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'automations', label: 'Automations' },
  { key: 'journeys', label: 'Journeys' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'raw', label: 'Raw data' },
  { key: 'health', label: 'App health' },
] as const;
type Tab = (typeof TABS)[number]['key'];

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
      setShown(Math.round(a + (value - a) * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step); else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return shown;
}

function save(name: string, body: string) {
  const url = URL.createObjectURL(new Blob([String.fromCharCode(0xfeff), body], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Spark({ series, colour }: { series: number[]; colour: string }) {
  const peak = Math.max(1, ...series);
  const w = 100 / series.length;
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="mt-3 h-8 w-full" aria-hidden>
      {series.map((v, i) => {
        const h = v === 0 ? 1.5 : 3 + (v / peak) * 25;
        return <rect key={i} x={i * w + w * 0.15} width={w * 0.7} y={28 - h} height={h} rx={1.2} fill={v === 0 ? '#dfe3ea' : colour} />;
      })}
    </svg>
  );
}

function Delta({ m, better }: { m: Measure; better: 'up' | 'down' | 'none' }) {
  const { diff, pct } = change(m);
  if (diff === 0) return <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">Same as before</span>;
  const up = diff > 0;
  const good = better === 'none' ? null : (better === 'up') === up;
  const tone = good === null ? 'bg-slate-100 text-slate-700' : good ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>
      <span aria-hidden>{up ? '↑' : '↓'}</span>{up ? '+' : '−'}{Math.abs(diff)}{pct !== null ? ` · ${Math.abs(pct)}%` : ''}
      <span className="font-semibold opacity-75"> vs before</span>
    </span>
  );
}

function Tile({ label, m, hint, better = 'up', colour = '#2F80ED' }: {
  label: string; m: Measure; hint: string; better?: 'up' | 'down' | 'none'; colour?: string;
}) {
  const n = useCountUp(m.now);
  return (
    <div className="group flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80 transition duration-200 hover:-translate-y-0.5 hover:shadow-md" data-pulse-tile>
      <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colour }} />{label}
      </p>
      <p className="mt-2 text-[2rem] font-extrabold leading-none tabular-nums text-navy" aria-label={`${m.now}`}>{n}</p>
      <div className="mt-2"><Delta m={m} better={better} /></div>
      <Spark series={m.series} colour={colour} />
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </div>
  );
}

const TONE = {
  act: { ring: 'ring-amber-300/80', bg: 'bg-amber-50', ink: 'text-amber-900', dot: 'bg-amber-500', badge: 'Act now' },
  watch: { ring: 'ring-sky-200', bg: 'bg-sky-50', ink: 'text-sky-900', dot: 'bg-sky-500', badge: 'Keep an eye' },
  good: { ring: 'ring-emerald-200', bg: 'bg-emerald-50', ink: 'text-emerald-900', dot: 'bg-emerald-500', badge: 'All clear' },
} as const;

const days = (d: number | null) => (d === null ? 'not known' : d < 1 ? 'under a day' : `${Math.round(d)} day${Math.round(d) === 1 ? '' : 's'}`);
const pct = (r: number | null) => (r === null ? 'not known' : `${Math.round(r * 100)}%`);

const STRENGTH = {
  none: 'bg-slate-100 text-slate-700', weak: 'bg-sky-50 text-sky-800', moderate: 'bg-indigo-50 text-indigo-800', strong: 'bg-violet-100 text-violet-900',
} as const;

/** A scatter of one correlation: each dot is one journey, never named. */
function Scatter({ f }: { f: Finding }) {
  const xs = f.points.map((p) => p.x); const ys = f.points.map((p) => p.y);
  const [x0, x1] = [Math.min(0, ...xs), Math.max(1, ...xs)];
  const [y0, y1] = [Math.min(0, ...ys), Math.max(1, ...ys)];
  const sx = (v: number) => 12 + ((v - x0) / (x1 - x0 || 1)) * 176;
  const sy = (v: number) => 104 - ((v - y0) / (y1 - y0 || 1)) * 84;
  return (
    <svg viewBox="0 0 200 120" className="h-36 w-full" role="img" aria-label={`${f.n} journeys: ${f.x} against ${f.y}`}>
      <line x1="12" y1="108" x2="188" y2="108" stroke="#cbd5e1" />
      <line x1="12" y1="14" x2="12" y2="108" stroke="#cbd5e1" />
      {/* Journeys on the same point are ONE dot, sized and numbered, so none hides behind another. */}
      {[...f.points.reduce((m, p) => m.set(`${p.x}|${p.y}`, { ...p, k: (m.get(`${p.x}|${p.y}`)?.k ?? 0) + 1 }), new Map<string, { x: number; y: number; k: number }>()).values()].map((p) => (
        <g key={`${p.x}|${p.y}`}>
          <circle cx={sx(p.x)} cy={sy(p.y)} r={Math.min(11, 3.6 + Math.sqrt(p.k - 1) * 2.6)} fill="#4f46e5" fillOpacity="0.55" stroke="#312e81" strokeOpacity="0.4" />
          {p.k > 1 && <text x={sx(p.x)} y={sy(p.y) + 2.6} textAnchor="middle" fontSize="7" fontWeight="700" fill="#fff">{p.k}</text>}
        </g>
      ))}
      <text x="188" y="119" textAnchor="end" fontSize="8" fill="#64748b">{f.x} →</text>
      <text x="14" y="9" fontSize="8" fill="#64748b">↑ {f.y}</text>
    </svg>
  );
}

function FindingCard({ f }: { f: Finding }) {
  const drawable = f.points.length > 0 && (f.missing === undefined || f.missing === 'few' || f.missing === 'ties');
  return (
    <article className="flex flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80" data-pulse-finding={f.key}>
      <h4 className="font-bold text-navy">{f.question}</h4>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {f.r !== null && f.strength ? (
          <>
            <span className="text-2xl font-extrabold tabular-nums text-navy">r = {f.r > 0 ? '+' : ''}{f.r.toFixed(2)}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${STRENGTH[f.strength]}`}>{f.strength === 'none' ? 'no link' : `${f.strength} ${f.r > 0 ? 'positive' : 'negative'}`}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${f.likelyReal ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{f.likelyReal ? 'unlikely to be chance' : 'could be chance'}</span>
          </>
        ) : (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">Not enough to say</span>
        )}
        <span className="text-xs text-slate-500">{f.n} journey{f.n === 1 ? '' : 's'}</span>
      </div>
      {drawable && <Scatter f={f} />}
      <p className="mt-1 text-sm text-slate-700">{f.reading}</p>
    </article>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (<><dt className="text-slate-600">{label}</dt><dd className="text-right font-bold tabular-nums text-navy">{children}</dd></>);
}

export function MissionPulse({ load, live, actions }: { load: () => Promise<PulseInput>; live: boolean; actions: PulseActions }) {
  const [input, setInput] = useState<PulseInput | null>(null);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<number>(30);
  const [tab, setTab] = useState<Tab>('overview');
  const [busy, setBusy] = useState(false);
  const [loadedIn, setLoadedIn] = useState<number | null>(null);
  const [, tick] = useState(0);
  const panel = useRef<HTMLDivElement>(null);
  const [rules, setRules] = useState<RuleSettings>(defaultSettings);
  const [auto, setAuto] = useState<AutomationState>(() => tidyAutomations(null));
  const [mine, setMine] = useState<{ pairing_id: string; title: string; done_at: string | null }[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const ranFor = useRef<PulseInput | null>(null);

  useEffect(() => {
    try { const saved = Number(localStorage.getItem(PERIOD_KEY)); if (PERIODS.some((p) => p.days === saved)) setPeriod(saved); } catch { /* private window */ }
    try { setRules(tidySettings(JSON.parse(localStorage.getItem(RULES_KEY) ?? 'null'))); } catch { /* private window or damaged */ }
    try { setAuto(tidyAutomations(JSON.parse(localStorage.getItem(AUTO_KEY) ?? 'null'))); } catch { /* private window or damaged */ }
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    const t0 = performance.now();
    try {
      const [fresh, followUps] = await Promise.all([load(), actions.myFollowUps().catch(() => [])]);
      setInput(fresh);
      setMine(followUps);
      setLoadedIn(Math.round(performance.now() - t0));
      setError('');
    } catch {
      setError('The pulse could not be worked out just now. Try Refresh in a moment.');
    } finally { setBusy(false); }
  }, [load, actions]);
  useEffect(() => { void refresh(); }, [refresh]);
  // LIVE, NOT A SNAPSHOT. Changes to the records reload through `load` (the live
  // half re-creates it when the database says something changed); on top of that
  // a quiet check every two minutes while the screen is in view catches what
  // has no change event, such as who came back today.
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, 120_000);
    const back = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', back);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', back); };
  }, [refresh]);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 30_000); return () => clearInterval(t); }, []);

  const pulse = useMemo(() => (input ? missionPulse(input, period) : null), [input, period]);
  const rows = useMemo(() => (input ? journeyRows(input) : []), [input]);
  const found = useMemo(() => findings(rows), [rows]);
  const counts = useMemo(() => (input ? countTable(input, period) : []), [input, period]);
  const choose = (d: number) => { setPeriod(d); try { localStorage.setItem(PERIOD_KEY, String(d)); } catch { /* private window */ } };
  const open = (k: Tab) => { setTab(k); requestAnimationFrame(() => settleIn(panel.current, 'fade')); };
  const ago = input ? Math.max(0, Math.round((Date.now() - input.now) / 60_000)) : 0;
  const periodLabel = PERIODS.find((p) => p.days === period)?.label ?? '';
  const warnings = useMemo(() => (pulse && input ? evaluate(pulse, rows, input, rules, loadedIn) : []), [pulse, rows, input, rules, loadedIn]);
  const acts = warnings.length;
  const previews = useMemo(() => ({
    followups: input ? planFollowUps(warnings, mine, input.now) : [],
    guides: pulse ? guidesMessage(warnings, pulse) : null,
    notify: notification(warnings),
    briefing: pulse ? briefing(pulse, warnings, periodLabel, '', (k) => STAGES.find((x) => x.key === k)?.label ?? k) : '',
  }), [warnings, mine, input, pulse, periodLabel]);

  const saveRules = (next: RuleSettings) => { setRules(next); try { localStorage.setItem(RULES_KEY, JSON.stringify(next)); } catch { /* private window */ } };
  const saveAuto = (next: AutomationState) => { setAuto(next); try { localStorage.setItem(AUTO_KEY, JSON.stringify(next)); } catch { /* private window */ } };
  const note = (line: string) => setLog((l) => [`${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}  ${line}`, ...l].slice(0, 8));

  /** Carry out one automation. Returns what it did, in a sentence. */
  const run = useCallback(async (key: AutomationKey, by: 'you' | 'automatic') => {
    let said = '';
    if (key === 'followups') {
      for (const f of previews.followups) await actions.addFollowUp(f.pairingId, f.title, f.dueOn);
      said = `Added ${previews.followups.length} follow-up${previews.followups.length === 1 ? '' : 's'} to your list.`;
      setMine(await actions.myFollowUps().catch(() => mine));
    } else if (key === 'guides' && previews.guides) {
      await actions.postToGuides(previews.guides);
      said = actions.sample ? 'Sample church: the message was not posted anywhere.' : 'Posted to the Guides\u2019 room.';
    } else if (key === 'notify' && previews.notify) {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default' && by === 'you') await Notification.requestPermission().catch(() => 'denied');
      const allowed = typeof Notification !== 'undefined' && Notification.permission === 'granted';
      if (allowed) await showLocalNotification(previews.notify.title, previews.notify.body, '/admin');
      said = allowed ? 'Notification shown on this device.' : 'Notifications are not allowed on this device; turn them on in Settings.';
    }
    if (said) {
      note(`${by === 'automatic' ? 'Automatic: ' : ''}${said}`);
      setAuto((a) => { const next = { ...a, lastRun: { ...a.lastRun, [key]: new Date().toISOString() } }; try { localStorage.setItem(AUTO_KEY, JSON.stringify(next)); } catch { /* private window */ } return next; });
    }
  }, [previews, actions, mine]);

  // AUTOMATIC ONES RUN ONCE PER LOAD, and each only outside its quiet period.
  useEffect(() => {
    if (!input || !pulse || ranFor.current === input) return;
    ranFor.current = input;
    void (async () => {
      for (const def of AUTOMATIONS) {
        if (def.key === 'briefing') continue;
        const work = def.key === 'followups' ? previews.followups.length > 0 : def.key === 'guides' ? !!previews.guides : !!previews.notify;
        if (due(def, auto, work, Date.now())) { try { await run(def.key, 'automatic'); } catch { note(`Automatic ${def.label.toLowerCase()} could not run just now.`); } }
      }
    })();
  }, [input, pulse, previews, auto, run]);
  const activeN = rows.filter((r) => r.status === 'active').length;

  return (
    <section className="overflow-hidden rounded-3xl bg-slate-50 shadow-sm ring-1 ring-slate-200" data-panel="mission-pulse" aria-labelledby="pulse-title">
      {/* The header: the three numbers anybody asks first. */}
      <div className="bg-gradient-to-br from-[#1E2A4A] via-[#22406e] to-[#0f766e] px-4 pb-4 pt-5 text-white sm:px-6">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="pulse-title" className="text-xl font-extrabold tracking-tight sm:text-2xl">Mission pulse</h2>
            <p className="mt-0.5 text-sm text-white/75">
              What to act on, how journeys move, and what goes with progress.
              {input && <> <span className="inline-flex items-center gap-1 align-middle font-semibold text-white"><span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300 motion-reduce:animate-none" />Live</span> · updated {ago === 0 ? 'just now' : `${ago} min ago`}.</>}
            </p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={busy}
            className="tap-sm rounded-full bg-white/15 px-4 text-sm font-bold text-white ring-1 ring-white/25 transition hover:bg-white/25 disabled:opacity-60" data-pulse-refresh>
            {busy ? 'Refreshing…' : '↻ Refresh'}
          </button>
        </div>
        {pulse && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[
              { n: pulse.explorers, label: 'Explorers' },
              { n: pulse.activeJourneys, label: 'Active journeys' },
              { n: acts, label: 'Warnings' },
            ].map((h) => (
              <div key={h.label} className="rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/15">
                <p className="text-2xl font-extrabold tabular-nums">{h.n}</p>
                <p className="text-[11px] font-semibold uppercase leading-tight tracking-wider text-white/75">{h.label}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-4 p-3 sm:p-5">
        {/* Period, then the five views. */}
        <div className="grid w-full grid-cols-4 gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-slate-200 sm:inline-flex sm:w-auto" role="group" aria-label="Period">
          {PERIODS.map((p) => (
            <button key={p.days} type="button" aria-pressed={period === p.days} onClick={() => choose(p.days)}
              className="tap-sm whitespace-nowrap rounded-full px-1 text-[13px] font-bold text-slate-600 transition aria-pressed:bg-navy sm:px-3.5 sm:text-sm aria-pressed:text-white aria-pressed:shadow"
              data-pulse-period={p.days}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="-mx-3 overflow-x-auto px-3 sm:mx-0 sm:px-0">
          <div className="flex min-w-max gap-1 border-b border-slate-200" role="tablist" aria-label="Views">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => open(t.key)}
                className="tap-sm -mb-px border-b-2 border-transparent px-3 text-sm font-bold text-slate-500 transition hover:text-navy aria-selected:border-navy aria-selected:text-navy"
                data-pulse-tab={t.key}>
                {t.label}
                {t.key === 'alerts' && acts > 0 && <span className="ml-1.5 inline-grid min-w-5 place-items-center rounded-full bg-rose-600 px-1.5 text-[11px] font-extrabold text-white" data-alert-count>{acts}</span>}
              </button>
            ))}
          </div>
        </div>

        {error && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
        {!pulse && !error && <p role="status" className="py-8 text-center text-slate-500">Working out the pulse…</p>}

        {pulse && (
          <div ref={panel} role="tabpanel" aria-label={TABS.find((t) => t.key === tab)?.label}>
            {tab === 'overview' && (
              <div className="space-y-5">
                <section aria-labelledby="pulse-attention">
                  <h3 id="pulse-attention" className="text-base font-bold text-navy">Needs attention</h3>
                  <ul className="mt-2 grid gap-2 md:grid-cols-2" data-pulse-attention>
                    {pulse.attention.map((a) => {
                      const t = TONE[a.tone];
                      return (
                        <li key={a.key} className={`flex items-start gap-3 rounded-2xl p-3 ring-1 ${t.ring} ${t.bg}`} data-attention={a.key}>
                          <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${t.dot}`} />
                          <span className={`text-sm ${t.ink}`}><strong className="mr-1">{t.badge}.</strong>{a.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
                <section aria-labelledby="pulse-outcomes">
                  <h3 id="pulse-outcomes" className="text-base font-bold text-navy">In the last {periodLabel}</h3>
                  <div className="mt-2 grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 sm:gap-3 xl:grid-cols-4">
                    <Tile label="New Explorers" m={pulse.newExplorers} hint="Finished signing up." />
                    <Tile label="Journey steps" m={pulse.steps} hint="Moved on to a next stage." colour="#16a34a" />
                    <Tile label="Commissioned" m={pulse.commissioned} hint="Reached the last stage." colour="#84cc16" />
                    <Tile label="Meetings held" m={pulse.meetingsHeld} hint="Guide and Explorer met." colour="#7c3aed" />
                    <Tile label="New pairings" m={pulse.newPairings} hint="An Explorer given a Guide." colour="#0ea5e9" />
                    <Tile label="New Guides" m={pulse.newGuides} hint="Finished signing up." colour="#0f766e" />
                    <Tile label="Invitations sent" m={pulse.invitesSent} hint={`${pulse.invitesWaiting} still waiting to be used.`} better="none" colour="#64748b" />
                    <Tile label="Invitations used" m={pulse.invitesJoined} hint="The person finished signing up." colour="#14b8a6" />
                  </div>
                </section>
              </div>
            )}

            {tab === 'alerts' && (
              <AlertsView warnings={warnings} settings={rules}
                onChange={(key, patch) => saveRules({ ...rules, [key]: { ...rules[key], ...patch } })}
                onReset={() => saveRules(defaultSettings())} />
            )}

            {tab === 'automations' && (
              <AutomationsView state={auto} previews={previews} sample={actions.sample} log={log}
                onMode={(key: AutomationKey, mode: AutomationMode) => saveAuto({ ...auto, mode: { ...auto.mode, [key]: mode } })}
                onRun={async (key) => { try { await run(key, 'you'); } catch { note('That could not be done just now. Try again in a moment.'); } }} />
            )}

            {tab === 'journeys' && (
              <div className="space-y-4">
                <section aria-labelledby="pulse-pathway" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 id="pulse-pathway" className="text-base font-bold text-navy">The journey, right now</h3>
                    <p className="text-xs text-slate-500">{pulse.activeJourneys} active · stalled = no step in {STALLED_AFTER_DAYS}+ days</p>
                  </div>
                  <ol className="mt-3 space-y-2.5" data-pulse-pathway>
                    {pulse.pathway.map((row) => {
                      const s = STAGES.find((x) => x.key === row.stage);
                      const peak = Math.max(1, ...pulse.pathway.map((r) => r.count));
                      const c = s?.color ?? '#2F80ED';
                      return (
                        <li key={row.stage} className="grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-sm sm:grid-cols-[8rem_1fr_auto]" data-stage={row.stage}>
                          <span className="truncate font-semibold text-navy">{s?.label ?? row.stage}</span>
                          <span className="h-7 overflow-hidden rounded-full bg-slate-100">
                            <span className="block h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${row.count ? Math.max(6, (row.count / peak) * 100) : 0}%`, background: `linear-gradient(90deg, ${c}bb, ${c})` }} />
                          </span>
                          <span className="whitespace-nowrap text-right tabular-nums text-slate-700">
                            <strong className="text-navy">{row.count}</strong>
                            {row.count > 0 && <span className="hidden text-xs text-slate-500 sm:inline"> · {days(row.medianDays)} here</span>}
                            {row.stalled > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-xs font-bold text-amber-900">{row.stalled} stalled</span>}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </section>
                <section aria-labelledby="pulse-people" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
                  <h3 id="pulse-people" className="text-base font-bold text-navy">People and engagement</h3>
                  <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm" data-pulse-people>
                    <Stat label="Explorers">{pulse.explorers}</Stat>
                    <Stat label="Guides">{pulse.guides}</Stat>
                    <Stat label="Waiting for a Guide">{pulse.unpaired}{pulse.unpaired > 0 && <span className="font-normal text-slate-500"> · middle wait {days(pulse.waitMedianDays)}</span>}</Stat>
                    <Stat label="New Explorers given a Guide">{pct(pulse.pairedShare)}</Stat>
                    {pulse.guidesUnsigned !== null && <Stat label="Guides who signed their commitments">{pulse.guides - pulse.guidesUnsigned} of {pulse.guides}</Stat>}
                    {pulse.stickiness.map((s) => (
                      <Fragment key={s.role}>
                        <Stat label={`${s.role === 'ds' ? 'Explorers' : 'Guides'} back this week`}>{pct(s.ratio)}<span className="font-normal text-slate-500"> · {s.weekly} of {s.monthly}</span></Stat>
                      </Fragment>
                    ))}
                  </dl>
                  <p className="mt-2 text-xs text-slate-500">Back this week is weekly active out of monthly active: the usual measure of whether people keep coming back.</p>
                </section>
              </div>
            )}

            {tab === 'analysis' && (
              <div className="space-y-3" data-pulse-analysis>
                <p className="rounded-2xl bg-white p-3 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200/80">
                  Each dot is one journey, never named. <strong>r</strong> runs from −1 to +1 (Spearman, by rank, suited to small numbers).
                  Nothing is worked out under {MIN_N} journeys, and a link a sample this size could make by chance says so
                  {activeN >= MIN_N ? ` (with ${activeN} active journeys, anything inside about ±${chanceLine(activeN).toFixed(2)})` : ''}.
                  A link is not a cause: it is a question worth asking a Guide.
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  {found.map((f) => <FindingCard key={f.key} f={f} />)}
                </div>
              </div>
            )}

            {tab === 'raw' && (
              <div className="space-y-4" data-pulse-raw>
                <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-navy">Counts in the last {periodLabel}</h3>
                    <button type="button" className="tap-sm rounded-full bg-navy px-4 text-sm font-bold text-white" data-pulse-csv="counts"
                      onClick={() => save(`mission-pulse-counts-${period}d.csv`, toCsv(['From', 'New Explorers', 'New Guides', 'New pairings', 'Journey steps', 'Meetings held', 'Invitations sent'],
                        counts.map((c) => [c.label, c.explorers, c.guides, c.pairings, c.steps, c.meetings, c.invitations])))}>
                      Download CSV
                    </button>
                  </div>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[34rem] text-sm tabular-nums">
                      <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>{['From', 'Explorers', 'Guides', 'Pairings', 'Steps', 'Meetings', 'Invitations'].map((h) => <th key={h} className="px-2 py-1.5 font-bold">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {counts.map((c, i) => (
                          <tr key={`${c.label}-${i}`} className="border-t border-slate-100 odd:bg-slate-50/60" data-count-row>
                            <td className="px-2 py-1.5 font-semibold text-navy">{c.label}</td>
                            {[c.explorers, c.guides, c.pairings, c.steps, c.meetings, c.invitations].map((v, k) => <td key={k} className="px-2 py-1.5">{v}</td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-base font-bold text-navy">One row per journey</h3>
                    <button type="button" className="tap-sm rounded-full bg-navy px-4 text-sm font-bold text-white" data-pulse-csv="journeys"
                      onClick={() => save('mission-pulse-journeys.csv', toCsv(['Journey', 'Status', 'Stage', 'Track', 'Days since start', 'Days waited for a Guide', 'Steps forward', 'Steps per month', 'Days since last step', 'Guide carries', 'Meetings held'],
                        rows.map((r) => [r.n, r.status, STAGES.find((s) => s.key === r.stage)?.label ?? r.stage, r.track, r.ageDays, r.waitDays, r.steps, r.pace, r.daysSinceStep, r.guideLoad, r.meetings])))}>
                      Download CSV
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Numbered, never named. The same rows the analysis uses.</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[46rem] text-sm tabular-nums">
                      <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>{['#', 'Status', 'Stage', 'Track', 'Age (d)', 'Waited (d)', 'Steps', 'Per month', 'Since step (d)', 'Guide carries', 'Meetings'].map((h) => <th key={h} className="px-2 py-1.5 font-bold">{h}</th>)}</tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.n} className="border-t border-slate-100 odd:bg-slate-50/60" data-journey-row>
                            <td className="px-2 py-1.5 font-semibold text-navy">{r.n}</td>
                            <td className="px-2 py-1.5">{r.status}</td>
                            <td className="px-2 py-1.5">{STAGES.find((s) => s.key === r.stage)?.label ?? r.stage}</td>
                            <td className="px-2 py-1.5">{r.track === 'digital' ? 'Digital' : 'In person'}</td>
                            <td className="px-2 py-1.5">{r.ageDays}</td>
                            <td className="px-2 py-1.5">{r.waitDays ?? 'not known'}</td>
                            <td className="px-2 py-1.5">{r.steps}</td>
                            <td className="px-2 py-1.5">{r.pace}</td>
                            <td className="px-2 py-1.5">{r.daysSinceStep}</td>
                            <td className="px-2 py-1.5">{r.guideLoad}</td>
                            <td className="px-2 py-1.5">{r.meetings ?? 'private'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}

            {tab === 'health' && (
              <section aria-labelledby="pulse-system" className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
                <h3 id="pulse-system" className="text-base font-bold text-navy">The app itself</h3>
                <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm" data-pulse-system>
                  <Stat label="Feedback not closed">{pulse.feedbackOpen}</Stat>
                  <Stat label="Invitations waiting">{pulse.invitesWaiting}</Stat>
                  <Stat label="Invitations expired">{pulse.invitesExpired}</Stat>
                  <Stat label="Meetings in the next 14 days">{pulse.meetingsAhead}</Stat>
                  <Stat label="These numbers loaded in">{loadedIn === null ? 'not yet' : loadedIn < 100 ? 'under 0.1 s' : `${(loadedIn / 1000).toFixed(1)} s`}</Stat>
                  <Stat label="Records read">{input ? input.members.length + input.pairings.length + input.moves.length + input.meetings.length + input.invites.length : 0}</Stat>
                  <Stat label="Data">{live ? 'Your church' : 'Sample church'}</Stat>
                </dl>
                <p className="mt-2 text-xs text-slate-500">A load time that keeps rising as records grow is the first sign the app needs attention. Errors and speed per screen are in your hosting dashboard.</p>
              </section>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
