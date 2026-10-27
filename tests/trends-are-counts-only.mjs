// Trends are counts only.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 27 October 2026: "We can use Rust for Data security and Python
// for data analysis." The costed plan put the analysis on the owner's own
// computer, reading weekly counts that cannot name anyone, and the owner chose
// it. supabase/migrations/20261027160000_trends_in_counts_only.sql is what it
// may read; tools/trends/ is the program.
//
// WHAT HOLDS, each checked below and each broken on purpose once to watch the
// check go red. What the role can and cannot read is proved by running it, as
// invented people, in supabase/tests/trends-are-counts-only.sql, which this
// checks is run; this file holds the shape that test cannot see from inside a
// database: no password in a file, nothing written where git would keep it.
//
//   node tests/trends-are-counts-only.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const sql = (p) => read(p).replace(/--[^\n]*/g, '');
const py = (p) => read(p).replace(/"""[\s\S]*?"""/g, '').replace(/#[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const m = sql('supabase/migrations/20261027160000_trends_in_counts_only.sql');

// ---- THE VIEW ----
const numbers = ['joined', 'pairs_started', 'pairs_talking', 'messages', 'lessons_finished', 'lessons_read',
                 'prayer_requests', 'meetings', 'reports_raised', 'reports_closed'];
const hiddenEach = numbers.every((n) => new RegExp(`case when ${n}\\s+between 1 and 4 then null else ${n}\\s+end`).test(m));
ok(hiddenEach, 'every number in the view is hidden from 1 to 4');
ok((m.match(/between 1 and 4 then null/g) ?? []).length === numbers.length,
   'and no number goes out without that rule');
ok(/create or replace view trends\.weekly with \(security_barrier = true\)/.test(m),
   'the view is a security barrier');
ok(!/full_name|email|body|detail|sender_id|reporter_id|subject_id/.test(m.slice(m.indexOf('select church_id,'))),
   'what the view hands out names no person and carries no words anybody wrote');

// ---- THE ROLE ----
ok(/create role beacon_trends nologin noinherit/.test(m), 'the role is made without a login');
ok(!/password/i.test(m), 'and no password is in the migration (the owner sets one; tools/trends/README.md)');
ok(/revoke all on schema trends from public/.test(m) && /revoke all on trends\.weekly from public, anon, authenticated/.test(m),
   'the app\'s roles get nothing from the trends schema');
ok(/grant select on trends\.weekly to beacon_trends/.test(m) && (m.match(/\bgrant\b/g) ?? []).length === 2,
   'the role gets the schema and the one view, and nothing else is granted');
ok(!/grant[^;]*beacon_trends[^;]*to\s+authenticator|grant\s+beacon_trends/.test(m),
   'and no role is made a member of it');

// ---- PROVED BY RUNNING ----
ok(/supabase\/tests\/trends-are-counts-only\.sql/.test(read('scripts/fresh-install.sh')),
   'every fresh install runs the proof as invented people');

// ---- THE PROGRAM ----
const prog = py('tools/trends/trends.py');
ok(/os\.environ\.get\("TRENDS_DATABASE_URL"\)/.test(prog), 'the program takes the connection from the environment');
ok(!/print\([^)]*\burl\b/.test(prog), 'and never prints it');
ok(/conn\.read_only = True/.test(prog), 'it only ever reads');
ok(/from trends\.weekly/.test(prog) && !/from (public|auth|private)\./.test(prog), 'and reads the view and nothing else');
const files = fs.readdirSync(path.join(root, 'tools/trends'));
ok(!files.some((f) => /\.(env|csv|png)$/.test(f)), 'nothing it writes is kept beside it');
ok(/^trends-out\/$/m.test(read('.gitignore')), 'and git ignores the folder it writes into');
const everything = files.filter((f) => /\.(py|md|txt)$/.test(f)).map((f) => read(`tools/trends/${f}`)).join('\n');
ok(!/postgres(ql)?:\/\/[^\s'"<>]+:[^\s'"<>@]+@(?!<)/.test(everything.replace(/<[^>]+>/g, '<x>')),
   'no connection string with a real password is written in any of its files');

console.log(bad ? `\n${bad} FAILED` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
