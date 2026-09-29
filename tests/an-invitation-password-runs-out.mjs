// The password an invitation e-mails runs out after seven days, choosing a
// password signs out every other device, and none of it depends on the code
// being secret.
//
// Asked on 29 September 2026: "If access to user's password is changed, can I
// still access the account in the invitation letter? Hackers might exploit that
// system in the long run if they saw the code in the open source code. We must
// find a better security system where the user is in control with it's data and
// password security even if everyone can the the open source code and systems."
//
// The migration was run against the live database in a transaction that was
// thrown away, with two made-up accounts: the letter's password stopped
// working and its devices were signed out; a password chosen by the person was
// left exactly as it was. This file holds the rules that made that true.
//
//   node tests/an-invitation-password-runs-out.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const sqlCode = (src) => src.replace(/--[^\n]*/g, '');
const jsCode = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const MIGRATION = 'supabase/migrations/20260929100000_an_invitation_password_runs_out.sql';

// ---------------------------------------------------------------------------
// 1. THE DATABASE ENFORCES IT, AND NO BROWSER CAN REACH IT
// ---------------------------------------------------------------------------
{
  ok(fs.existsSync(path.join(root, MIGRATION)), 'the migration is present');
  const sql = sqlCode(read(MIGRATION));
  const fn = (name) => {
    const at = sql.indexOf(`create or replace function public.${name}(`);
    return at === -1 ? '' : sql.slice(at, sql.indexOf('$$;', sql.indexOf('as $$', at)) + 3);
  };

  ok(/alter table public\.temporary_passwords enable row level security;/.test(sql)
     && !/create policy[^;]*temporary_passwords/.test(sql),
    'the table has row-level security and not one policy: no browser can read or write it');
  ok(/revoke all on table public\.temporary_passwords from public, anon, authenticated;/.test(sql),
    'and no grant to anybody signed in or not');

  const start = fn('start_temporary_password');
  ok(/interval '7 days'/.test(start), 'an invitation password lasts seven days');
  ok(/select u\.encrypted_password into current_hash from auth\.users u where u\.id = p_user;/.test(start),
    'and the hash it was set with is kept, to tell it from any password chosen later');
  ok(/grant execute on function public\.start_temporary_password\(uuid\) to service_role;/.test(sql)
     && /revoke all on function public\.start_temporary_password\(uuid\) from public, anon, authenticated;/.test(sql),
    'only the invitation (the service role) can start the clock');

  const end = fn('end_expired_temporary_passwords');
  ok(/t\.expires_at <= now\(\)/.test(end) && /and u\.encrypted_password = t\.hash/.test(end),
    'it acts only on a password still exactly the one the invitation set');
  ok(/extensions\.gen_random_bytes\(32\)/.test(end) && /extensions\.gen_salt\('bf'\)/.test(end),
    'and replaces it with a random one nobody knows, in the same bcrypt form as every password');
  ok(/delete from auth\.sessions where user_id = r\.user_id;/.test(end),
    'and signs out every device that used it');
  ok(/revoke all on function public\.end_expired_temporary_passwords\(\) from public, anon, authenticated;/.test(sql)
     && !/grant execute on function public\.end_expired_temporary_passwords/.test(sql),
    'nobody can call that from a browser, to lock somebody else out');
  ok(/cron\.schedule\(\s*'invitation-passwords-run-out',\s*'17 \* \* \* \*'/.test(sql), 'it runs every hour');

  const mine = fn('my_temporary_password_ends');
  ok(/where t\.user_id = \(select auth\.uid\(\)\)/.test(mine) && /and u\.encrypted_password = t\.hash/.test(mine),
    'a member can ask only about their own, and is told nothing once they chose their own');

  const trig = fn('a_chosen_password_ends_the_letter');
  ok(/after update of encrypted_password on auth\.users/.test(sql) && /new\.encrypted_password is distinct from old\.encrypted_password/.test(trig),
    'choosing any password, by any door, ends the clock');

  for (const name of ['start_temporary_password', 'my_temporary_password_ends', 'a_chosen_password_ends_the_letter', 'end_expired_temporary_passwords']) {
    ok(/security definer\s+set search_path = ''/.test(fn(name)), `${name} pins an empty search_path`);
  }

  // NOBODY ALREADY INVITED IS STARTED ON A CLOCK by this migration: the owner's
  // own accounts were among them, and locking them out is the owner's call.
  ok(!/insert into public\.temporary_passwords[\s\S]*?select[\s\S]*?from public\.profiles/.test(sql),
    'no existing account is put on a clock without the owner saying so');
}

// ---------------------------------------------------------------------------
// 2. THE INVITATION STARTS IT, AND SAYS SO
// ---------------------------------------------------------------------------
{
  const invite = jsCode(read('supabase/functions/invite/index.ts'));
  const set = Math.max(invite.lastIndexOf('admin.auth.admin.updateUserById(personId'), invite.lastIndexOf('admin.auth.admin.createUser('));
  const clock = invite.indexOf("admin.rpc('start_temporary_password', { p_user: personId })");
  ok(clock !== -1 && clock > set, 'the invitation starts the clock after it sets the password, so the hash is the new one');

  const email = read('supabase/functions/invite/email.ts');
  ok((email.match(/stops working after seven days/g) ?? []).length === 2,
    'the e-mail says the password stops working after seven days, in the HTML and the plain text');
}

// ---------------------------------------------------------------------------
// 3. THE PERSON IS IN CONTROL OF WHO IS SIGNED IN AS THEM
// ---------------------------------------------------------------------------
{
  const data = jsCode(read('lib/live/data.ts'));
  const signOut = data.slice(data.indexOf('export async function signOutOtherDevices'), data.indexOf('export async function myTemporaryPasswordEnds'));
  ok(/client\.auth\.signOut\(\{ scope: 'others' \}\)/.test(signOut), 'there is a way to sign out every other device');
  const change = data.slice(data.indexOf('export async function changeMyPassword'), data.indexOf('export async function clearTemporaryPasswordReminder'));
  ok(change.indexOf('signOutOtherDevices()') > change.indexOf('client.auth.updateUser({ password: next })'),
    'changing a password signs out every other device, after the change');

  const door = jsCode(read('components/live/DoorPages.tsx'));
  const reset = door.slice(door.indexOf('password: chosenPassword'));
  ok(/live\.signOutOtherDevices\(\)/.test(reset.slice(0, 1200)) && /live\.clearTemporaryPasswordReminder\(\)/.test(reset.slice(0, 1200)),
    'a password chosen from a reset e-mail does the same, and clears the reminder that door used to leave behind');

  const page = jsCode(read('components/LiveAccountPages.tsx'));
  ok(/Sign out everywhere else/.test(page) && /live\.signOutOtherDevices\(\)/.test(page),
    'the Password page has "Sign out everywhere else"');
  ok(/live\.myTemporaryPasswordEnds\(\)/.test(page) && /It stops working on/.test(page),
    'and tells somebody on an invitation password the day it stops working');
  ok(/stops working seven days after it was sent/.test(read('components/live/DoorPages.tsx')),
    'and the sign-in page says so where a refused password is explained');
}

console.log(bad === 0 ? '\nAn invitation is a way in for a week, and the person decides after that.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
