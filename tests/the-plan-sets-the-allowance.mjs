// The plan a church pays for sets what each person may keep.
//
// Asked for on 18 November 2026: a church on Supabase's free plan runs well
// and knows where it stands, and a church that pays gets the bigger room by
// one switch (HOSTING_PLAN in app_settings). The database's half is proved
// by supabase/tests/the-plan-sets-the-allowance.sql. This holds the rest: the
// words leaders read, who sees the card, and the migration's grants.
//
//   node --experimental-strip-types tests/the-plan-sets-the-allowance.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let space;
try {
  space = await import(pathToFileURL(path.join(root, 'lib/space.ts')).href);
} catch (e) {
  if (process.env.PLAN_RETRY) throw e;
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)], { stdio: 'inherit', env: { ...process.env, PLAN_RETRY: '1' } });
  process.exit(r.status ?? 1);
}

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); };
const MB = 1024 * 1024, GB = 1024 * MB;

// The words.
ok(space.size(180 * MB) === '180 MB', 'Sizes read as whole megabytes');
ok(space.size(1.25 * GB) === '1.3 GB' || space.size(1.25 * GB) === '1.2 GB', 'and as gigabytes past 1024 MB');
ok(space.size(100 * GB) === '100 GB', 'big sizes have no decimals');
ok(space.size(10) === 'under 1 MB', 'tiny sizes do not read as 0 MB');
ok(space.share(600 * MB, 500 * MB) === 100, 'A meter never reads past 100%');
ok(space.share(1, 0) === 0, 'A missing limit reads 0%, not a crash');
ok(space.level(69) === 'roomy' && space.level(70) === 'watch' && space.level(90) === 'act', 'Roomy under 70%, watch to 90%, act past it');
ok(space.advice('files', 95, 'free').includes('paid plan'), 'A nearly full free church is told about the paid plan');
ok(!space.advice('files', 95, 'paid').includes('paid plan'), 'A paying church is not told to pay');
ok(space.advice('database', 10, 'free') === 'Plenty of room.', 'A roomy church is not worried');
const free = { plan: 'free', database_bytes: 0, file_bytes: 0, database_limit: 500 * MB, file_limit: GB, person_limit: 200 * MB };
ok(space.planLine(free).includes('free plan') && space.planLine(free).includes('200 MB'), 'The free line names the plan and the per-person room');
ok(space.planLine({ ...free, plan: 'paid', person_limit: 2 * GB }).includes('2.0 GB'), 'The paid line names the bigger room');

// Who sees it.
const settings = read('components/LiveAccountPages.tsx');
ok(/room === 'church' && leads && <ChurchSpaceCard \/>/.test(settings), 'Only leaders, in Settings → Church, get the card');
const card = read('components/live/ChurchSpace.tsx');
ok(card.includes("rpc('church_space')") && card.includes('isMissingFromDatabase'), 'The card asks the database, and stays quiet before the update');

// The migration's grants.
const sql = read('supabase/migrations/20261118120000_the_plan_sets_the_allowance.sql');
ok(/revoke all on function private\.on_a_paid_plan\(\) from public, anon, authenticated;/.test(sql), 'Nobody signed in can ask the switch directly');
ok(/revoke all on function public\.church_space\(\) from public, anon;/.test(sql), 'Visitors cannot call the read-out');
ok(/manages_church\(v_church\)/.test(sql), 'The read-out is for those who manage the church');
ok(!/storage\.objects o\s+where[^;]*owner/.test(sql.slice(sql.indexOf('create or replace function public.church_space'))), 'The read-out totals files; it never lists whose they are');
ok(/'HOSTING_PLAN'/.test(sql) && /= 'paid'/.test(sql), 'One row, HOSTING_PLAN = paid, is the switch');

// The guide tells a church how.
const costs = read('docs/WHAT-IT-COSTS.md');
ok(costs.includes('HOSTING_PLAN'), 'WHAT-IT-COSTS.md says how to switch to the paid allowances');
ok(read('scripts/fresh-install.sh').includes('the-plan-sets-the-allowance.sql'), 'The database proof runs on every fresh install');

if (bad) { console.error(`\n${bad} check(s) failed`); process.exit(1); }
console.log('\nThe plan sets the allowance.');
