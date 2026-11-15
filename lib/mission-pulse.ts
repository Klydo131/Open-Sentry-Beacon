// The church's mission pulse: the few numbers a Director or an Executive
// Director should look at first, worked out from records the app already
// keeps. Pure functions, no network, so both halves of the app (the tutorial's
// sample data and a live church) feed the same arithmetic.
//
// ---------------------------------------------------------------------------
// ADDED ON 15 NOVEMBER 2026, after research into what leaders and IT
// administrators should watch (sources in docs/ANALYTICS.md):
//
// LEAD AND LAG, NOT ONE OR THE OTHER. A mission scorecard used in Adventist
// divisions argues that baptism-style outcome counts are LAG measures: they
// arrive late and nobody can act on them. The numbers a leader can do
// something about this week are LEAD measures: who is waiting for a Guide, a
// request nobody answered, a journey that has not moved in a month. Church
// management systems say the same in plainer words (follow-up within a day
// keeps far more newcomers than follow-up within a week). So the pulse puts the
// things to act on first, and the outcomes beside them.
//
// A PERIOD AND THE ONE BEFORE IT. A count alone does not say whether things are
// better. Every outcome here is shown against the same length of time just
// before, the way product analytics compares cohorts, and a series of buckets
// draws its shape.
//
// NO NAMES. Everything here is a count or a number of days. The lists of people
// stay on the screens that already show them to those allowed to see them.
// ---------------------------------------------------------------------------

import type { Role, Stage } from './types';

export const DAY = 24 * 60 * 60 * 1000;

export const STAGE_ORDER: Stage[] = ['create', 'connect', 'care', 'call', 'cultivate', 'commission'];

export const PERIODS = [
  { days: 7, label: '7 days', buckets: 7 },
  { days: 30, label: '30 days', buckets: 10 },
  { days: 90, label: '90 days', buckets: 13 },
  { days: 365, label: '12 months', buckets: 12 },
] as const;

/** A journey that has not moved in this many days is called stalled. */
export const STALLED_AFTER_DAYS = 30;
/** An Explorer waiting longer than this for a Guide is called overdue. */
export const WAIT_OVERDUE_DAYS = 7;
/** A pairing request unanswered for longer than this is called overdue. */
export const REQUEST_OVERDUE_DAYS = 3;

export interface PulseInput {
  now: number;
  members: { role: Role; approved: boolean; joinedAt: string | null; id: string }[];
  pairings: { id: string; dsId: string; dmId?: string; track?: string; stage: Stage; status: string; createdAt: string }[];
  moves: { pairingId: string; from?: Stage | null; to: Stage; at: string }[];
  meetings: { at: string; done: boolean; cancelled: boolean }[];
  requests: { pending: boolean; createdAt: string }[];
  invites: { createdAt: string; joinedAt: string | null; expiresAt: string | null }[];
  feedback: { createdAt: string; open: boolean }[];
  /** Guides whose commitments are signed and current (null: not known on this copy). */
  guidesSigned?: string[] | null;
  /** Meetings per journey, only where the app lets a leader see them (null: not visible). */
  journeyMeetings?: { pairingId: string; done: boolean }[] | null;
  /** People active in the last 7 and 30 days, by role, when the app can say. */
  activity: { days: 7 | 30; role: Role; active: number; approved: number }[];
}

export interface Measure {
  now: number;
  before: number;
  /** Oldest first, one per bucket of the period. */
  series: number[];
}

export interface StageRow {
  stage: Stage;
  count: number;
  /** Middle number of days since the journey arrived at this stage. */
  medianDays: number | null;
  stalled: number;
}

export interface Attention {
  key: string;
  tone: 'act' | 'watch' | 'good';
  count: number;
  text: string;
}

export interface Pulse {
  periodDays: number;
  newExplorers: Measure;
  newGuides: Measure;
  steps: Measure;
  commissioned: Measure;
  meetingsHeld: Measure;
  newPairings: Measure;
  invitesSent: Measure;
  invitesJoined: Measure;
  explorers: number;
  guides: number;
  unpaired: number;
  waitMedianDays: number | null;
  waitOverdue: number;
  requestsPending: number;
  requestOldestDays: number | null;
  stalled: number;
  pathway: StageRow[];
  activeJourneys: number;
  meetingsAhead: number;
  invitesWaiting: number;
  invitesExpired: number;
  feedbackOpen: number;
  /** Share of approved people active this week out of those active this month (WAU/MAU), per role. */
  stickiness: { role: Role; weekly: number; monthly: number; approved: number; ratio: number | null }[];
  /** Approved Guides without signed, current commitments; null when not known. */
  guidesUnsigned: number | null;
  /** Explorers who joined in the period and were given a Guide, as a share. */
  pairedShare: number | null;
  attention: Attention[];
}

const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** A count for this period, the one before it, and its shape across the period. */
export function measure(moments: (string | null | undefined)[], days: number, buckets: number, now: number): Measure {
  const span = days * DAY;
  const start = now - span;
  const series = new Array<number>(buckets).fill(0);
  let current = 0;
  let before = 0;
  for (const m of moments) {
    const t = time(m);
    if (!Number.isFinite(t) || t > now) continue;
    if (t >= start) {
      current += 1;
      const i = Math.min(buckets - 1, Math.floor(((t - start) / span) * buckets));
      series[i] += 1;
    } else if (t >= start - span) before += 1;
  }
  return { now: current, before, series };
}

/** "+3", "−2" or "same", against the period before; null when there is nothing to compare. */
export function change(m: Measure): { diff: number; pct: number | null } {
  return { diff: m.now - m.before, pct: m.before > 0 ? Math.round(((m.now - m.before) / m.before) * 100) : null };
}

const isAdvance = (from: Stage | null | undefined, to: Stage) =>
  !from || STAGE_ORDER.indexOf(to) > STAGE_ORDER.indexOf(from);

export function missionPulse(input: PulseInput, periodDays: number): Pulse {
  const { now } = input;
  const spec = PERIODS.find((p) => p.days === periodDays) ?? PERIODS[1];
  const m = (moments: (string | null | undefined)[]) => measure(moments, spec.days, spec.buckets, now);

  const approved = input.members.filter((x) => x.approved);
  const explorers = approved.filter((x) => x.role === 'ds');
  const active = input.pairings.filter((p) => p.status === 'active');
  const pairedIds = new Set(active.map((p) => p.dsId));

  // Waiting for a Guide: approved Explorers with no active pairing, counted from when they joined.
  const waiting = explorers.filter((e) => !pairedIds.has(e.id));
  const waitDays = waiting.map((e) => (now - time(e.joinedAt)) / DAY).filter((d) => Number.isFinite(d) && d >= 0);
  const waitMedianDays = median(waitDays);

  const pending = input.requests.filter((r) => r.pending);
  const oldest = pending.map((r) => (now - time(r.createdAt)) / DAY).filter(Number.isFinite);

  // When each active journey last moved: its newest step, or when it began.
  const lastMove = new Map<string, number>();
  for (const p of active) lastMove.set(p.id, time(p.createdAt));
  for (const mv of input.moves) {
    const t = time(mv.at);
    if (lastMove.has(mv.pairingId) && t > (lastMove.get(mv.pairingId) ?? 0)) lastMove.set(mv.pairingId, t);
  }
  const daysHere = (id: string) => (now - (lastMove.get(id) ?? now)) / DAY;
  const pathway: StageRow[] = STAGE_ORDER.map((stage) => {
    const here = active.filter((p) => p.stage === stage);
    const days = here.map((p) => daysHere(p.id)).filter((d) => Number.isFinite(d) && d >= 0);
    return {
      stage,
      count: here.length,
      medianDays: median(days),
      stalled: stage === 'commission' ? 0 : days.filter((d) => d > STALLED_AFTER_DAYS).length,
    };
  });
  const stalled = pathway.reduce((n, r) => n + r.stalled, 0);

  const advances = input.moves.filter((mv) => isAdvance(mv.from, mv.to));
  const joinedInPeriod = explorers.filter((e) => time(e.joinedAt) >= now - spec.days * DAY);
  const pairedShare = joinedInPeriod.length ? joinedInPeriod.filter((e) => pairedIds.has(e.id)).length / joinedInPeriod.length : null;

  const stickiness = (['dm', 'ds'] as Role[]).map((role) => {
    const w = input.activity.find((a) => a.days === 7 && a.role === role);
    const mo = input.activity.find((a) => a.days === 30 && a.role === role);
    const weekly = w?.active ?? 0;
    const monthly = mo?.active ?? 0;
    return { role, weekly, monthly, approved: mo?.approved ?? w?.approved ?? 0, ratio: monthly > 0 ? weekly / monthly : null };
  });

  const invitesWaiting = input.invites.filter((i) => !i.joinedAt && (!i.expiresAt || time(i.expiresAt) > now)).length;
  const invitesExpired = input.invites.filter((i) => !i.joinedAt && i.expiresAt && time(i.expiresAt) <= now).length;
  const feedbackOpen = input.feedback.filter((f) => f.open).length;
  const waitOverdue = waitDays.filter((d) => d > WAIT_OVERDUE_DAYS).length;
  const requestOldestDays = oldest.length ? Math.max(...oldest) : null;

  const attention: Attention[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (waiting.length) {
    attention.push({
      key: 'waiting', tone: waitOverdue ? 'act' : 'watch', count: waiting.length,
      text: `${plural(waiting.length, 'Explorer is', 'Explorers are')} waiting for a Guide${waitOverdue ? `, ${waitOverdue} for more than ${WAIT_OVERDUE_DAYS} days` : ''}.`,
    });
  }
  if (pending.length) {
    const late = oldest.filter((d) => d > REQUEST_OVERDUE_DAYS).length;
    attention.push({
      key: 'requests', tone: late ? 'act' : 'watch', count: pending.length,
      text: `${plural(pending.length, 'pairing request is', 'pairing requests are')} waiting for an answer${late ? `, ${late} for more than ${REQUEST_OVERDUE_DAYS} days` : ''}.`,
    });
  }
  if (stalled) {
    attention.push({
      key: 'stalled', tone: 'watch', count: stalled,
      text: `${plural(stalled, 'journey has', 'journeys have')} not moved in more than ${STALLED_AFTER_DAYS} days. A check-in with the Guide may help.`,
    });
  }
  if (invitesExpired) {
    attention.push({ key: 'invites', tone: 'watch', count: invitesExpired, text: `${plural(invitesExpired, 'invitation has', 'invitations have')} expired without being used. Send again from People.` });
  }
  if (feedbackOpen) {
    attention.push({ key: 'feedback', tone: 'watch', count: feedbackOpen, text: `${plural(feedbackOpen, 'piece of feedback is', 'pieces of feedback are')} not closed yet.` });
  }
  if (attention.length === 0) attention.push({ key: 'clear', tone: 'good', count: 0, text: 'Nothing is waiting on a leader right now.' });

  return {
    periodDays: spec.days,
    newExplorers: m(input.members.filter((x) => x.role === 'ds').map((x) => x.joinedAt)),
    newGuides: m(input.members.filter((x) => x.role === 'dm').map((x) => x.joinedAt)),
    steps: m(advances.map((mv) => mv.at)),
    commissioned: m(advances.filter((mv) => mv.to === 'commission').map((mv) => mv.at)),
    meetingsHeld: m(input.meetings.filter((x) => x.done).map((x) => x.at)),
    newPairings: m(input.pairings.map((p) => p.createdAt)),
    invitesSent: m(input.invites.map((i) => i.createdAt)),
    invitesJoined: m(input.invites.map((i) => i.joinedAt)),
    explorers: explorers.length,
    guides: approved.filter((x) => x.role === 'dm').length,
    unpaired: waiting.length,
    waitMedianDays,
    waitOverdue,
    requestsPending: pending.length,
    requestOldestDays,
    stalled,
    pathway,
    activeJourneys: active.length,
    meetingsAhead: input.meetings.filter((x) => !x.done && !x.cancelled && time(x.at) > now && time(x.at) <= now + 14 * DAY).length,
    invitesWaiting,
    invitesExpired,
    feedbackOpen,
    stickiness,
    pairedShare,
    guidesUnsigned: input.guidesSigned == null ? null
      : approved.filter((x) => x.role === 'dm' && !input.guidesSigned!.includes(x.id)).length,
    attention,
  };
}
