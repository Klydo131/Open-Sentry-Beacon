'use client';

// Admin Reports: a queue for leadership, and a private conversation for two.
//
// THE SHAPE, as asked for: "if a report comes from Guide and Explorer,
// Directors are the Front line and we'll see it as a report, any Directors can
// pick up a Guide and Explorer's report ... Guides and Explorers can chat a
// live Director on it privately 1 on 1 ... only one can chat such case, it wont
// be a group chat but a one on one chat."
//
// WHAT THIS FILE IS NOT ALLOWED TO DECIDE. Every rule that matters is in
// migration 20260915120000: nobody handles a report they are the subject of, a
// report about a Director or an Executive Director goes to Executive Directors
// only, and only the member who raised it and the one person who picked it up
// can read or write the conversation. This screen renders what the database
// already decided. A bug here can hide a control; it cannot widen a rule.
//
// WHY THE CASE IS VISIBLE TO LEADERSHIP BUT THE CONVERSATION IS NOT. Directors
// have to see a queue or nobody could pick anything up, and an Executive who
// cannot see that a case exists cannot oversee anything. "Only one can chat" is
// about the talking. So the row is leadership's and the thread is the two
// people's, and `messages` is a count rather than a preview.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import * as live from '@/lib/live/data';
import { humanError } from '@/lib/live/errors';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { useKeepUp, KEEP_UP_ADMIN_REPORTS } from '@/lib/live/keep-up';

const REASON: Record<string, string> = {
  inappropriate: 'Something inappropriate',
  harassment: 'Harassment',
  unsafe: 'Someone may be unsafe',
  spam: 'Spam',
  other: 'Something else',
};

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------------------
// The conversation
// ---------------------------------------------------------------------------

function Thread({ report, me, onChanged }: {
  report: live.AdminReport;
  me: string;
  onChanged: () => void;
}) {
  const [rows, setRows] = useState<live.ReportMessage[] | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const foot = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await live.reportThread(report.id));
    } catch (cause) {
      setError(humanError(cause, 'That conversation could not be opened.'));
    }
  }, [report.id]);

  useEffect(() => { void load(); }, [load]);
  // THE HALF THAT MAKES IT A CONVERSATION. Without this the other person's
  // reply sits in the database until somebody reloads the page.
  useKeepUp(KEEP_UP_ADMIN_REPORTS, load);
  useEffect(() => { foot.current?.scrollIntoView({ block: 'end' }); }, [rows]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || busy) return;
    setBusy(true);
    setError('');
    try {
      await live.sayInReport(report.id, body);
      setDraft('');
      await load();
      onChanged();
    } catch (cause) {
      setError(humanError(cause, 'That did not send.'));
    } finally {
      setBusy(false);
    }
  };

  if (rows === null) return <BeaconSpinner inline label="Opening the conversation" />;

  return (
    <div className="mt-3 rounded-xl bg-gray-50 p-3">
      <p className="mb-2 text-xs font-semibold text-gray-500">
        Only you and {report.mine ? (report.claimed_name ?? 'the person helping') : 'the person who raised this'} can read this.
      </p>

      <div className="max-h-72 space-y-2 overflow-y-auto overscroll-contain">
        {rows.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-500">
            Nothing said yet. You can start.
          </p>
        )}
        {rows.map((m) => {
          const mine = m.author_id === me;
          return (
            <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? 'bg-navy text-white' : 'bg-white text-navy ring-1 ring-black/5'
                }`}
              >
                {!mine && (
                  <p className="mb-0.5 text-[11px] font-bold opacity-70">{m.author_name}</p>
                )}
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={`mt-0.5 text-[10px] ${mine ? 'text-white/60' : 'text-gray-400'}`}>
                  {when(m.created_at)}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={foot} />
      </div>

      {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}

      <form onSubmit={send} className="mt-3 flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          placeholder="Write a message"
          aria-label="Your message"
          className="min-w-0 flex-1 resize-none rounded-xl px-3 py-2 text-sm ring-1 ring-black/10 outline-none focus:ring-2 focus:ring-gold"
        />
        <Button type="submit" disabled={busy || !draft.trim()}>
          {busy ? 'Sending' : 'Send'}
        </Button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One case
// ---------------------------------------------------------------------------

function ReportCard({ r, me, onChanged }: {
  r: live.AdminReport;
  me: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const held = r.claimed_by !== null;
  const heldByMe = r.claimed_by === me;
  // The two people in the conversation, and nobody else — the same test the
  // database makes, mirrored here only to decide what to draw.
  const inIt = r.mine || heldByMe;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      onChanged();
    } catch (cause) {
      setError(humanError(cause, 'That did not work.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-navy">{REASON[r.reason] ?? r.reason}</p>
          <p className="text-xs text-gray-500">
            {r.mine ? 'You raised this' : `About ${r.subject_name ?? 'a member'}`}
            {' · '}{when(r.created_at)}
            {r.status !== 'open' && ` · ${r.status}`}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
            held ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'
          }`}
        >
          {held ? (heldByMe ? 'You have this' : `With ${r.claimed_name ?? 'a Director'}`) : 'Waiting'}
        </span>
      </div>

      {r.detail && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{r.detail}</p>}

      {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {/* PICKING UP IS OFFERED ONLY WHERE THE DATABASE WOULD ALLOW IT. It
            would refuse anyway; showing a control that always fails teaches
            people the app is broken. */}
        {r.can_handle && !held && r.status === 'open' && (
          <Button onClick={() => act(() => live.claimReport(r.id))} disabled={busy}>
            {busy ? 'Picking up' : 'Pick this up'}
          </Button>
        )}

        {heldByMe && r.status === 'open' && (
          <Button
            variant="ghost"
            onClick={() => act(() => live.releaseReport(r.id))}
            disabled={busy}
          >
            Hand it back
          </Button>
        )}

        {inIt && held && (
          <Button variant="ghost" onClick={() => setOpen((o) => !o)}>
            {open ? 'Close the conversation' : `Open the conversation${r.messages ? ` (${r.messages})` : ''}`}
          </Button>
        )}
      </div>

      {/* WAITING IS THE FRIGHTENING PART, so it is said rather than left blank. */}
      {r.mine && !held && (
        <p className="mt-3 text-sm text-gray-500">
          Nobody has picked this up yet. You will be told the moment somebody
          does, and then you can talk to them here.
        </p>
      )}

      {inIt && held && open && <Thread report={r} me={me} onChanged={onChanged} />}
    </Card>
  );
}

// ---------------------------------------------------------------------------

export function LiveAdminReports({ me }: { me: string }) {
  const [rows, setRows] = useState<live.AdminReport[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await live.myReports());
    } catch (cause) {
      setError(humanError(cause, 'Reports could not be loaded.'));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // So a Director watching the queue sees a case disappear the moment a
  // colleague picks it up, rather than racing them for it.
  useKeepUp(KEEP_UP_ADMIN_REPORTS, load);

  if (error) return <Card className="p-5"><p className="text-red-600">{error}</p></Card>;
  if (rows === null) return <BeaconSpinner inline label="Loading reports" />;

  const waiting = rows.filter((r) => r.can_handle && r.claimed_by === null && r.status === 'open');
  const holding = rows.filter((r) => r.claimed_by === me);
  const ids = new Set([...waiting, ...holding].map((r) => r.id));
  const rest = rows.filter((r) => !ids.has(r.id));

  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-lg font-bold text-navy">Nothing open</p>
        <p className="mt-1 text-sm text-gray-500">
          You have not raised anything and nothing is waiting for you. If that
          changes, it appears here and you will be told.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {waiting.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-500">
            Waiting for somebody ({waiting.length})
          </h3>
          {waiting.map((r) => <ReportCard key={r.id} r={r} me={me} onChanged={load} />)}
        </section>
      )}

      {holding.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-500">
            You are helping with these ({holding.length})
          </h3>
          {holding.map((r) => <ReportCard key={r.id} r={r} me={me} onChanged={load} />)}
        </section>
      )}

      {rest.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-500">
            Everything else ({rest.length})
          </h3>
          {rest.map((r) => <ReportCard key={r.id} r={r} me={me} onChanged={load} />)}
        </section>
      )}
    </div>
  );
}
