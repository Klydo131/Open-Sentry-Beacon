// What a request can learn, and how fast it can ask.
//
// ---------------------------------------------------------------------------
// Four small rules, each held here so a later change cannot loosen it quietly:
//
//   1. A deletion notice (Postgres edition) carries nothing about the row, is
//      never matched against a watcher's filter, and reaches signed-in
//      watchers only.
//   2. The caller's address is the one the nearest proxy reports, and only a
//      real IP address is ever used.
//   3. A new password (Postgres edition) ends every other sign-in at once,
//      on the server.
//   4. Sign-in counts failures per account and per address before the
//      password is even checked.
//
//   node tests/what-a-request-can-learn.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { stripTs, stripSql } from './_strip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// 1. Deletion notices -------------------------------------------------------
const rt = stripTs(read('selfhost/server/src/realtime.mjs'));
ok(/change\.op === 'DELETE' \? signedIn\(channel\.claims\)/.test(rt),
  'a deletion reaches a watcher by sign-in alone, not by matching the row');
ok(!/oldRowMatches|change\.o\b/.test(rt), 'and nothing compares a deleted row to a filter');
ok(/record: \{\}, old_record: \{\}/.test(rt), 'the notice sent to a screen holds no row');
const platform = stripSql(read('selfhost/sql/platform.sql'));
const announce = platform.slice(platform.indexOf('function beacon_platform.announce()'));
ok(!/'o'\s*,/.test(announce.slice(0, announce.indexOf('$$;'))),
  'and the database never sends a deleted row\'s values out at all');
{
  const { signedIn } = await import(pathToFileURL(path.join(root, 'selfhost/server/src/realtime.mjs')));
  ok(signedIn({ sub: 'a', role: 'authenticated' }) === true, 'a person\'s sign-in counts as signed in');
  ok(signedIn({ role: 'anon' }) === false && signedIn({ sub: 'a', role: 'anon' }) === false && signedIn(null) === false,
    'the public key never does');
}

// 2. The caller's address ----------------------------------------------------
{
  const { clientIp } = await import(pathToFileURL(path.join(root, 'selfhost/server/src/http.mjs')));
  const req = (xff, own) => ({ headers: { 'x-forwarded-for': xff }, socket: { remoteAddress: own } });
  ok(clientIp(req('203.0.113.9, 198.51.100.7', '127.0.0.1'), true) === '198.51.100.7',
    'behind a trusted proxy, the address the proxy added is used, not one the caller wrote');
  ok(clientIp(req('not an address', '127.0.0.1'), true) === '127.0.0.1',
    'a value that is not an IP address is never used');
  ok(clientIp(req('198.51.100.7', '10.0.0.2'), false) === '10.0.0.2',
    'and with no trusted proxy, the header is ignored');
}

// 3. A new password ends other sign-ins -------------------------------------
{
  const auth = stripTs(read('selfhost/server/src/auth.mjs'));
  const fn = auth.slice(auth.indexOf('async function updateUser('), auth.indexOf('async function logout('));
  const setPw = fn.indexOf('set encrypted_password');
  const end = fn.indexOf("delete from auth.sessions where user_id = $1 and id <> $2");
  ok(setPw > -1 && end > setPw, 'a new password ends every other sign-in, in the same transaction');
}

// 4. Sign-in failures are counted --------------------------------------------
{
  const route = stripTs(read('app/api/auth/sign-in/route.ts'));
  const held = route.indexOf('if (heldBack(limitKeys))');
  const check = route.indexOf('signInWithPassword(');
  ok(held > -1 && held < check, 'too many failures are turned away before the password is checked');
  ok(/limitKeys = \[`email:\$\{email\}`/.test(route) && /`ip:\$\{\w+\}`/.test(route) && /callerAddress\(request\)/.test(route),
    'counted per account and per address');
  const failBlock = route.slice(route.indexOf('if (authError || !authData.user'), route.indexOf('fails.delete(`email:'));
  ok(/failed\(limitKeys\)/.test(failBlock), 'every failed attempt is counted');
  ok(/jsonResponse\(\{ error: TOO_MANY \}, 429\)/.test(route.slice(held, check)),
    'and the answer is the same "wait" whether or not the account exists');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
