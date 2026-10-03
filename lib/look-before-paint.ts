// THE CHOSEN LOOK IS ON THE PAGE BEFORE ANYTHING IS DRAWN.
//
// Asked for on 3 October 2026: "fix the first paint flash too". The server
// cannot know what this device chose, because the choice lives in the
// browser's storage, so every page arrived as `data-ui-theme="classic"` and
// components/UiTheme.tsx corrected it once React had loaded, about a tenth of
// a second later. Measured in the sample church on a computer, that tenth of a
// second was a blank page, so with Desktop nobody saw it. A look that colours
// the whole page (a dark one) would flash Classic's light ground on every
// load, the sign-in page included.
//
// So this runs first, as a script at the top of <body>
// (components/LookBeforePaint.tsx): it reads the stored look and puts it on
// <html> before the page below it is parsed or painted.
//
// THE SAME RULE AS knownTheme(), FROM THE SAME REGISTRY. The list of looks and
// the default are taken from lib/ui-themes.ts when the app is built, so a look
// registered there is applied before paint with no change here, and anything
// not registered (a typo, an old look, somebody's tampering) is the default.
// tests/the-classic-look-stays.mjs runs this script against knownTheme() for
// every kind of stored value.
//
// It is a constant. tests/security-invariants.mjs allows raw script only as a
// module-level constant, and nothing a person can type ever reaches it: the
// ids are lowercase letters and hyphens, which the same test enforces.

import { DEFAULT_LOOK, UI_THEMES, UI_THEME_KEY } from '@/lib/ui-themes';

const IDS = UI_THEMES.map((t) => t.id);

export const LOOK_BEFORE_PAINT = `(function(){var d=${JSON.stringify(DEFAULT_LOOK)},v=d;try{var s=localStorage.getItem(${JSON.stringify(UI_THEME_KEY)});if(${JSON.stringify(IDS)}.indexOf(s)>-1)v=s;}catch(e){}document.documentElement.dataset.uiTheme=v;})()`;
