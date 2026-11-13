// A Guide chosen on an invitation is paired the moment the Explorer arrives.
//
// WHAT WAS REPORTED. (a bug report)
//
// THREE SEPARATE BUGS SAT ON ONE PATH, and only the third is the reported one.
// All three were found by probing the live database, not by reading.
//
//   ONE. The approval itself FAILED: "there is no unique or exclusion
//   constraint matching the ON CONFLICT specification". The Director got an
//   error and the person stayed unapproved. Self-inflicted the same day --
//   `a_pair_can_be_made_again` dropped the unconditional UNIQUE (ds_id, dm_id)
//   for good reasons, and a trigger written long before said
//   `on conflict (ds_id, dm_id)`, which needs exactly that index.
//
//   TWO. `do nothing` was wrong anyway. Disconnecting ARCHIVES a pairing, so
//   for anybody previously paired with that Guide the row already existed and
//   DO NOTHING silently skipped -- on the exact path a Director uses to re-pair
//   somebody.
//
//   THREE, THE REPORTED ONE. An invited Explorer is never approved, because
//   they ARRIVE approved: `handle_new_user` sets is_approved at signup for
//   anybody holding an Explorer invitation. The pairing hung off
//   `after update of is_approved`, and that transition never happens for them.
//   For a first-time invited Explorer the trigger had never once fired. The
//   Guide was written on their profile and nothing ever read it.
//
//   node tests/the-named-guide-is-paired.mjs
//
// Reads the migrations; needs no database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'supabase/migrations');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// SQL comments are stripped before anything is matched. Every one of these
// migrations explains the bug it fixes, and a check that cannot tell an
// explanation from the thing it explains fails on its own documentation.
const stripSql = (s) => s.replace(/--[^\n]*/g, ' ');

const file = files.filter((f) => f.includes('the_named_guide_is_paired')).pop();
ok(!!file, `the migration is present (${file ?? 'MISSING'})`);
const sql = file ? stripSql(read(`supabase/migrations/${file}`)) : '';

// ---------------------------------------------------------------------------
// 1. BOTH DOORS. Arriving, and being approved.
// ---------------------------------------------------------------------------
//
// This is the whole reported bug. An invited Explorer comes in through INSERT
// already approved; a Guide, and anybody switched back on, comes in through
// UPDATE. A fix that covers only the second one changes nothing for the person
// who reported it.
ok(/after insert on public\.profiles/.test(sql),
   'an Explorer who arrives already approved is paired on INSERT');
ok(/after update of is_approved on public\.profiles/.test(sql),
   'and one who waits for a human is paired when approved');

// ONE FUNCTION BEHIND BOTH. Two copies of this logic would drift, and the way
// they would drift is that somebody fixes the path they were looking at.
{
  const calls = sql.match(/perform public\.pair_with_named_guide\(/g) || [];
  ok(calls.length === 2, `both doors call one shared function (${calls.length} calls)`);
  ok(/create or replace function public\.pair_with_named_guide/.test(sql),
     'which is defined once');
}

// ---------------------------------------------------------------------------
// 2. NOT ON CONFLICT, on a constraint that no longer exists
// ---------------------------------------------------------------------------
ok(!/on conflict \(ds_id, dm_id\)/.test(sql),
   'the pairing does not lean on the unique constraint that was dropped');

// THE GENERAL VERSION OF TODAY'S LESSON. `on conflict (a, b)` needs a unique
// index on exactly those columns with NO condition; a partial index does not
// satisfy it. So a migration that drops such a constraint silently breaks every
// ON CONFLICT that named its columns, in functions nobody is looking at, with
// no error until somebody presses the button.
//
// Grep for a constraint's COLUMNS before dropping it, not just its name.
// Nothing referenced this one by name.
{
  const dropped = new Set();
  for (const f of files) {
    const text = stripSql(read(`supabase/migrations/${f}`));
    for (const m of text.matchAll(/drop constraint if exists (\w+)/gi)) dropped.add(m[1]);
    for (const m of text.matchAll(/drop index if exists (?:public\.)?(\w+)/gi)) dropped.add(m[1]);
  }
  // ONLY THE DEFINITION THAT SURVIVES COUNTS. An old migration may hold a
  // function body full of dead ideas; what runs is whichever `create or replace`
  // came last. Checking every file instead would flag 0002 and 0003 forever --
  // both really do contain the broken ON CONFLICT, and both are really replaced
  // further down the directory, so both are noise.
  const living = new Map();
  for (const f of files) {
    const text = stripSql(read(`supabase/migrations/${f}`));
    for (const m of text.matchAll(
      /create or replace function public\.(\w+)[\s\S]*?\$(\w*)\$([\s\S]*?)\$\2\$/gi
    )) {
      living.set(m[1], { file: f, body: m[3] });
    }
  }
  ok(living.size > 0, `the migrations define functions this can read (${living.size})`);

  // A constraint named <table>_<col>_<col>_key is Postgres's own naming for
  // UNIQUE (col, col), so its name says which ON CONFLICT it served.
  const orphans = [];
  for (const [name, { file: f, body }] of living) {
    for (const m of body.matchAll(/on conflict \(([^)]+)\)/gi)) {
      const cols = m[1].split(',').map((c) => c.trim()).filter(Boolean);
      if (cols.length < 2) continue;   // a single-column primary-key conflict is safe
      for (const dead of dropped) {
        if (dead.endsWith('_key') && cols.every((c) => dead.includes(c))) {
          orphans.push(`${name}() in ${f}: on conflict (${cols.join(', ')}) needs ${dead}, dropped`);
        }
      }
    }
  }
  ok(orphans.length === 0,
     orphans.length
       ? `a LIVE function's ON CONFLICT names a dropped constraint: ${orphans.join('; ')}`
       : 'no function that still ships leans on a constraint a later migration drops');
}

// ---------------------------------------------------------------------------
// 3. The history survives, and a Director outranks the invitation
// ---------------------------------------------------------------------------
//
// Disconnecting archives rather than deletes, deliberately, so the record of
// who walked with whom survives. Reviving that row keeps it; inserting a second
// one beside it does not.
ok(/set status = 'active'/.test(sql), 'a pairing these two had before is revived');
ok(/order by created_at desc/.test(sql), 'the most recent one, when there are several');

// A Director who paired them by hand while the invitation sat unanswered made a
// later and better-informed decision than a dropdown filled in weeks earlier.
ok(/if exists \(select 1 from public\.pairings where ds_id = p_ds and status = 'active'\)/.test(sql),
   'and somebody already walking with a Guide is left alone');

// ---------------------------------------------------------------------------
// 4. Getting in never fails because of pairing
// ---------------------------------------------------------------------------
//
// Approving is "let this person into the church". Pairing is "and walk with
// this one". A Guide already carrying five Explorers must not be able to turn
// Approve -- or SIGNING UP -- into an error, which is how a cap becomes "the
// Approve button is broken".
{
  const fn = sql.slice(sql.indexOf('create or replace function public.pair_with_named_guide'));
  const body = fn.slice(0, fn.indexOf('\ncreate or replace function', 1));
  ok(/exception when others then/.test(body),
     'a refused pairing does not take the approval down with it');
  ok(/raise warning/.test(body), 'and says so in the log rather than vanishing');
  // A swallow that re-raises is not a swallow.
  ok(!/exception when others then[\s\S]{0,400}raise;/.test(body),
     'and really does let the person through');
}

// ---------------------------------------------------------------------------
// 5. It does not invent a Guide
// ---------------------------------------------------------------------------
ok(/new\.recommended_by is not null/.test(sql),
   'nobody is paired unless a Guide was actually named on the invitation');
ok(/new\.role = 'ds'/.test(sql), 'and only Explorers are paired');
ok(/if p_ds is null or p_dm is null then return; end if;/.test(sql),
   'and a missing id is a no-op rather than a broken row');

// The function writes pairings for other people, so it must not be callable by
// them. SECURITY DEFINER without a revoke is a way to pair anybody with anybody.
ok(/security definer/.test(sql), 'it runs with the privileges it needs');
ok(/revoke all on function public\.pair_with_named_guide/.test(sql),
   'and nobody can call it directly to pair themselves to anyone they like');
ok(/set search_path to 'public'/.test(sql),
   'with a pinned search_path, as every definer function here does');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
