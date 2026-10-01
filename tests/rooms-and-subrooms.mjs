// A room with subrooms, and every panel inside exactly one of them.
//
// THE REPORT, with a drawing: rooms are main folders and subrooms are folders
// inside them. "I want the Office room to have subrooms for the user not to
// scroll down to look for their tool equipment... If I pick the Lesson studies
// subroom, I will automatically go there and create my own Lesson studies, not
// scroll down and find it."
//
// The Office was nine panels stacked down one page. A Guide who came here to
// write a study walked past their numbers, the shelf, two pairing cards and a
// recommendation form to reach it, every time.
//
// WHAT CAN GO WRONG LATER, and what this file is for:
//
//   1. Somebody adds a panel and drops it in unguarded. It then draws in every
//      subroom, and the room is a scroll again with tabs painted on top.
//   2. Somebody puts a panel in two subrooms. It is then in neither, as far as
//      the person hunting for it is concerned.
//   3. A link points at `?room=` an id that does not exist. The subroom falls
//      back to the first one and the person is somewhere they did not ask for,
//      which is the original complaint restated.
//
// The browser walk in `tests/e2e/office-subrooms.js` proves the tapping. This
// proves the shape, because the live Office needs a database session the
// sandbox cannot hold and only the sample half can be rendered here.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, '');

// EVERY ROOM THAT HAS SUBROOMS, not the Office alone.
//
// The Office went first because it was the worst, and then the same treatment
// went to the rest: measured on a 390px phone with sample data, an Explorer's
// journey ran to 6.6 screens, Settings to 6.7 for a Director, the Library to
// 11.2. Each entry below is a component that draws a strip, and the rules after
// it apply to all of them.
const ROOMS_WITH_SUBROOMS = [
  ['app/office/page.tsx', 'LiveOffice', 'the live Office'],
  ['app/office/page.tsx', 'DemoOffice', 'the sample Office'],
  ['components/live/ExplorerPage.tsx', 'LiveExplorerPage', "an Explorer's journey"],
  ['app/ds/page.tsx', 'Home', "the sample journey"],
  ['components/live/GuidePages.tsx', 'LiveGuidePage', "a Guide's home"],
  ['app/dm/page.tsx', 'Dashboard', "the sample Guide's home"],
  ['components/LiveChurchPages.tsx', 'ChurchRooms', 'the live Church'],
  ['app/church/page.tsx', 'Body', 'the sample Church'],
  ['components/LiveAccountPages.tsx', 'LiveSettingsPage', 'live Settings'],
  ['app/settings/page.tsx', 'Body', 'sample Settings'],
  ['app/library/page.tsx', 'LibraryPage', 'the Library'],
];

const office = readFileSync('app/office/page.tsx', 'utf8');

// ---------------------------------------------------------------------------
// 1. Every one of them uses the shared mechanism.
// ---------------------------------------------------------------------------
// Not a hand-rolled useState per screen. The mechanism carries the remembered
// choice, the `?room=` override that makes a link work, and the hash
// translation that keeps an old anchor arriving somewhere; a screen that rolls
// its own gets none of those and nobody notices until a link goes dead.
const sources = new Map();
for (const [file] of ROOMS_WITH_SUBROOMS) {
  if (!sources.has(file)) sources.set(file, stripComments(readFileSync(file, 'utf8')));
}

for (const [file, fn, label] of ROOMS_WITH_SUBROOMS) {
  const src = sources.get(file);
  ok(/from '@\/components\/Rooms'/.test(src), `${label} imports the shared Rooms mechanism`);
  ok(new RegExp(`function ${fn}\\(`).test(src), `${label} is where it says it is (${fn})`);
}

// ---------------------------------------------------------------------------
// 2. Every panel is inside exactly one subroom.
// ---------------------------------------------------------------------------
// Brace-tracked rather than matched by regex: a `{room === 'x' && ...}` block
// contains arrow functions and nested JSX, and anything that stops at the first
// `}` reports whatever it likes.
function panelsByRoom(source, fnName) {
  const start = source.indexOf(`function ${fnName}(`);
  if (start === -1) return null;
  // Brace-match the function's own body. Slicing to the next `function` keyword
  // ran one body to the end of the file and swept up components that are not
  // panels and are not in a subroom, a failure that was entirely this reader's
  // and exactly the reason to bound it properly.
  const open = source.indexOf('{', source.indexOf(')', start));
  let d = 0, end = open;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') d += 1;
    else if (source[i] === '}') { d -= 1; if (d === 0) { end = i + 1; break; } }
  }
  const body = source.slice(start, end);
  const found = [];
  const stack = [];
  let depth = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '{') {
      const m = /^\{\s*room === '([a-z]+)'/.exec(body.slice(i, i + 40));
      depth += 1;
      if (m) stack.push({ id: m[1], depth });
      continue;
    }
    if (ch === '}') {
      while (stack.length && stack[stack.length - 1].depth === depth) stack.pop();
      depth -= 1;
      continue;
    }
    const tag = /^<(Live[A-Za-z]+|Analytics|LessonSeriesLibrary)[\s/>]/.exec(body.slice(i, i + 40));
    if (tag) found.push({ panel: tag[1], room: stack.length ? stack[stack.length - 1].id : null });
  }
  return found;
}

// The shell is not a panel; it is the thing the panels are inside.
const NOT_A_PANEL = ['LiveAppShell', 'AppShell'];

// DELIBERATELY OUTSIDE THE FOLDERS, each with the reason it is out there. This
// is a list, and a list is what this file argues against everywhere else, so it
// earns its place only by being a list of decisions rather than a list of
// whatever happened to exist. Adding to it should feel like a decision.
const ALWAYS_ON = {
  // "For Guides and Directors and ED I should see it first in my homescreen."
  // A notice the church has pinned is above the folders on a Guide's home for
  // that reason, and putting it inside one would undo what was asked for.
  'components/live/GuidePages.tsx': ['LiveAnnouncements'],
};

for (const [file, fn, label] of ROOMS_WITH_SUBROOMS) {
  const panels = panelsByRoom(sources.get(file), fn);
  if (!panels || panels.length === 0) continue;   // a room built from local parts
  const exempt = [...NOT_A_PANEL, ...(ALWAYS_ON[file] ?? [])];

  const loose = [...new Set(panels
    .filter((p) => p.room === null && !exempt.includes(p.panel))
    .map((p) => p.panel))];
  ok(loose.length === 0,
     loose.length
       ? `${label}: these draw in every subroom because nothing guards them: ${loose.join(', ')}`
       : `${label}: every panel is inside a subroom (${panels.length})`);

  const where = new Map();
  for (const p of panels) {
    if (!p.room) continue;
    if (!where.has(p.panel)) where.set(p.panel, new Set());
    where.get(p.panel).add(p.room);
  }
  const twice = [...where].filter(([, set]) => set.size > 1)
    .map(([panel, set]) => `${panel} (${[...set].join(', ')})`);
  ok(twice.length === 0,
     twice.length
       ? `${label}: these are in more than one subroom, so nobody knows where to look: ${twice.join('; ')}`
       : `${label}: and no panel is in two subrooms at once`);
}

// ---------------------------------------------------------------------------
// 3. Nothing was lost on the way in.
// ---------------------------------------------------------------------------
// Splitting a page into folders is a lot of moving, and a panel that is still
// imported and no longer drawn is a tool that has quietly disappeared from
// somebody's screen. TypeScript will not say a word about it.
{
  const officePanels = panelsByRoom(sources.get('app/office/page.tsx'), 'LiveOffice') ?? [];
  const demoPanels = panelsByRoom(sources.get('app/office/page.tsx'), 'DemoOffice') ?? [];
  const imported = [...office.matchAll(/import \{([^}]+)\} from '@\/components\/[^']+'/g)]
    .flatMap((m) => m[1].split(',').map((n) => n.trim()))
    .filter((n) => /^(Live[A-Z]|Analytics$|LessonSeriesLibrary$)/.test(n))
    .filter((n) => !['LiveAppShell'].includes(n));
  const drawn = new Set([...officePanels, ...demoPanels].map((x) => x.panel));
  const orphaned = imported.filter((n) => !drawn.has(n));
  ok(orphaned.length === 0,
     orphaned.length
       ? `these are imported into the Office and drawn nowhere: ${orphaned.join(', ')}`
       : `every tool the Office imports is still in one of its subrooms (${imported.length})`);
}

// ---------------------------------------------------------------------------
// 4. The first subroom is what the room is for.
// ---------------------------------------------------------------------------
// `useRoom` opens the first one when there is nothing remembered, so the order
// of the list is a decision rather than a detail.
{
  const firstOf = (src, after = 0) => {
    const at = src.indexOf('const rooms: Room[] = ', after);
    if (at === -1) return null;
    return /\{ id: '([a-z]+)'/.exec(src.slice(at, at + 900))?.[1] ?? null;
  };
  const officeSrc = sources.get('app/office/page.tsx');
  const listStart = officeSrc.indexOf('const rooms: Room[] = ');
  const splitAt = officeSrc.indexOf(': [', listStart);
  const guideFirst = /\{ id: '([a-z]+)'/.exec(officeSrc.slice(listStart, splitAt))?.[1];
  ok(guideFirst === 'studies',
     `a Guide's Office opens on Lesson studies, which is what they come to it for (${guideFirst})`);
  const leadFirst = /\{ id: '([a-z]+)'/.exec(officeSrc.slice(splitAt, officeSrc.indexOf('const [room')))?.[1];
  ok(leadFirst === 'numbers',
     `and a Director's opens on the numbers (${leadFirst})`);

  // AN EXPLORER'S JOURNEY OPENS ON THEIR GUIDE. The journey is a relationship,
  // and the relationship is the point of the screen.
  for (const [file, fn, label, expected] of [
    ['components/live/ExplorerPage.tsx', 'LiveExplorerPage', "an Explorer's journey", 'guide'],
    ['app/ds/page.tsx', 'Home', 'the sample journey', 'guide'],
    ['components/live/GuidePages.tsx', 'LiveGuidePage', "a Guide's home", 'people'],
    ['app/dm/page.tsx', 'Dashboard', "the sample Guide's home", 'people'],
  ]) {
    const src = sources.get(file);
    const at = src.indexOf(`function ${fn}(`);
    const got = firstOf(src, at);
    ok(got === expected, `${label} opens on ${expected} (${got})`);
  }
}

// ---------------------------------------------------------------------------
// 5. The relationship is not split up.
// ---------------------------------------------------------------------------
// An Explorer's route out of a conversation has to be on the same screen as the
// conversation. Putting the report control in a different folder from the
// thread would be the single worst thing this refactor could do.
//
// THE CONVERSATION MOVED INTO THE BUBBLE on 30 September 2026, asked for by the
// owner, and the report went WITH it: it is in the bubble's header, in words,
// on the same screen as the thread, never beside Send -- on both halves of the
// app. What stays on the Explorer's home is the order that was asked for: the
// Guide, then the church's notices, then the way into the conversation.
{
  const src = sources.get('components/live/ExplorerPage.tsx');
  const guideRoom = src.slice(src.indexOf("{room === 'guide' && ("), src.indexOf("{room === 'study'"));
  const surface = readFileSync('components/live/TalkSurface.tsx', 'utf8');
  const demo = readFileSync('components/DemoTalkDock.tsx', 'utf8');
  ok(/<TalkHeader[\s\S]{0,600}onReport=\{current \?/.test(surface) && /<LiveReportForm/.test(surface)
     && /<TalkHeader[\s\S]{0,700}onReport=\{current \?/.test(demo) && /<ReportDialog/.test(demo),
     'the conversation and the way out of it are on the same screen: the bubble, on both halves');
  ok(!/<Conversation/.test(guideRoom) && /<MessageButton/.test(guideRoom),
     'and the Explorer\'s home opens that conversation rather than keeping a second one');
  ok(/<GuideCard/.test(guideRoom) && /<LiveAnnouncements/.test(guideRoom),
     "and the church's notices still sit after the Guide's card, where they were asked to be");
  ok(guideRoom.indexOf('<GuideCard') < guideRoom.indexOf('<LiveAnnouncements')
     && guideRoom.indexOf('<LiveAnnouncements') < guideRoom.indexOf('<MessageButton'),
     'in that order: the Guide, then the notices, then the way to talk');
}

// ---------------------------------------------------------------------------
// 6. Every link into a subroom names one that exists.
// ---------------------------------------------------------------------------
{
  const ids = new Set([...sources.get('app/office/page.tsx').matchAll(/\{ id: '([a-z]+)'/g)].map((m) => m[1]));
  ok(ids.size >= 5, `the Office defines subrooms (${[...ids].join(', ')})`);

  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) ? [full.split(path.sep).join('/')] : [];
  });

  // Every hash that points into a room with subrooms must be translated by that
  // room, or it lands on a folder that is not drawing what it names.
  const HASH_OWNERS = [
    [/\/office#([a-z-]+)/g, 'app/office/page.tsx'],
    [/\/settings#([a-z-]+)/g, 'components/LiveAccountPages.tsx'],
    [/\/library#([a-z-]+)/g, 'app/library/page.tsx'],
  ];

  const broken = [];
  for (const file of [...walk('components'), ...walk('app'), ...walk('lib')]) {
    const src = stripComments(readFileSync(file, 'utf8'));
    for (const m of src.matchAll(/\/office\?room=([a-z]+)/g)) {
      if (!ids.has(m[1])) broken.push(`${file}: ?room=${m[1]}`);
    }
    for (const [re, owner] of HASH_OWNERS) {
      for (const m of src.matchAll(re)) {
        const ownerSrc = sources.get(owner) ?? stripComments(readFileSync(owner, 'utf8'));
        const named = new RegExp(`['\"]?${m[1]}['\"]?:\\s*'`).test(ownerSrc);
        if (!named) broken.push(`${file}: #${m[1]} is not translated to a subroom by ${owner}`);
      }
    }
  }
  ok(broken.length === 0,
     broken.length
       ? `these links point into a room at something that is not there:\n        ${broken.join('\n        ')}`
       : 'every link into a subroom names a subroom that exists');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
