// An Explorer's own room reaches them on the device they actually own.
//
// ---------------------------------------------------------------------------
// MEASURED, NOT INFERRED. Chromium, the tutorial shell, signed in as an
// Explorer, six viewports:
//
//   iPhone SE 375   rail HIDDEN -> 339px
//   Pixel     412   rail HIDDEN -> 376px
//   iPad mini 744   rail HIDDEN -> 708px
//   iPad Pro 1024   rail HIDDEN -> 988px
//   split    1180   rail HIDDEN -> 1144px
//   desktop  1440   rail 324px  -> 324px   (unchanged, as intended)
//
// The right rail was `hidden ... xl:block`, so everything personal in it died
// below 1280px: the study timer, the theme picker, and the line an Explorer
// writes for themselves. None of those exist anywhere else -- Settings offers
// no theme and no motto -- so below 1280px they were not awkward to reach, they
// were gone. Every device an Explorer owns is below 1280px.
//
// WHY COUNTING NODES WAS NOT ENOUGH, and this is the trap this file exists to
// remember: in the BROKEN state the timer's three buttons and the theme's five
// swatches were still in the DOM and still counted. They were under
// display:none. A check that counts elements passes happily on a screen nobody
// can see. So the rule asserted here is about the rail not being hidden, which
// is the thing that was actually wrong.
//
// AND WHY THE RAIL MOVES RATHER THAN BEING COPIED. The pocket was rescued from
// this same breakpoint by rendering a SECOND copy in the main column at
// `xl:hidden`. That is safe for the pocket, which only reads rows. It is not
// safe for what sits beside it: FocusTimer owns a setInterval, so two mounts is
// two timers, the hidden one still counting down, and a study that reads 25:00
// after somebody rotates their tablet. One mount is load-bearing.
//
//   node tests/the-room-belongs-to-its-owner-at-any-width.mjs
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

const strip = (src) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

const rails = strip(read('components/RoomRails.tsx'));

// ---------------------------------------------------------------------------
// 1. THE RAIL IS NOT HIDDEN FROM THE PEOPLE IT BELONGS TO
// ---------------------------------------------------------------------------
{
  // The aside's own class list, found by the element rather than by a pinned
  // string, so reordering Tailwind classes or renaming a width does not fail a
  // rule about visibility.
  const aside = (rails.match(/<aside[\s\S]{0,600}?className="([^"]+)"/) ?? [])[1] ?? '';
  ok(aside.length > 0, 'the right rail is an aside with a class list');

  // `hidden` with no breakpoint is the defect itself: it applies from 0px up.
  ok(!/(^|\s)hidden(\s|$)/.test(aside),
     'the rail is not display:none on phones and tablets');

  // And it still becomes the narrow sticky column on a wide screen -- the fix
  // must not cost the desktop layout it already had.
  ok(/xl:w-\d/.test(aside) && /xl:sticky/.test(aside),
     'and from xl it is still the sticky column it always was');
}

// ---------------------------------------------------------------------------
// 2. ONE MOUNT, BECAUSE ONE OF THEM COUNTS DOWN
// ---------------------------------------------------------------------------
{
  const files = fs.readdirSync(path.join(root, 'components'))
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => ['components/' + f, strip(read('components/' + f))]);

  const mounts = files.flatMap(([f, src]) =>
    [...src.matchAll(/<FocusTimer\b/g)].map(() => f));
  ok(mounts.length === 1,
     `FocusTimer is mounted exactly once (found ${mounts.length}${mounts.length ? ': ' + mounts.join(', ') : ''})`);

  // The pocket's rescue copy is what this replaces. A second one reappearing
  // means somebody has hidden the rail again and worked around it.
  const copies = files.flatMap(([f, src]) =>
    [...src.matchAll(/<Pocket\b[^>]*xl:hidden/g)].map(() => f));
  ok(copies.length === 0,
     `no shell renders a second xl:hidden copy of the pocket${copies.length ? ' (' + copies.join(', ') + ')' : ''}`);
}

// ---------------------------------------------------------------------------
// 3. THE SHELLS STACK, OR THE RAIL SQUASHES THE PAGE INSTEAD OF FOLLOWING IT
// ---------------------------------------------------------------------------
//
// A visible rail inside a row-direction flex container does not drop below the
// main column -- it sits beside it and takes width from it, which on a 375px
// phone is worse than hiding. The two halves of this fix only work together.
{
  for (const shell of ['components/LiveAppShell.tsx', 'components/AppShell.tsx']) {
    const src = strip(read(shell));

    // FOUND BY WHAT IT WRAPS, NOT BY A CLASS IT HAPPENS TO SHARE. The first
    // version of this matched the first element carrying `max-w-[1600px]` --
    // which in AppShell is the header bar, a different element with the same
    // max width. It reported the layout row as unstacked while the row was
    // already correct. The container that matters is the one the rails are
    // mounted inside, so it is located by the rail mount itself.
    const at = src.search(/\{\s*(?:room\.)?prefs\.leftRail\s*&&/);
    ok(at > 0, `${shell} mounts the rails`);
    const before = src.slice(0, at);
    const row = [...before.matchAll(/<div className="([^"]+)"/g)].pop()?.[1] ?? '';

    ok(/max-w-\[1600px\]/.test(row), `${shell} has the three-column container`);
    ok(/(^|\s)flex-col(\s|$)/.test(row) && /xl:flex-row/.test(row),
       `${shell} stacks below xl, so the rail falls under the page`);
  }
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
