'use client';

// When is it safe to reload the app out from under somebody?
//
// Pulled out of components/AutoUpdate so it can be exercised directly. The
// end-to-end suite can prove the app does NOT reload while a message is
// half-written, but it cannot reliably prove the opposite half — that a cleared
// box lets the update through — because that needs a genuinely newer service
// worker waiting, which a single-build test harness does not have.
//
// A test that only ever demonstrates the blocking case would pass just as
// happily on a guard that blocks FOREVER, which is a real bug wearing the
// costume of a working one. So the decision lives here, in a function with no
// timers and no side effects, and both answers get asserted.

/**
 * Is somebody in the middle of writing something?
 *
 * Two questions, not one. The focused element says where the cursor is; the
 * sweep says whether anything on the page holds text that has not been sent.
 * Somebody who typed half a message and then tapped away to check a name still
 * has a half-written message.
 *
 * Deliberately generous about what counts as in use: a search box with a word in
 * it blocks the update too. The cost of waiting is a few more minutes on an old
 * build. The cost of being wrong the other way is somebody's words.
 */
export function hasUnsavedText(doc: Document = document): boolean {
  const active = doc.activeElement as HTMLElement | null;
  if (active?.isContentEditable) return true;

  const skip = new Set([
    'button', 'submit', 'reset', 'checkbox', 'radio', 'file', 'hidden', 'range',
  ]);

  for (const field of Array.from(doc.querySelectorAll('input, textarea'))) {
    const el = field as HTMLInputElement | HTMLTextAreaElement;
    if (el instanceof HTMLInputElement && skip.has((el.type || 'text').toLowerCase())) continue;
    if (el.value && el.value.trim() !== '') return true;
  }

  for (const editor of Array.from(doc.querySelectorAll('[contenteditable="true"]'))) {
    if (((editor as HTMLElement).innerText || '').trim() !== '') return true;
  }

  return false;
}

export interface ApplyContext {
  /** 'hidden' when the app is backgrounded — another tab, another app, screen off. */
  visibility: DocumentVisibilityState;
  /** Milliseconds since the last keypress or tap. */
  idleMs: number;
  /** How long the page must be quiet before a foreground update is allowed. */
  quietMs: number;
  /** Whether anything on the page holds text that has not been sent. */
  unsaved: boolean;
  /** Reloads already spent this session while still on this same build. */
  attempts: number;
  /** How many are allowed before giving up. */
  maxAttempts: number;
}

/**
 * How many times to reload for one build before concluding it is not working.
 *
 * Two, not one: the first attempt can genuinely lose a race — a worker still
 * installing, a request that fell over — and giving up after a single try would
 * strand people on an old build for a transient reason.
 */
export const MAX_ATTEMPTS = 2;

/** Where the attempt count lives. Session-scoped: a new tab starts clean. */
export const ATTEMPTS_KEY = 'beacon.autoupdate.attempts';

/**
 * How many reloads this session has already spent trying to leave `build`.
 *
 * Counted against the build we are ON, not the one we are going to. We do not
 * know the server's id here, and we do not need it: the question is , and our own id
 * answers that exactly. A successful update lands on a different id, where the
 * count is zero again.
 *
 * Takes the raw stored string so it can be tested without a browser.
 */
export function attemptsFor(raw: string | null, build: string): number {
  if (!raw) return 0;
  try {
    const v = JSON.parse(raw) as { build?: string; n?: number };
    if (!v || v.build !== build) return 0;
    const n = Number(v.n);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  } catch {
    // Somebody else's key, or corrupt. Treat as no attempts rather than
    // refusing to ever update again on the strength of unreadable data.
    return 0;
  }
}

/** The value to store back after spending an attempt. */
export function nextAttempts(build: string, current: number): string {
  return JSON.stringify({ build, n: current + 1 });
}

/**
 * The whole policy, in one expression.
 *
 * Backgrounded: nothing on screen to interrupt, so apply at once. Foreground:
 * only when the page has been quiet AND nothing is half-written. Both halves
 * matter — a person can stop typing mid-sentence to think, and their words are
 * still theirs.
 *
 * There is deliberately no timeout that eventually overrides `unsaved`. A build
 * being an hour older is a smaller problem than a lost message, every time, and
 * a guard with an escape hatch fires on exactly the worst case.
 *
 * THE BUDGET IS NOT A REFINEMENT. It is the difference between an app and a
 * brick. Applying an update means reloading, and the app decides to reload by
 * comparing the id the server publishes with the id compiled into the bundle it
 * is running. Those two can disagree in ways no reload will fix — an edge cache
 * serving `/version.json` from one deployment and the HTML from another, a
 * half-rolled-out release, a worker that will not install. This project has
 * already shipped a build where the two ids disagreed permanently.
 *
 * With a banner, that state was a prompt that never went away. With automatic
 * apply, it is an infinite reload loop: the app never finishes loading, so
 * nobody can reach Settings to escape it. Seen for real in
 * tests/e2e/update-speed.js, which had to be told about the budget before it
 * could stop measuring a page that was reloading under it.
 *
 * So: reload for a given build at most `maxAttempts` times, then stop and stay
 * usable on the old build. An old build is a small problem. A phone that will
 * not stay on screen is the end of somebody trusting the app.
 */
export function shouldApplyNow(c: ApplyContext): boolean {
  // Checked before everything else, including the backgrounded fast path — a
  // loop in a background tab is still a loop, and it is the one nobody sees.
  if (c.attempts >= c.maxAttempts) return false;
  if (c.visibility === 'hidden') return true;
  return c.idleMs >= c.quietMs && !c.unsaved;
}
