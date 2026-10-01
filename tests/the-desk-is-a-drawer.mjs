// On a phone or a pad the desk is a drawer from the right edge; on a desktop
// it is the column beside the page it always was.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Asked for on 30 September 2026, with a screenshot of a
// phone scrolled past the page into My office, On the desk, Pocket and Player:
// "the mini office (like in the desktop) should not be at the bottom for users
// to scroll down at least. For mobile and pads can you make it like a side
// screen where it's only optional to click? Like I'll just click a mini
// cabinet with an arrow '<<<' to appear on it or swipe it at the corner and it
// will appear, and it will disappear if I click an arrow '>>>'."
//
// THE TRAP THIS WATCHES FOR IS ONE LINE OF CSS. On a desktop the drawer box
// steps out of the layout with `display: contents`, but `visibility` is
// inherited through a box like that: a closed drawer's `visibility: hidden`
// would hide the desktop's desk while every screenshot of a phone looked fine.
//
//   node tests/the-desk-is-a-drawer.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTs } from './_strip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const read = (p) => stripTs(raw(p));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const drawer = read('components/DeskDrawer.tsx');
const css = raw('app/globals.css');

// 1. Both shells put the desk in the drawer.
for (const [file, flag] of [['components/AppShell.tsx', 'prefs.rightRail'], ['components/LiveAppShell.tsx', 'room.prefs.rightRail']]) {
  const src = read(file);
  ok(new RegExp(`${flag.replace('.', '\\.')} && \\([\\s\\S]{0,120}<DeskDrawer[\\s\\S]{0,200}<RightRail`).test(src)
     && /<\/DeskDrawer>/.test(src),
     `${file}: the desk is inside the drawer`);
}

// 2. It starts closed, and every way in and out that was asked for is there.
ok(/useState\(false\)/.test(drawer), 'it starts closed: the desk is only there when somebody asks for it');
ok(/data-desk-tab/.test(drawer) && /‹‹‹/.test(drawer) && /<CabinetGlyph \/>/.test(drawer),
   'a small cabinet with ‹‹‹ on the right edge opens it');
ok(/data-desk-close/.test(drawer) && /›››/.test(drawer), 'and ››› inside puts it away');
ok(/clientX >= window\.innerWidth - EDGE/.test(drawer) && /dx < -PULL/.test(drawer) && /dx > PULL/.test(drawer),
   'a swipe in from the right edge opens it, and a swipe to the right closes it');
ok(/Math\.abs\(dx\) > Math\.abs\(dy\)/.test(drawer), 'but not a thumb scrolling the page that drifts sideways');
ok(/event\.key === 'Escape'/.test(drawer) && /data-desk-backdrop/.test(drawer),
   'Escape, or a tap on the dimmed page, puts it away too');
ok(/aria-expanded=\{open\}/.test(drawer) && /aria-label=\{`Open \$\{label\}`\}/.test(drawer),
   'the tab says what it opens, and whether it is open');

// 3. Below 1280px it slides in from the right; from 1280px it is the column.
ok(/\.desk-drawer\s*\{[^}]*position: fixed;[^}]*right: 0;[^}]*transform: translateX\(105%\);[^}]*visibility: hidden;/.test(css),
   'below 1280px it waits off the right edge');
ok(/\.desk-drawer\[data-open='true'\]\s*\{[^}]*transform: translateX\(0\);[^}]*visibility: visible;/.test(css),
   'and slides in when opened');
ok(/@media \(min-width: 1280px\)\s*\{\s*\.desk-drawer\s*\{\s*display: contents;\s*visibility: visible;/.test(css),
   'from 1280px it steps out of the layout, AND resets visibility, so the desktop\'s desk is not hidden with it');
ok(/className="desk-tab[^"]*xl:hidden/.test(drawer) && /desk-drawer-head xl:hidden/.test(drawer)
   && /desk-backdrop[^`]*xl:hidden/.test(drawer),
   'and the tab, the arrows and the dimming are phone and pad only');

// 4. Nothing floats over it, and it moves only for whoever has not asked it to stop.
ok(/body:has\(\[data-desk-drawer\]\[data-open='true'\]\) \[data-steps-aside-for-chat\]/.test(css),
   'what floats above the page steps aside while the drawer is open');
ok(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.desk-drawer,/.test(css),
   'and it slides only for people who have not asked for less movement');

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
