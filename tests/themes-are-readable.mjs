// A theme has to be readable, and it has to be applied.
//
// THE BUG THIS EXISTS FOR: choosing "Slate" made the whole left column vanish.
//
// The left navigation draws its labels in theme.ink and has NO surface of its
// own; it trusts the page behind it to be theme.bg. The live shell painted a
// hard-coded light grey instead and themed only the rails, so Slate's near-white
// ink landed on a near-white page. The right rail looked perfect throughout,
// because it paints theme.panel behind itself, which is exactly why this was
// reported as "themes are not working" rather than as one missing line.
//
// Two properties, and the first is the one nobody checks by eye across eleven
// themes on every surface.

import { readFileSync, readdirSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// --- WCAG relative luminance and contrast ratio ----------------------------
function srgb(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// --- read the themes out of the source -------------------------------------
const src = readFileSync('lib/room-theme.ts', 'utf8');

// inkOn is lifted from the source and RUN, rather than reimplemented here. A
// second copy of the rule is a second thing to keep in step, and the day they
// disagree the test passes while the app is unreadable.
const inkOnSrc = src.slice(src.indexOf('export function inkOn'));
// eslint-disable-next-line no-new-func
const inkOn = new Function(
  `${inkOnSrc.slice(0, inkOnSrc.indexOf('\n}') + 2).replace('export function', 'function').replace(/: string/g, '').replace(/: number/g, '')}; return inkOn;`,
)();
const themes = [];
for (const block of src.split(/\{\s*\n\s*key:/).slice(1)) {
  const body = 'key:' + block.slice(0, block.indexOf('},'));
  const field = (name) => {
    const m = new RegExp(`${name}:\\s*'([^']*)'`).exec(body);
    return m ? m[1] : '';
  };
  const key = field('key');
  if (!key) continue;
  themes.push({
    key,
    label: field('label'),
    bg: field('bg'),
    panel: field('panel'),
    ink: field('ink'),
    inkSoft: field('inkSoft'),
    accent: field('accent'),
  });
}

ok(themes.length >= 8, `the themes were read from source (${themes.length} found)`);

/** Every hex colour in a value, so a gradient is checked at both ends. */
const stops = (value) => value.match(/#[0-9a-f]{3,8}\b/gi) ?? [];

// WCAG AA for normal body text is 4.5:1. The left rail's labels are small and
// semibold, which is exactly the case that needs the full ratio rather than
// the 3:1 allowed for large text.
const BODY = 4.5;
// Muted text and the accent chip are secondary, and holding them to 4.5 would
// mean no theme could have a soft grey at all. 3:1 is the AA floor for large
// text and for non-text contrast, and it is what keeps "muted" from becoming
// "absent".
const MUTED = 3;

for (const t of themes) {
  for (const stop of stops(t.bg)) {
    const r = contrast(t.ink, stop);
    ok(r >= BODY,
       `${t.key}: ink on its own page background is readable (${r.toFixed(1)}:1 at ${stop})`);
  }
  const onPanel = contrast(t.ink, t.panel);
  ok(onPanel >= BODY, `${t.key}: ink on its panel is readable (${onPanel.toFixed(1)}:1)`);

  const soft = contrast(t.inkSoft, t.panel);
  ok(soft >= MUTED, `${t.key}: muted text on its panel is still visible (${soft.toFixed(1)}:1)`);

  // THE SELECTED NAV ITEM sits on the accent. It used to be white always, and
  // four palettes have an accent light enough that white on it measures under
  // 3:1 -- Morning Light was 1.8:1, a label you cannot read on the page you
  // are currently on. inkOn picks black or white per accent, so what is
  // checked here is the colour that will actually be drawn.
  const chosen = inkOn(t.accent);
  const onAccent = contrast(chosen, t.accent);
  ok(onAccent >= BODY,
     `${t.key}: the selected page label is readable on its accent (${onAccent.toFixed(1)}:1, ${chosen})`);
}

// The app-wide looks use their own scoped CSS rather than the room palettes.
// Measure the colours actually shipped, including secondary text and actions.
for (const id of ['beacon', 'study', 'focus']) {
  const css = readFileSync(`app/themes/${id}.css`, 'utf8');
  const token = (name) => new RegExp(`--look-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)?.[1];
  for (const [ink, ground] of [['ink', 'page'], ['ink', 'panel'], ['soft', 'page'], ['soft', 'panel'], ['soft', 'inset'], ['onPrimary', 'primary']]) {
    const ratio = contrast(token(ink) ?? '', token(ground) ?? '');
    ok(ratio >= BODY, `${id}: ${ink} on ${ground} clears normal-text AA (${ratio.toFixed(1)}:1)`);
  }
  const header = contrast('#ffffff', token('header') ?? '');
  ok(header >= BODY, `${id}: white header controls clear AA (${header.toFixed(1)}:1)`);
}

// --- and the theme has to actually be painted -------------------------------
// The left rail has no surface of its own. If a shell does not paint the
// background, the rail's ink lands on whatever that shell hard-coded, which is
// the whole bug.
for (const shell of ['components/LiveAppShell.tsx', 'components/AppShell.tsx']) {
  const code = readFileSync(shell, 'utf8');
  ok(/background:\s*(room\.)?theme\.bg/.test(code),
     `${shell}: paints the theme background behind the rails`);
  ok(!/className="min-h-screen bg-\[#/.test(code),
     `${shell}: does not hard-code a page colour a theme cannot override`);
}

// --- text on the page follows the theme -------------------------------------
//
// A card paints its own white surface, so navy text inside one is right in
// every theme. A PAGE TITLE has no surface: it is drawn straight onto
// theme.bg. Those were hard-coded navy, and the church name vanished the
// moment somebody chose Slate, which is how this was reported.
{
  const css = readFileSync('app/globals.css', 'utf8');
  ok(/\.text-room\s*\{[^}]*var\(--room-ink/.test(css),
     'there is a text colour that follows the theme');
  ok(/var\(--room-ink,\s*#/.test(css),
     'and it falls back to the brand colour outside the signed-in shell');

  const shell = readFileSync('components/LiveAppShell.tsx', 'utf8');
  ok(/--room-ink/.test(shell), 'the shell publishes the theme as CSS variables');

  // The page titles themselves. Checked by file so a new screen that
  // hard-codes navy on the background is caught rather than discovered.
  //
  // INSIDE A CARD IS FINE, AND THE DIFFERENCE IS THE WHOLE POINT. A Card paints
  // white behind itself in every theme, so navy text in one is correct and
  // changing it would break the light themes instead. Only a title drawn
  // straight onto the page needs to follow theme.ink, so the check asks which
  // side of the nearest Card boundary the title falls on. A blunter rule would
  // flag correct code, and a check that cries wolf gets switched off.
  // EVERY HEADING, NOT JUST <h1>, AND EVERY LIVE SCREEN, NOT TWO OF THEM.
  //
  // This checked h1 in two files and passed while the Announcements heading,
  // an h2 in LiveBillboard, was navy on a navy page and invisible on the dark
  // themes. The bug was reported by the owner, not caught here, because the
  // check was narrower than the rule it was meant to enforce. A section
  // heading sitting on the page is exactly as invisible as a page title.
  const screens = readdirSync('components')
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => `components/${f}`);
  const offenders = [];
  for (const file of screens) {
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(/<h[1-3] className="[^"]*text-navy[^"]*"/g)) {
      const before = code.slice(0, m.index);
      // A SURFACE IS NOT ONLY A <Card>. Two panels are hand-rolled white boxes
      // ("rounded-2xl border-2 bg-white"), and navy text on those is correct in
      // every theme. Flagging them would be crying wolf, and the comment above
      // says exactly what happens to a check that cries wolf.
      // The white box has to be the heading's OWN wrapper, not any bg-white
      // anywhere earlier in the file. Widening it to "anywhere before" made the
      // check pass on the two headings it was written to catch, which is worse
      // than the false positives it was fixing.
      const nearby = before.slice(-400);
      const white = nearby.includes('bg-white') ? before.length - 1 : -1;
      const opened = Math.max(before.lastIndexOf('<Card'), white);
      const closed = before.lastIndexOf('</Card>');
      if (opened <= closed) offenders.push(`${file}:${before.split('\n').length}`);
    }
  }
  ok(offenders.length === 0,
     'no heading outside a card hard-codes a colour the theme cannot change'
     + (offenders.length ? ` (${offenders.join(', ')})` : ''));
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
