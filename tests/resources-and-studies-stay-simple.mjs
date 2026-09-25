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
// 1. A RESOURCE SHOWS WHAT PEOPLE COME TO DO, AND KEEPS THE REST BEHIND "MORE"
// ---------------------------------------------------------------------------
{
  const lib = read('components/LiveLibrary.tsx');
  const shelf = lib.slice(lib.indexOf('export function LiveLibraryForGuide'), lib.indexOf('export function LiveSharedWithMe'));
  const row = shelf.slice(shelf.indexOf('{shown.map((m) => ('));
  const moreAt = row.indexOf('{more === m.id && sharing !== m.id && (');
  ok(moreAt !== -1, 'the rare errands have a "More" of their own');
  for (const [label, needle] of [
    ['Edit', 'startEdit(m)'],
    ['the church-shelf switch', 'void publish(m,'],
    ['Remove', "setConfirming(m.id)"],
  ]) {
    const at = row.indexOf(needle);
    ok(at > moreAt, `${label} lives behind More, not on the row`);
  }
  // The idle row: one way to send, one "More". Counted between the end of the
  // send panel and the More panel, where the idle branch is drawn.
  const idle = row.slice(row.lastIndexOf(') : (', moreAt), moreAt);
  const buttons = (idle.match(/<button\b/g) ?? []).length + (idle.match(/<SendOut\b/g) ?? []).length;
  ok(buttons <= 3 && /Send to /.test(idle) && /'More'/.test(idle),
    `an idle row draws "Send to …" and "More" and nothing else (${buttons} controls in the branch)`);

  ok(!/id="mat-kind"/.test(shelf), 'adding a link does not ask what kind it is');
  ok(/kind: kindFromUrl\(url\) \?\? 'link'/.test(shelf), 'the address answers that instead');
  ok(/siteOf\(m\.external_url\)/.test(lib) && !/>\{m\.external_url\}</.test(lib),
    'a row says which site a link goes to, not the whole address');
  const why = shelf.indexOf('files stay on your own device');
  ok(why !== -1 && shelf.lastIndexOf('<details', why) > shelf.lastIndexOf('</details>', why),
    'the note about files is folded away until somebody asks');
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
