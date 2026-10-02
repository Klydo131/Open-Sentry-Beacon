// The progress report: how the Explorers a Guide walks with, or a church's
// Explorers as a whole, are moving along the journey, for a month or a
// quarter.
//
// ASKED FOR on 2 October 2026: "a progress report for Guides and higher up
// accounts ... make sure it integrates with the data and relevance on how
// Explorers are progressing rightly. Probably you can research of progress
// reports of teachers in the SDA format." In the Office, with the Reports
// subroom.
//
// THE SHAPE IS THE ADVENTIST ONE. A Sabbath School class record is kept by the
// quarter (attendance, lesson study, visits, Bible studies), and a Bible
// worker's report by the month (Bible studies given, visits, decisions,
// baptisms, and a space to write what happened). So this report is for a
// month or a quarter, counts the same kinds of things in this app's own terms,
// and has a space for the Guide's own words:
//
//   Bible studies given    -> meetings held (confirmed or done, already past)
//   lessons studied        -> lessons finished, from what was sent
//   decisions              -> Explorers who reached Call, "point of decision"
//   sent out               -> Explorers who reached Commission
//   interests              -> Explorers walked with, and the new ones
//
// Steps forward are NET, from where each Explorer stood when the period began
// to where they stood when it ended, so a stage undone and done again is not
// counted twice.
//
// IT READS NOTHING THE READER COULD NOT ALREADY READ, and every number comes
// from data the app already keeps. The database decides what each person
// sees, and this file is told what it was given:
//
//   * A GUIDE sees their own Explorers in full: stage and its history,
//     meetings, lessons, and their own follow-ups.
//   * LEADERSHIP sees every Explorer in the church, but only the stage and its
//     history. Meetings, lessons and follow-ups belong to the Guide and the
//     Explorer, and leadership's rules do not read them; this report does not
//     ask for them, and says so on the screen rather than showing zeros.
//
// NEEDS ATTENTION is the point of a progress report: not a table of numbers,
// but the three Explorers somebody should ring this week. The rules are few
// and said in words on the screen.

import { STAGES, stageIndex } from '@/lib/brand';
import type { Stage } from '@/lib/types';

export type PeriodKey = 'this-month' | 'last-month' | 'this-quarter' | 'last-quarter';

export const PERIODS: ReadonlyArray<{ key: PeriodKey; label: string }> = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'this-quarter', label: 'This quarter' },
  { key: 'last-quarter', label: 'Last quarter' },
];

export interface Period {
  key: PeriodKey;
  /** "October 2026", or "Quarter 4, 2026 (October to December)". */
  label: string;
  /** Inclusive start and exclusive end, in local time. */
  from: Date;
  to: Date;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December'];

/** The month or quarter asked for, around `now`. Quarters are the calendar's, as Sabbath School's are. */
export function periodOf(key: PeriodKey, now: Date = new Date()): Period {
  const y = now.getFullYear();
  const m = now.getMonth();
  if (key === 'this-month' || key === 'last-month') {
    const start = new Date(y, m - (key === 'last-month' ? 1 : 0), 1);
    return {
      key,
      label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`,
      from: start,
      to: new Date(start.getFullYear(), start.getMonth() + 1, 1),
    };
  }
  const q = Math.floor(m / 3) - (key === 'last-quarter' ? 1 : 0);
  const start = new Date(y, q * 3, 1);
  const n = Math.floor(start.getMonth() / 3) + 1;
  return {
    key,
    label: `Quarter ${n}, ${start.getFullYear()} (${MONTHS[start.getMonth()]} to ${MONTHS[start.getMonth() + 2]})`,
    from: start,
    to: new Date(start.getFullYear(), start.getMonth() + 3, 1),
  };
}

// ---------------------------------------------------------------------------
// WHAT THE REPORT IS GIVEN
// ---------------------------------------------------------------------------

export interface ProgressInput {
  /** Who is reading. */
  me: string;
  /** 'mine' for a Guide: only the people they walk with. 'church' for leadership: everybody. */
  scope: 'mine' | 'church';
  /** Names by account id. */
  names: Record<string, string>;
  pairings: Array<{
    id: string; dm_id: string; ds_id: string; journey_stage: Stage; status: string; created_at: string;
  }>;
  events: Array<{ pairing_id: string; from_stage?: Stage | null; to_stage: Stage; created_at: string }>;
  /**
   * Absent when this reader's rules do not read meetings: then nothing about them is shown.
   * `held` means agreed and kept (confirmed or done); it counts once its time has passed.
   */
  meetings?: Array<{ pairing_id: string; at: string; held: boolean; cancelled: boolean }>;
  lessons?: Array<{ pairing_id: string; created_at: string; completed_at?: string | null }>;
  followUps?: Array<{ pairing_id: string; due_on?: string | null; done_at?: string | null }>;
}

export interface ExplorerProgress {
  pairingId: string;
  explorer: string;
  guide: string;
  stage: Stage;
  stageLabel: string;
  /** 1 to 6 along the journey. */
  step: number;
  status: string;
  pairedOn: string;
  /** When they reached the stage they are at; when they were paired if it has not moved. */
  since: string;
  daysAtStage: number;
  /** Stages reached during the period, in order. */
  reached: string[];
  /** Paired during the period. */
  isNew: boolean;
  studies?: { held: number; upcoming: number; lastMet: string | null };
  lessons?: { finished: number; open: number; total: number };
  followUps?: { done: number; open: number; overdue: number };
  /** Why somebody should look, in words. Empty when all is well. */
  attention: string[];
}

export interface ProgressReport {
  period: Period;
  scope: 'mine' | 'church';
  /** Whether meetings, lessons and follow-ups were readable, so the screen can say why they are missing. */
  detailed: boolean;
  explorers: ExplorerProgress[];
  totals: {
    walking: number;
    newExplorers: number;
    stepsForward: number;
    decisions: number;
    commissioned: number;
    studiesHeld?: number;
    lessonsFinished?: number;
    followUpsDone?: number;
    needingAttention: number;
  };
  byStage: Array<{ stage: Stage; label: string; count: number }>;
  /** Leadership only: each Guide, how many they walk with, and how many moved. */
  byGuide?: Array<{ guide: string; explorers: number; stepsForward: number; needingAttention: number }>;
}

const DAY = 24 * 60 * 60 * 1000;
/** No Bible study for this long, and somebody should ask why. */
export const QUIET_DAYS = 30;
/** At one stage this long, and it is worth a conversation. */
export const STILL_DAYS = 90;

const within = (iso: string | null | undefined, p: Period) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= p.from.getTime() && t < p.to.getTime();
};
const dateOnly = (iso: string) => iso.slice(0, 10);

/** The report for a period, from what the reader was given. */
export function buildProgress(input: ProgressInput, key: PeriodKey, now: Date = new Date()): ProgressReport {
  const period = periodOf(key, now);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const detailed = input.scope === 'mine' && !!input.meetings && !!input.lessons && !!input.followUps;
  // Archived pairings are history, not people being walked with.
  const pairings = input.pairings
    .filter((p) => p.status !== 'archived')
    .filter((p) => input.scope === 'church' || p.dm_id === input.me)
    // A pairing that began after the period was not part of it.
    .filter((p) => new Date(p.created_at).getTime() < period.to.getTime());

  const explorers = pairings.map((p): ExplorerProgress => {
    const history = input.events
      .filter((e) => e.pairing_id === p.id)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const lastToHere = [...history].reverse().find((e) => e.to_stage === p.journey_stage);
    const since = lastToHere?.created_at ?? p.created_at;
    // PROGRESS IS NET: where they were when the period began against where
    // they were when it ended. A stage stepped back and forward again in the
    // same month is not two steps; it is none.
    const stageAt = (t: number): Stage => {
      const before = history.filter((e) => new Date(e.created_at).getTime() < t);
      if (before.length) return before[before.length - 1].to_stage;
      return history[0]?.from_stage ?? history[0]?.to_stage ?? p.journey_stage;
    };
    const from = stageIndex(stageAt(period.from.getTime()));
    const to = stageIndex(stageAt(Math.min(period.to.getTime(), now.getTime() + 1)));
    const reached = to > from ? STAGES.slice(from + 1, to + 1).map((s) => s.label) : [];
    const daysAtStage = Math.max(0, Math.floor((now.getTime() - new Date(since).getTime()) / DAY));
    const active = p.status === 'active';
    const attention: string[] = [];
    if (p.status === 'paused') attention.push('Paused');

    let studies: ExplorerProgress['studies'];
    let lessons: ExplorerProgress['lessons'];
    let followUps: ExplorerProgress['followUps'];
    if (detailed) {
      const mine = input.meetings!.filter((x) => x.pairing_id === p.id && !x.cancelled);
      const held = mine.filter((x) => x.held && new Date(x.at).getTime() <= now.getTime());
      const lastMet = held.map((x) => x.at).sort().pop() ?? null;
      studies = {
        held: held.filter((x) => within(x.at, period)).length,
        upcoming: mine.filter((x) => new Date(x.at).getTime() > now.getTime()).length,
        lastMet,
      };
      const sent = input.lessons!.filter((x) => x.pairing_id === p.id);
      lessons = {
        finished: sent.filter((x) => within(x.completed_at, period)).length,
        open: sent.filter((x) => !x.completed_at).length,
        total: sent.length,
      };
      const reminders = input.followUps!.filter((x) => x.pairing_id === p.id);
      const open = reminders.filter((x) => !x.done_at);
      followUps = {
        done: reminders.filter((x) => within(x.done_at, period)).length,
        open: open.length,
        overdue: open.filter((x) => x.due_on && new Date(`${x.due_on}T00:00:00`).getTime() < today.getTime()).length,
      };
      if (active) {
        const paired = Math.floor((now.getTime() - new Date(p.created_at).getTime()) / DAY);
        if (!lastMet && paired > 14) attention.push('No Bible study yet');
        else if (lastMet) {
          const quiet = Math.floor((now.getTime() - new Date(lastMet).getTime()) / DAY);
          if (quiet > QUIET_DAYS) attention.push(`No Bible study for ${quiet} days`);
        }
        if (followUps.overdue) attention.push(`${followUps.overdue} follow-up${followUps.overdue === 1 ? '' : 's'} overdue`);
      }
    }
    if (active && daysAtStage >= STILL_DAYS && p.journey_stage !== 'commission') {
      attention.push(`At ${STAGES[stageIndex(p.journey_stage)]?.label ?? p.journey_stage} for ${daysAtStage} days`);
    }

    return {
      pairingId: p.id,
      explorer: input.names[p.ds_id] ?? 'An Explorer',
      guide: input.names[p.dm_id] ?? 'A Guide',
      stage: p.journey_stage,
      stageLabel: STAGES[stageIndex(p.journey_stage)]?.label ?? p.journey_stage,
      step: stageIndex(p.journey_stage) + 1,
      status: p.status,
      pairedOn: dateOnly(p.created_at),
      since: dateOnly(since),
      daysAtStage,
      reached,
      isNew: within(p.created_at, period),
      studies,
      lessons,
      followUps,
      attention,
    };
  })
    // Those needing attention first, then furthest along, then by name.
    .sort((a, b) => (b.attention.length > 0 ? 1 : 0) - (a.attention.length > 0 ? 1 : 0)
      || b.step - a.step || a.explorer.localeCompare(b.explorer));

  const sum = (f: (e: ExplorerProgress) => number) => explorers.reduce((n, e) => n + f(e), 0);
  const reachedCount = (label: string) => explorers.filter((e) => e.reached.includes(label)).length;
  const report: ProgressReport = {
    period,
    scope: input.scope,
    detailed,
    explorers,
    totals: {
      walking: explorers.filter((e) => e.status === 'active').length,
      newExplorers: explorers.filter((e) => e.isNew).length,
      stepsForward: sum((e) => e.reached.length),
      decisions: reachedCount(STAGES[stageIndex('call')].label),
      commissioned: reachedCount(STAGES[stageIndex('commission')].label),
      needingAttention: explorers.filter((e) => e.attention.length).length,
      ...(detailed ? {
        studiesHeld: sum((e) => e.studies!.held),
        lessonsFinished: sum((e) => e.lessons!.finished),
        followUpsDone: sum((e) => e.followUps!.done),
      } : {}),
    },
    byStage: STAGES.map((s) => ({ stage: s.key, label: s.label, count: explorers.filter((e) => e.stage === s.key).length })),
  };
  if (input.scope === 'church') {
    const guides = new Map<string, ExplorerProgress[]>();
    for (const e of explorers) guides.set(e.guide, [...(guides.get(e.guide) ?? []), e]);
    report.byGuide = [...guides.entries()]
      .map(([guide, list]) => ({
        guide,
        explorers: list.length,
        stepsForward: list.reduce((n, e) => n + e.reached.length, 0),
        needingAttention: list.filter((e) => e.attention.length).length,
      }))
      .sort((a, b) => a.guide.localeCompare(b.guide));
  }
  return report;
}

/** "October 4, 2026". */
export function dayLabel(date: string | null | undefined): string {
  const m = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}` : '';
}

/** The report as plain text: for a message to a Director, or a board meeting's notes. */
export function progressAsText(r: ProgressReport, title: string, notes = ''): string {
  const t = r.totals;
  const lines = [
    title,
    `Progress report · ${r.period.label}`,
    '',
    'SUMMARY',
    `- Explorers walked with: ${t.walking}`,
    `- New this period: ${t.newExplorers}`,
    `- Steps forward on the journey: ${t.stepsForward}`,
    `- Reached Call (point of decision): ${t.decisions}`,
    `- Reached Commission (sent to disciple): ${t.commissioned}`,
    ...(r.detailed ? [
      `- Bible studies held: ${t.studiesHeld}`,
      `- Lessons finished: ${t.lessonsFinished}`,
      `- Follow-ups done: ${t.followUpsDone}`,
    ] : []),
    `- Needing attention: ${t.needingAttention}`,
    '',
    'WHERE EVERYBODY IS',
    ...r.byStage.map((s) => `- ${s.label}: ${s.count}`),
  ];
  if (r.byGuide?.length) {
    lines.push('', 'BY GUIDE', ...r.byGuide.map((g) => `- ${g.guide}: ${g.explorers} walked with, ${g.stepsForward} steps forward${g.needingAttention ? `, ${g.needingAttention} needing attention` : ''}`));
  }
  lines.push('', 'EACH EXPLORER');
  for (const e of r.explorers) {
    const bits = [
      `${e.stageLabel} (step ${e.step} of 6) since ${dayLabel(e.since)}`,
      r.scope === 'church' ? `with ${e.guide}` : '',
      e.reached.length ? `reached ${e.reached.join(', ')} this period` : '',
      e.studies ? `${e.studies.held} Bible ${e.studies.held === 1 ? 'study' : 'studies'}${e.studies.lastMet ? `, last ${dayLabel(e.studies.lastMet)}` : ''}` : '',
      e.lessons ? `${e.lessons.finished} lesson${e.lessons.finished === 1 ? '' : 's'} finished, ${e.lessons.open} open` : '',
    ].filter(Boolean);
    lines.push(`- ${e.explorer}${e.isNew ? ' (new)' : ''}: ${bits.join('; ')}`);
    if (e.attention.length) lines.push(`  Needs attention: ${e.attention.join('; ')}`);
  }
  const said = notes.split('\n').map((l) => l.trim()).filter(Boolean);
  if (said.length) lines.push('', 'NOTES', ...said);
  return lines.join('\n');
}
