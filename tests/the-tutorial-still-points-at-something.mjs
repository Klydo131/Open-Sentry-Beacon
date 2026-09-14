// The tutorial still points at something, and cannot quietly stop.
//
// ---------------------------------------------------------------------------
// ASKED FOR AS: "Make sure the tutorial, is always updated."
//
// WHAT GOES WRONG, AND WHY NOTHING CATCHES IT. The guided walk finds each step's
// subject with `document.querySelector('[data-quest="..."]')`. That string is
// the only bond between a step and the thing it points at, and NOTHING in the
// language checks it: rename a tab key, retire a room, and the step compiles,
// type-checks, ships, and lands its spotlight on nothing. The person following
// the walk is then stuck on a step that cannot be completed, which reads as
// "the app is broken" rather than "a marker moved".
//
// THIS IS NOT HYPOTHETICAL HERE. lib/quest.ts already carries the scar: the
// role-label map "still said Missionary and Admin two renames after those words
// were retired, because every pass went looking for the map it already knew
// about." The names drifted from the app while every check stayed green.
//
// THE PART THAT MAKES IT HARD, and the reason a naive version of this check is
// worse than none. Most markers are not written literally. They are built:
//
//     data-quest={`tab-${t.key}`}      components/ui.tsx, app/admin/page.tsx
//     data-quest={`room-${r.id}`}      components/Rooms.tsx
//
// A check that greps for `data-quest="tab-talk"` finds nothing and reports nine
// false failures -- which is exactly what the first draft of this file did. So
// the dynamic markers are resolved against the value universes that feed them:
// a `tab-x` target is satisfied when some tab declares `key: 'x'`, and `room-y`
// when some room declares `id: 'y'`. Those two prefixes are the only built ones;
// a third would have to be added here deliberately, which is the point.
//
//   node tests/the-tutorial-still-points-at-something.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

function sources(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sources(rel, out);
    else if (/\.(tsx|ts)$/.test(entry.name)) out.push(rel);
  }
  return out;
}
const FILES = [...sources('components'), ...sources('app'), ...sources('lib')];

// ---------------------------------------------------------------------------
// 1. EVERY STEP POINTS AT A MARKER THAT CAN EXIST
// ---------------------------------------------------------------------------
const quest = strip(read('lib/quest.ts'));

// Targets and fallback targets are written the same way, so one pattern gets
// both. A fallback that cannot resolve is as dead as a target that cannot.
const wanted = [...new Set([...quest.matchAll(/target:\s*'([^']+)'/g)].map((m) => m[1]))].sort();

// Markers written out in full.
const literal = new Set();
// The value universes the built markers draw from. BOTH REQUIRE A `label:`
// IMMEDIATELY AFTER, which is not tidiness: without it the tab universe is every
// `key:` in the repository -- browser names, file types, page sizes, 78 of them
// -- so a target like `tab-pdf` would resolve against a list of export formats
// that has nothing to do with any tab. A universe that large cannot fail, and a
// check that cannot fail is worse than none, because it reports a pass.
const tabKeys = new Set();
const roomIds = new Set();
for (const file of FILES) {
  const src = strip(read(file));
  for (const m of src.matchAll(/data-quest=["']([a-z0-9-]+)["']/g)) literal.add(m[1]);
  for (const m of src.matchAll(/\bkey:\s*'([a-z0-9-]+)'\s*,\s*label:/g)) tabKeys.add(m[1]);
  for (const m of src.matchAll(/\bid:\s*'([a-z0-9-]+)'\s*,\s*label:/g)) roomIds.add(m[1]);
}

// Only the prefixes this file knows how to resolve. A new built marker must be
// taught here; until it is, its targets read as unresolvable rather than as
// quietly fine, which is the safe direction to fail in.
const BUILT = [
  { prefix: 'tab-', universe: tabKeys, where: 'a tab declaring key' },
  { prefix: 'room-', universe: roomIds, where: 'a room declaring id' },
];

const resolves = (target) => {
  if (literal.has(target)) return true;
  for (const { prefix, universe } of BUILT) {
    if (target.startsWith(prefix) && universe.has(target.slice(prefix.length))) return true;
  }
  return false;
};

ok(wanted.length > 0, `the walks name ${wanted.length} targets`);

const dead = wanted.filter((t) => !resolves(t));
ok(dead.length === 0,
   `every target the tutorial points at exists in the app${
     dead.length ? `\n        nothing to point at: ${dead.join(', ')}` : ''}`);

// The resolver must be doing real work. If the universes came back empty every
// built target would fail, and if `literal` were empty this check would be
// measuring nothing at all -- the failure mode that makes a green suite a lie.
ok(literal.size > 0 && tabKeys.size > 0 && roomIds.size > 0,
   `resolver has something to work with: ${literal.size} written markers, `
   + `${tabKeys.size} tab keys, ${roomIds.size} room ids`);

// ---------------------------------------------------------------------------
// 2. EVERY ROLE HAS A WALK, AND EVERY STEP HAS SOMETHING TO SAY
// ---------------------------------------------------------------------------
//
// A role added without a walk falls back to the Guide's steps, which point at
// screens that role may not even have. TypeScript makes QUEST_BY_TRACK a
// Record<Role, ...> and so catches a MISSING key; it cannot catch a track wired
// to the wrong list, nor a step whose text was never written.
{
  const tracks = [...quest.matchAll(/^\s*(executive|admin|dm|ds):\s*(\w+),/gm)]
    .map((m) => [m[1], m[2]]);
  ok(tracks.length === 4, `all four roles have their own walk (${tracks.length})`);
  const lists = new Set(tracks.map(([, list]) => list));
  ok(lists.size === 4,
     `no two roles share one list of steps${lists.size !== 4 ? ` (${[...lists].join(', ')})` : ''}`);

  const untitled = [...quest.matchAll(/\{\s*id:\s*'([a-z0-9-]+)'[^}]*\}/g)]
    .filter((m) => !/title:/.test(m[0]) && !/text:/.test(m[0]))
    .map((m) => m[1]);
  ok(untitled.length === 0,
     `every step says something${untitled.length ? `: silent ${untitled.join(', ')}` : ''}`);
}

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
