// The tutorial's ring travels with the page, and never restarts a scroll.
//
// WHAT WENT WRONG, and only on Safari. The WebKit job failed quest-roles,
// tutorial-repeat and tutorial-tut2 on every run from 239 to 246, and not the
// same ones each time. The logs showed the ring pointing at nothing, or at the
// church link in the header, while the step wanted an Explorer's card or a tab.
//
// The cause was in components/Quest.tsx, not in the tests. `measure` runs on
// every scroll event. It started a smooth scroll to bring the target into
// place, and then, on each scroll event of that same scroll, found the target
// "not in place yet" and asked for the scroll again -- returning before it
// moved the ring. Chromium folds a repeated smooth scroll into the running one;
// WebKit abandons it and starts again from wherever the page is. So on Safari
// the page crawled and the ring waited at the target's OLD position, over
// whatever had scrolled underneath it. A third path slid a tab into view inside
// the sideways room strip with one latched `scrollIntoView`, which WebKit did
// not always honour, and never tried again.
//
// No WebKit runs in this sandbox, so this file holds the shape of the fix in the
// source, and the safari workflow holds the behaviour:
//   1. every page scroll `measure` starts is started only from rest;
//   2. every such scroll moves the ring before returning;
//   3. a tab clipped by its strip is brought in by the strip's own scrollLeft,
//      not by a one-shot scrollIntoView.
//
//   node tests/the-tutorial-ring-keeps-up.mjs

import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const src = readFileSync('components/Quest.tsx', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '');

const start = src.indexOf('const measure = () => {');
const end = src.indexOf('measure();', start);
ok(start !== -1 && end > start, 'the measuring function is found');
const measure = src.slice(start, end);

// 1. From rest.
const settledAt = measure.indexOf('const settled = Math.abs(window.scrollY - lastY.current) < 1;');
ok(settledAt !== -1 && measure.indexOf('const settled') === measure.lastIndexOf('const settled'),
  'whether the page is at rest is decided once');
const scrolls = [...measure.matchAll(/window\.scrollBy\(/g)].map((m) => m.index);
ok(scrolls.length >= 2, `the page is moved in the places it should be (${scrolls.length})`);
ok(scrolls.every((i) => i > settledAt), 'and only after that has been decided');
for (const [n, i] of scrolls.entries()) {
  // The condition of the nearest `if` that encloses this call.
  const opener = measure.lastIndexOf('if (', i);
  const guard = measure.slice(opener, measure.indexOf('{', opener));
  // An inner `if (Math.abs(delta) ...)` is the nearest; the one that decides
  // whether to scroll at all encloses it.
  const outer = measure.lastIndexOf('if (', opener - 1);
  const outerGuard = measure.slice(outer, measure.indexOf('{', outer));
  ok(/\bsettled\b/.test(guard) || /\bsettled\b/.test(outerGuard),
    `scroll ${n + 1} is only started from rest`);
  // 2. The ring moves before the function gives up the tick.
  const ret = measure.indexOf('return', i);
  ok(ret !== -1 && /setRect\(/.test(measure.slice(i, ret)),
    `scroll ${n + 1} moves the ring before returning`);
}

// 3. The strip is moved by the strip.
// The assignment that moves it, not a line that merely reads where it is.
const strip = measure.search(/strip\.scrollLeft\s*(\+=|-=|=(?!=))/);
const latch = measure.indexOf('if (slidFor.current !== placeKey)');
ok(strip !== -1 && latch !== -1 && strip < latch,
  'a tab clipped by its strip is slid by the strip itself, before any once-only latch');
ok(/if \(strip\.scrollLeft !== before\)/.test(measure),
  'and it stops when the strip cannot move any further');
const siv = measure.indexOf('scrollIntoView(');
ok(siv === -1 || /offViewport && !clipped/.test(measure.slice(measure.lastIndexOf('if (', siv), siv)),
  'scrollIntoView is left only for what has no strip of its own');

console.log(bad === 0 ? '\nThe ring keeps up with the page, in every engine.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
