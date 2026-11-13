import type { AnalyticsEvent } from './types';

// Activity over time.
//
// The analytics screen described itself as "counts and trends" and had no trend
// in it: every figure was a total since the beginning, plus one number for the
// last seven days. A total that only ever goes up cannot answer the question a
// church council actually asks, which is never "how many messages have ever been
// sent" but .
//
// So this is the shape of the answer: buckets of equal length, in order, ending
// with the one happening now. Pure functions over events, no React and no
// storage, so the same numbers can be drawn on a screen, read out in a meeting
// or checked by a test without any of them disagreeing.

export type Grain = 'day' | 'week';

export interface TrendPoint {
  /** Start of the bucket, as an ISO date (local midnight). */
  start: string;
  /** Short label for an axis: "12 Aug", or "12 Aug" meaning the week from it. */
  label: string;
  /** Events in this bucket. */
  total: number;
  /** True for the bucket containing `now` — it is incomplete, and says so. */
  partial: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday-start weeks: a church week is talked about as a week, not seven days. */
function startOfWeek(t: number): number {
  const d = new Date(startOfDay(t));
  // getDay() is 0 for Sunday; shift so Monday is 0.
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return d.getTime();
}

function label(start: number, grain: Grain): string {
  return new Date(start).toLocaleDateString([], {
    day: 'numeric',
    month: grain === 'week' ? 'short' : 'short',
  });
}

/**
 * Bucket events into the last `count` days or weeks, oldest first.
 *
 * Empty buckets are kept. A gap is information — a fortnight with nothing in it
 * is the single most useful thing this screen can show a church — and dropping
 * empty buckets would draw a chart that quietly closes the gap up.
 */
export function trend(
  events: AnalyticsEvent[],
  opts: {
    grain: Grain;
    count: number;
    now?: number;
    /** Only count these event types. Omit for everything. */
    types?: ReadonlyArray<AnalyticsEvent['type']>;
  },
): TrendPoint[] {
  const { grain, count } = opts;
  const now = opts.now ?? Date.now();
  const typeSet = opts.types ? new Set<string>(opts.types) : null;

  const size = grain === 'week' ? 7 * DAY_MS : DAY_MS;
  const currentStart = grain === 'week' ? startOfWeek(now) : startOfDay(now);

  const starts: number[] = [];
  for (let i = count - 1; i >= 0; i--) {
    // Stepping back by a fixed size and re-normalising keeps the buckets aligned
    // across a daylight-saving change, where a "week" is 167 or 169 hours.
    const approx = currentStart - i * size;
    starts.push(grain === 'week' ? startOfWeek(approx) : startOfDay(approx));
  }

  const totals = new Array<number>(starts.length).fill(0);
  const firstStart = starts[0];
  for (const e of events) {
    if (typeSet && !typeSet.has(e.type)) continue;
    const t = new Date(e.at).getTime();
    if (!Number.isFinite(t) || t < firstStart || t > now) continue;
    // Last bucket whose start is at or before this event.
    let idx = -1;
    for (let i = starts.length - 1; i >= 0; i--) {
      if (t >= starts[i]) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) totals[idx] += 1;
  }

  return starts.map((start, i) => ({
    start: new Date(start).toISOString(),
    label: label(start, grain),
    total: totals[i],
    partial: i === starts.length - 1,
  }));
}

export interface Momentum {
  /** The bucket in progress. Incomplete by definition. */
  latest: number;
  /** The last complete bucket, which is the honest comparison. */
  previous: number;
  /**
   * Change from `previous` to `latest`, as a percentage. Null when there is
   * nothing to divide by: going from zero to anything is not "up 100%", it is
   * going from nothing to something, and saying it as a percentage is a lie
   * dressed as arithmetic.
   */
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat';
}

export function momentum(points: TrendPoint[]): Momentum {
  const latest = points.length ? points[points.length - 1].total : 0;
  const previous = points.length > 1 ? points[points.length - 2].total : 0;
  const deltaPct =
    previous === 0 ? null : Math.round(((latest - previous) / previous) * 100);
  return {
    latest,
    previous,
    deltaPct,
    direction: latest > previous ? 'up' : latest < previous ? 'down' : 'flat',
  };
}

/**
 * The busiest bucket, for scaling a chart. Never zero, so a chart of an empty
 * church divides by one instead of by nothing.
 */
export function peak(points: TrendPoint[]): number {
  return Math.max(1, ...points.map((p) => p.total));
}

/** Buckets with nothing in them at all. Quiet weeks are worth naming. */
export function quietCount(points: TrendPoint[]): number {
  // The bucket in progress is not quiet, it is unfinished.
  return points.filter((p) => !p.partial && p.total === 0).length;
}
