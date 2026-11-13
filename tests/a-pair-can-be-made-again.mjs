// Two people who were unpaired can be paired again.
//
// THE BUG, REPORTED FROM A PHONE. A Director disconnected two people, tried to
// pair them again, and got:
//
//   duplicate key value violates unique constraint "pairings_ds_id_dm_id_key"
//
// The constraint was UNIQUE (ds_id, dm_id) with no condition, and disconnecting
// does not delete the row — it archives it, deliberately, so the history of who
// walked with whom survives. Together those mean the archived row keeps that
// pair's slot forever: those two people can never be paired again, by anybody.
//
// Every disconnect this church had done was in that state — seven archived
// pairings, seven pairs that could not be remade. And "disconnect, then pair
// them again" is the obvious way to fix a pairing made by mistake, which is
// exactly when a Director reaches for it.
//
// THE SECOND BUG, FOUND WHILE FIXING THE FIRST. Nothing said an Explorer has
// ONE Guide: the only trigger caps a GUIDE at five Explorers, the other side of
// the relationship. Four Explorers had two Guides, and because getMyPairing
// read with `.maybeSingle()` — which raises on two rows — their My Guide screen
// failed outright rather than showing the wrong Guide.
//
//   node tests/a-pair-can-be-made-again.mjs
//
// Reads the migration and the source; needs no database.
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

const dir = 'supabase/migrations';
const file = fs.readdirSync(path.join(root, dir))
  .filter((f) => f.includes('a_pair_can_be_made_again')).sort().pop();
ok(!!file, `the migration is present (${file ?? 'MISSING'})`);
const sql = file ? read(`${dir}/${file}`) : '';

// ---- The reported bug ----
ok(/drop constraint if exists pairings_ds_id_dm_id_key/.test(sql),
   'the unconditional unique constraint is gone');
ok(/create unique index if not exists pairings_active_pair_once[\s\S]{0,200}where status = 'active'/.test(sql),
   'and is replaced by one that applies only to ACTIVE pairings');
// The rule that was actually meant is still enforced.
ok(/\(ds_id, dm_id\)/.test(sql), 'the same two cannot be actively paired twice');

// The history is the reason the row survives a disconnect, so nothing here may
// start deleting it.
ok(!/delete from public\.pairings/i.test(sql),
   'and no archived pairing is deleted to make room');

// ---- The second bug ----
ok(/one_guide_per_explorer/.test(sql), 'an Explorer is limited to one Guide');
ok(/before insert or update of ds_id, status on public\.pairings/.test(sql),
   'checked on the way in, including a row being reactivated');
// A partial unique index is the natural shape and CANNOT be built while four
// Explorers are already in breach; choosing whose Guide to drop is a Director's
// decision, not a migration's.
ok(/A TRIGGER, NOT A UNIQUE INDEX/.test(sql),
   'as a trigger, so existing double-pairings are left for a person to resolve');
ok(!/delete from|update public\.pairings set status/i.test(sql),
   'and the migration changes nobody’s existing pairing');

// ---- One Explorer, one Guide, as a rule the database cannot break ----
//
// The migration above could only manage a trigger, because four Explorers were
// already in breach and a partial unique index cannot be built over rows that
// violate it. Those four were settled by a person, so the real constraint could
// follow. Both stay: the trigger fires first and produces a sentence a Director
// can read, the index is what holds when two Directors pair at the same instant.
const later = fs.readdirSync(path.join(root, dir))
  .filter((f) => f.includes('one_explorer_one_guide')).sort().pop();
ok(!!later, `the follow-up migration is present (${later ?? 'MISSING'})`);
const sql2 = later ? read(`${dir}/${later}`) : '';

ok(/create unique index if not exists pairings_one_active_guide[\s\S]{0,120}\(ds_id\)[\s\S]{0,80}where status = 'active'/.test(sql2),
   'an Explorer can hold only ONE active pairing, enforced by an index');
ok(/drop index if exists public\.pairings_active_pair_once/.test(sql2),
   'and the weaker index it subsumes is dropped rather than left to cost every write');
// The friendly message is the whole reason the trigger is still there. Drop it
// and a Director sees a constraint name again, which is the bug that started
// all of this.
ok(!/drop trigger[\s\S]{0,60}one_guide_per_explorer/.test(sql2),
   'and the trigger stays, so the refusal is still a sentence and not a constraint name');
ok(!/delete from|update public\.pairings set/i.test(sql2),
   'and this migration moves nobody: the four were settled by a person, not by SQL');

// ---- The screen survives the rows already there ----
// Comments are stripped before the read. The comment above the fixed query has
// to name `.maybeSingle()` to explain what was wrong with it, and a check that
// cannot tell an explanation from the thing it explains is a check that fails
// on its own documentation.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');

const data = stripComments(read('lib/live/data.ts'));
const fn = data.slice(data.indexOf('export async function getMyPairing'));
const body = fn.slice(0, fn.indexOf('\n}'));
ok(!/maybeSingle\(\)/.test(body.slice(0, body.indexOf('profiles'))),
   'getMyPairing no longer raises when an Explorer has two Guides');
ok(/order\('created_at', \{ ascending: false \}\)/.test(body), 'it takes the newest');
ok(/\.limit\(1\)/.test(body), 'and only one');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
