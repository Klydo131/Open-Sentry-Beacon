'use client';

// The last resort, shown only when the app could not start at all.
//
// components/SelfHeal.tsx repairs this automatically the first time. If the
// person lands here, the automatic repair already ran once this session and the
// fresh copy failed too, so reloading on a timer would just spin. Instead they
// get a plain screen, an honest sentence, and a button that does the same repair
// on purpose.
//
// This file deliberately imports nothing. A broken build is exactly the moment
// when reaching for a shared helper fails, and a recovery screen that cannot
// render is not a recovery screen. Inline styles for the same reason: the
// stylesheet may be one of the files that did not load.

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  // The two failures that land somebody here are different, and until now only
  // one of them had a button.
  //
  // A stale bundle is fixed by fetching the app again — that is repair(), below.
  // But saved data the new code cannot read is NOT fixed by fetching anything,
  // because the data is in localStorage and repair() deliberately never touches
  // storage. Somebody in that state can refresh as hard as they like, forever,
  // and nothing will change. That happened, on a real phone, and the screen gave
  // them no way out.
  //
  // So there is a second button. It clears only this device's demo and tutorial
  // state — by prefix, so per-track quest keys and anything added later are
  // included — and leaves the sign-in session, saved feedback and language alone.
  const DEMO_PREFIXES = ['beacon-demo', 'beacon-quest', 'beacon-tutorial', 'beacon-persona'];

  async function repair() {
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      sessionStorage.removeItem('beacon-healed');
    } catch {
      // Reload regardless. Fetching the app again is the whole point.
    }
    location.replace(`/?fresh=${Date.now()}&by=error-screen`);
  }

  function resetDemoData() {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && DEMO_PREFIXES.some((p) => key.startsWith(p))) doomed.push(key);
      }
      doomed.forEach((k) => localStorage.removeItem(k));
      sessionStorage.removeItem('beacon-healed');
    } catch {
      // Storage blocked entirely. Reload anyway; there is nothing else to try.
    }
    location.replace(`/?fresh=${Date.now()}&by=reset-sample`);
  }

  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: '#1E2A4A' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
            color: '#fff',
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: '26rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }} aria-hidden>
              🕯️
            </div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.75rem' }}>
              Beacon needs a fresh copy
            </h1>
            <p style={{ lineHeight: 1.6, color: 'rgba(255,255,255,0.75)', margin: '0 0 1.5rem' }}>
              This device is holding an old copy of the app that no longer
              matches the server. Getting the latest version fixes it. Nothing
              you saved is affected.
            </p>
            <button
              onClick={repair}
              style={{
                width: '100%',
                padding: '0.9rem 1rem',
                fontSize: '1rem',
                fontWeight: 700,
                color: '#1E2A4A',
                backgroundColor: '#E9B949',
                border: 'none',
                borderRadius: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Get the latest version
            </button>
            <button
              onClick={reset}
              style={{
                width: '100%',
                marginTop: '0.6rem',
                padding: '0.75rem 1rem',
                fontSize: '0.95rem',
                color: 'rgba(255,255,255,0.7)',
                backgroundColor: 'transparent',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Try again first
            </button>
            <p
              style={{
                margin: '1.5rem 0 0.6rem',
                fontSize: '0.85rem',
                lineHeight: 1.6,
                color: 'rgba(255,255,255,0.55)',
              }}
            >
              Still on this screen after getting the latest version? Then this
              device is holding practice data the new version cannot read.
              Clearing it starts the demo over. Your sign-in and any feedback you
              have written are not touched.
            </p>
            <button
              onClick={resetDemoData}
              style={{
                width: '100%',
                padding: '0.7rem 1rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.8)',
                backgroundColor: 'transparent',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Clear practice data and start over
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
