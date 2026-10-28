'use client';

// The Feedback inbox: read it, write it up, hand it on, close it.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 28 October 2026: feedback that "AI tools can receive", that a
// person checks first, and that the person checking can "fix manually",
// "give ... to other developers", or hand to "AI tools to help develop for
// solutions". The owner chose Directors and the Executive Director as the
// people who check (they already had this inbox), all three ways out, and a
// status the sender can see.
//
// ONE SCREEN FOR BOTH HALVES OF THE APP. The live inbox
// (components/LiveFeedbackInbox.tsx) reads the church's database; the sample
// one (components/SampleFeedbackInbox.tsx) reads feedback kept on this device.
// Both hand this the same items and the same two actions, so what somebody
// learns on the walkthrough is what they will use, and the walks can test it.
//
// THE WRITE-UP IS WHAT LEAVES. The member's own words, name and contact stay
// on this screen. Everything handed on (the brief, the GitHub issue, the file
// for AI tools) is built by lib/feedback/hand-on.ts from the reviewer's
// write-up alone, and scrubbed of email addresses and phone numbers on the way.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui';
import { Linked } from '@/components/Linked';
import { copyText } from '@/lib/share';
import { humanError } from '@/lib/live/errors';
import { APP_NAME } from '@/lib/brand';
import {
  EMPTY_REVIEW, KIND_WORDS, feedbackBrief, feedbackForAi, feedbackIssueUrl, feedbackRef, isReviewed,
  statusForSender, type FeedbackForHandOn, type FeedbackReview, type FeedbackRoute, type FeedbackStatus,
} from '@/lib/feedback/hand-on';

export interface InboxItem {
  id: string;
  category: string;
  /** The member's own words. Shown here, never handed on. */
  message: string;
  contact: string | null;
  page: string | null;
  build: string | null;
  createdAt: string;
  authorName: string | null;
  status: FeedbackStatus;
  reply: string | null;
  fixedIn: string | null;
  review: FeedbackReview;
}

export interface InboxActions {
  saveReview: (id: string, review: FeedbackReview) => Promise<void>;
  setStatus: (id: string, status: FeedbackStatus, extra?: { reply?: string | null; fixedIn?: string | null }) => Promise<void>;
}

const TONE: Record<string, string> = {
  bug: 'bg-red-50 text-red-700 ring-red-200',
  confusing: 'bg-amber-50 text-amber-800 ring-amber-200',
  idea: 'bg-sky-50 text-sky-800 ring-sky-200',
  praise: 'bg-green-50 text-green-800 ring-green-200',
};

const ROUTE_CHOICES: Array<{ id: FeedbackRoute; word: string; help: string }> = [
  { id: 'me', word: 'I’ll fix it', help: 'You, or somebody at your church, changes it.' },
  { id: 'developer', word: 'A developer', help: 'Send the brief to a person who works on the app.' },
  { id: 'ai', word: 'An AI tool', help: 'Give the brief to an AI coding tool; a person checks what it makes.' },
];

const when = (iso: string) => new Date(iso).toLocaleString(undefined, {
  day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
});

const forHandOn = (item: InboxItem, review: FeedbackReview): FeedbackForHandOn => ({
  id: item.id, category: item.category, page: item.page, build: item.build,
  createdAt: item.createdAt, status: item.status, review,
});

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function FeedbackReviewInbox({ items, actions, sourceUrl, version, app = APP_NAME, error, loading }: {
  items: InboxItem[];
  actions: InboxActions;
  /** The project's repository, for a GitHub issue. */
  sourceUrl: string;
  /** This build's version, offered as "fixed in". */
  version: string;
  app?: string;
  error?: string;
  loading?: boolean;
}) {
  const [open, setOpen] = useState('');
  const waiting = items.filter((i) => i.status === 'new');
  const inHand = items.filter((i) => i.status === 'reviewing' || i.status === 'in_hand');
  const closed = items.filter((i) => i.status === 'done' || i.status === 'wont_do');
  const forAi = useMemo(() => feedbackForAi(items.map((i) => forHandOn(i, i.review)), app), [items, app]);

  // ONE LIST, THREE HEADINGS. Saving a write-up moves an item from "Waiting
  // on you" to "Being looked at"; in three separate lists React would build it
  // afresh and drop the "Saved." it had just said. In one list, keyed by
  // item, it only moves.
  const rows: React.ReactNode[] = [];
  for (const [title, list, quiet] of [
    ['Waiting on you', waiting, false],
    ['Being looked at', inHand, false],
    ['Done', closed, true],
  ] as const) {
    if (!list.length) continue;
    rows.push(
      <p key={`heading-${title}`} className="pt-3 text-xs font-bold uppercase tracking-wide text-gray-500 first:pt-0">
        {title} · {list.length}
      </p>,
    );
    for (const item of list) {
      rows.push(
        <div key={item.id} className={quiet ? 'opacity-80' : ''}>
          <Item
            item={item}
            open={open === item.id}
            onToggle={() => setOpen(open === item.id ? '' : item.id)}
            actions={actions}
            sourceUrl={sourceUrl}
            version={version}
            app={app}
          />
        </div>,
      );
    }
  }

  return (
    <div data-feedback-inbox>
      {/* THE FILE FOR AI TOOLS: every reviewed piece still open, in one go.
          Shown once there is something in it; an empty, disabled button was
          the first thing on the screen and offered nothing. */}
      {forAi.items.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => download(`feedback-for-ai-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(forAi, null, 2))}
          >
            Download for AI tools ({forAi.items.length})
          </Button>
          <p className="text-xs text-gray-500">
            Everything written up and still open, with no names, phone numbers or email addresses.
          </p>
        </div>
      )}

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">{error}</p>
      )}
      {loading && <p className="mt-3 text-sm text-gray-500">Loading…</p>}
      {!loading && items.length === 0 && !error && (
        <p className="mt-3 text-sm text-gray-500">Nothing yet. Anything sent from the feedback button will appear here.</p>
      )}

      <div className="space-y-2">{rows}</div>
    </div>
  );
}

function Item({ item, open, onToggle, actions, sourceUrl, version, app }: {
  item: InboxItem; open: boolean; onToggle: () => void; actions: InboxActions; sourceUrl: string; version: string; app: string;
}) {
  const tone = TONE[item.category] ?? 'bg-slate-100 text-slate-700 ring-slate-200';
  const status = statusForSender(item.status, item.fixedIn, item.reply);
  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5" data-feedback-item={feedbackRef(item.id)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ring-1 ${tone}`}>{KIND_WORDS[item.category] ?? item.category}</span>
        <span className="text-xs text-gray-500">{when(item.createdAt)}</span>
        {item.authorName && <span className="text-xs font-semibold text-navy">{item.authorName}</span>}
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 ring-1 ring-navy/10" data-feedback-status>
          {status.word}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap break-words text-sm text-gray-800"><Linked text={item.message} /></p>
      {item.contact && <p className="mt-1 text-xs text-gray-600">Reply to <span className="font-semibold text-navy">{item.contact}</span></p>}
      {(item.page || item.build) && <p className="mt-1 text-xs text-gray-500">{[item.page, item.build].filter(Boolean).join(' · ')}</p>}
      <div className="mt-2">
        <Button variant="ghost" onClick={onToggle} aria-expanded={open}>
          {open ? 'Close' : isReviewed(item) ? 'Open the write-up' : 'Review and hand on'}
        </Button>
      </div>
      {open && <Review item={item} actions={actions} sourceUrl={sourceUrl} version={version} app={app} />}
    </div>
  );
}

function Review({ item, actions, sourceUrl, version, app }: {
  item: InboxItem; actions: InboxActions; sourceUrl: string; version: string; app: string;
}) {
  // A FIRST WRITE-UP STARTS FROM THEIR WORDS, for the reviewer to edit: most
  // feedback needs only the name taken out.
  const [draft, setDraft] = useState<FeedbackReview>(() => (
    isReviewed(item) ? item.review : { ...EMPTY_REVIEW, ...item.review, summary: item.message }
  ));
  const [saved, setSaved] = useState<FeedbackReview>(item.review);
  const [busy, setBusy] = useState('');
  const [said, setSaid] = useState('');
  const [fixedIn, setFixedIn] = useState(item.fixedIn ?? version);
  const [reply, setReply] = useState(item.reply ?? '');
  const ready = isReviewed({ review: saved });
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);
  const handOn = forHandOn(item, saved);
  const id = `fb-${item.id}`;

  const run = async (label: string, work: () => Promise<void>, done: string) => {
    setBusy(label);
    setSaid('');
    try { await work(); setSaid(done); } catch (cause) { setSaid(humanError(cause, 'That did not work. Check your connection and try again.')); }
    finally { setBusy(''); }
  };

  const save = () => run('save', async () => {
    const next = { ...draft, summary: draft.summary.trim(), doneWhen: draft.doneWhen.trim(), givenTo: draft.givenTo.trim() };
    await actions.saveReview(item.id, next);
    setSaved(next);
    setDraft(next);
    // Written up is being looked at; given to somebody is in hand.
    if (item.status === 'new' || item.status === 'reviewing') {
      await actions.setStatus(item.id, next.route ? 'in_hand' : 'reviewing');
    }
  }, 'Saved.');

  return (
    <div className="mt-3 space-y-4 rounded-xl bg-white p-4 ring-1 ring-navy/10" role="group" aria-label={`Review ${feedbackRef(item.id)}`}>
      <label className="block">
        <span className="block text-sm font-bold text-navy">Write it up for whoever fixes it</span>
        <span className="block text-xs text-gray-600">
          In your own words, with no names, phone numbers or email addresses. This is all that leaves your church.
        </span>
        <textarea
          id={`${id}-summary`}
          value={draft.summary}
          onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
          rows={4}
          maxLength={4000}
          className="mt-1 w-full rounded-lg border border-navy/15 p-2 text-sm"
          data-feedback-summary
        />
      </label>
      <label className="block">
        <span className="block text-sm font-bold text-navy">Done when <span className="font-normal text-gray-500">(optional)</span></span>
        <input
          value={draft.doneWhen}
          onChange={(e) => setDraft({ ...draft, doneWhen: e.target.value })}
          maxLength={1000}
          placeholder="For example: the Journal opens on today’s page"
          className="mt-1 w-full rounded-lg border border-navy/15 p-2 text-sm"
        />
      </label>

      <fieldset>
        <legend className="text-sm font-bold text-navy">Who takes it</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-3">
          {ROUTE_CHOICES.map((r) => (
            <label key={r.id} className={`cursor-pointer rounded-lg p-2 text-sm ring-1 ${draft.route === r.id ? 'bg-navy/5 ring-navy' : 'ring-navy/15'}`}>
              <input
                type="radio"
                name={`${id}-route`}
                value={r.id}
                checked={draft.route === r.id}
                onChange={() => setDraft({ ...draft, route: r.id })}
                className="mr-2"
                data-feedback-route={r.id}
              />
              <span className="font-semibold">{r.word}</span>
              <span className="block text-xs text-gray-600">{r.help}</span>
            </label>
          ))}
        </div>
        {draft.route === 'developer' && (
          <label className="mt-2 block">
            <span className="block text-xs font-semibold text-gray-700">Their name or handle</span>
            <input
              value={draft.givenTo}
              onChange={(e) => setDraft({ ...draft, givenTo: e.target.value })}
              maxLength={120}
              className="mt-1 w-full max-w-xs rounded-lg border border-navy/15 p-2 text-sm"
            />
          </label>
        )}
      </fieldset>

      <label className="block">
        <span className="block text-sm font-bold text-navy">A note for reviewers <span className="font-normal text-gray-500">(never handed on)</span></span>
        <textarea
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          rows={2}
          maxLength={2000}
          className="mt-1 w-full rounded-lg border border-navy/15 p-2 text-sm"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void save()} disabled={!!busy || !draft.summary.trim() || !changed}>
          {busy === 'save' ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {/* HANDING IT ON, once a write-up is saved: nothing leaves before then. */}
      <div className="border-t border-navy/10 pt-3">
        <p className="text-sm font-bold text-navy">Hand it on</p>
        {!ready ? (
          <p className="text-xs text-gray-600">Save a write-up first. Nothing is handed on before a person has written it up.</p>
        ) : (
          <>
            <div className="mt-1 flex flex-wrap gap-2">
              <Button
                variant="ghost"
                onClick={() => void run('copy', async () => {
                  if (!(await copyText(feedbackBrief(handOn, app)))) throw new Error('Copying was not allowed here; select the brief below instead.');
                }, 'Brief copied. Paste it into an AI tool, or send it to a developer.')}
              >
                Copy the brief
              </Button>
              <a
                href={feedbackIssueUrl(handOn, sourceUrl, app)}
                target="_blank"
                rel="noopener noreferrer"
                className="tap-sm inline-flex items-center rounded-full px-4 text-sm font-semibold text-navy ring-1 ring-navy/20"
                data-feedback-issue
              >
                Open as a GitHub issue
              </a>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-semibold text-gray-700">See the brief</summary>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs" data-feedback-brief>
                {feedbackBrief(handOn, app)}
              </pre>
            </details>
          </>
        )}
      </div>

      {/* CLOSING IT. What the sender is told is the status, the version and
          this one line: never the write-up, the note, or who had it. */}
      <div className="border-t border-navy/10 pt-3">
        <p className="text-sm font-bold text-navy">Close it</p>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700">Fixed in version</span>
            <input value={fixedIn} onChange={(e) => setFixedIn(e.target.value)} maxLength={100} className="mt-1 w-full rounded-lg border border-navy/15 p-2 text-sm" />
          </label>
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700">A word to the sender (optional)</span>
            <input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1000} className="mt-1 w-full rounded-lg border border-navy/15 p-2 text-sm" />
          </label>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {item.status === 'done' || item.status === 'wont_do' ? (
            <Button variant="ghost" disabled={!!busy} onClick={() => void run('reopen', () => actions.setStatus(item.id, 'reviewing'), 'Open again.')}>
              Open it again
            </Button>
          ) : (
            <>
              <Button
                disabled={!!busy}
                onClick={() => void run('done', () => actions.setStatus(item.id, 'done', { fixedIn: fixedIn.trim() || null, reply: reply.trim() || null }), 'Marked done. The sender sees it.')}
              >
                Mark done
              </Button>
              <Button
                variant="ghost"
                disabled={!!busy}
                onClick={() => void run('wont', () => actions.setStatus(item.id, 'wont_do', { fixedIn: null, reply: reply.trim() || null }), 'Closed. The sender sees it.')}
              >
                Won’t do
              </Button>
            </>
          )}
        </div>
      </div>

      {said && <p aria-live="polite" className="text-sm font-semibold text-navy" data-feedback-said>{said}</p>}
    </div>
  );
}

/** What somebody has sent, and what happened to each. For the sender only. */
export function MyFeedbackList({ items }: {
  items: Array<{ id: string; category: string; message: string; createdAt: string; status: FeedbackStatus; reply: string | null; fixedIn: string | null }>;
}) {
  if (!items.length) return null;
  return (
    <section aria-label="What you have sent" className="mt-4" data-my-feedback>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">What you have sent</p>
      <ul className="mt-2 space-y-2">
        {items.slice(0, 10).map((f) => {
          const s = statusForSender(f.status, f.fixedIn, f.reply);
          return (
            <li key={f.id} className="rounded-xl bg-slate-50 p-3 ring-1 ring-navy/5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-gray-600">{KIND_WORDS[f.category] ?? f.category}</span>
                <span className="text-xs text-gray-500">{when(f.createdAt)}</span>
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-bold text-navy ring-1 ring-navy/10" data-my-feedback-status>{s.word}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-gray-800">{f.message}</p>
              <p className="mt-1 text-xs text-gray-600">{s.line}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
