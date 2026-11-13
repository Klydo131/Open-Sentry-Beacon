// Will these migrations survive being applied to a real, fresh database?
//
// WHY THIS EXISTS. Setting up a church is the one moment when every migration
// runs in order against an empty schema, and it is the moment nobody is
// watching a test suite. A migration that only works the first time, or that
// calls something the next file creates, fails there -- halfway through, on
// somebody else's evening, leaving a half-applied schema which is the worst
// place to be standing.
//
// Two failures this catches, both found by running it:
//
//   0021 and 0024 created policies with no `drop policy if exists` first. A run
//   that failed halfway and was retried died on "policy already exists".
//
//   Nothing was calling a function before its migration created it, but that is
//   a property worth keeping rather than a coincidence worth assuming.
//
//   node tests/migrations-apply-cleanly.mjs

import fs from 'node:fs';
import path from 'node:path';

const dir = 'supabase/migrations';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };
const strip = (s) => s.replace(/--[^\n]*/g, '');

ok(files.length > 0, `there are migrations to check (${files.length})`);

// ------------------------------------------------------------------ naming --
// THE `00NN_` SERIES IS CLOSED AT 0049. Everything since is a timestamp, and it
// has to stay that way, because this list is sorted by filename and nothing
// else: `0050_` sorts BEFORE `20260829…`, so a migration numbered today would
// run before the tables it depends on. On a machine where the database already
// exists nothing happens; on a fresh one the build dies, which is the worst
// place to find out.
{
  const late = files.filter((f) => /^00(?:[5-9]\d)_/.test(f));
  ok(late.length === 0,
     late.length
       ? `these keep the old 00NN_ numbering and will sort before the timestamped `
         + `migrations they depend on — rename them YYYYMMDDHHMMSS_: ${late.join(', ')}`
       : 'no migration uses a 00NN_ number above the closed 0049 series');
  ok(files.some((f) => /^\d{14}_/.test(f)),
     'and the timestamped series is the one in use');
}

// ---------------------------------------------------------------- ordering --
// A file may not call a function that a LATER file is the first to create.
const createdIn = new Map();
files.forEach((f, i) => {
  for (const m of strip(fs.readFileSync(path.join(dir, f), 'utf8'))
    .matchAll(/create or replace function (public\.[a-z_0-9]+)/g)) {
    if (!createdIn.has(m[1])) createdIn.set(m[1], i);
  }
});

const tooEarly = [];
files.forEach((f, i) => {
  for (const m of strip(fs.readFileSync(path.join(dir, f), 'utf8'))
    .matchAll(/\b(public\.[a-z_0-9]+)\s*\(/g)) {
    const at = createdIn.get(m[1]);
    if (at !== undefined && at > i) tooEarly.push(`${f} calls ${m[1]}, first created in ${files[at]}`);
  }
});
ok(tooEarly.length === 0,
   tooEarly.length === 0
     ? 'no migration calls a function a later one creates'
     : `called before it exists: ${[...new Set(tooEarly)].join('; ')}`);

// ------------------------------------------------------------- re-runnable --
// Applying the set twice must not fail. Postgres has no CREATE POLICY IF NOT
// EXISTS, so the guard is a DROP first; the rest take their own if-not-exists.
// Quoted text is data, not DDL. An event trigger has to name the commands it
// fires on — `when tag in ('CREATE TABLE', 'CREATE TABLE AS', ...)` — and
// reading those literals as statements reported a migration that creates no
// table at all as having two unguarded ones. A guard that cannot tell a
// keyword from a string is a guard people start ignoring.
const unquote = (sql) => sql.replace(/'(?:[^']|'')*'/g, "''");

const notGuarded = [];
for (const f of files) {
  const s = unquote(strip(fs.readFileSync(path.join(dir, f), 'utf8')));
  const checks = [
    ['create policy', /create policy/gi, /drop policy/gi],
    ['create trigger', /create trigger/gi, /drop trigger/gi],
    ['create table', /create table (?!if not exists)/gi, null],
    ['add column', /add column (?!if not exists)/gi, null],
    ['create index', /create index (?!if not exists)/gi, null],
  ];
  for (const [label, pattern, guard] of checks) {
    const hits = (s.match(pattern) || []).length;
    if (!hits) continue;
    if (guard) {
      const guards = (s.match(guard) || []).length;
      if (guards < hits) notGuarded.push(`${f}: ${hits} "${label}" but ${guards} drop(s)`);
    } else {
      notGuarded.push(`${f}: ${hits} unguarded "${label}"`);
    }
  }
}
ok(notGuarded.length === 0,
   notGuarded.length === 0
     ? 'every migration can be applied twice without failing'
     : `not re-runnable: ${notGuarded.join('; ')}`);

// ------------------------------------------------------------------ safety --
// Every table must end up with row level security on. A table added without it
// is readable by anybody holding the anon key, which ships in the browser.
const all = files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
const tables = new Set([...all.matchAll(/create table (?:if not exists )?public\.([a-z_0-9]+)/g)].map((m) => m[1]));
const secured = new Set([...all.matchAll(/alter table public\.([a-z_0-9]+) +enable row level security/g)].map((m) => m[1]));
const open = [...tables].filter((t) => !secured.has(t));
ok(open.length === 0,
   open.length === 0
     ? `every table enables row level security (${tables.size} tables)`
     : `NO RLS on: ${open.join(', ')}`);

console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
