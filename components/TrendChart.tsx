'use client';

import { peak, type TrendPoint } from '@/lib/analytics-trend';

// A bar chart of activity over time, in plain SVG.
//
// No charting library on purpose. A church app that has to stay installable on a
// four-year-old Android should not carry sixty kilobytes of JavaScript to draw
// eight rectangles, and every library here would need theming to match anyway.
//
// Three things it does that a row of numbers cannot:
//
//   - The bar in progress is drawn differently. The current week is always
//     lower than the last one simply because it has not finished, and a chart
//     that hides that invites a church council to read a Tuesday as a decline.
//   - An empty bucket keeps its slot and gets a visible floor. A quiet fortnight
//     is the most useful thing this screen can say, and it can only say it if
//     the gap is drawn.
//   - It reads as a sentence to a screen reader, because a picture of a trend is
//     no use to somebody who cannot see it.
export function TrendChart({
  points,
  color = '#2F80ED',
  height = 96,
  unit = 'actions',
}: {
  points: TrendPoint[];
  color?: string;
  height?: number;
  unit?: string;
}) {
  if (points.length === 0) return null;
  const max = peak(points);

  const spoken = points
    .map((p) => `${p.label}: ${p.total}${p.partial ? ' so far' : ''}`)
    .join('; ');

  return (
    <div>
      <div
        role="img"
        aria-label={`${unit} over time. ${spoken}.`}
        className="flex items-end gap-1"
        style={{ height }}
      >
        {points.map((p) => {
          // A floor of 3px so an empty bucket is a visible gap rather than a
          // missing one. Nothing is a reading too.
          const h = Math.max(3, Math.round((p.total / max) * (height - 18)));
          return (
            <div key={p.start} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-bold leading-none text-gray-500">
                {p.total > 0 ? p.total : ''}
              </span>
              <div
                className="w-full rounded-t"
                style={{
                  height: h,
                  backgroundColor: p.total === 0 ? '#E5E7EB' : color,
                  // The bucket in progress is hatched rather than solid: it is
                  // not a smaller number, it is an unfinished one.
                  opacity: p.partial ? 0.45 : 1,
                }}
              />
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-1 flex gap-1">
        {points.map((p, i) => (
          <span
            key={p.start}
            className="flex-1 truncate text-center text-[10px] text-gray-500"
          >
            {/* Every other label on a narrow screen, or they collide. */}
            {i % 2 === 0 || points.length <= 5 ? p.label : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

/** "Up 40% on last week", or the honest version when there is no last week. */
export function MomentumLine({
  latest,
  previous,
  deltaPct,
  direction,
  noun = 'actions',
  period = 'week',
}: {
  latest: number;
  previous: number;
  deltaPct: number | null;
  direction: 'up' | 'down' | 'flat';
  noun?: string;
  period?: string;
}) {
  const arrow = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '●';
  const colour =
    direction === 'up' ? '#16A34A' : direction === 'down' ? '#B45309' : '#6B7280';

  return (
    <p className="text-sm text-gray-600">
      <span style={{ color: colour }} className="font-bold">
        {arrow} {latest}
      </span>{' '}
      {noun} this {period}
      {deltaPct === null ? (
        previous === 0 && latest > 0 ? (
          <>, the first this {period} after a quiet one</>
        ) : (
          <>, with no {period} before this one to compare with</>
        )
      ) : (
        <>
          , {Math.abs(deltaPct)}%{' '}
          {deltaPct > 0 ? 'more than' : deltaPct < 0 ? 'fewer than' : 'the same as'} last{' '}
          {period} ({previous})
        </>
      )}
      .
    </p>
  );
}
