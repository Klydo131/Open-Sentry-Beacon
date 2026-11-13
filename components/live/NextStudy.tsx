'use client';

// One sentence telling an Explorer what to do today.
//
// WHY THIS EXISTS. Twenty-one studies are published in this church and two have
// been read. Nothing was broken in the library: the pairings are made, nobody is
// unpaired, materials are shared. What was missing is this card. My Journey
// opened on four folders and not one of them opened with a next step, so the
// studies sat behind a folder called Study and waited to be gone looking for.
//
// BY NAME, NOT BY COUNT. "You have 13 studies left" is a chore. "A king who
// could not sleep" is a thing somebody might want to read. The title is the
// whole point of the card, so it is the largest thing on it.
//
// AND A NUMBER THE EXPLORER MOVES THEMSELVES. The journey bar above this shows
// what the GUIDE has decided about somebody, and it does not move when they
// read. This one does, and the two sit together on purpose: what somebody else
// thinks of your progress, and what you actually did.

import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import * as live from '@/lib/live/data';
import { useKeepUp, KEEP_UP_STUDIES } from '@/lib/live/keep-up';

export function NextStudy({ onOpen }: { onOpen: (seriesId: string) => void }) {
  const [at, setAt] = useState<live.StudyProgress | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setAt(await live.myStudyProgress());
    } catch {
      // A card that cannot load is a card that is not drawn. It is an
      // invitation, not a control somebody is waiting on, so failing quietly
      // is better than an error where the encouragement should be.
      setFailed(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Marking one read on the Study folder changes what is next here.
  useKeepUp(KEEP_UP_STUDIES, load);

  if (failed || !at || at.total_count === 0) return null;

  const done = at.read_count >= at.total_count;

  return (
    <Card className="p-5">
      {done ? (
        <>
          <h2 className="text-xl font-bold text-navy">
            You have read everything on the shelf
          </h2>
          <p className="mt-1 text-gray-600">
            All {at.total_count} studies your church has published. When somebody
            adds another, it appears here.
          </p>
        </>
      ) : (
        <>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Read next
          </p>
          <h2 className="mt-1 text-xl font-extrabold text-navy">{at.next_title}</h2>
          <p className="mt-0.5 text-sm text-gray-500">{at.next_series}</p>

          {at.next_series_id && (
            <Button
              variant="gold"
              className="mt-4"
              onClick={() => onOpen(at.next_series_id as string)}
            >
              Open it
            </Button>
          )}
        </>
      )}

      {/* THE NUMBER, UNDER THE INVITATION RATHER THAN OVER IT. Somebody at 0 of
          15 should meet a title first and a tally second; the other way round
          greets them with how far behind they are. */}
      <div className="mt-4 border-t border-black/5 pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-gray-500">You have read</p>
          <p className="text-sm font-bold text-navy">
            {at.read_count} of {at.total_count}
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.round((at.read_count / at.total_count) * 100)}%`,
              backgroundColor: '#7FB03A',
            }}
          />
        </div>
      </div>
    </Card>
  );
}
