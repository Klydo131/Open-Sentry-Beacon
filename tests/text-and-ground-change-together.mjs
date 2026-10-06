// A light background and the text on it change together, or not at all.
//
// Found on 4 October 2026, measuring every look's own colours: under Focus,
// the Settings buttons "What's new", "Send feedback" and "Share Beacon", and
// the "Which Beacon is this" box, read at 1.1:1. Each set its white ground
// INLINE (style={{ backgroundColor: '#fff' }}), which no look can reach, and
// its text with a CLASS (text-navy, text-gray-500), which every look
// recolours. Focus turned the text pale and left the ground white.
//
// The rule: an element that sets a light background inline must set its text
// colour inline too, so the pair stays a pair; or set both with classes, so
// the looks recolour both. This finds the half-and-half ones in every
// component and page.
//
//   node tests/text-and-ground-change-together.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.tsx')) files.push(p);
  }
};
walk(path.join(root, 'components'));
walk(path.join(root, 'app'));

// An inline ground of ANY colour, whether written plainly or as one side of a
// condition. Until 6 October 2026 this looked only for white and near-white
// greys, and missed the header bell's count: gold set inline, its number left
// to text-navy, so under Focus and Dark Aero the number turned pale on gold
// (1.7:1, on every screen). A ground no look can reach needs its ink set beside
// it, whatever its colour; the same widening found two gold buttons and a gold
// pill.
const LIGHT = /backgroundColor:[^,}]*['"]#[0-9a-f]{3,8}['"]/i;
// The text classes the looks recolour (app/themes/*.css).
const RECOLOURED = /\btext-(?:navy|room|room-soft|gray-[4-9]00|slate-[4-9]00)\b/;

/** What sits directly inside an element: its words and {expressions}, not its child elements'. */
function directText(jsx) {
  const inner = jsx.replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '');
  let out = '';
  let depth = 0;
  for (let k = 0; k < inner.length; k++) {
    if (inner[k] === '<' && /[A-Za-z/]/.test(inner[k + 1] || '')) {
      const closing = inner[k + 1] === '/';
      let brace = 0;
      let j = k + 1;
      for (; j < inner.length; j++) {
        if (inner[j] === '{') brace++;
        else if (inner[j] === '}') brace--;
        else if (inner[j] === '>' && brace === 0) break;
      }
      if (closing) depth--;
      else if (inner[j - 1] !== '/') depth++;
      k = j;
    } else if (depth === 0) out += inner[k];
  }
  return out;
}

const halfAndHalf = [];
let looked = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  // Each JSX opening tag: from `<Name` to the `>` that ends it, skipping
  // `>` inside braces (arrow functions, comparisons).
  for (let i = src.indexOf('<'); i !== -1; i = src.indexOf('<', i + 1)) {
    if (!/[A-Za-z]/.test(src[i + 1] || '')) continue;
    let depth = 0;
    let end = -1;
    for (let j = i + 1; j < src.length && j < i + 4000; j++) {
      const c = src[j];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) { end = j; break; }
    }
    if (end === -1) continue;
    const tag = src.slice(i, end + 1);
    // The whole style expression, braces balanced: `style={{ ... }}` and
    // `style={on ? { ... } : { ... }}` alike.
    const at = tag.indexOf('style={');
    if (at === -1) continue;
    let d = 0;
    let stop = -1;
    for (let j = at + 6; j < tag.length; j++) {
      if (tag[j] === '{') d++;
      else if (tag[j] === '}' && --d === 0) { stop = j; break; }
    }
    const style = [null, tag.slice(at + 7, stop)];
    if (stop === -1 || !LIGHT.test(style[1])) continue;
    looked++;
    const cls = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(tag);
    const classes = cls ? (cls[1] ?? cls[2]) : '';
    // Every inline style that sets this ground must also say the text colour.
    const textInline = /\bcolor:/.test(style[1].replace(/backgroundColor/g, ''));
    // And the text INSIDE it counts too: the "Which Beacon is this" box set
    // the ground and left its lines to their own text-gray-500 and text-navy.
    // Its content runs to the matching closing tag of the same name.
    const name = /^<([A-Za-z][\w.]*)/.exec(tag)[1];
    let inner = '';
    if (!tag.endsWith('/>')) {
      let open = 1;
      const re = new RegExp(`<(/?)${name.replace('.', '\\.')}(?=[\\s>/])`, 'g');
      re.lastIndex = end + 1;
      for (let m = re.exec(src); m; m = re.exec(src)) {
        if (m[1]) { if (--open === 0) { inner = src.slice(end + 1, m.index); break; } } else {
          const close = src.indexOf('>', m.index);
          if (src[close - 1] !== '/') open++;
        }
      }
    }
    // A child that sets its own inline colour or ground is its own pair.
    const innerClasses = [...inner.matchAll(/<[A-Za-z][^>]*?className=(?:"([^"]*)"|\{`([^`]*)`\})(?![^>]*style=)/g)]
      .map((m) => m[1] ?? m[2]).join(' ');
    // Or the words sit directly inside it and take no colour at all, so they
    // inherit the look's: the profile's avatar circles were a fixed pale grey
    // with the emoji left to inherit, and where a phone draws an emoji in plain
    // ink, a dark look drew it pale on pale (6 October 2026).
    const ownInk = /(?:^|\s)text-(?:white|black|navy|room|\[[^\]]+\]|[a-z]+-[1-9]00)(?:\/\d+)?(?=\s|$)/.test(classes);
    const inherits = !textInline && !ownInk && /[\p{L}\p{N}\p{Extended_Pictographic}]|\{/u.test(directText(inner));
    if ((!textInline && (RECOLOURED.test(classes) || RECOLOURED.test(innerClasses))) || inherits) {
      const line = src.slice(0, i).split('\n').length;
      halfAndHalf.push(`${path.relative(root, file)}:${line}`);
    }
  }
}

ok(looked > 0, `found the elements that set a background inline (${looked}), so this checks something`);
ok(halfAndHalf.length === 0,
   `none of them leaves its text to a class the looks recolour${halfAndHalf.length ? `: ${halfAndHalf.join(', ')}` : ''}`);

console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
