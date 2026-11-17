// A deletion reaches everyone, and a refused one never says "deleted".
//
// Reported 17 November 2026: a study, a lesson, a resource or a called-off
// appointment that a Guide or the Director deleted stayed on the Explorer's
// screen. The database half is proved in supabase/tests/a-deletion-reaches-
// everyone.sql against a database built from nothing. This holds the app half:
//
//   * a delete asks for its rows back: row-level security answers a refused
//     delete with zero rows and no error, which used to read as success;
//   * the church's leaders delete a study for everybody, not only for
//     themselves;
//   * a Guide putting away somebody else's study or resource takes it back
//     from their Explorers too;
//   * a Guide's copy is what their Explorer is given, and the Explorer's list
//     shows it in place of the original;
//   * whoever calls an appointment off sees it leave their list.
//
//   node tests/a-deletion-reaches-everyone.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); };

const data = read('lib/live/data.ts');
const body = (name) => {
  const from = data.indexOf(`export async function ${name}(`);
  if (from < 0) return '';
  const rest = data.slice(from);
  return rest.slice(0, rest.indexOf('\nexport ', 10));
};

// Every plain delete in the data layer asks for its rows back.
const deletes = [...data.matchAll(/\.delete\(\)([^;]*);/g)].map((m) => m[1]);
const blind = deletes.filter((tail) => /\.eq\('id', (id|mineId)\)\s*$/.test(tail.trim()));
ok(blind.length === 0, `no delete by id runs blind (${blind.length} without .select)`);
for (const fn of ['deleteMaterial', 'deleteLessonSeries', 'deleteLesson', 'removeLessonFile', 'deleteBlogPost',
  'deletePrayerRequest', 'deleteAnnouncement', 'deleteNote', 'deleteFollowUp', 'removePocketApp']) {
  ok(/mustHaveDeleted\(/.test(body(fn)), `${fn} refuses to report a delete that removed nothing`);
}
ok(/function mustHaveDeleted\(rows: unknown\[\] \| null\): void \{\s*if \(!rows \|\| rows\.length === 0\)/.test(data),
   'and zero rows is an error the person reads');

// Leaders delete for everybody.
ok(/row\.author_id === me_id \|\| await iLeadTheChurch\(\)/.test(body('deleteLessonSeries')), 'a Director deletes any study in the church');
ok(/await iLeadTheChurch\(\) \? id : await myVersionOfLesson\(id\)/.test(body('deleteLesson')), 'and any lesson in it');

// A Guide's "delete" takes it back from their Explorers.
ok(/from\('lesson_assignments'\)\s*\.delete\(\)\.eq\('series_id', id\)\.eq\('assigned_by', me_id\)/.test(body('deleteLessonSeries')),
   'putting a study away takes it back from the Explorers it was given to');
ok(/from\('material_shares'\)\.delete\(\)\.eq\('material_id', id\)\.eq\('shared_by', me_id\)/.test(body('deleteMaterial')),
   'putting a resource away takes back every share of it this person made');

// A Guide's copy reaches their Explorer.
const copy = body('myVersionOf');
ok((copy.match(/giveMyCopyToMyExplorers\(/g) ?? []).length >= 2, 'whenever a copy is made or reused, the Guide\'s Explorers are moved onto it');
ok(/explorer && !r\.is_published/.test(body('listLessonSeries')), 'and the Explorer\'s list shows the copy in place of the original');
const mig = read('supabase/migrations/20261117150000_a_deletion_reaches_everyone.sql');
ok(/create policy la_drop on public\.lesson_assignments\s+for delete/.test(mig), 'the database lets a study be taken back');
ok(/or id in \(select private\.series_given_to_me\(\)\)/.test(mig), 'and lets an Explorer read what was given to them');
ok(/security definer[\s\S]{0,60}set search_path to ''/.test(mig) && /revoke all on function public\.give_my_copy_to_my_explorers\(uuid\) from public, anon/.test(mig),
   'the new function is fenced like every other one');
ok(/a-deletion-reaches-everyone\.sql/.test(read('scripts/fresh-install.sh')), 'and the database proof runs on every fresh install');

// Appointments.
const meet = read('components/LiveMeetings.tsx');
ok(/const callOff = async \(id: string, note\?: string\) => \{\s*await live\.cancelMeeting\(id, note\);\s*setCleared\(clearMeeting\(id\)\);/.test(meet),
   'whoever calls an appointment off sees it leave their list');
ok(!/act\(\(\) => live\.cancelMeeting\(/.test(meet), 'every way of calling one off goes through that');

console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
