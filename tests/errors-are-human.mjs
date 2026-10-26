// A person is never shown Postgres.
//
// THE BUG THIS EXISTS FOR, on a Guide's own screen, on a phone:
//
//     permission denied for table pairings
//     permission denied for function blog_feed
//
// printed in red where the church's pairings and Community Blogs should have
// been, under that Guide's own name and their reminders. And in a conversation:
//
//     mime type application/vnd.openxmlformats-officedocument.wordprocessingml
//     .document is not supported
//
// after attaching a study sheet.
//
// Every one of those is the database or the storage layer talking to itself.
// None of them names anything the reader can do. The first two do not even mean
// what they appear to mean: `pairings` grants SELECT to `authenticated` and
// nothing to `anon`, so "permission denied for table" is Postgres saying the
// request arrived as NOBODY — a signed-out session, not a rule anybody broke.
// Reported as a permission problem it sends a Director looking for a setting
// that does not exist.
//
// This runs the shipped translator over the real strings. It is a pure
// function, so the check is the function itself and not a copy of it.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = pathToFileURL(path.join(root, 'lib/live/errors.ts')).href;

// Type stripping is on by default from Node 22.18 and behind a flag from 22.6.
let mod;
try {
  mod = await import(target);
} catch (err) {
  const strippable = /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION|ERR_UNSUPPORTED_NODE_MODULE/
    .test(String(err && (err.code || err.message)));
  if (!strippable || process.env.HUMAN_ERROR_RETRY === '1') {
    console.error('BAD could not load lib/live/errors.ts on ' + process.version
      + '\n    ' + String(err && err.message));
    process.exit(1);
  }
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)],
    { stdio: 'inherit', env: { ...process.env, HUMAN_ERROR_RETRY: '1' } },
  );
  process.exit(r.status ?? 1);
}

const { humanError } = mod;

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'BAD '} ${msg}`);
  if (!cond) bad++;
};

const said = (raw) => humanError(new Error(raw), 'FALLBACK');

// ---- The two from the screenshot ------------------------------------------
for (const raw of [
  'permission denied for table pairings',
  'permission denied for function blog_feed',
  'permission denied for schema public',
]) {
  const out = said(raw);
  ok(!/permission denied|table|function|schema/i.test(out), `"${raw}" is not repeated back`);
  ok(/signed out/i.test(out), `"${raw}" is reported as being signed out`);
}

// A dead token is the same thing said differently, and used to reach the screen
// as "JWT expired" under a Sign out button.
for (const raw of ['JWT expired', 'invalid claim: missing sub claim', 'No API key found in request']) {
  ok(/signed out/i.test(said(raw)), `"${raw}" is reported as being signed out`);
}

// ---- A rule the person really did hit -------------------------------------
//
// This must NOT be confused with the above. Being told "you are signed out"
// when you are signed in and simply not allowed to do something sends somebody
// to sign in again, twice, and then to report the app as broken.
const rls = said('new row violates row-level security policy for table "announcements"');
ok(/permission/i.test(rls) && !/signed out/i.test(rls),
  'a row-level security refusal is a permission answer, not a sign-out');
ok(!/row-level security|announcements/i.test(rls), 'and it does not name the table or the policy');

// ---- The attachment -------------------------------------------------------
const mime = said(
  'mime type application/vnd.openxmlformats-officedocument.wordprocessingml.document is not supported',
);
ok(!/mime|vnd\.openxmlformats/i.test(mime), 'the mime type is not read out to the reader');
ok(/word/i.test(mime), 'and the answer names what can be attached instead');

const big = said('The object exceeded the maximum allowed size');
ok(/10 MB/.test(big), 'a file that is too big is told the actual limit');

// ---- The constraint name off the Director's phone --------------------------
//
// This is the one that was actually photographed and sent in. A constraint name
// is not a sentence, and this one appeared where "disconnect the other Guide
// first" was the whole answer.
const dup = said('duplicate key value violates unique constraint "pairings_one_active_guide"');
ok(!/duplicate key|constraint|pairings_/i.test(dup), 'a constraint name never reaches a screen');
ok(/Disconnect/i.test(dup), 'and the rule that was hit is said in words, with the way out');

// A rule nobody has written a sentence for yet still must not print SQL.
const dupUnknown = said('duplicate key value violates unique constraint "some_future_thing_key"');
ok(!/duplicate key|constraint|some_future_thing/i.test(dupUnknown),
  'an unnamed unique rule is still not read out as SQL');

// ---- Offline --------------------------------------------------------------
ok(/connection/i.test(said('Failed to fetch')), 'a dead network is reported as a connection');

// ---- Setting a password -----------------------------------------------------
//
// Found on 26 October 2026, reading every screen that sets one. Each string is
// the sign-in service's own, with the `code` it sends (Supabase Auth and the
// Postgres edition, selfhost/server/src/auth.mjs, use the same ones).
const authErr = (message, code, extra = {}) => Object.assign(new Error(message), { code, ...extra });
const aal = humanError(authErr('AAL2 session is required to update password', 'insufficient_aal'), 'FALLBACK');
ok(/authenticator/i.test(aal) && !/AAL2/.test(aal),
  'a member with an authenticator app is asked for its code, not told "AAL2 session is required"');
ok(/already have/i.test(humanError(authErr('New password should be different from the old password.', 'same_password'))),
  'typing the old password again is answered in words');
ok(/leaked/i.test(humanError(authErr('Password is known to be weak and easy to guess, please choose a different one.',
  'weak_password', { reasons: ['pwned'] }))), 'a leaked password is called that');
ok(/too long/i.test(humanError(authErr('Password should be at most 72 characters.', 'weak_password'))),
  'a password over 72 characters is told it is too long');
ok(/mix of/i.test(humanError(authErr(
  'Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789.',
  'weak_password', { reasons: ['characters'] }))), "a church's character rule is said in words");
const wait = humanError(authErr('For security purposes, you can only request this after 37 seconds.', 'over_email_send_rate_limit'));
const waitNoCode = said('For security purposes, you can only request this after 37 seconds.');
ok(/37 seconds/.test(wait) && /37 seconds/.test(waitNoCode),
  'a second reset request within the minute is told to wait, and for how long when that is known');
ok(/run out|already been used/i.test(humanError(authErr('Email link is invalid or has expired', 'otp_expired'))),
  'a dead reset link says so, and that a new one can be asked for');
ok(/too long/i.test(said('Auth session missing!')), 'a page left open past its session says so, not "Auth session missing!"');
ok(/confirm it is you/i.test(humanError(authErr('Password update requires reauthentication.', 'reauthentication_needed'))),
  'a church that requires a fresh confirmation is asked for one');
// The library's errors are not always Error instances.
ok(/already have/i.test(humanError({ name: 'AuthApiError', message: 'x', code: 'same_password' })),
  'an error object that is not an Error is still read by its code');

// ---- Anything else is passed through, and nothing is lost ------------------
ok(said('Choose somebody to walk with first.') === 'Choose somebody to walk with first.',
  "a sentence already written for a person is left exactly as it is");
ok(humanError(null, 'FALLBACK') === 'FALLBACK', 'a non-Error falls back');
ok(humanError(new Error(''), 'FALLBACK') === 'FALLBACK', 'an empty message falls back');

// ---- Nobody kept their own copy -------------------------------------------
//
// The same ternary was pasted into thirty-three components. The point of this
// module is that there is now one of it; a component that still formats its own
// error message is one that will not translate.
const { readFileSync, readdirSync, statSync } = await import('node:fs');
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  if (statSync(full).isDirectory()) return walk(full);
  return /\.tsx?$/.test(name) ? [full] : [];
});
const live = [...walk(path.join(root, 'components')), ...walk(path.join(root, 'app'))];
const strays = live.filter((f) => {
  const src = readFileSync(f, 'utf8');
  // Only live screens matter: the sample-data build has no database to refuse
  // anything, so its errors are ones this app wrote itself.
  if (!/lib\/live\//.test(src)) return false;
  return /instanceof Error \? \w+\.message/.test(src);
});
ok(strays.length === 0,
  strays.length ? `these live screens still format their own errors: ${strays.map((f) => path.relative(root, f)).join(', ')}`
                : 'no live screen formats its own error message');

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} BAD`);
process.exit(bad === 0 ? 0 : 1);
