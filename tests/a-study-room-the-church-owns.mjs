// A study room belongs to the person whose room it is.
//
// ---------------------------------------------------------------------------
// WHY THE CHURCH KEEPS THESE DOCUMENTS AT ALL. AFFiNE's editor, BlockSuite, is
// MIT and embeddable. Its server is not: everything under packages/backend is
// AFFiNE Enterprise Edition, production use only under their paid subscription
// terms. And the published BlockSuite packages do not close that gap -- the
// only class implementing the `Workspace` interface in the published tree is
// `TestWorkspace`, a test harness. So the document store is ours, which is the
// arrangement the church wanted regardless: study notes on the church's own
// database, under the church's own rules.
//
// WHAT THIS FILE GUARDS, AND WHY IT IS NOT OBVIOUS. The dangerous mistake here
// is not a missing policy; it is a policy that looks right. Two shapes of it:
//
//   * A policy with no TO clause applies to every Postgres role, including the
//     anonymous one Supabase grants the whole internet. Four policies here and
//     each one has to name `authenticated` out loud.
//
//   * A pulse function that returns one column too many. `study_room_pulse`
//     exists so a Guide can see THAT their Explorer has been working -- the
//     ruling was "Guide sees that something was read, not what", and writing is
//     held to the same line. A time and two counts is the whole permitted
//     answer. The day somebody adds `title` to it for a nicer screen, the rule
//     is gone and nothing else would notice.
//
// Verified against the live database before shipping, as the real accounts:
// owner writes and reads own (1 row); owner writing for somebody else refused;
// Guide sees 0 documents but 1 pulse; Executive sees 0 documents; an unrelated
// Explorer sees 0 documents and 0 pulse rows; a 2MB page refused by the cap.
//
//   node tests/a-study-room-the-church-owns.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const stripSql = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

const dir = path.join(root, 'supabase/migrations');
const file = fs.readdirSync(dir).find((f) => f.includes('a_study_room_the_church_owns'));
ok(!!file, 'the migration is present');
const sql = file ? stripSql(read(`supabase/migrations/${file}`)) : '';

// ---------------------------------------------------------------------------
// 1. EVERY POLICY IS OWNER-ONLY, AND EVERY POLICY NAMES ITS ROLE
// ---------------------------------------------------------------------------
{
  const policies = [...sql.matchAll(
    /create policy\s+(\w+)\s+on\s+public\.study_docs\s+for\s+(\w+)([\s\S]*?);/g,
  )];
  ok(policies.length === 4,
     `all four verbs have a policy (found ${policies.length}: ${policies.map((p) => p[2]).join(', ')})`);

  for (const [, name, verb, body] of policies) {
    ok(/\bto\s+authenticated\b/.test(body),
       `${name} (${verb}) names authenticated, so it does not reach the signed-out role`);
    ok(/owner_id\s*=\s*\(\s*select auth\.uid\(\)\s*\)/.test(body),
       `${name} (${verb}) is owner-only`);
  }

  ok(/alter table public\.study_docs enable row level security/.test(sql),
     'and row level security is switched on, or the policies are decoration');
}

// ---------------------------------------------------------------------------
// 2. THE PULSE TELLS THE TIME, NOT THE CONTENT
// ---------------------------------------------------------------------------
//
// The load-bearing rule of the whole feature. Asserted on the function's SHAPE
// -- its returns clause -- rather than on a sentence in a comment, because the
// returns clause is the thing that would actually change.
{
  const returns = (sql.match(
    /create or replace function public\.study_room_pulse[\s\S]*?returns table \(([^)]*)\)/,
  ) ?? [])[1] ?? '';
  ok(returns.length > 0, 'study_room_pulse declares what it returns');

  const columns = returns.split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
  ok(columns.length === 3 && columns.join(',') === 'last_worked_at,pages,bytes',
     `it returns a time and two counts and nothing else (got: ${columns.join(', ')})`);

  // `state` is the column holding the document. It must never be reachable
  // through this function, under any name.
  const body = (sql.match(
    /create or replace function public\.study_room_pulse[\s\S]*?\$\$([\s\S]*?)\$\$/,
  ) ?? [])[1] ?? '';
  ok(!/\bd\.state\b(?!\s*\))/.test(body.replace(/length\(d\.state\)/g, '')),
     'and the document itself is never selected, only measured');
}

// ---------------------------------------------------------------------------
// 3. WHO MAY ASK FOR SOMEBODY ELSE'S PULSE
// ---------------------------------------------------------------------------
{
  const body = (sql.match(
    /create or replace function public\.study_room_pulse[\s\S]*?\$\$([\s\S]*?)\$\$/,
  ) ?? [])[1] ?? '';
  ok(/me\.id = p_person/.test(body), 'a person may always ask about their own room');
  ok(/pairings[\s\S]{0,200}status\s*=\s*'active'/.test(body),
     'their Guide may ask, through an ACTIVE pairing only');
  ok(/role in \('admin', 'executive'\)[\s\S]{0,200}church_id = me\.church_id/.test(body),
     'leadership may ask, within their own church only');
}

// ---------------------------------------------------------------------------
// 4. A CEILING, BECAUSE THE WHOLE CHURCH SHARES 500 MB
// ---------------------------------------------------------------------------
{
  ok(/check \(length\(state\) <= \d+\)/.test(sql),
     'a single page cannot grow without limit');
  const cap = Number((sql.match(/check \(length\(state\) <= (\d+)\)/) ?? [])[1] ?? 0);
  ok(cap > 0 && cap <= 5000000,
     `and the ceiling is a sane one (${cap} characters)`);
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
