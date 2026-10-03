// Text size is tried in the preview first; only Apply changes the app.
//
// The owner, 3 October 2026: "text size should be tested and see first before
// applying, there should be an apply button for text size". The browser half
// is tests/e2e/text-size-is-tried-first.js.
//
//   node tests/text-size-is-tried-first.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = fs.readFileSync(path.join(root, 'components/ReadingSettings.tsx'), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const card = code.slice(code.indexOf('export function TextSizeCard'), code.indexOf('export function LookCard'));
ok(card.length > 0, 'the Text size card is found, so the checks below look at it');
const calls = card.match(/setScale\(/g) || [];
ok(calls.length === 1, `one place in the card changes the app's size (${calls.length})`);
const applyButton = card.slice(card.indexOf('data-text-size-apply'), card.indexOf('</button>', card.indexOf('data-text-size-apply')));
ok(/setScale\(trying\)/.test(applyButton), 'and it is the Apply button, applying the size being tried');
const sizeButtons = card.slice(card.indexOf('SIZES.map'), card.indexOf('data-text-size-preview'));
ok(!/setScale\(/.test(sizeButtons) && /setTrying\(s\.scale\)/.test(sizeButtons),
   'pressing a size only tries it');
ok(/disabled=\{!changed\}/.test(card), 'Apply waits until a different size is tried');
ok(/fontSize: `\$\{18 \* trying/.test(card), 'the preview is drawn at the size being tried, from the same 18px base as the app');
ok(/aria-live="polite"/.test(card), 'and what is tried, and what is applied, is said aloud');

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
