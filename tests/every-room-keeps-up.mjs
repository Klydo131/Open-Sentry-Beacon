// Every room keeps up, and a new one cannot ship without doing so.
//
// ---------------------------------------------------------------------------
// REPORTED AS: "I still dont like that most users complain that they need to
// refresh their browser to get the real time results."
//
// WHAT WAS ALREADY RIGHT, ruled out before anything was added:
//
//   The publication. Migration 20260902020000 publishes twenty-four tables
//   with replica identity full.
//
//   The socket's authentication. Checked in the INSTALLED library rather than
//   assumed: @supabase/supabase-js 2.112.3 wires the custom `accessToken`
//   callback into its realtime client, and realtime-js re-runs setAuth on
//   every heartbeat -- so the hour-long token life does not quietly kill the
//   stream on a tab left open, which was the first and most plausible guess.
//
// THE FAULT WAS COVERAGE. Sixteen components loaded data and subscribed to
// nothing at all, including every screen a person actually lives on: the
// Explorer's, the Guide's and the Director's. And eighteen tables were never
// published, so a screen watching one of those would have received nothing
// however correctly it subscribed.
//
// A mechanism that most of the app never calls is indistinguishable, from the
// outside, from one that does not work. So the check that matters here is not
// "does the hook exist" -- it did -- but "is there any live screen that fails
// to call it", which is what block 1 measures, and "does any set name a table
// the database never publishes", which is block 2. The first catches the
// seventeenth screen; the second catches a set that looks wired and is deaf.
//
//   node tests/every-room-keeps-up.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
const stripSql = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

/** The migrations, in the order the database applies them. */
const migrationFiles = () => fs
  .readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort();

/** Every .tsx under a directory, recursively. */
function screens(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) screens(rel, out);
    else if (entry.name.endsWith('.tsx')) out.push(rel);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. NO LIVE SCREEN LOADS WITHOUT LISTENING
// ---------------------------------------------------------------------------
//
// A component that reads the live database and holds a loader is a component
// somebody sits in front of while somebody else changes the thing it is
// showing. Either it subscribes, or it is stale by design and says so here.
// EVERY LIVE SCREEN NOW LISTENS, and this set is empty on purpose rather than
// deleted. It held three screens for a day, then one, and now none: the last of
// them, the security audit, turned out not to need its own table published at
// all. Left in place so the next screen that genuinely must stay on a reload
// has somewhere to be named and explained.
const STAYS_ON_A_RELOAD = new Set([
  // The Guild Room's wall. Its two tables have no read policy, so realtime
  // delivers nothing, and there is no other table that changes when somebody
  // posts -- so unlike the security audit there is nothing safe to watch
  // instead. The repair that would work, a read policy on the posts, is the one
  // that must not happen: the feed computes an author_label rather than
  // returning author_id, and a row policy hands over the raw column.
  'components/LiveGuildActivity.tsx',
]);

{
  const deaf = [];
  for (const file of [...screens('components'), ...screens('app')]) {
    if (STAYS_ON_A_RELOAD.has(file)) continue;
    const src = strip(read(file));
    if (!/@\/lib\/live\/data/.test(src)) continue;
    // A loader: something re-runnable. A component that only writes has none.
    // PER LOADER, NOT PER FILE. Several of these files hold two or three
    // components, and a file-level check passes as soon as ANY one of them
    // subscribes -- which is exactly how the Guide's roster sat deaf inside a
    // file whose conversation was wired. Caught by breaking it on purpose.
    // COUNTED, NOT JUST MATCHED. Several of these files hold two components
    // that BOTH call their loader `load`, so a single subscription satisfied a
    // name-match while one of the two sat deaf -- which is how removing one of
    // LiveTrialRoom's two subscriptions went unnoticed. One subscription per
    // declaration is the rule; the names cannot tell them apart, so the counts
    // have to.
    const declared = new Map();
    for (const m of src.matchAll(/const (\w*[Ll]oad\w*) = useCallback\(async/g)) {
      declared.set(m[1], (declared.get(m[1]) ?? 0) + 1);
    }
    for (const [name, count] of declared) {
      const subs = (src.match(new RegExp(`useKeepUp\\([A-Z_0-9]+, ${name}\\)`, 'g')) ?? []).length
        + (src.match(new RegExp(`subscribeToMessages\\([^)]*=> void ${name}\\(\\)`, 'g')) ?? []).length;
      if (subs < count) deaf.push(`${file}  ${name}()  ${count} loader(s), ${subs} subscription(s)`);
    }
  }
  ok(deaf.length === 0,
     `every loader on a live screen is re-run when its data changes${deaf.length ? `\n        deaf: ${deaf.join('\n              ')}` : ''}`);
}

// ---------------------------------------------------------------------------
// 1b. AND A SCREEN CANNOT ESCAPE BLOCK 1 BY SPELLING ITS LOADER DIFFERENTLY
// ---------------------------------------------------------------------------
//
// Block 1 only sees `const <name with load> = useCallback(async`. The Office
// room read three tables straight inside its useEffect, named nothing `load`,
// and sailed through 143 checks while its pairing-requests badge -- the thing
// its own comment calls the reason the tab is worth reading -- could only ever
// be as fresh as the last full page load. Block 1 was matching an IDIOM; this
// one matches the BEHAVIOUR, which is what actually makes a room deaf: it reads
// live data on mount, to put on the screen, and never listens for a change.
//
// Reads in an event handler are not mount reads and are not counted, so a
// component that only writes, or that fetches fresh on a click, needs nothing.
const READS_ONCE_ON_PURPOSE = new Set([
  // The door: sign in, claim an invitation, fetch the profile just created.
  // A one-shot flow, not a room somebody sits in while others change data.
  'components/live/DoorPages.tsx',
  // Resolves one signed URL for one attachment. A URL builder, not a feed.
  'components/live/shared.tsx',
]);

{
  /** The full text of every useEffect in a file, by matching its parens. */
  const effectBodies = (src) => {
    const out = [];
    for (const m of src.matchAll(/useEffect\(/g)) {
      let i = m.index + m[0].length;
      let depth = 1;
      while (i < src.length && depth > 0) {
        const ch = src[i];
        if (ch === '(') depth += 1;
        else if (ch === ')') depth -= 1;
        i += 1;
      }
      out.push(src.slice(m.index, i));
    }
    return out;
  };

  const deafOnMount = [];
  for (const file of [...screens('components'), ...screens('app')]) {
    if (READS_ONCE_ON_PURPOSE.has(file) || STAYS_ON_A_RELOAD.has(file)) continue;
    const src = strip(read(file));
    if (!/@\/lib\/live\/data/.test(src)) continue;
    const mountReads = effectBodies(src).filter((b) => /\blive\.\w+\s*\(/.test(b));
    if (!mountReads.length) continue;
    if ((src.match(/useKeepUp\(/g) ?? []).length > 0) continue;
    const names = [...new Set(mountReads.flatMap(
      (b) => [...b.matchAll(/\blive\.(\w+)\s*\(/g)].map((x) => x[1]),
    ))];
    deafOnMount.push(`${file}  reads on mount: ${names.join(', ')}`);
  }
  ok(deafOnMount.length === 0,
     `no live screen reads on mount without listening${deafOnMount.length ? `\n        deaf: ${deafOnMount.join('\n              ')}` : ''}`);
}

// ---------------------------------------------------------------------------
// 2. EVERY TABLE A SCREEN WATCHES IS ACTUALLY PUBLISHED
// ---------------------------------------------------------------------------
//
// The failure this catches is the quiet one. A set can name a table, a screen
// can subscribe to it perfectly, and nothing arrives -- because Postgres never
// wrote the change to the replication stream. From the component's side that
// is indistinguishable from "nobody changed anything".
{
  const hook = read('lib/live/keep-up.ts');
  const watched = new Set();
  for (const m of hook.matchAll(/export const KEEP_UP_\w+ =\s*([^;]+);/g)) {
    for (const t of m[1].matchAll(/'([a-z_]+)'/g)) watched.add(t[1]);
  }
  ok(watched.size > 20, `the sets name ${watched.size} tables`);

  const dir = path.join(root, 'supabase', 'migrations');
  const sql = stripSql(
    fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
      .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n'),
  );
  // Both migrations publish from an array of names; a table is published if it
  // appears inside one of those arrays.
  const published = new Set();
  for (const m of sql.matchAll(/text\[\] := array\[([\s\S]*?)\];/g)) {
    for (const t of m[1].matchAll(/'([a-z_]+)'/g)) published.add(t[1]);
  }
  // The single-table form too. See the note in the-screen-keeps-up.mjs: a
  // table published by a plain `alter publication ... add table` is published,
  // and reading only the array idiom made one look deaf when it was not.
  for (const m of sql.matchAll(
    /alter\s+publication\s+supabase_realtime\s+add\s+table\s+(?:public\.)?(\w+)/gi)) {
    published.add(m[1]);
  }
  published.add('messages'); // published before either migration existed

  const deaf = [...watched].filter((t) => !published.has(t)).sort();
  ok(deaf.length === 0,
     `every watched table is published${deaf.length ? ` (missing: ${deaf.join(', ')})` : ''}`);
}

// ---------------------------------------------------------------------------
// 2b. AND EVERY WATCHED TABLE CAN ACTUALLY BE READ
// ---------------------------------------------------------------------------
//
// PUBLISHED IS NOT ENOUGH. Realtime evaluates row level security per
// subscriber, so a table with RLS on and NO POLICY delivers to nobody --
// however correctly the screen subscribes and however plainly the migration
// publishes it. The subscription is silent by construction: it looks wired,
// satisfies every check that only asks whether a screen subscribed, and shows
// a frozen screen.
//
// This was not hypothetical and it was not found by anybody using the app. The
// database advisor named five published tables with no read policy, and two of
// them were being watched by screens wired the day before: the Guild Room's
// wall and the library's record. The security audit was a third, caught
// earlier by reading its policies before publishing it.
//
// So a set may only name a table that some migration grants a SELECT policy on.
{
  const hook = read('lib/live/keep-up.ts');
  const watched = new Set();
  for (const m of hook.matchAll(/export const KEEP_UP_\w+ =\s*([^;]+);/g)) {
    for (const t of m[1].matchAll(/'([a-z_]+)'/g)) watched.add(t[1]);
  }

  const sql = migrationFiles()
    .map((f) => stripSql(read(`supabase/migrations/${f}`))).join('\n');
  const readable = new Set(
    [...sql.matchAll(/create policy \w+\s+on public\.(\w+)\s+for select/gi)].map((m) => m[1]),
  );
  // A policy written without `for select` covers every command, this one
  // included, so those count too.
  for (const m of sql.matchAll(/create policy \w+\s+on public\.(\w+)\s+for all/gi)) {
    readable.add(m[1]);
  }

  const silent = [...watched].filter((t) => !readable.has(t)).sort();
  ok(silent.length === 0,
     `every watched table has a read policy, so the subscription is not silent${
       silent.length ? ` (no policy: ${silent.join(', ')})` : ''}`);
}

// ---------------------------------------------------------------------------
// 3. THE CONVERSATION CAN REPORT A DELETION
// ---------------------------------------------------------------------------
//
// `messages` was the first table ever published and the only one left on the
// default replica identity. A DELETE then carries the primary key alone, so a
// subscription filtered on `pairing_id` cannot tell whether the deleted row
// was in this conversation, and a removed message stays on screen.
{
  const mine = stripSql(read('supabase/migrations/20260908170000_every_room_keeps_up.sql'));
  ok(/alter table public\.messages replica identity full/.test(mine),
     'the busiest table carries its whole row, like every other published one');
  ok(/'pairing_media'/.test(mine),
     'and a file sent into a conversation is published too');

  // WHAT IS STILL OFF THE WIRE. Checked across every migration rather than one
  // file, because these two have now been published, dropped and -- for four of
  // the six -- published again, and a check reading a single file would have
  // gone stale at each of those turns.
  // ONLY FILES THAT TOUCH THE PUBLICATION. Matching on the array's variable
  // name alone swept in a trigger in 0035 whose `watched` array lists profile
  // COLUMNS -- full_name, birthday -- which are not tables and were never
  // published. A migration earns a reading here by containing the statement
  // that publishes, not by naming a variable the same way.
  const publishes = new Set();
  for (const file of migrationFiles()) {
    const text = stripSql(read(`supabase/migrations/${file}`));
    if (!/alter publication supabase_realtime/.test(text)) continue;
    for (const m of text.matchAll(/(\w+) text\[\] := array\[([\s\S]*?)\];/g)) {
      const drops = m[1] === 'keep_off';
      for (const t of m[2].matchAll(/'([a-z_]+)'/g)) {
        if (drops) publishes.delete(t[1]); else publishes.add(t[1]);
      }
    }
  }
  for (const off of ['security_audit_events', 'seeker_notes']) {
    ok(!publishes.has(off), `${off} is deliberately left off the wire`);
  }
  const hook = read('lib/live/keep-up.ts');
  for (const off of ['security_audit_events', 'seeker_notes']) {
    ok(!new RegExp(`'${off}'`).test(hook),
       `and no set names ${off}, which would be subscribing to silence`);
  }

  // THE AUDIT SCREEN WATCHES ITS CAUSES. Its table has RLS on and no policy at
  // all, so nothing may read it directly and realtime would deliver nothing --
  // a subscription silent by construction, which looks wired and is not. Every
  // audit row is written by a trigger on one of these three, so watching them
  // re-reads the feed at exactly the moments it has something new. Named rather
  // than counted, because a fourth trigger added later is the one way this can
  // quietly fall behind.
  const security = hook.slice(hook.indexOf('export const KEEP_UP_SECURITY'));
  const set = security.slice(0, security.indexOf(';') + 1);
  for (const cause of ['profile_changes', 'reports', 'discipline_log']) {
    ok(new RegExp(`'${cause}'`).test(set),
       `the audit screen watches ${cause}, which is what writes an audit entry`);
  }

  // A PUBLISHING MIGRATION MUST ALSO SET THE FULL ROW. Every read policy on
  // these tables decides on a column that is not the primary key -- church_id,
  // trial_id, pairing_id -- so on the default replica identity an UPDATE or
  // DELETE carries the key alone, the policy has nothing to test, and the event
  // is dropped. That failure is invisible: inserts still arrive, so the table
  // looks published and is half deaf. The old check only asked whether the
  // words appeared ANYWHERE across all migrations, which one file satisfies for
  // every other file.
  // Applies to migrations that publish a LIST of tables, which is the pattern
  // every one since 20260902020000 uses. 0004 is the exception and the reason
  // this rule exists: it published `messages` with a single statement and never
  // set the identity, which is the gap 20260908170000 closes and the check
  // above asserts by name. A migration is not editable after it has run, so the
  // repair belongs in a later file rather than in that one.
  for (const file of migrationFiles()) {
    const text = stripSql(read(`supabase/migrations/${file}`));
    if (!/alter publication supabase_realtime add table/.test(text)) continue;
    if (!/text\[\] := array\[/.test(text)) continue;
    ok(/replica identity full/i.test(text),
       `${file} sets the full row on what it publishes`);
  }

  // AND WHAT IS NOW ON IT, by request. The Cases room is the one screen where
  // two people write into the same record at the same moment.
  for (const on of ['reports', 'report_files', 'trials', 'trial_statements',
                    'trial_parties', 'discipline_log']) {
    ok(publishes.has(on), `${on} is published, so the room can keep up`);
  }
}

// ---------------------------------------------------------------------------
// 4. THE HOOK IS STILL CHEAP ENOUGH TO PUT EVERYWHERE
// ---------------------------------------------------------------------------
//
// Wiring twenty screens is only safe because a burst is one reload and a set is
// one socket. If either of those regressed, this change would have replaced
// "refresh the page" with "the app is slow", which is not an improvement.
{
  const hook = strip(read('lib/live/keep-up.ts'));
  ok(/setTimeout\(\(\) => \{ void latest\.current\(\); \}, SETTLE_MS\)/.test(hook),
     'a burst of writes still costs one reload, not one per row');
  ok(/const channel = client\.channel\(/.test(hook)
     && (hook.match(/client\.channel\(/g) ?? []).length === 1,
     'and a set of tables still costs one channel, not one per table');
  ok(/latest\.current = reload/.test(hook),
     'and a component rebuilding its loader does not resubscribe every render');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
