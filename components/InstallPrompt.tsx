'use client';

import { onCanonicalHost } from '@/lib/canonical';
import { useDemo } from '@/lib/demo/store';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { copyText } from '@/lib/share';
import { appleKind, addTitle, addLabel, type AppleKind } from '@/lib/apple-install';
import { APP_SHORT_NAME } from '@/lib/brand';

// "Install Hope Beacon": a card in the corner on a computer, a bar at the
// bottom on a phone or tablet. Safari (iOS and macOS) never fires
// beforeinstallprompt, so Apple devices get the steps for their own menu.
// Dismissing snoozes the prompt; it is not permanent.

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SNOOZE_KEY = 'beacon-install-snoozed-until';
// "Not now" snoozes for an hour. "I already have it installed" is permanent.
const SNOOZE_MINUTES = 60;

/**
 * Already installed? Exported because installing must also be findable in
 * Settings: Chrome fires its prompt only sometimes, and Firefox never does.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * Whether the app is installed, kept current: listens for the display-mode
 * query, `appinstalled`, and the page becoming visible again. A Safari tab on
 * iOS cannot know about a home-screen copy, hence "I already have it installed".
 */
export function useIsInstalled(): boolean {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const check = () => setInstalled(isStandalone());
    check();

    const mq = window.matchMedia('(display-mode: standalone)');
    // addListener for Safari before 14, which lacks addEventListener on MediaQueryList.
    const onMq = () => check();
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else mq.addListener?.(onMq);

    window.addEventListener('appinstalled', check);
    document.addEventListener('visibilitychange', check);

    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onMq);
      else mq.removeListener?.(onMq);
      window.removeEventListener('appinstalled', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  return installed;
}

// Only the app's home address may be installed. Each deployment URL is its
// own app to the browser, and an install from one would be frozen at that
// build forever. Silent on purpose: no warning banner, simply no offer.
export function isInstallable(): boolean {
  return onCanonicalHost();
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ reports itself as a Mac; the touch points give it away.
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
}

/**
 * The browser name when this is an iPhone or iPad and not Safari, else ''.
 * Only Safari can install a web app on iOS. Checked in this order because
 * each of these keeps "Safari" in its user agent.
 */
export function iosBrowser(): string {
  if (typeof navigator === 'undefined') return '';
  if (!isIos()) return '';
  const ua = navigator.userAgent;
  if (/CriOS/i.test(ua)) return 'Chrome';
  if (/FxiOS/i.test(ua)) return 'Firefox';
  if (/EdgiOS/i.test(ua)) return 'Edge';
  if (/OPiOS|OPT\//i.test(ua)) return 'Opera';
  return '';
}

export function isMacSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return (
    /Macintosh/.test(ua) &&
    /Safari/.test(ua) &&
    !/Chrome|Chromium|Edg\//.test(ua) &&
    navigator.maxTouchPoints <= 1
  );
}

/**
 * The app's name when this is an in-app browser (Messenger, Instagram...),
 * else ''. These cannot install anything, so the person must be told to leave.
 */
export function inAppBrowser(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  // Messenger before Facebook, so the name is the accurate one.
  if (/FB_IAB\/MESSENGER|Messenger[/ ]/i.test(ua)) return 'Messenger';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/\bLine\//i.test(ua)) return 'LINE';
  if (/Twitter/i.test(ua)) return 'X';
  if (/BytedanceWebview|musical_ly|TikTok/i.test(ua)) return 'TikTok';
  if (/WhatsApp/i.test(ua)) return 'WhatsApp';
  if (/\bWeChat|MicroMessenger/i.test(ua)) return 'WeChat';
  if (/LinkedInApp/i.test(ua)) return 'LinkedIn';
  return '';
}

/** Where iOS keeps the Share button: the bottom on iPhone, the top on iPad. */
export function iosShareLocation(): string {
  if (typeof navigator === 'undefined') return 'in Safari';
  const bigScreen =
    /ipad/i.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ||
    Math.min(window.screen.width, window.screen.height) >= 768;
  return bigScreen ? 'at the top of Safari' : 'at the bottom of Safari';
}

/**
 * A link that opens this page in Safari (`x-safari-https://`), from an iOS
 * browser that cannot install. Undocumented and not always honoured, so the
 * written steps always stay on screen. Returns '' anywhere that is not iOS.
 */
export function safariHandoffUrl(): string {
  if (typeof window === 'undefined') return '';
  if (!isIos()) return '';
  return `x-safari-${window.location.href}`;
}

/** One tap to Safari, with a copy fallback. `from` names the browser they are in. */
export function OpenInSafari({ from }: { from: string }) {
  const [href, setHref] = useState('');
  const [copied, setCopied] = useState<'' | 'yes' | 'failed'>('');
  const [tapped, setTapped] = useState(false);

  // Read the address after mount and on every navigation (this is a
  // single-page app), so the handoff opens the current page.
  const pathname = usePathname();
  useEffect(() => { setHref(safariHandoffUrl()); }, [pathname]);

  // copyText from lib/share.ts, not navigator.clipboard directly (Safari and
  // plain http fail differently).
  const copy = async () => {
    setCopied((await copyText(window.location.href)) ? 'yes' : 'failed');
  };

  if (!href) return null;

  return (
    <div className="mt-2 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
      <p className="text-sm font-bold text-amber-900">
        {from} cannot install apps. Safari can.
      </p>
      <a
        href={href}
        onClick={() => setTapped(true)}
        className="tap mt-2 flex w-full items-center justify-center rounded-xl px-4 text-base font-bold text-white"
        style={{ backgroundColor: '#1E2A4A' }}
      >
        Open this page in Safari
      </a>
      <button
        type="button"
        onClick={() => void copy()}
        className="mt-1.5 w-full rounded-xl py-2 text-xs font-semibold text-amber-900"
      >
        {copied === 'yes' ? '✓ Link copied. Paste it into Safari.'
          : copied === 'failed' ? 'Could not copy. Use the address bar above.'
          : 'Or copy the link and paste it into Safari'}
      </button>
      {tapped && (
        <p className="mt-1 text-xs text-amber-800">
          If Safari did not open, use the steps below instead.
        </p>
      )}
    </div>
  );
}

function isDesktop(): boolean {
  if (typeof window === 'undefined') return false;
  // A fine pointer (mouse or trackpad) at 768px or wider gets the floating card.
  // Touch devices get the bar, which reserves its own space so it never covers
  // something that needs a tap.
  return window.matchMedia('(min-width: 768px)').matches
    && window.matchMedia('(pointer: fine)').matches;
}

function snoozed(): boolean {
  try {
    const until = Number(localStorage.getItem(SNOOZE_KEY) ?? 0);
    return Date.now() < until;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  // Out of the way while the tutorial runs. Both live in the bottom-right
  // corner, so the card lands on top of the step panel at exactly the moment
  // someone is being asked to follow instructions.
  const { tutorialActive } = useDemo();
  // Live, so the prompt disappears the moment the app is installed.
  const installed = useIsInstalled();
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [manual, setManual] = useState<'ios' | 'mac' | null>(null);
  const [desktop, setDesktop] = useState(false);
  // The in-app browser's name, or '' for a real browser.
  const [inApp, setInApp] = useState('');
  const [shareWhere, setShareWhere] = useState('in Safari');
  // An iPhone browser that is not Safari, and so cannot install.
  const [wrongBrowser, setWrongBrowser] = useState('');
  // On Apple, "Install now" cannot install; it shows which controls to press.
  const [opened, setOpened] = useState(false);
  // Which Apple device: iPhone, iPad and Mac each word their menu differently.
  const [kind, setKind] = useState<AppleKind>(null);

  useEffect(() => {
    if (isStandalone()) return;
    if (!isInstallable()) return; // a preview must never become a second icon
    if (snoozed()) return;

    setDesktop(isDesktop());
    setKind(appleKind());
    setInApp(inAppBrowser());
    setShareWhere(iosShareLocation());
    setWrongBrowser(iosBrowser());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);

    const onInstalled = () => {
      setShow(false);
      setDeferred(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    // Safari never fires beforeinstallprompt, so show the steps after a short
    // delay that lets the page finish painting.
    let t: ReturnType<typeof setTimeout>;
    const APPEAR_MS = 350;
    if (isIos()) {
      t = setTimeout(() => { setManual('ios'); setShow(true); }, APPEAR_MS);
    } else if (isMacSafari()) {
      t = setTimeout(() => { setManual('mac'); setShow(true); }, APPEAR_MS);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      clearTimeout(t);
    };
  }, []);

  // Permanent, unlike the snooze: the person says they already have it.
  const alreadyHave = () => {
    setShow(false);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + 3650 * 24 * 60 * 60 * 1000));
    } catch {}
  };

  const snooze = () => {
    setShow(false);
    try {
      localStorage.setItem(
        SNOOZE_KEY,
        String(Date.now() + SNOOZE_MINUTES * 60 * 1000),
      );
    } catch {}
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    setShow(false);
    // "Not now" in the browser's own dialog snoozes too.
    if (outcome === 'dismissed') snooze();
  };

  // The bar is position: fixed and can be half a phone's height, so it
  // publishes its height as --install-bar; globals.css pads the page by that
  // much. Cleared on unmount.
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = barRef.current;
    const root = document.documentElement;
    if (!el) {
      root.style.removeProperty('--install-bar');
      return;
    }
    const publish = () =>
      root.style.setProperty(
        '--install-bar',
        `${Math.ceil(el.getBoundingClientRect().height)}px`,
      );
    publish();
    // The bar grows when the steps open, so keep measuring.
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.removeProperty('--install-bar');
    };
  });

  // `installed` is checked here rather than only in the effect, so the card
  // disappears the moment the app is installed instead of at the next reload.
  if (!show || tutorialActive || installed) return null;

  // In an in-app browser, or an iOS browser other than Safari, the first step
  // is to leave it: only Safari can install on iOS.
  const steps = inApp
    ? [
        `Tap the ••• menu at the top of ${inApp}`,
        'Choose “Open in Safari”, or “Open in browser”',
        'Then tap Share, and “Add to Home Screen”',
      ]
    : wrongBrowser
      ? [
          `Tap the ••• menu in ${wrongBrowser}`,
          'Choose “Open in Safari”',
          'Then tap Share, and “Add to Home Screen”',
        ]
      : manual === 'mac'
        ? ['In the menu bar, choose File', 'Choose “Add to Dock”']
        : [`Tap Share ${shareWhere}`, 'Choose “Add to Home Screen”'];

  // Desktop: a proper card, bottom-right, impossible to read as a cookie bar.
  if (desktop) {
    return (
      <div
        data-install-prompt="card"
        data-steps-aside-for-chat
        className="no-print safe-bottom fixed bottom-4 right-4 z-[66] w-[22rem] max-w-[calc(100vw-2rem)]"
      >
        <div className="animate-drop overflow-hidden rounded-2xl bg-white lift-3 ring-1 ring-black/10">
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ backgroundColor: '#1E2A4A' }}
          >
            <SentryBeaconMark size={40} />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-white">{addTitle(kind, APP_SHORT_NAME)}</p>
              <p className="text-xs text-white/60">
                {inApp
                  ? `Open in Safari first. ${inApp} cannot install apps`
                  : wrongBrowser
                  ? `Open in Safari first. ${wrongBrowser} on iPhone cannot install apps`
                  : manual ? 'Two steps, no app store' : 'One click, no app store'}
              </p>
            </div>
            <button
              onClick={snooze}
              aria-label="Not now"
              className="tap-sm shrink-0 rounded-lg px-2 text-lg text-white/60 hover:text-white"
            >
              ×
            </button>
          </div>

          <div className="space-y-3 p-4">
            <ul className="space-y-1.5 text-sm text-gray-600">
              <li className="flex gap-2">
                <span aria-hidden>⚡</span> Opens in its own window, no tabs
              </li>
              <li className="flex gap-2">
                <span aria-hidden>📶</span> Keeps working without a signal
              </li>
              <li className="flex gap-2">
                <span aria-hidden>🔔</span> Alerts on your desktop
              </li>
            </ul>

            {manual || inApp || wrongBrowser ? (
              <>
                {(inApp || wrongBrowser) && <OpenInSafari from={inApp || wrongBrowser} />}
                {/* On Apple, this button shows the controls to press; it cannot install. */}
                <button
                  onClick={() => setOpened(true)}
                  className="tap w-full rounded-xl text-base font-bold text-white"
                  style={{ backgroundColor: '#1E2A4A' }}
                >
                  {addLabel(kind)}
                </button>
                {/* The steps are never hidden behind the button (tests/e2e/in-app-browser.js). */}
                <ol className="space-y-1.5 rounded-xl bg-gray-50 p-3 text-sm text-navy">
                  {steps.map((step, i) => (
                    <li key={step} className="flex gap-2">
                      <span
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                        style={{ backgroundColor: '#1E2A4A' }}
                      >
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
                {opened && (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
                    {inApp
                      ? `Open the ••• menu in ${inApp} now, and choose Open in Safari.`
                      : manual === 'mac'
                        ? 'Now open the File menu, in the menu bar at the top of the screen.'
                        : `Now look for the Share button ${shareWhere.replace(/^at /, 'at ')}.`}
                  </p>
                )}
              </>
            ) : (
              <button
                onClick={install}
                className="tap w-full rounded-xl text-base font-bold text-white"
                style={{ backgroundColor: '#1E2A4A' }}
              >
                Install {APP_SHORT_NAME}
              </button>
            )}
            <button
              onClick={alreadyHave}
              className="w-full rounded-xl py-2 text-sm font-semibold text-gray-500 hover:text-gray-600"
            >
              I already have Beacon installed
            </button>
            <p className="text-xs leading-snug text-gray-500">
              Already have the icon and still seeing this? It probably came from
              a preview address, which the browser treats as a separate app.
              Settings shows which one you are in.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Phone and tablet: the bar. It always has a button. z-66 sits above the
  // demo ribbon (65) and below dialogs (70) and sheets (80), so it can never
  // block a question. It sits above the bottom bar, which stays usable.
  return (
    <div
      ref={barRef}
      data-install-prompt="bar"
      data-steps-aside-for-chat
      className="no-print safe-bottom fixed inset-x-0 bottom-0 z-[66] flex justify-center p-3"
    >
      {/* Capped at half the height above the bottom bar, with the steps scrolling
         inside, so a phone on its side keeps room for the page. The steps are
         never hidden behind the button (tests/e2e/in-app-browser.js). */}
      <div className="install-bar-ceiling animate-drop flex w-full max-w-md flex-col overflow-y-auto overscroll-contain rounded-2xl bg-white p-3 lift-3 ring-1 ring-black/10">
        <div className="flex items-center gap-3">
          <SentryBeaconMark size={40} />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-navy">{addTitle(kind, APP_SHORT_NAME)}</p>
            {inApp ? (
              <p className="text-sm text-gray-500">
                {inApp} cannot install apps. Open it in Safari first.
              </p>
            ) : manual === 'mac' ? (
              <p className="text-sm text-gray-500">Two steps, no app store.</p>
            ) : manual ? (
              <p className="text-sm text-gray-500">Two taps, no app store.</p>
            ) : (
              <p className="text-sm text-gray-500">
                Add it to your device. No app store needed.
              </p>
            )}
          </div>
          <button
            onClick={snooze}
            aria-label="Not now"
            className="tap shrink-0 rounded-xl bg-gray-100 px-3 text-lg text-gray-500"
          >
            ×
          </button>
        </div>

        {/* Full width and under the text, so it is easy to tap on a small screen. */}
        {manual || inApp ? (
          <>
            <button
              onClick={() => setOpened(true)}
              className="tap mt-2 w-full rounded-xl text-base font-bold text-white"
              style={{ backgroundColor: '#1E2A4A' }}
            >
              {addLabel(kind)}
            </button>
            {/* Never hidden behind the button: someone in Messenger must be told to leave
               it without pressing anything (tests/e2e/in-app-browser.js). */}
            {(inApp || wrongBrowser) && <OpenInSafari from={inApp || wrongBrowser} />}
            <ol className="mt-2 space-y-1.5 rounded-xl bg-gray-50 p-3 text-sm text-navy">
              {steps.map((step, i) => (
                <li key={step} className="flex gap-2">
                  <span
                    className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: '#1E2A4A' }}
                  >
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            {opened && (
              // The control is in the browser's own toolbar, not on the page.
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900 ring-1 ring-amber-200">
                {inApp
                  ? `Open the ••• menu in ${inApp} now, and choose Open in Safari.`
                  : manual === 'mac'
                    ? 'Now open the File menu, in the menu bar at the top of the screen.'
                    : `Now look for the Share button ${shareWhere.replace(/^at /, 'at ')}. It is the square with an arrow coming out of it.`}
              </p>
            )}
            <button
              onClick={alreadyHave}
              className="mt-1 w-full rounded-xl py-2 text-xs font-semibold text-gray-500"
            >
              I already have it installed
            </button>
          </>
        ) : (
          <button
            onClick={install}
            className="tap mt-2 w-full rounded-xl text-base font-bold text-white"
            style={{ backgroundColor: '#1E2A4A' }}
          >
            Install
          </button>
        )}
      </div>
    </div>
  );
}
