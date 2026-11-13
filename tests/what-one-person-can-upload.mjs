// What one person can put in the church's storage, and who may put study handouts there.
//
// ---------------------------------------------------------------------------
// WHY. On 25 September 2026 Resources were opened to files for every Guide and
// Explorer, and the owner asked for the app's policy and security to be kept
// consistent and safe. Two gaps were found and closed in
// supabase/migrations/20260925120000_what_one_person_can_upload.sql:
//
//   * nothing limited HOW MUCH one account could upload -- only the size of
//     each file -- so one stolen password could fill the church's storage;
//   * anybody signed in could upload study-handout FILES, although only
//     Guides and leaders may write studies.
//
// Both are easy to loosen by accident: drop the restrictive keyword and the
// limit becomes one more way IN; add a folder to the wrong list and evidence
// can be refused. And the numbers are promised in three places people read,
// so they are checked against the migration rather than trusted to agree.
//
//   node tests/what-one-person-can-upload.mjs
// ---------------------------------------------------------------------------
import { readFileSync, existsSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};
const code = (src) => src.replace(/--[^\n]*/g, '');
const MIGRATION = 'supabase/migrations/20260925120000_what_one_person_can_upload.sql';

ok(existsSync(MIGRATION), `the migration is present (${MIGRATION})`);
const sql = existsSync(MIGRATION) ? code(readFileSync(MIGRATION, 'utf8')) : '';

// ---------------------------------------------------------------------------
// 1. THE LIMIT, AND THAT IT CAN ONLY EVER TAKE A YES AWAY
// ---------------------------------------------------------------------------
const fn = sql.slice(sql.indexOf('create or replace function private.room_to_upload'), sql.indexOf('$function$;'));
const files = Number((fn.match(/count\(\*\) < (\d+)/) ?? [])[1]);
const mb = Number((fn.match(/< (\d+)::bigint \* 1024 \* 1024/) ?? [])[1]);
ok(files > 0 && files <= 1000, `a person may keep a bounded number of files (${files})`);
ok(mb > 0 && mb <= 1024, `and a bounded number of megabytes (${mb})`);
ok(/security definer/.test(fn) && /set search_path = ''/.test(fn),
  'the counter is a definer with an empty search path, so nothing can be slipped in ahead of it');
ok(/o\.name like 'library\/' \|\| p_uid::text \|\| '\/%'/.test(fn) && /o\.name like 'lessons\/' \|\| p_uid::text \|\| '\/%'/.test(fn),
  'it counts the person\'s own resources and handouts');
ok(/revoke all on function private\.room_to_upload\(uuid\) from public, anon;/.test(sql),
  'and nobody who is not signed in may call it');

const policy = sql.slice(sql.indexOf('create policy personal_uploads_have_a_limit'), sql.indexOf(';', sql.indexOf('create policy personal_uploads_have_a_limit')));
ok(/as restrictive/.test(policy),
  'the limit is RESTRICTIVE: it narrows the rules that say who may upload, and can never widen them');
ok(/for insert to authenticated/.test(policy), 'on every upload by a signed-in person');
ok(/not in \('library', 'lessons'\)/.test(policy),
  'and only in the two folders people fill by choice');
ok(!/'reports'|'avatars'/.test(policy),
  'so safeguarding evidence and a profile picture are never refused because a shelf is full');
ok(/\(select private\.room_to_upload\(\(select auth\.uid\(\)\)\)\)/.test(policy),
  'asked once per upload, for the person uploading');

// ---------------------------------------------------------------------------
// 2. HANDOUTS ARE FOR THE PEOPLE WHO WRITE STUDIES
// ---------------------------------------------------------------------------
const handouts = sql.slice(sql.indexOf('create policy lesson_file_write'), sql.indexOf(';', sql.indexOf('create policy lesson_file_write')));
ok(/\(select public\.may_write_studies\(\)\)/.test(handouts),
  'uploading a handout asks the same question as writing the study');
ok(/\(storage\.foldername\(name\)\)\[2\] = \(select auth\.uid\(\)\)::text/.test(handouts),
  'and still only into the uploader\'s own folder');

// ---------------------------------------------------------------------------
// 3. A REFUSAL IS EXPLAINED, AND THE NUMBERS PROMISED ARE THE NUMBERS ENFORCED
// ---------------------------------------------------------------------------
{
  const data = readFileSync('lib/live/data.ts', 'utf8');
  const explain = data.slice(data.indexOf('function uploadRefused('), data.indexOf('\n}\n', data.indexOf('function uploadRefused(')));
  ok(explain.includes(`${files} files`) && explain.includes(`${mb} MB`),
    'somebody who hits the limit is told what it is, in the same numbers');
  for (const fnName of ['addMaterialFile', 'attachLessonFile']) {
    const body = data.slice(data.indexOf(`export async function ${fnName}(`), data.indexOf('\nexport ', data.indexOf(`export async function ${fnName}(`) + 10));
    ok(/uploadRefused\(up\.error\.message, file\.name\)/.test(body), `${fnName} explains a refusal rather than repeating the database`);
  }
  const flat = (f) => readFileSync(f, 'utf8').replace(/\s+/g, ' ');
  for (const [file, where] of [['app/privacy/page.tsx', 'the privacy notice'], ['docs/SECURITY.md', 'SECURITY.md'], ['docs/DATA-PROTECTION.md', 'DATA-PROTECTION.md']]) {
    const text = flat(file);
    ok(text.includes(`${files} files`) && text.includes(`${mb} MB`), `${where} states the same limit`);
  }
}

console.log(bad === 0 ? '\nWhat one person can upload is bounded, and said.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
