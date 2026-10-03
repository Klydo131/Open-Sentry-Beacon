// The room's colours work under every look, and never make it harder to read.
//
// Asked for on 4 October 2026: "This colors doesnt work for other Themes in
// settings, please integrate it too". Under Beacon, Study and Focus the look
// painted over the palette, so the desk's colour swatches did nothing.
// lib/room-theme.ts now gives each look the palettes in that look's own light:
// every colour has the brightness of the look's own and the palette's hue.
//
// WHY THE BRIGHTNESS IS KEPT. A look's stylesheet also paints colours of its
// own, chosen for its own light or dark: Focus's pale red for a warning, the
// gold badges. Put on as they are, a cream palette under Focus left that red at
// 1.5:1, and Slate under Beacon left grey on grey at 1.1:1. So this checks the
// arithmetic for every look against every palette, the pairings each look
// relies on, and that a look added later has colours the arithmetic can read.
// The browser half is tests/e2e/room-colours-in-every-look.js.
//
//   node tests/room-colours-keep-the-look-light.mjs

import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-room-colours-'));
const bundle = async (entry, name) => {
  const file = path.join(out, `${name}.mjs`);
  await build({
    entryPoints: [path.join(root, entry)],
    alias: { '@': root },
    outfile: file,
    bundle: true, format: 'esm', platform: 'node', target: 'es2020', logLevel: 'silent',
  });
  return import(pathToFileURL(file).href);
};
const R = await bundle('lib/room-theme.ts', 'room-theme');
const T = await bundle('lib/ui-themes.ts', 'ui-themes');

const contrast = (a, b) => {
  const [x, y] = [R.luminance(a), R.luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

// 1. EVERY LOOK BUT CLASSIC NAMES ITS COLOURS AS #rrggbb.
// The palettes are worked out from them in the browser; a look written with
// rgb() or a var() here would quietly keep Classic's behaviour instead.
const TOKENS = {
  page: '--look-page', panel: '--look-panel', inset: '--look-inset', ink: '--look-ink',
  soft: '--look-soft', line: '--look-line', header: '--look-header', primary: '--look-primary',
  onPrimary: '--look-onPrimary', accent: '--look-accent',
};
const looks = T.UI_THEMES.filter((t) => T.isFreshLook(t.id));
ok(looks.length >= 3, `the registry has looks besides Classic (${looks.map((t) => t.id).join(', ')})`);
const own = {};
for (const look of looks) {
  const css = read(`app/themes/${look.id}.css`);
  const at = css.indexOf(`:root[data-ui-theme="${look.id}"] {`);
  const block = at < 0 ? '' : css.slice(at, css.indexOf('}', at));
  const colours = {};
  const missing = [];
  for (const [key, name] of Object.entries(TOKENS)) {
    const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(block);
    if (m) colours[key] = m[1].toLowerCase();
    else missing.push(name);
  }
  ok(missing.length === 0,
     `${look.name}: its stylesheet names all ten colours as #rrggbb${missing.length ? ` (not: ${missing.join(', ')})` : ''}`);
  if (!missing.length) own[look.id] = colours;
}

// 2. EVERY PALETTE, UNDER EVERY LOOK, HAS THAT LOOK'S LIGHT.
const palettes = [...R.OFFICE_THEMES, ...R.STUDY_THEMES];
const PAIRS = [
  ['ink', 'panel', 'text on a card'],
  ['ink', 'page', 'text on the page'],
  ['soft', 'panel', 'quiet text on a card'],
  ['onPrimary', 'primary', 'a button\'s label'],
  ['accent', 'panel', 'a link on a card'],
];
let drift = 1;
let worstPair = '';
let worstLoss = 0;
for (const [id, mine] of Object.entries(own)) {
  for (const t of palettes) {
    const c = R.atTheLook(t, mine).look;
    for (const key of Object.keys(TOKENS)) drift = Math.max(drift, contrast(c[key], mine[key]));
    for (const [a, b, what] of PAIRS) {
      const loss = contrast(mine[a], mine[b]) - contrast(c[a], c[b]);
      if (loss > worstLoss) { worstLoss = loss; worstPair = `${t.label} under ${id}, ${what}`; }
    }
  }
}
ok(drift < 1.02,
   `every colour of every palette under every look is as bright as the look's own (the furthest is ${drift.toFixed(3)}:1 from it)`);
ok(worstLoss < 0.15,
   `so text, quiet text, button labels and links read as they do in the look itself (the most lost: ${worstLoss.toFixed(2)}${worstPair ? `, ${worstPair}` : ''})`);

// 3. THE PALETTE STILL SHOWS, AND THE SWATCH DRAWS WHAT YOU GET.
{
  const focus = own.focus;
  const warm = R.atTheLook(R.OFFICE_THEMES.find((t) => t.key === 'study'), focus).look;
  const [r, , b] = [1, 3, 5].map((i) => parseInt(warm.page.slice(i, i + 2), 16));
  ok(r > b && warm.page !== focus.page, `under Focus, Warm Office is a warm dark (${warm.page}), not Focus's own blue (${focus.page})`);
  const garden = R.atTheLook(R.STUDY_THEMES.find((t) => t.key === 'garden'), focus).look;
  const [gr, gg] = [1, 3].map((i) => parseInt(garden.panel.slice(i, i + 2), 16));
  ok(gg > gr, `a palette with white cards gives them its page's hue: Garden's cards under Focus are green (${garden.panel})`);
  for (const [id, mine] of Object.entries(own)) {
    const seen = new Map();
    for (const t of palettes) {
      const shown = R.atTheLook(t, mine);
      seen.set(shown.swatch, (seen.get(shown.swatch) ?? 0) + 1);
    }
    const twins = [...seen.values()].filter((n) => n > 1).length;
    ok(twins === 0, `under ${id}, no two palettes draw the same swatch`);
  }
  const names = new Set(palettes.map((p) => p.label));
  const ownNames = Object.entries(own).map(([id, mine]) => R.ownTheme(id, mine).label);
  ok(ownNames.every((n) => !names.has(n)) && ownNames.includes('Focus\'s own'),
     `a look's own colours never share a name with a palette, so "Focus's own" is not "Focus", an Office palette (${ownNames.join(', ')})`);
  const t = R.atTheLook(R.OFFICE_THEMES[1], focus);
  ok(t.swatch.includes(t.look.page) && t.swatch.includes(t.look.primary),
     'a swatch is drawn from the very page and button colours the palette gives');
}

// 4. WHAT IS SET ON THE PAGE: every colour, and the top bar's, which the looks
// work out with var() on <html> and would otherwise keep as the look's own.
{
  const vars = R.lookVarsFor(R.atTheLook(R.OFFICE_THEMES[0], Object.values(own)[0]).look);
  const lookNames = Object.values(TOKENS);
  ok(lookNames.every((n) => n in vars), 'all ten look colours are set by a palette');
  // Only those declared on <html> itself. One declared on an element inside
  // the page (Focus's .sr ones) is worked out there, from <body>'s colours.
  const viaVar = new Set();
  for (const look of looks) {
    const css = read(`app/themes/${look.id}.css`);
    const at = css.indexOf(`:root[data-ui-theme="${look.id}"] {`);
    for (const m of css.slice(at, css.indexOf('}', at)).matchAll(/(--[\w-]+):\s*var\(--look-/g)) viaVar.add(m[1]);
  }
  const notSet = [...viaVar].filter((n) => !(n in vars) && n !== '--gold');
  ok(viaVar.size >= 8 && notSet.length === 0,
     `and every colour a look builds from them with var() on <html> (${[...viaVar].join(', ')})${notSet.length ? `; not: ${notSet.join(', ')}` : ''}`);
  ok(Object.values(vars).every((v) => /^#[0-9a-f]{6}$/.test(v)), 'each one a plain colour, so it works as a background too');
}

// 5. THE WIRING: both shells put it on, the picker chooses through it, and
// Classic keeps its own palette.
{
  for (const shell of ['components/AppShell.tsx', 'components/LiveAppShell.tsx']) {
    const src = code(shell);
    ok(/useLookPalette\([^)]*recolours\)/.test(src) && /chosen=\{[^}]*chosen\}/.test(src) && /choose=\{[^}]*choose\}/.test(src),
       `${shell} puts the palette on the look and hands the picker the choice`);
  }
  const rails = code('components/RoomRails.tsx');
  ok(/data-room-palette=\{t\.key\}/.test(rails) && /const on = t\.key === chosen;/.test(rails) && /aria-pressed=\{on\}/.test(rails)
     && /onClick=\{\(\) => choose\(t\.key\)\}/.test(rails),
     'each swatch says which palette it is, whether it is on, and chooses through the room');
  const room = code('lib/room-theme.ts');
  ok(/if \(!byLook\) \{ update\(\{ theme: key \}\)/.test(room),
     'in Classic a swatch still sets the room\'s own palette, as it always did');
  ok(/lookPalettes\[look\] \?\? OWN_COLOURS/.test(room),
     'another look opens in its own colours until a palette is chosen in it');
  ok(!/document\.documentElement\.style\.setProperty/.test(room),
     'a palette is put on <body>, never on <html>, so the look\'s own colours can still be read');
}

fs.rmSync(out, { recursive: true, force: true });
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
