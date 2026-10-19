'use client';

// How to install Hope Beacon, in whichever browser is actually in your hand.
//
// THE ASK: "I need all the installer in all browser please." The card had steps
// for four situations: Safari on iPhone, Safari on a Mac, Chrome on Android,
// and Chrome or Edge on a computer. Anybody in Samsung Internet, Opera, Brave,
// Firefox, Vivaldi or one of the smaller Chromium browsers was shown Chrome's
// menu, could not find it, and stopped. Samsung Internet alone is a large share
// of Android phones.
//
// WHY THIS IS A LIST YOU PICK FROM RATHER THAN A DETECTION.
//
// Sniffing the user agent gets the common browsers right and everything else
// wrong, silently. Two specific traps decided it:
//
//   * Brave does not put "Brave" in its user agent at all. It is detected, if
//     at all, by a `navigator.brave` object.
//   * Searching for "Hola" in a user agent matches `Le Hola`, which is a LeEco
//     PHONE MODEL and not a browser. A church member on that handset would have
//     been told they were in a browser they have never installed.
//
// So the browser in hand is a GUESS that opens the list at a sensible place,
// and the list is the feature. A person who knows what they are using can
// always pick it, including browsers nobody here has heard of.

import { useEffect, useState } from 'react';
import { APP_SHORT_NAME } from '@/lib/brand';
import { iosShareLocation } from '@/components/InstallPrompt';
import { KebabGlyph, MenuGlyph } from '@/components/Glyph';

export type Platform = 'auto' | 'iphone' | 'ipad' | 'mac' | 'other';

export interface InstallGuide {
  key: string;
  /** What the person calls it. */
  name: string;
  /** Which devices this entry is about. */
  on: string;
  steps: React.ReactNode[];
  note?: React.ReactNode;
}

// DRAWN, NOT TYPED, for the same reason the sign-out button is. `⋮` is a maths
// operator and `☰` is TRIGRAM FOR HEAVEN; neither is an emoji, so neither has a
// font promised behind it. A page of install instructions whose menu symbols are
// empty boxes is worse than no instructions: the reader believes they are
// looking at the wrong screen.
const menu = (glyph: string) => {
  const icon = glyph.includes('\u2630')
    ? <MenuGlyph size={16} className="-mb-0.5" />
    : <KebabGlyph size={16} className="-mb-0.5" />;
  return <strong className="whitespace-nowrap">{icon}</strong>;
};

/**
 * Every browser that can install this app, and what to press in each.
 *
 * WHERE THE UNCERTAINTY IS, said plainly rather than hidden in confident
 * wording: the exact menu wording moves between versions, and no one person
 * has all of these browsers to check. So each entry names the menu and the
 * words to look for, and the last entry is the honest catch-all for anything
 * not listed. "Look for Install" is a useful instruction; a wrong menu path
 * stated firmly is not.
 */
// SAID ONCE AND SHARED. An iPhone and an iPad differ in where the button is,
// not in this: Apple gives no other browser the Add to Home Screen that makes a
// real app, so every one of them is a dead end however confident it looks.
const APPLE_ONLY_SAFARI = (
  <>
    On an iPhone or iPad it MUST be Safari. Chrome, Firefox, Edge, Opera and
    Hola all run Safari&rsquo;s engine underneath on Apple devices and still
    cannot add anything to the Home Screen, because Apple allows only Safari
    to do it. This is not something the app can change.
  </>
);

export function installGuides(shareWhere = 'in Safari'): InstallGuide[] {
  return [
    {
      key: 'chrome',
      name: 'Chrome',
      on: 'Android, Windows, Mac, Linux, Chromebook',
      steps: [
        <>On a phone, tap the {menu('⋮')} menu at the top right, then <strong>Add to Home screen</strong>, then <strong>Install</strong>.</>,
        <>On a computer, look for the <strong>install icon</strong> at the right-hand end of the address bar. It is a small screen with a downward arrow.</>,
        <>If the icon is not there, open the {menu('⋮')} menu and look for <strong>Install {APP_SHORT_NAME}</strong>, sometimes under <em>Cast, save and share</em>.</>,
      ],
    },
    {
      key: 'edge',
      name: 'Microsoft Edge',
      on: 'Android, Windows, Mac',
      steps: [
        <>On a phone, tap the {menu('•••')} menu at the bottom, then <strong>Add to phone</strong> or <strong>Add to Home screen</strong>.</>,
        <>On a computer, look for the <strong>install icon</strong> in the address bar.</>,
        <>Or open the {menu('•••')} menu, choose <strong>Apps</strong>, then <strong>Install this site as an app</strong>.</>,
      ],
    },
    {
      key: 'samsung',
      name: 'Samsung Internet',
      on: 'Samsung phones and tablets',
      steps: [
        <>Tap the {menu('☰')} menu at the bottom right.</>,
        <>Choose <strong>Add page to</strong>.</>,
        <>Choose <strong>Home screen</strong>, then <strong>Add</strong>.</>,
      ],
      note: <>There is often a <strong>+</strong> or a download arrow in the address bar that does the same thing in one tap.</>,
    },
    {
      key: 'opera',
      name: 'Opera',
      on: 'Android, Windows, Mac',
      steps: [
        <>On a phone, tap the {menu('⋮')} or Opera menu, then look for <strong>Add to</strong> and choose <strong>Home screen</strong>.</>,
        <>On a computer, look for an <strong>install icon</strong> in the address bar, or an <strong>Install</strong> entry in the menu.</>,
      ],
    },
    {
      key: 'brave',
      name: 'Brave',
      on: 'Android, Windows, Mac',
      steps: [
        <>On a phone, tap the {menu('⋮')} menu, then <strong>Add to Home screen</strong>.</>,
        <>On a computer, look for the <strong>install icon</strong> in the address bar, or open the {menu('☰')} menu and choose <strong>Install {APP_SHORT_NAME}</strong>.</>,
      ],
    },
    {
      key: 'vivaldi',
      name: 'Vivaldi',
      on: 'Android, Windows, Mac, Linux',
      steps: [
        <>On a phone, tap the Vivaldi menu, then <strong>Add to Home screen</strong>.</>,
        <>On a computer, look for the <strong>install icon</strong> in the address bar.</>,
      ],
    },
    {
      key: 'firefox',
      name: 'Firefox',
      on: 'Android',
      steps: [
        <>Tap the {menu('⋮')} menu.</>,
        <>Choose <strong>Add to Home screen</strong>, or <strong>Install</strong> if it is offered.</>,
      ],
      note: (
        <>
          Firefox on a computer cannot install web apps at all. It is not a
          setting and there is nothing to turn on. Use Chrome, Edge or Safari on a
          computer; Firefox on a phone is fine.
        </>
      ),
    },
    {
      key: 'chromium-other',
      name: 'Hola, and any other Chromium browser',
      on: 'Android, Windows, Mac',
      steps: [
        <>Open the browser&rsquo;s menu. It is usually {menu('⋮')} or {menu('☰')}, at the top right or the bottom right.</>,
        <>Look for <strong>Install</strong>, <strong>Install app</strong>, or <strong>Add to Home screen</strong>. One of those three is what it is called.</>,
        <>On a computer, check the right-hand end of the address bar first. An <strong>install icon</strong> there is quicker than the menu.</>,
      ],
      note: (
        <>
          Hola, Kiwi, Yandex, UC, DuckDuckGo and the rest are all built on the
          same engine as Chrome, so they install the same way and the wording is
          the only thing that moves. If the <strong>Install now</strong> button
          appears at the top of this card, use that instead: it is the browser
          offering to do it for you, and it is one tap.
        </>
      ),
    },
    // THREE APPLE ENTRIES, NOT ONE.
    //
    // An iPhone and an iPad shared a single entry with one variable sentence in
    // it, and the owner was right that this is not enough: the Share button is
    // at the BOTTOM of Safari on an iPhone and at the TOP, in the toolbar, on an
    // iPad, and a Mac has no Share step at all. One entry meant every reader saw
    // two thirds of instructions written for somebody else's device.
    //
    // NONE OF THEM SAYS "INSTALL", because no Apple menu contains that word.
    // Somebody told to press Install searches a Share sheet for it, does not
    // find it, and concludes the app is broken.
    {
      key: 'safari-iphone',
      name: 'Safari (iPhone)',
      on: 'iPhone',
      steps: [
        <>Tap the <strong>Share</strong> button, the square with an arrow coming out of it, <strong>at the bottom</strong> of Safari.</>,
        <>Scroll down the list and tap <strong>Add to Home Screen</strong>.</>,
        <>Tap <strong>Add</strong>, at the top right. The icon appears on your Home Screen.</>,
      ],
      note: APPLE_ONLY_SAFARI,
    },
    {
      key: 'safari-ipad',
      name: 'Safari (iPad)',
      on: 'iPad',
      steps: [
        <>Tap the <strong>Share</strong> button, the square with an arrow coming out of it, <strong>at the top</strong> of Safari, in the toolbar beside the address.</>,
        <>Tap <strong>Add to Home Screen</strong>. On a large iPad it is often already visible without scrolling.</>,
        <>Tap <strong>Add</strong>, at the top right. The icon appears on your Home Screen.</>,
      ],
      note: APPLE_ONLY_SAFARI,
    },
    {
      key: 'safari-mac',
      name: 'Safari (Mac)',
      on: 'Mac',
      steps: [
        <>In the menu bar at the top of the screen, choose <strong>File</strong>.</>,
        <>Choose <strong>Add to Dock</strong>. There is no Share button step on a Mac.</>,
        <>Give it a name and press <strong>Add</strong>. It appears in your Dock and opens in its own window.</>,
      ],
      note: (
        <>
          <strong>Add to Dock</strong> arrived in Safari 17, with macOS Sonoma. On an
          older Mac it is not there and there is nothing to turn on. Bookmark this
          page instead, or use Chrome or Edge, which can add it from the address bar.
        </>
      ),
    },
  ];
}

/**
 * Which entry to open the list on. A GUESS, never a claim.
 *
 * Only browsers with a token that means what it says are checked here. Chrome
 * is last of the Chromium family because every one of them also says "Chrome"
 * in its user agent, so testing for it first would answer "Chrome" for all of
 * them.
 */
export function guessBrowserKey(platform: Platform): string {
  if (platform === 'iphone') return 'safari-iphone';
  if (platform === 'ipad') return 'safari-ipad';
  if (platform === 'mac') return 'safari-mac';
  if (typeof navigator === 'undefined') return 'chrome';
  const ua = navigator.userAgent;

  // Brave hides itself from the user agent on purpose, so this is the only
  // honest way to spot it.
  try {
    if ((navigator as unknown as { brave?: unknown }).brave) return 'brave';
  } catch { /* not Brave, or blocked */ }

  if (/SamsungBrowser\//i.test(ua)) return 'samsung';
  if (/\bEdgA?\//i.test(ua)) return 'edge';
  if (/\bOPR\/|\bOpera[/ ]/i.test(ua)) return 'opera';
  if (/\bVivaldi/i.test(ua)) return 'vivaldi';
  if (/\bFirefox\/|\bFxiOS\//i.test(ua)) return 'firefox';
  if (/\bChrome\/|\bCriOS\//i.test(ua)) return 'chrome';
  // Nothing recognised. The catch-all entry is written for exactly this, and
  // it is a better answer than naming a browser this person is not using.
  return 'chromium-other';
}

/**
 * The steps, with the browser in hand opened first and every other one a tap
 * away.
 */
export function InstallSteps({ platform }: { platform: Platform }) {
  const [key, setKey] = useState<string>('chrome');
  const [shareWhere, setShareWhere] = useState('in Safari');

  // After mount, because the user agent does not exist during the server
  // render and reading it while rendering makes the first paint disagree with
  // the second.
  useEffect(() => {
    setKey(guessBrowserKey(platform));
    setShareWhere(iosShareLocation());
  }, [platform]);

  const guides = installGuides(shareWhere);
  const guide = guides.find((g) => g.key === key) ?? guides[0];

  // APPLE HAS EXACTLY ONE ANSWER, so it gets no list. Only Safari can install
  // on an iPhone, iPad or Mac, and offering somebody holding an iPhone a row of
  // desktop browsers to choose from is a choice that is not theirs to make. The
  // card above already handles being in the wrong browser on those devices.
  const only = platform === 'iphone' || platform === 'ipad' || platform === 'mac';

  return (
    <div className="mt-3">
      {!only && (
        <>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
            Which browser are you using?
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {guides.map((g) => {
              const on = g.key === guide.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setKey(g.key)}
                  aria-pressed={on}
                  data-install-browser={g.key}
                  className={`tap-sm rounded-xl px-3 text-sm font-semibold transition ${
                    on ? 'bg-navy text-white' : 'bg-gray-100 text-navy hover:bg-gray-200'
                  }`}
                >
                  {g.name}
                </button>
              );
            })}
          </div>
        </>
      )}

      <p className={`text-xs font-semibold uppercase tracking-wide text-gray-500 ${only ? '' : 'mt-3'}`}>
        {guide.name} · {guide.on}
      </p>
      <ol className="mt-1 list-decimal space-y-1.5 pl-5 text-sm text-gray-700">
        {guide.steps.map((step, i) => <li key={i}>{step}</li>)}
      </ol>
      {guide.note && <p className="mt-2 text-sm text-gray-500">{guide.note}</p>}

      {!only && (
        <p className="mt-3 text-sm text-gray-500">
          Cannot find any of these? Whatever the browser, the words to look for
          in its menu are <strong>Install</strong> or{' '}
          <strong>Add to Home screen</strong>. Nothing is downloaded from a shop
          and there is nothing to pay.
        </p>
      )}
    </div>
  );
}
