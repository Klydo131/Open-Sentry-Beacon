'use client';

import { onCanonicalHost } from '@/lib/canonical';
import { useDemo } from '@/lib/demo/store';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { copyText } from '@/lib/share';
import { appleKind, addTitle, addLabel, type AppleKind } from '@/lib/apple-install';
import { APP_SHORT_NAME } from '@/lib/brand';

// -------------------------------------------------------------------------
// "Install Hope Beacon".
//
// The old version was a thin bar at the bottom of the screen with a small
// button, and on a desktop monitor that is the easiest thing in the world to
// miss — it reads as a cookie notice, which everybody has trained themselves
// to ignore. On a Mac it never appeared at all: Safari does not fire
// `beforeinstallprompt`, and the code only handled iPhones and iPads.
//
// Now:
//  • Desktop gets a real card in the corner — icon, what installing gets you,
//    and a full-size button. It is hard to mistake for chrome.
//  • macOS Safari gets the "Add to Dock" steps; iOS gets "Add to Home Screen".
//  • Dismiss is a SNOOZE, not a tombstone. Seven days later it asks once more.
//    The old version wrote a permanent flag, so one stray tap meant the person
//    was never offered the install again on that device.
// -------------------------------------------------------------------------

interface BIPEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SNOOZE_KEY = 'beacon-install-snoozed-until';
// AN HOUR. It was seven days, then two, and both were too long.
//
// An uninstalled app is a person who loses their place every time they close
// the tab, misses every notification, and has nothing on their home screen to
// come back to. The prompt is the only thing standing between them and that,
// so "not right now" should mean this hour, not this fortnight.
//
// An hour is short enough that somebody who wanted the app gets asked again the
// same day, and long enough that it is not arguing with them. Anyone who truly
// does not want it presses "I already have it installed", which is one tap,
// permanent, and deliberately sits right under the button.
const SNOOZE_MINUTES = 60;

/**
 * Already installed?
 *
 * Exported because the automatic prompt is not enough on its own. Chrome fires
 * beforeinstallprompt only when its own engagement heuristics are satisfied,
 * Firefox never fires it at all, and once somebody snoozes, nothing offers it
 * again for days. So installing also has to be something a person can go and
 * find — see InstallCard.
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
 * Is the app installed, checked continuously rather than once.
 *
 * WHY A HOOK AND NOT JUST isStandalone(). The old code asked once, on mount,
 * and never again. Two things go wrong with that:
 *
 *   * Somebody installs while the tab is open. On Android that happens inside
 *     the page, and the prompt they just obeyed carried on sitting there
 *     telling them to install.
 *   * Somebody leaves for the installed copy and comes back to the tab. The
 *     answer may have changed while the page was hidden, and nothing rechecked.
 *
 * So this listens to the three signals that can change it: the display-mode
 * media query flipping, the browser's own `appinstalled` event, and the page
 * becoming visible again.
 *
 * NOT COVERED, and it cannot be: on iOS there is no way for a Safari TAB to
 * know that a copy exists on the home screen. The two contexts are sealed off
 * from each other, `getInstalledRelatedApps` is Chromium-only, and Apple
 * exposes nothing equivalent. That is exactly why "I already have it
 * installed" exists and is one tap: on the one platform where the app cannot
 * work this out, the person can say so.
 */
export function useIsInstalled(): boolean {
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const check = () => setInstalled(isStandalone());
    check();

    const mq = window.matchMedia('(display-mode: standalone)');
    // Safari only grew addEventListener on MediaQueryList in 14; addListener is
    // deprecated everywhere else but is what older iOS has.
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

// Only the app's home address may be installed.
//
// Hosts give every deployment its own permanent URL, production builds
// included, and a different hostname is a different app to the browser: its own
// icon, its own service worker, its own storage. Installing from one of those
// pins the person to that single build forever, because no later deploy can ever
// reach that origin. Somebody with Beacon already installed opened a deployment
// address, was offered the install again, accepted, and ended up with two
// identical icons, one of them frozen.
//
// The first version of this checked the environment LABEL for 'preview', which
// missed the case entirely: a per-deployment URL of a production build reports
// 'production', because that is what it is. Only the hostname settles it.
//
// This is the whole protection now, and it is deliberately silent. A banner
// across the front door announcing that the address is wrong reads to a visitor
// like a security warning about the site itself, which is worse than the problem
// it describes. Simply not offering the install prevents the frozen copy from
// ever existing; Settings explains the situation to anyone who goes looking.
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
 * Which browser this is, when it is an iPhone or iPad and NOT Safari.
 *
 * THE REPORT THIS EXISTS FOR: "even in Chrome the install button is not
 * working, and even if they switch to Safari it is not working."
 *
 * On iOS, only Safari can add a real app to the home screen. Chrome, Firefox,
 * Edge and Opera on iPhone are all WebKit underneath, but Apple gives none of
 * them the Add to Home Screen that produces a standalone app -- at best they
 * make a bookmark that reopens in that browser. So the steps printed to a
 * Chrome user said "Tap Share at the bottom of Safari", naming a browser they
 * were not in, about a control that would not have worked there anyway.
 *
 * Empty string means Safari, or not iOS at all, and the ordinary steps apply.
 *
 * Checked in this order because each of these browsers keeps "Safari" and
 * "Version/" in its user agent for compatibility -- testing for Safari first
 * would match all of them.
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
 * Is this an app's own built-in browser rather than a real one?
 *
 * THE BUG THIS EXISTS FOR, reported with screenshots. A church shared the link
 * in Messenger. Tapping it opens Messenger's OWN web view — which reports
 * itself as an iPhone or iPad, is not standalone, and is on the right host, so
 * every check here said "offer the install" and the card printed "Tap Share at
 * the bottom of Safari, choose Add to Home Screen".
 *
 * There is no Safari. Messenger's share sheet has no Add to Home Screen, and on
 * iOS no in-app browser can install anything at all — only Safari can. So Apple
 * users were handed a set of steps that cannot be carried out, with no hint
 * that the problem was the browser they were in. They concluded the app was
 * broken, which from where they were sitting it was.
 *
 * Returns the app's name so the instructions can say which one to leave, since
 * "open this in your real browser" means nothing to somebody who does not know
 * they are not in one.
 */
export function inAppBrowser(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  // FBAN/FBAV are Facebook's own markers; Messenger adds FB_IAB and
  // Messenger/. Checked before Facebook so the name is the accurate one.
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

/**
 * Where iOS keeps the Share button, which is not the same place on both.
 *
 * The old copy said "at the bottom of Safari" everywhere. On an iPad it is at
 * the TOP, in the toolbar — and a non-technical person told to look at the
 * bottom looks at the bottom, does not find it, and stops.
 */
export function iosShareLocation(): string {
  if (typeof navigator === 'undefined') return 'in Safari';
  const bigScreen =
    /ipad/i.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1) ||
    Math.min(window.screen.width, window.screen.height) >= 768;
  return bigScreen ? 'at the top of Safari' : 'at the bottom of Safari';
}

/**
 * A link that opens THIS page in Safari, from a browser that cannot install.
 *
 * WHY THIS IS THE BEST AVAILABLE ANSWER ON APPLE.
 *
 * Only Safari may add an app to the iPhone home screen. That is Apple's rule,
 * it applies to every website equally, and no amount of code changes it. What
 * IS in our hands is the distance between "you are in the wrong browser" and
 * "you are in Safari", and until now that distance was three instructions
 * about a ••• menu whose position differs in every app that has one.
 *
 * iOS understands a URL beginning `x-safari-https://` as "open the rest of
 * this in Safari". Chrome, Firefox, Edge and most in-app browsers hand it to
 * the system, which opens Safari on the same page. One tap instead of three
 * steps, and no menu to find.
 *
 * IT IS OFFERED, NEVER RELIED ON. The scheme is not documented by Apple, some
 * in-app browsers refuse to hand off at all, and nothing reports a refusal:
 * the tap simply does nothing. So the written steps stay on screen underneath
 * it, always, and the copy button is there for the person whose browser
 * refuses both. A tap that does nothing costs a second; a tap that replaces
 * the instructions and then does nothing costs the install.
 *
 * RETURNS '' ANYWHERE THAT IS NOT iOS, and that is not a detail. Messenger and
 * Instagram have in-app browsers on Android too, and they cannot install either
 * -- but the answer there is Chrome, which CAN, and telling an Android user to
 * open Safari names a browser that does not exist on their phone. The iOS test
 * is what keeps this advice attached to the platform it is true on.
 */
export function safariHandoffUrl(): string {
  if (typeof window === 'undefined') return '';
  if (!isIos()) return '';
  return `x-safari-${window.location.href}`;
}

/**
 * One tap to Safari, with a copy fallback and no promise it worked.
 *
 * `from` names the browser they are in, because "open in Safari" means nothing
 * to somebody who does not know they are not in Safari.
 */
export function OpenInSafari({ from }: { from: string }) {
  const [href, setHref] = useState('');
  const [copied, setCopied] = useState<'' | 'yes' | 'failed'>('');
  const [tapped, setTapped] = useState(false);

  // Read the address after mount. On the server there is no location, and a
  // link rendered empty and filled in later is better than one that differs
  // between the server's HTML and the browser's.
  //
  // AND READ IT AGAIN ON EVERY NAVIGATION. This was `[]`, so the address was
  // captured once and never revisited — and this is a single-page app, so the
  // page under it changes without a reload. Somebody who arrived on one screen
  // and walked to another was handed off to the screen they arrived on.
  //
  // The WebKit walk caught it on the shortest possible journey: `/settings`
  // sends a signed-out visitor to `/login`, and the link still said
  // `/settings`. The same staleness lands on the case that matters most —
  // somebody opening an invitation in Chrome on an iPhone, where being sent to
  // the wrong page means being sent away from their invitation.
  const pathname = usePathname();
  useEffect(() => { setHref(safariHandoffUrl()); }, [pathname]);

  // copyText, not navigator.clipboard. Safari refuses the write when the
  // document is not focused and the API does not exist at all over plain http;
  // lib/share.ts owns those two failures in one place, and a security check
  // fails the build if this reaches for the raw API instead.
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
  // WIDTH ALONE IS NOT A DESKTOP, and believing it was put a floating card on
  // top of things people had to tap.
  //
  // The two layouts are not decoration. The bar along the bottom MEASURES
  // ITSELF and publishes its height as `--install-bar`, which globals.css
  // spends as padding, so the page can always be scrolled clear of it. The
  // desktop card floats at bottom-right and reserves nothing, which is
  // tolerable over a wide window with margins either side and is not tolerable
  // over a tablet held upright.
  //
  // An iPad Mini in portrait is exactly 768 CSS pixels, and a phone on its side
  // is wider still, so both were handed the floating card. On a real iPad in
  // Safari it came to rest on a Guide's Explorer row and swallowed the tap;
  // CI reported it as two failing walks, with Playwright naming the install
  // steps list as the element that received the touch.
  //
  // A pointer that can be placed precisely is what actually distinguishes the
  // two: a mouse or a trackpad reports `fine`, a finger reports `coarse`. A Mac
  // keeps its card, an iPad and a sideways phone get the bar that makes room
  // for itself. Where the query is not understood at all the answer is false,
  // which is the safe side of this.
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
  // Live, not once. Installing on Android happens inside this page, and the
  // prompt used to carry on sitting there after the person had obeyed it.
  const installed = useIsInstalled();
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [manual, setManual] = useState<'ios' | 'mac' | null>(null);
  const [desktop, setDesktop] = useState(false);
  // Which app's built-in browser we are trapped in, if any. Empty means a real
  // browser and the ordinary instructions apply.
  const [inApp, setInApp] = useState('');
  const [shareWhere, setShareWhere] = useState('in Safari');
  // An iPhone browser that is not Safari, and therefore cannot install at all.
  const [wrongBrowser, setWrongBrowser] = useState('');
  // Apple has no programmatic install, so "Install now" cannot install. What it
  // CAN do is show exactly which control to press, which is the thing people
  // were failing to find. The button is real and doing this is its job.
  const [opened, setOpened] = useState(false);
  // WHICH APPLE DEVICE, because they are three and not one. `manual` says
  // whether Safari is doing this by hand; this says whose menu wording to use,
  // and none of the three contains the word Install.
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

    // Safari — desktop or mobile — never fires beforeinstallprompt, so the
    // only honest thing to do is show the steps. A short delay keeps it from
    // landing on top of the page before it has finished painting.
    // Short, and it used to be 1200ms. The only job of the delay is to let the
    // page finish painting so the card does not land on top of a half-drawn
    // screen; anything longer is the app hiding the one thing an Apple user
    // needs from it. There is no native prompt coming to replace it.
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

  // Separate from the snooze on purpose. Snooze means "not right now"; this
  // means "you are wrong, I already have it", and asking again in a week would
  // be the app arguing with someone about their own machine. It is also the
  // honest answer to the confusing case: the browser only knows about installs
  // on THIS address, so a copy installed from a preview link is invisible to it
  // and it offers the install again in good faith.
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
    // "Not now" in the browser's own dialog is still a no — respect it for a
    // week rather than asking again on the next page load.
    if (outcome === 'dismissed') snooze();
  };

  // RESERVE THE GROUND THIS BAR STANDS ON.
  //
  // The bar is `position: fixed`, so it draws over the bottom of the page and
  // the document has no idea it is there. On an iPhone it is not a thin strip:
  // measured on a 664px screen it is 323px tall — HALF THE PHONE — because it
  // carries the two install steps as well as the button. Everything in the
  // bottom half of every screen was underneath it.
  //
  // Three separate WebKit walks failed on this and none of them could fail
  // here, which is the part worth remembering. The bar is shown by UA sniffing
  // (isIos), and headless Chromium is not an iPhone, so the whole class of bug
  // is invisible to the local suite by construction. It took an iPhone user
  // agent to reproduce it in this sandbox at all.
  //
  // Publishing the height as a custom property, and spending it as padding on
  // the body plus scroll-padding on the root, fixes both halves: the page can
  // always scroll far enough to lift anything clear, and anything scrolled to
  // lands above the bar rather than beneath it. Cleared on unmount, so a
  // dismissed bar does not leave a strip of dead space behind it.
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
    // The bar grows when the steps open, so a one-off measurement would be
    // right until the moment somebody presses the button.
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

  // IN AN APP'S OWN BROWSER, THE ONLY HONEST FIRST STEP IS TO LEAVE IT.
  //
  // On iOS nothing but Safari can add an app to the home screen. Printing the
  // Safari steps to somebody sitting in Messenger sends them looking for a
  // button that is not there — which is exactly what was reported.
  //
  // A REAL BROWSER THAT IS STILL THE WRONG ONE gets the same shape of answer.
  // Chrome, Firefox, Edge and Opera on iOS cannot install an app either -- Apple
  // allows only Safari to -- so naming Safari's Share button to somebody sitting
  // in Chrome is the same failure as naming it to somebody sitting in Messenger.
  // The first step has to be leaving.
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
                {/* A REAL BUTTON ON APPLE. Safari has never fired
                    beforeinstallprompt, so nothing here can install for the
                    person. Pressing this shows the two controls to press, in
                    order, which is what they were failing to find. It is
                    labelled for what it starts, not for what it cannot do. */}
                <button
                  onClick={() => setOpened(true)}
                  className="tap w-full rounded-xl text-base font-bold text-white"
                  style={{ backgroundColor: '#1E2A4A' }}
                >
                  {addLabel(kind)}
                </button>
                {/* Never hidden behind the button. See the phone layout below
                    for why: in-app-browser.js enforces it. */}
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
              className="w-full rounded-xl py-2 text-sm font-semibold text-gray-400 hover:text-gray-600"
            >
              I already have Beacon installed
            </button>
            {/* This used to open "Seeing this when you already have the icon
                usually means…", which tells a first-time visitor they have
                already installed something they have not. Said the other way
                round it is a note for the person it applies to and invisible
                noise to everybody else. */}
            <p className="text-xs leading-snug text-gray-400">
              Already have the icon and still seeing this? It probably came from
              a preview address, which the browser treats as a separate app.
              Settings shows which one you are in.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Phone / tablet: the compact bar, which is right for a small screen.
  //
  // THE BUG THIS LAYOUT HAD, reported plainly as "the banner is there but there
  // is no install button". The button was written as
  // `{!manual && !inApp && <button>Install</button>}`, so it rendered for
  // Chrome and Android and for nobody else. Every iPhone, iPad and Mac Safari
  // user got a banner made entirely of text, telling them to go and find a
  // control somewhere else on their screen. The one device family that cannot
  // install by itself was the one family given nothing to press.
  //
  // Now there is always a button. On Apple it cannot install -- nothing can, the
  // API does not exist there -- so what it does is show the two controls to
  // press, in order, right where the person is already looking.
  //
  // z-66, AND THE EXACT NUMBER MATTERS. The layers here are: the demo and
  // preview ribbon at 65, blocking notices and the consent dialog at 70,
  // sheets at 80. This has to clear the ribbon, which is pointer-events-none
  // and never stole a tap but drew straight over "I already have it
  // installed", while staying under everything that is asking a question.
  //
  // It sat at 70 for one commit and broke the blog walk: level with the
  // consent dialog, it covered the "I understand" button, so consent was never
  // dismissed and every later click was swallowed by the overlay. An install
  // prompt must never be able to block a dialog the person has to answer.
  //
  // ON TOP OF THE BOTTOM BAR, like every other floating thing (30 September
  // 2026), so Menu, People and My Files can still be pressed while it is up.
  // It was tried standing IN FRONT of the bar instead, covering it, and the
  // full gate showed what that costs: the Menu could not be reached until the
  // prompt was dismissed, which the old header row never did to anybody. The
  // room it needs comes from its ceiling instead (`.install-bar-ceiling`,
  // below): half of what is left ABOVE the bottom bar, not half the screen.
  return (
    <div
      ref={barRef}
      data-install-prompt="bar"
      className="no-print safe-bottom fixed inset-x-0 bottom-0 z-[66] flex justify-center p-3"
    >
      {/* A CEILING, BECAUSE THE BAR RESERVES WHATEVER IT IS TALL.
          This bar carries the steps as well as the button, and it publishes its
          height so the page can pad itself clear. On a phone held upright that
          is a fair trade. On the same phone turned sideways the viewport is
          412px and the bar is 344 of them: the page keeps 68px, the row you
          were reaching for is pushed under the bar, and the tap lands on the
          bar instead. Sending a tablet here to escape the floating card is what
          exposed it.

          Half the visible height, and the steps scroll inside what is left.
          Since the bottom bar: half of the height ABOVE the bar, because the
          bar is part of what the page has already given up.
          NOT collapsed behind the button: somebody who opened this from a
          Messenger link has to be told to leave Messenger without pressing
          anything, and tests/e2e/in-app-browser.js fails the build if that is
          ever gated again. Scrolling is not gating; the steps are still there
          and still on screen. */}
      <div className="install-bar-ceiling animate-drop flex w-full max-w-md flex-col overflow-y-auto overscroll-contain rounded-2xl bg-white p-3 lift-3 ring-1 ring-black/10">
        <div className="flex items-center gap-3">
          <SentryBeaconMark size={40} />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-navy">{addTitle(kind, APP_SHORT_NAME)}</p>
            {/* THE OTHER REPORTED BUG WAS THIS LINE. Opened from a Messenger
                link it said "Tap Share, then Add to Home Screen" — inside a
                browser that has neither. */}
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

        {/* Full width and under the text, because a button squeezed beside two
            lines of copy on a 320px screen is a button people miss. */}
        {manual || inApp ? (
          <>
            <button
              onClick={() => setOpened(true)}
              className="tap mt-2 w-full rounded-xl text-base font-bold text-white"
              style={{ backgroundColor: '#1E2A4A' }}
            >
              {addLabel(kind)}
            </button>
            {/* THE STEPS ARE NEVER HIDDEN BEHIND THE BUTTON, and that is a
                safety property rather than a preference. Somebody who opened
                this from a Messenger link has to be told to leave Messenger
                whether or not they press anything; a version that hid that
                behind a tap sent them looking for a Share button that does not
                exist in the browser they are in. tests/e2e/in-app-browser.js
                fails the build if this is ever gated again. */}
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
              // What "Install now" actually does, since nothing on Apple can
              // install programmatically: it points at the control, which is
              // in the browser's own chrome and not on the page at all. That
              // is the thing people were failing to find.
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
              className="mt-1 w-full rounded-xl py-2 text-xs font-semibold text-gray-400"
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
