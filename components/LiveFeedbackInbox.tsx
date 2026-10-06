'use client';

// What people have actually said, where somebody can read it.
//
// THE BUG BEHIND THIS SCREEN: "Feedback is not working, I am pretty sure some
// feedbacks are still stuck in the database since I haven't received any email
// feedbacks." Nothing was stuck. `setFeedbackSink` was never called anywhere,
// so every message went to the default sink, which honestly saves to the
// sender's own browser -- and there was no feedback table for anything to be
// stuck in. The messages are on the phones that wrote them.
//
// Sending it somewhere was half the fix. This is the other half: a place to
// read it. A table nobody opens is the same complaint one level down.
//
// NOT AN EMAIL, and worth saying because email is what was expected. The
// built-in mailer allows about two messages an hour for the whole project, so
// feedback routed through it would be dropped on exactly the days worth hearing
// about. This arrives instantly and cannot be rate limited.

import { useCallback, useEffect, useState } from 'react';
import { useKeepUp, KEEP_UP_FEEDBACK } from '@/lib/live/keep-up';
import * as live from '@/lib/live/data';
import { Button, Card } from '@/components/ui';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { humanError } from '@/lib/live/errors';
import { Linked } from '@/components/Linked';

const KIND: Record<string, { word: string; tone: string }> = {
  bug: { word: 'Something is broken', tone: 'bg-red-50 text-red-700 ring-red-200' },
  confusing: { word: 'Confusing', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  idea: { word: 'An idea', tone: 'bg-sky-50 text-sky-800 ring-sky-200' },
  praise: { word: 'Thank you', tone: 'bg-green-50 text-green-800 ring-green-200' },
};

const when = (iso: string) => new Date(iso).toLocaleString(undefined, {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
});

export function LiveFeedbackInbox() {
  const [items, setItems] = useState<live.Feedback[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try { setItems(await live.listFeedback()); setError(''); }
    catch (cause) { setItems([]); setError(humanError(cause, 'Something went wrong.')); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
  useKeepUp(KEEP_UP_FEEDBACK, load);

  const mark = async (f: live.Feedback) => {
    setBusy(f.id);
    try { await live.markFeedbackHandled(f.id, !f.handled_at); await load(); }
    catch (cause) { setError(humanError(cause, 'Something went wrong.')); }
    finally { setBusy(''); }
  };

  // UNANSWERED FIRST. A list in date order buries the one thing somebody needs
  // to act on under thirty they have already read.
  const waiting = (items ?? []).filter((f) => !f.handled_at);
  const done = (items ?? []).filter((f) => f.handled_at);

  const row = (f: live.Feedback) => {
    const kind = KIND[f.category] ?? { word: f.category, tone: 'bg-slate-100 text-slate-700 ring-slate-200' };
    return (
      <div key={f.id} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${kind.tone}`}>
            {kind.word}
          </span>
          <span className="text-xs text-gray-500">{when(f.created_at)}</span>
          {/* WHO, WHEN THEY GAVE IT. Somebody reporting a broken screen almost
              always has to be asked one more question, and a report with no
              name attached is a report nobody can follow up. */}
          {f.author_name && <span className="text-xs font-semibold text-navy">{f.author_name}</span>}
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800">
          <Linked text={f.message} />
        </p>
        {f.contact && (
          <p className="mt-1 text-xs text-gray-600">
            Reply to <span className="font-semibold text-navy">{f.contact}</span>
          </p>
        )}
        {/* The screen and the build, which between them are usually the whole
            of reproducing a bug. Quiet, because they mean nothing to most
            readers and everything to whoever fixes it. */}
        {(f.page || f.build) && (
          <p className="mt-1 text-xs text-gray-500">
            {[f.page, f.build].filter(Boolean).join(' · ')}
          </p>
        )}
        <div className="mt-2">
          <Button variant="ghost" disabled={busy === f.id} onClick={() => void mark(f)}>
            {f.handled_at ? 'Put back in the list' : 'Mark as dealt with'}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-teal-800/10 wash-teal-sky p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-700 text-2xl shadow-sm">📣</span>
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-teal-700">Feedback</p>
            <h2 className="mt-0.5 text-2xl font-extrabold text-navy">What people have told you</h2>
            <p className="mt-1 text-sm leading-relaxed text-gray-600">
              Sent from the feedback button anywhere in the app. It arrives here rather
              than by email, so nothing is lost to an hourly sending limit.
            </p>
          </div>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {error && (
          <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
            {error}
          </p>
        )}
        {items === null && <BeaconSpinner inline label="Loading" />}
        {items?.length === 0 && !error && (
          <p className="text-sm text-gray-500">
            Nothing yet. Anything sent from the feedback button will appear here.
          </p>
        )}

        {waiting.length > 0 && (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              Waiting on you · {waiting.length}
            </p>
            <div className="mt-2 space-y-2">{waiting.map(row)}</div>
          </>
        )}
        {done.length > 0 && (
          <>
            <p className="mt-5 text-xs font-bold uppercase tracking-wide text-gray-500">
              Dealt with · {done.length}
            </p>
            <div className="mt-2 space-y-2 opacity-70">{done.map(row)}</div>
          </>
        )}
      </div>
    </Card>
  );
}
