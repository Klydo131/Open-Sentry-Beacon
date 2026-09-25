// Resources and lesson studies stay simple enough to use without training.
//
// ---------------------------------------------------------------------------
// WHY. On 25 September 2026 the owner said of these screens: "I dont really
// like the complication UI of the resources and lesson studies. As much as
// possible I want it more simple for users to do their job than being
// technical." Rendered with sample data on a phone, the reason was plain:
//
//   * every resource carried five controls under its title -- share, share
//     outside, a church-shelf lozenge, edit, remove -- so four resources filled
//     three screens, above a raw web address and a 70-word note about storage;
//   * adding one asked for a "Kind" from a dropdown the address already answers;
//   * the studies card opened on three empty boxes for starting a series, and
//     every series carried Rename, Unpublish and a red Delete -- which deleted
//     the series and every study in it on ONE tap, with nothing asking;
//   * a Guide on one Explorer's Lessons tab got the whole writing desk, and an
//     Explorer's Study folder opened on a form with their studies at the bottom.
//
// Each of those is easy to bring back one reasonable-looking line at a time,
// which is how they arrived. This file is the line.
//
//   node tests/resources-and-studies-stay-simple.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};
const read = (f) => fs.readFileSync(f, 'utf8');

// ---------------------------------------------------------------------------
// 1. A RESOURCE SAYS WHAT EACH BUTTON DOES, AND KEEPS THE RARE SETTINGS IN EDIT
// ---------------------------------------------------------------------------
// First pass (25 September 2026, morning): five controls under every title
// went behind one "More" button. The owner's answer the same day: "the sharing
// of resources is also complicated ... Easy to add, easy to delete". A "More"
// that has to be found before anything can be deleted is not easy to delete.
// So the row names its errands plainly -- Send, Edit, Delete (or Hide) -- and
// what is rare, how it is filed and the church shelf, lives inside Edit under
// "More options".
{
  const lib = read('components/LiveLibrary.tsx');
  const shelf = lib.slice(lib.indexOf('export function LiveLibraryForGuide'), lib.indexOf('export function LiveSharedWithMe'));
  // Comments out: the ones on this row explain what USED to be on it.
  const row = shelf.slice(shelf.indexOf('{shown.map((m) => ('))
    .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/\/\/[^\n]*/g, '');
  ok(!/const \[more, setMore\]/.test(shelf), 'no "More" button stands between a person and Edit or Delete');

  // The idle row: everything after the edit panel's branch ends.
  const idleAt = row.indexOf(') : (', row.indexOf(') : editing === m.id ? ('));
  const idle = row.slice(idleAt, row.indexOf('</Item>', idleAt));
  const edit = row.slice(row.indexOf(') : editing === m.id ? ('), idleAt);
  ok(idleAt !== -1 && /Send to /.test(idle), 'an idle row offers "Send to …"');
  ok(/startEdit\(m\)/.test(idle) && />\s*Edit\s*</.test(idle), 'and "Edit", on the row');
  ok(/canManage\(m\) \? 'Delete' : 'Hide'/.test(idle), 'and "Delete" (or "Hide"), on the row');
  const buttons = (idle.match(/<button\b/g) ?? []).length + (idle.match(/<SendOut\b/g) ?? []).length;
  // Send (or SendOut), Edit, Delete, and the two answers of the confirm.
  ok(buttons <= 6, `and nothing else (${buttons} controls, counting the delete confirmation)`);
  ok(!/void publish\(m,/.test(idle) && !/edit-kind-/.test(idle),
    'the church shelf and the kind are not on the row');

  const moreOptions = edit.indexOf('More options');
  ok(moreOptions !== -1 && edit.lastIndexOf('<details', moreOptions) !== -1,
    'Edit folds the rare settings under "More options"');
  ok(edit.indexOf('edit-kind-') > moreOptions && edit.indexOf('void publish(m,') > moreOptions,
    'and both the kind and the church shelf are inside it');

  ok(!/id="mat-kind"/.test(shelf), 'adding a link does not ask what kind it is');
  ok(/kind: kindFromUrl\(url\) \?\? 'link'/.test(shelf), 'the address answers that instead');
  ok(/siteOf\(m\.external_url\)/.test(lib) && !/>\{m\.external_url\}</.test(lib),
    'a row says which site a link goes to, not the whole address');
  ok(/\{url\.trim\(\) && \(/.test(shelf) && shelf.indexOf('{url.trim() && (') < shelf.indexOf('id="mat-title"'),
    'the name and the reason appear once there is a link to name');
  ok(/kindsPresent\.length > 1 && \(items\?\.length \?\? 0\) > 6/.test(shelf),
    'the kind chips wait for a shelf long enough to need them');
}

// ---------------------------------------------------------------------------
// 2. STUDIES OPEN ON THE STUDIES, AND NOTHING DESTRUCTIVE IS ONE TAP
// ---------------------------------------------------------------------------
{
  const st = read('components/LiveStudies.tsx');
  const main = st.slice(st.indexOf('export function LiveStudies('));
  ok(/\{canWrite && creating && \(/.test(main), 'the new-series form waits for "+ New series"');
  ok(/\+ New series/.test(main), 'and the button says so');

  const rowStart = main.indexOf('const opened = open === s.id;');
  const rowButtonEnd = main.indexOf('</button>', main.indexOf('aria-expanded={opened}', rowStart));
  // Comments out: the one on this row explains what USED to be on it.
  const rowHead = main.slice(rowStart, rowButtonEnd)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/[^\n]*/g, '');
  ok(rowStart !== -1 && !/Rename|Delete|setSeriesPublished/.test(rowHead),
    'a series row carries its name and nothing to press but itself');
  ok(/\{opened && mine && \(/.test(main), 'looking after a series happens inside it, once it is open');

  const delSeries = main.indexOf('live.deleteLessonSeries(');
  ok(delSeries !== -1 && main.lastIndexOf('confirming === s.id', delSeries) !== -1
     && main.lastIndexOf('confirming === s.id', delSeries) < delSeries,
    'deleting a series asks first');
  ok(/every study in it/.test(main), 'and says it takes every study with it');

  const body = st.slice(st.indexOf('function SeriesBody('), st.indexOf('export function LiveStudies('));
  const delStudy = body.indexOf('live.deleteLesson(');
  ok(delStudy !== -1 && body.lastIndexOf('confirmDelete === lesson.id', delStudy) !== -1
     && body.lastIndexOf('confirmDelete === lesson.id', delStudy) < delStudy,
    'deleting a study asks first');
  ok(/\{mine && !adding && \(/.test(body), 'a series being read does not open on an empty form');

  ok(/const canWrite = canWriteStudies\(profile\?\.role\) && !readOnly;/.test(main),
    'readOnly can only take the writing controls away, never hand them out');
}

// ---------------------------------------------------------------------------
// 2b. A SERIES IS WRITTEN IN ONE FORM, AND ITS HANDOUTS ARE DROPPED IN
// ---------------------------------------------------------------------------
// The owner, the same afternoon: "the lesson study making in guide is
// complicated". A series with two studies and a handout took four forms: make
// the empty series, open it, add a study, add another, then Edit to find
// "Attach a file". Now: one form, studies written in it, files dropped beside
// them, and the rare settings folded away.
{
  const st = read('components/LiveStudies.tsx');
  const form = st.slice(st.indexOf('function NewSeries('), st.indexOf('export function LiveStudies('));
  ok(form.length > 0 && /<NewSeries\b/.test(st), 'a new series is made by one form');
  ok(/id=\{`draft-body-\$\{s\.key\}`\}/.test(form) && /\+ Add another study/.test(form),
    'the studies are written in it, as many as are wanted');
  ok(/<FileDrop\b/.test(form), 'with their handouts dragged in beside them');
  const more = form.indexOf('>More options<');
  ok(more !== -1 && form.lastIndexOf('<details', more) !== -1
     && form.indexOf('id="new-series-topic"') > more && form.indexOf('id="new-series-desc"') > more,
    'the topic and the line under the name are folded under "More options"');
  ok(/<details\b[^>]*>\s*<summary[^>]*>Formatting tips<\/summary>/.test(st.slice(st.indexOf('function WritingHints('))),
    'and the formatting tips are folded, not an open box under every study');

  const save = form.slice(form.indexOf('const save = async'));
  const series = save.indexOf('live.addLessonSeries(');
  const lesson = save.indexOf('live.addLesson(id,');
  const files = save.indexOf('live.attachLessonFile(lessonId,');
  const share = save.indexOf('live.setSeriesPublished(id, true)');
  ok(series !== -1 && series < lesson && lesson < files && files < share,
    'it saves the series, then each study, then its files -- and shares only once all of it is saved');
  ok(!/publish: true/.test(save) && !/publish: share/.test(save),
    'so a failure half way leaves a private draft, never half a series on the church shelf');

  const body = st.slice(st.indexOf('function SeriesBody('), st.indexOf('function NewSeries('));
  const adding = body.slice(body.indexOf('{mine && adding && ('));
  ok(/<FileDrop\b/.test(adding) && /live\.attachLessonFile\(id, f\)/.test(adding),
    'adding one more study to a series takes its handouts in the same step');
  ok(adding.indexOf('setAdding(false)') < adding.indexOf('live.attachLessonFile(id, f)'),
    'and closes before they upload, so a failed file cannot tempt a second, duplicate study');
  const editStudy = body.slice(body.indexOf('Edit this study'), body.indexOf('Delete study'));
  ok(/<FileDrop\b/.test(editStudy), 'editing a study takes handouts by drag and drop too');

  const data = read('lib/live/data.ts');
  const remove = data.slice(data.indexOf('export async function removeLessonFile'), data.indexOf('export async function listAssignments'));
  ok(remove.indexOf(".remove([path])") !== -1 && remove.indexOf(".remove([path])") < remove.indexOf(".from('lesson_files').delete()"),
    'removing a handout deletes the file itself, not only the line pointing at it');
  const attach = data.slice(data.indexOf('export async function attachLessonFile'), data.indexOf('export async function lessonFileUrl'));
  ok(/if \(error\) \{[\s\S]{0,200}\.remove\(\[path\]\)/.test(attach),
    'and a handout whose record cannot be written is taken back out of storage');
}

// ---------------------------------------------------------------------------
// 3. EACH SCREEN SHOWS THE JOB IT IS FOR
// ---------------------------------------------------------------------------
{
  const guide = read('components/live/GuidePages.tsx');
  const lessons = guide.slice(guide.indexOf("tab === 'lessons'"), guide.indexOf("tab === 'resources'"));
  ok(/<LiveStudies\s+readOnly/.test(lessons),
    "a Guide on one Explorer's Lessons tab reads the studies rather than getting the writing desk");
  ok(/href="\/office\?room=studies"/.test(lessons), 'and is told where the writing desk is');

  const resources = guide.slice(guide.indexOf("tab === 'resources'"));
  ok(/heading=\{`Send \$\{pairing\.ds_name\.split\(' '\)\[0\]\} something`\}/.test(resources),
    "a Guide on one Explorer's Resources tab is asked what to send them");

  const explorer = read('components/live/ExplorerPage.tsx');
  const study = explorer.slice(explorer.indexOf("room === 'study'"));
  const shared = study.indexOf('<LiveSharedWithMe');
  const studies = study.indexOf('<LiveStudies');
  const links = study.indexOf('<LiveLibraryForGuide');
  ok(shared !== -1 && studies > shared && links > studies,
    "an Explorer's Study folder opens on what was sent to them, then the studies, then their own links");
}

// ---------------------------------------------------------------------------
// 4. THE SAMPLE APP HAS THE SAME SHAPE
// ---------------------------------------------------------------------------
{
  const sample = read('components/LessonSeriesLibrary.tsx');
  ok(/\{building && \(/.test(sample) && /\+ New series/.test(sample),
    'the sample studies shelf also waits for "+ New series" before showing the builder');
  ok(sample.indexOf('{building && (') < sample.indexOf('existing.map('),
    'with the builder above the shelf only once it is asked for');
}

console.log(bad === 0 ? '\nSimple enough to use without training.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
