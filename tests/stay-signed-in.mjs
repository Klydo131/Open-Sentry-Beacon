// Staying signed in until you sign out.
//
// THE BUG THIS EXISTS FOR: "Your account is not ready. JWT expired."
//
// A Supabase access token lasts ONE HOUR. A refresh token lasts months and is
// what turns that into staying signed in on a device. Nothing here ever used
// the refresh token, so every member was signed out an hour after signing in
// and told their account was not ready, which is not what had happened.
//
// WHY THE CHECK IS ON THE SOURCE. The failure is a timing one: it needs a real
// token, a real hour and a real Supabase to reproduce, and by the time a
// browser test could see it the person is already signed out. What can be
// checked here are the four properties that make the refresh correct, each of
// which is a way this has gone wrong in real applications.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const CLIENT = 'lib/supabase/client.ts';
const raw = readFileSync(CLIENT, 'utf8');

// Comments blanked, so prose describing a rule cannot satisfy it.
let inBlock = false;
const code = raw.split('\n').map((line) => {
  if (inBlock) { if (line.includes('*/')) inBlock = false; return ''; }
  if (/^\s*\/\//.test(line)) return '';
  if (/^\s*\/\*/.test(line)) { if (!line.includes('*/')) inBlock = true; return ''; }
  return line;
}).join('\n');

// ---------------------------------------------------------------------------
// 1. The refresh token is actually used.
// ---------------------------------------------------------------------------
ok(/grant_type=refresh_token/.test(code),
   'the client exchanges the refresh token for a new session');
// The request itself moved into a `spend(token)` helper when the rotation race
// was fixed (7 below), because it is now made twice in one unlucky case. What
// matters is unchanged and is what is checked: the token that goes first is the
// one in storage, not a fresh Auth call.
ok(/refresh_token:\s*(token|session\.refresh_token)\b/.test(code),
   'and sends the stored refresh token to do it');
ok(/spend\(session\.refresh_token\)/.test(code),
   'starting with the token this call was handed');

// ---------------------------------------------------------------------------
// 2. The data client asks for a token that will still be valid.
// ---------------------------------------------------------------------------
// The whole bug was `accessToken: () => readBrowserSession()?.access_token`,
// which hands over whatever was written at sign-in, forever.
ok(/accessToken:\s*liveAccessToken/.test(code),
   'the data client asks liveAccessToken, not the stored token directly');
ok(!/accessToken:\s*async\s*\(\)\s*=>\s*readBrowserSession\(\)/.test(code),
   'and never goes back to handing over the stored token unchecked');

// ---------------------------------------------------------------------------
// 3. ONE REFRESH AT A TIME.
// ---------------------------------------------------------------------------
// Supabase ROTATES the refresh token on every use. A page load fires several
// requests at once; two concurrent refreshes mean the second presents a token
// the first already spent, is refused, and the person is signed out by the code
// meant to keep them in. A shared in-flight promise is the whole defence.
{
  ok(/let\s+refreshing/.test(code), 'there is a single in-flight refresh');
  ok(/if\s*\(refreshing\)\s*return\s+refreshing;/.test(code),
     'and a second caller waits on it rather than starting another');
  const fn = code.slice(code.indexOf('function refreshBrowserSession'));
  ok(fn.indexOf('if (refreshing) return refreshing;') < fn.indexOf('fetch('),
     'the guard comes BEFORE the request, which is the only place it helps');
}

// ---------------------------------------------------------------------------
// 4. Expiry is read from the token, not from the stored field.
// ---------------------------------------------------------------------------
// `expires_at` is written by whatever produced the session, and this app's
// comes from its own sign-in route. The `exp` claim inside the token is the
// only copy the server enforces.
ok(/function tokenExpiry/.test(code), 'expiry is read from the token itself');
ok(/\.split\('\.'\)\[1\]/.test(code) && /exp/.test(code),
   'by decoding the exp claim rather than trusting expires_at');
ok(/REFRESH_MARGIN_SECONDS/.test(code),
   'with margin, so a token cannot expire between the check and the request');

// ---------------------------------------------------------------------------
// 5. A network failure is not a sign-out.
// ---------------------------------------------------------------------------
// Being offline must never log a congregation out. Only the server SAYING the
// session is over ends it.
{
  const fn = code.slice(code.indexOf('function refreshBrowserSession'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  ok(/res\.status === 400 \|\| res\.status === 401/.test(body),
     'a refused refresh (400 or 401) clears the session');
  const catchBlock = body.slice(body.lastIndexOf('} catch'));
  ok(!/clearBrowserSession/.test(catchBlock),
     'but a thrown request, which is what being offline looks like, does NOT');
}

// ---------------------------------------------------------------------------
// 6. The dead-end screen is gone.
// ---------------------------------------------------------------------------
// "Your account is not ready. JWT expired." above a Sign out button: their
// account was fine, they do not know what a JWT is, and the only offered
// action was the one they did not want.
{
  const session = readFileSync('lib/live/session.tsx', 'utf8');
  ok(/jwt\|expired/i.test(session),
     'an expired session is recognised in the session provider');
  ok(/live\.signOut\(\)/.test(session) && /setError\(''\)/.test(session),
     'and shows the sign-in screen instead of naming the mechanism');
  ok(/visibilitychange/.test(session),
     'and coming back to the app re-checks, so a phone left overnight works');
}

// ---------------------------------------------------------------------------
// 7. Opening the app a second way does not sign you out of both.
// ---------------------------------------------------------------------------
// THE BUG: a Guide's screen showing their own name with "permission denied for
// table pairings" where the church should be. The screen had come from a link
// in Gmail — a SECOND context, alongside the copy already installed.
//
// Supabase ROTATES the refresh token on every use, so a token can be spent
// once. The in-flight promise above stops two refreshes racing inside one page;
// it cannot stop two places. The loser got a 400, called clearBrowserSession(),
// and destroyed the good session the winner had just written. Both contexts
// were then signed out, while both screens carried on showing the person's
// name — which is how a raw Postgres permission error ends up under somebody's
// morning greeting.
{
  const fn = code.slice(code.indexOf('function refreshBrowserSession'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  ok(/readBrowserSession\(\)/.test(body),
     'a refused refresh re-reads storage before concluding anything');
  ok(/refresh_token !== session\.refresh_token/.test(body),
     'and notices when another context has already moved the session on');
  ok(body.indexOf('clearBrowserSession') > body.indexOf('refresh_token !== session.refresh_token'),
     'the session is only cleared AFTER that second chance, never before it');
}

// ---------------------------------------------------------------------------
// 8. A session ending in THIS tab is not silent.
// ---------------------------------------------------------------------------
// `storage` events fire in other tabs only. So a session cleared here left the
// provider believing everything was fine: the screen stayed drawn, with the
// person's name on it, while every request behind it went out as nobody and
// each card filled with "permission denied". Signed out at the network and
// signed in on the screen is the worst of both — unusable, and not offering
// the one action that would fix it.
{
  ok(/announceSignedOut/.test(code),
     'the client announces when the stored session is gone');
  ok(/export function onSignedOut/.test(code),
     'and exposes a way to listen for it');
  const token = code.slice(code.indexOf('export async function liveAccessToken'));
  ok(/announceSignedOut\(\)/.test(token.slice(0, token.indexOf('\n}'))),
     'a data call made with no session at all announces it too, rather than '
     + 'going out anonymously and coming back as a Postgres permission error');

  const session = readFileSync('lib/live/session.tsx', 'utf8');
  ok(/onSignedOut\(/.test(session),
     'and the session provider listens, so the door is shown');
}

// ---------------------------------------------------------------------------
// 9. Tabbing away and coming back does not sign anybody out.
// ---------------------------------------------------------------------------
// THE PROBLEM: people were signed out after switching tabs or closing the
// browser.
//
// The server was not doing it. No session on the live project carries an
// expiry, and sessions lived for days. It was this file and the
// provider, in three ways at once.
{
  const session = readFileSync('lib/live/session.tsx', 'utf8');
  // Comments blanked out, line count kept. The note explaining this bug quotes
  // the old rule, and without this the explanation is reported as the bug.
  const shipped = session
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '');

  // (a) The question is no longer asked of the error message. `invalid` and
  //     `expired` are ordinary words: "invalid input syntax for type uuid" is a
  //     routine database complaint and it used to END THE SESSION.
  ok(!/\/jwt\|expired\|invalid/.test(shipped),
     'a session is no longer ended by matching words in an error message');
  ok(/verdictOnFailure/.test(shipped),
     'the decision is made by one function, from whether the session is still stored');

  // (b) A run nobody asked for may make things better and never worse.
  ok(/load\(readBrowserSession\(\), true\)/.test(shipped),
     'coming back to the tab is marked as a re-check');
  // addEventListener specifically. Asking only for the word 'online' passed
  // even with the listener deleted, because removeEventListener still mentions
  // it in the cleanup: a control that cannot fail is not a control.
  ok(/addEventListener\('online'/.test(shipped),
     'and the network returning retries, rather than waiting for a tap on a '
     + 'screen that has just said the account is not ready');
}

// The decision itself, run rather than read. This is the whole bug in four
// lines, and none of it needs a browser.
{
  const target = pathToFileURL(path.resolve('lib/live/session-verdict.ts')).href;
  let mod;
  try {
    mod = await import(target);
  } catch (err) {
    const strippable = /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/.test(
      String(err && (err.code || err.message)));
    if (!strippable || process.env.SESSION_VERDICT_RETRY === '1') {
      console.error('BAD could not load lib/live/session-verdict.ts on ' + process.version);
      process.exit(1);
    }
    const r = spawnSync(
      process.execPath,
      ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)],
      { stdio: 'inherit', env: { ...process.env, SESSION_VERDICT_RETRY: '1' } },
    );
    process.exit(r.status ?? 1);
  }
  const { verdictOnFailure } = mod;

  // The one case that ends a session: the client already established, from a
  // refusal by the server, that it is over.
  ok(verdictOnFailure({ sessionStillStored: false, recheck: false }) === 'signed-out',
     'a session the server refused is over');
  ok(verdictOnFailure({ sessionStillStored: false, recheck: true }) === 'signed-out',
     'and that is true however the load was started');

  // THE REPORTED CASE. Tab away, come back, the radio is not up yet, the read
  // fails. The session is untouched in storage, so nothing has happened.
  ok(verdictOnFailure({ sessionStillStored: true, recheck: true }) === 'hold',
     'a wake-up read that fails changes nothing at all');

  // A person pressed something and it failed. Tell them, but do not throw away
  // their session over it.
  ok(verdictOnFailure({ sessionStillStored: true, recheck: false }) === 'report',
     'a load somebody asked for reports its failure without signing them out');
  ok(verdictOnFailure({ sessionStillStored: true, recheck: false }) !== 'signed-out',
     'and never ends the session, whatever the error said');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
