'use client';

// Admin Reports: every report, and one conversation about each.
//
// ---------------------------------------------------------------------------
// ASKED FOR, 27 October 2026, when the court room closed: "Admins can see
// reports, see the problems and reports and be transparent to both Guide and
// Explorer users by chatting them as Admins, no more trial online." One shared
// conversation per report, in which everyone sees every message; and, asked
// when the person a report is about should join, "Admin brings them in": the
// Director holding the report reads it first, then brings them in with one
// button, and from then on they read all of it and can answer.
//
// WHAT THIS FILE IS NOT ALLOWED TO DECIDE. Who is in a conversation, who writes
// in it, who may bring somebody in and which reports may never be opened to the
// person they are about are all decided by the database
// (20261027130000_a_report_is_one_conversation). This screen draws what the
// database already decided; a bug here can hide a button, never widen a rule.
//
// FOR EVERYBODY FROM FIVE TO SEVENTY-FIVE. Each card says in words what it is,
// who is in the conversation, and what the one next step is. Nothing needs a
// gesture to find, and the step that cannot be taken back (bringing somebody
// in) says exactly what it does before it does it.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card } from '@/components/ui';
import * as live from '@/lib/live/data';
import { humanError } from '@/lib/live/errors';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { useKeepUp, KEEP_UP_ADMIN_REPORTS } from '@/lib/live/keep-up';
import { scrollMotion } from '@/lib/motion';
import { REASON_LABEL } from '@/components/LiveSafeguarding';

// The reasons in the same words everywhere a report is shown: the ones the
// person reporting chose from.
const REASON = REASON_LABEL;

function when(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

/** The people in a report's conversation, in words. */
function whoIsIn(r: live.AdminReport): string {
  const joined = Boolean(r.subject_joined_at);
  if (r.mine) {
    const helper = r.claimed_name ?? 'the Director helping';
    return joined
      ? `You, ${helper} and ${r.subject_name ?? 'the person it is about'}. Your church's Directors can read it too.`
      : `You and ${helper}. Your church's Directors can read it too.`;
  }
  if (r.about_me) {
    return `You, ${r.reporter_name ?? 'the person who raised it'} and ${r.claimed_name ?? 'a Director'}. Your church's Directors can read it too.`;
  }
  const raised = r.reporter_name ?? 'The person who raised it';
  return joined
    ? `${raised}, ${r.subject_name ?? 'the person it is about'} and the Director holding it. Directors who may handle it can read it.`
    : `${raised} and the Director holding it. ${r.subject_name ?? 'The person it is about'} is not in it.`;
}

// ---------------------------------------------------------------------------
// The conversation
// ---------------------------------------------------------------------------

function Thread({ report, me, canWrite, onChanged }: {
  report: live.AdminReport;
  me: string;
  canWrite: boolean;
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
  // A reply arrives without anybody reloading the page.
  useKeepUp(KEEP_UP_ADMIN_REPORTS, load);
  useEffect(() => { foot.current?.scrollIntoView({ block: 'end', behavior: scrollMotion() }); }, [rows]);

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

  // Where the person it is about came in, so everybody can see what they could
  // read when they arrived: all of it.
  const joinedAt = report.subject_joined_at ? new Date(report.subject_joined_at).getTime() : null;
  const joinedIndex = joinedAt === null ? -1 : rows.findIndex((m) => new Date(m.created_at).getTime() > joinedAt);

  return (
    <div className="mt-3 rounded-xl bg-gray-50 p-3" data-report-thread>
      <p className="mb-2 text-xs font-semibold text-gray-500" data-report-who>
        In this conversation: {whoIsIn(report)}
      </p>

      <div className="max-h-80 space-y-2 overflow-y-auto overscroll-contain">
        {rows.length === 0 && (
          <p className="py-4 text-center text-sm text-gray-500">
            Nothing said yet.{canWrite ? ' You can start.' : ''}
          </p>
        )}
        {rows.map((m, i) => {
          const mine = m.author_id === me;
          return (
            <div key={m.id}>
              {i === joinedIndex && <Joined report={report} />}
              <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    mine ? 'bg-navy text-white' : 'bg-white text-navy ring-1 ring-black/5'
                  }`}
                >
                  {!mine && <p className="mb-0.5 text-[11px] font-bold opacity-70">{m.author_name}</p>}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-0.5 text-[10px] ${mine ? 'text-white/60' : 'text-gray-500'}`}>
                    {when(m.created_at)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        {joinedAt !== null && joinedIndex === -1 && <Joined report={report} />}
        <div ref={foot} />
      </div>

      {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}

      {canWrite ? (
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
      ) : (
        <p className="mt-3 text-sm text-gray-500" data-report-read-only>
          {report.can_handle
            ? 'You can read this. To write in it, pick the report up; one Director speaks for the church at a time.'
            : 'You can read this.'}
        </p>
      )}
    </div>
  );
}

function Joined({ report }: { report: live.AdminReport }) {
  return (
    <p className="my-2 text-center text-[11px] font-bold uppercase tracking-wide text-gray-400" data-report-joined>
      {report.about_me ? 'You joined the conversation' : `${report.subject_name ?? 'The person it is about'} joined the conversation`}
    </p>
  );
}

// ---------------------------------------------------------------------------
// One report
// ---------------------------------------------------------------------------

function ReportCard({ r, me, onChanged }: {
  r: live.AdminReport;
  me: string;
  onChanged: () => void;
}) {
  // The person who raised it and the person brought in see the conversation
  // straight away: it is the reason they are here.
  const [open, setOpen] = useState(Boolean(r.mine || r.about_me));
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isOpen = r.status === 'open';
  const held = r.claimed_by !== null;
  const heldByMe = r.claimed_by === me;
  const joined = Boolean(r.subject_joined_at);
  // The same tests the database makes, mirrored only to decide what to draw.
  const canRead = r.mine || r.about_me || r.can_handle;
  const canWrite = held && (Boolean(r.mine) || Boolean(r.about_me) || heldByMe);
  const canBringIn = heldByMe && isOpen && Boolean(r.subject_may_join) && !joined && r.subject_name !== null;

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      setAsking(false);
      onChanged();
    } catch (cause) {
      setError(humanError(cause, 'That did not work.'));
    } finally {
      setBusy(false);
    }
  };

  const who = r.subject_name ?? 'the person it is about';
  const line = r.mine
    ? `You raised this${r.subject_name ? `, about ${r.subject_name}` : ''}`
    : r.about_me
      ? `About you${r.reporter_name ? `, raised by ${r.reporter_name}` : ''}`
      : `About ${who}${r.reporter_name ? `, raised by ${r.reporter_name}` : ''}`;

  const chip = !isOpen
    ? { text: 'Closed', tone: 'bg-gray-100 text-gray-700' }
    : held
      ? { text: heldByMe ? 'You have this' : `With ${r.claimed_name ?? 'a Director'}`, tone: 'bg-green-100 text-green-800' }
      : { text: 'Waiting', tone: 'bg-amber-100 text-amber-900' };

  return (
    // The marker is on a plain element: Card passes only the attributes it names.
    <div data-report-card={r.id}>
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-navy">{REASON[r.reason] ?? r.reason}</p>
          <p className="text-sm text-gray-600">
            {line} · {when(r.created_at)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${chip.tone}`}>{chip.text}</span>
      </div>

      {r.detail && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-700">{r.detail}</p>}

      {r.about_me && (
        <p className="mt-3 rounded-xl bg-blue-50 p-3 text-sm text-blue-900 ring-1 ring-blue-200">
          A Director has asked you into this conversation so it can be talked through.
          You can read everything said here and answer. Nothing is decided yet.
        </p>
      )}

      {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {/* Each button is offered only where the database would allow it. */}
        {r.can_handle && !held && isOpen && (
          <Button onClick={() => act(() => live.claimReport(r.id))} disabled={busy}>
            {busy ? 'Picking up' : 'Pick this up'}
          </Button>
        )}

        {canBringIn && !asking && (
          <Button variant="ghost" onClick={() => setAsking(true)} disabled={busy}>
            Bring {who} into the conversation
          </Button>
        )}

        {heldByMe && isOpen && !asking && (
          <Button variant="ghost" onClick={() => act(() => live.releaseReport(r.id))} disabled={busy}>
            Hand it back
          </Button>
        )}

        {canRead && held && (
          <Button variant="ghost" onClick={() => setOpen((o) => !o)}>
            {open ? 'Hide the conversation' : `Show the conversation${r.messages ? ` (${r.messages})` : ''}`}
          </Button>
        )}
      </div>

      {/* THE ONE STEP THAT CANNOT BE TAKEN BACK says what it does first. */}
      {asking && (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-amber-200" role="group" aria-label={`Bring ${who} in`} data-bring-in-ask>
          <p>
            <strong>{who}</strong> will be able to read this report and everything already said
            here, and answer. {r.reporter_name ?? 'The person who raised it'} is told when you do.
            Do this once you have read it and it is safe to.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => act(() => live.bringSubjectIntoReport(r.id))} disabled={busy}>
              {busy ? 'Bringing them in' : 'Yes, bring them in'}
            </Button>
            <Button variant="ghost" onClick={() => setAsking(false)} disabled={busy}>
              Not now
            </Button>
          </div>
        </div>
      )}

      {heldByMe && isOpen && !r.subject_may_join && (
        <p className="mt-3 text-sm text-gray-500" data-kept-private>
          This report was made before conversations were shared, when the person
          who raised it was promised {who} would not be told. It stays that way.
        </p>
      )}

      {/* WAITING IS THE FRIGHTENING PART, so it is said rather than left blank. */}
      {r.mine && !held && isOpen && (
        <p className="mt-3 text-sm text-gray-500">
          Nobody has picked this up yet. You will be told the moment somebody
          does, and then you can talk to them here.
        </p>
      )}

      {canRead && held && open && <Thread report={r} me={me} canWrite={canWrite} onChanged={onChanged} />}
    </Card>
    </div>
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
  // A Director watching the list sees a report leave it the moment a colleague
  // picks it up, rather than racing them for it.
  useKeepUp(KEEP_UP_ADMIN_REPORTS, load);

  if (error) return <Card className="p-5"><p className="text-red-600">{error}</p></Card>;
  if (rows === null) return <BeaconSpinner inline label="Loading reports" />;

  if (rows.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-lg font-bold text-navy">Nothing here</p>
        <p className="mt-1 text-sm text-gray-500">
          You have not raised anything and nothing is waiting for you. If that
          changes, it appears here and you will be told.
        </p>
      </Card>
    );
  }

  const aboutMe = rows.filter((r) => r.about_me);
  const raised = rows.filter((r) => r.mine);
  const waiting = rows.filter((r) => r.can_handle && r.claimed_by === null && r.status === 'open');
  const holding = rows.filter((r) => r.claimed_by === me && !r.mine);
  const seen = new Set([...aboutMe, ...raised, ...waiting, ...holding].map((r) => r.id));
  const rest = rows.filter((r) => !seen.has(r.id));

  const groups: Array<[string, live.AdminReport[]]> = [
    ['About you', aboutMe],
    ['Waiting for a Director', waiting],
    ['You are helping with these', holding],
    ['Reports you raised', raised],
    ['Everything else', rest],
  ];

  return (
    <div className="space-y-5">
      {groups.filter(([, list]) => list.length > 0).map(([title, list]) => (
        <section key={title} className="space-y-2">
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-gray-500">
            {title} ({list.length})
          </h3>
          {list.map((r) => <ReportCard key={r.id} r={r} me={me} onChanged={load} />)}
        </section>
      ))}
    </div>
  );
}
