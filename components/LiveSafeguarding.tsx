'use client';

// Safeguarding on the live app: raising a report, and a Director acting on it.
//
// The demo has had this since it was asked for. The live database had nothing,
// which meant a real church with real members had no route at all — the exact
// inversion of where it matters.
//
// The rules live in the database (migration 0021), not here. A Director reads
// reports because a policy says so; an Explorer cannot, whatever this file
// does. That ordering is deliberate: a screen that forgot to filter would leak
// nothing, because the rows never arrive.

import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_REPORTS } from '@/lib/live/keep-up';
import Link from 'next/link';
import * as live from '@/lib/live/data';
import { ReportDialog } from '@/components/ReportDialog';
import { Button, Card } from '@/components/ui';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { humanError } from '@/lib/live/errors';

const REASON_LABEL: Record<string, string> = {
  inappropriate: 'Something inappropriate was sent',
  harassment: 'Abuse, threats or pressure',
  unsafe: 'Worried someone is unsafe',
  spam: 'Selling, begging or recruiting',
  other: 'Something else',
};

/**
 * The Report control for a live conversation.
 *
 * A plain text link rather than a button, and away from Send: reporting must be
 * findable without hunting and must never be hit by a thumb aiming at
 * something else.
 */
export function LiveReportControl({
  subjectId,
  subjectName,
  pairingId,
}: {
  subjectId: string;
  subjectName: string;
  pairingId?: string;
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <div className="mt-3">
        <LiveReportForm
          subjectId={subjectId}
          subjectName={subjectName}
          pairingId={pairingId}
          onDone={() => setOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="mt-2 flex justify-end">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="px-2 text-sm text-gray-500 underline underline-offset-2 hover:text-red-600"
      >
        Report {subjectName}
      </button>
    </div>
  );
}

/**
 * The report itself, without the link that opens it: what the chat bubble's
 * header opens (components/talk/Dock.tsx, TalkHeader), and what the link above
 * opens. One form, so a report raised from the bubble reaches the Directors by
 * exactly the road a report raised anywhere else does.
 */
export function LiveReportForm({
  subjectId,
  subjectName,
  pairingId,
  onDone,
}: {
  subjectId: string;
  subjectName: string;
  pairingId?: string;
  onDone: () => void;
}) {
  const [error, setError] = useState('');
  return (
    <>
      {error && (
        <p className="mb-2 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      )}
      <ReportDialog
        subjectName={subjectName}
        onCancel={() => { setError(''); onDone(); }}
        onSubmit={(reason, detail, evidence) => {
          // Fired without awaiting on purpose: the dialog has already told the
          // person it is done, and making somebody watch a spinner after the
          // hardest button in the app is a cruelty. A failure surfaces here.
          void live
            .reportPerson({ subjectId, reason, detail, pairingId, evidence })
            .catch((cause) => setError(
              humanError(cause, 'That could not be sent.'),
            ));
        }}
      />
    </>
  );
}

/**
 * The Directors' queue.
 *
 * Open reports cannot be hidden — no dismiss-without-deciding, no collapse. The
 * failure mode in safeguarding is not a wrong decision, it is no decision.
 */
export function LiveReportsForDirector({ onRemove }: { onRemove?: (id: string, name: string) => void }) {
  const [reports, setReports] = useState<live.LiveReport[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [evidence, setEvidence] = useState<Record<string, live.ReportFile[]>>({});

  const load = useCallback(async () => {
    try {
      const [rows, members] = await Promise.all([live.listReports(), live.listMembers()]);
      setReports(rows);
      setNames(Object.fromEntries(members.map((m) => [m.id, m.full_name || 'A member'])));
      // Evidence is fetched for the reports actually on screen rather than
      // per-card, so a queue of ten is one request and not ten.
      setEvidence(await live.listReportFiles(rows.map((r) => r.id)));
    } catch (cause) {
      setError(humanError(cause, 'Could not load reports.'));
      setReports([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // A report arriving is the one thing on any screen that should never wait.
  useKeepUp(KEEP_UP_REPORTS, load);

  const nameOf = (id: string) => names[id] ?? 'Someone who has left';

  // Taking a reported guild post down. The board itself stays shut to
  // leadership — a group talking honestly is what that room is for — so this
  // reaches exactly one post: the one somebody reported. The report keeps its
  // copy of the text afterwards, which is why the quote below still reads
  // once the post is gone.
  const takeDown = async (report: live.LiveReport) => {
    if (!report.guild_post_id) return;
    setBusy(report.id);
    setError('');
    try {
      await live.removeGuildPost(report.guild_post_id);
      await load();
    } catch (cause) {
      setError(humanError(cause, 'That post could not be removed.'));
    } finally {
      setBusy('');
    }
  };

  const decide = async (id: string, status: 'actioned' | 'dismissed') => {
    setBusy(id);
    setError('');
    try {
      await live.resolveReport(id, status, outcome[id]);
      await load();
    } catch (cause) {
      setError(humanError(cause, 'Could not save that.'));
    } finally {
      setBusy('');
    }
  };

  const open = (reports ?? []).filter((r) => r.status === 'open');
  const closed = (reports ?? []).filter((r) => r.status !== 'open');

  // NOTHING OPEN MEANS NOTHING ON SCREEN, and until now that was only true in
  // a comment. The card rendered anyway, headed "Safeguarding" and reading
  // "Nothing to decide", and on a phone it filled most of the screen above the
  // work a Director had actually come to do.
  //
  // A panel that announces its own emptiness is the most expensive kind of
  // decoration: it costs attention every single day to say that today is like
  // every other day. See docs/DESIGN.md rule 1 -- a daily control must not sit
  // below a card reporting that there is nothing to report.
  //
  // While the list is still loading, also nothing. A "Loading..." card that
  // resolves to an empty one is two layout shifts to say the same thing.
  if (reports === null || (open.length === 0 && closed.length === 0)) return null;

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">
          🛡️ Safeguarding {open.length > 0 && <span className="text-red-600">· {open.length}</span>}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Raised by Guides and Explorers. The person reported has not been told
          and will not be.{' '}
          <Link href="/policy" className="underline underline-offset-2">
            how we treat each other
          </Link>
          .
        </p>

        {error && (
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">{error}</p>
        )}

        {reports === null ? (
          <BeaconSpinner inline label="Loading" className="mt-4" />
        ) : open.length === 0 ? (
          <p className="mt-4 text-gray-500">Nothing to decide.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {open.map((r) => (
              <li key={r.id} className="rounded-xl bg-red-50 p-4 ring-1 ring-red-200">
                <p className="font-bold text-navy">
                  {nameOf(r.reporter_id)} reported {nameOf(r.subject_id)}
                  {r.guild_post_body !== null && <span className="font-normal text-gray-600"> · Guild Room post</span>}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-red-800">
                  {REASON_LABEL[r.reason] ?? r.reason}
                </p>
                {/* WHAT WAS ACTUALLY WRITTEN. Copied into the report when it
                    was reported, so it is still here after the post is taken
                    down — or after its author deletes it, which is the obvious
                    move for somebody who has just been reported. A Director
                    who cannot see what was said cannot decide anything. */}
                {r.guild_post_body !== null && (
                  <blockquote className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white p-3 text-gray-700 ring-1 ring-red-200">
                    {r.guild_post_body}
                  </blockquote>
                )}
                {r.detail && (
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white p-3 text-gray-700">{r.detail}</p>
                )}

                {/* WHAT THEY ATTACHED. Opened through a link that is signed at
                    the moment it is pressed and lasts an hour, so no address
                    for a piece of evidence is ever stored anywhere it could be
                    forwarded. Only Directors of this church can open these; the
                    person who raised the report cannot read them back either. */}
                {(evidence[r.id] ?? []).length > 0 && (
                  <div className="mt-2 rounded-lg bg-white p-3 ring-1 ring-red-200">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                      Evidence attached ({evidence[r.id].length})
                    </p>
                    <ul className="mt-2 space-y-1">
                      {evidence[r.id].map((f) => (
                        <li key={f.id}>
                          <button
                            type="button"
                            onClick={async () => {
                              const url = await live.reportFileUrl(f.path);
                              if (url) window.open(url, '_blank', 'noopener,noreferrer');
                            }}
                            className="break-words text-left text-sm font-semibold text-blue-700 underline underline-offset-2"
                          >
                            📎 {f.name}
                          </button>
                          {!!f.size_bytes && (
                            <span className="ml-2 text-xs text-gray-500">
                              {f.size_bytes > 1024 * 1024
                                ? `${(f.size_bytes / 1024 / 1024).toFixed(1)} MB`
                                : `${Math.max(1, Math.round(f.size_bytes / 1024))} KB`}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="mt-2 text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</p>

                <label className="mt-3 block">
                  <span className="text-sm font-semibold text-navy">What did you decide, and why?</span>
                  <input
                    value={outcome[r.id] ?? ''}
                    onChange={(e) => setOutcome((o) => ({ ...o, [r.id]: e.target.value }))}
                    placeholder="Spoke to them / removed them / nothing to answer"
                    className="tap mt-1 w-full rounded-xl bg-white px-3 text-base outline-none ring-1 ring-red-200 focus:ring-2 focus:ring-gold"
                  />
                </label>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="ghost" disabled={busy === r.id} onClick={() => decide(r.id, 'actioned')}>
                    I have dealt with it
                  </Button>
                  <Button variant="ghost" disabled={busy === r.id} onClick={() => decide(r.id, 'dismissed')}>
                    Nothing to answer
                  </Button>
                  {r.guild_post_id && (
                    <Button variant="danger" disabled={busy === r.id} onClick={() => void takeDown(r)}>
                      Delete the post
                    </Button>
                  )}
                  {onRemove && (
                    <Button
                      variant="danger"
                      disabled={busy === r.id}
                      onClick={async () => {
                        // Closed in the same press. Doing the two separately
                        // leaves a live report against somebody already gone,
                        // and nobody comes back to tidy that up.
                        await decide(r.id, 'actioned');
                        onRemove(r.subject_id, nameOf(r.subject_id));
                      }}
                    >
                      Remove {nameOf(r.subject_id)} from the church
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {closed.length > 0 && (
        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">Decided</h2>
          <p className="mt-1 text-sm text-gray-500">Kept permanently. Reports are never deleted.</p>
          <ul className="mt-4 space-y-2">
            {closed.map((r) => (
              <li key={r.id} className="rounded-xl bg-gray-50 p-4">
                <p className="font-semibold text-navy">
                  {nameOf(r.reporter_id)} reported {nameOf(r.subject_id)}
                </p>
                <p className="mt-0.5 text-sm text-gray-600">
                  {REASON_LABEL[r.reason] ?? r.reason} ·{' '}
                  <span className={r.status === 'actioned' ? 'text-green-700' : 'text-gray-500'}>
                    {r.status === 'actioned' ? 'Dealt with' : 'Nothing to answer'}
                  </span>
                </p>
                {r.outcome && <p className="mt-1 text-gray-700">{r.outcome}</p>}
                <p className="mt-1 text-xs text-gray-500">
                  Decided by {r.decided_by ? nameOf(r.decided_by) : 'a Director'}
                  {r.decided_at ? ` · ${new Date(r.decided_at).toLocaleDateString()}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
