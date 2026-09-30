// Two rules a browser test in this sandbox CANNOT check.
//
// THE REPORT: "all of the pop ups are not optimize for mobile and pads. No
// problem with mac and desktop."
//
// That last sentence is the whole diagnosis, and it is why this file exists
// alongside tests/e2e/panels-fit-portrait.js rather than inside it.
//
// RULE 1: A POP-UP MEASURES ITSELF AGAINST THE VISIBLE SCREEN.
//
// `vh` is the LAYOUT viewport, measured as though the phone's address bar were
// hidden. `dvh` is the part actually visible right now. On a Mac the two are
// identical, because a desktop window has no chrome that comes and goes — so
// `max-h-[90vh]` is correct on every machine a developer owns and wrong on
// every phone, where it is 90% of a screen taller than the one being looked at
// and the bottom of the sheet, which is where the buttons are, is past the
// edge.
//
// Headless Chromium has no collapsing address bar either. Its `vh` and `dvh`
// are the same number, so the end-to-end suite passes on a broken sheet and
// always will. The rule is only checkable in the source.
//
// components/live/shared.tsx has said this since the message box was fixed, and
// for a long time was the ONLY place in the app that followed it.
//
// RULE 2: ANYTHING ENDING AT THE BOTTOM EDGE CLEARS THE HOME INDICATOR.
//
// `env(safe-area-inset-bottom)` is zero on a desktop and about thirty-four
// pixels on a recent phone. `bottom-4` is sixteen. Same shape of bug: invisible
// where it is written, and on a phone the swipe gesture wins over a tap, so a
// button down there cannot be pressed at all.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  if (statSync(full).isDirectory()) return walk(full);
  return /\.tsx?$/.test(name) ? [full] : [];
});
const files = [...walk('components'), ...walk('app')];

/** True for a line that is a comment. These rules are about what SHIPS. */
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line);

// app/global-error.tsx replaces the root layout when the app crashes, so it
// renders WITHOUT globals.css and can only use inline styles. An inline style
// object cannot hold `min-height` twice, so it cannot express the `vh` then
// `dvh` pair that every other overlay uses. A crash screen a few pixels taller
// than the glass is the cheapest bug in this file; adding a <style> tag to a
// crash handler to fix it is not worth the risk of the crash handler crashing.
const NO_FALLBACK_POSSIBLE = ['app/global-error.tsx'];

// ---------------------------------------------------------------------------
// 1. No overlay measures itself in plain `vh`.
// ---------------------------------------------------------------------------
// A `vh` is allowed only where a `dvh` of the same number stands beside it, as
// the fallback for a browser too old to know the newer unit.
{
  const offenders = [];
  for (const file of files) {
    if (NO_FALLBACK_POSSIBLE.some((f) => file.endsWith(f.replace('/', path.sep)))) continue;
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    for (const m of src.matchAll(/(\d+)vh\b/g)) {
      const n = m[1];
      if (isComment(lines[src.slice(0, m.index).split('\n').length - 1] ?? '')) continue;
      // `svh` and `lvh` are deliberate choices about WHICH viewport, not the
      // accident this is looking for.
      if (/[sl]vh\b/.test(src.slice(Math.max(0, m.index - 1), m.index + 4))) continue;
      const line = src.slice(0, m.index).split('\n').length;
      // The companion may be on the same attribute, a few characters either
      // way: `max-h-[85vh] ... [max-height:85dvh]`.
      const near = src.slice(Math.max(0, m.index - 400), m.index + 400);
      if (!new RegExp(`${n}dvh\\b`).test(near)) {
        offenders.push(`${file}:${line} uses ${n}vh with no ${n}dvh beside it`);
      }
    }
  }
  ok(offenders.length === 0,
    offenders.length
      ? `these measure themselves against a screen that is not there:\n        ${offenders.join('\n        ')}`
      : 'every viewport height in the app has a dvh, so pop-ups fit the screen a person can see');
}

// ---------------------------------------------------------------------------
// 2. The utilities that carry both rules exist and say what they do.
// ---------------------------------------------------------------------------
{
  const css = readFileSync('app/globals.css', 'utf8');
  ok(/\.overlay-sheet\b[^}]*max-height:\s*85dvh/s.test(css),
    'the bottom-sheet class caps itself to the visible screen');
  ok(/\.overlay-sheet\b[^}]*env\(safe-area-inset-bottom/s.test(css),
    'and keeps its content clear of the home indicator');
  ok(/\.safe-bottom\s*\{[^}]*env\(safe-area-inset-bottom/s.test(css),
    'there is one class for anything anchored to the bottom edge');
}

// ---------------------------------------------------------------------------
// 3. Everything anchored to the bottom of the screen uses it.
// ---------------------------------------------------------------------------
// A fixed element positioned from the bottom, with no safe-area handling of its
// own, is one sitting under the home indicator.
{
  // ONE MORE CLASS CLEARS IT, since the bottom bar (30 September 2026): the
  // bar itself (`tab-bar`, which reaches the edge and pads its tabs above the
  // indicator). Accepted only while the stylesheet says so, so it cannot
  // become an exemption that no longer does anything.
  const css = readFileSync('app/globals.css', 'utf8');
  const clears = (cls) =>
    new RegExp(`\\.${cls}\\s*\\{[^}]*(padding|margin)-bottom:[^;}]*env\\(safe-area-inset-bottom`).test(css);
  const ALSO = ['tab-bar'].filter(clears);
  ok(ALSO.length === 1, `the bottom bar clears the home indicator in globals.css (${ALSO.join(', ') || 'it does not'})`);

  const offenders = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      if (!/\bfixed\b/.test(line)) return;
      if (!/\bbottom-(0|1|2|3|4|5|6)\b/.test(line)) return;
      if (/safe-bottom/.test(line)) return;
      if (/safe-area-inset-bottom/.test(line)) return;
      if (ALSO.some((cls) => new RegExp(`(^|["\\s])${cls}(["\\s]|$)`).test(line))) return;
      // The line may set the padding a line or two below, as the coach panel
      // does inside a template string.
      const near = lines.slice(i, i + 6).join('\n');
      if (/safe-area-inset-bottom|safe-bottom/.test(near)) return;
      offenders.push(`${file}:${i + 1}`);
    });
  }
  ok(offenders.length === 0,
    offenders.length
      ? `these sit at the bottom edge with nothing keeping them off the home indicator:\n        ${offenders.join('\n        ')}`
      : 'everything anchored to the bottom edge clears the home indicator');
}

// ---------------------------------------------------------------------------
// 4. No pop-up is positioned by a hard-coded header height.
// ---------------------------------------------------------------------------
// `fixed ... top-16` means "four rem below the top", which is the height of ONE
// header row. The live header wraps its sections onto a second row below `lg`,
// so the same rule drops the panel on top of the header it hangs from. Two
// separate panels shipped with that number in them.
{
  const offenders = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (isComment(line)) return;
      if (/\bfixed\b[^"'`]*\btop-(1[0-9]|[2-9][0-9])\b/.test(line)) {
        offenders.push(`${file}:${i + 1}`);
      }
    });
  }
  ok(offenders.length === 0,
    offenders.length
      ? `these guess the header's height instead of measuring it:\n        ${offenders.join('\n        ')}`
      : 'no pop-up guesses how tall the header is');
}

// ---------------------------------------------------------------------------
// 5. Anchored panels go through the one component that clamps them.
// ---------------------------------------------------------------------------
{
  const offenders = [];
  for (const file of files) {
    if (file.endsWith('AnchoredPanel.tsx')) continue;
    const src = readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (isComment(line)) return;
      // A panel hung off a button: absolutely positioned to one edge, and WIDE.
      //
      // The width matters. An earlier version of this rule asked only for a
      // `w-` and flagged the show-password eye inside a login field, which is
      // `absolute inset-y-0 right-0 w-12` and is not a pop-up at all. A panel
      // is w-64 or more; `inset-y-0` means it is stretched inside a field,
      // which a dropdown never is.
      if (/\binset-y-0\b/.test(line)) return;
      const anchored = /absolute[^"'`]*\b(right|left)-0\b/.test(line);
      const wide = /\bw-(6[4-9]|[7-9]\d|\d{3}|\[)/.test(line);
      if (anchored && wide) {
        offenders.push(`${file}:${i + 1}`);
      }
    });
  }
  ok(offenders.length === 0,
    offenders.length
      ? `these hang a fixed-width panel off a button without clamping it to the screen:\n        ${offenders.join('\n        ')}`
      : 'every anchored panel is positioned by AnchoredPanel, which clamps it');
}

// ---------------------------------------------------------------------------
// 6. Nothing asks to wrap and refuses to shrink at the same time.
// ---------------------------------------------------------------------------
// `flex-wrap` and `shrink-0` on the same element cancel each other out, and
// shrink-0 wins: it pins the row at the width of all its children in one line,
// so the row can NEVER wrap and simply runs off the side instead. It reads as
// careful markup, which is why it survived in two places. The reported screen
// showed an invitation with "Re-send", "Cancel", and half the word "Copy",
// with the rest past the edge of the glass.
{
  const offenders = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    src.split('\n').forEach((line, i) => {
      if (isComment(line)) return;
      const cls = line.match(/className="([^"]*)"/)?.[1] ?? '';
      if (/\bflex-wrap\b/.test(cls) && /\bshrink-0\b/.test(cls)) {
        offenders.push(`${file}:${i + 1}`);
      }
    });
  }
  ok(offenders.length === 0,
    offenders.length
      ? `these ask to wrap and refuse to shrink, so they overflow instead:\n        ${offenders.join('\n        ')}`
      : 'nothing asks to wrap while refusing to shrink');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
