// A free database stays awake by itself.
//
// Supabase pauses a Free-plan project after about a week without activity,
// and a paused project takes the app down. Asked for on 17 November 2026: the
// app must stay live for a church on the free plans, with nothing to set up.
// app/api/keep-awake makes one tiny read, and vercel.json has Vercel call it
// daily. This runs the route itself and holds what it may and may not do.
//
//   node --experimental-strip-types tests/a-free-database-stays-awake.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let route;
try {
  route = await import(pathToFileURL(path.join(root, 'app/api/keep-awake/route.ts')).href);
} catch (e) {
  if (process.env.AWAKE_RETRY) throw e;
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)], { stdio: 'inherit', env: { ...process.env, AWAKE_RETRY: '1' } });
  process.exit(r.status ?? 1);
}

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); };
const call = async (headers = {}) => {
  const res = await route.GET(new Request('https://app.example/api/keep-awake', { headers }));
  return { status: res.status, body: await res.json(), cache: res.headers.get('cache-control') };
};

// The tutorial has no database: nothing to wake, and not an error.
delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; delete process.env.CRON_SECRET;
{
  const r = await call();
  ok(r.status === 200 && r.body.awake === false && /no database/.test(r.body.reason), 'with no database it says so, without failing');
  ok(r.cache === 'no-store', 'and nothing is cached');
}

// Only an https database address is used.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:9';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_example';
ok((await call()).status === 500, 'a plain http address is refused');

// With CRON_SECRET set, only Vercel's scheduler (which sends it) may call.
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://db.example.invalid';
process.env.CRON_SECRET = 'scheduler-secret';
ok((await call()).status === 401, 'with CRON_SECRET set, a call without it is refused');
const wrong = await call({ authorization: 'Bearer nope' });
ok(wrong.status === 401, 'and so is a wrong one');
const right = await call({ authorization: 'Bearer scheduler-secret' });
ok(right.status === 504 && right.body.awake === false, 'the right one goes through, and an unreachable database is reported, not hidden');
ok(!JSON.stringify(right.body).includes('db.example.invalid') && !JSON.stringify(right.body).includes('sb_publishable'),
   'the answer never contains the database address or the key');

// What the code may do, read from the source.
const src = read('app/api/keep-awake/route.ts');
ok(!/searchParams|request\.json|request\.text|formData/.test(src), 'it takes no input from the caller');
ok(/select=id&limit=1/.test(src) && (src.match(/fetch\(/g) ?? []).length === 1, 'it makes one read of one row, and nothing else');
ok(/redirect: 'manual'/.test(src) && /AbortSignal\.timeout\(/.test(src), 'it follows no redirect and does not wait for ever');

// Scheduled daily on Vercel, which its free plan allows.
const vercel = JSON.parse(read('vercel.json'));
const cron = vercel.crons?.[0];
ok(cron?.path === '/api/keep-awake' && /^\d{1,2} \d{1,2} \* \* \*$/.test(cron.schedule), `Vercel calls it once a day (${cron?.schedule})`);

console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
