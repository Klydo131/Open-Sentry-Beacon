'use client';

// Prayer, against a real database. See migration 0007.
//
// Three components because there are three genuinely different views, not three
// styles of one view:
//
//   LiveAskForPrayer  the Explorer's own — raise one, withdraw one
//   LivePrayerForGuide  what their Guide sees, WITH the name
//   LivePrayerWall      what the congregation sees, with NO name
//
// The wall is a different query, not a filtered version of the same one. A
// policy grants whole rows and the row carries ds_id, so serving the wall from
// the table would leave the name one network-tab glance away from anybody who
// can see the request at all.
//
// EVERY LOADER SURFACES ITS ERROR. A refused read and an empty list look
// identical to a reader, and the second is the one somebody has to act on. The
// sibling deployment reported "the prayer feature is not working" and the
// screens could say nothing more than "nothing here", because all three loaders
// ended in a silent catch.

import { useCallback, useEffect, useState } from 'react';
import * as live from '@/lib/live/data';
import { Button, Card } from '@/components/ui';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { humanError } from '@/lib/live/errors';
import { useKeepUp, KEEP_UP_PRAYER } from '@/lib/live/keep-up';

const message = (cause: unknown) =>
  humanError(cause, 'Something went wrong.');

const STATUS: Record<live.PrayerStatus, { label: string; className: string }> = {
  open:     { label: 'Open',     className: 'bg-gray-100 text-gray-700' },
  praying:  { label: 'Praying',  className: 'bg-teal-100 text-teal-800' },
  answered: { label: 'Answered', className: 'bg-green-100 text-green-800' },
};

function Chip({ status }: { status: live.PrayerStatus }) {
  const s = STATUS[status];
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${s.className}`}>{s.label}</span>;
}

function Err({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
      {msg}
    </p>
  );
}

// ---------------------------------------------------------------------------
// The Explorer's own corner.
// ---------------------------------------------------------------------------
export function LiveAskForPrayer() {
  const [mine, setMine] = useState<live.PrayerRequestRow[] | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setMine(await live.listPrayerRequests()); setError(''); }
    catch (cause) { setMine([]); setError(message(cause)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_PRAYER, load);

  const submit = async () => {
    if (!body.trim() || busy) return;
    setBusy(true); setError('');
    try {
      await live.addPrayerRequest(body, false);
      setBody('');
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-emerald-700/10 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-2xl shadow-sm">🙏</span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-800">Prayer</p>
            <h2 className="mt-0.5 text-2xl font-extrabold text-navy">You do not have to carry it alone.</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">Your request goes only to the Guide walking with you.</p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">
      <Err msg={error} />

      {/* "What would you like prayer for?" was correct and read like a form.
          Somebody asking about a sick dog is not filling in a request, and the
          box should sound like the question a person would actually be asked.
          The label matches the placeholder, so a screen reader hears the same
          question a sighted person reads rather than nothing at all. */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="What would you like to pray for?"
        aria-label="What would you like to pray for?"
        className="mt-4 w-full rounded-2xl bg-slate-50 px-4 py-3 text-base text-navy ring-1 ring-emerald-700/15 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-emerald-500"
      />
      {/* THE CHOICE TO BROADCAST IS GONE, and the request now goes to one
          person: the Guide walking with them.

          Anonymous is not the same as private. A congregation of forty reading
          "please pray for my marriage" can usually work out who wrote it, and
          the person who ticked the box was told only that their name would not
          be shown. Somebody exploring faith should be able to ask for prayer
          without weighing that up first. */}
      <div className="mt-3">
        <Button onClick={submit} disabled={!body.trim() || busy}>Ask</Button>
      </div>

      <div className="mt-4 space-y-2">
        {mine === null && <BeaconSpinner inline label="Loading" className="mt-2" />}
        {mine?.length === 0 && !error && (
          <p className="text-sm text-gray-400">Nothing yet. You can ask for anything.</p>
        )}
        {mine?.map((r) => (
          <div key={r.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
            <div className="flex items-start gap-2">
              <p className="flex-1 text-sm text-gray-700">{r.body}</p>
              <Chip status={r.status} />
            </div>

            {/* THE WHOLE REASON THE OTHER HALF EXISTS.
                Asking for prayer is the most exposed thing anybody does in this
                app, and the answer to it used to be nothing at all: the words
                sat there exactly as they were written, however carefully the
                Guide had read them. A chip saying "Praying" is a status; this
                is a person. It says who, and it says when, because "somebody is
                praying about my mother" is worth knowing the date of. */}
            {r.status === 'praying' && (
              <p className="mt-2 rounded-xl bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900 ring-1 ring-teal-700/10">
                🙏 Your Guide is praying for this
                {r.praying_at && (
                  <span className="font-normal text-teal-800">
                    {' · '}
                    {new Date(r.praying_at).toLocaleDateString([], {
                      day: 'numeric', month: 'short',
                    })}
                  </span>
                )}
              </p>
            )}

            <div className="mt-2 flex items-center gap-3">
              <span className="flex-1" />
              <button
                onClick={async () => {
                  setError('');
                  try { await live.deletePrayerRequest(r.id); await load(); }
                  catch (cause) { setError(message(cause)); }
                }}
                className="text-xs font-semibold text-gray-500 underline"
              >
                Withdraw
              </button>
            </div>
          </div>
        ))}
      </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// What the Guide sees: their own Explorers' requests, with the name.
// ---------------------------------------------------------------------------
export function LivePrayerForGuide({
  nameFor,
  onlyFor,
  heading,
  alwaysShow = false,
}: {
  nameFor?: (dsId: string) => string;
  /**
   * Draw the card even when there is nothing in it.
   *
   * Nothing, by default: an empty prayer panel on a dashboard is furniture. On
   * the Care tab it is the opposite. That tab exists to hold this, and when the
   * card vanished the tab showed only "Your private notes" and read as though a
   * Guide cannot see prayer requests at all, which is the exact complaint this
   * component was written to answer.
   */
  alwaysShow?: boolean;
  /**
   * Narrow the list to one Explorer.
   *
   * WHY THIS EXISTS. Prayer requests lived only on the Guide's dashboard. A
   * Guide spends their time inside a conversation, and the request written by
   * the very person they are talking to was on a different screen -- so an
   * Explorer wrote "please pray for my mother", the Guide answered messages all
   * evening, and never saw it. Reported as "the Guide cannot see prayer
   * requests"; the row was always there and readable, just never in front of
   * them.
   */
  onlyFor?: string;
  heading?: string;
}) {
  const [rows, setRows] = useState<live.PrayerRequestRow[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const all = await live.listPrayerRequests();
      setRows(onlyFor ? all.filter((r) => r.ds_id === onlyFor) : all);
      setError('');
    }
    catch (cause) { setRows([]); setError(message(cause)); }
  }, [onlyFor]);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_PRAYER, load);

  if (rows !== null && rows.length === 0 && !error && !alwaysShow) return null;

  return (
    <Card id="prayer" className="overflow-hidden p-0">
      <div className="border-b border-teal-800/10 bg-gradient-to-r from-teal-50 via-white to-sky-50 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-700 text-2xl shadow-sm">🙏</span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">Prayer</p>
            <h2 className="mt-0.5 text-2xl font-extrabold text-navy">{heading ?? 'Prayer requests'}</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              {onlyFor ? 'What they have asked you to pray for.' : 'From the people you walk with.'}
            </p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">
      <Err msg={error} />
      {rows !== null && rows.length === 0 && !error && (
        <p className="mt-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
          Nothing asked for yet. When they ask, it appears here and nowhere
          else: a prayer request goes to their Guide and to nobody else in
          the church.
        </p>
      )}
      <div className="mt-3 space-y-2">
        {rows === null && <BeaconSpinner inline label="Loading" className="mt-2" />}
        {rows?.map((r) => (
          <div key={r.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy">{nameFor?.(r.ds_id) ?? 'An Explorer'}</p>
                <p className="mt-0.5 text-sm text-gray-700">{r.body}</p>
              </div>
            </div>
            {/* ONE CONTROL, AND IT IS NOT A WORKFLOW STATE.
                "Mark praying" and "Mark answered" were both removed from here
                once, and the reasoning was right: they asked a Guide to file
                somebody's mother's illness under a status, and prayer is not a
                ticket queue. What was actually wrong with them is that the
                status they set was for the GUIDE'S OWN LIST. Nobody was told.

                So the person who had written down the most exposed thing they
                had, and pressed send, saw their words sitting there exactly as
                they left them — which from where they stand is indistinguishable
                from nobody having looked.

                This is the opposite of a queue. It says one thing to one person,
                and that person is the one who asked. There is still no "mark
                answered": whether a prayer was answered is not a Guide's to
                record. */}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {r.status === 'praying' ? (
                <p className="text-sm font-semibold text-teal-800">
                  🙏 You told {(nameFor?.(r.ds_id) ?? 'them').split(' ')[0]} you are praying
                </p>
              ) : (
                <button
                  type="button"
                  disabled={busy === r.id}
                  data-praying-for={r.id}
                  onClick={async () => {
                    setBusy(r.id);
                    setError('');
                    try {
                      await live.markPrayingFor(r.id);
                      await load();
                    } catch (cause) {
                      setError(message(cause));
                    } finally {
                      setBusy('');
                    }
                  }}
                  className="tap-sm rounded-xl bg-navy px-4 text-sm font-bold text-white disabled:opacity-40"
                >
                  {busy === r.id ? 'Telling them…' : '🙏 I am praying for this'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// The church wall. Nobody's name, for anybody.
// ---------------------------------------------------------------------------
export function LivePrayerWall() {
  const [rows, setRows] = useState<live.WallEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    live.listPrayerWall()
      .then((r) => { if (alive) { setRows(r); setError(''); } })
      .catch((cause) => { if (alive) { setRows([]); setError(message(cause)); } });
    return () => { alive = false; };
  }, []);

  if (rows === null) return null;
  if (rows.length === 0 && !error) return null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-emerald-700/10 bg-gradient-to-r from-emerald-50 via-white to-teal-50 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-2xl shadow-sm">🙏</span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-emerald-800">Church prayer</p>
            <h2 className="mt-0.5 text-2xl font-extrabold text-navy">Prayer wall</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">Requests the church has been asked to pray for. Nobody&rsquo;s name is shown.</p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">
      <Err msg={error} />
      <div className="mt-3 space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="flex items-start gap-2 rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
            <p className="flex-1 text-sm text-gray-700">{r.body}</p>
            <Chip status={r.status} />
          </div>
        ))}
      </div>
      </div>
    </Card>
  );
}
