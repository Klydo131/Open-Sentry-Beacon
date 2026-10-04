// Classic, the app's look as it is, stays exactly as it is while other looks
// are added beside it.
//
// ASKED FOR on 3 October 2026: "I want the current UI to be called "classic"
// in the settings right now, ChatGPT or Codex will introduce new theme UI that
// users can pick, but make sure the classic UI remains the same please."
//
// What keeps Classic the same is a rule about where a look's styles may live,
// so that is what this checks (lib/ui-themes.ts says the rule in full):
//
//   1. Classic is the first look and the default, and anything unknown in
//      storage is the default: "desktop" included, the look that became
//      Classic's computer layout on 3 October 2026 ("this is the classic").
//   2. The page says which look it is from the first paint, Classic unless
//      chosen otherwise, and Settings offers the choice in both halves.
//   3. Classic has no stylesheet, and no rule anywhere targets it.
//   4. Every other look's rules live in app/themes/<id>.css, every one of them
//      scoped to that look, and nothing outside those files targets a look.
//
// tests/e2e/the-classic-look-stays.js checks in a browser that Classic still
// draws the colours it draws today.
//
//   node tests/the-classic-look-stays.mjs

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-looks-'));
const bundle = path.join(out, 'looks.mjs');
await build({
  stdin: { contents: "export * from './lib/ui-themes';\n", resolveDir: root, loader: 'ts' },
  alias: { '@': root },
  outfile: bundle,
  bundle: true, format: 'esm', platform: 'node', target: 'es2020', logLevel: 'silent',
});
const L = await import(pathToFileURL(bundle).href);

// ---------------------------------------------------------------------------
// 1. CLASSIC FIRST, CLASSIC THE DEFAULT
// ---------------------------------------------------------------------------
{
  ok(L.CLASSIC === 'classic' && L.UI_THEMES[0]?.id === 'classic' && L.UI_THEMES[0]?.name === 'Classic',
     'the first look is Classic, called Classic');
  ok(L.UI_THEMES.every((t) => /^[a-z][a-z-]{0,30}$/.test(t.id)) && new Set(L.UI_THEMES.map((t) => t.id)).size === L.UI_THEMES.length,
     'every look has its own id of lowercase letters and hyphens');
  ok(L.DEFAULT_LOOK === 'classic', 'until somebody chooses, a device shows Classic');
  ok(!L.UI_THEMES.some((t) => t.id === 'desktop') && L.knownTheme('desktop') === 'classic',
     'Desktop is no longer a look of its own: it is Classic on a computer, and a device that chose it is on Classic');
  ok([null, undefined, '', 'nonsense', 'CLASSIC', '"><script>', 42, {}].every((v) => L.knownTheme(v) === L.DEFAULT_LOOK),
     'nothing unknown, empty or malformed can choose a look: it is the default');
  ok(L.UI_THEMES.every((t) => L.knownTheme(t.id) === t.id), 'and every look the app has can be chosen');
  globalThis.localStorage = { getItem: () => null, setItem: () => { throw new Error('storage refused'); } };
  globalThis.document = { documentElement: { dataset: {} } };
  L.saveUiTheme('focus');
  ok(L.readUiTheme() === 'focus' && globalThis.document.documentElement.dataset.uiTheme === 'focus',
     'when storage is refused, the chosen component tree and colours still agree');
  L.saveUiTheme('classic');
  ok(L.readUiTheme() === 'classic' && globalThis.document.documentElement.dataset.uiTheme === 'classic',
     'and Classic can still be restored without storage');
  delete globalThis.localStorage;
  delete globalThis.document;
  // The page attribute is only ever written through knownTheme, and only here.
  const lib = code('lib/ui-themes.ts');
  ok(/dataset\.uiTheme = knownTheme\(/.test(lib) && /return knownTheme\(localStorage\.getItem\(UI_THEME_KEY\)\)/.test(lib),
     'what is stored is read through knownTheme, and only knownTheme reaches the page');
  const writers = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (['node_modules', '.next', '.git'].includes(entry.name)) continue;
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry.name) && rel !== path.join('lib', 'ui-themes.ts')
        && rel !== path.join('lib', 'look-before-paint.ts')
        && /dataset\.uiTheme\s*=|setAttribute\(\s*['"]data-ui-theme/.test(code(rel))) writers.push(rel);
    }
  };
  for (const d of ['app', 'components', 'lib']) walk(d);
  ok(writers.length === 0, `nothing but lib/ui-themes.ts and the first-paint script write the page's look${writers.length ? `: ${writers.join(', ')}` : ''}`);
}

// ---------------------------------------------------------------------------
// 2. THE PAGE SAYS WHICH LOOK, AND SETTINGS OFFERS IT
// ---------------------------------------------------------------------------
{
  const layout = code('app/layout.tsx');
  ok(/<html lang="en" data-ui-theme="classic" suppressHydrationWarning>/.test(layout),
     'the server sends Classic, for a browser that runs no script; the attribute is the one React may find changed');
  ok(/<UiTheme \/>/.test(layout) && /applyUiTheme\(readUiTheme\(\)\)/.test(code('components/UiTheme.tsx')),
     'and takes this device\'s choice once it has loaded');
  const card = code('components/ReadingSettings.tsx');
  ok(/role="radiogroup" aria-label="Look"/.test(card) && /role="radio"/.test(card) && /aria-checked=\{chosen\}/.test(card)
     && /UI_THEMES\.filter\(\(theme\) => !theme\.family\)\.map/.test(card) && /saveUiTheme\(theme\.id\)/.test(card),
     'Settings lists every look of its own as a choice, says which is chosen, and saves it');
  // A FAMILY (Frutiger Aero, 4 October 2026: "as sub file for 'look' ... with
  // drop down on it (with description)") is one row that opens to show its
  // looks. Its looks are radios like any other, each with its picture, and
  // stay on the page, hidden, while it is closed.
  ok(/UI_FAMILIES\.map/.test(card) && /looksIn\(family\.id\)/.test(card) && /aria-expanded=\{open\}/.test(card)
     && /aria-controls=\{panel\}/.test(card) && /hidden=\{!open\}/.test(card) && /\{family\.description\}/.test(card)
     && /<LookChoice key=\{theme\.id\} theme=\{theme\} chosen=\{look === theme\.id\} picture \/>/.test(card),
     'every family of looks is a row that opens to show its looks, with their pictures, and says what it is');
  ok(L.UI_FAMILIES.every((f) => /^[a-z]+$/.test(f.id) && f.name && f.description && L.looksIn(f.id).length > 0
     && L.looksIn(f.id).every((t) => t.id.startsWith(`${f.id}-`)))
     && L.UI_THEMES.every((t) => !t.family || L.UI_FAMILIES.some((f) => f.id === t.family)),
     'every family has looks, every look in one has an id that begins with the family\'s, and no look names a family that is not there');
  ok(L.UI_THEMES.filter((t) => t.id !== 'classic').every((t) => L.isFreshLook(t.id)) && !L.isFreshLook('classic') && !L.isFreshLook('nonsense'),
     'every look but Classic draws its own Menu, and nothing unknown does');
  for (const t of L.UI_THEMES.filter((x) => x.id !== 'classic')) {
    ok(fs.existsSync(path.join(root, 'public/themes', `${t.id}.svg`)), `${t.name} has its own drawing (public/themes/${t.id}.svg)`);
  }
  ok(/<LookCard \/>/.test(card.slice(card.indexOf('export function ReadingSettings'))),
     'the Look card is one of the cards both settings pages draw');
  // Card passes on only the attributes it declares (components/ui.tsx). A
  // data- attribute of the card's own compiles, and never reaches the page.
  ok(/<Card className="p-5" data-panel="look-settings">/.test(card),
     'the Look card is found by data-panel, which Card passes on to the page');
  // The rooms down the left of a computer are Classic's, so every look has
  // them: drawn wherever the bar is, shown from 1280px, hidden below.
  const nav = code('components/DesktopNav.tsx');
  ok(!/useChosenLook|data-ui-theme|uiTheme/.test(nav) && /className="[^"]*\bhidden\b[^"]*\bxl:flex\b/.test(nav),
     'the rooms down the left are drawn under every look, shown from 1280px and hidden below');
  ok(/<DesktopNav \/>/.test(code('components/TabBar.tsx')), 'and are drawn wherever the bar along the bottom is');
  // The bar's Menu | People | My Files are for phones and pads. On a computer
  // the rooms down the left already hold every one of them (4 October 2026:
  // "This is not needed in Desktop I think, this is only for mobile and pad").
  ok(!/FreshNav|MENU_HREF|peopleHref|['"`]\/menu['"`]/.test(nav) && !fs.existsSync(path.join(root, 'components/FreshNav.tsx')),
     'the rooms down the left do not repeat the bar\'s Menu, People and My Files, under any look');
  ok(/import '\.\/desktop-layout\.css';/.test(code('app/layout.tsx')) && !/data-ui-theme/.test(read('app/desktop-layout.css').replace(/\/\*[\s\S]*?\*\//g, '')),
     'the computer layout is the app\'s own stylesheet, imported for every page, and targets no look');
  for (const f of ['app/settings/page.tsx', 'components/LiveAccountPages.tsx']) {
    ok(/\{room === 'general' && <ReadingSettings \/>\}/.test(code(f)), `${f}: Look is in Settings, General`);
  }
}

// ---------------------------------------------------------------------------
// 3 and 4. WHERE A LOOK'S STYLES MAY LIVE
// ---------------------------------------------------------------------------

/** Every style rule's selectors in a stylesheet, outside @keyframes, comments removed. */
function selectorsOf(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const found = [];
  const stack = [];
  let prelude = '';
  for (const ch of text) {
    if (ch === '{') {
      const p = prelude.trim();
      const inKeyframes = stack.some((s) => /^@(-[a-z]+-)?keyframes/i.test(s));
      if (!p.startsWith('@') && !inKeyframes && p) found.push(...p.split(',').map((x) => x.trim()));
      stack.push(p);
      prelude = '';
    } else if (ch === '}') {
      stack.pop();
      prelude = '';
    } else if (ch === ';') {
      prelude = '';
    } else {
      prelude += ch;
    }
  }
  return found;
}

// The repository's own stylesheets: tracked, or new and not ignored. Build
// output (.next, .next-dev) compiles the looks' rules into one file and is
// not where anybody writes a style, so it is not looked at.
function cssFiles() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' });
  return out.split('\n').filter((f) => /\.(css|scss)$/.test(f) && fs.existsSync(path.join(root, f)));
}

{
  const all = cssFiles();
  const themeDir = 'app/themes/';
  const themeFiles = all.filter((f) => f.startsWith(themeDir));
  const others = all.filter((f) => !f.startsWith(themeDir));
  ok(others.includes('app/globals.css'), 'the shared stylesheet is found, so the search below is looking in the right place');

  ok(!fs.existsSync(path.join(root, themeDir, 'classic.css')), 'Classic has no stylesheet of its own: it is the app as it is');
  const targetsClassic = all.filter((f) => /data-ui-theme\s*=\s*["']?classic/.test(read(f)));
  ok(targetsClassic.length === 0, `no rule anywhere targets Classic${targetsClassic.length ? `: ${targetsClassic.join(', ')}` : ''}`);
  const leaks = others.filter((f) => /data-ui-theme/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, '')));
  ok(leaks.length === 0, `no stylesheet outside ${themeDir} targets a look${leaks.length ? `: ${leaks.join(', ')}` : ''}`);

  const ids = new Set(L.UI_THEMES.map((t) => t.id));
  const families = new Set(L.UI_FAMILIES.map((f) => f.id));
  const layout = code('app/layout.tsx');
  for (const f of themeFiles) {
    const id = path.basename(f).replace(/\.(css|scss)$/, '');
    // A family's shared stylesheet reaches its looks, and only them, by the
    // start of their ids: :root[data-ui-theme^="aero-"].
    const family = families.has(id);
    ok((ids.has(id) || family) && id !== 'classic', `${f} is a look${family ? ' family' : ''} the app lists`);
    const scope = family
      ? new RegExp(`^:root\\[data-ui-theme\\^=["']${id}-["']\\](?=$|[\\s>+~.:\\[#])`)
      : new RegExp(`^:root\\[data-ui-theme=["']${id}["']\\](?=$|[\\s>+~.:\\[#])`);
    const loose = selectorsOf(read(f)).filter((s) => !scope.test(s));
    ok(loose.length === 0, `${f}: every rule starts with :root[data-ui-theme${family ? `^="${id}-"` : `="${id}"`}]${loose.length ? `, not: ${loose.slice(0, 3).join(' | ')}` : ''}`);
    ok(layout.includes(`'./themes/${id}.css'`), `${f} is imported in app/layout.tsx`);
  }
  for (const fam of L.UI_FAMILIES) {
    const shared = layout.indexOf(`'./themes/${fam.id}.css'`);
    ok(shared >= 0 && L.looksIn(fam.id).every((t) => layout.indexOf(`'./themes/${t.id}.css'`) > shared),
       `${fam.name}'s shared stylesheet is imported before its looks' own, so theirs come after it`);
  }
  for (const t of L.UI_THEMES.slice(1)) {
    ok(themeFiles.some((f) => f.endsWith(`/${t.id}.css`) || f.endsWith(`/${t.id}.scss`)), `${t.name} has its stylesheet in ${themeDir}`);
  }
  console.log(`      (${L.UI_THEMES.length} look${L.UI_THEMES.length === 1 ? '' : 's'}: ${L.UI_THEMES.map((t) => t.name).join(', ')})`);
}

// ---------------------------------------------------------------------------
// 5. THE CHOSEN LOOK IS ON THE PAGE BEFORE THE FIRST FRAME
//
// The owner, 3 October 2026: "fix the first paint flash too". The script runs
// at the top of <body>, so it is checked here by running it: in a stand-in
// browser, for every kind of stored value, it must put on <html> exactly what
// knownTheme() would. tests/e2e/the-first-paint.js checks it in a real one.
// ---------------------------------------------------------------------------
{
  const vm = await import('node:vm');
  const paintBundle = path.join(out, 'paint.mjs');
  await build({
    stdin: { contents: "export * from './lib/look-before-paint';\n", resolveDir: root, loader: 'ts' },
    alias: { '@': root },
    outfile: paintBundle,
    bundle: true, format: 'esm', platform: 'node', target: 'es2020', logLevel: 'silent',
  });
  const { LOOK_BEFORE_PAINT } = await import(pathToFileURL(paintBundle).href);
  // Only `</script` ends a script element, so a script with no `<` in it
  // cannot be closed early by anything a look's id might one day contain.
  ok(typeof LOOK_BEFORE_PAINT === 'string' && !LOOK_BEFORE_PAINT.includes('<'),
     'the script has no < in it, so nothing can close the tag it sits in');

  const run = (stored, throws = false) => {
    const html = { dataset: {} };
    const storage = { getItem: (k) => { if (throws) throw new Error('blocked'); return k === L.UI_THEME_KEY ? stored : null; } };
    vm.runInNewContext(LOOK_BEFORE_PAINT, { localStorage: storage, document: { documentElement: html } });
    return html.dataset.uiTheme;
  };
  const values = [null, '', 'nonsense', 'CLASSIC', ' desktop', '"><script>', '__proto__', 'constructor', ...L.UI_THEMES.map((t) => t.id)];
  const wrong = values.filter((v) => run(v) !== L.knownTheme(v));
  ok(wrong.length === 0, `for every stored value it puts on the page what knownTheme() says${wrong.length ? `; not for: ${wrong.map((v) => JSON.stringify(v)).join(', ')}` : ''}`);
  ok(L.UI_THEMES.every((t) => run(t.id) === t.id), 'every registered look, Classic included, is applied before paint');
  ok(run('anything', true) === L.DEFAULT_LOOK, 'and a browser that refuses storage gets the default, as readUiTheme() gives it');

  const layout = code('app/layout.tsx');
  const body = layout.slice(layout.indexOf('<body>'));
  const firstDrawn = body.search(/<(DemoProvider|LocaleProvider|LiveSessionProvider|TutorialModeProvider|main|div)\b/);
  ok(/<LookBeforePaint \/>/.test(body) && body.indexOf('<LookBeforePaint />') < firstDrawn,
     'the script is in <body> ahead of anything the page draws');
  ok(/__html: LOOK_BEFORE_PAINT \}/.test(code('components/LookBeforePaint.tsx')),
     'and what it writes into the page is the constant, nothing else');
}

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
