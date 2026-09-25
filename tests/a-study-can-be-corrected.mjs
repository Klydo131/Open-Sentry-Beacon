// A study you have written can be changed, not only deleted.
//
// WHY THIS EXISTS. Lesson studies could be created, published, unpublished and
// deleted — and never edited. A typo in a title, or a series filed under the
// wrong area of interest, could only be fixed by deleting the whole thing and
// writing it again, which also destroyed every handout attached to it, because
// the files hang off the lesson row. So in practice nobody fixed anything and
// the shelf carried the mistake.
//
// The database had allowed this all along: `lessons_edit` and `ls_edit` both
// permit an UPDATE from the author or from anybody who manages the church, and
// both pin church_id to the caller's own. Only the app was missing. That is
// worth a test precisely because nothing failed — no error, no refusal, just an
// absent button that nobody could point at.
//
//   node tests/a-study-can-be-corrected.mjs
//
// Reads the source; needs no browser and no database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

const data = read('lib/live/data.ts');
const ui = read('components/LiveStudies.tsx');

// ---- The data layer can change one, and refuses an empty title ----
for (const fn of ['updateLesson', 'updateLessonSeries']) {
  ok(new RegExp(`export async function ${fn}\\s*\\(`).test(data),
     `lib/live/data.ts exports ${fn}`);
}
ok(/from\('lessons'\)\.update\(/.test(data), 'updateLesson writes to the lessons table');
// READS THE FUNCTION, NOT ONE SHAPE OF IT. This asserted the literal
// `.update({ title` and went red the day the call started building its patch
// as an object -- because the description must be written only when one was
// offered, or renaming a series erases the line underneath it. The rule is
// that the new title reaches the table; how the call is assembled is not the
// rule.
{
  const fn = data.slice(data.indexOf('export async function updateLessonSeries'));
  const body = fn.slice(0, fn.indexOf('\n}') + 2);
  ok(/from\('lesson_series'\)\.update\(/.test(body),
     'updateLessonSeries writes to the lesson_series table');
  // READ THE NAME OFF THE CALL, THEN GO AND FIND IT. Written this way so a
  // rename cannot turn it red for a change that breaks nothing -- the first
  // repair of this check anchored on the literal word `patch` and did exactly
  // that. It also caught a version that passed on a function which had stopped
  // writing the title at all, because a loose search for "title:" matches the
  // function's own SIGNATURE.
  const sent = body.match(/\.update\((\w+)\)/)?.[1];
  ok(!!sent && new RegExp(`const ${sent}\\b`).test(body),
     'and sends the patch it just built, not an empty object');
  const patch = sent ? body.slice(body.indexOf(`const ${sent}`), body.indexOf('.update(')) : '';
  ok(/^\s*title,\s*$/m.test(patch),
     'updateLessonSeries writes the title back');
}

// A title is what the study is called in every list, so an empty one is not a
// correction, it is a study nobody can find again.
const guards = data.match(/needs a title/g) ?? [];
ok(guards.length >= 2, `both refuse an empty title (${guards.length})`);

// ---- The screen offers it, on the study and on the series ----
ok(/live\.updateLesson\(/.test(ui), 'the studies screen calls updateLesson');
ok(/live\.updateLessonSeries\(/.test(ui), 'and updateLessonSeries');
ok(/Edit this study/.test(ui), 'a study offers "Edit this study"');
ok(/>\s*Rename\s*</.test(ui), 'a series offers "Rename"');

// ---- Editing must be a way OUT, not a trap ----
ok((ui.match(/Cancel/g) ?? []).length >= 2,
   'both editors can be cancelled without saving');
ok(/setEditing\(''\)/.test(ui) && /setRenaming\(''\)/.test(ui),
   'and both close themselves once saved');

// ---- The destructive control must not be the only way to change something ----
// This is the shape of the original bug: Delete existed, Edit did not, so
// somebody fixing a typo had to reach for the button that destroys the work.
const lessonControls = ui.slice(ui.indexOf('Edit this study'), ui.indexOf('Delete study'));
// The handout box, not a word: "Attach a file" is now only in a comment
// explaining what the drop box replaced, and a comment is not a control.
ok(lessonControls.length > 0 && lessonControls.includes('<FileDrop'),
   'Edit comes before Delete on a study, not after it');

// ---- Everybody may change a study, nobody changes it for anybody else ----
//
// THREE REPORTS AND THREE ANSWERS, AND THE THIRD IS THE OWNER'S.
//
// The screen first asked "did I write it", so the church's shared studies were
// editable by nobody: author_id did not exist until migration 0038 and every
// series written before it carries NULL. Widening to Directors fixed that and
// broke something worse -- one person's edit landed on seventeen other shelves
// from a button that looked ordinary. Widening to EVERYBODY, on the ask
// "privately, based on their own account, not universal", fixed that in turn.
//
// Then the owner narrowed it: "for Explorers they cannot edit what the sample
// Lesson studies are, only EDs, Directors and Guides can do that." That is the
// rule now, it is theirs to set, and it is the better shape -- a study is
// teaching material, and somebody being walked with is not preparing the walk.
//
// WHAT SURVIVES ALL THREE ROUNDS is the template mechanism itself, which is
// what the rest of this section checks: a shared study a GUIDE edits is copied
// to them first, so the church's copy is never rewritten underneath the other
// forty Guides. Only who may start that has changed, and
// tests/an-explorer-reads-the-studies.mjs owns that question.
//
// Probed against the live policies, and rolled back:
//
//   guide:    make_copy=ALLOWED  original=untouched  lessons 6/6 still there
//   explorer: read=44  write=0  REFUSED=44  lesson_rows_edited=0
{
  const data = read('lib/live/data.ts');
  const gate = ui.slice(ui.indexOf('const mine ='), ui.indexOf('const opened ='));
  ok(/const mine = canWriteStudies\(profile\?\.role\)/.test(gate),
     'the controls are drawn for whoever may write studies, and nobody else');
  ok(!/const mine = true;/.test(gate),
     'and not for everybody, which is what it briefly said');

  // PUBLISHING IS THE EXCEPTION and must not share the gate: it is the one act
  // on this screen that reaches the whole church.
  ok(/const canPublish = /.test(ui), 'publishing has its own narrower gate');
  ok(/\{canPublish && \(/.test(ui), 'and the Publish control asks it');
  ok(/author_id === profile\.id/.test(ui.slice(ui.indexOf('const canPublish ='))),
     'which starts from who wrote it');

  // The whole of "privately" is one function, so it is named and checked.
  const copy = data.slice(data.indexOf('export async function myVersionOf'));
  const body = copy.slice(0, copy.indexOf('\nexport '));
  ok(/if \(original\.author_id === me_id\) return original\.id;/.test(body),
     'a study you wrote is written in place, with no copy made');
  ok(/copied_from: original\.id/.test(body), 'and a shared one is copied to you');
  ok(/is_published: false/.test(body), 'the copy is private, which is the point');
  ok(/from\('lessons'\)[\s\S]{0,200}position/.test(body),
     'and the studies inside come with it, positions kept');

  // EVERY WRITE PATH GOES THROUGH IT. One that does not is a way to change the
  // church's copy by accident, which is the bug this replaced.
  // The OPENING PAREN is part of the search, because `addLesson` is a prefix of
  // `addLessonSeries` and `deleteLesson` of `deleteLessonSeries`, both of which
  // are declared earlier in the file. Without it this read the wrong function
  // and reported a fix missing that was three lines further down.
  for (const fn of ['updateLessonSeries', 'updateLesson', 'addLesson', 'deleteLesson']) {
    const f = data.slice(data.indexOf(`export async function ${fn}(`));
    ok(/myVersionOf/.test(f.slice(0, f.indexOf('\nexport '))),
       `${fn} writes to your version, not the shared one`);
  }

  // Deleting a shared study hides it for you rather than removing it from
  // everybody, which is not yours to do.
  const del = data.slice(data.indexOf('export async function deleteLessonSeries'));
  const delBody = del.slice(0, del.indexOf('\nexport '));
  ok(/author_id === me_id/.test(delBody) && /\.delete\(\)/.test(delBody),
     'your own study is really deleted');
  // THE INSERT SPECIFICALLY. `is_hidden: true` appears twice in this function,
  // once on the update branch for somebody who already has a copy, so matching
  // the bare string passed even with the insert's copy of it deleted.
  ok(/\.insert\(\{[\s\S]{0,400}copied_from: row\.id,[\s\S]{0,80}is_hidden: true/.test(delBody),
     'and a shared one is hidden for you alone, by a marker pointing at it');
  ok(!/\.delete\(\)[\s\S]{0,60}eq\('id', row\.id\)/.test(delBody),
     'and is never deleted out from under the rest of the church');

  // And the list has to honour both, or the shelf shows the same study twice.
  const list = data.slice(data.indexOf('export async function listLessonSeries'));
  const listBody = list.slice(0, list.indexOf('\nexport '));
  ok(/replaced\.has\(r\.id\)/.test(listBody), 'a template you have replaced is not shown as well');
  ok(/!r\.is_hidden/.test(listBody), 'and one you put away stays away');

  // The policy that lets an Explorer keep a copy, and stops them publishing it.
  const mig = read('supabase/migrations/20260904090000_a_study_is_yours_to_change.sql');
  ok(/author_id = \(select auth\.uid\(\)\)/.test(mig), 'a series may only be written as yourself');
  ok(/not is_published[\s\S]{0,120}manages_church/.test(mig),
     'and publishing to the church stays with the people who answer for it');
}

// ---------------------------------------------------------------------------
// A SAVE THAT CHANGES NOTHING MUST SAY SO
// ---------------------------------------------------------------------------
//
// Reported: "Explorers can't edit any Lesson studies." Probed against the live
// database, every one of the forty-four CAN -- copy the series, copy the
// lessons, rename their copy, read it back. The database was never the
// problem.
//
// What made it impossible to diagnose is this: without `.select()`, an UPDATE
// that matches NO ROWS is not an error. PostgREST returns success, the screen
// says nothing went wrong, and nothing changed. From the other side of the
// glass that is not a permission message, it is "this app does not work", and
// there is nothing on screen to report.
//
// So both updates ask for the row back and refuse to call it saved when none
// came. Whatever the cause -- a policy, a stale build, a bug here -- the person
// now gets a sentence instead of silence.
{
  const src = read('lib/live/data.ts');
  for (const name of ['updateLessonSeries', 'updateLesson(']) {
    const at = src.indexOf(`export async function ${name}`);
    const body = src.slice(at, src.indexOf('\nexport ', at + 1));
    const label = name.replace('(', '');
    ok(at !== -1, `${label} exists`);
    ok(/\.select\('id'\)/.test(body), `${label} asks for the row back`);
    ok(/data\.length === 0/.test(body), `${label} notices when nothing was written`);
    ok(/did not save/.test(body), `${label} says so in words a person can act on`);
  }
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
