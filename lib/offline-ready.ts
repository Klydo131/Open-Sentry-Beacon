'use client';

import { useSyncExternalStore } from 'react';

// How much of the app is on this device for no signal, as the service worker
// last said (app/sw.js/route.ts answers KEEP_EVERYTHING and HOW_MUCH_IS_KEPT
// with a KEPT message).
//
// WHY ANYBODY SEES THIS. "Works offline" was a promise nobody could check. The
// app said it in Settings while twelve of its screens showed "You're offline"
// with no signal, and the only way to find out was to lose the signal at the
// moment the screen was needed. A count the person can read on their own
// phone, before the church hall, is the check.

export type Kept = { kept: number; total: number };

let last: Kept | null = null;
const listeners = new Set<() => void>();

export function setKept(k: Kept) {
  last = k;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** The last count the worker gave, or null when it has not said. */
export function useKept(): Kept | null {
  return useSyncExternalStore(subscribe, () => last, () => null);
}

/** Data Saver, where the browser reports it (Chromium does, Safari does not). */
export function savingData(): boolean {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return c?.saveData === true;
}

/**
 * The person pages this screen links to: a Guide's Explorers, from their
 * list, their desk or their home. Each has an address of its own, so no
 * build-time list can name them; keeping the ones on screen means the people
 * somebody works with open with no signal, not only the ones opened lately.
 */
function personPagesOnScreen(): string[] {
  const out = new Set<string>();
  document.querySelectorAll<HTMLAnchorElement>('a[href^="/dm/"]').forEach((a) => {
    const path = a.getAttribute('href')?.split(/[?#]/)[0];
    if (path && /^\/dm\/[A-Za-z0-9_-]{1,64}$/.test(path)) out.add(path);
  });
  return [...out];
}

/**
 * Ask the worker for everything not kept yet, or only for the count. It
 * fetches only with a signal and without Data Saver; either way it answers
 * with how much it holds.
 */
export function askWorker(fetchMissing: boolean) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  const fetching = fetchMissing && navigator.onLine && !savingData();
  const message = fetching
    ? { type: 'KEEP_EVERYTHING', pages: personPagesOnScreen() }
    : { type: 'HOW_MUCH_IS_KEPT' };
  navigator.serviceWorker.ready
    .then((reg) => reg.active?.postMessage(message))
    .catch(() => {});
}

/** Only the person pages on this screen, asked for as somebody moves around. */
export function keepPeopleOnScreen() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!navigator.onLine || savingData()) return;
  const pages = personPagesOnScreen();
  if (!pages.length) return;
  navigator.serviceWorker.ready
    .then((reg) => reg.active?.postMessage({ type: 'KEEP_PAGES', pages }))
    .catch(() => {});
}
