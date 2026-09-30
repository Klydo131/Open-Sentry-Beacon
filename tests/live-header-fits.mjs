// The signed-in header has to fit on a phone, and there has to be a way home.
//
// WHY THIS IS A SOURCE TEST AND NOT A BROWSER ONE. Every other layout check in
// this project renders the real page. This one cannot: the live shell only
// exists behind a Supabase session, and the sandbox these run in cannot reach
// Supabase at all. A browser test would have to sign in, so it would either be
// skipped or -- worse -- pass by rendering the login screen and finding nothing
// wrong with it.
//
// So this asserts the structure that the bug was made of. An iOS user reported
// a tall empty strip down the right of every screen. That strip was the page
// being wider than the phone: the header packed the logo, five 44px section
// icons, a mode switch, a bell, an install chip, an avatar and a "Sign out"
// button into ONE non-wrapping row where nearly everything was `shrink-0`. At
// 390px that row needs roughly 600px, so it ran off the side and took the
// document's width with it.
//
// The sample-data shell had already hit this exact bug and fixed it -- a church
// director photographed an icon resting on top of the logo -- and the live
// shell simply never received the same treatment.

import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('../components/LiveAppShell.tsx', import.meta.url), 'utf8');
const css   = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8');

let bad = 0;
const ok = (cond, msg) => { if (!cond) bad++; console.log(`${cond ? 'OK ' : 'BAD'} ${msg}`); };

// 1. A way home that reads as a button. The logo has always linked home, but a
//    logo is not a button to somebody who has never used the app. Since 30
//    September 2026 that button is People on the bottom bar, which opens each
//    role's own home and is on every screen of a phone or a pad.
ok(/<TabBar role=\{profile\.role\} \/>/.test(shell),
   'the live shell draws the bottom bar, whose People tab is the way home');

// 2 and 3. THE HEADER HOLDS NO ROOMS. It used to hold every room in a second
//    row that scrolled sideways, which is what made the header too wide for an
//    iPhone in the first place. The rooms are in the Menu now, so the header is
//    the brand and the person, and nothing in it can grow with the room count.
ok(!/aria-label="Sections"/.test(shell) && !/const SECTIONS/.test(shell),
   'the header has no row of rooms to overflow a phone');
ok(!/href:\s*'\//.test(shell.replace(/\/\/[^\n]*/g, '')),
   'and no list of rooms of its own to drift from the rail');

// 4. "Sign out" is the widest single word in that row and it lives nowhere else
//    in the app, so it must survive as a symbol rather than be dropped.
ok(/aria-label="Sign out"/.test(shell),
   'sign out keeps an accessible name when its text is hidden');
ok(/hidden text-sm font-semibold sm:inline/.test(shell),
   'the words "Sign out" are hidden on phones, not the control itself');

// 5. The guard that makes any future overflow harmless on iOS.
//
//    `overflow-x: clip` on the body alone was the state that shipped. Chrome
//    and Android honour it; WebKit does not reliably, and where a declaration
//    is not understood it is dropped -- which is why this reproduced on iOS and
//    not on Android.
ok(/html\s*\{[^}]*overflow-x:\s*clip/s.test(css),
   'the root element clips horizontal overflow');
ok(/@supports not \(overflow: clip\)/.test(css),
   'there is a fallback for engines without `overflow: clip` (iOS Safari)');
ok(/@supports not \(overflow: clip\)\s*\{\s*html\s*\{\s*overflow-x:\s*hidden/s.test(css),
   'the fallback puts `hidden` on html, not body, so sticky headers keep sticking');

// ---------------------------------------------------------------------------
// EVERY ROOM ON THE RAILS IS ALSO REACHABLE ON A PHONE.
// ---------------------------------------------------------------------------
// THE BUG THIS EXISTS FOR: "I need the lesson study editing features for guides
// to make their own lesson studies too, not just in mac or desktop."
//
// A Guide writes their own studies in the Office. The Office is on the rails,
// and the rails are `xl:block` — hidden below 1280px. So on every phone and
// every tablet the header row was the whole of the navigation, and it listed
// Church, Library, Profile and Settings. Office, Publish and Cases were rooms
// added after that list was written and never added to it.
//
// The fix that stuck (30 September 2026) was to stop having two lists. Below
// 1280px the navigation is the bottom bar, and its Menu draws the rail's own
// groups. So this now holds the three joints that make "every rail room is on
// a phone" true by construction rather than by two people remembering:
//   - both halves of the Menu page take their groups from railGroupsFor;
//   - the Menu drops nothing from those groups except Profile, which is the
//     card at its top;
//   - the bar that opens the Menu is in both shells and on My Files.
{
  const menuPage = readFileSync('app/menu/page.tsx', 'utf8');
  const menuList = readFileSync('components/MenuList.tsx', 'utf8');
  const demoShell = readFileSync('components/AppShell.tsx', 'utf8');
  const library = readFileSync('app/library/page.tsx', 'utf8');

  ok(/railGroupsFor\(profile\.role, \{\}, \{ mail: leadsChurch \}\)/.test(menuPage),
     'the live Menu draws the same groups as the live rail');
  ok(/useDemoRooms\(\)/.test(menuPage)
     && /export function useDemoRooms[\s\S]*?railGroupsFor\(currentUser\.role/.test(demoShell)
     && /useDemoRooms\(\)/.test(demoShell.slice(demoShell.indexOf('function DemoAppShell'))),
     'the sample Menu and the sample rail share one source of rooms');

  const filters = [...menuList.matchAll(/links\.filter\(\(l\) => ([^)]*)\)/g)].map((m) => m[1]);
  ok(filters.length === 1 && /^l\.href !== '\/profile'$/.test(filters[0].trim()),
     `the Menu leaves out nothing but Profile (${filters.join(' | ') || 'no filter found'})`);
  ok(/href="\/profile"/.test(menuList),
     'and Profile is the card at the top of it instead');

  ok(/<TabBar role=\{currentUser\.role\} \/>/.test(demoShell)
     && /<TabBar role=\{barRole\} \/>/.test(library),
     'the bar that opens the Menu is on the sample side and on My Files too');
}

console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
