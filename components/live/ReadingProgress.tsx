'use client';

/**
 * How far through the studies somebody has got.
 *
 * THE ASK: "Can we add the progress bar that can be recorded by the EDs and
 * Directors if the Explorer is really Reading the Lesson studies from the
 * samples and the Guide made for the Explorer."
 *
 * ONE COMPONENT, THREE SCREENS. The Explorer sees their own bar above their
 * studies, a Guide sees it on the person they walk with, and a Director or
 * Executive Director sees it on the member's card. Three copies of a
 * percentage calculation is two chances for the Director's number to disagree
 * with the Explorer's, and a leader and a member looking at different figures
 * for the same thing is worse than having no figure at all.
 *
 * THE NUMBER IS NOT DECORATION. `BeaconLoader` carries a rule in its header
 * that a bar must never invent a percentage, and this one obeys it: the
 * numerator is rows in `lesson_reads` and the denominator is lessons that
 * exist. When there is nothing to read the bar does not draw at all, because
 * zero out of zero is not nought per cent, it is a question with no answer.
 *
 * WHAT IT CANNOT DO. It cannot show a leader more than the database will hand
 * them. `may_see_reading()` answers for the member themselves, the Guide paired
 * with them, and the Directors of their church; anybody else reads an empty
 * list and sees "nothing recorded yet". That is the same thing an Explorer who
 * has genuinely read nothing looks like, on purpose -- a distinguishable
 * refusal would tell a stranger which members exist.
 */

import { useCallback, useEffect, useState } from 'react';
import * as live from '@/lib/live/data';
import { useKeepUp, KEEP_UP_STUDIES } from '@/lib/live/keep-up';

/** The house green, and the green the app already uses for a finished thing. */
const GOING = '#7FB03A';
const FINISHED = '#16A34A';

export function percentRead(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

/**
 * The bar itself.
 *
 * `aria-hidden` on the track, with the same figures written out in text beside
 * it. A screen reader announcing "sixty per cent" and nothing else tells
 * somebody a proportion of an amount they were never told.
 */
export function ReadingBar(
  { done, total, label }: { done: number; total: number; label?: string },
) {
  const pct = percentRead(done, total);
  const finished = total > 0 && done >= total;
  return (
    <div data-reading-bar={`${done}/${total}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-navy">{label ?? 'Studies read'}</p>
        <p className="text-sm font-bold tabular-nums text-gray-600">
          {finished ? 'All read' : `${done} of ${total}`}
        </p>
      </div>
      <div
        className="mt-2 h-2.5 overflow-hidden rounded-full bg-gray-100"
        role="img"
        aria-label={`${done} of ${total} studies read, ${pct} per cent`}
      >
        <div
          className="h-2.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: finished ? FINISHED : GOING }}
        />
      </div>
    </div>
  );
}

/**
 * A member's reading, loaded and drawn.
 *
 * Used by the Director's member card and by a Guide's page for the person they
 * walk with. It keeps up on its own, so a Director watching while somebody
 * reads sees the bar move without touching anything.
 */
export function MemberReading({ memberId, name }: { memberId: string; name?: string }) {
  const [reading, setReading] = useState<live.Reading | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const [index, read] = await Promise.all([
        live.listLessonIndex(),
        live.listReadsFor(memberId),
      ]);
      // Only reads of lessons that still exist. A study deleted after it was
      // read would otherwise push the bar past its own end.
      const alive = new Set(index.map((l) => l.id));
      setReading({ done: read.filter((id) => alive.has(id)).length, total: index.length });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [memberId]);

  useEffect(() => { void load(); }, [load]);
  useKeepUp(KEEP_UP_STUDIES, load);

  if (failed) return null;
  if (!reading) return <p className="text-sm text-gray-500">Counting the studies…</p>;
  if (reading.total === 0) return null;

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
      <ReadingBar
        done={reading.done}
        total={reading.total}
        label={name ? `${name} has read` : 'Studies read'}
      />
      {reading.done === 0 ? (
        <p className="mt-2 text-sm text-gray-500">
          Nothing marked read yet. Only they can mark a study read, so this
          stays empty until they do.
        </p>
      ) : (
        <p className="mt-2 text-sm text-gray-500">
          Each one was marked read by them, not by a leader.
        </p>
      )}
    </div>
  );
}
