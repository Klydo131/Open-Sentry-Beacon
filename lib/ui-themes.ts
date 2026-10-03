// The app's looks, chosen in Settings, General, Look.
//
// ASKED FOR on 3 October 2026: "I want the current UI to be called "classic"
// in the settings right now, ChatGPT or Codex will introduce new theme UI that
// users can pick, but make sure the classic UI remains the same please."
//
// CLASSIC IS THE APP AS IT IS. It has no stylesheet of its own and it never
// will: it is what every component already draws, so choosing it changes
// nothing and nothing has to be maintained to keep it. The page always carries
// which look is chosen, as data-ui-theme on <html>, and Classic's value,
// "classic", is matched by no rule anywhere.
//
// ON A COMPUTER, CLASSIC IS THE DESKTOP DESIGN. For a few hours on 3 October
// 2026 that was a second look called Desktop, beside a Classic that still put
// the phone's bar and navy band on a computer. The owner, the same day, with a
// screenshot of Desktop: "this is the classic. I dont want the UI classic with
// the outdated version where the UI is still mobile in desktop". So the rooms
// down the left and the light top bar are now the app's own computer layout
// (components/DesktopNav.tsx, app/desktop-layout.css), under every look, and
// a device that had chosen Desktop is simply on Classic again.
//
// A NEW LOOK IS ADDED, NEVER MADE BY CHANGING CLASSIC. For whoever adds one,
// with whatever tool:
//
//   1. Add an entry to UI_THEMES below, after Classic. Its id is lowercase
//      letters and hyphens, and it is what data-ui-theme will say.
//   2. Put every style it changes in app/themes/<id>.css, and import that file
//      in app/layout.tsx after globals.css. Every rule in it starts with
//      :root[data-ui-theme="<id>"], so it cannot reach anybody who chose
//      Classic, or another look.
//   3. If it needs something Classic does not draw, that is a component of its
//      own which renders NOTHING unless its look is chosen (useChosenLook in
//      components/UiTheme.tsx).
//   4. Do not edit the shared styles (globals.css, tailwind.config.ts, the
//      components' own classes) to make a look work. That is changing Classic.
//
// tests/the-classic-look-stays.mjs fails the build if Classic stops being the
// first look, Classic gains a stylesheet, or any look's rules are not
// scoped to that look; tests/e2e/the-classic-look-stays.js checks in a browser
// that Classic still draws the colours it draws today.
//
// KEPT ON THIS DEVICE, like the text size: it is how the app looks to the
// person holding it, not something the church or the account decides.

export interface UiTheme {
  /** What data-ui-theme says on <html>. Lowercase letters and hyphens. */
  id: string;
  /** What Settings calls it. */
  name: string;
  /** One line under the name, in Settings. */
  description: string;
}

export const CLASSIC = 'classic';

/** Every look, Classic first. What a device shows before anybody chooses is DEFAULT_LOOK, below. */
export const UI_THEMES: readonly UiTheme[] = [
  {
    id: CLASSIC,
    name: 'Classic',
    description: 'The Hope Beacon look. On a computer, your rooms down the left side; on a phone or tablet, the bar along the bottom.',
  },
];

// WHAT A DEVICE SHOWS UNTIL SOMEBODY CHOOSES: Classic. It was Desktop for a
// few hours on 3 October 2026, until Desktop became Classic's own computer
// layout (above); "desktop", still in some browsers' storage, is now unknown
// and so means this.
export const DEFAULT_LOOK = CLASSIC;

export const UI_THEME_KEY = 'beacon-ui-theme';

/** Said on window when this tab changes its look, so what draws a look can follow. */
export const UI_THEME_EVENT = 'beacon-ui-theme';

/**
 * A stored or given value, as a look this app actually has: anything unknown,
 * empty or malformed is the default. It is what reaches the page's attribute,
 * so a hand-edited value in storage can only ever choose one of the looks above.
 */
export function knownTheme(id: unknown): string {
  return typeof id === 'string' && UI_THEMES.some((t) => t.id === id) ? id : DEFAULT_LOOK;
}

/** The look chosen on this device, or the default when nothing has been chosen. */
export function readUiTheme(): string {
  try {
    return knownTheme(localStorage.getItem(UI_THEME_KEY));
  } catch {
    return DEFAULT_LOOK;
  }
}

/** Remember a look on this device and put it on the page. */
export function saveUiTheme(id: string): string {
  const chosen = knownTheme(id);
  try {
    localStorage.setItem(UI_THEME_KEY, chosen);
  } catch {
    // Storage refused (a private window): the look still applies until reload.
  }
  applyUiTheme(chosen);
  try {
    window.dispatchEvent(new Event(UI_THEME_EVENT));
  } catch {
    // No window: nothing is drawn here to follow it.
  }
  return chosen;
}

/** Put a look on the page. Classic's value is matched by no rule, so it changes nothing. */
export function applyUiTheme(id: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.uiTheme = knownTheme(id);
}
