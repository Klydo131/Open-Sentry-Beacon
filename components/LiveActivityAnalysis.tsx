'use client';

// Who is being walked with, and who is not.
//
// ---------------------------------------------------------------------------
// ASKED FOR: "Head ED, ED, and Directors must have analysis to track Guide and
// Explorer activities please."
//
// WHY THIS IS NOT THE ACTIVITY RECORD AGAIN. The record answers "what
// happened", newest first, and it is the right shape for a question about an
// event. It is the wrong shape for the question a Director actually carries,
// which is "is anybody being left". Forty rows of things that happened do not
// say that one Explorer has heard from nobody in three weeks: that person
// appears in the feed exactly zero times, which is the whole problem, and a
// list of events can only ever show what is there.
//
// SO THE QUIET COLUMN IS THE POINT OF THE SCREEN. Everything else here is
// context for it. The rows arrive sorted with the unpaired first and then the
// quietest, because sorting by name puts the person nobody has noticed wherever
// the alphabet happens to put them, which is how they stay unnoticed.
//
// AND THE SAME TWO RULES AS EVERYWHERE ELSE, because they are the church's and
// not this screen's: nothing here reads a conversation, and nothing here can
// show an address. Every figure is a count or a number of days.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from 'react';

import * as live from '@/lib/live/data';
import { useKeepUp, KEEP_UP_ACTIVITY_ANALYSIS } from '@/lib/live/keep-up';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { Card } from '@/components/ui';
import { humanError } from '@/lib/live/errors';

const ROLE_WORD: Record<string, string> = {
  dm: 'Guide', ds: 'Explorer', admin: 'Director',
};

/** How far back the counts look. */
const WINDOWS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

/**
 * WHEN QUIET STOPS BEING NORMAL AND STARTS BEING A QUESTION.
 *
 * Fourteen days is not a rule about people, it is where a Director should look.
 * Somebody quiet for a fortnight may be on a fishing boat; the point is that
 * their Guide should know which.
 */
const WORTH_ASKING = 14;

function Tile({ n, label, hint, tone = 'plain' }: {
  n: number; label: string; hint?: string; tone?: 'plain' | 'good' | 'watch';
}) {
  const bg = tone === 'good' ? 'bg-green-50' : tone === 'watch' ? 'bg-amber-50' : 'bg-gray-50';
  const ink = tone === 'good' ? 'text-green-800' : tone === 'watch' ? 'text-amber-900' : 'text-navy';
  return (
    <div className={`rounded-2xl ${bg} p-4 ring-1 ring-black/5`}>
      <p className={`text-3xl font-black tabular-nums ${ink}`}>{n}</p>
      <p className="mt-0.5 text-sm font-semibold text-navy">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function LiveActivityAnalysis() {
  const [rows, setRows] = useState<live.ActivityAnalysis[] | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');
  const [find, setFind] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      setRows(await live.activityAnalysis(days));
    } catch (cause) {
      setRows([]);
      setError(humanError(cause, 'Could not read the activity analysis.'));
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);
  // A DIRECTOR READS THIS WHILE THEY PAIR PEOPLE. A count that still says one
  // Explorer has no Guide after they have just given that person a Guide is a
  // count they stop believing, and this screen is only worth having if its
  // numbers are believed.
  useKeepUp(KEEP_UP_ACTIVITY_ANALYSIS, load);

  const all = rows ?? [];
  const shown = useMemo(() => {
    const needle = find.trim().toLowerCase();
    return needle
      ? all.filter((r) => r.person_name.toLowerCase().includes(needle))
      : all;
  }, [all, find]);

  const unpaired = all.filter((r) => r.person_role === 'ds' && !r.walks_with).length;
  const quiet = all.filter((r) => r.quiet_days >= WORTH_ASKING).length;
  const flagged = all.reduce((sum, r) => sum + r.flagged, 0);
  const refused = all.reduce((sum, r) => sum + r.appointments_declined, 0);

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-navy">📈 Who is walking with whom</h2>
          <p className="mt-1 text-sm text-gray-500">
            What each Guide and Explorer has been doing. Counts and dates only:
            no conversation and no addresses appear here.
          </p>
        </div>
        <label className="text-sm">
          <span className="sr-only">How far back to count</span>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="tap rounded-xl bg-gray-100 px-3 text-base"
          >
            {WINDOWS.map((w) => <option key={w.days} value={w.days}>{w.label}</option>)}
          </select>
        </label>
      </div>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>
      )}

      {rows === null ? (
        <BeaconSpinner inline label="Reading the analysis" className="mt-4" />
      ) : (
        <>
          {/* THE FOUR NUMBERS A DIRECTOR IS ACTUALLY HERE FOR. An Explorer with
              no Guide is first because it is the only one of the four that
              means somebody is in an app where nothing happens. */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile
              n={unpaired}
              label="Explorers with no Guide"
              hint={unpaired === 0 ? 'Everybody is walking with somebody.' : 'Pair these first.'}
              tone={unpaired === 0 ? 'good' : 'watch'}
            />
            <Tile
              n={quiet}
              label={`Quiet ${WORTH_ASKING} days or more`}
              hint="Worth a Guide asking, not a Director acting."
              tone={quiet === 0 ? 'good' : 'watch'}
            />
            <Tile
              n={flagged}
              label="Things needing a look"
              hint="Labelled by the database, never by a person."
              tone={flagged === 0 ? 'good' : 'watch'}
            />
            <Tile n={refused} label="Appointments declined" hint="A no is an answer, not a problem." />
          </div>

          {all.length > 6 && (
            <input
              value={find}
              onChange={(e) => setFind(e.target.value)}
              type="search"
              placeholder="Type somebody's name"
              aria-label="Search this analysis by name"
              className="tap mt-4 w-full rounded-xl bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-gold"
            />
          )}

          {shown.length === 0 ? (
            <p className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
              {all.length === 0
                ? 'Nobody in this church is yours to watch yet.'
                : `Nobody here matches “${find.trim()}”.`}
            </p>
          ) : (
            // A LIST OF CARDS AND NOT A TABLE. Eleven columns is a spreadsheet,
            // and a spreadsheet on a 360px phone is a horizontal scroll nobody
            // performs. A Director reads this on the phone in their hand.
            <ul className="mt-4 space-y-2">
              {shown.map((r) => (
                <li
                  key={r.person_id}
                  className={`rounded-2xl p-4 ring-1 ${
                    r.person_role === 'ds' && !r.walks_with
                      ? 'bg-amber-50 ring-amber-200'
                      : 'bg-gray-50 ring-black/5'
                  }`}
                >
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <p className="font-bold text-navy">{r.person_name}</p>
                    <span className="text-sm text-gray-500">{ROLE_WORD[r.person_role] ?? r.person_role}</span>
                    {r.quiet_days >= WORTH_ASKING && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                        Quiet {r.quiet_days} days
                      </span>
                    )}
                    {r.flagged > 0 && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-900">
                        {r.flagged} needing a look
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-gray-700">
                    {r.person_role === 'dm'
                      ? <>Carries <strong className="tabular-nums">{r.explorers_carried}</strong> of {r.cap}
                        {r.walks_with ? <> · {r.walks_with}</> : <> · nobody yet</>}</>
                      : r.walks_with
                        ? <>Walks with <strong>{r.walks_with}</strong></>
                        : <strong className="text-amber-900">Nobody is walking with this person.</strong>}
                  </p>

                  {/* THE COUNTS, ON ONE LINE, WITH THE WORDS ATTACHED. A row of
                      bare numbers needs a header row to read, and a header row
                      is the thing that does not fit on a phone. */}
                  <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600">
                    <span className="tabular-nums">{r.appointments_proposed} proposed</span>
                    <span className="tabular-nums">{r.appointments_confirmed} agreed</span>
                    <span className="tabular-nums">{r.appointments_declined} declined</span>
                    <span className="tabular-nums">{r.appointments_kept} kept</span>
                    <span className="tabular-nums">{r.resources_shared} shared</span>
                    <span className="tabular-nums">{r.pocket_adds} in their pocket</span>
                  </p>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-slate-700 ring-1 ring-sky-100">
            <strong>Quiet is not a verdict.</strong> Somebody with nothing in these
            columns may have been on a fishing boat for a fortnight. What the
            number says is that their Guide should know which, and that you have
            no way of knowing from here. The app cannot see a conversation, by
            design, so a quiet row is a prompt to ask rather than a fact about
            anybody.
          </p>
        </>
      )}
    </Card>
  );
}

export default LiveActivityAnalysis;
