// Screens open without a hitch: no needless work in the frame a screen opens.
//
// ---------------------------------------------------------------------------
// WHY. The owner, 4 October 2026: "can we even make our UI animations smoother
// please". The animations themselves were already cheap (they move only
// transform and opacity). The hitches were the app's own work, measured on a
// processor slowed 4x to stand in for a phone, in the frame where a screen
// slides in:
//
//   - the header and the tab bar forcing a page layout to measure themselves
//     (held by tests/the-bottom-bar.mjs, with lib/published-height.ts);
//   - the message box measuring itself while still empty, as a conversation
//     opens with every message in it new on the page;
//   - a new date formatter built for every time label in a thread;
//   - the tab bar blurring what scrolls under it in the three looks whose bar
//     is solid, where the blur cannot be seen.
//
//   node tests/screens-open-without-a-hitch.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// The message box: an empty box is one line and is not measured.
const box = read('components/MessageBox.tsx');
// Comments left out: the one explaining this rule names scrollHeight itself.
const sizing = box.slice(box.indexOf('useLayoutEffect(() => {'), box.indexOf('}, [value]);')).replace(/\/\/[^\n]*/g, '');
ok(sizing.length > 0 && sizing.search(/if \(!value\) \{/) >= 0
   && sizing.search(/if \(!value\) \{/) < sizing.search(/scrollHeight/),
   'the message box is not measured while it is empty');

// The time labels: one formatter, made once.
const thread = read('lib/talk/thread.ts');
ok(/^const CLOCK = new Intl\.DateTimeFormat\(/m.test(thread) && /return CLOCK\.format\(/.test(thread)
   && !/toLocaleTimeString/.test(thread.slice(thread.indexOf('export function clockTime'))),
   'a conversation\'s time labels share one formatter');

// The tab bar: no blur under a solid bar.
for (const look of ['beacon', 'focus', 'study']) {
  const css = read(`app/themes/${look}.css`);
  const rule = (css.match(new RegExp(`:root\\[data-ui-theme="${look}"\\] \\.tab-bar \\{[^}]*\\}`)) || [''])[0];
  ok(/background: var\(--look-panel\)/.test(rule) && /(^|\s)backdrop-filter: none;/.test(rule),
     `${look}: the tab bar is solid, so it does not blur what scrolls under it`);
  ok(new RegExp(`--look-panel: #[0-9a-f]{6};`).test(css), `${look}: and its panel colour really is solid`);
}

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
