'use client';

// The warning system and the automations under the Mission pulse. The rules
// and what each automation will do are lib/pulse-alerts.ts; this draws them
// and carries out the four actions a leader is allowed to take.

import { useState } from 'react';
import { copyText } from '@/lib/share';
import {
  AUTOMATIONS, RULES, type AutomationKey, type AutomationMode, type AutomationState,
  type FollowUpPlan, type RuleSettings, type Warning,
} from '@/lib/pulse-alerts';


const SEV = {
  critical: { chip: 'bg-rose-100 text-rose-800', ring: 'ring-rose-200', bg: 'bg-rose-50', label: 'Urgent' },
  warning: { chip: 'bg-amber-100 text-amber-900', ring: 'ring-amber-200', bg: 'bg-amber-50', label: 'Warning' },
  watch: { chip: 'bg-sky-100 text-sky-900', ring: 'ring-sky-200', bg: 'bg-sky-50', label: 'Watch' },
} as const;

export function AlertsView({ warnings, settings, onChange, onReset }: {
  warnings: Warning[]; settings: RuleSettings; onChange: (key: string, patch: { on?: boolean; threshold?: number }) => void; onReset: () => void;
}) {
  return (
    <div className="space-y-4" data-pulse-alerts>
      <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
        <h3 className="text-base font-bold text-navy">Warnings now</h3>
        {warnings.length === 0 ? (
          <p className="rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200" data-warning="none">
            <strong>All clear.</strong> No rule is over its line right now.
          </p>
        ) : (
          <ul className="space-y-2">
            {warnings.map((w) => {
              const s = SEV[w.severity];
              return (
                <li key={w.key} className={`flex flex-wrap items-start gap-2 rounded-2xl p-3 ring-1 ${s.ring} ${s.bg}`} data-warning={w.key} data-severity={w.severity}>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide ${s.chip}`}>{s.label}</span>
                  <span className="min-w-0 flex-1 text-sm text-slate-800"><strong>{w.label}.</strong> {w.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-navy">Warning rules</h3>
          <button type="button" onClick={onReset} className="tap-sm rounded-full px-3 text-sm font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">Reset to the usual</button>
        </div>
        <p className="mt-1 text-xs text-slate-500">Turn a rule off, or change its line. Kept on this device.</p>
        <ul className="mt-3 divide-y divide-slate-100" data-pulse-rules>
          {RULES.map((r) => {
            const set = settings[r.key];
            return (
              <li key={r.key} className="flex flex-wrap items-center gap-3 py-2.5" data-rule={r.key}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={set.on} onChange={(e) => onChange(r.key, { on: e.target.checked })} className="mt-1 h-5 w-5 shrink-0 accent-[#1E2A4A]" />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-navy">{r.label}<span className={`rounded-full px-1.5 text-[10px] font-extrabold uppercase ${SEV[r.severity].chip}`}>{SEV[r.severity].label}</span></span>
                    <span className="block text-xs text-slate-500">{r.detail.replace('{n}', String(set.threshold))}</span>
                  </span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span className="sr-only">{r.label}: line in {r.unit}</span>
                  <input type="number" inputMode="numeric" min={0} max={10000} step={r.unit === 'seconds' ? 0.5 : 1} value={set.threshold} disabled={!set.on}
                    onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v >= 0) onChange(r.key, { threshold: v }); }}
                    className="tap-sm w-20 rounded-xl bg-slate-50 px-2 text-right text-base font-bold text-navy ring-1 ring-slate-200 disabled:opacity-50" data-rule-threshold={r.key} />
                  {r.unit}
                </label>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export interface Previews {
  followups: FollowUpPlan[];
  guides: string | null;
  notify: { title: string; body: string } | null;
  briefing: string;
}

const MODES: { key: AutomationMode; label: string }[] = [
  { key: 'off', label: 'Off' }, { key: 'ask', label: 'Ask first' }, { key: 'auto', label: 'Automatic' },
];

export function AutomationsView({ state, previews, sample, onMode, onRun, log }: {
  state: AutomationState; previews: Previews; sample: boolean;
  onMode: (key: AutomationKey, mode: AutomationMode) => void; onRun: (key: AutomationKey) => Promise<void>; log: string[];
}) {
  const [busy, setBusy] = useState<AutomationKey | null>(null);
  const [copied, setCopied] = useState(false);
  const preview = (k: AutomationKey): string => {
    if (k === 'followups') return previews.followups.length ? `Would add ${previews.followups.length} follow-up${previews.followups.length === 1 ? '' : 's'} to your list.` : 'Nothing to add: no stalled journey without an open follow-up.';
    if (k === 'guides') return previews.guides ? `Would post: “${previews.guides}”` : 'Nothing to post: nobody is waiting for a Guide.';
    if (k === 'notify') return previews.notify ? `Would show: “${previews.notify.title}”` : 'Nothing urgent to tell you.';
    return 'Ready below.';
  };
  const hasWork = (k: AutomationKey) => (k === 'followups' ? previews.followups.length > 0 : k === 'guides' ? !!previews.guides : k === 'notify' ? !!previews.notify : true);
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Mission briefing', text: previews.briefing });
      else setCopied(await copyText(previews.briefing));
    } catch { /* cancelled */ }
  };
  return (
    <div className="space-y-3" data-pulse-automations>
      {sample && (
        <p className="rounded-2xl bg-violet-50 p-3 text-sm text-violet-900 ring-1 ring-violet-200">Sample church: follow-ups go on the sample list, and nothing is posted or sent anywhere.</p>
      )}
      {AUTOMATIONS.map((a) => {
        const mode = state.mode[a.key];
        const last = state.lastRun[a.key];
        return (
          <article key={a.key} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80" data-automation={a.key}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 sm:flex-1">
                <h4 className="font-bold text-navy">{a.label}</h4>
                <p className="text-xs text-slate-500">{a.does}</p>
              </div>
              <div className="grid grid-cols-3 rounded-full bg-slate-100 p-1 sm:inline-flex" role="group" aria-label={`${a.label}: when it runs`}>
                {MODES.map((m) => (
                  <button key={m.key} type="button" aria-pressed={mode === m.key} onClick={() => onMode(a.key, m.key)}
                    className="tap-sm rounded-full px-3 text-xs font-bold text-slate-600 aria-pressed:bg-white aria-pressed:text-navy aria-pressed:shadow" data-mode={m.key}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            {a.key === 'briefing' ? (
              <div className="mt-3 space-y-2">
                <textarea readOnly value={previews.briefing} rows={9} className="w-full rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-700 ring-1 ring-slate-200" data-briefing aria-label="The briefing" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="tap-sm rounded-full bg-navy px-4 text-sm font-bold text-white" data-briefing-copy
                    onClick={async () => setCopied(await copyText(previews.briefing))}>{copied ? 'Copied' : 'Copy'}</button>
                  <button type="button" className="tap-sm rounded-full px-4 text-sm font-bold text-navy ring-1 ring-slate-300" onClick={() => void share()}>Share</button>
                  <a className="tap-sm inline-flex items-center rounded-full px-4 text-sm font-bold text-navy ring-1 ring-slate-300"
                    href={`mailto:?subject=${encodeURIComponent('Mission briefing')}&body=${encodeURIComponent(previews.briefing)}`}>Email</a>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-sm text-slate-700" data-preview>{preview(a.key)}</p>
                <button type="button" disabled={mode === 'off' || !hasWork(a.key) || busy !== null}
                  onClick={async () => { setBusy(a.key); try { await onRun(a.key); } finally { setBusy(null); } }}
                  className="tap-sm rounded-full bg-navy px-4 text-sm font-bold text-white disabled:opacity-40" data-run={a.key}>
                  {busy === a.key ? 'Working…' : 'Run now'}
                </button>
              </div>
            )}
            {last && <p className="mt-2 text-xs text-slate-500">Last ran {new Date(last).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.</p>}
          </article>
        );
      })}
      {log.length > 0 && (
        <section className="rounded-2xl bg-slate-900 p-3 text-xs text-slate-100" aria-live="polite" data-automation-log>
          {log.map((l, i) => <p key={i}>{l}</p>)}
        </section>
      )}
      <p className="text-xs text-slate-500">Automatic ones run when you open Analytics, at most once in their quiet period, and are listed above when they do. Settings are kept on this device.</p>
    </div>
  );
}
