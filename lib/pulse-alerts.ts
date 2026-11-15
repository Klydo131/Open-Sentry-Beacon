// Warnings and automations for the Executive Director and the Director.
//
// ---------------------------------------------------------------------------
// WARNINGS are rules over the Mission pulse (lib/mission-pulse.ts) and its
// journey rows (lib/mission-analysis.ts). Each has a threshold a leader can
// change and a switch to turn it off. They are written to cut noise, the way
// operations teams write alerts: a percentage drop needs a minimum base before
// it fires, so one quiet week in a small church does not cry wolf.
//
// AUTOMATIONS are things the app can actually do with the leader's own
// permissions, and nothing more:
//   - a follow-up on the leader's own list (follow_ups is owner-only),
//   - a counts-only message to the Guides' room, at most once a week,
//   - a notification on this device,
//   - a briefing to copy, share or email.
// Each one says exactly what it will do before it does it. "Ask first" is the
// default; "Automatic" runs when Analytics opens, and every automatic action is
// remembered so it never repeats inside its quiet period.
//
// WHERE SETTINGS LIVE. On this device, until a church-wide table exists (that
// needs a database change and the owner's approval). The screen says so.
// ---------------------------------------------------------------------------

import { DAY, STAGE_ORDER, type Pulse, type PulseInput } from './mission-pulse.ts';
import type { JourneyRow } from './mission-analysis.ts';

export type Severity = 'critical' | 'warning' | 'watch';

/** The four things an automation may do, supplied by each half of the app. */
export interface PulseActions {
  /** True for the tutorial's sample church: nothing leaves this browser. */
  sample: boolean;
  myFollowUps: () => Promise<{ pairing_id: string; title: string; done_at: string | null }[]>;
  addFollowUp: (pairingId: string, title: string, dueOn: string) => Promise<void>;
  postToGuides: (body: string) => Promise<void>;
}

export interface RuleDef {
  key: string;
  label: string;
  /** What the number means, with {n} for the threshold. */
  detail: string;
  unit: string;
  defaultThreshold: number;
  severity: Severity;
  /** Which way is bad. */
  above: boolean;
}

export const RULES: RuleDef[] = [
  { key: 'wait', label: 'Explorer waiting for a Guide', detail: 'An approved Explorer has had no Guide for more than {n} days.', unit: 'days', defaultThreshold: 7, severity: 'critical', above: true },
  { key: 'request', label: 'Pairing request unanswered', detail: 'A request to be paired has waited more than {n} days for an answer.', unit: 'days', defaultThreshold: 3, severity: 'critical', above: true },
  { key: 'stalled', label: 'Journey not moving', detail: 'A journey has had no step for more than {n} days.', unit: 'days', defaultThreshold: 30, severity: 'warning', above: true },
  { key: 'commitments', label: 'Guide commitments not signed', detail: '{n} or more Guides have not signed their safeguarding commitments this year.', unit: 'Guides', defaultThreshold: 1, severity: 'critical', above: true },
  { key: 'load', label: 'Guide carrying too many', detail: 'A Guide is walking with more than {n} people at once.', unit: 'people', defaultThreshold: 5, severity: 'warning', above: true },
  { key: 'steps-drop', label: 'Fewer journey steps', detail: 'Journey steps fell by {n}% or more against the period before (only counted from 4 steps up).', unit: '%', defaultThreshold: 30, severity: 'warning', above: true },
  { key: 'arrivals-drop', label: 'Fewer new Explorers', detail: 'New Explorers fell by {n}% or more against the period before (only counted from 4 up).', unit: '%', defaultThreshold: 50, severity: 'watch', above: true },
  { key: 'explorers-back', label: 'Explorers not coming back', detail: 'Fewer than {n}% of this month’s active Explorers came back this week (only counted from 5 up).', unit: '%', defaultThreshold: 40, severity: 'warning', above: false },
  { key: 'guides-back', label: 'Guides not coming back', detail: 'Fewer than {n}% of this month’s active Guides came back this week (only counted from 3 up).', unit: '%', defaultThreshold: 50, severity: 'warning', above: false },
  { key: 'invites', label: 'Invitations expiring unused', detail: '{n} or more invitations expired without being used.', unit: 'invitations', defaultThreshold: 1, severity: 'watch', above: true },
  { key: 'feedback', label: 'Feedback piling up', detail: '{n} or more pieces of feedback are not closed.', unit: 'pieces', defaultThreshold: 5, severity: 'watch', above: true },
  { key: 'slow', label: 'The app is slow', detail: 'The numbers took more than {n} seconds to load.', unit: 'seconds', defaultThreshold: 3, severity: 'warning', above: true },
];

export interface RuleSetting { on: boolean; threshold: number }
export type RuleSettings = Record<string, RuleSetting>;

export function defaultSettings(): RuleSettings {
  return Object.fromEntries(RULES.map((r) => [r.key, { on: true, threshold: r.defaultThreshold }]));
}

/** Only known rules, only sensible numbers; anything else falls back to the default. */
export function tidySettings(raw: unknown): RuleSettings {
  const base = defaultSettings();
  if (!raw || typeof raw !== 'object') return base;
  for (const r of RULES) {
    const v = (raw as Record<string, unknown>)[r.key] as Partial<RuleSetting> | undefined;
    if (!v || typeof v !== 'object') continue;
    const t = Number(v.threshold);
    base[r.key] = {
      on: typeof v.on === 'boolean' ? v.on : true,
      threshold: Number.isFinite(t) && t >= 0 && t <= 10_000 ? t : r.defaultThreshold,
    };
  }
  return base;
}

export interface Warning {
  key: string;
  label: string;
  severity: Severity;
  /** How many people, journeys or items it covers, or the measured value. */
  count: number;
  value: number;
  threshold: number;
  text: string;
  /** Pairings it concerns, for a follow-up. Never shown. */
  pairingIds: string[];
}

const drop = (now: number, before: number) => (before > 0 ? Math.round(((before - now) / before) * 100) : 0);

export function evaluate(
  pulse: Pulse, rows: JourneyRow[], input: PulseInput, settings: RuleSettings, loadedMs: number | null,
): Warning[] {
  const out: Warning[] = [];
  const on = (k: string) => settings[k]?.on !== false;
  const th = (k: string) => settings[k]?.threshold ?? RULES.find((r) => r.key === k)!.defaultThreshold;
  const add = (key: string, count: number, value: number, text: string, pairingIds: string[] = []) => {
    const r = RULES.find((x) => x.key === key)!;
    out.push({ key, label: r.label, severity: r.severity, count, value, threshold: th(key), text, pairingIds });
  };
  const { now } = input;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  if (on('wait')) {
    const paired = new Set(input.pairings.filter((p) => p.status === 'active').map((p) => p.dsId));
    const late = input.members.filter((m) => m.role === 'ds' && m.approved && !paired.has(m.id))
      .map((m) => (now - new Date(m.joinedAt ?? '').getTime()) / DAY).filter((d) => Number.isFinite(d) && d > th('wait'));
    if (late.length) add('wait', late.length, Math.round(Math.max(...late)), `${plural(late.length, 'Explorer has', 'Explorers have')} waited more than ${th('wait')} days for a Guide (longest ${Math.round(Math.max(...late))} days).`);
  }
  if (on('request')) {
    const late = input.requests.filter((r) => r.pending).map((r) => (now - new Date(r.createdAt).getTime()) / DAY).filter((d) => d > th('request'));
    if (late.length) add('request', late.length, Math.round(Math.max(...late)), `${plural(late.length, 'pairing request has', 'pairing requests have')} waited more than ${th('request')} days for an answer.`);
  }
  if (on('stalled')) {
    const last = new Map<string, number>();
    for (const p of input.pairings) if (p.status === 'active' && p.stage !== 'commission') last.set(p.id, new Date(p.createdAt).getTime());
    for (const m of input.moves) {
      const t = new Date(m.at).getTime();
      if (last.has(m.pairingId) && t > (last.get(m.pairingId) ?? 0)) last.set(m.pairingId, t);
    }
    const ids = [...last].filter(([, t]) => (now - t) / DAY > th('stalled')).map(([id]) => id);
    if (ids.length) add('stalled', ids.length, ids.length, `${plural(ids.length, 'journey has', 'journeys have')} had no step for more than ${th('stalled')} days.`, ids);
  }
  if (on('commitments') && pulse.guidesUnsigned !== null && pulse.guidesUnsigned >= Math.max(1, th('commitments'))) {
    add('commitments', pulse.guidesUnsigned, pulse.guidesUnsigned, `${plural(pulse.guidesUnsigned, 'Guide has', 'Guides have')} not signed the Guide commitments this year. Ask them to sign on their desk before walking with anyone.`);
  }
  if (on('load')) {
    const loads = new Map<string, number>();
    for (const p of input.pairings) if (p.status === 'active' && p.dmId) loads.set(p.dmId, (loads.get(p.dmId) ?? 0) + 1);
    const heavy = [...loads.values()].filter((n) => n > th('load'));
    if (heavy.length) add('load', heavy.length, Math.max(...heavy), `${plural(heavy.length, 'Guide is', 'Guides are')} walking with more than ${th('load')} people (most: ${Math.max(...heavy)}).`);
  }
  if (on('steps-drop') && pulse.steps.before >= 4) {
    const d = drop(pulse.steps.now, pulse.steps.before);
    if (d >= th('steps-drop')) add('steps-drop', pulse.steps.now, d, `Journey steps fell ${d}% (${pulse.steps.before} to ${pulse.steps.now}) against the period before.`);
  }
  if (on('arrivals-drop') && pulse.newExplorers.before >= 4) {
    const d = drop(pulse.newExplorers.now, pulse.newExplorers.before);
    if (d >= th('arrivals-drop')) add('arrivals-drop', pulse.newExplorers.now, d, `New Explorers fell ${d}% (${pulse.newExplorers.before} to ${pulse.newExplorers.now}) against the period before.`);
  }
  for (const [key, role, min] of [['explorers-back', 'ds', 5], ['guides-back', 'dm', 3]] as const) {
    const s = pulse.stickiness.find((x) => x.role === role);
    if (on(key) && s && s.ratio !== null && s.monthly >= min) {
      const p = Math.round(s.ratio * 100);
      if (p < th(key)) add(key, s.weekly, p, `Only ${p}% of this month’s active ${role === 'ds' ? 'Explorers' : 'Guides'} came back this week (${s.weekly} of ${s.monthly}).`);
    }
  }
  if (on('invites') && pulse.invitesExpired >= th('invites') && pulse.invitesExpired > 0) {
    add('invites', pulse.invitesExpired, pulse.invitesExpired, `${plural(pulse.invitesExpired, 'invitation has', 'invitations have')} expired without being used.`);
  }
  if (on('feedback') && pulse.feedbackOpen >= th('feedback') && pulse.feedbackOpen > 0) {
    add('feedback', pulse.feedbackOpen, pulse.feedbackOpen, `${plural(pulse.feedbackOpen, 'piece of feedback is', 'pieces of feedback are')} not closed.`);
  }
  if (on('slow') && loadedMs !== null && loadedMs / 1000 > th('slow')) {
    add('slow', 1, Math.round(loadedMs / 100) / 10, `The numbers took ${(loadedMs / 1000).toFixed(1)} seconds to load, more than ${th('slow')}.`);
  }
  const order: Record<Severity, number> = { critical: 0, warning: 1, watch: 2 };
  void rows; // rows are part of the contract for rules that read journeys; the load rule reads pairings directly.
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ---- Automations ----------------------------------------------------------

export type AutomationKey = 'followups' | 'guides' | 'notify' | 'briefing';
export type AutomationMode = 'off' | 'ask' | 'auto';

export interface AutomationDef {
  key: AutomationKey;
  label: string;
  does: string;
  /** Days before the same automation may run again on its own. */
  quietDays: number;
  defaultMode: AutomationMode;
}

export const AUTOMATIONS: AutomationDef[] = [
  { key: 'followups', label: 'Follow-ups for stalled journeys', does: 'Adds a follow-up to your own list for each journey that has stopped, due in two days. Never twice for the same journey while one is open.', quietDays: 1, defaultMode: 'ask' },
  { key: 'guides', label: 'Ask the Guides for help', does: 'Posts one message to the Guides’ room when Explorers are waiting for a Guide: counts only, no names. At most once a week.', quietDays: 7, defaultMode: 'ask' },
  { key: 'notify', label: 'Tell me on this device', does: 'Shows a notification on this device when something urgent is found. At most once a day.', quietDays: 1, defaultMode: 'ask' },
  { key: 'briefing', label: 'Weekly briefing', does: 'Writes this week’s numbers and warnings as a short briefing to copy, share or email to the board.', quietDays: 7, defaultMode: 'ask' },
];

export interface AutomationState { mode: Record<AutomationKey, AutomationMode>; lastRun: Partial<Record<AutomationKey, string>> }

export function tidyAutomations(raw: unknown): AutomationState {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AutomationState>;
  const mode = Object.fromEntries(AUTOMATIONS.map((a) => {
    const m = r.mode?.[a.key];
    return [a.key, m === 'off' || m === 'ask' || m === 'auto' ? m : a.defaultMode];
  })) as Record<AutomationKey, AutomationMode>;
  const lastRun: Partial<Record<AutomationKey, string>> = {};
  for (const a of AUTOMATIONS) {
    const v = r.lastRun?.[a.key];
    if (typeof v === 'string' && Number.isFinite(new Date(v).getTime())) lastRun[a.key] = v;
  }
  return { mode, lastRun };
}

/** Whether an automatic run is due: on "auto", something to do, and outside its quiet period. */
export function due(def: AutomationDef, state: AutomationState, hasWork: boolean, now: number): boolean {
  if (state.mode[def.key] !== 'auto' || !hasWork) return false;
  const last = state.lastRun[def.key];
  return !last || now - new Date(last).getTime() >= def.quietDays * DAY;
}

export interface FollowUpPlan { pairingId: string; title: string; dueOn: string }

/** Follow-ups to add: one per stalled journey, skipping any that already has an open one of ours. */
export function planFollowUps(
  warnings: Warning[], existing: { pairing_id: string; title: string; done_at: string | null }[], now: number,
): FollowUpPlan[] {
  const stalled = warnings.find((w) => w.key === 'stalled');
  if (!stalled) return [];
  const open = new Set(existing.filter((f) => !f.done_at && f.title.startsWith('Check in:')).map((f) => f.pairing_id));
  const dueOn = new Date(now + 2 * DAY).toISOString().slice(0, 10);
  return stalled.pairingIds.filter((id) => !open.has(id)).map((pairingId) => ({
    pairingId, dueOn, title: `Check in: this journey has had no step for more than ${stalled.threshold} days. Ask the Guide how it is going.`,
  }));
}

/** The Guides' room message, or null when nobody is waiting. Counts only. */
export function guidesMessage(warnings: Warning[], pulse: Pulse): string | null {
  if (pulse.unpaired === 0) return null;
  const late = warnings.find((w) => w.key === 'wait');
  return `From the church office: ${pulse.unpaired} ${pulse.unpaired === 1 ? 'Explorer is' : 'Explorers are'} waiting for a Guide`
    + `${late ? `, ${late.count} of them for more than ${late.threshold} days` : ''}. `
    + 'If you can walk with one more person, reply here or tell a Director. Thank you for all you do.';
}

/** The notification, or null when nothing is urgent. */
export function notification(warnings: Warning[]): { title: string; body: string } | null {
  const urgent = warnings.filter((w) => w.severity === 'critical');
  if (!urgent.length) return null;
  return { title: `${urgent.length} ${urgent.length === 1 ? 'thing needs' : 'things need'} a leader`, body: urgent.map((w) => w.text).join(' ') };
}

/** A short briefing for a board or a pastor: numbers and warnings, never names. */
export function briefing(pulse: Pulse, warnings: Warning[], periodLabel: string, churchName = '', stageLabel: (k: string) => string = (k) => k): string {
  const line = (label: string, m: { now: number; before: number }) => {
    const d = m.now - m.before;
    return `- ${label}: ${m.now} (${d === 0 ? 'same as' : d > 0 ? `up ${d} on` : `down ${-d} on`} the period before)`;
  };
  const stage = (k: string) => pulse.pathway.find((p) => p.stage === k)?.count ?? 0;
  return [
    `${churchName ? `${churchName}: ` : ''}Mission briefing, last ${periodLabel}`,
    '',
    'What happened',
    line('New Explorers', pulse.newExplorers),
    line('Journey steps forward', pulse.steps),
    line('Commissioned', pulse.commissioned),
    line('Meetings held', pulse.meetingsHeld),
    line('New pairings', pulse.newPairings),
    '',
    'Where things stand',
    `- ${pulse.explorers} Explorers and ${pulse.guides} Guides; ${pulse.activeJourneys} active journeys.`,
    `- By stage: ${STAGE_ORDER.map((k) => `${stageLabel(k)} ${stage(k)}`).join(', ')}.`,
    `- ${pulse.unpaired} waiting for a Guide; ${pulse.stalled} journeys with no step in a month.`,
    '',
    warnings.length ? 'Needs attention' : 'Needs attention: nothing.',
    ...warnings.map((w) => `- [${w.severity}] ${w.text}`),
    '',
    'Counts only. No names, messages or prayers are included.',
  ].join('\n');
}
