// If this deployment has a backend, the browser must be allowed to reach it.
//
// lib/mode.ts decides IS_LIVE purely from NEXT_PUBLIC_SUPABASE_URL and
// NEXT_PUBLIC_SUPABASE_ANON_KEY, and lib/supabase/client.ts then makes every
// data call FROM THE BROWSER. So the Content-Security-Policy is not a backstop
// here — it is on the critical path of every signed-in screen.
//
// It was wrong. connect-src was the literal string "'self'", four lines under a
// comment instructing the reader to add their backend's origin to exactly that
// directive. A live deployment therefore refused its own database: sign-in,
// dashboards, sharing, all of it, failing in the browser console where no
// server log would ever show it.
//
// Both directions are asserted. A demo deployment configures nothing and must
// stay locked to 'self' — widening the policy for everybody in order to fix the
// live case would trade one silent failure for a real one.
//
//   node tests/backend-csp.mjs
//
// Plain Node, no dependencies. Exits non-zero on any violation.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK  ' : 'BAD '} ${m}`);
};

// Deliberately not a real provider hostname. tests/no-backend.js forbids a live
// database hostname anywhere in a tracked file, and it is right to — this repo
// must never carry somebody's real project reference. The config only parses
// the URL and checks the scheme, so any https origin exercises the same path.
//
// It scans TRACKED files, which is why this passed while the file was still
// untracked and failed the moment it was committed. Worth knowing: a new test
// file is not actually checked by that guard until it is in git.
const BACKEND = 'https://backend.example.test';

// next.config.mjs reads process.env at module scope, so each mode needs a fresh
// evaluation. The query string defeats the ES module cache; without it the
// second import returns the first mode's config and this test passes on a lie.
async function cspFor(env, tag) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    const mod = await import(`${pathToFileURL(path.join(root, 'next.config.mjs')).href}?${tag}`);
    const headers = await mod.default.headers();
    const csp = headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value;
    return Object.fromEntries(
      csp.split(';').map((d) => {
        const [name, ...rest] = d.trim().split(/\s+/);
        return [name, rest];
      }),
    );
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
}

const live = await cspFor(
  { NEXT_PUBLIC_SUPABASE_URL: BACKEND, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-for-the-test' },
  'live',
);

ok(live['connect-src']?.includes(BACKEND), 'live: the browser may reach its own backend');
ok(live['connect-src']?.some((s) => s.startsWith('wss://')), 'live: real-time subscriptions may connect');
ok(live['media-src']?.includes(BACKEND), 'live: a file served from the backend may play');
ok(live['img-src']?.includes(BACKEND), 'live: a picture served from the backend may load');
ok(live['default-src']?.join(' ') === "'self'", "live: default-src stays 'self' — nothing else widened");

const demo = await cspFor({ NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '' }, 'demo');

ok(demo['connect-src']?.join(' ') === "'self'", 'demo: no backend origin is allowed');
ok(!demo['media-src']?.some((s) => s.startsWith('http')), 'demo: no remote origin may play media');
ok(demo['media-src']?.includes('blob:'), 'demo: on-device media still plays');

// Half-configured must not widen anything: a URL with no key is not a live
// deployment, and IS_LIVE agrees, so the policy must agree too.
const halfway = await cspFor(
  { NEXT_PUBLIC_SUPABASE_URL: BACKEND, NEXT_PUBLIC_SUPABASE_ANON_KEY: '' },
  'halfway',
);
ok(halfway['connect-src']?.join(' ') === "'self'", 'a URL without a key does not widen the policy');

// A DATABASE ON THIS COMPUTER. The Supabase CLI's local stack serves over plain
// http on the loopback address, which never leaves the machine. That one case
// is allowed; every other http address still fails closed, and "localhost" has
// to be the whole hostname, not the start of somebody else's.
const KEY = { NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-for-the-test' };
const local = await cspFor({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321', ...KEY }, 'local');
ok(local['connect-src']?.includes('http://127.0.0.1:54321'), 'local: a database on this computer may be reached');
ok(local['connect-src']?.includes('ws://127.0.0.1:54321'), 'local: and its real-time feed');
ok(!local['connect-src']?.some((s) => s.startsWith('wss://')), 'local: no secure-socket origin is invented for it');
const named = await cspFor({ NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321', ...KEY }, 'named');
ok(named['connect-src']?.includes('http://localhost:54321'), 'local: by name as well as by number');
for (const [url, tag] of [
  ['http://backend.example.test', 'plainremote'],
  ['http://localhost.example.test', 'lookalike'],
  ['http://127.0.0.1.example.test', 'lookalike2'],
]) {
  const csp = await cspFor({ NEXT_PUBLIC_SUPABASE_URL: url, ...KEY }, tag);
  ok(csp['connect-src']?.join(' ') === "'self'", `plain http anywhere else fails closed: ${url}`);
}

console.log(bad === 0 ? '\nbackend CSP: all good' : `\nbackend CSP: ${bad} problem(s)`);
process.exit(bad === 0 ? 0 : 1);
