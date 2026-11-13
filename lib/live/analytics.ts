'use client';

// What a church can actually measure about itself, for a Director on a Tuesday.
//
// TWO QUESTIONS, AND THIS FILE ANSWERS BOTH LITERALLY.
//
//   1. Who is using it? Guides and Explorers, active and inactive, over a day,
//      a week and a month.
//   2. Who is arriving, and who is leaving? New members by role over any grain
//      from a day to a year, and the record of suspensions, refusals and
//      removals beside it.
//
// It replaced a generic "everything week by week" chart, which answered neither
// and made a Director derive both.
//
// EVERY SOURCE IS SOMETHING THE READER MAY ALREADY SEE, with one deliberate
// exception. Arrivals and departures come from profiles and the discipline log
// under the caller's own policies. Activity comes from church_activity(), which
// is SECURITY DEFINER because it counts message senders — a Director may not
// read a message and never will, and this returns four integers per role, never
// a name and never a word of one. A count is not a conversation.

import * as live from '@/lib/live/data';
import type { Role } from '@/lib/types';

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------
//
// VALIDATED WITH THE PALETTE CHECKER, NOT CHOSEN BY EYE, and re-validated when
// the charts changed shape. The old three-line chart passed only because the
// checker compares ADJACENT pairs by default; run across ALL pairs, its blue
// and purple sat at ΔE 5.7 under deuteranopia, below the floor at which any
// secondary encoding can rescue them. Two people in a congregation of forty
// cannot reliably tell those two lines apart.
//
// So the new charts need no four-colour ramp at all:
//
//   * Active against inactive is TWO categories. #2F80ED against #B45309 is
//     ΔE 30.3 deutan, 29.0 tritan, 32.2 normal — all pairs, all pass.
//   * Arrivals by role is FOUR series, so it is drawn as four small multiples
//     instead of four lines on one axis. Each panel holds one series, which
//     needs one hue and no legend, and it also fixes a scale problem: one
//     Executive Director and thirteen Explorers do not share a y-axis usefully.

export const ACTIVE_COLOUR = '#2F80ED';
export const INACTIVE_COLOUR = '#B45309';
export const ARRIVAL_COLOUR = '#2F80ED';

const DAY = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// 1. Who is using it
// ---------------------------------------------------------------------------

/** One window's answer, for one role. */
export interface ActivitySlice {
  windowLabel: string;
  days: number;
  role: Role;
  approved: number;
  active: number;
  inactive: number;
  suspended: number;
}

export const ACTIVITY_WINDOWS: { days: number; label: string }[] = [
  { days: 1, label: 'Today' },
  { days: 7, label: 'This week' },
  { days: 30, label: 'This month' },
];

/** The roles this chart is about. Leaders are counted too, in the table. */
export const ACTIVITY_ROLES: Role[] = ['dm', 'ds'];

export async function activityByWindow(): Promise<ActivitySlice[]> {
  const results = await Promise.all(
    ACTIVITY_WINDOWS.map(async (w) => {
      const rows = await live.churchActivity(w.days);
      return rows.map<ActivitySlice>((r) => ({
        windowLabel: w.label,
        days: w.days,
        role: r.role,
        approved: Number(r.approved) || 0,
        active: Number(r.active) || 0,
        inactive: Number(r.inactive) || 0,
        suspended: Number(r.suspended) || 0,
      }));
    }),
  );
  return results.flat();
}

// ---------------------------------------------------------------------------
// 2. Who is arriving
// ---------------------------------------------------------------------------

export type Grain = 'day' | 'week' | 'month' | 'quarter' | 'year';

export const GRAINS: { key: Grain; label: string; buckets: number }[] = [
  { key: 'day', label: 'Daily', buckets: 14 },
  { key: 'week', label: 'Weekly', buckets: 12 },
  { key: 'month', label: 'Monthly', buckets: 12 },
  { key: 'quarter', label: 'Quarterly', buckets: 8 },
  { key: 'year', label: 'Yearly', buckets: 5 },
];

/**
 * The start of the bucket a moment falls in.
 *
 * Local time throughout, deliberately. A church reads "today" as their own
 * Tuesday, not as UTC's, and a congregation in Manila reading a UTC day
 * boundary sees arrivals land on the wrong side of midnight for eight hours
 * every day.
 */
function bucketStart(t: number, grain: Grain): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  if (grain === 'day') return d.getTime();
  if (grain === 'week') {
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return d.getTime();
  }
  if (grain === 'month') { d.setDate(1); return d.getTime(); }
  if (grain === 'quarter') {
    d.setDate(1);
    d.setMonth(Math.floor(d.getMonth() / 3) * 3);
    return d.getTime();
  }
  d.setDate(1); d.setMonth(0);
  return d.getTime();
}

/** Walk back `count` buckets from the one containing `now`, oldest first. */
function bucketEdges(grain: Grain, count: number, now = Date.now()): number[] {
  const out: number[] = [];
  let cursor = bucketStart(now, grain);
  for (let i = 0; i < count; i += 1) {
    out.unshift(cursor);
    const d = new Date(cursor);
    if (grain === 'day') d.setDate(d.getDate() - 1);
    else if (grain === 'week') d.setDate(d.getDate() - 7);
    else if (grain === 'month') d.setMonth(d.getMonth() - 1);
    else if (grain === 'quarter') d.setMonth(d.getMonth() - 3);
    else d.setFullYear(d.getFullYear() - 1);
    cursor = d.getTime();
  }
  return out;
}

function bucketLabel(edge: number, grain: Grain): string {
  const d = new Date(edge);
  if (grain === 'day') return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  if (grain === 'week') return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  if (grain === 'month') return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
  if (grain === 'quarter') return `Q${Math.floor(d.getMonth() / 3) + 1} ${String(d.getFullYear()).slice(2)}`;
  return String(d.getFullYear());
}

/** Count timestamps into the given bucket edges. Anything older is dropped. */
function intoBuckets(times: (string | null | undefined)[], edges: number[], grain: Grain): number[] {
  const out = new Array(edges.length).fill(0);
  for (const raw of times) {
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (Number.isNaN(t)) continue;
    const start = bucketStart(t, grain);
    // Exact match against a known edge rather than arithmetic: months and
    // quarters are not a fixed number of milliseconds, and dividing by an
    // average length puts a March arrival in February about once a year.
    const i = edges.indexOf(start);
    if (i >= 0) out[i] += 1;
  }
  return out;
}

export interface ArrivalPanel {
  role: Role;
  label: string;
  points: number[];
  total: number;
}

export interface Arrivals {
  grain: Grain;
  labels: string[];
  panels: ArrivalPanel[];
  /** The tallest point across every panel, so all four share one scale. */
  peak: number;
}

const ARRIVAL_ORDER: { role: Role; label: string }[] = [
  { role: 'executive', label: 'Executive Directors' },
  { role: 'admin', label: 'Directors' },
  { role: 'dm', label: 'Guides' },
  { role: 'ds', label: 'Explorers' },
];

export async function arrivals(grain: Grain, now = Date.now()): Promise<Arrivals> {
  const spec = GRAINS.find((g) => g.key === grain) ?? GRAINS[1];
  const edges = bucketEdges(grain, spec.buckets, now);
  const members = await live.listMembers();

  const panels = ARRIVAL_ORDER.map<ArrivalPanel>(({ role, label }) => {
    // WHEN SOMEBODY ARRIVED IS WHEN THEY FINISHED SIGNING UP, not when the
    // invitation record was created. An invitation that sat unopened for three
    // weeks would otherwise be counted as an arrival on the day it was sent.
    const points = intoBuckets(
      members
        .filter((m) => m.role === role)
        .map((m) => m.signup_completed_at ?? m.created_at),
      edges,
      grain,
    );
    return { role, label, points, total: points.reduce((a, b) => a + b, 0) };
  });

  return {
    grain,
    labels: edges.map((e) => bucketLabel(e, grain)),
    panels,
    peak: Math.max(1, ...panels.flatMap((p) => p.points)),
  };
}

// ---------------------------------------------------------------------------
// 3. Who left, and why
// ---------------------------------------------------------------------------

export interface Departures {
  /** Within the window covered by the arrivals chart. */
  suspended: number;
  released: number;
  removed: number;
  approved: number;
  disapproved: number;
  since: string;
}

/**
 * Counted from the discipline log, which outlives the people in it — that is
 * the point of it, and why these numbers survive a deletion.
 *
 * REMOVED AND DELETED ARE ONE NUMBER, not two, and the screen says so rather
 * than inventing a distinction. In this app removing somebody from the church
 * deletes their account: `remove_member_by_leader` writes the log entry and
 * then deletes the person, in that order, precisely so the record outlives
 * them. There is no separate "kicked but still has a login" state to count.
 */
export async function departures(sinceMs: number): Promise<Departures> {
  const log = await live.disciplineHistory().catch(() => []);
  const since = new Date(sinceMs);
  const inWindow = log.filter((e) => new Date(e.at).getTime() >= sinceMs);
  const count = (a: string) => inWindow.filter((e) => e.action === a).length;
  return {
    suspended: count('suspended'),
    released: count('released'),
    removed: count('removed'),
    approved: count('approved'),
    disapproved: count('disapproved'),
    since: since.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }),
  };
}

/** The oldest moment the arrivals chart is showing, for the departures window. */
export function windowStart(grain: Grain, now = Date.now()): number {
  const spec = GRAINS.find((g) => g.key === grain) ?? GRAINS[1];
  return bucketEdges(grain, spec.buckets, now)[0];
}

// ---------------------------------------------------------------------------
// 4. The headline, and the arithmetic a spreadsheet would give you
// ---------------------------------------------------------------------------

export interface Headline {
  explorers: number;
  guides: number;
  graduated: number;
  unpaired: number;
}

export async function headline(): Promise<Headline> {
  const [members, pairings] = await Promise.all([live.listMembers(), live.listPairings()]);
  const active = pairings.filter((p) => p.status === 'active');
  const explorers = members.filter((m) => m.role === 'ds' && m.is_approved);
  return {
    explorers: explorers.length,
    guides: members.filter((m) => m.role === 'dm' && m.is_approved).length,
    graduated: active.filter((p) => p.journey_stage === 'commission').length,
    unpaired: explorers.filter((e) => !active.some((p) => p.ds_id === e.id)).length,
  };
}

export function mean(points: number[]): number {
  if (points.length === 0) return 0;
  return points.reduce((a, b) => a + b, 0) / points.length;
}

/**
 * The middle value. Reported beside the mean because they disagree in exactly
 * the case a church cares about: one busy week after a quiet month pulls the
 * mean up and leaves the median where the ordinary week actually is.
 */
export function median(points: number[]): number {
  if (points.length === 0) return 0;
  const sorted = [...points].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function total(points: number[]): number {
  return points.reduce((a, b) => a + b, 0);
}

/**
 * Change from the last COMPLETE bucket to the one before it.
 *
 * The current bucket is excluded on purpose. It is a Tuesday when somebody
 * reads this, so the week in progress is two days long, and comparing it to a
 * finished week reports a collapse that is only the calendar.
 */
export function stepChange(points: number[]): { latest: number; before: number; pct: number | null } {
  const complete = points.slice(0, -1);
  const latest = complete[complete.length - 1] ?? 0;
  const before = complete[complete.length - 2] ?? 0;
  // Zero to anything is not "up 100%": it is going from nothing to something,
  // and saying it as a percentage is a lie dressed as arithmetic.
  const pct = before === 0 ? null : Math.round(((latest - before) / before) * 100);
  return { latest, before, pct };
}

export { DAY };
