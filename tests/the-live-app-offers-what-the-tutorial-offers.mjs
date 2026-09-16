// Anything the tutorial can do, the real app can do.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Reported with a screenshot of the live settings page: "Open
// Hope Beacon is missing the general settings that the Local Church has, like
// make the letters big or small or general settings at all. Can we add the
// please for ALL users."
//
// It was not missing. app/settings/page.tsx -- the settings page inside the
// TUTORIAL -- had a folder called "Language and size" holding both controls.
// components/LiveAccountPages.tsx -- the settings page every real person opens
// -- had five folders and none of them was that one. It never imported
// useLocale at all.
//
// So the app could make its text bigger for somebody pretending, and not for
// anybody using it. lib/i18n.tsx had held the scale, its storage key, the
// effect that applies it and the word "textSize" in sixteen languages the whole
// time, and LocaleProvider was mounted app-wide in app/layout.tsx. Every layer
// was built except the one that shows it -- the same shape as the deaf Office
// room and the blank Pairing-requests tab.
//
// THE REAL DEFECT IS THAT NOTHING COMPARED THE TWO PAGES. The demo and the live
// app are two renderings of one product, and a feature can be added to one and
// forgotten in the other with nothing going red. A test that asserted "the live
// page has a reading folder" would fix today and catch nothing tomorrow. So
// this compares the two lists and fails on ANY folder the tutorial offers that
// the real app does not, including ones nobody has written yet.
//
//   node tests/the-live-app-offers-what-the-tutorial-offers.mjs
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

const demo = strip(read('app/settings/page.tsx'));
const liveSrc = read('components/LiveAccountPages.tsx');
const live = strip(liveSrc);

/** Every `id: '...'` inside a `const rooms: Room[] = [ ... ]` declaration. */
function folders(code) {
  const out = new Set();
  const re = /const rooms:\s*Room\[\]\s*=\s*\[/g;
  let m;
  while ((m = re.exec(code))) {
    let i = re.lastIndex - 1, depth = 0;
    for (; i < code.length; i += 1) {
      if (code[i] === '[') depth += 1;
      else if (code[i] === ']') { depth -= 1; if (depth === 0) break; }
    }
    for (const f of code.slice(re.lastIndex, i).matchAll(/id:\s*'([^']+)'/g)) out.add(f[1]);
  }
  return out;
}

const demoRooms = folders(demo);
const liveRooms = folders(live);

ok(demoRooms.size > 0 && liveRooms.size > 0,
   `both settings pages declare folders (tutorial ${demoRooms.size}, live ${liveRooms.size})`);

// THE ONE THAT MATTERS.
const missing = [...demoRooms].filter((id) => !liveRooms.has(id));
ok(missing.length === 0,
   missing.length
     ? `the real app is MISSING folders the tutorial offers: ${missing.join(', ')}`
     : 'every folder the tutorial offers, the real app offers too');

// ---------------------------------------------------------------------------
// AND THE READING CONTROLS REACH EVERYBODY
// ---------------------------------------------------------------------------
//
// "Can we add the please for ALL users" is the request, so the absence of a
// role test is the thing to assert. A folder added behind `leads ?` would
// satisfy the comparison above and still fail the person who asked.
{
  // FOUND BY WHAT IT HOLDS, NOT BY ITS NAME. This pinned the id 'reading' and
  // then failed the day seven tabs were merged into one General folder -- a
  // change that did not touch who may reach the screen at all. The rule is that
  // language and text size reach everybody; the folder's name is not the rule.
  const holder = (live.match(/\{room === '([a-z-]+)' && <ReadingSettings/) ?? [])[1];
  ok(!!holder, 'some folder draws the reading settings');
  const line = live.split('\n').find((l) => new RegExp(`id:\\s*'${holder}'`).test(l)) ?? '';
  ok(!!line && !/\?|&&|leads|role/.test(line),
     `the folder holding text size (${holder ?? 'none'}) has no role test on it`);

  // BOUND TO ONE SOURCE, NOT TWO COPIES THAT AGREE TODAY. Two pages rendering
  // their own copy of the same card is what let them drift in the first place.
  const shared = 'ReadingSettings';
  ok(live.includes(shared) && demo.includes(shared),
     'both pages render the one shared reading component, not a copy each');
}

// ---------------------------------------------------------------------------
// THE SCALE IS APPLIED, NOT MERELY STORED
// ---------------------------------------------------------------------------
//
// A number in localStorage that nothing reads is not a text size. The effect
// that writes it onto the root font size is what makes the setting real, so the
// assignment itself is what gets checked -- not the presence of the constant,
// which is the mistake the conversation check already had to correct once.
{
  const i18n = strip(read('lib/i18n.tsx'));
  ok(/documentElement\.style\.fontSize\s*=/.test(i18n),
     'the chosen size is written onto the root font size');
  ok(/documentElement\.style\.fontSize\s*=[^\n;]*scale/.test(i18n),
     'and it is the chosen scale that is written, not a fixed number');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
