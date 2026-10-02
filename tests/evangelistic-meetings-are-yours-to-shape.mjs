// Evangelistic meetings: a series a church shapes its own way, kept on the
// device, taken away as a Word file or a picture, and shared as a post that
// never carries the team's own blocks.
//
// Asked for on 2 October 2026: "Make sure Evangelistic Meetings are super
// customizable, unlike Sabbath program it has a template that can put input,
// but for EMs users can have much more freedom to customise their meeting."
// The owner chose four freedoms (blocks, a list's own columns, many nights,
// the meeting's own look), kept on the device and shared as posts, for Guides
// and above.
//
//   node tests/evangelistic-meetings-are-yours-to-shape.mjs
//
// The browser half, a Guide shaping a series and an Explorer reading it with
// no signal, is tests/e2e/evangelistic-meetings-are-yours-to-shape.js.

import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
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

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-meetings-'));
const bundle = path.join(out, 'meetings.mjs');
await build({
  stdin: {
    contents: "export * from './lib/evangelistic-meeting';\nexport * from './lib/evangelistic-meeting-docx';\n"
      + "export * from './lib/evangelistic-meeting-picture';\n"
      + "export { readShared, isSharedProgram } from './lib/sabbath-program';\n"
      + "export { unzipVault } from './lib/study/obsidian';\n",
    resolveDir: root,
    loader: 'ts',
  },
  alias: { '@': root },
  outfile: bundle,
  bundle: true, format: 'esm', platform: 'node', target: 'es2020', logLevel: 'silent',
});
const S = await import(pathToFileURL(bundle).href);

const ids = (m) => [m.id, ...m.blocks.map((b) => b.id), ...m.nights.flatMap((n) => [n.id, ...n.blocks.map((b) => b.id)])];
const columnId = (block, name) => block.columns.find((c) => c.name === name)?.id;

// ---------------------------------------------------------------------------
// 1. A PLAN TO CHANGE, OR NOTHING AT ALL
// ---------------------------------------------------------------------------
const friday = new Date(2026, 9, 2, 10, 0, 0); // Friday 2 October 2026
ok(S.comingSunday(friday) === '2026-10-04', 'a series starts on the coming Sunday unless somebody says otherwise');
ok(S.comingSunday(new Date(2026, 9, 4, 20, 0)) === '2026-10-04', 'and on a Sunday, that Sunday');

const plan = S.plannedSeries('Grace SDA Church', '2026-10-30', 4);
ok(plan.nights.map((n) => n.date).join(' ') === '2026-10-30 2026-10-31 2026-11-01 2026-11-02',
   'a planned series has a night for each day, across the end of a month');
ok(plan.nights.every((n) => n.time === '7:00 PM' && n.blocks.length === 1 && n.blocks[0].kind === 'list'),
   'each night starts with the usual time and a program');
const program = plan.nights[0].blocks[0];
ok(program.columns.map((c) => c.name).join('|') === 'Time|What happens|Who' && program.rows.length === 8,
   'the program is a list with three named columns and the parts a night usually has');
ok(program.rows.every((r) => Object.keys(r.cells).length === 1 && r.cells[columnId(program, 'What happens')]),
   'with only what happens filled in: who leads is the church\'s to type');
ok(plan.blocks.map((b) => `${b.kind}:${b.title}:${b.teamOnly}`).join(' | ')
   === 'text:About the meetings:false | list:Team:false | checklist:Before the first night:true',
   'the series has a paragraph, its team, and a to-do list that is the team\'s only');
ok(!/\bNo\.\s*\d|\b#\s*\d/.test(JSON.stringify(plan)), 'no hymn numbers or titles are shipped');
ok(new Set(ids(plan)).size === ids(plan).length, 'every night and block has its own id');
ok(S.plannedSeries('', '2026-10-04', 0).nights.length === 1 && S.plannedSeries('', '2026-10-04', 99).nights.length === 31
   && S.plannedSeries('', '2026-10-04', 'many').nights.length === 1,
   'at least one night and at most 31, whatever is typed');
const blank = S.blankSeries('Grace SDA Church', '2026-10-04');
ok(blank.nights.length === 1 && blank.blocks.length === 0 && blank.nights[0].blocks.length === 0,
   'a blank start is one night with nothing on it');

// ---------------------------------------------------------------------------
// 2. BLOCKS, AND A LIST'S OWN COLUMNS
// ---------------------------------------------------------------------------
{
  const made = Object.fromEntries(S.BLOCK_CHOICES.map((c) => [c.key, S.newBlock(c.key)]));
  ok(made.program.kind === 'list' && made.team.columns.map((c) => c.name).join('|') === 'Role|Name'
     && made.schedule.columns.map((c) => c.name).join('|') === 'Date|Time|What',
     'a program, a team and a schedule are lists with their columns already named');
  ok(made.list.kind === 'list' && made.list.columns.length === 2 && made.list.columns.every((c) => !c.name),
     'a list of your own starts with two columns for you to name');
  ok(made.text.kind === 'text' && !made.text.teamOnly, 'a paragraph is shared unless you say');
  ok(made.checklist.kind === 'checklist' && made.checklist.teamOnly, 'a checklist is the team\'s until you say');

  const source = structuredClone(program);
  source.rows[0].cells[columnId(source, 'Who')] = 'David Cruz';
  const copy = S.cloneBlock(source);
  ok(copy.id !== source.id && copy.columns.every((c, i) => c.id !== source.columns[i].id)
     && copy.rows.every((r, i) => r.id !== source.rows[i].id),
     'a copied block has new ids throughout, so editing it cannot touch the original');
  ok(copy.rows[0].cells[columnId(copy, 'Who')] === 'David Cruz' && copy.rows[0].cells[columnId(copy, 'What happens')] === 'Song service',
     'and every line keeps what it said, under the new columns');
}

// ---------------------------------------------------------------------------
// 3. MANY NIGHTS
// ---------------------------------------------------------------------------
{
  const three = S.plannedSeries('Grace SDA Church', '2026-10-04', 3);
  three.nights[0].topic = 'The Blessed Hope';
  const copied = S.withNightCopied(three, three.nights[0].id);
  const added = copied.nights[3];
  ok(copied.nights.length === 4 && added.date === '2026-10-07',
     'copying a night adds it at the end, on the day after the last night, never on a day already taken');
  ok(added.topic === '' && added.blocks[0].id !== three.nights[0].blocks[0].id && added.blocks[0].rows.length === 8,
     'with the same blocks, new ids, and a topic still to choose');
  const full = { ...three, nights: Array.from({ length: 31 }, () => S.newNight('2026-10-04')) };
  ok(S.withNightCopied(full, full.nights[0].id).nights.length === 31, 'and never past 31 nights');
  ok(S.dayAfter('2026-12-31') === '2027-01-01' && S.dayAfter('') === '', 'the day after the last of the year is the first of the next');
}

// ---------------------------------------------------------------------------
// 4. WHAT COMES OUT OF STORAGE IS MADE SAFE BEFORE IT IS USED
// ---------------------------------------------------------------------------
{
  const RLO = String.fromCharCode(0x202e);
  const tidy = S.tidyMeeting({
    id: 'm', name: `Hope${RLO} for Today`, look: { colour: 'red; background:url(x)', headings: 'comic', align: 'right' },
    blocks: [
      { id: 'b1', kind: 'list', title: 'T', columns: [], rows: [{ id: 'r', cells: { ghost: 'x' } }] },
      { id: 'b2', kind: 'video', title: 'not a block' },
      { id: 'b3', kind: 'text', title: 'A', body: 'x'.repeat(9000) },
      { id: 'b4', kind: 'list', title: 'Wide', columns: Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `C${i}` })), rows: Array.from({ length: 80 }, (_, i) => ({ id: `r${i}`, cells: { c0: 'a', c8: 'gone' } })) },
      'junk',
    ],
    nights: [{ id: 'n', date: 'tomorrow', time: '7', topic: 't', blocks: null }, 5],
  });
  ok(tidy.name === 'Hope for Today', 'a character that reverses text is removed from what is stored');
  ok(tidy.look.colour === S.DEFAULT_LOOK.colour && tidy.look.headings === 'classic' && tidy.look.align === 'centre',
     'a colour that is not a colour, and a style that is not offered, fall back to the defaults');
  ok(tidy.blocks.length === 3 && tidy.blocks.every((b) => ['list', 'text', 'checklist'].includes(b.kind)),
     'a block of a kind that does not exist is dropped');
  ok(tidy.blocks[0].columns.length === 1 && Object.keys(tidy.blocks[0].rows[0].cells).length === 0,
     'a list always has a column, and a line keeps nothing under a column that is not there');
  ok(tidy.blocks[1].body.length === S.MEETING_LIMITS.text, 'a runaway paragraph is cut to its limit');
  ok(tidy.blocks[2].columns.length === 6 && tidy.blocks[2].rows.length === 60
     && tidy.blocks[2].rows.every((r) => r.cells.c0 === 'a' && !('c8' in r.cells)),
     'a list holds at most six columns and sixty lines');
  ok(tidy.nights.length === 1 && tidy.nights[0].date === '' && tidy.nights[0].blocks.length === 0,
     'a night with a bad date keeps no date, and anything that is not a night is dropped');
  ok(S.tidyMeeting(null) === null && S.tidyMeeting({ name: 'no id' }) === null, 'and anything that is not a meeting at all');
}

// ---------------------------------------------------------------------------
// 5. KEPT ON THIS DEVICE, ONE LIST PER ACCOUNT
// ---------------------------------------------------------------------------
{
  const shelf = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (shelf.has(k) ? shelf.get(k) : null),
      setItem: (k, v) => { shelf.set(k, String(v)); },
    },
  };
  ok(S.meetingsKey('maria') !== S.meetingsKey('pastor'), 'two people on one computer keep two lists');
  ok(S.saveMeetings('maria', [plan]) && S.loadMeetings('maria').length === 1 && S.loadMeetings('pastor').length === 0,
     'meetings are kept and read back, by their own account only');
  shelf.set(S.meetingsKey('maria'), '{ not json');
  ok(S.loadMeetings('maria').length === 0, 'a damaged list reads as empty rather than taking the room down');

  const post = (id, at, title = `${S.MEETING_PREFIX}Hope`) => ({ id, title, body: 'x', from: 'Maria Santos', at });
  ok(S.saveReceivedMeetings('john', [post('a', '2026-10-01'), post('b', '2026-10-03'), post('c', '2026-10-02', 'Sabbath program · Sabbath, October 3, 2026')]),
     'meetings shared with somebody are kept on their phone');
  ok(S.loadReceivedMeetings('john').map((p) => p.id).join('') === 'ba', 'newest first, and only posts that are meetings');
  S.saveReceivedMeetings('john', Array.from({ length: 30 }, (_, i) => post(`p${i}`, `2026-10-${String(i + 1).padStart(2, '0')}`)));
  ok(S.loadReceivedMeetings('john').length === 20 && S.loadReceivedMeetings('john')[0].id === 'p29',
     'the newest twenty are kept');
  globalThis.window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  ok(S.saveMeetings('maria', [plan]) === false, 'and a browser that will not save says so, so the screen can');
  delete globalThis.window;
}

// ---------------------------------------------------------------------------
// 6. ITS OWN LOOK, READABLE WHATEVER IS CHOSEN
// ---------------------------------------------------------------------------
ok(Math.round(S.contrastOnWhite('#000000')) === 21 && Math.round(S.contrastOnWhite('#ffffff')) === 1,
   'contrast is measured the WCAG way');
ok(S.COLOURS.every((c) => S.contrastOnWhite(c.hex) >= 7), 'every offered colour reads as words on white at 7:1 or better');
ok(S.wordColour({ ...S.DEFAULT_LOOK, colour: '#ffe066' }) === S.INK && S.wordColour({ ...S.DEFAULT_LOOK, colour: '#1f5130' }) === '#1f5130',
   'a pale colour of a church\'s own draws lines, and the words stay in ink');
ok(S.hexColour('#1F5130') === '#1f5130' && S.hexColour('red') === null && S.hexColour('#12345') === null,
   'only a six-digit colour is a colour');
ok(Object.values(S.HEADING_FACES).map((f) => f.word).join(' ') === 'Georgia Arial Verdana',
   'the heading faces are ones every computer already has: nothing to fetch or license');

// ---------------------------------------------------------------------------
// THE SERIES THE REST OF THIS FILE USES
// ---------------------------------------------------------------------------
const m = S.plannedSeries('Grace SDA Church', '2026-10-04', 3);
m.name = 'Hope & Healing "2026" <Riverside>';
m.place = 'Riverside Hall';
m.tagline = 'All are welcome';
m.look = { colour: '#1f5130', headings: 'clean', align: 'left' };
m.blocks[0].body = 'Three nights of hope.\n\nBring a friend.';
m.blocks[1].rows[0].cells[columnId(m.blocks[1], 'Name')] = 'Pastor Ramos';
m.blocks[2].items[0].done = true;
const n1 = m.nights[0];
n1.topic = 'The Blessed Hope';
const prog = n1.blocks[0];
prog.columns.push({ id: 'song', name: 'Song' });
prog.rows[0].cells[columnId(prog, 'Time')] = '7:00 PM';
prog.rows[0].cells[columnId(prog, 'Who')] = 'David Cruz';
prog.rows[0].cells.song = 'Opening song';
prog.rows.push({ id: 'empty', cells: {} });
n1.blocks.unshift({ id: 'tonight', kind: 'text', title: 'Tonight', teamOnly: false, body: 'Doors open at 6:30.' });
n1.blocks.push({ id: 'drivers', kind: 'list', title: 'Drivers', teamOnly: true, columns: [{ id: 'd', name: 'Driver' }], rows: [{ id: 'r', cells: { d: 'Anna Yu drives the Tans' } }] });
const TEAM_ONLY = ['Book the place', 'Anna Yu drives the Tans'];

// ---------------------------------------------------------------------------
// 7. TEXT FOR A GROUP CHAT AND FOR A POST
// ---------------------------------------------------------------------------
{
  const series = S.meetingAsText(m, null);
  ok(series.startsWith('Hope & Healing "2026" <Riverside>\nGrace SDA Church · Riverside Hall\nSunday, October 4, 2026 to Tuesday, October 6, 2026\nAll are welcome'),
     'the series opens with its name, where, its dates and its line');
  ok(series.includes('ABOUT THE MEETINGS\nThree nights of hope.\nBring a friend.') && series.includes('TEAM\n- Speaker · Pastor Ramos'),
     'its own blocks follow, each under its heading');
  ok(series.includes('THE NIGHTS\n- Night 1 · Sunday, October 4, 2026, 7:00 PM: The Blessed Hope\n- Night 2 · Monday, October 5, 2026, 7:00 PM'),
     'and every night at a glance');
  ok(TEAM_ONLY.every((t) => !series.includes(t)), 'what is shared never has a team-only block');
  const night = S.meetingAsText(m, n1.id);
  ok(night.includes('Night 1 · Sunday, October 4, 2026 · 7:00 PM\nTopic: The Blessed Hope'), 'one night says which, when and its topic');
  ok(night.indexOf('TONIGHT') < night.indexOf('PROGRAM') && night.includes('- 7:00 PM · Song service · David Cruz · Opening song'),
     'its blocks come in the order arranged, and a line has every column, her own included');
  ok(!night.includes('- \n') && !/\n- $/.test(night), 'an empty line is left out');
  ok(TEAM_ONLY.every((t) => !night.includes(t)), 'and a night shared never has its team-only block either');
  const team = S.meetingAsText(m, null, 'team');
  ok(team.includes('Team copy, with every block') && team.includes('BEFORE THE FIRST NIGHT (TEAM ONLY)\n- Book the place (done)'),
     'the team\'s copy has everything, marked, with what is done');
  const view = S.readShared(night);
  ok(view.head[0] === m.name && view.parts.map((p) => p.heading).join('|') === 'TONIGHT|PROGRAM'
     && view.parts[1].items[0] === '7:00 PM · Song service · David Cruz · Opening song',
     'This Sabbath reads a shared night back into its head, headings and lines');
  ok(S.meetingShareTitle(m, n1.id) === `${S.MEETING_PREFIX}${m.name} · Night 1, Sunday, October 4, 2026`
     && S.isSharedMeeting(S.meetingShareTitle(m, null)) && !S.isSharedProgram(S.meetingShareTitle(m, null))
     && !S.isSharedMeeting('Sabbath program · Sabbath, October 3, 2026'),
     'a shared meeting\'s post is titled so This Sabbath can tell it from a Sabbath program');
}

// ---------------------------------------------------------------------------
// 8. THE WORD FILE
// ---------------------------------------------------------------------------
const textOf = (xml) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((x) => x[1]).join('|')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const when = new Date(2026, 9, 2, 10, 0, 0);
const NAMES = ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml',
  'word/styles.xml', 'docProps/core.xml', 'docProps/app.xml'];
const docxFile = path.join(out, 'meetings.docx');
{
  const bytes = S.meetingToDocx(m, null, 'shared', when);
  fs.writeFileSync(docxFile, bytes);
  const { files } = S.unzipVault(bytes);
  const parts = Object.fromEntries(files.map((f) => [f.path, f.text ?? new TextDecoder().decode(f.bytes)]));
  ok(NAMES.every((n) => n in parts) && files.length === NAMES.length && files[0].path === '[Content_Types].xml',
     `the zip holds the ${NAMES.length} parts of a Word document, content types first`);
  const misplaced = [];
  for (const n of NAMES) {
    try {
      const tree = parseXml(parts[n]);
      if (n === 'word/document.xml' || n === 'word/styles.xml') misplaced.push(...misplacedIn(tree));
    } catch (e) { ok(false, `${n} is well-formed XML (${e.message})`); }
  }
  ok(misplaced.length === 0, `every property is where Word's schema puts it${misplaced.length ? `: ${misplaced.slice(0, 3).join('; ')}` : ''}`);
  for (const [scope, copy] of [[n1.id, 'shared'], [null, 'team'], [n1.id, 'team']]) {
    let wrong = [];
    try { wrong = misplacedIn(parseXml(S.meetingDocumentXml(m, scope, copy))); } catch (e) { wrong = [e.message]; }
    ok(wrong.length === 0, `and so is the ${scope ? 'night' : 'series'} file, ${copy === 'team' ? 'the team\'s copy' : 'as shared'}${wrong.length ? `: ${wrong[0]}` : ''}`);
  }

  const doc = parts['word/document.xml'];
  const words = textOf(doc);
  ok(words.startsWith('Hope & Healing "2026" <Riverside>|Grace SDA Church · Riverside Hall'),
     'the file opens with its name and where, an ampersand, quotes and angle brackets as typed');
  ok(words.includes('Night 1 · Sunday, October 4, 2026 · 7:00 PM|The Blessed Hope|Tonight|Doors open at 6:30.'),
     'the whole series has every night in full, its topic, and its blocks in order');
  const firstTable = doc.slice(doc.indexOf('<w:tbl>'), doc.indexOf('</w:tbl>'));
  const programTable = doc.slice(doc.indexOf('<w:tbl>', doc.indexOf('The Blessed Hope')));
  const grid = [...programTable.slice(0, programTable.indexOf('</w:tblGrid>')).matchAll(/w:gridCol w:w="(\d+)"/g)].map((x) => Number(x[1]));
  ok(grid.length === 4 && grid.reduce((a, b) => a + b, 0) === 9638,
     `a list with four columns is a table of four, sharing the page exactly (${grid.join(' + ')})`);
  ok(/<w:trPr><w:cantSplit\/><w:tblHeader\/><\/w:trPr>/.test(firstTable) && textOf(programTable).startsWith('Time|What happens|Who|Song'),
     'its column names head it, and repeat when it runs onto another page');
  ok(TEAM_ONLY.every((t) => !words.includes(t)), 'what is shared has no team-only block');
  const teamWords = textOf(S.meetingDocumentXml(m, null, 'team'));
  ok(TEAM_ONLY.every((t) => teamWords.includes(t)) && teamWords.includes('team only') && teamWords.includes('\u2611  Book the place'),
     'the team\'s copy has them, marked, with what is done ticked');
  const nightWords = textOf(S.meetingDocumentXml(m, n1.id));
  ok(nightWords.includes('Night 1 · Sunday, October 4, 2026 · 7:00 PM') && !nightWords.includes('Night 2'),
     'one night\'s file is that night only');
  ok(/<w:p><\/w:p><w:sectPr>/.test(doc), 'the body ends with a paragraph, so Word has nothing to repair');

  const styles = parts['word/styles.xml'];
  ok(/w:styleId="Title">[\s\S]*?<w:jc w:val="left"\/>[\s\S]*?<w:rFonts w:ascii="Arial"[\s\S]*?<w:color w:val="1F5130"\/>/.test(styles),
     'the title is in her colour and heading face, on the left');
  ok(/w:styleId="Heading1">[\s\S]*?w:color="1F5130"[\s\S]*?<w:color w:val="1F5130"\/>/.test(styles), 'and so are the headings and their rules');
  const pale = S.meetingStylesXml({ ...m, look: { colour: '#ffe066', headings: 'friendly', align: 'centre' } });
  ok(pale.includes('w:color="FFE066"') && !pale.includes('<w:color w:val="FFE066"/>') && pale.includes('<w:color w:val="1F2937"/>')
     && pale.includes('w:ascii="Verdana"') && pale.includes('<w:jc w:val="center"/>'),
     'a pale colour draws the rules only; the words are in ink');
  const core = parts['docProps/core.xml'];
  ok(/<dc:title>Hope &amp; Healing &quot;2026&quot; &lt;Riverside&gt;<\/dc:title>/.test(core)
     && !/Maria|Pastor|David/.test(core), 'the file is titled for the meetings and names the app, not a person');

  ok(S.meetingFileName(m, null) === 'Hope-Healing-2026-Riverside.docx'
     && S.meetingFileName(m, n1.id, 'team') === 'Hope-Healing-2026-Riverside-night-1-team.docx'
     && S.meetingFileName(m, n1.id, 'shared', 'png') === 'Hope-Healing-2026-Riverside-night-1.png'
     && S.meetingFileName({ ...m, name: '' }, null) === 'Evangelistic-meetings.docx',
     'each file is named for what is in it, safely for any computer');
}

// Two readers that are not ours.
const have = (tool) => {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [tool], { stdio: 'ignore' });
    return true;
  } catch { return false; }
};
if (process.platform === 'win32') {
  console.log('SKIP  Info-ZIP and Python are not on a Windows runner; the format checks above still ran');
} else {
  const ask = (tool, args) => {
    try { return execFileSync(tool, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { return `refused: ${String(e.stderr || e.message).split('\n').filter(Boolean).pop()}`; }
  };
  ok(have('unzip') && /No errors detected/.test(ask('unzip', ['-t', docxFile])), 'unzip -t: every part arrives whole');
  const said = have('python3') ? ask('python3', ['-c', [
    'import sys, zipfile, xml.dom.minidom as m',
    'z = zipfile.ZipFile(sys.argv[1])',
    'assert z.testzip() is None',
    'for n in z.namelist(): m.parseString(z.read(n))',
    'print(len(z.namelist()))',
  ].join('\n'), docxFile]).trim() : 'no python3';
  ok(said === String(NAMES.length), `Python opens the zip and parses all ${NAMES.length} parts as XML${said === String(NAMES.length) ? '' : ` (${said})`}`);
}

// ---------------------------------------------------------------------------
// 9. THE PICTURE, BY WHAT IT DRAWS
// ---------------------------------------------------------------------------
/** Every piece of text the picture would draw, and the colours it fills with, read off a stand-in canvas. */
function drawn(meeting, nightId) {
  const words = [];
  const inks = []; // the colour each piece of text is drawn in, beside it in `words`
  const fills = []; // every colour used at all, text and shapes
  const ctx = {
    font: '', fillStyle: '', textAlign: '', textBaseline: '',
    measureText: (t) => ({ width: t.length * 18 }),
    fillText(t) { words.push(t); inks.push(this.fillStyle); fills.push(this.fillStyle); },
    fillRect() { fills.push(this.fillStyle); },
    scale() {},
  };
  S.drawMeeting(meeting, nightId, { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
  return { words, inks, fills };
}
{
  const night = drawn(m, n1.id);
  ok(night.words.includes('Night 1 · Sunday, October 4, 2026 · 7:00 PM') && night.words.includes('The Blessed Hope')
     && night.words.includes('Tonight') && night.words.includes('7:00 PM')
     // The right-hand column wraps in the pretend font, so read its pieces back together.
     && night.words.join(' ').includes('Song service · David Cruz · Opening song'),
     'a night\'s picture has its date, topic, blocks, and each line: the first column bold, the rest beside it');
  ok(night.fills.includes('#1f5130'), 'and is drawn in her colour');
  const series = drawn(m, null);
  ok(series.words.includes('The nights') && series.words.includes('Night 3') && series.words.includes('About the meetings'),
     'the series picture has its own blocks and every night at a glance');
  const all = [...night.words, ...series.words].join('\n');
  ok(night.words.length > 10 && TEAM_ONLY.every((t) => !all.includes(t)), 'a team-only block is never drawn');
  const pale = drawn({ ...m, look: { ...m.look, colour: '#ffe066' } }, n1.id);
  // A block's heading is drawn in the meeting's colour when that colour can be read.
  ok(night.inks[night.words.indexOf('Tonight')] === '#1f5130', 'a readable colour draws the headings');
  ok(pale.fills.includes('#ffe066') && pale.inks[pale.words.indexOf('Tonight')] === S.INK
     && pale.inks[pale.words.indexOf(m.name)] === S.INK,
     'a pale colour draws the band and rules, never the words: the name and headings are in ink');
}

// ---------------------------------------------------------------------------
// 10. WHERE IT LIVES, WHO HAS IT, AND WHAT IT NEVER DOES
// ---------------------------------------------------------------------------
{
  const office = code('app/office/page.tsx');
  const offered = (office.match(/\{ id: 'evangelism', label: '[^']*Evangelistic meetings' \}/g) ?? []).length;
  ok(offered === 3, `the meetings are a folder for a Guide, for leadership and in the sample church (${offered} of 3)`);
  ok(/room === 'evangelism' && \(\s*<EvangelisticMeetings\s+owner=\{profile\.id\}/.test(office)
     && /room === 'evangelism' && \(\s*<EvangelisticMeetings\s+owner=\{`sample:\$\{currentUser\?\.id/.test(office),
     'each account keeps its own meetings, in a church\'s own app and in the sample church');
  ok(/<EvangelisticMeetings owner=\{owner\}/.test(code('components/ThisSabbath.tsx'))
     && /LEADS_THE_WORK\.includes\(role\)/.test(code('components/ThisSabbath.tsx')),
     'Guides and leaders can plan on This Sabbath too, with no signal');
  const page = code('app/sabbath/page.tsx');
  ok(/isSharedMeeting\(p\.title\)/.test(page) && /saveReceivedMeetings\(profile\.id, series\)/.test(page)
     && /saveReceivedMeetings\(owner, meetings\)/.test(page),
     'shared meetings are read from the feed and kept on the phone, in both halves');
  ok(/received=\{received\} meetings=\{meetings\} \/>/.test(page), 'and shown with no signal');

  const tool = ['components/EvangelisticMeetings.tsx', 'lib/evangelistic-meeting.ts', 'lib/evangelistic-meeting-docx.ts',
    'lib/evangelistic-meeting-picture.ts'].map(code).join('\n');
  ok(!/@\/lib\/live|supabase|fetch\(|XMLHttpRequest|sendBeacon/.test(tool),
     'nothing in it talks to the database or the network itself: a series leaves the device only by Post it, through the page');
  ok(!/dangerouslySetInnerHTML/.test(tool + code('components/ThisSabbath.tsx')), 'a shared meeting is drawn as text, never as markup');
  const editor = code('components/EvangelisticMeetings.tsx');
  ok(/const body = meetingAsText\(m, nightId, 'shared'\)/.test(editor)
     && /share\(\{ title: meetingShareTitle\(m, nightId\), body, audience \}\)/.test(editor),
     'Post it always sends what is shared, never the team\'s copy');
  ok(/meetingPicture\(m, nightId\)/.test(editor) && !/'team'/.test(code('lib/evangelistic-meeting-picture.ts')),
     'and the picture can only ever be what is shared');
  ok(/style=\{\{ background: c\.hex \}\}/.test(editor) && /hexColour\(e\.target\.value\)/.test(editor),
     'a colour reaches the page only as a checked six-digit colour');
}

fs.rmSync(out, { recursive: true, force: true });
console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
