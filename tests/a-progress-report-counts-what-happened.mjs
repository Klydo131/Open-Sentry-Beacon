// The progress report counts what happened, for the right people, in the
// right period, and names who needs somebody to look.
//
// Asked for on 2 October 2026: a progress report for Guides and higher up
// accounts, in the Office with the Reports subroom, integrated with how
// Explorers are progressing, in the shape of an Adventist teacher's report.
//
//   node tests/a-progress-report-counts-what-happened.mjs

import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { misplacedIn, parseXml } from './_word-order.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-progress-'));
const bundle = path.join(out, 'progress.mjs');
await build({
  stdin: {
    contents: "export * from './lib/progress-report';\nexport * from './lib/progress-report-docx';\n"
      + "export { unzipVault } from './lib/study/obsidian';\n",
    resolveDir: root,
    loader: 'ts',
  },
  alias: { '@': root },
  outfile: bundle,
  bundle: true, format: 'esm', platform: 'node', target: 'es2020', logLevel: 'silent',
});
const S = await import(pathToFileURL(bundle).href);

// ---------------------------------------------------------------------------
// 1. A MONTH OR A QUARTER, THE WAY THE CHURCH COUNTS THEM
// ---------------------------------------------------------------------------
const now = new Date(2026, 9, 2, 12, 0, 0); // Friday 2 October 2026, midday
const p = (key, at = now) => S.periodOf(key, at);
ok(p('this-month').label === 'October 2026' && p('this-month').from.getTime() === new Date(2026, 9, 1).getTime()
   && p('this-month').to.getTime() === new Date(2026, 10, 1).getTime(), 'this month runs from the 1st to the 1st');
ok(p('last-month').label === 'September 2026', 'last month is the one before');
ok(p('this-quarter').label === 'Quarter 4, 2026 (October to December)'
   && p('last-quarter').label === 'Quarter 3, 2026 (July to September)',
   'quarters are the calendar\'s, as Sabbath School\'s are');
const january = new Date(2027, 0, 15);
ok(p('last-month', january).label === 'December 2026' && p('last-quarter', january).label === 'Quarter 4, 2026 (October to December)',
   'and in January, last month and last quarter are last year\'s');

// ---------------------------------------------------------------------------
// THE CHURCH THIS FILE REPORTS ON (invented)
// ---------------------------------------------------------------------------
const iso = (y, m, d, h = 10) => new Date(y, m - 1, d, h).toISOString();
const base = {
  names: { g1: 'Maria Santos', g2: 'David Cruz', e1: 'John Reyes', e2: 'Grace Lim', e3: 'Peter Tan', e4: 'Anna Yu', e5: 'Ruth Bell' },
  pairings: [
    { id: 'p1', dm_id: 'g1', ds_id: 'e1', journey_stage: 'call', status: 'active', created_at: iso(2026, 8, 1) },
    { id: 'p2', dm_id: 'g1', ds_id: 'e2', journey_stage: 'create', status: 'active', created_at: iso(2026, 10, 1) },
    { id: 'p3', dm_id: 'g2', ds_id: 'e3', journey_stage: 'care', status: 'active', created_at: iso(2026, 6, 1) },
    { id: 'p4', dm_id: 'g1', ds_id: 'e4', journey_stage: 'connect', status: 'archived', created_at: iso(2026, 3, 1) },
    { id: 'p5', dm_id: 'g1', ds_id: 'e5', journey_stage: 'connect', status: 'paused', created_at: iso(2026, 9, 1) },
  ],
  events: [
    { pairing_id: 'p1', from_stage: 'create', to_stage: 'connect', created_at: iso(2026, 9, 5) },
    { pairing_id: 'p1', from_stage: 'connect', to_stage: 'care', created_at: iso(2026, 9, 20) },
    { pairing_id: 'p1', from_stage: 'care', to_stage: 'call', created_at: iso(2026, 10, 1) },
    { pairing_id: 'p3', from_stage: 'connect', to_stage: 'care', created_at: iso(2026, 6, 10) },
    { pairing_id: 'p5', from_stage: 'connect', to_stage: 'create', created_at: iso(2026, 10, 1) },
    { pairing_id: 'p5', from_stage: 'create', to_stage: 'connect', created_at: iso(2026, 10, 1, 11) },
  ],
};
const guideIn = {
  ...base, me: 'g1', scope: 'mine',
  meetings: [
    { pairing_id: 'p1', at: iso(2026, 9, 25), held: true, cancelled: false },
    { pairing_id: 'p1', at: iso(2026, 10, 1), held: true, cancelled: false },
    { pairing_id: 'p1', at: iso(2026, 10, 1, 18), held: false, cancelled: true },
    { pairing_id: 'p1', at: iso(2026, 10, 5), held: false, cancelled: false },
    { pairing_id: 'p3', at: iso(2026, 10, 1), held: true, cancelled: false },
  ],
  lessons: [
    { pairing_id: 'p1', created_at: iso(2026, 9, 1), completed_at: iso(2026, 10, 1) },
    { pairing_id: 'p1', created_at: iso(2026, 9, 1), completed_at: null },
    { pairing_id: 'p2', created_at: iso(2026, 10, 1), completed_at: null },
  ],
  followUps: [
    { pairing_id: 'p1', due_on: '2026-09-30', done_at: null },
    { pairing_id: 'p1', due_on: '2026-09-28', done_at: iso(2026, 10, 1) },
    { pairing_id: 'p2', due_on: '2026-10-09', done_at: null },
  ],
};

// ---------------------------------------------------------------------------
// 2. A GUIDE'S REPORT: THEIR OWN EXPLORERS, IN FULL
// ---------------------------------------------------------------------------
{
  const r = S.buildProgress(guideIn, 'this-month', now);
  const names = r.explorers.map((e) => e.explorer);
  ok(r.scope === 'mine' && r.detailed && names.length === 3 && !names.includes('Peter Tan') && !names.includes('Anna Yu'),
     'a Guide\'s report is the people they walk with: not another Guide\'s, not an archived pairing');
  const t = r.totals;
  ok(t.walking === 2 && t.newExplorers === 1, 'it counts who is walked with, and who is new this month');
  ok(t.stepsForward === 1 && t.decisions === 1 && t.commissioned === 0,
     'a step forward is a stage reached this month: John reaching Call is one, and a decision');
  ok(!r.explorers.find((e) => e.explorer === 'Ruth Bell').reached.length,
     'a step back and forward again to the same stage is not progress');
  ok(t.studiesHeld === 1 && t.lessonsFinished === 1 && t.followUpsDone === 1,
     'Bible studies held, lessons finished and follow-ups done are the month\'s, not before it; a cancelled study is not counted');
  const john = r.explorers.find((e) => e.explorer === 'John Reyes');
  ok(john.stageLabel === 'Call' && john.step === 4 && john.since === iso(2026, 10, 1).slice(0, 10),
     'each Explorer says where they are, which step of six, and since when');
  ok(john.studies.lastMet === iso(2026, 10, 1) && john.studies.upcoming === 1 && john.lessons.open === 1,
     'with their last Bible study, the next one, and what is still open');
  ok(john.attention.includes('1 follow-up overdue'), 'an overdue follow-up needs attention');
  ok(r.explorers.find((e) => e.explorer === 'Ruth Bell').attention.includes('Paused'), 'so does a paused pairing');
  const grace = r.explorers.find((e) => e.explorer === 'Grace Lim');
  ok(grace.isNew && grace.attention.length === 0, 'somebody paired yesterday is new, and not yet a worry');
  ok(t.needingAttention === 2 && r.explorers[r.explorers.length - 1].explorer === 'Grace Lim',
     'those needing attention come first');

  const lastMonth = S.buildProgress(guideIn, 'last-month', now);
  ok(lastMonth.explorers.length === 2 && lastMonth.totals.stepsForward === 2 && lastMonth.totals.studiesHeld === 1,
     'last month counts last month: two stages reached, one study, and nobody paired after it ended');
  const quiet = S.buildProgress({ ...guideIn, meetings: [{ pairing_id: 'p1', at: iso(2026, 8, 10), held: true, cancelled: false }] }, 'this-month', now);
  ok(quiet.explorers.find((e) => e.explorer === 'John Reyes').attention.some((a) => /^No Bible study for \d+ days$/.test(a)),
     `no Bible study for over ${S.QUIET_DAYS} days needs attention`);
}

// ---------------------------------------------------------------------------
// 3. LEADERSHIP'S REPORT: EVERY EXPLORER, STAGES ONLY
// ---------------------------------------------------------------------------
{
  const r = S.buildProgress({ ...base, me: 'adm', scope: 'church' }, 'this-month', now);
  ok(r.scope === 'church' && !r.detailed && r.explorers.length === 4, 'leadership sees every Explorer in the church, archived pairings aside');
  ok(r.explorers.every((e) => e.studies === undefined && e.lessons === undefined && e.followUps === undefined)
     && r.totals.studiesHeld === undefined,
     'and nothing from inside a pairing: meetings, lessons and follow-ups are not counted, not shown as zero');
  const peter = r.explorers.find((e) => e.explorer === 'Peter Tan');
  ok(peter.guide === 'David Cruz' && peter.attention.some((a) => /^At Care for \d+ days$/.test(a)),
     `an Explorer at one stage for ${S.STILL_DAYS} days or more needs attention`);
  ok(r.byGuide.map((g) => `${g.guide}:${g.explorers}:${g.stepsForward}`).join(' ') === 'David Cruz:1:0 Maria Santos:3:1',
     'and each Guide is summed: how many, and how many moved');
  ok(r.byStage.map((s) => s.count).join('') === '111100', 'where everybody is, stage by stage: one each at Beginner, Connect, Care and Call');
  // Even handed meetings, a church-wide report does not use them.
  const handed = S.buildProgress({ ...guideIn, me: 'adm', scope: 'church' }, 'this-month', now);
  ok(!handed.detailed && handed.explorers.every((e) => e.studies === undefined), 'a church-wide report never counts inside a pairing, even when handed it');
}

// ---------------------------------------------------------------------------
// 4. TEXT AND THE WORD FILE
// ---------------------------------------------------------------------------
{
  const r = S.buildProgress(guideIn, 'this-month', now);
  const text = S.progressAsText(r, 'Grace SDA Church', 'Answered prayer for John\'s mother.\n\nPlan: visit Ruth.');
  ok(text.startsWith('Grace SDA Church\nProgress report · October 2026') && text.includes('- Bible studies held: 1')
     && text.includes('- Reached Call (point of decision): 1'),
     'the text opens with the church and the period, then the summary');
  ok(text.includes('- John Reyes: Call (step 4 of 6) since October 1, 2026') && text.includes('  Needs attention: 1 follow-up overdue'),
     'then each Explorer, and what needs attention');
  ok(text.endsWith('NOTES\nAnswered prayer for John\'s mother.\nPlan: visit Ruth.'), 'and the reader\'s own notes last');
  const church = S.progressAsText(S.buildProgress({ ...base, me: 'adm', scope: 'church' }, 'this-month', now), 'Grace SDA Church');
  ok(church.includes('BY GUIDE\n- David Cruz: 1 walked with') && !church.includes('Bible studies held'),
     'leadership\'s text has each Guide, and no counts it was not given');

  const bytes = S.progressToDocx(r, 'Grace SDA Church & Friends', 'Notes <here>', new Date(2026, 9, 2));
  const { files } = S.unzipVault(bytes);
  const parts = Object.fromEntries(files.map((f) => [f.path, f.text ?? new TextDecoder().decode(f.bytes)]));
  ok(files.length === 7 && files[0].path === '[Content_Types].xml', 'the Word file holds the seven parts, content types first');
  let wrong = [];
  try {
    wrong = [...misplacedIn(parseXml(parts['word/document.xml'])), ...misplacedIn(parseXml(parts['word/styles.xml']))];
    ok(true, 'its document and styles are well-formed XML');
  } catch (e) { ok(false, `its document and styles are well-formed XML (${e.message})`); }
  ok(wrong.length === 0, `every property is where Word's schema puts it${wrong.length ? `: ${wrong[0]}` : ''}`);
  const doc = parts['word/document.xml'];
  ok(doc.includes('Grace SDA Church &amp; Friends') && doc.includes('Notes &lt;here&gt;') && doc.includes('>Needs attention<'),
     'it carries the church, the notes and each Explorer, escaped');
  ok(!/Maria|John|Grace Lim/.test(parts['docProps/core.xml']), 'its own properties name no person');
  ok(S.progressFileName(r) === 'Progress-report-2026-10.docx'
     && S.progressFileName(S.buildProgress(guideIn, 'this-quarter', now)) === 'Progress-report-2026-Q4.docx',
     'the file is named for its month or quarter');
}

// ---------------------------------------------------------------------------
// 5. WHERE IT LIVES, AND WHAT IT ASKS FOR
// ---------------------------------------------------------------------------
{
  const office = code('app/office/page.tsx');
  ok((office.match(/\{ id: 'reports', label: '[^']*Reports' \}/g) ?? []).length === 3,
     'Reports is a folder for a Guide, for leadership and in the sample church');
  ok(/room === 'reports' && \(\s*<>\s*<LiveProgressReport/.test(office)
     && /\{leads && <LiveBoardReport/.test(office) && /\{leads && <LiveExport/.test(office),
     'the progress report opens it for everyone who works here; the board report and the export stay leadership\'s');
  ok(/room === 'reports' && <DemoProgressReport \/>/.test(office), 'and the sample church has it too');
  const loader = code('components/LiveProgressReport.tsx');
  ok(/useKeepUp\(KEEP_UP_PROGRESS, load\)/.test(loader), 'it keeps up while it is open');
  ok(/if \(!guide\) \{\s*setInput\(base\);\s*\} else \{[\s\S]*listMeetingTimes\(\)[\s\S]*listAssignments\(\)[\s\S]*listFollowUps\(\)/.test(loader),
     'leadership\'s report asks only for the journey: meetings, lessons and follow-ups are asked for a Guide only');
  ok(!/dangerouslySetInnerHTML/.test(code('components/ProgressReport.tsx')), 'names are drawn as text');
}

fs.rmSync(out, { recursive: true, force: true });
console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
