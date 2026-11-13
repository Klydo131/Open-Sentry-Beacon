'use client';

// A quiet "Install" in the header, for as long as the app is not installed.
//
// The floating card asks once and then goes away for two days; Settings has the
// full instructions but you have to know to look. This is the middle: always
// visible on a device that has not installed the app, never visible on one that
// has, and one tap from the real thing when the browser offers it.
//
// It disappears the moment the app is installed, which is the point — a
// permanent Install button inside an installed app is how you can tell nobody
// tried it.

import { useEffect, useState } from 'react';
import { APP_SHORT_NAME } from '@/lib/brand';
import Link from 'next/link';
import { isInstallable, isStandalone, useIsInstalled } from '@/components/InstallPrompt';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallChip({ onDark = false }: { onDark?: boolean }) {
  const [show, setShow] = useState(false);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  // The chip is the permanent affordance, so it is the one that most needs to
  // vanish the moment the app is installed. A standing Install button inside an
  // installed app is the clearest possible sign nobody tried it.
  const installed = useIsInstalled();

  useEffect(() => {
    if (isStandalone() || !isInstallable()) return;
    setShow(true);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!show || installed) return null;

  const className = onDark
    ? 'tap-sm shrink-0 rounded-full bg-white/10 px-3 text-xs font-bold hover:bg-white/20'
    : 'tap-sm shrink-0 rounded-full bg-navy/5 px-3 text-xs font-bold text-navy hover:bg-navy/10';

  // With a real prompt available, install here and now. Without one — Safari,
  // Firefox, or a Chrome that has not decided you are engaged enough yet —
  // Settings has the steps for the device in the reader's hand.
  if (deferred) {
    return (
      <button
        type="button"
        className={className}
        title={`Install ${APP_SHORT_NAME} on this device`}
        onClick={async () => {
          await deferred.prompt();
          const { outcome } = await deferred.userChoice;
          if (outcome === 'accepted') setShow(false);
          setDeferred(null);
        }}
      >
        <span aria-hidden>⬇️</span> <span className="hidden sm:inline">Install</span>
      </button>
    );
  }

  // Straight to the card, not to the top of Settings. This is the Apple path:
  // Safari never fires beforeinstallprompt, so `deferred` is always null there
  // and every iPhone and Mac user takes this branch. Sending them to the page
  // and letting them hunt is how "the Install button does nothing" gets
  // reported — from their side it opened Settings and nothing happened.
  return (
    <Link href="/settings#install" className={className} title={`Install ${APP_SHORT_NAME} on this device`}>
      <span aria-hidden>⬇️</span> <span className="hidden sm:inline">Install</span>
    </Link>
  );
}
