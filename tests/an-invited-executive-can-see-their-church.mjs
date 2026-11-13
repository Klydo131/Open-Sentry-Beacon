// An Executive Director who was invited can see the church they were invited to.
//
// ---------------------------------------------------------------------------
// REPORTED AS , from a phone and
// then, when that was not it, from a laptop. The Guide picker opened with one
// row in it, "Choose guide", and no people.
//
// The people were there: forty-two approved Guides and forty-five approved
// Explorers. What was missing was the reader's permission to see any of them.
// Measured by running the real policies as each Executive Director in turn:
//
//     four executives  ->  109 profiles readable, 42 guides, 45 explorers
//     two executives   ->    1 profile readable,   0 guides,  0 explorers
//
// One profile is their own. Those two were not looking at a broken dropdown.
// They were looking at an app with nobody in it, on every screen.
//
// WHY, AND WHY IT IS A DATABASE TEST AND NOT A SCREEN ONE. For an Executive
// Director `manages_church(c)` rests entirely on `oversees_church(c)`, a lookup
// in `church_executives`; `is_admin()` is false for them by definition, so
// their `profiles.church_id` grants them nothing. `create_church()` inserts
// that row for whoever calls it. `handle_new_user` never did -- so an executive
// who CREATES a church works and an executive who is INVITED into one is blind.
//
// THIS IS THE THIRD TIME THE SHAPE HAS BEEN FIXED. Migration 0025 records two
// of them in its own header: `discipline_check` "silently refused them on every
// member of a church they are responsible for", and before that "the same fault
// that made executives see one profile instead of twenty-four, in a different
// function". Both were repaired where they were found, the missing row was not,
// and it surfaced a third time in the pairing form. So this checks the CAUSE --
// that nothing can create an executive without the link -- rather than the
// third symptom.
//
//   node tests/an-invited-executive-can-see-their-church.mjs
//
// Reads the migration, because this sandbox has no database of its own. What
// the live database actually does was verified separately, by promoting a
// member and by signing an invited executive up inside a rolled-back
// transaction: both produced the link, and the probe left nothing behind.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'supabase', 'migrations');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
const all = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');

/** SQL with comments blanked, so a rule about what runs never reads prose. */
const strip = (sql) =>
  sql.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));
const code = strip(all);

// ---------------------------------------------------------------------------
// 1. THE LINK IS KEPT BY A TRIGGER ON THE COLUMN, NOT BY ONE CALLER
// ---------------------------------------------------------------------------
//
// A line inside handle_new_user would fix the sign-up path and leave every
// other writer of `role` to remember on its own. `approveMember` sets that
// column on an existing profile; so would anything added later. The forgetting
// is the whole history, so the rule lives beside the column.
{
  ok(/create trigger profiles_executive_oversees_their_church/i.test(code),
     'a trigger keeps the oversight link in step with the profile');
  ok(/after insert or update of role, church_id on public\.profiles/i.test(code),
     'and it fires on BOTH creating a profile and changing its role or church');
  ok(/create or replace function public\.executive_oversees_their_church/i.test(code),
     'the function behind it exists');

  const fn = code.slice(code.indexOf('function public.executive_oversees_their_church'));
  const body = fn.slice(0, fn.indexOf('$$;') + 3);
  ok(/security definer/i.test(body),
     'it is security definer, or it could not write a table it does not own');
  ok(/new\.role = 'executive'/.test(body) && /new\.church_id is not null/.test(body),
     'it links only an Executive Director who actually has a church');
  ok(/on conflict \(church_id, executive_id\) do nothing/i.test(body),
     'and re-saving a profile is not an error');
}

// ---------------------------------------------------------------------------
// 2. THE ACCOUNTS ALREADY BROKEN ARE REPAIRED
// ---------------------------------------------------------------------------
//
// The trigger only helps from now on. Two real Executive Directors were
// already blind, and a fix that leaves them that way is not a fix.
{
  ok(/insert into public\.church_executives \(church_id, executive_id\)\s*select/i.test(code),
     'existing executives are backfilled, not only future ones');
  const backfill = code.slice(code.indexOf('insert into public.church_executives (church_id, executive_id)\nselect'));
  const stmt = backfill.slice(0, backfill.indexOf(';') + 1);
  ok(/role = 'executive'/.test(stmt), 'the backfill takes executives');
  ok(/church_id is not null/.test(stmt), 'that have a church');
  ok(/on conflict/i.test(stmt), 'and running it twice is harmless');
}

// ---------------------------------------------------------------------------
// 3. THE ROLE STILL CANNOT BE HANDED OUT BY THE PERSON RECEIVING IT
// ---------------------------------------------------------------------------
//
// The link is authority. Creating it automatically is only safe because
// somebody else decided the role: the edge function refuses `executive` from
// anybody who is not already one, and a trigger stops a profile changing its
// own role. If either of those went, this trigger would turn a self-assigned role
// into real oversight, so they are checked here beside it.
{
  // CHECKED AS A RULE, NOT AS A FILENAME. The first version of this looked for
  // `0011_block_self_privilege_change.sql`, a name carried over from notes
  // about the other repository. No such file is here; the guarantee lives in
  // 0003_invite_approval_gate.sql. A check on a filename would have gone green
  // the day somebody renamed the file and red the day they did nothing wrong.
  ok(/You cannot change your own role, church or approval/.test(code),
     'a profile cannot change its own role, church or approval');
  ok(/new\.role is distinct from old\.role/.test(code),
     'and the role is one of the columns that rule watches');
  const invite = fs.readFileSync(
    path.join(root, 'supabase', 'functions', 'invite', 'index.ts'), 'utf8',
  );
  ok(/role === 'executive' && me\.role !== 'executive'/.test(invite),
     'and only an Executive Director can invite another one');
}

// ---------------------------------------------------------------------------
// 4. THE TRIGGER DOES NOT TAKE AUTHORITY AWAY
// ---------------------------------------------------------------------------
//
// An Executive Director may oversee SEVERAL churches -- that is what the table
// is for. A trigger that deleted rows on demotion would throw away assignments
// it never made and cannot recreate. It is safe to leave them because
// `oversees_church` demands `is_executive()` as well as the row, so a stale
// link on somebody who is no longer an executive grants nothing at all.
{
  const fn = code.slice(code.indexOf('function public.executive_oversees_their_church'));
  const body = fn.slice(0, fn.indexOf('$$;') + 3);
  ok(!/delete from public\.church_executives/i.test(body),
     'the trigger never deletes an oversight row');

  const oversees = code.lastIndexOf('function public.oversees_church');
  ok(oversees !== -1, 'oversees_church is defined');
  const def = code.slice(oversees, oversees + 400);
  ok(/is_executive\(\)/.test(def),
     'and it requires the role as well as the row, so a stale link is inert');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
