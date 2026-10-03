'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { Role } from './types';
import { useChosenLook } from '@/components/UiTheme';
import { isFreshLook, UI_THEMES } from '@/lib/ui-themes';

// -------------------------------------------------------------------------
// "My room" — per-person, per-device room personalisation.
//
// The design brief: a Digital Seeker's room is a PRIVATE STUDY, not a feed.
// Nothing here is shared, broadcast, or visible to anyone else — choosing a
// theme is like moving the lamp on your own desk. Staff roles (admin,
// missionary) get the same control, but their palettes read as an OFFICE:
// they have a job to do and people to reach, so their room is a workplace,
// not a retreat.
//
// Everything is stored on the device in localStorage. No server, no cost, and
// the choice follows the person on the machine they made it on.
// -------------------------------------------------------------------------

/**
 * Black or white on this colour, whichever is actually easier to read.
 *
 * WHY NOT ALWAYS WHITE. The selected item in the left navigation is drawn on
 * theme.accent, and several palettes have an accent light enough that white on
 * it falls under 3:1 -- Morning Light measured 1.8:1, which is a label you
 * cannot read on the page you are currently on. The accents are deliberate
 * design choices, so darkening them to suit one label is the wrong repair. The
 * foreground moves instead.
 *
 * WHY IT COMPARES RATHER THAN THRESHOLDS. A first version returned dark above
 * a fixed luminance, and mid-toned accents lost both ways: #C08A3E is under
 * the threshold and white on it is only 3.0:1. Measuring both and taking the
 * better one has no middle to fall into.
 */
export function inkOn(background: string): string {
  const hex = background.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  const channel = (i: number) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const bg = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  const against = (l: number) => (Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05);
  // Near-black rather than pure black: #1A1D24 is the app's own ink and reads
  // as deliberate where #000 reads as unstyled.
  const DARK = 0.0114; // luminance of #1A1D24
  return against(DARK) >= against(1) ? '#1A1D24' : '#FFFFFF';
}

export interface RoomTheme {
  key: string;
  label: string;
  blurb: string;
  /** Page background — a soft wash behind the whole workspace. */
  bg: string;
  /** Rail / panel surface colour. */
  panel: string;
  /** Text colour that sits on `panel`. */
  ink: string;
  /** Muted text on `panel`. */
  inkSoft: string;
  /** Hairline borders on `panel`. */
  line: string;
  /** The room's accent. */
  accent: string;
  /** What the picker draws for it, when that is not `bg`. */
  swatch?: string;
  /** Under another look: the colours it gives that look (atTheLook). */
  look?: LookColours;
}

// A seeker's study. Quiet, warm, personal.
export const STUDY_THEMES: RoomTheme[] = [
  {
    key: 'paper',
    label: 'Quiet Study',
    blurb: 'Warm paper and soft light',
    bg: 'linear-gradient(180deg, #FBF7F0 0%, #F4EEE4 100%)',
    panel: '#FFFDF9',
    ink: '#3A322A',
    inkSoft: '#8A7E70',
    line: 'rgba(58,50,42,0.10)',
    accent: '#C08A3E',
  },
  {
    key: 'morning',
    label: 'Morning Light',
    blurb: 'Early sun through the window',
    bg: 'linear-gradient(180deg, #FFF9EC 0%, #FDF0D8 100%)',
    panel: '#FFFFFF',
    ink: '#4A3B1F',
    inkSoft: '#9B8759',
    line: 'rgba(74,59,31,0.10)',
    accent: '#E8B84B',
  },
  {
    key: 'garden',
    label: 'Garden',
    blurb: 'Green and growing',
    bg: 'linear-gradient(180deg, #F2F8EF 0%, #E4F0DE 100%)',
    panel: '#FFFFFF',
    ink: '#28402A',
    inkSoft: '#6E8770',
    line: 'rgba(40,64,42,0.10)',
    accent: '#7FB03A',
  },
  {
    key: 'chapel',
    label: 'Chapel',
    blurb: 'Still, deep and reverent',
    bg: 'linear-gradient(180deg, #1B2340 0%, #141A2E 100%)',
    panel: '#232C4C',
    ink: '#EDEFF7',
    inkSoft: '#9AA3C2',
    line: 'rgba(255,255,255,0.10)',
    accent: '#E8B84B',
  },
  {
    key: 'lamplight',
    label: 'Lamplight',
    blurb: 'Late study, low light',
    bg: 'linear-gradient(180deg, #241E1A 0%, #1A1614 100%)',
    panel: '#2E2723',
    ink: '#F2EBE3',
    inkSoft: '#A89A8B',
    line: 'rgba(255,255,255,0.10)',
    accent: '#D9944A',
  },
];

// Staff. A desk, a door, and work waiting on it.
export const OFFICE_THEMES: RoomTheme[] = [
  {
    key: 'desk',
    label: 'The Desk',
    blurb: 'Clean, bright, ready for work',
    bg: 'linear-gradient(180deg, #F5F7FB 0%, #EBEFF7 100%)',
    panel: '#FFFFFF',
    ink: '#1E2A4A',
    inkSoft: '#6B7695',
    line: 'rgba(30,42,74,0.10)',
    accent: '#1E2A4A',
  },
  {
    key: 'slate',
    label: 'Slate',
    blurb: 'Cool and focused',
    bg: 'linear-gradient(180deg, #171C28 0%, #10141C 100%)',
    panel: '#212736',
    ink: '#E8ECF5',
    inkSoft: '#9099AF',
    line: 'rgba(255,255,255,0.10)',
    accent: '#5B8DEF',
  },
  {
    key: 'study',
    label: 'Warm Office',
    blurb: 'Wood, brass and quiet',
    bg: 'linear-gradient(180deg, #F8F3EA 0%, #EFE6D6 100%)',
    panel: '#FFFCF6',
    ink: '#3B3125',
    inkSoft: '#8B7C66',
    line: 'rgba(59,49,37,0.10)',
    accent: '#96682A',
  },
  {
    key: 'focus',
    label: 'Focus',
    blurb: 'Nothing but the task',
    bg: 'linear-gradient(180deg, #FAFAFA 0%, #F0F0F0 100%)',
    panel: '#FFFFFF',
    ink: '#222222',
    inkSoft: '#777777',
    line: 'rgba(0,0,0,0.10)',
    accent: '#444444',
  },
];

export function themesFor(role: Role): RoomTheme[] {
  return role === 'ds' ? STUDY_THEMES : OFFICE_THEMES;
}

export function isSeekerRole(role: Role): boolean {
  return role === 'ds';
}

const KEY = 'beacon-room-v1';

export interface RoomPrefs {
  theme: string;
  /** Show the left workspace rail on wide screens. */
  leftRail: boolean;
  /** Show the right room panel on wide screens. */
  rightRail: boolean;
  /** A line the person writes for themselves — their room, their words. */
  motto: string;
  /**
   * The palette chosen while each of the other looks (Beacon, Study, Focus) is
   * on, by look. Absent means that look's own colours. Kept apart from `theme`,
   * which is Classic's, so choosing Focus still gives you Focus.
   */
  lookPalettes: Record<string, string>;
}

function defaultsFor(role: Role): RoomPrefs {
  return {
    theme: themesFor(role)[0].key,
    leftRail: true,
    rightRail: true,
    motto: '',
    lookPalettes: {},
  };
}

// Prefs are keyed per person so two people sharing a laptop keep their own room.
function storeKey(userId: string) {
  return `${KEY}:${userId}`;
}

function load(userId: string, role: Role): RoomPrefs {
  const base = defaultsFor(role);
  if (typeof window === 'undefined') return base;
  try {
    const raw = localStorage.getItem(storeKey(userId));
    if (!raw) return base;
    const p = JSON.parse(raw);
    const keys = new Set(themesFor(role).map((t) => t.key));
    // Only a look this app has, and only a palette this role has.
    const lookPalettes: Record<string, string> = {};
    if (p.lookPalettes && typeof p.lookPalettes === 'object') {
      for (const [look, key] of Object.entries(p.lookPalettes)) {
        if (isFreshLook(look) && typeof key === 'string' && keys.has(key)) lookPalettes[look] = key;
      }
    }
    return {
      theme: keys.has(p.theme) ? p.theme : base.theme,
      leftRail: typeof p.leftRail === 'boolean' ? p.leftRail : true,
      rightRail: typeof p.rightRail === 'boolean' ? p.rightRail : true,
      motto: typeof p.motto === 'string' ? p.motto.slice(0, 80) : '',
      lookPalettes,
    };
  } catch {
    return base;
  }
}

// Before the browser paints, not after: read in an effect, a reload showed
// the look's own colours for 60 to 120 ms before the chosen palette (measured
// 4 October 2026). On the server there is nothing to paint.
const useBeforePaint = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function useRoom(userId: string | null, role: Role) {
  const [prefs, setPrefs] = useState<RoomPrefs>(() => defaultsFor(role));

  useBeforePaint(() => {
    if (userId) setPrefs(load(userId, role));
  }, [userId, role]);

  const update = useCallback(
    (patch: Partial<RoomPrefs>) => {
      setPrefs((prev) => {
        const next = { ...prev, ...patch };
        if (userId) {
          try {
            localStorage.setItem(storeKey(userId), JSON.stringify(next));
          } catch {}
        }
        return next;
      });
    },
    [userId],
  );

  const list = themesFor(role);
  const look = useChosenLook();
  const fresh = isFreshLook(look);
  const own = useMemo(() => (fresh ? lookOwnColours() : null), [fresh, look]);

  // CLASSIC: the palette is the page, as it always was. ANOTHER LOOK: the
  // look's own colours first, then the same palettes in that look's light
  // (atTheLook below). Asked for on 4 October 2026: "This colors doesnt work
  // for other Themes in settings, please integrate it too". A look whose
  // colours cannot be read keeps Classic's behaviour rather than half of it.
  const byLook = !!own;
  const themes = useMemo(
    () => (own ? [ownTheme(look, own), ...list.map((t) => atTheLook(t, own))] : list),
    [own, look, list],
  );
  const chosen = byLook ? (prefs.lookPalettes[look] ?? OWN_COLOURS) : prefs.theme;
  const theme = themes.find((t) => t.key === chosen) ?? themes[0];
  const choose = useCallback(
    (key: string) => {
      if (!byLook) { update({ theme: key }); return; }
      const next = { ...prefs.lookPalettes };
      if (key === OWN_COLOURS) delete next[look];
      else next[look] = key;
      update({ lookPalettes: next });
    },
    [byLook, look, prefs.lookPalettes, update],
  );

  return {
    prefs,
    update,
    theme,
    themes,
    chosen,
    choose,
    /** True when a palette, not the look's own colours, should recolour the look. */
    recolours: byLook && chosen !== OWN_COLOURS,
  };
}

// -------------------------------------------------------------------------
// THE PALETTES UNDER THE OTHER LOOKS.
//
// A look (app/themes/<id>.css) paints the page, the cards and the desk from
// its own variables (--look-page, --look-panel, --look-ink and the rest), and
// paints over the inline colours a palette gives in Classic. So before 4
// October 2026, choosing an office colour under Beacon, Study or Focus did
// nothing at all. A palette now sets those same variables on <body>, which
// everything on the page inherits from, so the look keeps its shape and its
// pictures and takes the palette's colours. Nothing here is written into a
// look's own stylesheet.
//
// THE LOOK KEEPS ITS LIGHT; THE PALETTE GIVES THE COLOUR. Every variable a
// palette sets has exactly the brightness (relative luminance) of the look's
// own, in the palette's hue. A look's stylesheet also paints colours of its
// own (Focus's pale red for a warning, its button-coloured text on a gold
// badge), chosen to read on its own light or dark. A first version put the
// palettes on as they are, and a cream palette under Focus left that pale red
// at 1.5:1 on the cream, while Slate under Beacon or Study left grey on grey
// at 1.1:1, measured on the sample Guide's pages. With the brightness
// kept, everything the look pairs with its colours reads as it does in the
// look itself, whatever palette is on. So under Focus, Warm Office is a warm
// dark, not cream, and the swatch draws exactly what you will get.
// -------------------------------------------------------------------------

/** The picker's key for "this look's own colours". */
export const OWN_COLOURS = 'look-own';

/** The colours a look is drawn in, every one a #rrggbb. */
export interface LookColours {
  page: string;
  panel: string;
  inset: string;
  ink: string;
  soft: string;
  line: string;
  header: string;
  primary: string;
  onPrimary: string;
  accent: string;
}

const LOOK_TOKENS: Record<keyof LookColours, string> = {
  page: '--look-page',
  panel: '--look-panel',
  inset: '--look-inset',
  ink: '--look-ink',
  soft: '--look-soft',
  line: '--look-line',
  header: '--look-header',
  primary: '--look-primary',
  onPrimary: '--look-onPrimary',
  accent: '--look-accent',
};

const HEX = /^#[0-9a-f]{6}$/i;

/** The first #rrggbb in a colour or gradient: a gradient's first stop. */
function firstHex(value: string): string {
  return /#[0-9a-f]{6}/i.exec(value)?.[0] ?? '#ffffff';
}

/** Relative luminance of #rrggbb, 0 (black) to 1 (white). */
export function luminance(hex: string): number {
  const c = (i: number) => {
    const x = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(0) + 0.7152 * c(1) + 0.0722 * c(2);
}

/** Hue (0 to 360), saturation and lightness (0 to 1) of #rrggbb. */
function hsl(hex: string): [number, number, number] {
  const [r, g, b] = [0, 1, 2].map((i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[0, 8, 4].map((n) => Math.round(f(n) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * `colour`'s hue, at the brightness of `like`, and no more saturated than
 * `like` is. Brightness rises steadily with lightness, so halving finds it.
 */
export function tone(colour: string, like: string): string {
  const [h, s] = hsl(colour);
  const sat = Math.min(s, hsl(like)[1]);
  const target = luminance(like);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (luminance(fromHsl(h, sat, mid)) < target) lo = mid;
    else hi = mid;
  }
  // Of the two neighbours, the one nearer the look's own brightness.
  const [a, b] = [fromHsl(h, sat, lo), fromHsl(h, sat, hi)];
  return Math.abs(luminance(a) - target) <= Math.abs(luminance(b) - target) ? a : b;
}

/** The look on <html> now, as colours read from its stylesheet; null if any is not #rrggbb. */
function lookOwnColours(): LookColours | null {
  if (typeof window === 'undefined') return null;
  const css = getComputedStyle(document.documentElement);
  const out = {} as LookColours;
  for (const [key, name] of Object.entries(LOOK_TOKENS) as [keyof LookColours, string][]) {
    const value = css.getPropertyValue(name).trim();
    if (!HEX.test(value)) return null;
    out[key] = value.toLowerCase();
  }
  return out;
}

const swatchOf = (c: LookColours) => `linear-gradient(135deg, ${c.page} 0 58%, ${c.primary} 58% 100%)`;

/** The look's own colours, first in its picker. Exported for its test. */
export function ownTheme(look: string, own: LookColours): RoomTheme {
  return {
    key: OWN_COLOURS,
    // "Focus's own", not "Focus": the Office has a palette called Focus too,
    // and two swatches with one name cannot be told apart by ear.
    label: `${UI_THEMES.find((t) => t.id === look)?.name ?? 'This look'}'s own`,
    blurb: 'The look as it comes',
    bg: own.page,
    panel: own.panel,
    ink: own.ink,
    inkSoft: own.soft,
    line: own.line,
    accent: own.accent,
    swatch: swatchOf(own),
    look: own,
  };
}

/**
 * A palette in a look's light: each of the look's colours, in the palette's
 * hue. The page and cards take the palette's surfaces, the text its ink, and
 * buttons and links its accent. A dark palette's character is its surface and
 * a light one's its accent, so the phone's top bar takes whichever that is.
 * Exported for its test.
 */
export function atTheLook(t: RoomTheme, own: LookColours): RoomTheme {
  const page = firstHex(t.bg);
  const ink = firstHex(t.ink);
  const accent = firstHex(t.accent);
  const character = luminance(t.panel) < 0.2 ? t.panel : accent;
  // A white card has no hue to give, so it takes the page's: Garden's cards
  // are green in Focus's dark, not grey.
  const surface = hsl(t.panel)[1] > 0.05 ? t.panel : page;
  const c: LookColours = {
    page: tone(page, own.page),
    panel: tone(surface, own.panel),
    inset: tone(surface, own.inset),
    ink: tone(ink, own.ink),
    soft: tone(firstHex(t.inkSoft), own.soft),
    line: tone(ink, own.line),
    header: tone(character, own.header),
    primary: tone(accent, own.primary),
    onPrimary: tone(ink, own.onPrimary),
    accent: tone(accent, own.accent),
  };
  return {
    ...t,
    bg: c.page,
    panel: c.panel,
    ink: c.ink,
    inkSoft: c.soft,
    line: c.line,
    accent: c.accent,
    swatch: swatchOf(c),
    look: c,
  };
}

/**
 * The variables a palette sets on <body>. The --top-bar-* ones are set too:
 * the looks define them with var(), which is worked out on <html>, so they
 * would otherwise keep the look's own colours. Exported for its test.
 */
export function lookVarsFor(c: LookColours): Record<string, string> {
  return {
    '--look-page': c.page,
    '--look-panel': c.panel,
    '--look-inset': c.inset,
    '--look-ink': c.ink,
    '--look-soft': c.soft,
    '--look-line': c.line,
    '--look-header': c.header,
    '--look-primary': c.primary,
    '--look-onPrimary': c.onPrimary,
    '--look-accent': c.accent,
    '--navy': c.ink,
    '--top-bar-bg': c.panel,
    '--top-bar-ink': c.ink,
    '--top-bar-soft': c.soft,
    '--top-bar-chip': c.inset,
    '--top-bar-chip-hover': c.inset,
    '--top-bar-line': c.line,
    '--top-bar-avatar': c.primary,
  };
}

/**
 * Put a palette's colours on the page under another look, or take them off.
 * Called by the two shells only: one owner of <body>'s style, so a page that
 * also reads the room's colours cannot take them away when it closes.
 */
export function useLookPalette(theme: RoomTheme, on: boolean): void {
  const vars = useMemo(() => (on && theme.look ? lookVarsFor(theme.look) : null), [on, theme]);
  useBeforePaint(() => {
    if (!vars) return;
    const body = document.body.style;
    for (const [name, value] of Object.entries(vars)) body.setProperty(name, value);
    return () => {
      for (const name of Object.keys(vars)) body.removeProperty(name);
    };
  }, [vars]);
}
