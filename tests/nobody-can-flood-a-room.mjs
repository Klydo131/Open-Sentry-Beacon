// One account cannot write faster than the app allows.
//
// ---------------------------------------------------------------------------
// WHY. Nothing in this database limited how fast anybody could write, and there
// were two costs to that.
//
//   HARASSMENT. This app's answer to one person hurting another is the report
//   route and a Director. That is the right answer to what somebody SAYS and no
//   answer at all to four hundred messages in a minute, which is a thing a
//   person can do to somebody they are paired with.
//
//   AMPLIFICATION. One insert wakes every screen watching that table and each
//   asks the database to recount. One cheap write becomes N pieces of work,
//   where N is however many people have the app open. The client debounce makes
//   N smaller; only a limit at the write makes it bounded.
//
// Verified against the live database when it shipped: the 41st message in a
// minute is refused and the first 40 are not.
//
//   node tests/nobody-can-flood-a-room.mjs
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

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql')).sort()
  .map((f) => ({ name: f, sql: read(`supabase/migrations/${f}`) }));
const mine = migrations.find((m) => m.name.includes('nobody_can_flood'));

ok(Boolean(mine), 'the throttle migration is in the tree');
const sql = mine?.sql ?? '';

// EVERY ROOM A PERSON CAN WRITE INTO. A limit on the conversation alone just
// moves a flood to the wall.
for (const table of ['messages', 'guild_activity_posts', 'guide_room_messages']) {
  ok(new RegExp(`create trigger hold_the_pace\\s*\\nbefore insert on public\\.${table}`).test(sql),
     `${table} is covered`);
}

// SERVER-SIDE WRITES ARE EXEMPT. A migration backfilling rows, or an edge
// function, has no auth.uid() and is not what this exists to stop -- and a
// throttle that fires during a backfill is one that gets deleted.
ok(/if me is null then\s*\n\s*return new;/.test(sql),
   'a write with no signed-in caller is not throttled');

// THE CEILING IS GENEROUS ON PURPOSE. A limit that occasionally catches a real
// member is a limit that gets removed after the first complaint.
const ceiling = Number(/ceiling constant integer := (\d+)/.exec(sql)?.[1] ?? 0);
ok(ceiling >= 30, `the ceiling is well above human typing (${ceiling} a minute)`);
ok(ceiling <= 200, `and low enough to bound a script (${ceiling} a minute)`);

// THE COUNT MUST BE INDEXED, or the cure is worse than the disease: a table
// scan on every message anybody sends.
for (const idx of ['messages_sender_recent_idx', 'guild_posts_author_recent_idx', 'guide_room_author_recent_idx']) {
  ok(sql.includes(idx), `${idx} keeps the check cheap`);
}

// A HUMAN SENTENCE. `53400` is "configuration limit exceeded"; what the person
// reads must not be that.
ok(/You are sending faster than the app allows/.test(sql),
   'and somebody who hits it is told what happened in words');

// NOTHING AFTER IT QUIETLY DROPS THE TRIGGER.
const after = migrations.filter((m) => m.name > (mine?.name ?? ''));
const dropped = after.filter((m) =>
  /drop trigger[^;]*hold_the_pace/i.test(m.sql) && !/create trigger hold_the_pace/i.test(m.sql));
ok(dropped.length === 0,
   `no later migration removes the throttle without replacing it${
     dropped.length ? ` (${dropped.map((m) => m.name).join(', ')})` : ''}`);

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
