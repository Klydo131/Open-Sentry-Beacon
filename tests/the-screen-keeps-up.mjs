// The screen keeps up without anybody pressing refresh.
//
// WHAT WAS WRONG. Exactly one table in the whole app was published for
// realtime — `messages` — so a conversation updated itself and every other
// screen did not. Post a notice, approve somebody, add a study, propose a time,
// and the person looking at that screen saw the old version until they pulled
// to refresh. In front of a room that reads as the app being broken.
//
// THIS HAS TWO HALVES AND EITHER ONE ALONE DOES NOTHING, which is exactly why
// it is worth a test rather than a glance:
//
//   * the DATABASE half — a table not in the `supabase_realtime` publication
//     can never produce an event, so no client code would have helped;
//   * the APP half — a published table nobody subscribes to changes in silence.
//
// So this checks that every set the app subscribes to is actually published,
// and that the screens are wired. A set naming a table the migration does not
// publish is the failure that would otherwise ship looking fine.
//
//   node tests/the-screen-keeps-up.mjs
//
// Reads the source and the migration; needs no database and no network.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// ---- The database half ----
const dir = 'supabase/migrations';
const migration = fs
  .readdirSync(path.join(root, dir))
  .filter((f) => f.includes('the_screen_keeps_up'))
  .sort()
  .pop();
ok(!!migration, `the publication migration is present (${migration ?? 'MISSING'})`);

// EVERY MIGRATION, NOT THE FIRST ONE. This read only the migration whose name
// contains "the_screen_keeps_up", so the day a SECOND migration published more
// tables -- 20260908170000, which publishes the eleven that sixteen deaf
// screens needed -- every one of those read as unpublished and this test went
// red on a change that was correct. The rule is that a watched table is
// published somewhere, not that one named file publishes it.
const sql = fs
  .readdirSync(path.join(root, dir))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => read(`${dir}/${f}`))
  .join('\n');

// REPLAYED IN ORDER, because that is what the database does to itself. A table
// can be published by one migration, dropped by a later one, and published
// again by a later one still -- which is exactly the history the safeguarding
// tables have. Collecting every "add" and then subtracting every "drop" gives
// the wrong answer whenever the last word was an add, and gave it here.
//
// The array's VARIABLE NAME says which way it goes: `keep_off` drops, anything
// else adds. Only arrays declared that way count, so an unrelated list of
// strings in some other migration is never mistaken for a publication.
const published = new Set();
for (const file of fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.sql')).sort()) {
  const text = read(`${dir}/${file}`);
  // A migration earns a reading by containing the statement that publishes.
  // Matching the variable name alone swept in a trigger elsewhere whose array
  // lists profile COLUMNS, which are not tables.
  if (!/alter publication supabase_realtime/.test(text)) continue;
  for (const m of text.matchAll(/(\w+) text\[\] := array\[([\s\S]*?)\];/g)) {
    const drops = m[1] === 'keep_off';
    for (const t of m[2].matchAll(/'([a-z_]+)'/g)) {
      if (drops) published.delete(t[1]); else published.add(t[1]);
    }
  }
  // AND THE PLAIN STATEMENT FORM, which is equally valid SQL and is how a
  // SINGLE table gets published -- the array idiom above is how the big
  // migrations publish many at once. Not reading this form meant a table
  // published by one statement read as unpublished, which is exactly why
  // `messages` needed a hardcoded exception in the sibling check: it was
  // published that way and the parser could not see it.
  for (const m of text.matchAll(
    /alter\s+publication\s+supabase_realtime\s+(add|drop)\s+table\s+(?:public\.)?(\w+)/gi)) {
    if (m[1].toLowerCase() === 'drop') published.delete(m[2]); else published.add(m[2]);
  }
}
ok(published.size >= 15, `it publishes the tables the screens watch (${published.size})`);

// Realtime evaluates RLS per subscriber, but only if it can see the columns the
// policy tests. Every policy here decides by church_id or author_id, neither of
// which is a primary key, so without FULL an UPDATE or DELETE has nothing to
// test and the event is dropped.
ok(/replica identity full/i.test(sql), 'and sets REPLICA IDENTITY FULL so RLS can be evaluated');

// WHAT STAYS OFF THE WIRE, AND WHY THE LIST SHRANK.
//
// This read: discipline_log, reports, trials, security_audit_events,
// seeker_notes -- the safeguarding record being the last place to widen a
// surface for a convenience nobody asked for.
//
// The owner asked for the Cases room and safeguarding to update live, so four
// of those five are published now (20260909100000) and the reasoning that kept
// them off is preserved in 20260908180000. It was never a claim that the
// policies were too loose: reports are readable by an approved admin or
// executive of that church, a trial by a party to it, the discipline log by
// somebody who leads the church, and realtime evaluates each of those per
// subscriber. It was a preference for not streaming them at all, and the
// person whose preference it is has changed it.
//
// These two were not part of that request and remain off: a Director's own
// review screen, and a Guide's private notes about the person they walk with.
for (const kept of ['security_audit_events', 'seeker_notes']) {
  ok(!published.has(kept), `${kept} is deliberately NOT published`);
}

// ---- The app half ----
const hook = read('lib/live/keep-up.ts');
ok(/export function useKeepUp/.test(hook), 'lib/live/keep-up.ts exports useKeepUp');
ok(/removeChannel/.test(hook), 'and tears its channel down on unmount');
ok(/setTimeout/.test(hook), 'and settles a burst of writes into one reload');

// Every table any set names must actually be published, or that screen is
// subscribing to silence.
// ACCEPTS A SET WHOSE VALUE STARTS ON THE NEXT LINE. The old pattern required
// `= [` on one line, so every constant long enough to wrap -- KEEP_UP_CASES
// among them -- was skipped silently, and a set naming an unpublished table
// would have gone unchecked precisely because it was a big one.
const sets = [...hook.matchAll(/export const (KEEP_UP_\w+) =\s*\[([\s\S]*?)\]/g)];
ok(sets.length >= 5, `the screens have named their tables (${sets.length} sets)`);
for (const [, name, body] of sets) {
  for (const table of [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1])) {
    ok(published.has(table), `${name} watches ${table}, and the migration publishes it`);
  }
}

// The screens somebody actually looks at during a demonstration.
for (const [file, expected] of [
  ['components/LiveAnnouncements.tsx', 'KEEP_UP_NOTICES'],
  ['components/LiveLibrary.tsx', 'KEEP_UP_LIBRARY'],
  ['components/LiveMeetings.tsx', 'KEEP_UP_MEETINGS'],
  ['components/LivePrayer.tsx', 'KEEP_UP_PRAYER'],
  ['components/LiveStudies.tsx', 'KEEP_UP_STUDIES'],
  ['components/LiveBlog.tsx', 'KEEP_UP_BLOG'],
  ['components/LiveBell.tsx', 'KEEP_UP_BELL'],
  ['components/LiveDesk.tsx', 'KEEP_UP_PEOPLE'],
]) {
  const src = read(file);
  ok(
    src.includes(`useKeepUp(${expected}`),
    `${file.replace('components/', '')} keeps up (${expected})`,
  );
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
