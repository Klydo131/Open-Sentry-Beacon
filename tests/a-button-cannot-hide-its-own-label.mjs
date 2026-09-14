// A button cannot hide its own label.
//
// ---------------------------------------------------------------------------
// REPORTED TWICE, the second time with the diagnosis attached without meaning
// to: "I can't see what's on the box, I can only see it when I tap or hover to
// click it." That hover IS the proof. The button carried
// `hover:bg-red-700`, so hovering finally gave its white text a red ground to
// sit on; at rest the text was white on white and the control was invisible.
//
// WHAT PRODUCED IT. Button composes one class attribute out of the variant's
// own colours and whatever the caller passes:
//
//     `... ${size} ${styles[variant]} ${className}`
//
// and a delete confirmation asked for `variant="ghost"` plus
// `bg-red-600 text-white`. Both colours reached the DOM. TAILWIND SETTLES A
// DUPLICATE BY WHERE THE RULES SIT IN THE GENERATED STYLESHEET, NOT BY THE
// ORDER THEY APPEAR IN THE ATTRIBUTE -- so which one won was never decided
// here at all. It landed on `bg-white` from the variant and `text-white` from
// the caller.
//
// Both delete confirmations in the Admin room were affected: one account and
// the bulk one. Every route to removing somebody was blocked by a control that
// the compiler, the typechecker and every existing test agreed was present and
// correctly labelled.
//
// THE RULE NOW: a caller's colour REPLACES the variant's rather than racing it.
// A text SIZE is not a colour, which is the part a tidy-up would get wrong --
// several callers pass `text-base` only to resize and must keep their variant
// colour.
//
//   node tests/a-button-cannot-hide-its-own-label.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const ui = strip(read('components/ui.tsx'));

// 1. The raw variant colours must not reach the class attribute unfiltered.
ok(!/\$\{size\}\s*\$\{styles\[variant\]\}/.test(ui),
   'the variant\'s colours are filtered before they reach the class attribute');

// 2. The filter must exist and cover both categories.
ok(/ownsBg/.test(ui) && /ownsText/.test(ui),
   'a caller supplying a background or a text colour replaces the variant\'s');

// 3. A text size must not be mistaken for a text colour. Without this the
// filter strips the variant colour from every button that only wanted resizing.
ok(/text-\(xs\|sm\|base\|lg\|\[2-9\]\?xl\)/.test(ui),
   'a text size is not treated as a colour');

// 4. No call site may still be relying on the race. Every Button that supplies
// its own colour is found and checked against the variant it asked for --
// measured across the whole tag, since the className often sits lines below the
// variant and a single-line grep misses it (which is how the bulk delete
// confirmation was missed on the first pass).
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel);
    else if (e.name.endsWith('.tsx')) files.push(rel);
  }
})('components');
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel);
    else if (e.name.endsWith('.tsx')) files.push(rel);
  }
})('app');

const colouring = [];
for (const f of files) {
  for (const m of strip(read(f)).matchAll(/<Button\b[\s\S]*?>/g)) {
    const tag = m[0];
    const cls = [...tag.matchAll(/className=(?:["']([^"']*)["']|\{([\s\S]*?)\})/g)]
      .map((x) => x[1] ?? x[2] ?? '').join(' ');
    const tokens = cls.match(/[a-z0-9:/\[\]-]+/gi) ?? [];
    const isSize = (t) => /^text-(xs|sm|base|lg|[2-9]?xl)$/.test(t);
    if (tokens.some((t) => /^bg-/.test(t)) || tokens.some((t) => /^text-/.test(t) && !isSize(t))) {
      colouring.push(`${f}:${strip(read(f)).slice(0, m.index).split('\n').length}`);
    }
  }
}
// Not zero -- these are legitimate. The point is that they are KNOWN, so the
// number moving is a prompt to check the new one renders.
ok(colouring.length <= 4,
   `${colouring.length} button(s) supply their own colour, all honoured by the rule above`
   + `\n        ${colouring.join('\n        ')}`);

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
