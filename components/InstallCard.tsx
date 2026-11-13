'use client';

// Installing the app, as something you can go and find.
//
// WHY THE AUTOMATIC PROMPT IS NOT ENOUGH, and this is not belt-and-braces.
//
//   * Chrome fires `beforeinstallprompt` only once its own engagement
//     heuristics are satisfied — a certain amount of time on the site, a
//     certain number of visits. On a phone handed round at a demo, that is
//     usually never.
//   * Firefox does not fire it at all, on any platform.
//   * Safari has never had it, on Mac or on iPhone.
//   * And once anybody presses "Later", the prompt is quiet for days.
//
// So the floating card is a nudge for the people who happen to qualify, and
// this is the answer for everybody else: a permanent entry in Settings that
// works on every device, and says exactly what to press on the one you are
// holding.
//
// It hides itself when the app is already installed. An install button inside
// an installed app is the clearest possible sign that nobody tested it.

import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { InstallSteps } from '@/components/InstallSteps';
import { appleKind, addTitle, addLabel, type AppleKind } from '@/lib/apple-install';
import { APP_SHORT_NAME } from '@/lib/brand';
import {
  OpenInSafari,
  inAppBrowser,
  iosBrowser,
  iosShareLocation,
  isInstallable,
  isIos,
  isMacSafari,
  isStandalone,
} from '@/components/InstallPrompt';

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Platform = 'auto' | 'iphone' | 'ipad' | 'mac' | 'other';

export function InstallCard() {
  const [platform, setPlatform] = useState<Platform | null>(null);
  // Which Apple device, so every label reads the words that are on the menu.
  const [kind, setKind] = useState<AppleKind>(null);
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [wrongHost, setWrongHost] = useState(false);
  const [steps, setSteps] = useState(false);
  const [inApp, setInApp] = useState('');
  // Chrome, Firefox, Edge or Opera on an iPhone. A real browser, and still one
  // that Apple will not let install an app.
  const [wrongBrowser, setWrongBrowser] = useState('');
  const [shareWhere, setShareWhere] = useState('at the bottom of Safari');

  useEffect(() => {
    // BEFORE THE EARLY RETURNS. The preview-address card below is a heading
    // like any other, and an Apple reader who reached it before this ran was
    // shown the word Install after all.
    setKind(appleKind());
    if (isStandalone()) { setInstalled(true); return; }
    if (!isInstallable()) { setWrongHost(true); return; }

    // An iPhone, an iPad and a Mac are three different sets of instructions,
    // not one Apple set. appleKind tells them apart, including the iPad that
    // reports itself as a Macintosh.
    const apple = appleKind();
    setPlatform(apple ?? (isMacSafari() ? 'mac' : 'other'));
    setInApp(inAppBrowser());
    setWrongBrowser(iosBrowser());
    setShareWhere(iosShareLocation());

    // Arrived from the header's Install chip, which on Apple is the only thing
    // it can do. Somebody who has just pressed a button labelled Install has
    // asked the question already; making them press "Show me how" to get an
    // answer is one refusal too many. Open the steps for them.
    try {
      if (window.location.hash === '#install') setSteps(true);
    } catch {}

    // If the browser offers a real install, take it — a one-tap install beats
    // any set of written instructions. This listener stays for the life of the
    // screen because Chrome can fire it at any point, not just on load.
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setPlatform('auto');
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (installed) {
    return (
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">📱 {APP_SHORT_NAME} is installed</h2>
        <p className="mt-1 text-sm text-gray-600">
          You are using the installed app on this device. It updates itself.
        </p>
      </Card>
    );
  }

  if (wrongHost) {
    // Deliberately quiet about it. Every deployment gets its own permanent
    // address, and a copy installed from one of those can never receive an
    // update — so the install is withheld rather than offered and regretted.
    return (
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">📱 {addTitle(kind, APP_SHORT_NAME)}</h2>
        <p className="mt-1 text-sm text-gray-600">
          Open the church&rsquo;s main address first. This one is a preview, and an
          app installed from a preview can never receive an update.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📱 {addTitle(kind, APP_SHORT_NAME)}</h2>
      <p className="mt-1 text-sm text-gray-600">
        Put it on your home screen and it opens like any other app: its own
        icon, no address bar, and it keeps working without a signal.
      </p>

      {inApp ? (
        // NOTHING ELSE ON THIS CARD IS TRUE INSIDE AN APP'S OWN BROWSER. On
        // iOS only Safari can add to the home screen, so every other set of
        // steps here sends the reader looking for a control that is not there
        // — the reported bug, from a link shared in Messenger.
        <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="font-semibold text-amber-900">
            You are in {inApp}&rsquo;s built-in browser
          </p>
          <p className="mt-1 text-sm text-amber-900">
            It cannot install apps. Only Safari can, so open this page in Safari
            and the option appears.
          </p>
          <OpenInSafari from={inApp} />
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-900/70">
            Or do it by hand
          </p>
          <ol className="mt-1 list-decimal space-y-1.5 pl-5 text-sm text-amber-900">
            <li>Tap the <strong>•••</strong> menu, usually top right.</li>
            <li>Choose <strong>Open in Safari</strong>, or <strong>Open in browser</strong>.</li>
            <li>In Safari, tap <strong>Share</strong> {shareWhere.replace(/^at /, '')}, then <strong>Add to Home Screen</strong>.</li>
          </ol>
        </div>
      ) : wrongBrowser ? (
        // A REAL BROWSER, AND STILL THE WRONG ONE. Chrome, Firefox, Edge and
        // Opera on iOS all run Safari's engine underneath and still cannot add
        // to the home screen, because Apple grants that to Safari alone. The
        // reported bug was people switching from Chrome to Safari and finding
        // it "still not working" -- they had switched by opening Safari and
        // typing the address, which loses the invitation link they were on.
        <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <p className="font-semibold text-amber-900">
            {wrongBrowser} on an iPhone cannot install apps
          </p>
          <p className="mt-1 text-sm text-amber-900">
            Apple allows only Safari to do it. The button below carries this
            exact page across, so nothing is lost on the way.
          </p>
          <OpenInSafari from={wrongBrowser} />
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-900/70">
            Or do it by hand
          </p>
          <ol className="mt-1 list-decimal space-y-1.5 pl-5 text-sm text-amber-900">
            <li>Tap the <strong>•••</strong> menu in {wrongBrowser}.</li>
            <li>Choose <strong>Open in Safari</strong>.</li>
            <li>In Safari, tap <strong>Share</strong> {shareWhere.replace(/^at /, '')}, then <strong>Add to Home Screen</strong>.</li>
          </ol>
        </div>
      ) : deferred ? (
        <Button
          variant="gold"
          className="mt-4"
          onClick={async () => {
            await deferred.prompt();
            const { outcome } = await deferred.userChoice;
            if (outcome === 'accepted') setInstalled(true);
            setDeferred(null);
          }}
        >
          {addLabel(kind)}
        </Button>
      ) : (
        <>
          <Button variant="ghost" className="mt-4" onClick={() => setSteps((v) => !v)}>
            {steps ? 'Hide the steps' : 'Show me how'}
          </Button>
          {steps && <InstallSteps platform={platform ?? 'other'} />}
        </>
      )}
    </Card>
  );
}
