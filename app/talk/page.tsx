'use client';

// /talk — the conversation, full screen, with a way out.
//
// A REAL ROUTE RATHER THAN ONLY A PANEL. The chat had to be somewhere you can
// go, and a route is what makes that true rather than decorative: the back
// button works, a reload keeps you in the same conversation, a notification can
// point at the thread instead of at the app in general, and the installed app
// can be opened straight into it. A panel that exists only in memory has none
// of that, and is the version people find themselves lost inside.
//
// EXIT GOES BACK, not to a fixed page. Somebody who opened the chat from the
// library should land back in the library. `router.back()` when there is
// somewhere to go back to, and home when the chat is where they arrived.

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LiveAppShell } from '@/components/LiveAppShell';
import { TalkSurface } from '@/components/live/TalkSurface';
import { useLiveSession, homeFor } from '@/lib/live/session';
import { BeaconSpinner } from '@/components/BeaconLoader';

function TalkPage() {
  const router = useRouter();
  const params = useSearchParams();
  const { profile } = useLiveSession();
  const openWith = params.get('with') ?? undefined;

  const exit = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.replace(profile ? homeFor(profile.role) : '/');
  };

  return (
    // BOTH SIDES OF A PAIRING, and nobody else. A Director has no conversation
    // to be in and would land on an empty room wondering what they had missed.
    <LiveAppShell allow={['ds', 'dm']}>
      {/* A CONVERSATION AND NOTHING ELSE, so the bottom bar steps aside here
          (TabBar.tsx, globals.css). */}
      {/* Tall enough to be the screen rather than a card on one. The header and
          the shell's own padding are the difference between this and 100vh. */}
      {/* dvh AS WELL AS vh. On iOS Safari 100vh is the tallest the viewport ever
          gets, not the part you can see, so a chat sized in vh puts its composer
          under the browser chrome — which is the one control the whole room
          exists for. vh stays as the fallback for anything without dvh. */}
      <div className="h-[calc(100vh-11rem)] [height:calc(100dvh-11rem)] min-h-[24rem] overflow-hidden rounded-2xl bg-white ring-1 ring-black/10" data-conversation-screen>
        <TalkSurface
          openWith={openWith}
          onOpenWith={(id) =>
            router.replace(id ? `/talk?with=${encodeURIComponent(id)}` : '/talk', { scroll: false })}
          onExit={exit}
        />
      </div>
    </LiveAppShell>
  );
}

export default function Page() {
  // useSearchParams needs a boundary, or the whole route opts out of static
  // rendering with a build-time warning nobody reads twice.
  return (
    <Suspense fallback={<div className="p-10"><BeaconSpinner inline label="Loading" /></div>}>
      <TalkPage />
    </Suspense>
  );
}
