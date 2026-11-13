'use client';

// Install, on the front door, where somebody who has not signed in can see it.
//
// WHY IT MOVED HERE. It was a chip in the signed-in header, wedged between the
// notification bell and the avatar on a row that is already tight on a phone.
// Two things were wrong with that. The people who most need to install are the
// ones who have just opened the link their church sent and have not signed in
// yet, and they never saw it. And on an iPhone the control cannot install
// anything anyway: it can only explain, and a 32px chip is not where an
// explanation goes.
//
// So: a real button at the bottom of the front door, and the full card in
// Settings for people already inside.
//
// IT DRAWS NOTHING ONCE THE APP IS INSTALLED. An installed app showing an
// Install button is the app telling somebody it does not know what it is.

import { useEffect, useState } from 'react';
import { APP_SHORT_NAME } from '@/lib/brand';
import Link from 'next/link';
import {
  isIos,
  isMacSafari,
  isStandalone,
  iosBrowser,
  inAppBrowser,
  OpenInSafari,
} from '@/components/InstallPrompt';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallHomeButton() {
  const [installed, setInstalled] = useState(true);   // assume yes until known
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [apple, setApple] = useState(false);
  const [wrongBrowser, setWrongBrowser] = useState('');
  const [showSteps, setShowSteps] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    setApple(isIos() || isMacSafari());
    setWrongBrowser(inAppBrowser() || iosBrowser());

    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BIPEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) return null;

  // Android, Windows, Mac in Chrome or Edge: the browser will do it for real.
  if (deferred) {
    return (
      <button
        onClick={async () => {
          await deferred.prompt();
          const { outcome } = await deferred.userChoice;
          setDeferred(null);
          if (outcome === 'accepted') setInstalled(true);
        }}
        className="tap w-full rounded-xl bg-white/95 px-4 text-base font-bold text-navy hover:bg-white"
      >
        📲 Install {APP_SHORT_NAME}
      </button>
    );
  }

  // Apple, or a browser that cannot install: say what it can do instead of
  // offering a button that would do nothing.
  return (
    <div className="rounded-2xl bg-white/10 p-4 text-center ring-1 ring-white/15">
      <p className="text-base font-bold text-white">Put {APP_SHORT_NAME} on your home screen</p>
      <p className="mt-1 text-sm text-white/70">
        It opens like any other app, with its own icon, and keeps working
        without a signal.
      </p>

      {wrongBrowser ? (
        <div className="mt-3 text-left">
          <OpenInSafari from={wrongBrowser} />
        </div>
      ) : (
        <>
          <button
            onClick={() => setShowSteps((v) => !v)}
            className="tap mt-3 w-full rounded-xl bg-white/95 px-4 text-base font-bold text-navy hover:bg-white"
          >
            {showSteps ? 'Hide the steps' : '📲 Show me how'}
          </button>
          {showSteps && (
            <ol className="mt-3 space-y-1.5 rounded-xl bg-white/10 p-3 text-left text-sm text-white/90">
              {apple ? (
                <>
                  <li>1. Tap <strong>Share</strong>, the square with an arrow coming out of it.</li>
                  <li>2. Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                  <li>3. Tap <strong>Add</strong>, top right.</li>
                  <li className="text-white/60">It must be Safari. Chrome on an iPhone cannot install apps.</li>
                </>
              ) : (
                <>
                  <li>1. Open your browser&rsquo;s <strong>⋮</strong> menu.</li>
                  <li>2. Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</li>
                </>
              )}
            </ol>
          )}
        </>
      )}

      <Link
        href="/settings"
        className="mt-3 inline-block text-xs font-semibold text-white/60 underline underline-offset-2"
      >
        Already signed in? The full instructions are in Settings.
      </Link>
    </div>
  );
}
