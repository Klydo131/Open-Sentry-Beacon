// Every table says who may reach it, and nobody may empty one.
//
// ---------------------------------------------------------------------------
// WHY. From 30 October 2026 Supabase creates new tables closed to the data API
// on every project. Hope Beacon's tables had been opened to signed-in people
// by the old default and never by name, so a church creating its project
// after that date would have installed an app that answered "permission
// denied" everywhere. Found on 26 October 2026, in the security review asked
// for after that week's Node.js, Next.js and PHP emergencies; proved by
// installing every migration on a fresh Supabase database with the new
// default, which failed before 20261026180000 and passes after it.
//
// WHAT HOLDS, each broken on purpose once to watch it go red:
//   * every table a migration creates in `public` is either opened BY NAME
//     (granted to authenticated) or closed by name (all revoked), never left
//     to a default;
//   * nobody signed in, and no visitor, may TRUNCATE, TRIGGER, REFERENCE or
//     MAINTAIN a table;
//   * the default for a new table is closed, here as on Supabase;
//   * the fresh install builds with the new default, so CI proves it.
//
//   node tests/every-table-says-who-may-reach-it.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const dir = 'supabase/migrations';
const sql = (text) => text.replace(/--[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const FIX = '20261026180000_every_table_says_who_may_reach_it.sql';
const files = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.sql'))
  .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const all = files.map((f) => ({ f, text: sql(read(`${dir}/${f}`)) }));
const fix = all.find((m) => m.f === FIX)?.text ?? '';

// Tables created in public, less those dropped later.
const created = new Set();
for (const { text } of all) {
  for (const m of text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*\(/gi)) {
    if (!/\bprivate\.|\bauth\.|\bstorage\./i.test(m[0])) created.add(m[1].toLowerCase());
  }
  for (const m of text.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) created.delete(m[1].toLowerCase());
}
// A create inside private/auth/storage is written with its schema; one with no
// schema lands in public, which is what is being checked.
for (const { text } of all) {
  for (const m of text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(private|auth|storage)\.([a-z_][a-z0-9_]*)/gi)) {
    created.delete(m[2].toLowerCase());
  }
}

// Opened by name: granted to authenticated in the fix or in a later migration.
const later = all.filter((m) => m.f >= FIX).map((m) => m.text).join('\n');
const opened = new Set([...later.matchAll(/grant\s+[a-z, ]+\s+on\s+(?:table\s+)?public\.([a-z_][a-z0-9_]*)\s+to\s+authenticated/gi)].map((m) => m[1].toLowerCase()));
// Closed by name anywhere: every privilege revoked from authenticated.
const closed = new Set();
for (const { text } of all) {
  for (const m of text.matchAll(/revoke\s+all\s+(?:privileges\s+)?on\s+(?:table\s+)?([^;]*?)\s+from\s+([^;]*);/gi)) {
    if (!/\bauthenticated\b/.test(m[2])) continue;
    for (const t of m[1].split(',')) {
      const name = /(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s*$/i.exec(t.trim())?.[1];
      if (name) closed.add(name.toLowerCase());
    }
  }
}
// A table closed by name and later opened by name counts as opened.
const leftToDefault = [...created].filter((t) => !opened.has(t) && !closed.has(t)).sort();
ok(created.size > 40, `the migrations create ${created.size} tables in public`);
ok(leftToDefault.length === 0,
  leftToDefault.length === 0
    ? 'every table is opened or closed by name; none is left to a default'
    : `left to a default: ${leftToDefault.join(', ')} (grant it to authenticated by name, or revoke all from authenticated)`);

ok(/revoke truncate, trigger, references on all tables in schema public from authenticated, anon;/.test(fix)
  && /revoke maintain on all tables in schema public from authenticated, anon/.test(fix),
  'nobody signed in, and no visitor, may truncate, trigger on, reference or maintain a table');
ok(/alter default privileges in schema public revoke all on tables from authenticated;/.test(fix)
  && /alter default privileges in schema public revoke all on tables from anon;/.test(fix),
  'a new table starts closed, on an old project as on a new one');
ok(!/grant\s+all\b[^;]*\bto\s+(authenticated|anon)\b/i.test(later) && !/grant\s+[^;]*\btruncate\b[^;]*\bto\s+(authenticated|anon)\b/i.test(later),
  'nothing since opens a table wholesale or hands out TRUNCATE');

const install = read('scripts/fresh-install.sh');
ok(/alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;/.test(install),
  'the fresh install builds with new tables closed, as Supabase does from 30 October 2026, so CI proves it');
ok(/unnest\(c\.relacl\) x order by x::text collate "C"/.test(read('supabase/tests/fingerprint.sql')),
  'the fingerprint compares who may reach a table, not the order the grants were made in');

console.log(bad ? `\nRESULT: ${bad} FAILED` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
