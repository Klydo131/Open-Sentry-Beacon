// A stored file's folder does not tell a stranger which church its owner is in.
//
// Found in the audit of 27 September 2026: `public.uploader_church(folder)`
// answered "which church is this person in?" for anybody's id, to any signed-in
// member, because it is callable on its own as well as from the storage rules.
// 20260927100000_a_folder_does_not_say_whose_church.sql makes it answer only
// with a church the caller could already see into or leads.
//
// That change is safe for the storage rules ONLY because every rule uses the
// function inside can_access_church(...) or manages_church(...): both say no
// to nothing, so returning nothing to an outsider changes no rule's decision.
// This file holds both halves -- the guard in the function, and the wrapping in
// every rule -- because either alone would let the other quietly break.
//
//   node tests/a-folder-does-not-say-whose-church.mjs

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};
const sqlCode = (src) => src.replace(/--[^\n]*/g, '');

const DIR = 'supabase/migrations';
const migrations = readdirSync(DIR).filter((f) => f.endsWith('.sql'))
  .sort((a, b) => (Buffer.from(a) < Buffer.from(b) ? -1 : 1))
  .map((f) => ({ f, sql: sqlCode(readFileSync(path.join(DIR, f), 'utf8')) }));

// 1. THE FUNCTION IN FORCE -- the last migration, in install order, to define it.
const DEF = /create or replace function (public\.)?uploader_church\(/;
const latest = migrations.filter((m) => DEF.test(m.sql)).at(-1);
ok(!!latest, `the function is defined (latest in ${latest?.f ?? 'NOTHING'})`);
const body = latest ? latest.sql.slice(latest.sql.search(DEF)) : '';
const fn = body.slice(0, body.indexOf('end $$;') + 7);
ok(/security definer/.test(fn) && /set search_path = public, pg_temp/.test(fn),
  'it still reads profiles as the database, with a fixed search path');
ok(/if c is not null and \(public\.can_access_church\(c\) or public\.manages_church\(c\)\) then\s*return c;/.test(fn),
  'it names a church only to somebody who can already see into it or leads it');
ok(/end if;\s*return null;\s*end \$\$;$/.test(fn.trim()),
  'and says nothing to anybody else');
ok(!/return \(select church_id from public\.profiles where id = u\);/.test(fn),
  'the old answer-anybody line is gone');
const grants = latest ? latest.sql.slice(latest.sql.search(DEF)) : '';
ok(/revoke all on function public\.uploader_church\(text\) from public, anon;/.test(grants),
  'and nobody signed out can call it');

// 2. EVERY RULE USES IT INSIDE ONE OF THE TWO TESTS. A rule written as
// `uploader_church(x) = my_church_id()` would still work today, but it is the
// shape that would stop working, or start leaking, the next time the function
// changes -- so it is refused now.
const uses = [];
for (const m of migrations) {
  const sql = m.sql.replace(/create or replace function (public\.)?uploader_church\([\s\S]*?end \$\$;/g, '');
  for (const hit of sql.matchAll(/(\w+\.)?uploader_church\(/g)) {
    if (/revoke|grant/i.test(sql.slice(Math.max(0, hit.index - 40), hit.index))) continue;
    const before = sql.slice(Math.max(0, hit.index - 30), hit.index);
    uses.push({ f: m.f, wrapped: /(public\.)?(can_access_church|manages_church)\($/.test(before) });
  }
}
ok(uses.length >= 5, `the storage rules use it (${uses.length} places)`);
const loose = uses.filter((u) => !u.wrapped);
ok(loose.length === 0,
  loose.length
    ? `used outside can_access_church/manages_church in: ${[...new Set(loose.map((u) => u.f))].join(', ')}`
    : 'every use sits inside can_access_church(...) or manages_church(...)');

// 3. THE APP NEVER ASKS IT DIRECTLY. It is for the storage rules; a screen that
// wanted somebody's church has the rows it is allowed to read.
const src = ['lib', 'components', 'app'].flatMap(function walk(d) {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
});
ok(src.every((p) => !readFileSync(p, 'utf8').includes('uploader_church')),
  'no screen or data call asks for it by name');

console.log(bad === 0 ? '\nA folder says whose church it is only to that church.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
