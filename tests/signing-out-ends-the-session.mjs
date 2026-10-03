// Signing out ends the session on the server, not only this device's copy.
//
// Found by the security audit of 3 October 2026: "Sign out"
// deleted the session from the browser and told nobody, so a copy taken before
// the button was pressed kept working. lib/supabase/client.ts endBrowserSession
// now tells the sign-in server first, for this session only, and forgets it on
// the device whatever the network does.
//
// The real module is bundled and run against a stand-in browser: storage, a
// clock and a fetch that records what it was asked.
//
//   node tests/signing-out-ends-the-session.mjs

import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const URL_ = 'https://signout-test.supabase.example';
const KEY = 'anon-key-for-this-test';
const STORE = 'sb-signout-test-auth-token';

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-signout-'));
const bundle = path.join(out, 'client.mjs');
await build({
  entryPoints: [path.join(root, 'lib/supabase/client.ts')],
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
let answer = async () => new Response(null, { status: 204 });
let answered = [];
globalThis.fetch = async (input, init = {}) => {
  calls.push({ url: String(input), method: init.method, headers: init.headers ?? {}, body: init.body });
  const res = await answer(String(input), init);
  answered.push(res.status);
  return res;
};

const C = await import(pathToFileURL(bundle).href);

// A token whose `exp` claim is `secondsFromNow` away. Built at run time; no
// token-shaped text sits in this file.
const token = (secondsFromNow, tag) => {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'none' })}.${part({ exp: Math.floor(Date.now() / 1000) + secondsFromNow, tag })}.x`;
};
const signIn = (access) => storage.set(STORE, JSON.stringify({
  access_token: access, refresh_token: 'refresh-1', user: { id: '00000000-0000-4000-8000-000000000001' },
}));
const logouts = () => calls.filter((c) => c.url.includes('/auth/v1/logout'));

// 1. THE SERVER IS TOLD, FOR THIS SESSION ONLY, AND THE DEVICE FORGETS IT.
{
  calls = [];
  answered = [];
  const live = token(3600, 'live');
  signIn(live);
  await C.endBrowserSession();
  const [call] = logouts();
  ok(logouts().length === 1, 'signing out asks the sign-in server to end the session');
  ok(call && call.url === `${URL_}/auth/v1/logout?scope=local` && call.method === 'POST',
     'with POST, for this session only (scope=local), so the person\'s other devices stay signed in');
  ok(call && call.headers.Authorization === `Bearer ${live}` && call.headers.apikey === KEY,
     'carrying the session\'s own token, the proof that it is theirs to end');
  ok(answered.includes(204), 'the server answered that it ended it (the stand-in reply is a real one)');
  ok(!storage.has(STORE), 'and this device no longer holds the session');
}

// 2. AN EXPIRED TOKEN IS REFRESHED FIRST, SO THE SERVER CAN STILL END IT.
{
  calls = [];
  const fresh = token(3600, 'fresh');
  answer = async (url) => (url.includes('grant_type=refresh_token')
    ? new Response(JSON.stringify({ access_token: fresh, refresh_token: 'refresh-2' }), { status: 200 })
    : new Response(null, { status: 204 }));
  signIn(token(-60, 'stale'));
  await C.endBrowserSession();
  const order = calls.map((c) => (c.url.includes('refresh_token') ? 'refresh' : c.url.includes('logout') ? 'logout' : c.url));
  ok(order.join(',') === 'refresh,logout', `a token past its hour is refreshed, then ended (${order.join(' then ')})`);
  ok(logouts()[0]?.headers.Authorization === `Bearer ${fresh}`, 'and the end is asked with the fresh token');
  ok(!storage.has(STORE), 'and the device forgets it');
  answer = async () => new Response(null, { status: 204 });
}

// 3. OFFLINE IS NEVER A REASON NOT TO SIGN OUT.
{
  calls = [];
  answer = async () => { throw new TypeError('Failed to fetch'); };
  signIn(token(3600, 'offline'));
  let threw = false;
  try { await C.endBrowserSession(); } catch { threw = true; }
  ok(!threw && !storage.has(STORE), 'with no network, signing out still finishes and the device forgets the session');
  answer = async () => new Response(null, { status: 204 });
}

// 4. A SERVER THAT NEVER ANSWERS DOES NOT HOLD THE BUTTON.
{
  calls = [];
  const realTimeout = globalThis.setTimeout;
  // The cap is seconds in the app; here it fires at once so the test is quick.
  globalThis.setTimeout = (fn) => realTimeout(fn, 5);
  answer = (url, init) => new Promise((_, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
  });
  signIn(token(3600, 'hanging'));
  const finished = await Promise.race([
    C.endBrowserSession().then(() => true),
    new Promise((r) => realTimeout(() => r(false), 2000)),
  ]);
  globalThis.setTimeout = realTimeout;
  ok(finished && !storage.has(STORE), 'a server that never answers is given up on, and the device still signs out');
  answer = async () => new Response(null, { status: 204 });
}

// 5. NOTHING STORED, NOTHING SENT.
{
  calls = [];
  storage.clear();
  await C.endBrowserSession();
  ok(calls.length === 0, 'with no session on the device, nothing is sent anywhere');
}

// 6. THE APP'S SIGN OUT IS THIS ONE, AND NOTHING SIGNS OUT EVERYWHERE.
{
  const data = code('lib/live/data.ts');
  const body = data.slice(data.indexOf('export async function signOut('), data.indexOf('export async function signOut(') + 200);
  ok(/await endBrowserSession\(\)/.test(body) && !/clearBrowserSession/.test(body),
     'lib/live/data.ts signOut goes through endBrowserSession, not a device-only clear');
  const all = ['lib/supabase/client.ts', 'lib/live/data.ts'].map(code).join('\n');
  ok(!/scope=global|scope:\s*'global'/.test(all), 'and no sign-out ends a person\'s sessions on every device at once');
}

fs.rmSync(out, { recursive: true, force: true });
console.log(bad ? `\n${bad} FAILED` : '\nall passed');
process.exit(bad ? 1 : 0);
