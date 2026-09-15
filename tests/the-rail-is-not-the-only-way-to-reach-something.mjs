// Nothing lives only in a rail that a phone never draws.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Asked plainly: "can we add the pocket app features in pads
// and mobile too?" -- and the answer was that it had never been on either.
//
// The pocket was put in the right rail, which is where it was asked for, with
// the gap between the desk and the player circled in red on a desktop browser.
// That rail is `hidden ... xl:block`. `xl` is 1280px. An iPad mini is 744px
// across, an iPad Pro 1024px, a phone about 400px. So the feature shipped
// invisible to every tablet, every phone, and any laptop in a split window --
// which is most of the congregation this app is for.
//
// THE POINT IS THE RULE, NOT THE POCKET. Asserting "the pocket is also rendered
// outside the rail" fixes today and catches nothing tomorrow; the next thing
// somebody drops into the rail will have the same problem, and the whole reason
// this keeps happening is that the rail is the obvious place to put a small
// panel and its breakpoint is invisible while you are writing the code. So this
// reads the rail's own class list, works out that it is hidden below some
// breakpoint, and then requires every interactive panel in it to have a second
// home that is not behind the same gate.
//
// The player is the worked example of doing it right: PlayerStrip is in the
// rail AND PlayerPanel is in the Library room, so a phone can still play
// something. The pocket had no such home until it was given one.
//
//   node tests/the-rail-is-not-the-only-way-to-reach-something.mjs
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
  src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

const rails = strip(read('components/RoomRails.tsx'));

// ---------------------------------------------------------------------------
// 1. THE RAIL REALLY IS HIDDEN ON A SMALL SCREEN
// ---------------------------------------------------------------------------
//
// Established rather than assumed, so that if somebody ever makes the rail
// visible everywhere the rest of this file relaxes by itself instead of
// demanding a second home nothing needs any more.
const aside = /<aside[\s\S]{0,400}?className="([^"]+)"/.exec(rails);
ok(!!aside, 'the right rail declares its classes where they can be read');

const railClasses = aside ? aside[1] : '';
const hiddenBelow = /\bhidden\b/.test(railClasses) && /\b(sm|md|lg|xl|2xl):block\b/.test(railClasses);
const breakpoint = (/\b(sm|md|lg|xl|2xl):block\b/.exec(railClasses) ?? [])[1] ?? 'none';

// NOT AN ASSERTION, A BRANCH -- and it was an assertion first, which is the
// same defect this file exists to catch. The comment above said the check
// "relaxes by itself" if the rail is ever shown everywhere; the code failed
// instead, so the prose described an intention the code did not have. Caught by
// deliberately making the rail visible and watching a green run go red for a
// change that FIXED the underlying problem.
//
// A rail visible at every size cannot strand anything, so there is nothing left
// to prove and the rest is skipped rather than failed.
ok(true, hiddenBelow
   ? `the rail is hidden below ${breakpoint}, so anything only in it is unreachable there`
   : 'the rail is visible at every size, so nothing can be stranded by it — rest skipped');

// ---------------------------------------------------------------------------
// 2. EVERY PANEL IN IT THAT A PERSON USES HAS A SECOND HOME
// ---------------------------------------------------------------------------
//
// Only panels somebody ACTS on. A decorative card that merely restates
// information available elsewhere is not a thing to be stranded by; a control
// somebody taps is.
if (hiddenBelow) {
  const shells = ['components/LiveAppShell.tsx', 'components/AppShell.tsx']
    .map((f) => ({ file: f, code: strip(read(f)) }));

  // name -> the file that gives it a home a small screen can reach.
  const PANELS = [
    { name: 'Pocket', why: 'shortcuts somebody taps to open a web app' },
    { name: 'PlayerStrip', why: 'the ambient player', alsoSatisfiedBy: 'PlayerPanel' },
  ];

  for (const panel of PANELS) {
    // A second rendering outside the rail counts only if it is NOT itself
    // gated at or above the rail's breakpoint. `xl:hidden` is the opposite --
    // it shows exactly where the rail does not, which is the whole point.
    const placed = shells.some(({ code }) => {
      const uses = [...code.matchAll(new RegExp(`<${panel.name}\\b[^>]*`, 'g'))].map((m) => m[0]);
      return uses.some((u) => new RegExp(`${breakpoint}:hidden`).test(u));
    });

    const elsewhere = panel.alsoSatisfiedBy
      ? fs.readdirSync(path.join(root, 'app'), { recursive: true })
          .filter((f) => typeof f === 'string' && f.endsWith('page.tsx'))
          .some((f) => read(path.join('app', f)).includes(panel.alsoSatisfiedBy))
      : false;

    ok(placed || elsewhere,
       `${panel.name} (${panel.why}) is reachable below ${breakpoint}`
       + (placed ? ' — rendered outside the rail' : '')
       + (elsewhere ? ` — has a home via ${panel.alsoSatisfiedBy}` : ''));
  }

  // AND NEVER BOTH AT ONCE. Two pockets on one screen is a different bug, and
  // the `xl:hidden` half is what prevents it.
  for (const { file, code } of shells) {
    const dupes = [...code.matchAll(/<Pocket\b[^>]*/g)].map((m) => m[0]);
    ok(dupes.every((u) => new RegExp(`${breakpoint}:hidden`).test(u)),
       `${path.basename(file)} draws the pocket only where the rail does not`);
  }
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
