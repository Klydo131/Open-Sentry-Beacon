// Three promises made to the owner today, each of which is invisible until it
// is broken in front of a congregation.
//
//   1. Deleting an account really frees the email address.
//   2. A Director can find one person in a list of thirty-seven.
//   3. Shipping an update does not sign everybody out.
//
// All three are properties of code that only misbehaves against a real
// database with real people in it, which is exactly the situation where you
// cannot experiment. So they are checked here, at the level where they can be.

import { readFileSync, existsSync, readdirSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');
/**
 * Source with comments blanked, so prose about a rule cannot satisfy it.
 *
 * Takes a path OR source text. It used to take only a path, which is what tied
 * these assertions to one file name; passing text lets a check be about the
 * whole signed-in app rather than about wherever the code happens to sit today.
 */
const code = (pathOrSource) => {
  const source = pathOrSource.includes('\n') ? pathOrSource : read(pathOrSource);
  let inBlock = false;
  return source.split('\n').map((line) => {
    if (inBlock) { if (line.includes('*/')) inBlock = false; return ''; }
    if (/^\s*\/\//.test(line)) return '';
    if (/^\s*\{?\/\*/.test(line)) { if (!line.includes('*/')) inBlock = true; return ''; }
    return line;
  }).join('\n');
};


/**
 * The source of every live screen, concatenated.
 *
 * Used where an assertion is about what the signed-in app DOES rather than
 * about one file. Includes the legacy path when it still holds code, so this
 * works before and after the split.
 */
function liveScreens() {
  const roots = ['components/live', 'components'];
  const out = [];
  for (const dir of roots) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.tsx')) continue;
      const full = `${dir}/${f}`;
      if (dir === 'components' && !/^Live/.test(f)) continue;
      out.push(read(full));
    }
  }
  return out.join('\n');
}

// EVERY LIVE SCREEN, NOT ONE FILE NAME.
//
// This read components/LiveCorePages.tsx. That file was three thousand lines
// and got split by screen, and the moment it did, ten assertions here went from
// passing to failing: not because anything broke, but because the test was
// pinned to a path rather than to the behaviour it is about. A check that a
// refactor can silently disable is worse than no check, because it goes on
// reporting OK.
//
// Reading the whole live folder means the next split cannot switch it off.
const ADMIN = liveScreens();
const DATA = 'lib/live/data.ts';

// ---------------------------------------------------------------------------
// 0. A recovery invitation still reaches its church's approval queue.
// ---------------------------------------------------------------------------
{
  const dataCode = code(DATA);
  const doorCode = code('components/live/DoorPages.tsx');
  const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
  const defining = migrations.filter((f) =>
    /create or replace function public\.claim_my_pending_invitation/.test(read(`supabase/migrations/${f}`)));

  ok(/rpc\(\s*['"]claim_my_pending_invitation['"]\s*\)/.test(dataCode),
     'an existing unassigned account can claim only its own invitation');
  ok(/await live\.claimMyPendingInvitation\(\);[\s\S]{0,500}const mine = await live\.getMyProfile\(\);/.test(doorCode),
     'the join flow claims a recovery invitation before deciding whether the account is pending');
  ok(defining.length > 0,
     'claim_my_pending_invitation is defined in a database migration');

  const latest = read(`supabase/migrations/${defining[defining.length - 1]}`);
  ok(/p\.church_id is null[\s\S]*p\.is_approved is false/.test(latest),
     'the repair only fills an unassigned, unapproved profile');
  ok(/join auth\.users u[\s\S]*lower\(btrim\(i\.email\)\) = lower\(btrim\(u\.email\)\)/.test(latest),
     'the repair binds the profile only to an invitation sent to that account email');
  ok(/old\.church_id is null[\s\S]*i\.church_id = new\.church_id[\s\S]*i\.role = new\.role/.test(latest),
     'the profile trigger allows no self-assignment beyond the exact pending invitation');
  ok(/revoke all on function public\.claim_my_pending_invitation\(\) from public, anon;[\s\S]*grant execute on function public\.claim_my_pending_invitation\(\) to authenticated;/.test(latest),
     'the invitation claim function is unavailable to anonymous callers');
}

// ---------------------------------------------------------------------------
// 0b. A browser-suggested password remains the invited person's choice.
// ---------------------------------------------------------------------------
// Safari may fill a new-password field directly, without firing the React
// change event that normally copies the value into component state. The app
// must retain that value before either revealing or saving it. Turning off
// autocomplete would only make Apple devices less secure, so the correct fix
// keeps the platform password manager and reads the actual inputs as a backup.
{
  const doorCode = code('components/live/DoorPages.tsx');

  ok(/useRef/.test(doorCode) && /passwordInput/.test(doorCode) && /confirmInput/.test(doorCode),
     'the invitation password inputs retain browser-filled values');
  ok(/const\s+readPasswordFields[\s\S]*passwordInput\.current\?\.value[\s\S]*confirmInput\.current\?\.value/.test(doorCode),
     'the form reads the actual password inputs as well as React state');
  ok(/const\s*\{\s*chosen:\s*chosenPassword,\s*confirmation\s*\}\s*=\s*readPasswordFields\(\)/.test(doorCode)
     && /password:\s*chosenPassword/.test(doorCode),
     'the exact password the person entered is validated and saved');
  ok(/onClick=\{\(\) => \{[\s\S]{0,120}readPasswordFields\(\);[\s\S]{0,120}setShowPassword/.test(doorCode),
     'Show password first preserves a Safari-generated value');
  ok(/showPassword\s*\?\s*'Hide'\s*:\s*'Show'/.test(doorCode),
     'the password visibility control uses clear words instead of an icon alone');
  ok((doorCode.match(/autoComplete="new-password"/g) || []).length === 2,
     'both password fields keep the browser new-password hint');
  // NAME-AGNOSTIC. This matched the app's name spelled out, so it went red the
  // day that sentence started reading the brand constant instead of a copy --
  // on a change that improved the code. The rule is that the screen says the
  // suggestion is the DEVICE'S and not the app's; how the app refers to itself
  // there is not the rule.
  ok(/suggestion comes from your device,[\s\S]*?not (\{APP_SHORT_NAME\}|\{APP_NAME\}|[A-Z][\w ]+)\./
       .test(doorCode),
     'the invitation screen explains that the app never generates a password');
}

// ---------------------------------------------------------------------------
// 1. Deleting an account frees the email address.
// ---------------------------------------------------------------------------
// THE BUG THIS EXISTS FOR. Deleting a member used to mean deleting their row in
// `profiles`. That table's id references auth.users ON DELETE CASCADE, and a
// cascade runs one way only, so the auth account survived every deletion --
// invisible, because only the service role can read auth.users.
//
// Two consequences, both reported before the cause was found: the removed
// person still held a working login, and their address could never be invited
// again, because member_by_email joins auth.users to profiles and still found
// the row. Only `delete from auth.users` finishes the job.
{
  const dataCode = code(DATA);
  const adminCode = code(ADMIN);

  ok(!/from\(\s*['"]profiles['"]\s*\)\s*\.delete\(/.test(dataCode),
     'no code path deletes a profile row on its own, which would strand the auth account');

  ok(/removeMemberByLeader/.test(dataCode) && /rpc\(\s*['"]remove_member_by_leader['"]/.test(dataCode),
     'removal goes through remove_member_by_leader, which the database authorises');

  // Every place a member can be removed must use it. A second, weaker helper
  // is how the old behaviour comes back on one screen and not the others.
  // Member removal only. `live.removePairingFile` deletes an attachment and has
  // nothing to do with accounts; matching it here would be noise.
  const removalCalls = [...adminCode.matchAll(/live\.remove(?:Member\w*|Person\w*)/g)].map((m) => m[0]);
  ok(removalCalls.length > 0, `the admin screen removes members (${removalCalls.length} call sites)`);
  ok(removalCalls.every((c) => c === 'live.removeMemberByLeader'),
     `every removal call site uses removeMemberByLeader (found: ${[...new Set(removalCalls)].join(', ') || 'none'})`);

  // THE PROPERTY THAT ACTUALLY FREES THE ADDRESS, read from the migration that
  // defines the function rather than from a comment claiming it.
  const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
  const defining = migrations.filter((f) =>
    /create or replace function public\.remove_member_by_leader/.test(read(`supabase/migrations/${f}`)));
  ok(defining.length > 0, `remove_member_by_leader is defined in a migration (${defining.join(', ')})`);
  const latest = read(`supabase/migrations/${defining[defining.length - 1]}`);
  const body = latest.slice(latest.indexOf('create or replace function public.remove_member_by_leader'));
  ok(/delete\s+from\s+auth\.users\s+where\s+id\s*=\s*p_target/.test(body),
     'its newest definition deletes the auth user, which is what frees the email address');
  ok(/discipline_check\(p_target\)/.test(body),
     'and it asks discipline_check first, so who may delete whom is decided in the database');
  ok(/insert into public\.discipline_log/.test(body),
     'and it records the removal before it happens, so the church can always say who did it');

  // A permanent act needs a second, deliberate tap. A single button in a list
  // of thirty-seven rows is one mis-tap away from deleting the wrong person.
  ok(/confirmDelete/.test(adminCode), 'deleting takes a second confirming tap');
}

// ---------------------------------------------------------------------------
// 2. A Director can find one person by name.
// ---------------------------------------------------------------------------
{
  const adminCode = code(ADMIN);
  ok(/findApproved/.test(adminCode), 'the approved list has a search box');
  ok(/approvedShown/.test(adminCode) && /approvedShown\.map\(/.test(adminCode)
     && !/\bapproved\.map\(/.test(adminCode),
     'and the list that renders is the FILTERED one, not the full list beside a box that does nothing');
  ok(/toLowerCase\(\)\.includes\(approvedNeedle\)/.test(adminCode),
     'matching ignores case, because a name copied out of an email rarely matches how it was typed');
}

// ---------------------------------------------------------------------------
// 2b. Acting on many accounts at once, without acting on the wrong ones.
// ---------------------------------------------------------------------------
// A bulk delete is the most dangerous control in the app: it is irreversible,
// it is one press, and the thing it acts on is a selection the Director cannot
// see all of at once. Three properties make it safe enough to exist.
{
  const adminCode = code(ADMIN);

  // (a) SELECT ALL MEANS THE ROWS ON SCREEN. With a search showing four of
  //     thirty-seven, a select-all that quietly took all thirty-seven is the
  //     difference between disapproving four people and disapproving a church.
  ok(/approvedShown\.map\(\(m\) => m\.id\)/.test(adminCode),
     'select-all takes the ids of the FILTERED rows, not of every account');
  ok(/pickedShown/.test(adminCode),
     'and the half-ticked state is measured against the filtered rows too');

  // (b) THE CONFIRMATION NAMES PEOPLE. "Delete 12 accounts?" is a number, not
  //     a confirmation: nobody can tell from it whether the twelve are the
  //     twelve they meant, and there is no undo to find out with.
  ok(/picked\.includes\(m\.id\)\)\s*\n?\s*\.map\(\(m\) => m\.full_name/.test(adminCode)
     || /\.map\(\(m\) => m\.full_name \|\| 'Unnamed account'\)\.join\(', '\)/.test(adminCode),
     'the confirmation lists every name, not just how many');

  // (c) ONE REFUSAL DOES NOT UNDO THE REST. The database refuses some pairs of
  //     people on purpose -- a Director may not remove another Director -- and
  //     a batch that abandons the other eleven on the first refusal makes the
  //     Director redo work they already decided on.
  const bulk = adminCode.slice(adminCode.indexOf('const runBulk'));
  const body = bulk.slice(0, bulk.indexOf('\n  };'));
  ok(/for \(const member of people\)/.test(body), 'the batch acts on one person at a time');
  ok(/catch \(cause\)/.test(body) && /continue;/.test(body),
     'and a refusal or a throw moves on to the next person rather than abandoning the batch');
  ok(/failed\.push/.test(body) && /setBulkResult/.test(body),
     'and every failure is reported by name afterwards');
}

// ---------------------------------------------------------------------------
// 3. Shipping an update does not sign anybody out.
// ---------------------------------------------------------------------------
// The session is one localStorage entry, `sb-<project-ref>-auth-token`. Nothing
// in the update path may remove it: not the service worker, not the crash
// recovery, not the reload. A deploy that signs out a whole congregation looks
// exactly like a deploy that broke the app, and the people it happens to are
// the least able to tell the difference.
//
// (Two things DO end every session and no test can prevent them, because they
// are not code: moving to a different Supabase project changes the storage key
// AND leaves the accounts behind in the old project, and moving to a different
// web address gives the browser a different origin with empty storage. Both
// belong in the migration plan, not here.)
{
  const files = ['components/SelfHeal.tsx', 'lib/auto-update.ts', 'app/sw.js/route.ts', 'components/BuildNotice.tsx'];
  for (const f of files) {
    const c = code(f);
    if (!c) { ok(false, `${f} exists to be checked`); continue; }
    ok(!/localStorage\s*\.\s*clear\s*\(/.test(c), `${f}: never clears localStorage wholesale`);
    ok(!/auth-token/.test(c), `${f}: never touches the auth token entry`);
  }

  // The crash recovery is the one that gets this wrong, because clearing
  // everything is the obvious way to fix a broken cache. It may unregister the
  // service worker and drop caches; the session is not its business.
  const heal = code('components/SelfHeal.tsx');
  ok(/caches\.delete/.test(heal) && /unregister\(\)/.test(heal),
     'SelfHeal repairs by dropping caches and the service worker');
  ok(!/localStorage/.test(heal),
     'and does not reach for localStorage at all, so a crash never costs somebody their sign-in');

  // Signing out on purpose is fine and must stay possible; scope matters.
  // A global sign-out would end that person's sessions on every device.
  const adminCode = code(ADMIN);
  const globalSignOuts = [...adminCode.matchAll(/signOut\(\{[^}]*scope:\s*'global'/g)];
  ok(globalSignOuts.length === 0, 'no screen signs a person out of all their devices at once');
}

// A dead invitation link is not a dead end.
//
// An invitation creates the account immediately and sets NO password, and the
// link in the email works exactly once. Somebody who opens it twice, or a day
// late, is then holding an account they cannot reach: no password to sign in
// with, and a link that will not open again. This happened to a real Guide on
// 1 September, and the only thing that screen offered them was "go to sign in",
// which is precisely what they could not do. The account had to be repaired by
// hand against the database.
//
// The recovery email already worked for exactly this case -- it does not care
// whether a password exists yet -- but it was only ever offered as "Forgot your
// password?", wording nobody in this position reads as theirs, because they
// have not forgotten a password, they have never had one.
{
  const door = read('components/live/DoorPages.tsx');
  const deadLink = door.slice(door.indexOf('const [rescueEmail'));

  const passwordCalls = read('lib/live/password.ts');
  ok(/await sendPasswordLink\(address\)/.test(deadLink) && /resetPasswordForEmail/.test(passwordCalls),
     'a stuck invitee can send themselves a fresh link without asking their church');
  ok(/redirectTo: `\$\{window\.location\.origin\}\$\{NEW_PASSWORD_PATH\}`/.test(passwordCalls),
     'and that link brings them to the page that sets a password');
  ok(/E-mail me a new link/i.test(door),
     'the way out is offered in their words, not as "forgot your password"');

  // The same answer whether or not the address has an account. Anything else
  // turns the box into a way of finding out who belongs to the church.
  const notice = (door.match(/setRescueNotice\('If that address[^']*'\)/) || [])[0] ?? '';
  ok(/If that address has an account/.test(notice),
     'and it never reveals whether an address is a member');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
