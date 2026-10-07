// Nobody can make themselves an admin, approve themselves, or move church.
//
// ---------------------------------------------------------------------------
// WHY THIS FILE EXISTS. The rule that stops it has been in the database since
// the first migration -- the `lock_privileged_profile_columns` trigger -- and
// on 25 September 2026 it was proven again on the live database (an Explorer
// setting their own role to admin: refused, 42501; an unapproved account
// approving itself: refused, and still unapproved; both in a transaction that
// was discarded). But no test held it. A later migration could have dropped
// the trigger, or rewritten the function without the check, and every one of
// the nearly two hundred checks in the gate would still have passed.
//
// Asked for the same day: "Make sure to update policy and security to keep our
// app consistent and safe." The owner's standing concern is rogue people and
// smart AI; promoting yourself is the first thing either would try.
//
// The sample app's role switcher (components/RoleSwitcher.tsx) is DELIBERATE
// and stays: it changes a role in a store in your own browser, so the pastor
// deciding whether to adopt this can see every screen. What must never happen
// is the live half reaching for it.
//
//   node tests/nobody-promotes-themselves.mjs
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};
const sqlCode = (src) => src.replace(/--[^\n]*/g, '');
const jsCode = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

// Migrations in the order a fresh install applies them: byte order.
const DIR = 'supabase/migrations';
const migrations = readdirSync(DIR).filter((f) => f.endsWith('.sql'))
  .sort((a, b) => (Buffer.from(a) < Buffer.from(b) ? -1 : 1))
  .map((f) => ({ f, sql: sqlCode(readFileSync(path.join(DIR, f), 'utf8')) }));

// ---------------------------------------------------------------------------
// 1. THE FUNCTION IN FORCE STILL REFUSES A SELF-PROMOTION
// ---------------------------------------------------------------------------
const defining = migrations.filter((m) => /create or replace function (public\.)?lock_privileged_profile_columns\(/.test(m.sql));
const latest = defining.at(-1);
ok(!!latest, `the lock is defined (latest in ${latest?.f ?? 'NOTHING'})`);
const body = latest ? latest.sql.slice(latest.sql.search(/create or replace function (public\.)?lock_privileged_profile_columns\(/)) : '';
const fn = body.slice(0, body.indexOf('\nend;'));

const selfBranch = fn.slice(fn.indexOf('if new.id = v_user_id then'), fn.indexOf('elsif not caller_privileged then'));
for (const col of ['role', 'is_approved', 'church_id', 'is_head_executive', 'guardian_consent_at']) {
  ok(new RegExp(`new\\.${col} is distinct from old\\.${col}`).test(selfBranch),
    `changing your own ${col} is noticed`);
}
ok(/raise exception[^;]*using errcode = '42501'/.test(selfBranch), 'and refused, not quietly allowed');
// The one way through: claiming an invitation that names this church and this
// role, while unapproved and in no church yet. It must stay that narrow.
ok(/old\.church_id is null/.test(selfBranch) && /old\.is_approved is false/.test(selfBranch)
   && /new\.is_approved is false/.test(selfBranch) && /i\.role = new\.role/.test(selfBranch)
   && /i\.expires_at > now\(\)/.test(selfBranch),
  'the only exception is claiming an unexpired invitation for exactly that church and role, still unapproved');

const othersBranch = fn.slice(fn.indexOf('elsif not caller_privileged then'));
for (const col of ['role', 'is_approved', 'church_id']) {
  ok(new RegExp(`new\\.${col}\\s*:= old\\.${col};`).test(othersBranch),
    `somebody who is not leadership editing another profile cannot change its ${col}`);
}

// ---------------------------------------------------------------------------
// 2. AND IT IS STILL ATTACHED
// ---------------------------------------------------------------------------
let attached = false;
for (const m of migrations) {
  const created = m.sql.search(/create trigger lock_privileged_profile_columns\b/);
  const dropped = m.sql.search(/drop trigger (if exists )?lock_privileged_profile_columns\b/);
  if (dropped !== -1 && (created === -1 || dropped > created)) attached = false;
  if (created !== -1 && created > dropped) attached = true;
}
ok(attached, 'the trigger is created, and no later migration drops it without creating it again');
ok(defining.every((m) => !/security invoker/.test(m.sql.slice(m.sql.search(/lock_privileged_profile_columns\(/)).slice(0, 400))),
  'and it runs as its owner, so a caller cannot opt out of it');

// ---------------------------------------------------------------------------
// 3. THE APP NEVER EVEN ASKS
// ---------------------------------------------------------------------------
{
  const data = jsCode(readFileSync('lib/live/data.ts', 'utf8'));
  const update = data.slice(data.indexOf('export async function updateMyProfile('), data.indexOf('export async function disapproveMember('));
  const safe = update.slice(update.indexOf('const safe = {'), update.indexOf('};', update.indexOf('const safe = {')));
  ok(safe.length > 0 && !/\.\.\.patch/.test(safe), 'updating your own profile sends an allow-list, never the whole patch');
  for (const col of ['role', 'is_approved', 'church_id', 'is_head_executive', 'guardian']) {
    ok(!new RegExp(`\\b${col}\\w*\\s*:`).test(safe), `and the list has no ${col}`);
  }
  ok(!/setMyRole/.test(data), 'the live data layer has no way to set your own role');
}

// The live half, file by file: nothing in it reaches for the sample app's
// role switcher.
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = path.join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mjs)$/.test(n) ? [p] : [];
});
const liveFiles = [
  'components/LiveAppShell.tsx',
  ...walk('components/live'),
  ...walk('lib/live'),
];
const offenders = liveFiles.filter((f) => /RoleSwitcher|setMyRole|signInAs/.test(jsCode(readFileSync(f, 'utf8'))));
ok(liveFiles.length > 20 && offenders.length === 0,
  `no live file mounts the role switcher or calls setMyRole (${liveFiles.length} files read${offenders.length ? `; found in ${offenders.join(', ')}` : ''})`);
ok(/useDemo\(\)/.test(readFileSync('components/RoleSwitcher.tsx', 'utf8')),
  'and the switcher itself only ever talks to the sample app\'s own store');

// NOR DOES ANYBODY PROMOTE SOMEBODY ELSE PAST THEMSELVES, OR MOVE A PAIRING.
// Found by the second agent's security review on 7 October 2026: a Director
// could make anybody an Executive Director, and could set themselves as the
// Guide in a pairing and read its conversation. The database change closes
// both; supabase/tests/a-leader-stays-within-their-rank.sql proves it as
// invented people on every fresh install in CI. These lines make sure that
// proof cannot quietly stop running.
const fix = readFileSync('supabase/migrations/20261007130000_a_leader_cannot_raise_a_rank_or_move_a_pairing.sql', 'utf8');
ok(/create trigger aa_guard_profile_writes\s+before update on public\.profiles/.test(fix)
   && /revoke update on public\.profiles from authenticated/.test(fix),
   'a browser changes only the account columns its sender is entitled to');
ok(/new\.role in \('admin', 'executive'\)\s+and not i_lead_executively/.test(fix),
   'only an Executive Director makes somebody a Director or an Executive Director');
ok(/new\.dm_id is distinct from old\.dm_id/.test(fix) && /new\.ds_id is distinct from old\.ds_id/.test(fix)
   && /grant update \(journey_stage, track, status, updated_at\) on public\.pairings/.test(fix),
   'nobody moves a pairing onto other people');
ok(/create or replace function public\.change_guide/.test(fix), 'leadership changes a Guide by ending one pairing and starting another');
ok(/a-leader-stays-within-their-rank\.sql/.test(readFileSync('scripts/fresh-install.sh', 'utf8')),
   'and CI runs the proof, as invented people, on every fresh install');

console.log(bad === 0 ? '\nNobody promotes themselves.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
