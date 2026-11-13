'use client';

// The Back button an installed app does not get for free.
//
// The manifest asks for `minimal-ui`, which persuades desktop Chrome, Edge and
// Android Chrome to keep a slim Back and Reload above the page. Safari has never
// implemented it, so on an iPhone home-screen app there is no browser Back at
// all and never will be. Without something in the page itself, a person who taps
// into a seeker's room, a lesson or a settings screen has no way out except the
// bottom nav — which only reaches the top-level sections, not the screen they
// came from.
//
// Why this reads window.history.length rather than counting renders:
//
// The first version kept a depth counter in component state, incremented on
// every pathname change. It never appeared. The shell that hosts this header is
// applied per page rather than in a layout, so it UNMOUNTS AND REMOUNTS on every
// navigation and the counter went back to 1 each time. `history.length` belongs
// to the browser, so it survives that. The e2e suite tests/e2e/app-back.js is
// what found it; the build was perfectly happy.

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export function BackButton({ home }: { home?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  // Read after mount, never during render: window does not exist on the server,
  // and a value that differs between the two is a hydration mismatch.
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    setCanGoBack(window.history.length > 1);
  }, [pathname]);

  // Nothing to go back to. Offering a Back that closes the installed app is
  // worse than offering none.
  if (!canGoBack) return null;
  // On the role's own home there is nowhere useful to go back to; the app opens
  // here and the nav already reaches everything else.
  if (home && pathname === home) return null;

  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Go back"
      title="Go back"
      data-back-button
      className="tap-sm -ml-1 grid shrink-0 place-items-center rounded-full bg-white/10 text-lg hover:bg-white/20"
    >
      <span aria-hidden>←</span>
    </button>
  );
}
