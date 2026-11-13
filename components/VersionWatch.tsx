'use client';

import { useEffect } from 'react';
import { checkForUpdate, getUpdateState } from '@/lib/app-update';

// How quickly the app notices a new release, and how it decides to look.
//
// components/ServiceWorker.tsx asks the browser to look for a new worker, but
// that path has a blind spot that bit real devices: if the browser decides the
// worker script has not changed, it reports no update, and the app keeps
// insisting it is current while the server is several releases ahead. The only
// way out was to uninstall and reinstall — the exact thing auto-update exists to
// prevent. So this asks the server directly (/version.json, no-store) and
// compares the answer with the build id baked into this bundle. It needs nothing
// from the worker, so it still works when the worker is the broken thing.
//
// The pacing is the part that was wrong. A fifteen-minute timer plus `focus` is
// a desktop assumption twice over:
//
//   - Fifteen minutes is a long time to stand in front of a room saying "it
//     should appear in a moment".
//   - `focus` is not how a phone comes back. Switching apps and returning to an
//     installed PWA fires `visibilitychange`; a back-gesture that restores from
//     the back/forward cache fires `pageshow` with `persisted` and may fire
//     nothing else at all. On the devices this app is actually used on, the
//     event we listened hardest for is the one least likely to arrive.
//
// What it does now, in one place so the whole policy can be read at once:
//
//   ON LOAD          after a short delay, so the first screen paints first.
//   COMING BACK      visibilitychange, pageshow (including bfcache restores),
//                    and focus — whichever the device happens to send.
//   BACK ONLINE      the `online` event. Signal returning is the single most
//                    likely moment for a check to succeed after failing.
//   WHILE WATCHING   every 30s for the first five minutes, then every 5 min.
//                    Somebody who just opened the app is usually the person
//                    waiting for a fix; somebody four hours in is not.
//   WHILE HIDDEN     nothing at all. No timer, no request. A backgrounded phone
//                    should cost neither battery nor data, and the check on the
//                    way back is what matters anyway.
//   AFTER A FAILURE  back off 1 → 2 → 4 minutes. A phone on a dead hotspot
//                    should not retry every minute forever.
//   ONCE FOUND       stop polling. The answer will not get any newer, the
//                    banner is already up, and the new build is already being
//                    downloaded in the background.
//
// Every trigger goes through one gate with a minimum gap, so a phone that fires
// visibilitychange, pageshow and focus within the same 50ms makes one request.

/** Fast cadence, for the first few minutes after the app is opened. */
const FAST_MS = 30_000;
/** Relaxed cadence, once it is clear nobody is standing over it. */
const SLOW_MS = 5 * 60_000;
/** How long the fast cadence lasts. */
const FAST_WINDOW_MS = 5 * 60_000;
/** No two checks closer together than this, however many events arrive. */
const MIN_GAP_MS = 8_000;
/** Failure backoff, in order. The last value repeats. */
const BACKOFF_MS = [60_000, 120_000, 240_000];

export function VersionWatch() {
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastCheck = 0;
    let failures = 0;
    const openedAt = Date.now();

    const clear = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };

    // Found is found. Once the server has told us there is a newer build, more
    // requests cannot improve on that answer.
    const settled = () => {
      const s = getUpdateState().state;
      return s === 'ready' || s === 'required';
    };

    const delay = () => {
      if (failures > 0) return BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)];
      return Date.now() - openedAt < FAST_WINDOW_MS ? FAST_MS : SLOW_MS;
    };

    const schedule = () => {
      clear();
      if (stopped || settled() || document.visibilityState === 'hidden') return;
      timer = setTimeout(run, delay());
    };

    const run = async () => {
      clear();
      if (stopped || settled()) return;
      // Hidden, or no network at all: not a failure, just not now. Asking a
      // browser that knows it is offline only produces a rejected promise.
      if (document.visibilityState === 'hidden' || navigator.onLine === false) return;

      const before = getUpdateState().checkedAt;
      lastCheck = Date.now();
      try {
        await checkForUpdate();
      } catch {
        // checkForUpdate swallows its own errors; belt and braces.
      }
      if (stopped) return;
      // checkedAt only moves on a successful answer, so it is the honest signal
      // for "did the server actually reply" without duplicating the fetch.
      const after = getUpdateState().checkedAt;
      failures = after !== null && after !== before ? 0 : failures + 1;
      schedule();
    };

    // One gate for every event source, so three events in the same instant are
    // one request rather than three.
    const trigger = () => {
      if (stopped || settled()) return;
      if (document.visibilityState === 'hidden') return;
      if (Date.now() - lastCheck < MIN_GAP_MS) {
        schedule();
        return;
      }
      void run();
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Coming back is the moment worth spending a request on: time has
        // passed, and a release may well have happened during it.
        failures = 0;
        trigger();
      } else {
        // Going away stops everything. A hidden tab that keeps a timer alive is
        // a battery cost with nobody to show the result to.
        clear();
      }
    };

    const onPageShow = (e: Event) => {
      // A bfcache restore hands back a page frozen mid-life: its timers were
      // suspended and its idea of the current build can be hours old.
      if ((e as PageTransitionEvent).persisted) failures = 0;
      trigger();
    };

    const onOnline = () => {
      failures = 0;
      trigger();
    };

    // Not instantly: let the first screen paint before spending a request.
    timer = setTimeout(run, 1500);

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('focus', trigger);
    window.addEventListener('online', onOnline);

    return () => {
      stopped = true;
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('focus', trigger);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return null;
}
