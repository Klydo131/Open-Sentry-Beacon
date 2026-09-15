// A Guide's private working copy is never published to the church.
//
// ---------------------------------------------------------------------------
// REPORTED AS: "I deleted this in my guide account and yet it's still here
// being share in the Explorer."
//
// THE DELETE WAS NOT THE BUG. Deleting a series you did not write writes a
// hidden copy for you rather than removing it, and that worked. What it cannot
// reach is a DIFFERENT row that is also published.
//
// Editing somebody else's series gives you a private copy. setSeriesPublished
// publishes any series by id and never asked whether it was one -- so a private
// copy could go church-wide, where ls_read admits any published series to every
// Explorer. In the live table that produced three rows with one title: the real
// original with six studies, an EMPTY published copy of it filed under another
// topic, and two hidden copies of THAT -- two people in turn deleting a thing
// neither could remove. The author of the published one had since been removed,
// so no Guide could manage it at all.
//
// The rule lives in the database because hiding a button leaves the call
// reachable, and the row it writes is read by everybody.
//
//   node tests/a-private-copy-is-never-published.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const stripSql = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const dir = path.join(root, 'supabase', 'migrations');
const sql = stripSql(
  fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => read(`supabase/migrations/${f}`)).join('\n'),
);

ok(/a_private_copy_is_never_published/.test(sql),
   'the rule exists in the database');

// The condition, isolated. Both halves matter: without copied_from it would
// forbid publishing anything, and without is_published it would forbid copies.
const fn = /function private\.a_private_copy_is_never_published\(\)[\s\S]*?\$function\$;/.exec(sql);
ok(!!fn, 'and is where it is expected to be');
const guard = fn ? fn[0] : '';
ok(/new\.is_published\s+and\s+new\.copied_from is not null/.test(guard),
   'a copy cannot be published, and only a copy is stopped');

// BEFORE INSERT OR UPDATE. An UPDATE-only trigger misses a copy inserted
// already published, which is one call away in the same file.
const trig = /create trigger a_private_copy_is_never_published[\s\S]*?;/.exec(sql);
ok(!!trig && /before insert or update/.test(trig[0]),
   'checked when the row is written as well as when it changes');

// A Guide publishing their OWN work is untouched: copied_from is null there.
ok(!/new\.author_id/.test(guard),
   'and it says nothing about who wrote it, so an original still publishes');

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
