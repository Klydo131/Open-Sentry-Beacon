'use client';

import { useEffect, useRef, useState } from 'react';
import { useUpdateState, isApplying, BUILD_ID } from '@/lib/app-update';
import {
  hasUnsavedText,
  shouldApplyNow,
  attemptsFor,
  nextAttempts,
  MAX_ATTEMPTS,
  ATTEMPTS_KEY,
} from '@/lib/auto-update';

// The app updates itself. Nobody is asked.
//
// WHY THE BANNER WENT. It asked people to make a decision about software, which
// is not their job. The owner's words: most of the people using this are older,
// and they want the app to be simple. A banner offering "Restart" or "Later" is
// a small exam in a language they did not sign up to learn, and the honest
// outcome of that exam is that a lot of phones sit on an old build for weeks —
// which is worse than any interruption, because two people on two builds can see
// two different answers to the same question.
//
// SO THERE IS EXACTLY ONE THING LEFT TO GET RIGHT, and it is not a click.
//
// An automatic reload that lands while somebody is halfway through a message to
// the person they are walking with destroys that message. Silently. They do not
// know an update happened; they know the app ate what they wrote. That is far
// more damaging than a banner, and it is invisible to us because nobody reports
// "the app lost my sentence" as an update bug.
//
// So this waits for a moment when a reload cannot cost anybody anything:
//
//   1. The app is in the background — another tab, another app, screen off.
//      Nothing is being typed into a page nobody is looking at. Applied at once.
//   2. Nothing has been typed for a while AND no field holds unsaved text.
//      This is the foreground case, and both halves matter: a person can stop
//      typing mid-sentence to think, and their half-written message is still
//      theirs.
//
// If neither holds, it waits and checks again. There is no timeout that
// eventually overrides the guard. A build being one hour older is a smaller
// problem than a lost message, every time, and a guard with an escape hatch is
// a guard that fires on exactly the worst case.

/** How long the page must be quiet before a foreground update is allowed. */
const QUIET_MS = 20_000;

/** How often to reconsider. Cheap: it reads a few DOM properties. */
const POLL_MS = 5_000;

export function AutoUpdate() {
  const { state, apply } = useUpdateState();
  const lastTypedAt = useRef(0);
  // Shown only after the fact, and only briefly. Not a prompt: there is nothing
  // to decide and nothing to dismiss. It exists because an update that leaves no
  // trace at all makes "did something change?" unanswerable when somebody rings
  // to ask why a screen looks different.
  const [justUpdated, setJustUpdated] = useState(false);

  useEffect(() => {
    const mark = () => {
      lastTypedAt.current = Date.now();
    };
    // keydown rather than input: pressing keys counts even when the keystroke
    // does not change a value, which is what "somebody is at the keyboard"
    // actually means.
    window.addEventListener('keydown', mark, { passive: true });
    window.addEventListener('pointerdown', mark, { passive: true });
    return () => {
      window.removeEventListener('keydown', mark);
      window.removeEventListener('pointerdown', mark);
    };
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem('beacon.autoupdate.applied') === '1') {
        sessionStorage.removeItem('beacon.autoupdate.applied');
        setJustUpdated(true);
        const t = setTimeout(() => setJustUpdated(false), 6000);
        return () => clearTimeout(t);
      }
    } catch {
      // Storage refused. The note is a courtesy, not a feature.
    }
  }, []);

  // The update state, on the root element.
  //
  // With the banner gone there is nothing on screen that says "a new build
  // exists", which is the point — but it also left the end-to-end suites with
  // nothing to observe, and a test that cannot see the thing it measures ends up
  // measuring something else. This is the observable: not a UI affordance, not
  // something a person ever sees, just the state named where a test can read it.
  useEffect(() => {
    const el = document.documentElement;
    el.setAttribute('data-update-state', state);
    return () => el.removeAttribute('data-update-state');
  }, [state]);

  useEffect(() => {
    if (state !== 'ready' && state !== 'required') return;
    if (!apply) return;

    let cancelled = false;

    // Reloads already spent this session while still on this build. Read fresh
    // each time rather than cached in a ref: the reload IS the loop, so the
    // count has to survive it, and sessionStorage is the only thing here that
    // does.
    const attempts = () => {
      try {
        return attemptsFor(sessionStorage.getItem(ATTEMPTS_KEY), BUILD_ID);
      } catch {
        // Storage refused — some privacy modes do this. Treat the budget as
        // spent. That means such a browser never auto-updates, which is a real
        // cost and is chosen deliberately: the alternative is reloading with no
        // way to count the reloads, and a loop nobody can interrupt leaves the
        // app unusable and Settings unreachable. Stuck on an old build is
        // recoverable from inside the app; a reload loop is not.
        return MAX_ATTEMPTS;
      }
    };

    const go = () => {
      if (cancelled || isApplying()) return;
      try {
        sessionStorage.setItem(ATTEMPTS_KEY, nextAttempts(BUILD_ID, attempts()));
        sessionStorage.setItem('beacon.autoupdate.applied', '1');
      } catch {
        // Fine. The reload still happens; only the note is lost.
      }
      apply();
    };

    const consider = () => {
      if (cancelled) return;
      // The decision itself lives in lib/auto-update so it can be asserted both
      // ways. This component owns the timing; it does not own the policy.
      const safe = shouldApplyNow({
        visibility: document.visibilityState,
        idleMs: Date.now() - lastTypedAt.current,
        quietMs: QUIET_MS,
        unsaved: hasUnsavedText(),
        attempts: attempts(),
        maxAttempts: MAX_ATTEMPTS,
      });
      if (safe) go();
    };

    const timer = setInterval(consider, POLL_MS);
    const onHide = () => {
      if (document.visibilityState === 'hidden') consider();
    };
    document.addEventListener('visibilitychange', onHide);
    // One immediate look, so a person who has not touched the page at all does
    // not wait a whole poll interval.
    consider();

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, [state, apply]);

  if (!justUpdated) return null;

  return (
    <div
      data-steps-aside-for-chat
      className="no-print safe-bottom pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex justify-center px-3"
      // Announced politely rather than assertively: it is information, and it
      // must not interrupt whatever a screen reader is already saying.
      role="status"
      aria-live="polite"
    >
      <div className="animate-drop rounded-full bg-navy/90 px-4 py-2 text-sm font-semibold text-white shadow-lg">
        Beacon updated itself
      </div>
    </div>
  );
}
