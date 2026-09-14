// Somebody who has signed in has joined, and keeps the password they are using.
//
// ---------------------------------------------------------------------------
// REPORTED TWICE IN ONE BREATH, and both are one column.
//
//   "some e-mails are already in the system but still in the re-send mail
//    list, any e-mail that is already part of the Open Sentry Beacon should not
//    be in the re-send mail list."
//
//   "once the user clicked and used the account the e-mail password that was
//    sent should remain and can't be changed because that's a resident account
//    already."
//
// `signup_completed_at` is stamped by the sign-up form, when somebody chooses
// their own password. That was the last step of the one-time-link flow and a
// good test of "really here". The invitation carries a PASSWORD now: the
// account exists before the message leaves, the person signs in at /login, and
// they never see that form. Nothing stamps the column, so the app asked a
// question the current design cannot answer and took silence for "not here".
//
// Measured on the live table when this was written: 82 people had signed in and
// EIGHT of them had no signup_completed_at. Eight residents on the Director's
// re-send list.
//
// THE SECOND REPORT IS THE SERIOUS ONE. Re-send calls the invite function,
// which refuses an address that has already joined by reading exactly this
// column. For those eight it read null, the refusal never fired, and a re-send
// REPLACED THE PASSWORD on an account already in use. A Director tidying their
// list would have locked eight people out. The invite function's own comment
// says "NOBODY'S WORKING PASSWORD IS EVER OVERWRITTEN"; that was true when it
// was written, and the flow moved underneath it.
//
// The answer was already in the database, and the screen was already reading
// it: church_invitations returned auth.users.last_sign_in_at as `opened_at` and
// drew it as "link opened, no password set yet". It knew these people had
// signed in and said the opposite.
//
//   node tests/signing-in-is-joining.mjs
//
// Reads the migration, since this sandbox has no database. The live effect was
// measured separately, as a real Director: residents on the re-send list went
// from eight to zero, and ninety-eight signed-in accounts now come back with
// completed_at set, which is what makes the refusal fire.
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

const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|--[^\n]*|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

const dir = path.join(root, 'supabase', 'migrations');
const sql = strip(
  fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n'),
);

/** The LAST definition of a function wins, since migrations replace. */
function lastDefinition(name) {
  // THE LAST DEFINITION, NOT THE LAST MENTION. This used to take the last
  // occurrence of `function public.<name>(`, which a GRANT line matches just as
  // well as a CREATE -- and a migration that revokes and re-grants execute puts
  // that grant after the definition. The helper then returned the tail of the
  // file from the grant onwards, found no `$$;`, and reported the function as
  // missing the body it had written correctly two lines earlier.
  const defs = [...sql.matchAll(
    new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\(`, 'g'),
  )];
  const at = defs.length ? defs[defs.length - 1].index : -1;
  if (at === -1) return '';
  const body = sql.slice(at);
  const end = body.indexOf('$$;');
  return end === -1 ? body : body.slice(0, end + 3);
}

// ---------------------------------------------------------------------------
// 1. THE SCREEN: a resident is not still waiting
// ---------------------------------------------------------------------------
{
  const fn = lastDefinition('church_invitations');
  ok(fn !== '', 'church_invitations is defined');
  ok(/coalesce\(p\.signup_completed_at, u\.last_sign_in_at\) as joined_at/.test(fn),
     'joined_at counts signing in, not only finishing the old sign-up form');
  ok(!/^\s*p\.signup_completed_at as joined_at/m.test(fn),
     'and no longer reads the column the password flow never stamps');
}

// ---------------------------------------------------------------------------
// 2. THE SEND: a resident's password is not replaced
// ---------------------------------------------------------------------------
//
// The same rule in both places, so the screen and the send can never disagree
// about who is already a member. If only the screen were fixed, the row would
// vanish from the list while the function still happily reset the password of
// anybody reached another way.
{
  const fn = lastDefinition('member_by_email');
  ok(fn !== '', 'member_by_email is defined');
  ok(/coalesce\(p\.signup_completed_at, u\.last_sign_in_at\)/.test(fn),
     'completed_at counts signing in too, which is what makes the refusal fire');

  const invite = read('supabase/functions/invite/index.ts');
  ok(/if \(existing && existing\.completed_at\)/.test(invite),
     'and the invite function still refuses an address that has joined');
  ok(/already has a Hope Beacon account|is already \$\{who\} in this church/.test(invite)
     || /already/.test(invite),
     'with a refusal rather than a silent password reset');
}

// ---------------------------------------------------------------------------
// 3. THE BADGE THAT SAID THE OPPOSITE OF THE TRUTH IS GONE
// ---------------------------------------------------------------------------
//
// "link opened, no password set yet" was drawn from `opened_at`, which IS
// last_sign_in_at. It announced that somebody using the app had no password,
// beside a button that would then take away the one they were using.
{
  // STRIPPED, because the comment left where the badge was quotes the words it
  // used to say. A rule about what the screen DRAWS has to read the code, and
  // the first version of this check failed on its own explanation.
  const page = strip(read('components/LiveChurchPages.tsx'));
  ok(!/no password set yet/.test(page),
     'the badge claiming a signed-in person has no password is gone');
  ok(!/\{i\.opened_at &&/.test(page),
     'and nothing else draws a badge from the sign-in time');
  // Keyed on joined_at, but NOT pinned to the whole expression. The list may be
  // narrowed further -- it now also leaves out people whose account was deleted,
  // because Re-send on one of those rebuilds them -- and a check that pins the
  // exact filter forbids every future narrowing rather than the one thing it
  // cares about, which is that "waiting" still means "has not joined".
  ok(/const waiting = \(invites \?\? \[\]\)\.filter\(\(i\) => !i\.joined_at/.test(page),
     'and the waiting list is still the people who have not joined');
  ok(/const joined = \(invites \?\? \[\]\)\.filter\(\(i\) => i\.joined_at\)/.test(page),
     'with everybody else under Accepted');
}

// ---------------------------------------------------------------------------
// 4. NOTHING WAS REWRITTEN TO ACHIEVE IT
// ---------------------------------------------------------------------------
//
// A backfill would have been the quick version: stamp signup_completed_at from
// last_sign_in_at and every reader is fixed at once. It also destroys the one
// thing that column means -- that somebody chose their own password -- and no
// later reader could tell a real completion from a repair. Coalescing at the
// two places that ask keeps the stored data honest.
{
  const mine = read('supabase/migrations/20260907140000_signing_in_is_joining.sql');
  ok(!/update public\.profiles\s+set signup_completed_at/i.test(strip(mine)),
     'signup_completed_at is not backfilled from a sign-in time');
  ok(!/insert into/i.test(strip(mine)),
     'and the migration writes no rows at all, only function definitions');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
