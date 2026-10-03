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
// A NEW LOOK IS ADDED, NEVER MADE BY CHANGING CLASSIC. For whoever adds one,
// with whatever tool:
//
//   1. Add an entry to UI_THEMES below, after Classic. Its id is lowercase
//      letters and hyphens, and it is what data-ui-theme will say.
//   2. Put every style it changes in app/themes/<id>.css, and import that file
//      in app/layout.tsx after globals.css. Every rule in it starts with
//      :root[data-ui-theme="<id>"], so it cannot reach anybody who chose
//      Classic, or another look.
//   3. Do not edit the shared styles (globals.css, tailwind.config.ts, the
//      components' own classes) to make a look work. That is changing Classic.
//
// tests/the-classic-look-stays.mjs fails the build if Classic stops being the
// first look or the default, gains a stylesheet, or if any look's rules are not
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

/** Every look, Classic first. Classic is the default and stays first. */
export const UI_THEMES: readonly UiTheme[] = [
  {
    id: CLASSIC,
    name: 'Classic',
    description: 'The look the app has today.',
  },
];

export const UI_THEME_KEY = 'beacon-ui-theme';

/**
 * A stored or given value, as a look this app actually has: anything unknown,
 * empty or malformed is Classic. It is what reaches the page's attribute, so a
 * hand-edited value in storage can only ever choose one of the looks above.
 */
export function knownTheme(id: unknown): string {
  return typeof id === 'string' && UI_THEMES.some((t) => t.id === id) ? id : CLASSIC;
}

/** The look chosen on this device, or Classic. */
export function readUiTheme(): string {
  try {
    return knownTheme(localStorage.getItem(UI_THEME_KEY));
  } catch {
    return CLASSIC;
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
  return chosen;
}

/** Put a look on the page. Classic's value is matched by no rule, so it changes nothing. */
export function applyUiTheme(id: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.uiTheme = knownTheme(id);
}
