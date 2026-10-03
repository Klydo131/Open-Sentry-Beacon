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
//      storage is Classic.
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
  ok([null, undefined, '', 'nonsense', 'CLASSIC', '"><script>', 42, {}].every((v) => L.knownTheme(v) === 'classic'),
     'nothing unknown, empty or malformed can choose a look: it is Classic');
  ok(L.UI_THEMES.every((t) => L.knownTheme(t.id) === t.id), 'and every look the app has can be chosen');
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
        && /dataset\.uiTheme\s*=|setAttribute\(\s*['"]data-ui-theme/.test(code(rel))) writers.push(rel);
    }
  };
  for (const d of ['app', 'components', 'lib']) walk(d);
  ok(writers.length === 0, `nothing but lib/ui-themes.ts writes the page's look${writers.length ? `: ${writers.join(', ')}` : ''}`);
}

// ---------------------------------------------------------------------------
// 2. THE PAGE SAYS WHICH LOOK, AND SETTINGS OFFERS IT
// ---------------------------------------------------------------------------
{
  const layout = code('app/layout.tsx');
  ok(/<html lang="en" data-ui-theme="classic">/.test(layout), 'every page starts as Classic, from the first paint');
  ok(/<UiTheme \/>/.test(layout) && /applyUiTheme\(readUiTheme\(\)\)/.test(code('components/UiTheme.tsx')),
     'and takes this device\'s choice once it has loaded');
  const card = code('components/ReadingSettings.tsx');
  ok(/role="radiogroup" aria-label="Look"/.test(card) && /role="radio"/.test(card) && /aria-checked=\{chosen\}/.test(card)
     && /UI_THEMES\.map/.test(card) && /saveUiTheme\(theme\.id\)/.test(card),
     'Settings lists every look as a choice, says which is chosen, and saves it');
  ok(/<LookCard \/>/.test(card.slice(card.indexOf('export function ReadingSettings'))),
     'the Look card is one of the cards both settings pages draw');
  // Card passes on only the attributes it declares (components/ui.tsx). A
  // data- attribute of the card's own compiles, and never reaches the page.
  ok(/<Card className="p-5" data-panel="look-settings">/.test(card),
     'the Look card is found by data-panel, which Card passes on to the page');
  // What a look draws of its own is absent, not hidden, for everybody else.
  const nav = code('components/DesktopNav.tsx');
  ok(/const look = useChosenLook\(\);/.test(nav) && /if \(look !== DESKTOP\) return null;/.test(nav),
     'the Desktop look\'s rooms render nothing unless Desktop is chosen');
  ok(/<DesktopNav \/>/.test(code('components/TabBar.tsx')), 'and are drawn wherever the bar along the bottom is');
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
  const layout = code('app/layout.tsx');
  for (const f of themeFiles) {
    const id = path.basename(f).replace(/\.(css|scss)$/, '');
    ok(ids.has(id) && id !== 'classic', `${f} is a look the app lists`);
    const scope = new RegExp(`^:root\\[data-ui-theme=["']${id}["']\\](?=$|[\\s>+~.:\\[#])`);
    const loose = selectorsOf(read(f)).filter((s) => !scope.test(s));
    ok(loose.length === 0, `${f}: every rule starts with :root[data-ui-theme="${id}"]${loose.length ? `, not: ${loose.slice(0, 3).join(' | ')}` : ''}`);
    ok(layout.includes(`'./themes/${id}.css'`), `${f} is imported in app/layout.tsx`);
  }
  for (const t of L.UI_THEMES.slice(1)) {
    ok(themeFiles.some((f) => f.endsWith(`/${t.id}.css`) || f.endsWith(`/${t.id}.scss`)), `${t.name} has its stylesheet in ${themeDir}`);
  }
  console.log(`      (${L.UI_THEMES.length} look${L.UI_THEMES.length === 1 ? '' : 's'}: ${L.UI_THEMES.map((t) => t.name).join(', ')})`);
}

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
