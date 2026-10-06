'use client';

import { useEffect, useState } from 'react';
import { copyText } from '@/lib/share';
import { NAVY, GOLD } from '@/lib/brand';
import { versionLabel } from '@/lib/app-update';
import { getFeedbackSink, type FeedbackMessage } from '@/lib/backend/feedback';
import { BUILD_ID } from '@/lib/build-info';
import { uuid } from '@/lib/uuid';

type State = 'idle' | 'sending' | 'sent' | 'failed';
type Category = 'bug' | 'idea' | 'confusing' | 'praise';

export type FeedbackReceipt = {
  id: string;
  createdAt: string;
  /**
   * How the sink described what it did — "Saved on this device.", or whatever
   * your own adapter returns. Optional, because a sink need not explain itself.
   *
   * This replaced a `notified: boolean` that meant "the server emailed
   * somebody". That was a fact about one particular backend, and this app no
   * longer has one.
   */
  note?: string;
};

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'bug', label: '🐞 Something is broken' },
  { key: 'idea', label: '💡 An idea' },
  { key: 'confusing', label: '🤔 This confused me' },
  { key: 'praise', label: '💚 Something good' },
];
const DRAFT_KEY = 'beacon-feedback-draft';
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}

function isCategory(value: unknown): value is Category {
  return CATEGORIES.some(({ key }) => key === value);
}


export function FeedbackButton({
  className = '',
  label = 'Send feedback',
  onSent,
  onClosed,
}: {
  className?: string;
  label?: string;
  onSent?: (receipt: FeedbackReceipt) => void;
  onClosed?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onClosed?.();
  };
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-xl bg-white px-4 text-base font-semibold text-navy ring-1 ring-navy/20 ${className}`}
      >
        💬 {label}
      </button>
      {open && (
        <FeedbackPanel onClose={close} onSent={onSent} />
      )}
    </>
  );
}

function FeedbackPanel({
  onClose,
  onSent,
}: {
  onClose: () => void;
  onSent?: (receipt: FeedbackReceipt) => void;
}) {
  const [category, setCategory] = useState<Category>('bug');
  const [message, setMessage] = useState('');
  const [contact, setContact] = useState('');
  const [website, setWebsite] = useState('');
  const [submissionId, setSubmissionId] = useState('');
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<State>('idle');
  const [attempted, setAttempted] = useState(false);
  const [receipt, setReceipt] = useState<FeedbackReceipt | null>(null);
  const [copied, setCopied] = useState(false);

  // Restore whatever was half-typed last time. Somebody who starts writing a bug
  // report, gets interrupted and comes back should not find an empty box — that
  // is how you stop hearing about bugs.
  //
  // The submission id is restored WITH the draft, on purpose: resending the same
  // draft must be the same message, so a sink that has seen the id can refuse
  // the duplicate instead of filing it twice.
  useEffect(() => {
    let nextSubmissionId = uuid();
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const saved: unknown = raw ? JSON.parse(raw) : null;
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        const draft = saved as Record<string, unknown>;
        // Every field is checked before it is used. This came out of
        // localStorage, which anybody with the console open can rewrite.
        if (isUuid(draft.id)) nextSubmissionId = draft.id;
        if (isCategory(draft.category)) setCategory(draft.category);
        if (typeof draft.message === 'string') setMessage(draft.message.slice(0, 4000));
        if (typeof draft.contact === 'string') setContact(draft.contact.slice(0, 200));
      }
    } catch {
      // Private browsing can refuse storage; the panel still sends.
    }
    setSubmissionId(nextSubmissionId);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || state === 'sent') return;
    try {
      localStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({ id: submissionId, category, message, contact }),
      );
    } catch {
      // Keep the in-memory draft when storage is unavailable.
    }
  }, [category, contact, message, ready, state, submissionId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && state !== 'sending') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, state]);

  const send = async () => {
    if (!ready || !message.trim() || state === 'sending') return;
    setAttempted(true);
    setState('sending');

    // Hand it to whatever sink this deployment configured. The default keeps it
    // on this device; see lib/backend/feedback.ts to point it at your own
    // server. Nothing in this component knows or cares which one is in use, and
    // that is the whole design — the front end is the same either way.
    const at = new Date().toISOString();
    const payload: FeedbackMessage = {
      id: submissionId,
      category,
      message,
      contact,
      page: location.pathname,
      build: BUILD_ID,
      at,
    };

    // A sink must never throw, but this component cannot assume every sink
    // somebody writes obeys that. A message a person took the trouble to write
    // is not lost to a badly behaved adapter.
    let result: { ok: boolean; note?: string };
    try {
      result = await getFeedbackSink().send(payload);
    } catch {
      result = { ok: false };
    }

    if (!result.ok) {
      // The draft stays in the form, so nothing they typed disappears.
      setState('failed');
      return;
    }

    setReceipt({ id: submissionId, createdAt: at, note: result.note });
    setState('sent');
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // The receipt stands even if local cleanup is unavailable.
    }
    try {
      onSent?.({ id: submissionId, createdAt: at, note: result.note });
    } catch {
      // A caller cannot turn a saved message into a failed one.
    }
  };

  const prepareEdit = () => {
    if (!attempted) return;
    setSubmissionId(uuid());
    setAttempted(false);
    setState('idle');
    setReceipt(null);
  };

  const copy = async () => {
    try {
      const ok = await copyText(
        `Beacon feedback (${category})\n${versionLabel()}\n\n${message}${
          contact ? `\n\nReply to: ${contact}` : ''
        }`,
      );
      if (!ok) throw new Error('clipboard refused');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Send feedback"
      onClick={() => state !== 'sending' && onClose()}
    >
      <div
        className="animate-drop overlay-sheet w-full max-w-lg overflow-y-auto rounded-t-2xl solid-panel bg-white sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-center gap-3 px-5 py-4 text-white"
          style={{ backgroundColor: NAVY }}
        >
          <span className="text-2xl" aria-hidden>💬</span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-extrabold">Send feedback</p>
            <p className="text-xs text-white/60">Saved before we confirm it</p>
          </div>
          <button
            onClick={onClose}
            disabled={state === 'sending'}
            aria-label="Close"
            className="tap-sm shrink-0 rounded-lg bg-white/10 px-3 text-lg disabled:opacity-40"
          >
            ×
          </button>
        </div>

        {state === 'sent' && receipt ? (
          <div className="p-6 text-center">
            <p className="text-4xl" aria-hidden>✅</p>
            <p className="mt-2 text-lg font-bold text-navy">Feedback saved</p>
            {/* Where it went, in the sink's own words. Without this the panel
                says "saved" and a person reasonably assumes it reached the
                church — when by default it has not left their phone. A
                confirmation that overstates what happened is the one kind of
                confirmation worth nothing. */}
            {receipt.note && (
              <p className="mt-1 text-sm font-semibold leading-snug text-navy">
                {receipt.note}
              </p>
            )}
            <p className="mt-1 text-sm leading-snug text-gray-500">
              Keep this receipt if you need to ask about it later.
            </p>
            <p className="mt-3 break-all rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600">
              {receipt.id}
            </p>
            <time
              className="mt-1 block text-xs text-gray-500"
              dateTime={receipt.createdAt}
            >
              Saved {new Date(receipt.createdAt).toLocaleString()}
            </time>
            <button
              onClick={onClose}
              className="tap mt-4 w-full rounded-xl font-bold text-white"
              style={{ backgroundColor: NAVY }}
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <div>
              <p className="mb-2 text-sm font-semibold text-navy">
                What kind of feedback?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {CATEGORIES.map((item) => (
                  <button
                    key={item.key}
                    onClick={() => {
                      if (item.key !== category) prepareEdit();
                      setCategory(item.key);
                    }}
                    disabled={state === 'sending'}
                    aria-pressed={category === item.key}
                    className="rounded-xl px-3 py-2 text-sm font-semibold ring-1 transition disabled:opacity-50"
                    style={
                      category === item.key
                        ? { backgroundColor: NAVY, color: '#fff' }
                        : { backgroundColor: '#F9FAFB', color: NAVY }
                    }
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="feedback-message"
                className="mb-1 block text-sm font-semibold text-navy"
              >
                Tell us what happened
              </label>
              <textarea
                id="feedback-message"
                value={message}
                onChange={(event) => {
                  prepareEdit();
                  setMessage(event.target.value);
                }}
                disabled={state === 'sending'}
                rows={5}
                maxLength={4000}
                placeholder="What were you doing, and what did you expect instead?"
                className="w-full rounded-xl bg-gray-100 p-3 text-base outline-none focus:ring-2 focus:ring-gold"
              />
            </div>

            <div>
              <label
                htmlFor="feedback-contact"
                className="mb-1 block text-sm font-semibold text-navy"
              >
                How to reach you{' '}
                <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <input
                id="feedback-contact"
                value={contact}
                onChange={(event) => {
                  prepareEdit();
                  setContact(event.target.value);
                }}
                disabled={state === 'sending'}
                maxLength={200}
                placeholder="Email or phone, only if you want a reply"
                className="tap w-full rounded-xl bg-gray-100 px-3 text-base outline-none focus:ring-2 focus:ring-gold"
              />
            </div>

            <div className="absolute -left-[10000px]" aria-hidden="true">
              <label htmlFor="feedback-website">Website</label>
              <input
                id="feedback-website"
                name="website"
                value={website}
                onChange={(event) => setWebsite(event.target.value)}
                disabled={state === 'sending'}
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            {/* What is actually sent, and where it actually goes.
                `describe` comes from the configured sink, so this line stays
                true after somebody plugs in their own backend. The previous
                version described one particular server's behaviour in fixed
                text, which became a false promise the moment that server
                changed — and a privacy notice that is wrong is worse than
                none. */}
            <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs leading-snug text-gray-500">
              Sent only when you choose Send: your category and message, the
              contact you typed if any, which screen you were on, the app
              version, and a random ID for this message. No cookies, no
              location, no device details, and nothing from the church records.
              Where it goes: {getFeedbackSink().describe}.
            </p>

            {state === 'failed' && (
              <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
                <p className="font-bold">Not sent yet</p>
                <p className="mt-1 leading-snug">
                  Your message is still here and nothing you typed was lost. Try
                  again now, or copy it and send it another way.
                </p>
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={send}
                disabled={!ready || !message.trim() || state === 'sending'}
                className="tap flex-1 rounded-xl font-bold text-white disabled:opacity-40"
                style={{ backgroundColor: NAVY }}
              >
                {state === 'sending' ? 'Saving…' : 'Send'}
              </button>
              {state === 'failed' && (
                <button
                  onClick={copy}
                  className="tap shrink-0 rounded-xl px-4 font-bold text-navy"
                  style={{ backgroundColor: GOLD }}
                >
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
