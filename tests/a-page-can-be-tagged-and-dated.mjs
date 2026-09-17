// Tags mean one thing each, and a journal page lands on the right day.
//
// ---------------------------------------------------------------------------
// ASKED FOR, IN THE SCREENSHOT OF AFFiNE'S "All docs": tags on the pages and a
// journal. Both look like the kind of feature a screen can be trusted with, and
// both have a failure that no screen would ever show you.
//
// THE TAG ONE: "Romans", "romans" and " Romans " are one tag to a person and
// three to a list. A room that collects all three has a tag list nobody can
// use, and it happens over weeks, so it is never visible in a demo.
//
// THE DAY ONE IS WORSE, because it is silent and it is wrong for most of the
// people this app is for. `new Date('2026-09-17')` is read as midnight UTC.
// Shown in Manila that is the 17th at eight in the morning, which looks right;
// build the key the other way round -- from a moment rather than from parts --
// and anything written before eight is filed under yesterday. That is most of
// the morning devotions this feature exists for. Running the same assertions
// under two timezones is the only way to see it from here, since this machine
// is on UTC and UTC is the one zone where the bug hides.
//
// EXECUTED, NOT PATTERN-MATCHED. The real module is bundled and run, so an
// assertion here fails when the behaviour changes rather than when a line of
// source is reworded.
//
//   node tests/a-page-can-be-tagged-and-dated.mjs
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-tags-'));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const shelf = path.join(out, 'shelf.mjs');
await build({
  entryPoints: [path.join(root, 'lib/study/shelf.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2020',
  alias: { '@': root },
  outfile: shelf,
  logLevel: 'error',
});

// The driver runs inside a child process so its timezone can be chosen. It
// prints one line of JSON and nothing else.
const driver = path.join(out, 'driver.mjs');
fs.writeFileSync(driver, `
import {
  cleanTag, withTag, tagsAcross, hasTag, dayKey, dayInWords, journalFor, readShelf, TAG_LIMIT,
} from ${JSON.stringify(shelf)};

const page = (over) => ({ id: 'x', title: '', preview: '', updated: 0, created: 0,
  favorite: false, tags: [], trashed: false, journalDate: '', named: false, ...over });

// A moment that is one day in Manila and the day before in UTC: 1am on the
// 17th, Philippine time.
const earlyInManila = new Date('2026-09-17T01:00:00+08:00');

console.log(JSON.stringify({
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  limit: TAG_LIMIT,

  cleaned: {
    hash: cleanTag('#Romans'),
    spaces: cleanTag('  romans   8  '),
    empty: cleanTag('   '),
    hashOnly: cleanTag('###'),
    long: cleanTag('x'.repeat(200)).length,
  },

  added: {
    fresh: withTag([], 'Romans'),
    sameWord: withTag(['Romans'], 'romans'),
    different: withTag(['Romans'], 'Daniel'),
    nothing: withTag(['Romans'], '   '),
    tidied: withTag([], '  #daniel  '),
  },

  across: tagsAcross([
    page({ id: 'a', tags: ['Romans', 'Sabbath'] }),
    page({ id: 'b', tags: ['romans'] }),
    page({ id: 'c', tags: ['Prayer'] }),
    page({ id: 'd', tags: ['Binned'], trashed: true }),
  ]),

  matched: {
    other: hasTag(page({ tags: ['Romans'] }), 'ROMANS'),
    missing: hasTag(page({ tags: ['Romans'] }), 'Daniel'),
  },

  day: {
    early: dayKey(earlyInManila),
    words: dayInWords('2026-09-17'),
    roundTrip: dayKey(new Date(2026, 8, 17, 23, 59, 59)),
  },

  journal: {
    found: journalFor([
      page({ id: 'j1', journalDate: '2026-09-16' }),
      page({ id: 'j2', journalDate: '2026-09-17' }),
    ], '2026-09-17')?.id ?? null,
    binned: journalFor([
      page({ id: 'j3', journalDate: '2026-09-17', trashed: true }),
    ], '2026-09-17')?.id ?? null,
  },

  read: readShelf({ docMetas: [
    { id: 'p1', title: 'Romans', tags: ['Romans', 7, null], journalDate: '2026-09-17' },
    { id: 'p2', title: '', tags: 'not a list' },
  ] }),
}));
`);

const run = (tz) => JSON.parse(
  execFileSync(process.execPath, [driver], {
    cwd: root, encoding: 'utf8', timeout: 60_000, env: { ...process.env, TZ: tz },
  }).trim().split('\n').filter(Boolean).pop(),
);

let manila;
let california;
try {
  manila = run('Asia/Manila');
  california = run('America/Los_Angeles');
} catch (cause) {
  ok(false, `the module ran at all (${String(cause).slice(0, 300)})`);
  console.log(`\nRESULT: ${bad} FAILURE(S)`);
  process.exit(1);
}

ok(manila.tz === 'Asia/Manila' && california.tz === 'America/Los_Angeles',
   `the two runs really are in two timezones (${manila.tz}, ${california.tz})`);

// ---------------------------------------------------------------------------
// 1. A TAG IS TIDIED RATHER THAN REFUSED
// ---------------------------------------------------------------------------
{
  const c = manila.cleaned;
  ok(c.hash === 'Romans', `a leading hash is not part of the word (${JSON.stringify(c.hash)})`);
  ok(c.spaces === 'romans 8', `the spaces around and inside are tidied (${JSON.stringify(c.spaces)})`);
  ok(c.empty === '' && c.hashOnly === '', 'nothing typed is nothing stored');
  ok(c.long === manila.limit, `a tag cannot be longer than ${manila.limit} (${c.long})`);
}

// ---------------------------------------------------------------------------
// 2. THE SAME TAG CANNOT GET IN TWICE, HOWEVER IT IS CAPITALISED
// ---------------------------------------------------------------------------
{
  const a = manila.added;
  ok(JSON.stringify(a.fresh) === '["Romans"]', `a first tag goes on (${JSON.stringify(a.fresh)})`);
  ok(JSON.stringify(a.sameWord) === '["Romans"]',
     `"romans" does not join "Romans" as a second tag (${JSON.stringify(a.sameWord)})`);
  ok(JSON.stringify(a.different) === '["Romans","Daniel"]',
     `a different word does go on (${JSON.stringify(a.different)})`);
  ok(JSON.stringify(a.nothing) === '["Romans"]', 'blank space adds nothing');
  ok(JSON.stringify(a.tidied) === '["daniel"]',
     `what is stored is what was tidied (${JSON.stringify(a.tidied)})`);
}

// ---------------------------------------------------------------------------
// 3. THE ROOM'S TAG LIST: COUNTED, ORDERED, AND BLIND TO THE BIN
// ---------------------------------------------------------------------------
{
  const list = manila.across;
  const romans = list.find((t) => t.tag.toLowerCase() === 'romans');
  ok(romans?.count === 2, `two spellings of one tag count as two pages (${romans?.count})`);
  ok(list[0]?.tag.toLowerCase() === 'romans', `the commonest tag is first (${list[0]?.tag})`);
  ok(!list.some((t) => t.tag === 'Binned'),
     'a tag that exists only on a binned page is not offered');
  ok(manila.matched.other === true && manila.matched.missing === false,
     'a page is found by its tag whatever the capitals');
}

// ---------------------------------------------------------------------------
// 4. THE DAY, IN BOTH TIMEZONES. This is the assertion the feature turns on.
// ---------------------------------------------------------------------------
{
  ok(manila.day.early === '2026-09-17',
     `1am in Manila is the 17th in Manila (${manila.day.early})`);
  ok(manila.day.roundTrip === '2026-09-17',
     `the last minute of a local day is still that day (${manila.day.roundTrip})`);
  ok(california.day.early === '2026-09-16',
     `the same moment is the 16th in California, where it is still the 16th (${california.day.early})`);

  // AND THE NAME OF A DAY IS THE DAY IT IS. `new Date('2026-09-17')` is midnight
  // UTC, which is the 16th anywhere west of Greenwich -- so a journal built that
  // way names the wrong day for half the world and looks right where it was
  // written.
  for (const [where, result] of [['Manila', manila], ['California', california]]) {
    ok(/17/.test(result.day.words) && /2026/.test(result.day.words),
       `in ${where}, 2026-09-17 is named as the 17th (${result.day.words})`);
    ok(!/16/.test(result.day.words),
       `in ${where}, it is not named as the 16th (${result.day.words})`);
  }
}

// ---------------------------------------------------------------------------
// 5. TODAY'S PAGE IS FOUND BEFORE IT IS MADE
// ---------------------------------------------------------------------------
{
  ok(manila.journal.found === 'j2', `the page for a day is the one with that day on it (${manila.journal.found})`);
  ok(manila.journal.binned === null,
     'a journal page in the bin is not handed back, so Today starts a fresh one');
}

// ---------------------------------------------------------------------------
// 6. WHAT THE SHELF READS OUT OF A STORED ROOM
// ---------------------------------------------------------------------------
{
  const [first, second] = manila.read;
  ok(first.journalDate === '2026-09-17', `a stored journal date is read back (${first.journalDate})`);
  ok(JSON.stringify(first.tags) === '["Romans"]',
     `anything in the tag list that is not a word is dropped (${JSON.stringify(first.tags)})`);
  ok(Array.isArray(second.tags) && second.tags.length === 0,
     'a tag field that is not a list at all becomes no tags rather than a crash');
  ok(second.journalDate === '', 'a page with no journal date is not a journal page');
}

fs.rmSync(out, { recursive: true, force: true });
console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
