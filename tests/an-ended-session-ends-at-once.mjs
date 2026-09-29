// A session ended elsewhere is refused at once, not an hour later.
//
// Asked on 29 September 2026: "Improve what can be improved." The last open
// gap under "What is not protected" in docs/SECURITY.md was this one: signing
// out everywhere else, choosing a password, or an invitation's week running out
// ended the session on the server, but the pass a device already held kept
// working for up to an hour.
//
// The migration was run against the live database in a transaction that was
// thrown away: a live session was let through and saw its church; the same
// person with an ended session was refused with PT401 and saw nothing; a token
// without a session id and the signed-out role were let through. The first
// run also showed the signed-out role REFUSED, because replacing a function in
// `public` fires lock_new_functions; the grant this file checks for is why.
//
//   node tests/an-ended-session-ends-at-once.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const sqlCode = (src) => src.replace(/--[^\n]*/g, '');
const jsCode = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const MIGRATION = 'supabase/migrations/20260929130000_an_ended_session_ends_at_once.sql';

// ---------------------------------------------------------------------------
// 1. THE DATABASE ASKS, ON EVERY REQUEST, WHETHER THE SESSION IS STILL ON RECORD
// ---------------------------------------------------------------------------
{
  ok(fs.existsSync(path.join(root, MIGRATION)), 'the migration is present');
  const sql = sqlCode(read(MIGRATION));
  const fn = (name) => {
    const at = sql.indexOf(`create or replace function ${name}(`);
    return at === -1 ? '' : sql.slice(at, sql.indexOf('$$;', sql.indexOf('as $$', at)) + 3);
  };

  const live = fn('private.my_session_is_live');
  ok(/from auth\.sessions s/.test(live) && /s\.id = \(auth\.jwt\(\) ->> 'session_id'\)::uuid/.test(live),
    'the question is whether the session this request came with is still in auth.sessions');
  ok(/s\.not_after is null or s\.not_after > now\(\)/.test(live),
    'or past its own end, which is when the sign-in server would refuse to renew it too');
  ok(/when coalesce\(auth\.jwt\(\) ->> 'role', ''\) <> 'authenticated' then true/.test(live),
    'the signed-out role and the server are let through, as before');
  ok(/when coalesce\(auth\.jwt\(\) ->> 'session_id', ''\) !~ '\^\[0-9a-fA-F-\]\{36\}\$' then true/.test(live),
    'and so is a token without a well-formed session id, so nobody is locked out by a missing claim');
  ok(live.indexOf("->> 'session_id', '') !~") < live.indexOf('::uuid'),
    'the id is checked before it is cast, so a malformed one cannot fail every request');
  ok(/revoke all on function private\.my_session_is_live\(\) from public, anon, authenticated;/.test(sql),
    'no browser can call the question itself');

  const pre = fn('public.refuse_suspended_requests');
  ok(/if not private\.my_session_is_live\(\) then/.test(pre) && /errcode = 'PT401'/.test(pre),
    'the data API\'s check before every request refuses an ended session with a 401');
  ok(pre.indexOf("errcode = '42501'") !== -1 && pre.indexOf("errcode = '42501'") < pre.indexOf("errcode = 'PT401'"),
    'and still refuses a suspended account first, as it did');
  ok(/grant execute on function public\.refuse_suspended_requests\(\) to anon;/.test(sql),
    'the signed-out role keeps its grant: replacing the function takes it away, and every signed-out page would fail');

  const socket = fn('private.i_am_not_suspended');
  ok(/and private\.my_session_is_live\(\)/.test(socket),
    'the rule every broadcast table and the file store require asks it too, so the socket and files stop at once');

  for (const name of ['private.my_session_is_live', 'public.refuse_suspended_requests', 'private.i_am_not_suspended']) {
    ok(/security definer\s+set search_path = ''/.test(fn(name)), `${name} pins an empty search_path`);
  }

  const holds = read('supabase/tests/fresh-install-holds.sql');
  ok(/my_session_is_live/.test(holds) && /has_function_privilege\('anon', 'public\.refuse_suspended_requests\(\)', 'execute'\)/.test(holds),
    'a fresh install is held to both: the session check, and the signed-out role still let through');
}

// ---------------------------------------------------------------------------
// 2. THE DEVICE HEARS THE 401 AND ASKS THE ONE SERVER THAT KNOWS
// ---------------------------------------------------------------------------
{
  const client = jsCode(read('lib/supabase/client.ts'));
  ok(/accessToken: liveAccessToken, global: \{ fetch: dataFetch \}/.test(client),
    'every data request goes through the fetch that listens for the refusal');
  const df = client.slice(client.indexOf('const dataFetch'), client.indexOf('export function supabase()'));
  ok(/shouldRecheckSession\(res\.status, lastRecheckAt, now\)/.test(df) && /refreshBrowserSession\(session\)/.test(df),
    'a refused request makes the device spend its refresh token, once');
  ok(df.indexOf('lastRecheckAt = now') !== -1 && df.indexOf('lastRecheckAt = now') < df.indexOf('refreshBrowserSession(session)'),
    'and marks the time before it does, so two refusals at once ask once');
  ok(!/clearBrowserSession|announceSignedOut/.test(df),
    'it never decides the session is over itself: only the server refusing the refresh does that');
  ok(/return res;/.test(df), 'and every answer still reaches whoever asked, untouched');
}

// ---------------------------------------------------------------------------
// 3. WHEN TO ASK, RUN RATHER THAN READ
// ---------------------------------------------------------------------------
{
  const target = pathToFileURL(path.join(root, 'lib/supabase/session-recheck.ts')).href;
  let mod;
  try {
    mod = await import(target);
  } catch (err) {
    const strippable = /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/.test(String(err && (err.code || err.message)));
    if (!strippable || process.env.SESSION_RECHECK_RETRY === '1') {
      console.error('BAD could not load lib/supabase/session-recheck.ts on ' + process.version);
      process.exit(1);
    }
    const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)],
      { stdio: 'inherit', env: { ...process.env, SESSION_RECHECK_RETRY: '1' } });
    process.exit(r.status ?? 1);
  }
  const { shouldRecheckSession, RECHECK_AFTER_REFUSAL_MS } = mod;
  const now = 10_000_000;
  ok(shouldRecheckSession(401, 0, now), 'a 401 asks');
  ok(!shouldRecheckSession(200, 0, now) && !shouldRecheckSession(403, 0, now) && !shouldRecheckSession(500, 0, now),
    'nothing else does: a refusal for any other reason is not about the session');
  ok(!shouldRecheckSession(401, now - 1000, now), 'a second 401 a moment later does not ask again');
  ok(shouldRecheckSession(401, now - RECHECK_AFTER_REFUSAL_MS, now), 'after a minute it may');
  ok(RECHECK_AFTER_REFUSAL_MS === 60_000, 'at most once a minute');
}

// ---------------------------------------------------------------------------
// 4. SAID WHERE A CHURCH WILL READ IT
// ---------------------------------------------------------------------------
{
  const security = read('docs/SECURITY.md');
  ok(!/Closing that hour means checking the session on every request, and\s+that is not done yet/.test(security),
    'SECURITY.md no longer lists the last hour of an ended session as unprotected');
  ok(/ended session is refused at once/i.test(security), 'and says what happens now');
}

console.log(bad === 0 ? '\nA session ended anywhere is ended everywhere, at once.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
