'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import {
  setUpdateState,
  setChecker,
  setRegistration,
  applyUpdate,
  isApplying,
  BUILD_ID,
} from '@/lib/app-update';
import { askWorker, keepPeopleOnScreen, setKept } from '@/lib/offline-ready';

// Registers the offline service worker and keeps the app updating itself —
// nobody ever has to uninstall and reinstall to get a new version.
//
// The update is downloaded in the background and then applied by the app
// itself — nobody is asked. components/AutoUpdate.tsx owns the timing and
// waits for a moment when a reload cannot cost anybody anything: the app
// backgrounded, or the page quiet with no half-written text anywhere on it. A
// reload mid-sentence loses whatever somebody was typing, so that guard is the
// whole of what this trade rests on.
export function ServiceWorker() {
  // A Guide's Explorers are listed on screens reached by moving around, not
  // only on the one the app opened on, so each screen's person links are
  // offered to the worker a moment after it settles.
  const pathname = usePathname();
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    const t = setTimeout(keepPeopleOnScreen, 2500);
    return () => clearTimeout(t);
  }, [pathname]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') {
      setUpdateState({ state: 'unsupported' });
      return;
    }

    // Everything this effect registers, so it can all be undone. The previous
    // version returned its cleanup from inside the registration promise, where
    // React never sees it — so the listeners and the interval below were added
    // and never removed. It went unnoticed because this component is mounted
    // once in the root layout and never unmounts, but in development's
    // double-mount it registered everything twice.
    const teardown: Array<() => void> = [];
    let cancelled = false;

    const onControllerChange = () => {
      // Only reload for an update the user asked us to apply, never for the
      // initial claim on first load.
      if (isApplying()) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    teardown.push(() =>
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange),
    );

    // The worker's answer to "how much of the app is kept for no signal".
    const onMessage = (event: MessageEvent) => {
      const d = event.data as { type?: string; kept?: number; total?: number } | null;
      if (d?.type === 'KEPT' && typeof d.kept === 'number' && typeof d.total === 'number') {
        setKept({ kept: d.kept, total: d.total });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    navigator.serviceWorker.startMessages?.();
    teardown.push(() => navigator.serviceWorker.removeEventListener('message', onMessage));

    // The ?v= is the whole trick. See scripts/stamp-build.mjs.
    const build = BUILD_ID;
    // A first worker can claim the page before its installed event is observed
    // in WebKit. Remember the starting state so that claim is never an update.
    const controlledOnLoad = Boolean(navigator.serviceWorker.controller);

    navigator.serviceWorker
      .register(`/sw.js?v=${build}`, {
        // Never let the browser answer this from its own HTTP cache; it may
        // hold a service worker script for up to 24h, which delays an update
        // even when the URL is new.
        updateViaCache: 'none',
      })
      .then((reg) => {
        if (cancelled) return;
        // Share it, so applying an update anywhere in the app can take the fast
        // path: hand over to the worker that already holds the new build, rather
        // than deleting every cache and downloading the app again.
        setRegistration(reg);

        const offerUpdate = () => {
          setUpdateState({
            state: 'ready',
            checkedAt: Date.now(),
            apply: () => void applyUpdate(),
          });
        };

        // A worker that finished installing while another was in control is,
        // by definition, an update waiting to go.
        if (reg.waiting && navigator.serviceWorker.controller) {
          offerUpdate();
        } else {
          setUpdateState({ state: 'current', checkedAt: Date.now() });
        }

        const onUpdateFound = () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && controlledOnLoad && navigator.serviceWorker.controller) {
              offerUpdate();
            }
          });
        };
        reg.addEventListener('updatefound', onUpdateFound);
        teardown.push(() => reg.removeEventListener('updatefound', onUpdateFound));

        // Let any screen trigger a check — the Settings panel has a button.
        setChecker(() => reg.update().then(() => undefined));
        teardown.push(() => setChecker(null));
        teardown.push(() => setRegistration(null));

        // An hourly backstop, and nothing more. components/VersionWatch.tsx is
        // the real clock now: it asks the SERVER what build it is running, which
        // is the check that still works when the worker is the broken part. This
        // one only covers the case where the browser spots a new worker without
        // being asked.
        const check = () => {
          reg
            .update()
            .then(() => {
              // Don't overwrite a pending 'ready' with 'current'.
              setUpdateState({ checkedAt: Date.now() });
            })
            .catch(() => {});
        };
        check();
        const id = setInterval(check, 60 * 60 * 1000);
        teardown.push(() => clearInterval(id));

        // KEEP THE WHOLE APP, NOT ONLY WHAT WAS OPENED. The worker keeps every
        // screen and its code when it installs, and the big tools (the study
        // room's editor, the drawing board, the PDF reader) once it is asked
        // to. It is asked here, a few seconds after the app opens so the
        // screen in front of somebody is never slowed by it, and again each
        // time the signal comes back, so an install cut short by a lost
        // signal finishes the next time there is one. Not on Data Saver.
        const keepEverything = () => askWorker(true);
        const soon = setTimeout(keepEverything, 4000);
        teardown.push(() => clearTimeout(soon));
        window.addEventListener('online', keepEverything);
        teardown.push(() => window.removeEventListener('online', keepEverything));
      })
      .catch(() => {
        // Offline support is a progressive enhancement — never block the app.
        //
        // Note what does NOT stop here: VersionWatch asks the server directly
        // and needs no worker at all, so a browser with service workers blocked
        // still learns about a new release and can still apply one.
        setUpdateState({ state: 'unsupported' });
      });

    return () => {
      cancelled = true;
      teardown.forEach((fn) => fn());
    };
  }, []);
  return null;
}
