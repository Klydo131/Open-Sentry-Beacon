'use client';

// Prayer, against a real database. See migration 0007.
//
// Three components because there are three genuinely different views, not three
// styles of one view:
//
//   LiveAskForPrayer  the Explorer's own — raise one, withdraw one, and pray
//                     for what their Guide has asked of them
//   LivePrayerForGuide  what their Guide sees, WITH the name — and where the
//                     Guide asks the people they walk with to pray for them
//   LivePrayerWall      what the congregation sees, with NO name
//
// PRAYER RUNS BOTH WAYS (migration 20260924100000). Whoever asked, the other
// side can say "I am praying for this" and the asker is told; only the asker
// can withdraw it or call it answered. A request is somebody's words arriving
// on somebody else's screen, so every one that arrives carries a Report link
// on the same card: the words are copied into the report and every Director is
// told, and the person reported is not.
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
import { ReportDialog } from '@/components/ReportDialog';
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

const firstName = (name: string) => name.split(' ')[0] || name;

const shortDate = (at: string) =>
  new Date(at).toLocaleDateString([], { day: 'numeric', month: 'short' });

/**
 * The one control either side has over the other's request.
 *
 * Once pressed it becomes a sentence rather than a disabled button, because
 * what the person needs to see afterwards is that it was said, not that a
 * button is now grey.
 */
function PrayingFor({
  request, askerName, onDone, onError,
}: {
  request: live.PrayerRequestRow;
  askerName: string;
  onDone: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (request.status === 'praying' || request.status === 'answered') {
    return (
      <p className="text-sm font-semibold text-teal-800">
        🙏 You told {firstName(askerName)} you are praying
      </p>
    );
  }
  return (
    <button
      type="button"
      disabled={busy}
      data-praying-for={request.id}
      onClick={async () => {
        setBusy(true);
        onError('');
        try {
          await live.markPrayingFor(request.id);
          await onDone();
        } catch (cause) {
          onError(message(cause));
        } finally {
          setBusy(false);
        }
      }}
      className="tap-sm rounded-xl bg-navy px-4 text-sm font-bold text-white disabled:opacity-40"
    >
      {busy ? 'Telling them…' : '🙏 I am praying for this'}
    </button>
  );
}

/**
 * Report one request that somebody wrote TO you.
 *
 * A plain grey link at the far end of the row, the same as the conversation's:
 * findable without hunting, and never where a thumb aiming at "I am praying"
 * would land. The database takes the request id and nothing else -- it works
 * out who wrote it and copies the words into the report.
 */
function ReportPrayerLink({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="tap-sm ml-auto px-2 text-sm text-gray-400 underline underline-offset-2 hover:text-red-600"
    >
      Report
    </button>
  );
}

function ReportPrayer({
  requestId, subjectName, onClose,
}: { requestId: string; subjectName: string; onClose: () => void }) {
  const [error, setError] = useState('');
  return (
    <div className="mt-3">
      {error && (
        <p className="mb-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>
      )}
      <ReportDialog
        subjectName={subjectName}
        onCancel={onClose}
        onSubmit={(reason, detail, evidence) => {
          // Not awaited, as in the conversation: the dialog has already told
          // the person it is done. A failure surfaces here.
          void live
            .reportPrayerRequest(requestId, reason, detail, evidence)
            .catch((cause) => setError(humanError(cause, 'That could not be sent.')));
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Explorer's own corner.
// ---------------------------------------------------------------------------
export function LiveAskForPrayer({ guide }: {
  /**
   * The Guide walking with them, for the name on what that Guide asks. A
   * request from anybody else (a second Guide, which the data allows and no
   * church has yet) still shows, as "Your Guide".
   */
  guide?: { id: string; name: string } | null;
} = {}) {
  const [rows, setRows] = useState<live.PrayerRequestRow[] | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState('');

  const load = useCallback(async () => {
    try { setRows(await live.listPrayerRequests()); setError(''); }
    catch (cause) { setRows([]); setError(message(cause)); }
  }, []);

  // THE TWO KINDS, SPLIT BY WHO WROTE THEM. This list used to be "mine"
  // because nothing else could be in it. A request the Guide wrote now arrives
  // here too, and drawing it under "Withdraw" would offer to delete somebody
  // else's words (the database would refuse, silently, which is worse).
  const mine = rows?.filter(live.isExplorersOwn) ?? null;
  const asked = rows?.filter((r) => !live.isExplorersOwn(r)) ?? [];
  const guideName = (authorId: string) =>
    guide && guide.id === authorId ? guide.name : 'Your Guide';
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

      {/* WHAT THEIR GUIDE HAS ASKED OF THEM, FIRST. It is the one thing in
          this room asking something of the Explorer, and it is the Guide
          being as exposed as the Explorer is when they ask. */}
      {asked.length > 0 && (
        <section aria-label="Your Guide asked you to pray" className="mb-5 space-y-2">
          {asked.map((r) => (
            <div key={r.id} data-asked-by-guide={r.id} className="rounded-2xl bg-teal-50 p-4 ring-1 ring-teal-700/15">
              <p className="text-sm font-semibold text-teal-900">
                {firstName(guideName(r.author_id))} asked you to pray for them
                <span className="font-normal text-teal-800"> · {shortDate(r.created_at)}</span>
              </p>
              <p className="mt-1 text-sm text-gray-800">{r.body}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <PrayingFor request={r} askerName={guideName(r.author_id)} onDone={load} onError={setError} />
                {reporting !== r.id && <ReportPrayerLink onOpen={() => setReporting(r.id)} />}
              </div>
              {reporting === r.id && (
                <ReportPrayer
                  requestId={r.id}
                  subjectName={guideName(r.author_id)}
                  onClose={() => setReporting('')}
                />
              )}
            </div>
          ))}
        </section>
      )}

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
  explorers = [],
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
  /**
   * Who the Guide may ask to pray for them, on the dashboard. Ignored with
   * `onlyFor`, where the one person is already chosen.
   */
  explorers?: { id: string; name: string }[];
}) {
  const [rows, setRows] = useState<live.PrayerRequestRow[] | null>(null);
  const [error, setError] = useState('');
  const [reporting, setReporting] = useState('');

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

  // Their requests, and the Guide's own. A Guide only ever reads their own
  // asks (a second Guide of the same Explorer does not see them), so "not the
  // Explorer's own" is "mine".
  const theirs = rows?.filter(live.isExplorersOwn) ?? null;
  const mine = rows?.filter((r) => !live.isExplorersOwn(r)) ?? [];
  const nameOf = (dsId: string) => nameFor?.(dsId) ?? 'An Explorer';
  const askable = onlyFor ? [{ id: onlyFor, name: nameOf(onlyFor) }] : explorers;

  if (rows !== null && rows.length === 0 && !error && !alwaysShow && askable.length === 0) return null;

  return (
    <Card id="prayer" className="overflow-hidden p-0">
      <div className="border-b border-teal-800/10 bg-gradient-to-r from-teal-50 via-white to-sky-50 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-700 text-2xl shadow-sm">🙏</span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">Prayer</p>
            <h2 className="mt-0.5 text-2xl font-extrabold text-navy">{heading ?? 'Prayer requests'}</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              {onlyFor
                ? 'You pray for each other. What they ask comes to you, and what you ask goes to them alone.'
                : 'From the people you walk with, and to them.'}
            </p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">
      <Err msg={error} />
      {theirs !== null && theirs.length === 0 && !error && (
        <p className="mt-3 rounded-xl bg-gray-50 p-4 text-sm text-gray-500">
          Nothing asked for yet. When they ask, it appears here and nowhere
          else: a prayer request goes to their Guide and to nobody else in
          the church.
        </p>
      )}
      <div className="mt-3 space-y-2">
        {rows === null && <BeaconSpinner inline label="Loading" className="mt-2" />}
        {theirs?.map((r) => (
          <div key={r.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-navy">{nameOf(r.ds_id)}</p>
                <p className="mt-0.5 text-sm text-gray-700">{r.body}</p>
              </div>
            </div>
            {/* ONE CONTROL, AND IT IS NOT A WORKFLOW STATE.
                "Mark praying" and "Mark answered" were both removed from here
                once, and the reasoning was right: they asked a Guide to file
                somebody's mother's illness under a status, and prayer is not a
                ticket queue. What was actually wrong with them is that the
                status they set was for the GUIDE'S OWN LIST. Nobody was told.

                This is the opposite of a queue. It says one thing to one person,
                and that person is the one who asked. There is still no "mark
                answered": whether a prayer was answered is not a Guide's to
                record, and since 20260924100000 the database agrees. */}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <PrayingFor request={r} askerName={nameOf(r.ds_id)} onDone={load} onError={setError} />
              {reporting !== r.id && <ReportPrayerLink onOpen={() => setReporting(r.id)} />}
            </div>
            {reporting === r.id && (
              <ReportPrayer requestId={r.id} subjectName={nameOf(r.ds_id)} onClose={() => setReporting('')} />
            )}
          </div>
        ))}
      </div>

      {askable.length > 0 && (
        <AskThemToPray
          askable={askable}
          fixed={Boolean(onlyFor)}
          onSent={load}
        />
      )}

      {mine.length > 0 && (
        <section aria-label="What you have asked" className="mt-5">
          <p className="text-sm font-bold uppercase tracking-[0.12em] text-teal-700">What you have asked</p>
          <div className="mt-2 space-y-2">
            {mine.map((r) => (
              <div key={r.id} data-my-ask={r.id} className="rounded-2xl bg-white p-4 ring-1 ring-teal-700/15">
                <p className="text-xs font-semibold text-gray-500">
                  To {nameOf(r.ds_id)} · {shortDate(r.created_at)}
                </p>
                <p className="mt-1 text-sm text-gray-700">{r.body}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {r.status === 'praying' ? (
                    <p className="text-sm font-semibold text-teal-800">
                      🙏 {firstName(nameOf(r.ds_id))} is praying for this
                      {r.praying_at && <span className="font-normal"> · {shortDate(r.praying_at)}</span>}
                    </p>
                  ) : r.status === 'answered' ? (
                    <p className="text-sm font-semibold text-green-800">Answered</p>
                  ) : (
                    <p className="text-sm text-gray-500">Sent</p>
                  )}
                  <button
                    type="button"
                    onClick={async () => {
                      setError('');
                      try { await live.deletePrayerRequest(r.id); await load(); }
                      catch (cause) { setError(message(cause)); }
                    }}
                    className="ml-auto text-xs font-semibold text-gray-500 underline"
                  >
                    Withdraw
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      </div>
    </Card>
  );
}

/**
 * Where a Guide asks the people they walk with to pray for them.
 *
 * NOBODY IS CHOSEN FOR THEM. On the dashboard every Explorer is a separate tap,
 * because a Guide's own request is theirs to aim: somebody may be glad to ask
 * one person and not another. Each person chosen gets their own copy and sees
 * only their own, so nobody learns who else was asked.
 */
function AskThemToPray({
  askable, fixed, onSent,
}: {
  askable: { id: string; name: string }[];
  /** One person, already chosen (the Care tab of one Explorer). */
  fixed: boolean;
  onSent: () => Promise<void>;
}) {
  const [body, setBody] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const to = fixed ? askable.map((a) => a.id) : chosen;
  const who = fixed ? firstName(askable[0].name) : '';

  const send = async () => {
    if (!body.trim() || to.length === 0 || busy) return;
    setBusy(true); setError(''); setSentTo('');
    try {
      const n = await live.askForPrayer(to, body);
      setBody('');
      setChosen([]);
      setSentTo(fixed ? who : `${n} ${n === 1 ? 'person' : 'people'}`);
      await onSent();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Ask them to pray for you" className="mt-6 rounded-2xl bg-teal-50/60 p-4 ring-1 ring-teal-700/10">
      <p className="text-base font-bold text-navy">
        {fixed ? `Ask ${who} to pray for you` : 'Ask them to pray for you'}
      </p>
      <p className="mt-0.5 text-sm text-gray-600">
        {fixed
          ? `Only ${who} sees it. They can tell you they are praying.`
          : 'Each person you choose gets it on their own and sees only their own. Nobody else in the church does.'}
      </p>
      {!fixed && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Who to ask">
          {askable.map((a) => {
            const on = chosen.includes(a.id);
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                data-ask-who={a.id}
                onClick={() => setChosen((was) => on ? was.filter((x) => x !== a.id) : [...was, a.id])}
                className={`tap-sm rounded-full px-3 text-sm font-semibold ring-1 ${
                  on ? 'bg-teal-700 text-white ring-teal-700' : 'bg-white text-navy ring-navy/15'
                }`}
              >
                {on ? '✓ ' : ''}{firstName(a.name)}
              </button>
            );
          })}
        </div>
      )}
      <textarea
        id={fixed ? `ask-prayer-${askable[0].id}` : 'ask-prayer'}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        maxLength={4000}
        placeholder="What would you like prayer for?"
        aria-label={fixed ? `What would you like ${who} to pray for?` : 'What would you like prayer for?'}
        className="mt-3 w-full rounded-2xl bg-white px-4 py-3 text-base text-navy ring-1 ring-teal-700/15 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-teal-600"
      />
      <Err msg={error} />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={send} disabled={!body.trim() || to.length === 0 || busy}>
          {busy ? 'Asking…' : fixed ? `Ask ${who}` : to.length > 1 ? `Ask ${to.length} people` : 'Ask'}
        </Button>
        {sentTo && <p className="text-sm font-semibold text-teal-800">Asked {sentTo}.</p>}
      </div>
    </section>
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
