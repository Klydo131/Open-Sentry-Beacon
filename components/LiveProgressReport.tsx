'use client';

// The progress report in a church's own app: the same screen as the sample
// church's (components/ProgressReport.tsx), given what the database lets this
// reader see.
//
// A GUIDE asks for their pairings, the journey, their meetings, the lessons
// sent and their own follow-ups. LEADERSHIP asks for the pairings and the
// journey only: the rules give leadership every Explorer's stage and its
// history, and nothing inside a pairing, and this screen does not ask for what
// it would not be given. No policy changed for it.
//
// It keeps up: a stage moved, a study confirmed or a lesson finished elsewhere
// changes the report while it is open.

import { useCallback, useEffect, useState } from 'react';
import { ProgressReportView } from '@/components/ProgressReport';
import * as live from '@/lib/live/data';
import { humanError } from '@/lib/live/errors';
import { KEEP_UP_PROGRESS, useKeepUp } from '@/lib/live/keep-up';
import type { ProgressInput } from '@/lib/progress-report';

export function LiveProgressReport({ me, role, churchName }: { me: string; role: string; churchName?: string }) {
  const [input, setInput] = useState<ProgressInput | null>(null);
  const [status, setStatus] = useState('');
  const guide = role === 'dm';

  const load = useCallback(async () => {
    try {
      const [pairings, events] = await Promise.all([live.listPairings(), live.listJourneyEvents()]);
      const names: Record<string, string> = {};
      for (const p of pairings) {
        names[p.dm_id] = p.dm_name;
        names[p.ds_id] = p.ds_name;
      }
      const base = {
        me,
        scope: guide ? ('mine' as const) : ('church' as const),
        names,
        pairings,
        events,
      };
      if (!guide) {
        setInput(base);
      } else {
        const [meetings, lessons, followUps] = await Promise.all([
          live.listMeetingTimes(), live.listAssignments(), live.listFollowUps(),
        ]);
        setInput({
          ...base,
          meetings: meetings.map((m) => ({
            pairing_id: m.pairing_id,
            at: m.starts_at,
            held: m.status === 'confirmed' || m.status === 'done',
            cancelled: m.status === 'cancelled' || m.status === 'declined',
          })),
          lessons: lessons.map((a) => ({ pairing_id: a.pairing_id, created_at: a.created_at, completed_at: a.completed_at })),
          followUps,
        });
      }
      setStatus('');
    } catch (cause) {
      setStatus(humanError(cause, 'The report could not be read. Please try again.'));
    }
  }, [me, guide]);

  useEffect(() => { void load(); }, [load]);
  useKeepUp(KEEP_UP_PROGRESS, load);

  return <ProgressReportView input={input} owner={me} title={churchName ?? ''} status={status} />;
}
