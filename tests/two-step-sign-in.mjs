// Two-step sign-in asks the sign-in server the right things, in the right order.
//
// lib/live/two-step.ts is bundled and run against a stand-in browser (storage
// and a fetch that records what it was asked) and a stand-in sign-in server
// that answers the way Supabase's does. The database's half is proved as
// invented people by supabase/tests/a-second-step-is-required.sql.
//
//   node tests/two-step-sign-in.mjs

import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const URL_ = 'https://two-step-test.supabase.example';
const KEY = 'anon-key-for-this-test';
const STORE = 'sb-two-step-test-auth-token';
const ME = '00000000-0000-4000-8000-0000000000a1';
const APP_FACTOR = '00000000-0000-4000-8000-00000000f0a1';
const HALF_DONE = '00000000-0000-4000-8000-00000000f0b1';
const NEW_FACTOR = '00000000-0000-4000-8000-00000000f0c1';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-two-step-'));
const bundle = path.join(out, 'two-step.mjs');
await build({
  entryPoints: [path.join(root, 'lib/live/two-step.ts')],
  alias: { '@': root },
  define: {
    'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(URL_),
    'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(KEY),
  },
  outfile: bundle,
  bundle: true, format: 'esm', platform: 'node', target: 'es2020', logLevel: 'silent',
});

// A stand-in browser: one storage, one event target, one fetch.
const storage = new Map();
globalThis.window = Object.assign(new EventTarget(), {
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
});
let calls = [];
let answer = async () => new Response('{}', { status: 200 });
globalThis.fetch = async (input, init = {}) => {
  calls.push({
    url: String(input).replace(URL_, ''),
    method: init.method,
    headers: init.headers ?? {},
    body: init.body ? JSON.parse(init.body) : undefined,
  });
  return answer(String(input).replace(URL_, ''), init);
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

const T = await import(pathToFileURL(bundle).href);

// A token an hour from expiry at the given level. Built at run time; no
// token-shaped text sits in this file.
const token = (aal, tag = aal) => {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ exp: Math.floor(Date.now() / 1000) + 3600, aal, tag })}.x`;
};
const factor = (id, status) => ({ id, status, factor_type: 'totp' });
const store = (aal, factors) => storage.set(STORE, JSON.stringify({
  access_token: token(aal), refresh_token: 'refresh-1', user: { id: ME, factors },
}));
const stored = () => JSON.parse(storage.get(STORE));

// 1. WHO STILL OWES THE CODE, read from the session alone.
{
  store('aal1', [factor(APP_FACTOR, 'verified')]);
  ok(T.needsSecondStep(stored()), 'a confirmed app and a password-only token: the code is owed');
  store('aal2', [factor(APP_FACTOR, 'verified')]);
  ok(!T.needsSecondStep(stored()), 'a confirmed app and password and code: nothing is owed');
  store('aal1', []);
  ok(!T.needsSecondStep(stored()), 'no app: the password alone is enough, as before');
  store('aal1', [factor(HALF_DONE, 'unverified')]);
  ok(!T.needsSecondStep(stored()), 'an app never confirmed counts for nothing');
  ok(T.cleanCode('123 456') === '123456' && T.cleanCode('12345') === null && T.cleanCode('12345a') === null,
    'a code is six digits; the space some apps show is allowed, anything else is not');
  ok(T.groupedSecret('ABCDEFGHIJKL') === 'ABCD EFGH IJKL', 'the typed key is shown in groups of four');
}

// 2. THE CODE AT SIGN-IN: a challenge, then the code against it, and the
//    stronger session is kept with the user it names.
{
  store('aal1', [factor(APP_FACTOR, 'verified')]);
  calls = [];
  const stronger = token('aal2');
  answer = async (url) => {
    if (url.endsWith(`/factors/${APP_FACTOR}/challenge`)) return json({ id: 'challenge-1', expires_at: 0 });
    if (url.endsWith(`/factors/${APP_FACTOR}/verify`)) {
      return json({ access_token: stronger, refresh_token: 'refresh-2', expires_in: 3600,
        user: { id: ME, factors: [factor(APP_FACTOR, 'verified')] } });
    }
    return json({}, 404);
  };
  await T.enterCode('123 456');
  const order = calls.map((c) => `${c.method} ${c.url}`);
  ok(order.join(' | ') === `POST /auth/v1/factors/${APP_FACTOR}/challenge | POST /auth/v1/factors/${APP_FACTOR}/verify`,
    `the code is checked against a fresh challenge (${order.join(' then ')})`);
  ok(calls[1]?.body?.challenge_id === 'challenge-1' && calls[1]?.body?.code === '123456',
    'with that challenge and the six digits, spaces taken out');
  ok(calls.every((c) => c.headers.apikey === KEY && /^Bearer /.test(c.headers.Authorization)),
    'each call carries the project key and the person\'s own token');
  ok(stored().access_token === stronger && stored().refresh_token === 'refresh-2',
    'the stronger session replaces the password-only one');
  ok(!T.needsSecondStep(stored()) && typeof stored().expires_at === 'number',
    'and from then on nothing is owed');
}

// 3. A WRONG CODE says so in words, and the password-only session is kept, so
//    the person can simply try the next code.
{
  store('aal1', [factor(APP_FACTOR, 'verified')]);
  const before = storage.get(STORE);
  answer = async (url) => (url.endsWith('/challenge')
    ? json({ id: 'challenge-2' })
    : json({ code: 422, error_code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' }, 422));
  let message = '';
  try { await T.enterCode('000000'); } catch (cause) { message = cause.message; }
  ok(/did not match/.test(message) && !/TOTP/.test(message),
    `a wrong code is told in plain words ("${message}")`);
  ok(storage.get(STORE) === before, 'and nothing is saved over the session');

  calls = [];
  let refused = '';
  try { await T.enterCode('12 34'); } catch (cause) { refused = cause.message; }
  ok(calls.length === 0 && /six digits/.test(refused), 'a code that is not six digits never leaves the device');
}

// 4. SET UP ON ANOTHER DEVICE: this session did not know, so it asks who it is
//    first, then uses the app it learns about.
{
  store('aal1', []);
  calls = [];
  answer = async (url) => {
    if (url === '/auth/v1/user') return json({ id: ME, factors: [factor(APP_FACTOR, 'verified')] });
    if (url.endsWith('/challenge')) return json({ id: 'challenge-3' });
    if (url.endsWith('/verify')) return json({ access_token: token('aal2'), refresh_token: 'refresh-3', expires_in: 3600 });
    return json({}, 404);
  };
  await T.enterCode('654321');
  ok(calls[0]?.url === '/auth/v1/user' && calls[0]?.method === 'GET', 'it asks the sign-in server who this is');
  ok(calls[1]?.url === `/auth/v1/factors/${APP_FACTOR}/challenge`, 'and then challenges the app it was told about');
}

// 5. SETTING IT UP: anything half-finished is cleared, never a confirmed one,
//    and the picture comes back as a data: address.
{
  store('aal2', [factor(HALF_DONE, 'unverified')]);
  calls = [];
  answer = async (url, init) => {
    if (url === '/auth/v1/user') return json({ id: ME, factors: [factor(HALF_DONE, 'unverified')] });
    if (init.method === 'DELETE') return json({ id: HALF_DONE });
    if (url === '/auth/v1/factors') {
      return json({ id: NEW_FACTOR, type: 'totp', totp: { qr_code: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', secret: 'ABCDEFGHIJKLMNOP', uri: 'otpauth://totp/x' } });
    }
    return json({}, 404);
  };
  const made = await T.beginSecondStep();
  const deletes = calls.filter((c) => c.method === 'DELETE').map((c) => c.url);
  ok(deletes.length === 1 && deletes[0] === `/auth/v1/factors/${HALF_DONE}`, 'a set-up started earlier and never confirmed is cleared first');
  const enrol = calls.find((c) => c.url === '/auth/v1/factors');
  ok(enrol?.method === 'POST' && enrol.body.factor_type === 'totp' && typeof enrol.body.issuer === 'string' && enrol.body.issuer.length > 0,
    'an authenticator app is asked for, under the app\'s own name');
  ok(made.factorId === NEW_FACTOR && made.qr.startsWith('data:image/svg+xml;charset=utf-8,%3Csvg') && made.secret === 'ABCDEFGHIJKLMNOP',
    'the picture comes back as a data: address an <img> can show, with the key to type instead');

  store('aal2', [factor(APP_FACTOR, 'verified')]);
  calls = [];
  answer = async (url) => (url === '/auth/v1/user'
    ? json({ id: ME, factors: [factor(APP_FACTOR, 'verified')] })
    : json({ code: 422, error_code: 'mfa_verified_factor_exists', msg: 'x' }, 422));
  await T.beginSecondStep().catch(() => undefined);
  ok(!calls.some((c) => c.method === 'DELETE'), 'a confirmed app is never cleared by starting again');
}

// 6. AN ADDRESS IS BUILT ONLY FROM A FACTOR ID THAT LOOKS LIKE ONE.
{
  store('aal2', [factor(APP_FACTOR, 'verified')]);
  calls = [];
  let refused = '';
  try { await T.turnOffSecondStep('../../admin/users'); } catch (cause) { refused = cause.message; }
  ok(calls.length === 0 && /not recognised/.test(refused), 'a factor id that is not an id is refused before any call');

  answer = async (url, init) => (init.method === 'DELETE'
    ? json({ id: APP_FACTOR })
    : json({ id: ME, factors: [] }));
  await T.turnOffSecondStep(APP_FACTOR);
  ok(calls[0]?.method === 'DELETE' && calls[0]?.url === `/auth/v1/factors/${APP_FACTOR}`, 'turning it off removes that one app');
  ok(Array.isArray(stored().user.factors) && stored().user.factors.length === 0,
    'and the session learns the account has none now');
}

// 7. THE SIGN-IN SERVER SWITCHED OFF says what to do about it.
{
  store('aal2', []);
  answer = async (url) => (url === '/auth/v1/user'
    ? json({ id: ME, factors: [] })
    : json({ code: 422, error_code: 'mfa_totp_enroll_not_enabled', msg: 'MFA enroll is disabled for TOTP' }, 422));
  let message = '';
  try { await T.beginSecondStep(); } catch (cause) { message = cause.message; }
  ok(/switched off/.test(message) && /Multi-Factor/.test(message),
    'a project with authenticator apps switched off says where to switch them on');
}

// 8. A SET-UP THAT WAS INTERRUPTED IS FINISHED, NOT REPLACED (21 October 2026).
// Leaving for the authenticator app and coming back can reload the page, and
// the next "Set it up" deleted the key the person had just added: on live,
// four set-ups in an hour and eight codes, none accepted.
{
  const older = { ...factor(HALF_DONE, 'unverified'), created_at: '2026-10-21T07:07:47Z' };
  const newer = { ...factor(NEW_FACTOR, 'unverified'), created_at: '2026-10-21T07:47:31Z' };
  store('aal1', [older, newer, factor(APP_FACTOR, 'verified')]);
  ok(T.unfinishedFactor(stored())?.id === NEW_FACTOR,
    'the newest set-up never confirmed is found, so its code can be typed after a reload');
  store('aal1', [factor(APP_FACTOR, 'verified')]);
  ok(T.unfinishedFactor(stored()) === null, 'and a confirmed app is not mistaken for one');
}
{
  const card = fs.readFileSync(path.join(root, 'components/live/TwoStep.tsx'), 'utf8');
  ok(!/useEffect\([^;]*(beginSecondStep|start\(\))/.test(card) && (card.match(/beginSecondStep\(/g) ?? []).length === 1
    && /const start = async \(\) => \{[\s\S]*?await beginSecondStep\(\)/.test(card),
    'a new key is only ever made when the person presses a button, never when the screen opens');
  ok(/\{!on && !setup && pending && \(/.test(card) && /\{!on && !setup && !pending && \(/.test(card)
    && /await finishSecondStep\(pending, code\)/.test(card),
    'an unfinished set-up asks for its code before offering to start again');
  ok(/onClick=\{\(\) => \{ setPending\(setup\.factorId\); setSetup\(null\)/.test(card),
    'and Cancel keeps the key, so the code can still be typed later');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
