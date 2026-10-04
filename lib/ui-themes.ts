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
// A FAMILY IS SEVERAL LOOKS LISTED TOGETHER, under one name in Settings that
// opens to show them (Frutiger Aero, asked for on 4 October 2026 with four
// design sheets: "make more UI theme for fruteger aero, as sub file for
// 'look' so people can see the difference"). For a family:
//
//   1. Add it to UI_FAMILIES. Its id is lowercase letters, no hyphens.
//   2. Every look in it has `family` set to that id and an id that begins
//      with it and a hyphen ("aero-eco"), so one selector can reach them all.
//   3. What the looks share lives once, in app/themes/<family>.css, and every
//      rule in it starts with :root[data-ui-theme^="<family>-"]. Each look
//      still has its own app/themes/<id>.css for its colours and whatever is
//      only its own, scoped to it exactly as above.
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
  /** The family it is listed under in Settings (UI_FAMILIES), if it has one. */
  family?: string;
}

/** Looks listed together under one name in Settings, which opens to show them. */
export interface UiFamily {
  /** Lowercase letters. Every look in the family has an id beginning `<id>-`. */
  id: string;
  /** What Settings calls the family. */
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
    description: 'The Hope Beacon look. On a computer or a large tablet turned sideways, your rooms down the left side; otherwise, the bar along the bottom.',
  },
  {
    id: 'beacon',
    name: 'Beacon',
    description: 'Bright skies, open space and easy-to-find room cards.',
  },
  {
    id: 'study',
    name: 'Study',
    description: 'Warm paper and a calm space for reading and reflection.',
  },
  {
    id: 'focus',
    name: 'Focus',
    description: 'A quiet night sky, dark surfaces and clear room cards.',
  },
  // FRUTIGER AERO. The descriptions are the owner's, from the design sheets.
  {
    id: 'aero-eco',
    family: 'aero',
    name: 'Frutiger Eco',
    description: 'Nature-inspired, clean and fresh. Glass, light and vibrant colour that bring hope, growth and clarity.',
  },
  {
    id: 'aero-dark',
    family: 'aero',
    name: 'Dark Aero',
    description: 'Sleek, immersive and modern. Glass, glowing light and depth for long, focused sessions.',
  },
  {
    id: 'aero-technozen',
    family: 'aero',
    name: 'Technozen',
    description: 'Calm, minimal and balanced. A modern, peaceful space for study and reflection.',
  },
  {
    id: 'aero-dorfic',
    family: 'aero',
    name: 'DORFic',
    description: 'Playful, optimistic and futuristic. A nostalgic yet modern take on early-2000s design.',
  },
  {
    id: 'aero-colors',
    family: 'aero',
    name: 'Four Colors',
    description: 'Clean and colourful clarity: bright glass tiles in blue, green, orange and purple.',
  },
];

/** Families of looks, in the order Settings lists them, after the looks of their own. */
export const UI_FAMILIES: readonly UiFamily[] = [
  {
    id: 'aero',
    name: 'Frutiger Aero',
    description: 'Glass, light, water and sky, with the gloss of the early 2000s. Five moods to choose from.',
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

// A private browser may refuse writes. Keep the person's choice for this tab
// so the selected component tree and the page's colours still agree.
let unstoredLook: string | undefined;

/**
 * Every look but Classic draws its own Menu (components/FreshMenu.tsx) and
 * shows the desk's palettes in its own light (lib/room-theme.ts).
 */
export function isFreshLook(id: string): boolean {
  return id !== CLASSIC && UI_THEMES.some((t) => t.id === id);
}

/** The looks in one family, in the order Settings lists them. */
export function looksIn(family: string): UiTheme[] {
  return UI_THEMES.filter((t) => t.family === family);
}

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
  if (unstoredLook !== undefined) return unstoredLook;
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
    unstoredLook = undefined;
  } catch {
    // Storage refused (a private window): the look still applies until reload.
    unstoredLook = chosen;
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
