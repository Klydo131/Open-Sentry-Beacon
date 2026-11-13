'use client';

import { useEffect, useState } from 'react';

// Am I online?
//
// `navigator.onLine` alone is not trustworthy: it reports whether the device
// has a network interface, not whether anything is reachable. A phone attached
// to a wifi access point with no upstream reads as "online" and every request
// still fails. So `false` is believed immediately (the browser is certain when
// the interface drops) and `true` is *verified* with a tiny same-origin request
// before we tell the person they are back.
//
// ponytail: the events are native and free. The only thing added on top is one
// HEAD request against a file we already ship.

const PROBE = '/icons/icon.svg';

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${PROBE}?ping=${Date.now()}`, {
      method: 'HEAD',
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function useOnline(): { online: boolean; checking: boolean } {
  // Start optimistic so the banner never flashes on a normal load. The first
  // effect corrects it within a tick if that was wrong.
  const [online, setOnline] = useState(true);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let dead = false;

    const goOffline = () => {
      if (!dead) setOnline(false);
    };

    // The browser says the interface is back. Confirm something actually
    // answers before claiming recovery.
    const goOnline = async () => {
      if (dead) return;
      setChecking(true);
      const ok = await reachable();
      if (dead) return;
      setChecking(false);
      setOnline(ok);
    };

    if (!navigator.onLine) {
      setOnline(false);
    } else {
      // Verify the optimistic default once on mount.
      void goOnline();
    }

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);

    // A dropped upstream fires no event at all — the interface never changed.
    // A slow poll catches that case without being a background data drain.
    const poll = setInterval(() => {
      if (navigator.onLine) void goOnline();
      else goOffline();
    }, 30_000);

    return () => {
      dead = true;
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
      clearInterval(poll);
    };
  }, []);

  return { online, checking };
}
