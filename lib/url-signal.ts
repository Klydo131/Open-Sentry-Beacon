'use client';

// Notice when the address changes, including when React cannot.
//
// THE BUG THIS EXISTS FOR: a Director standing on `/admin?room=pairings`
// presses "Waiting to be approved" on their desk. It links to
// `/admin?room=approvals`. Same page, same component, so nothing unmounts and
// nothing re-renders — the address in the bar changes and the screen does not.
// The desk rail is drawn ON the admin page, so this is not an edge case; it is
// the most likely press there is. It reads exactly as reported.
//
// Next's App Router gives no hook for this. `usePathname()` does not change,
// because the path did not. `useSearchParams()` does, but it forces a Suspense
// boundary onto every statically rendered page that touches it, which is a
// large change to make for a query string. `popstate` covers the back button
// only — the browser does not fire it, or `hashchange`, for a pushState.
//
// So: wrap pushState and replaceState once, and say so out loud. Roughly thirty
// lines, and every `?room=` and `#card` link in the app becomes reliable
// regardless of which screen somebody presses it from.

import { useEffect, useState } from 'react';

const EVENT = 'beacon:urlchange';

let patched = false;

function announce() {
  // A microtask, not a synchronous dispatch. pushState is called from inside
  // Next's router; setting state on other components in the middle of that is
  // asking for trouble, and one tick later is imperceptible.
  queueMicrotask(() => window.dispatchEvent(new CustomEvent(EVENT)));
}

function patch() {
  if (patched || typeof window === 'undefined') return;
  patched = true;

  type Push = History['pushState'];
  for (const name of ['pushState', 'replaceState'] as const) {
    const original = history[name] as Push;
    history[name] = function (this: History, ...args: Parameters<Push>) {
      const result = original.apply(this, args);
      announce();
      return result;
    } as Push;
  }

  // The back button, and a genuine `#hash` navigation, which do fire.
  window.addEventListener('popstate', announce);
  window.addEventListener('hashchange', announce);
}

/**
 * The current address, as a string that changes whenever the address does.
 *
 * Use it as an effect dependency — `[url]` — anywhere a screen reads the query
 * string or the hash itself. Empty on the server and on the first render, then
 * filled in after mount, so it never makes the two disagree.
 */
export function useUrlKey(): string {
  const [key, setKey] = useState('');

  useEffect(() => {
    patch();
    const read = () =>
      setKey(window.location.pathname + window.location.search + window.location.hash);
    read();
    window.addEventListener(EVENT, read);
    return () => window.removeEventListener(EVENT, read);
  }, []);

  return key;
}
