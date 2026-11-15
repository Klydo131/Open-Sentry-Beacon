// The analysis under the Mission pulse: the raw counts behind every chart, one
// row per journey, and the few correlations that a church can honestly read.
//
// ---------------------------------------------------------------------------
// WHY THESE CORRELATIONS. Each one asks a question the research says matters,
// using only what the app already records about a journey (no names):
//
//   1. Waiting for a Guide  vs  progress.  Follow-up speed is the strongest
//      lead measure churches report: newcomers contacted within a day return
//      far more than those contacted after a week.
//   2. Meetings held  vs  progress.  Discipleship research finds frequency of
//      meeting together tracks with growth (Lifeway; Baylor on small groups).
//   3. A Guide's number of journeys  vs  progress.  Whether a Guide is carrying
//      more people than they can walk with well.
//   4. Digital or in person  vs  progress.  Whether one way is moving faster.
//   5. Journey age  vs  stage.  A sanity check: older journeys should be
//      further on. If this one is weak, the stages are not being updated.
//
// HOW THEY ARE READ. Spearman's rank correlation, because the numbers are small
// and a stage is an order, not a measure. Nothing is worked out with fewer than
// MIN_N journeys, a strength is named in words, and anything the sample cannot
// separate from chance says so. Correlation is never presented as cause.
// ---------------------------------------------------------------------------

import { DAY, STAGE_ORDER, PERIODS, type PulseInput } from './mission-pulse.ts';

export const MIN_N = 8;

/** Ranks with ties shared (average rank), 1-based. */
export function ranks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(values.length);
  for (let i = 0; i < order.length;) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k += 1) out[order[k][1]] = r;
    i = j + 1;
  }
  return out;
}

export function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n < 3 || y.length !== n) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i += 1) { const dx = x[i] - mx; const dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Spearman's rho: Pearson on the ranks, which handles ties correctly. */
export function spearman(x: number[], y: number[]): number | null {
  return pearson(ranks(x), ranks(y));
}

export type Strength = 'none' | 'weak' | 'moderate' | 'strong';
export function strength(r: number): Strength {
  const a = Math.abs(r);
  return a < 0.1 ? 'none' : a < 0.3 ? 'weak' : a < 0.5 ? 'moderate' : 'strong';
}

/** The size a correlation must reach before chance is an unlikely explanation (two-sided, about 5%). */
export function chanceLine(n: number): number {
  return n > 1 ? 1.96 / Math.sqrt(n - 1) : 1;
}

export interface JourneyRow {
  /** A number, not an id: "Journey 4". */
  n: number;
  stage: string;
  stageIndex: number;
  status: string;
  track: string;
  ageDays: number;
  waitDays: number | null;
  steps: number;
  /** Steps forward per 30 days of the journey. */
  pace: number;
  daysSinceStep: number;
  guideLoad: number;
  meetings: number | null;
}

const t = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);
const round1 = (v: number) => Math.round(v * 10) / 10;

export function journeyRows(input: PulseInput): JourneyRow[] {
  const { now } = input;
  const joined = new Map(input.members.map((m) => [m.id, t(m.joinedAt)]));
  const load = new Map<string, number>();
  for (const p of input.pairings) if (p.status === 'active' && p.dmId) load.set(p.dmId, (load.get(p.dmId) ?? 0) + 1);
  const meetingsOf = input.journeyMeetings
    ? (id: string) => input.journeyMeetings!.filter((m) => m.pairingId === id && m.done).length
    : null;
  return input.pairings
    .filter((p) => p.status === 'active' || p.status === 'completed' || p.status === 'archived')
    .map((p, i) => {
      const start = t(p.createdAt);
      const moves = input.moves.filter((m) => m.pairingId === p.id);
      const forward = moves.filter((m) => !m.from || STAGE_ORDER.indexOf(m.to) > STAGE_ORDER.indexOf(m.from));
      const last = Math.max(start, ...moves.map((m) => t(m.at)).filter(Number.isFinite));
      const age = Math.max(0, (now - start) / DAY);
      const j = joined.get(p.dsId);
      const wait = j !== undefined && Number.isFinite(j) && Number.isFinite(start) ? Math.max(0, (start - j) / DAY) : null;
      return {
        n: i + 1,
        stage: p.stage,
        stageIndex: STAGE_ORDER.indexOf(p.stage),
        status: p.status,
        track: p.track ?? 'traditional',
        ageDays: round1(age),
        waitDays: wait === null ? null : round1(wait),
        steps: forward.length,
        pace: round1((forward.length / Math.max(30, age)) * 30),
        daysSinceStep: round1(Math.max(0, (now - last) / DAY)),
        guideLoad: p.dmId ? (load.get(p.dmId) ?? 0) : 0,
        meetings: meetingsOf ? meetingsOf(p.id) : null,
      };
    });
}

export interface Finding {
  key: string;
  question: string;
  x: string;
  y: string;
  n: number;
  r: number | null;
  strength: Strength | null;
  /** True when the sample is big enough and the correlation clears the chance line. */
  likelyReal: boolean;
  reading: string;
  points: { x: number; y: number }[];
  /** Why there is no answer, when there is none. */
  missing?: string;
}

function finding(key: string, question: string, x: string, y: string, pts: { x: number; y: number }[],
  say: (r: number) => string, missing?: string): Finding {
  const n = pts.length;
  if (missing) return { key, question, x, y, n, r: null, strength: null, likelyReal: false, reading: missing, points: pts, missing };
  if (n < MIN_N) {
    return { key, question, x, y, n, r: null, strength: null, likelyReal: false, points: pts,
      reading: `Needs at least ${MIN_N} journeys to say anything; there ${n === 1 ? 'is' : 'are'} ${n}.`, missing: 'few' };
  }
  // TIES MISLEAD. When most journeys sit on one point (every new journey waited
  // no days and has taken no step yet), a rank correlation is computed from a
  // handful of others and reads far stronger than it is. Say so instead.
  const distinct = (vals: number[]) => new Set(vals).size;
  const pile = Math.max(...[...pts.reduce((m, p) => m.set(`${p.x}|${p.y}`, (m.get(`${p.x}|${p.y}`) ?? 0) + 1), new Map<string, number>()).values()]);
  if (distinct(pts.map((p) => p.x)) < 3 || distinct(pts.map((p) => p.y)) < 3 || pile > n / 2) {
    return { key, question, x, y, n, r: null, strength: null, likelyReal: false, points: pts, missing: 'ties',
      reading: pile > n / 2
        ? `${pile} of ${n} journeys sit on exactly the same point, so a correlation here would mislead. It will mean something as journeys spread out.`
        : 'Too few different values to compare yet. It will mean something as journeys spread out.' };
  }
  const r = spearman(pts.map((p) => p.x), pts.map((p) => p.y));
  if (r === null) {
    return { key, question, x, y, n, r: null, strength: null, likelyReal: false, points: pts,
      reading: 'Every journey has the same value here, so there is nothing to compare.', missing: 'flat' };
  }
  const s = strength(r);
  const likelyReal = Math.abs(r) >= chanceLine(n) && s !== 'none';
  const caution = likelyReal ? '' : ' With this many journeys it could easily be chance.';
  return { key, question, x, y, n, r: Math.round(r * 100) / 100, strength: s, likelyReal, points: pts,
    reading: `${s === 'none' ? 'No real link.' : say(r)}${caution}` };
}

const dir = (r: number, up: string, down: string) => (r > 0 ? up : down);

/** The correlations, each with its points for a scatter and a plain reading. */
export function findings(rows: JourneyRow[]): Finding[] {
  const active = rows.filter((r) => r.status === 'active');
  const withWait = active.filter((r) => r.waitDays !== null);
  const out: Finding[] = [
    finding('wait', 'Does waiting longer for a Guide slow the journey down?', 'Days waited for a Guide', 'Pace (steps per month)',
      withWait.map((r) => ({ x: r.waitDays!, y: r.pace })),
      (r) => dir(r, 'Journeys that waited longer for a Guide are moving faster. Unexpected: worth a look.',
        'Journeys that waited longer for a Guide are moving more slowly. Pairing new Explorers quickly matters here.')),
    finding('meetings', 'Do journeys with more meetings move further?', 'Meetings held', 'Stage reached',
      active.filter((r) => r.meetings !== null).map((r) => ({ x: r.meetings!, y: r.stageIndex })),
      (r) => dir(r, 'Journeys with more meetings have gone further. Meeting in person or online seems to go with progress.',
        'Journeys with more meetings are at earlier stages, perhaps because new journeys meet more.'),
      active.some((r) => r.meetings !== null) ? undefined : 'Meetings for each journey are private to the Guide and Explorer on this copy, so this cannot be worked out.'),
    finding('load', 'Are Guides carrying too many people?', 'Journeys the Guide carries', 'Pace (steps per month)',
      active.map((r) => ({ x: r.guideLoad, y: r.pace })),
      (r) => dir(r, 'Busier Guides are moving their journeys faster.',
        'Guides with more people are moving each journey more slowly. Consider sharing the load with new Guides.')),
    finding('track', 'Is digital or in-person moving faster?', 'Digital (1) or in person (0)', 'Pace (steps per month)',
      active.map((r) => ({ x: r.track === 'digital' ? 1 : 0, y: r.pace })),
      (r) => dir(r, 'Digital journeys are moving faster than in-person ones.', 'In-person journeys are moving faster than digital ones.')),
    finding('age', 'Are stages being kept up to date?', 'Days since the journey began', 'Stage reached',
      active.map((r) => ({ x: r.ageDays, y: r.stageIndex })),
      (r) => dir(r, 'Older journeys are further on, as they should be: stages are being kept up to date.',
        'Older journeys are at earlier stages. Stages may not be updated when people move on.')),
  ];
  return out;
}

export interface CountRow { label: string; explorers: number; guides: number; pairings: number; steps: number; meetings: number; invitations: number }

/** The counts behind the charts, one row per bucket of the period, oldest first. */
export function countTable(input: PulseInput, periodDays: number): CountRow[] {
  const spec = PERIODS.find((p) => p.days === periodDays) ?? PERIODS[1];
  const span = spec.days * DAY;
  const start = input.now - span;
  const size = span / spec.buckets;
  const rows: CountRow[] = Array.from({ length: spec.buckets }, (_, i) => {
    const from = new Date(start + i * size);
    return {
      label: from.toLocaleDateString([], spec.days >= 365 ? { month: 'short', year: '2-digit' } : { day: 'numeric', month: 'short' }),
      explorers: 0, guides: 0, pairings: 0, steps: 0, meetings: 0, invitations: 0,
    };
  });
  const put = (iso: string | null | undefined, key: keyof Omit<CountRow, 'label'>) => {
    const at = t(iso);
    if (!Number.isFinite(at) || at < start || at > input.now) return;
    rows[Math.min(spec.buckets - 1, Math.floor((at - start) / size))][key] += 1;
  };
  for (const m of input.members) {
    if (m.role === 'ds') put(m.joinedAt, 'explorers');
    else if (m.role === 'dm') put(m.joinedAt, 'guides');
  }
  for (const p of input.pairings) put(p.createdAt, 'pairings');
  for (const mv of input.moves) if (!mv.from || STAGE_ORDER.indexOf(mv.to) > STAGE_ORDER.indexOf(mv.from)) put(mv.at, 'steps');
  for (const m of input.meetings) if (m.done) put(m.at, 'meetings');
  for (const i of input.invites) put(i.createdAt, 'invitations');
  return rows;
}

/** A CSV a spreadsheet opens, with no name or id in it. */
export function toCsv(head: string[], rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    const s = v === null ? '' : String(v);
    return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}
