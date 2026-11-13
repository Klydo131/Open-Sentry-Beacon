'use client';

import { STAGES, stageIndex } from '@/lib/brand';
import type { Stage } from '@/lib/types';

// The disciple-making journey rendered as a horizontal path of six nodes, with
// the current stage highlighted and everything before it marked complete. This
// is the app's signature visual — it appears on the seeker detail, the DS home,
// and (as a legend) the admin dashboard.
//
// The six stages share the available width rather than sitting at fixed pixel
// sizes. The fixed layout needed ~580px, so on a phone it scrolled sideways and
// the labels underneath ran into each other and into the scrollbar. Here each
// stage is an equal-width column and the connecting lines take whatever is
// left, so it fits any screen down to ~320px without scrolling at all.
export function JourneyPath({
  current,
  compact = false,
}: {
  current: Stage;
  compact?: boolean;
}) {
  const idx = stageIndex(current);

  return (
    <ol className="flex w-full items-start">
      {STAGES.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        const reached = i <= idx;
        const last = i === STAGES.length - 1;
        return (
          <li key={s.key} className="flex min-w-0 flex-1 flex-col items-center">
            <div className="flex w-full items-center">
              <span
                className="h-1.5 flex-1"
                style={{
                  backgroundColor:
                    i === 0 ? 'transparent' : reached ? s.color : '#D9DEE8',
                }}
              />
              <span
                className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-4 ring-white ${
                  compact
                    ? 'h-8 w-8 text-sm'
                    : 'h-9 w-9 text-base sm:h-11 sm:w-11 sm:text-lg'
                }`}
                style={{
                  backgroundColor: reached ? s.color : '#C7CEDA',
                  boxShadow: active ? `0 0 0 4px ${s.color}55` : undefined,
                }}
                aria-current={active ? 'step' : undefined}
              >
                {done ? '✓' : i + 1}
              </span>
              <span
                className="h-1.5 flex-1"
                style={{
                  backgroundColor: last
                    ? 'transparent'
                    : i < idx
                      ? STAGES[i + 1].color
                      : '#D9DEE8',
                }}
              />
            </div>
            {!compact && (
              <div className="relative mt-2 w-full px-0.5 text-center">
                {/* Six labels do not fit across a phone. Measured at 360px each
                    column gets ~50px, and "Commission" needs 55px even at an
                    unreadable 8px — so every option that keeps all six either
                    clips them ("Culti…") or breaks them mid-word ("Commis
                    sion"). Both are worse than not showing them: these six C's
                    are the vocabulary the whole method is named for.

                    So on a phone only the stage you are on is named, floating
                    free of its column so long words stay whole. The numbered
                    dots carry the sequence, and every screen using this already
                    names the current stage beside it. Full labels and their
                    descriptions return as soon as there is room. */}
                <p
                  className={`whitespace-nowrap text-[11px] font-bold leading-tight sm:whitespace-normal sm:text-sm ${
                    active
                      ? 'absolute inset-x-0 top-0 sm:static'
                      : 'hidden sm:block'
                  }`}
                  style={{ color: reached ? '#1E2A4A' : '#9AA3B2' }}
                >
                  {s.label}
                </p>
                <p className="hidden text-xs text-gray-500 sm:block">{s.blurb}</p>
                {/* Holds the row's height on mobile, where the only label is
                    absolutely positioned. */}
                <span className="block h-4 sm:hidden" aria-hidden />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
