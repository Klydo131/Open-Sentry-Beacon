'use client';

import { useEffect, useState } from 'react';
import { NAVY, GOLD } from '@/lib/brand';
import { FeedbackButton } from './Feedback';

// The ask that comes to the tester, instead of waiting to be found.
//
// A feedback button in Settings collects feedback from people who were already
// going to give it. The ones worth hearing from are the ones who hit something
// odd, shrugged, and carried on. They will never navigate to a form. So this
// asks, once, after they have used the app long enough to have an opinion.
//
// The rules it follows are the ones that decide whether a prompt is helpful or
// resented:
//
//   - Not on arrival. It waits until someone has actually been using the app,
//     because "how are we doing?" ninety seconds in is a question about nothing.
//   - Once, then quiet. Dismissing it buys a week; sending feedback ends it for
//     a month. It never stacks up unanswered.
//   - Never over the tutorial. Being interrupted mid-instruction is the exact
//     moment a prompt becomes an obstacle.
//   - It says what it wants. "Found something odd?" invites a specific answer;
//     "Give us feedback" invites nothing.

const KEY = 'beacon-feedback-nudge';
const APPEAR_AFTER_MS = 4 * 60 * 1000; // long enough to have formed an opinion
const SNOOZE_DISMISS = 7 * 24 * 60 * 60 * 1000;
const SNOOZE_SENT = 30 * 24 * 60 * 60 * 1000;

function snoozedUntil(): number {
  try {
    return Number(localStorage.getItem(KEY) ?? 0);
  } catch {
    return 0;
  }
}

function snooze(ms: number) {
  try {
    localStorage.setItem(KEY, String(Date.now() + ms));
  } catch {
    // A browser refusing storage is not a reason to nag harder.
  }
}

export function FeedbackNudge({ suppressed = false }: { suppressed?: boolean }) {
  const [show, setShow] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (suppressed) return;
    if (Date.now() < snoozedUntil()) return;
    const t = setTimeout(() => setShow(true), APPEAR_AFTER_MS);
    return () => clearTimeout(t);
  }, [suppressed]);

  if (!show || suppressed) return null;

  return (
    <div
      data-steps-aside-for-chat
      className="no-print safe-bottom fixed inset-x-0 bottom-0 z-[70] flex justify-center p-3"
      role="status"
    >
      <div className="animate-drop w-full max-w-md rounded-2xl bg-white p-4 lift-3 ring-1 ring-black/10">
        <div className="flex items-start gap-3">
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-xl"
            style={{ backgroundColor: GOLD }}
            aria-hidden
          >
            💬
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold text-navy">Found something odd?</p>
            <p className="mt-0.5 text-sm leading-snug text-gray-500">
              You are testing an early build, so anything confusing or broken is
              worth telling us. It takes a sentence.
            </p>
          </div>
          <button
            onClick={() => {
              snooze(SNOOZE_DISMISS);
              setShow(false);
            }}
            aria-label="Not now"
            className="tap-sm shrink-0 rounded-lg bg-gray-100 px-2 text-lg text-gray-500"
          >
            ×
          </button>
        </div>
        <div className="mt-3">
          <FeedbackButton
            className="tap w-full ring-0"
            label="Tell us what you found"
            onSent={() => {
              snooze(SNOOZE_SENT);
              setSent(true);
            }}
            onClosed={() => {
              if (sent) setShow(false);
            }}
          />
        </div>
      </div>
    </div>
  );
}
