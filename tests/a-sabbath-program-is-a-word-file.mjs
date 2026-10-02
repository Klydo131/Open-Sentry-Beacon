// The Sabbath program: its template, its dates, what it keeps, and a Word file
// that Word will open.
//
// ---------------------------------------------------------------------------
// Asked for on 2 October 2026: Guides and every rank above them can make their
// own Sabbath program in the Office and download it "to words or docs". The
// owner chose to keep programs on the device, and to start from four parts:
// Sabbath School, the Divine Service, the afternoon program and sunset vespers.
//
// THE FILE IS CHECKED BY THINGS THAT ARE NOT OURS. A Word file written by hand
// is exactly the kind of thing that reads back perfectly through its own code
// and is refused by Word, so:
//
//   * every XML part is parsed, and every property list is held to the order
//     the Word schema gives (an element out of order is what makes Word call
//     the whole file "unreadable content");
//   * Info-ZIP and Python are asked whether the zip is a zip and whether each
//     part is XML, as tests/a-room-can-become-a-vault.mjs does for its zip.
//
// Opening it in Word itself, Google Docs and Pages cannot happen here; that is
// said wherever this work is reported.
//
// SECTIONS 9 TO 13 came the same day with the second request: Advanced
// settings (times, notes for the platform, templates, reminders), sharing with
// Explorers in the app, a picture for group chats and Canva, and This Sabbath,
// which works with no signal. The privacy rule they all share is checked last:
// a note for the platform never leaves the device by any of the ways out.
//
//   node tests/a-sabbath-program-is-a-word-file.mjs
// ---------------------------------------------------------------------------
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-sabbath-'));
const bundle = path.join(out, 'sabbath.mjs');
await build({
  stdin: {
    contents: "export * from './lib/sabbath-program';\nexport * from './lib/sabbath-program-docx';\n"
      + "export * from './lib/sabbath-program-picture';\n"
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
// 1. THE TEMPLATE IS THE ONE THE OWNER CHOSE
// ---------------------------------------------------------------------------
const friday = new Date(2026, 9, 2, 10, 0, 0); // Friday 2 October 2026
const p0 = S.fromTemplate('Grace SDA Church', friday);
ok(p0.sections.map((s) => s.title).join(' | ')
   === 'Sabbath School | Divine Service | Afternoon program (AY) | Sunset vespers',
   'a new program starts with the four parts the owner chose, in the order the day runs');
ok(p0.sections[1].lines.some((l) => l.part === 'Sermon')
   && p0.sections[0].lines.some((l) => l.part === 'Mission story'),
   'with the lines a Sabbath actually has');
ok(p0.sections.every((s) => s.lines.every((l) => !l.detail && !l.who)),
   'and nobody named in advance: the names are the church\'s to type');
ok(!/\b(No\.|#)\s*\d/.test(JSON.stringify(S.TEMPLATE)),
   'no hymn numbers or titles are shipped; every church has its own hymnal');
ok(p0.church === 'Grace SDA Church', 'the church is filled in from the church\'s own name');
ok(new Set([p0.id, ...p0.sections.map((s) => s.id), ...p0.sections.flatMap((s) => s.lines.map((l) => l.id))]).size
   === 1 + p0.sections.length + p0.sections.reduce((n, s) => n + s.lines.length, 0),
   'every part and line has its own id, so moving one cannot move another');

// ---------------------------------------------------------------------------
// 2. THE SABBATH IS A SATURDAY, WHATEVER THE TIME ZONE
// ---------------------------------------------------------------------------
ok(S.nextSabbath(friday) === '2026-10-03', 'made on a Friday, it is for the next day');
ok(S.nextSabbath(new Date(2026, 9, 3, 23, 30)) === '2026-10-03', 'made on the Sabbath itself, it is for today');
ok(S.nextSabbath(new Date(2026, 9, 4, 0, 5)) === '2026-10-10', 'made on a Sunday, it is for the coming week');
ok(S.dateLabel('2026-10-03') === 'Sabbath, October 3, 2026', 'the Sabbath is called the Sabbath');
ok(S.dateLabel('2026-10-04') === 'Sunday, October 4, 2026', 'any other day is called by its own name');
ok(S.dateLabel('') === '' && S.dateLabel('soon') === '', 'and no date is no date, not "Invalid Date"');
const reused = S.copyForNextSabbath({ ...p0, theme: 'Rest' }, friday);
ok(reused.date === '2026-10-10' && reused.id !== p0.id && reused.theme === 'Rest',
   'reusing a program keeps every part and moves it to the following Sabbath');
ok(reused.sections.every((s, i) => s.id !== p0.sections[i].id),
   'and its parts are new, so editing the copy cannot touch last week\'s');

// ---------------------------------------------------------------------------
// 3. WHAT COMES OUT OF STORAGE IS MADE SAFE BEFORE IT IS USED
// ---------------------------------------------------------------------------
const RLO = String.fromCharCode(0x202e); // reverses the text after it
const NUL = String.fromCharCode(0);
const tidy = S.tidyProgram({
  id: 'x', church: `Grace${RLO} SDA`, date: 'not a date', theme: 'a'.repeat(5000),
  sections: [
    { id: 's', title: 'Sabbath School', time: '9:00', lines: [{ id: 'l', part: `Hymn${NUL}`, detail: 'No. 1\nPraise', who: 'Ana' }, null, 7] },
    'not a section',
  ],
  notes: `one\r\ntwo${RLO}`,
});
ok(tidy && tidy.church === 'Grace SDA', 'a character that reverses text is removed: it could print one name as another');
ok(tidy.sections[0].lines[0].part === 'Hymn', 'so is a control character, which XML refuses outright');
ok(tidy.sections[0].lines[0].detail === 'No. 1 Praise', 'a one-line field stays one line');
ok(tidy.notes === 'one\ntwo', 'announcements keep their lines, without Windows line endings or hidden marks');
ok(tidy.date === '' && tidy.theme.length === S.LIMITS.theme, 'a bad date is dropped and a runaway field is cut');
ok(tidy.sections.length === 1 && tidy.sections[0].lines.length === 1, 'anything that is not a part or a line is dropped');
ok(S.tidyProgram(null) === null && S.tidyProgram({ church: 'no id' }) === null, 'and anything that is not a program at all');

// ---------------------------------------------------------------------------
// 4. KEPT ON THIS DEVICE, ONE LIST PER ACCOUNT
// ---------------------------------------------------------------------------
{
  const shelf = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (k) => (shelf.has(k) ? shelf.get(k) : null),
      setItem: (k, v) => { shelf.set(k, String(v)); },
    },
  };
  ok(S.programsKey('maria') !== S.programsKey('pastor'), 'two people on one computer keep two lists');
  ok(S.savePrograms('maria', [p0]) === true && S.loadPrograms('maria').length === 1, 'a program is kept and read back');
  ok(S.loadPrograms('pastor').length === 0, 'and the next person to sign in on that computer does not see it');
  shelf.set(S.programsKey('maria'), '{ not json');
  ok(S.loadPrograms('maria').length === 0, 'a damaged list reads as empty rather than taking the room down');
  globalThis.window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  ok(S.savePrograms('maria', [p0]) === false, 'and a browser that will not save says so, so the screen can');
  delete globalThis.window;
}

// ---------------------------------------------------------------------------
// 5. TEXT FOR A GROUP CHAT
// ---------------------------------------------------------------------------
const filled = structuredClone(p0);
filled.theme = 'Rest & renewal: "Come to me" <Matthew 11:28>';
filled.sections[0].time = '9:00 AM';
filled.sections[0].lines[1] = { ...filled.sections[0].lines[1], detail: 'No. 12, Holy, Holy, Holy', who: 'Maria Santos' };
filled.sections[1].lines[8] = { ...filled.sections[1].lines[8], detail: 'The rest that remains', who: 'Pastor Ramos' };
filled.sections[3].lines = [{ id: 'gap', part: '', detail: '', who: '' }];
filled.notes = 'Fellowship lunch after the service\n\nChoir practice at 4:00 PM';
const text = S.programAsText(filled);
ok(text.startsWith('Grace SDA Church\nSabbath, October 3, 2026\nTheme: Rest'), 'it opens with the church, the day and the theme');
ok(text.includes('SABBATH SCHOOL · 9:00 AM') && text.includes('- Opening hymn: No. 12, Holy, Holy, Holy (Maria Santos)'),
   'each part is headed and each line says what, which and who');
ok(!text.includes('SUNSET VESPERS'), 'a part with nothing in it is left out rather than printed empty');
ok(text.endsWith('ANNOUNCEMENTS\n- Fellowship lunch after the service\n- Choir practice at 4:00 PM'),
   'announcements come last, one to a line, blank lines dropped');

// ---------------------------------------------------------------------------
// 6. THE WORD FILE
// ---------------------------------------------------------------------------
const when = new Date(2026, 9, 2, 10, 0, 0);
const bytes = S.programToDocx(filled, when);
const docxFile = path.join(out, S.programFileName(filled));
fs.writeFileSync(docxFile, bytes);
ok(S.programFileName(filled) === 'Sabbath-program-2026-10-03.docx', 'the file is named for its Sabbath');
ok(S.programFileName({ ...filled, date: '' }) === 'Sabbath-program-undated.docx', 'and a program with no date still gets a name');

const { files } = S.unzipVault(bytes);
const parts = Object.fromEntries(files.map((f) => [f.path, f.text ?? new TextDecoder().decode(f.bytes)]));
const NAMES = ['[Content_Types].xml', '_rels/.rels', 'word/_rels/document.xml.rels', 'word/document.xml',
  'word/styles.xml', 'docProps/core.xml', 'docProps/app.xml'];
ok(NAMES.every((n) => n in parts) && files.length === NAMES.length, `the zip holds the ${NAMES.length} parts of a Word document`);
ok(files[0].path === '[Content_Types].xml', 'content types first, where Word looks for them');

/** Parse XML far enough to check it: well-formed, one root, and each element's children in order. */
function parseXml(xml) {
  const top = { name: '#document', children: [] };
  const stack = [top];
  const re = /<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*(\/?)>|([^<]+)|</g;
  let m;
  while ((m = re.exec(xml))) {
    if (m[0].startsWith('<?')) continue;
    if (m[0] === '<') throw new Error(`a "<" that starts no tag, at ${m.index}`);
    if (m[5] !== undefined) {
      if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(m[5])) throw new Error(`a bare "&" at ${m.index}`);
      if (stack.length === 1 && m[5].trim()) throw new Error('text outside the root element');
      continue;
    }
    const [, close, name, attrs, self] = m;
    if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/.test(attrs)) throw new Error(`a bare "&" in <${name}>`);
    if (close) {
      const open = stack.pop();
      if (open.name !== name) throw new Error(`</${name}> closes <${open.name}>`);
    } else {
      const el = { name, children: [] };
      stack[stack.length - 1].children.push(el);
      if (!self) stack.push(el);
    }
  }
  if (stack.length !== 1) throw new Error(`<${stack[stack.length - 1].name}> is never closed`);
  if (top.children.length !== 1) throw new Error('not exactly one root element');
  return top.children[0];
}

const trees = {};
for (const n of NAMES) {
  try { trees[n] = parseXml(parts[n]); ok(true, `${n} is well-formed XML`); }
  catch (e) { ok(false, `${n} is well-formed XML (${e.message})`); }
}

// THE ORDER WORD INSISTS ON, from the schema (ECMA-376, WordprocessingML).
// Only the lists this file writes are here; an element that is not on its
// list fails as well, so a new property cannot be added without being placed.
const ORDER = {
  'w:pPr': ['pStyle', 'keepNext', 'keepLines', 'pageBreakBefore', 'framePr', 'widowControl', 'numPr',
    'suppressLineNumbers', 'pBdr', 'shd', 'tabs', 'suppressAutoHyphens', 'kinsoku', 'wordWrap',
    'overflowPunct', 'topLinePunct', 'autoSpaceDE', 'autoSpaceDN', 'bidi', 'adjustRightInd', 'snapToGrid',
    'spacing', 'ind', 'contextualSpacing', 'mirrorIndents', 'suppressOverlap', 'jc', 'textDirection',
    'textAlignment', 'textboxTightWrap', 'outlineLvl', 'divId', 'cnfStyle', 'rPr', 'sectPr', 'pPrChange'],
  'w:rPr': ['rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike', 'dstrike', 'outline',
    'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid', 'vanish', 'webHidden', 'color', 'spacing', 'w',
    'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl',
    'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'],
  'w:tblPr': ['tblStyle', 'tblpPr', 'tblOverlap', 'bidiVisual', 'tblStyleRowBandSize', 'tblStyleColBandSize',
    'tblW', 'jc', 'tblCellSpacing', 'tblInd', 'tblBorders', 'shd', 'tblLayout', 'tblCellMar', 'tblLook'],
  'w:tblBorders': ['top', 'left', 'start', 'bottom', 'right', 'end', 'insideH', 'insideV'],
  'w:tblCellMar': ['top', 'left', 'start', 'bottom', 'right', 'end'],
  'w:pBdr': ['top', 'left', 'bottom', 'right', 'between', 'bar'],
  'w:tcPr': ['cnfStyle', 'tcW', 'gridSpan', 'hMerge', 'vMerge', 'tcBorders', 'shd', 'noWrap', 'tcMar',
    'textDirection', 'tcFitText', 'vAlign', 'hideMark'],
  'w:style': ['name', 'aliases', 'basedOn', 'next', 'link', 'autoRedefine', 'hidden', 'uiPriority', 'semiHidden',
    'unhideWhenUsed', 'qFormat', 'locked', 'personal', 'personalCompose', 'personalReply', 'rsid', 'pPr', 'rPr',
    'tblPr', 'trPr', 'tcPr', 'tblStylePr'],
  'w:sectPr': ['headerReference', 'footerReference', 'footnotePr', 'endnotePr', 'type', 'pgSz', 'pgMar'],
  'w:styles': ['docDefaults', 'latentStyles', 'style'],
  'w:docDefaults': ['rPrDefault', 'pPrDefault'],
  'w:tbl': ['tblPr', 'tblGrid', 'tr'],
  'w:tr': ['trPr', 'tc'],
  'w:tc': ['tcPr', 'p'],
  'w:p': ['pPr', 'r'],
  'w:r': ['rPr', 't'],
};
const misplaced = [];
const walk = (el) => {
  const order = ORDER[el.name];
  if (order) {
    let last = -1;
    for (const c of el.children) {
      const at = order.indexOf(c.name.replace(/^w:/, ''));
      if (at === -1) misplaced.push(`<${c.name}> is not allowed in <${el.name}>`);
      else if (at < last) misplaced.push(`<${c.name}> comes too late in <${el.name}>`);
      else last = at;
    }
  }
  el.children.forEach(walk);
};
if (trees['word/document.xml']) walk(trees['word/document.xml']);
if (trees['word/styles.xml']) walk(trees['word/styles.xml']);
ok(misplaced.length === 0, `every property is where Word's schema puts it${misplaced.length ? `: ${misplaced.slice(0, 3).join('; ')}` : ''}`);

const docXml = parts['word/document.xml'];
const documentXmlOf = (p) => S.documentXml(p);
const textOf = (xml) => [...xml.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('|')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const words = textOf(docXml);
ok(words.includes('Grace SDA Church') && words.includes('Sabbath, October 3, 2026'), 'the document opens with the church and the day');
ok(words.includes('Rest & renewal: "Come to me" <Matthew 11:28>'),
   'an ampersand, quotes and angle brackets arrive as typed, escaped on the way');
ok(/Opening hymn\|No\. 12, Holy, Holy, Holy\|Maria Santos/.test(words), 'a line is a row: what, which, and who');
ok((docXml.match(/<w:tbl>/g) ?? []).length === 3 && !words.includes('Sunset vespers'),
   'one table for each part with something in it; the empty part is left out, heading and all');
{
  const timed = structuredClone(filled);
  timed.sections[3].time = '5:45 PM';
  ok(textOf(documentXmlOf(timed)).includes('Sunset vespers'), 'but a part with a time is kept, even before its lines are written');
}
ok(/<w:pStyle w:val="Heading1"\/><\/w:pPr><w:r><w:t xml:space="preserve">Announcements/.test(docXml),
   'the announcements have a heading of their own');
ok(/<w:p><\/w:p><w:sectPr>/.test(docXml), 'the body ends with a paragraph, so Word has nothing to repair');
ok(/w:styleId="Heading1"><w:name w:val="heading 1"\/>/.test(parts['word/styles.xml']),
   'the heading style carries the name Word knows, so it shows in the navigation pane');

// Every part is declared, and every relationship points at a part that exists.
const declared = [...parts['[Content_Types].xml'].matchAll(/PartName="\/([^"]+)"/g)].map((m) => m[1]);
ok(['word/document.xml', 'word/styles.xml', 'docProps/core.xml', 'docProps/app.xml'].every((n) => declared.includes(n)),
   'every part has its content type');
const targets = [
  ...[...parts['_rels/.rels'].matchAll(/Target="([^"]+)"/g)].map((m) => m[1]),
  ...[...parts['word/_rels/document.xml.rels'].matchAll(/Target="([^"]+)"/g)].map((m) => `word/${m[1]}`),
];
ok(targets.length === 4 && targets.every((t) => t in parts), 'every relationship points at a part that is there');

// What the file says about itself. It gets forwarded; it must not carry who made it.
const core = parts['docProps/core.xml'];
ok(/<dc:title>Sabbath program, Sabbath, October 3, 2026<\/dc:title>/.test(core), 'the file is titled for its Sabbath');
ok(/<dc:creator>[^<]+<\/dc:creator>/.test(core) && !/Maria|Pastor/.test(core),
   'its author field names the app, not a person');
ok(/<dcterms:created xsi:type="dcterms:W3CDTF">\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ</.test(core),
   'its dates are in the one form Word accepts, without milliseconds');

// ---------------------------------------------------------------------------
// 7. TWO READERS THAT ARE NOT OURS
// ---------------------------------------------------------------------------
const have = (tool) => {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [tool], { stdio: 'ignore' });
    return true;
  } catch { return false; }
};
if (process.platform === 'win32') {
  console.log('SKIP  Info-ZIP and Python are not on a Windows runner; the format checks above still ran');
} else {
  ok(have('unzip'), 'Info-ZIP is on this machine to be asked');
  // A reader that refuses the file is a FAIL line, not a crash: the person
  // reading the output needs to see which reader said no.
  const ask = (tool, args) => {
    try { return execFileSync(tool, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { return `refused: ${String(e.stderr || e.message).split('\n').filter(Boolean).pop()}`; }
  };
  if (have('unzip')) {
    const said = ask('unzip', ['-t', docxFile]);
    ok(/No errors detected/.test(said), `unzip -t: every part arrives whole${/^refused/.test(said) ? ` (${said})` : ''}`);
  }
  ok(have('python3'), 'Python is on this machine to be asked');
  if (have('python3')) {
    const said = ask('python3', ['-c', [
      'import sys, zipfile, xml.dom.minidom as m',
      'z = zipfile.ZipFile(sys.argv[1])',
      'assert z.testzip() is None',
      'for n in z.namelist(): m.parseString(z.read(n))',
      'print(len(z.namelist()))',
    ].join('\n'), docxFile]).trim();
    ok(said === String(NAMES.length), `Python opens the zip and parses all ${NAMES.length} parts as XML${said === String(NAMES.length) ? '' : ` (${said})`}`);
  }
}

// ---------------------------------------------------------------------------
// 8. WHERE IT LIVES, WHO HAS IT, AND WHAT IT NEVER DOES
// ---------------------------------------------------------------------------
{
  const office = code('app/office/page.tsx');
  ok(/WORKERS: Role\[\] = \['executive', 'admin', 'dm'\]/.test(office),
     'the Office is for Guides, Directors and Executive Directors, and Explorers are sent home');
  const offered = (office.match(/\{ id: 'sabbath', label: '[^']*Sabbath program' \}/g) ?? []).length;
  ok(offered === 3, `the Sabbath program is a folder for a Guide, for leadership and in the sample church (${offered} of 3)`);
  ok(/room === 'sabbath' && \(?\s*<SabbathPrograms\s+owner=\{profile\.id\}/.test(office),
     'a church\'s own app keeps each account\'s programs under that account');
  ok(/owner=\{`sample:\$\{currentUser\?\.id/.test(office), 'and so does the sample church, apart from any real account');

  const tool = ['components/SabbathProgram.tsx', 'components/ThisSabbath.tsx', 'lib/sabbath-program.ts',
    'lib/sabbath-program-docx.ts', 'lib/sabbath-program-picture.ts'].map(code).join('\n');
  ok(!/@\/lib\/live|supabase|fetch\(|XMLHttpRequest|sendBeacon/.test(tool),
     'nothing in it talks to the database or the network itself: a program leaves the device only by Post it, through the page');
  ok(/aria-expanded=\{open\}/.test(code('components/SabbathProgram.tsx')),
     'a part of the day opens and shuts, so 28 lines are not one long scroll');
}

// ---------------------------------------------------------------------------
// 9. ADVANCED: TIMES, AND WHEN ONE PART RUNS INTO THE NEXT
// ---------------------------------------------------------------------------
{
  ok(S.parseClock('9:00 AM')?.minutes === 540 && S.parseClock('9:00 AM')?.twelve === true, '"9:00 AM" is nine in the morning');
  ok(S.parseClock('9am')?.minutes === 540 && S.parseClock('2:30 p.m.')?.minutes === 870, 'and so are "9am" and "2:30 p.m." in their own way');
  ok(S.parseClock('12:00 PM')?.minutes === 720 && S.parseClock('12:15 AM')?.minutes === 15, 'noon is noon and a quarter past midnight is not lunch');
  ok(S.parseClock('14:30')?.minutes === 870 && S.parseClock('14:30')?.twelve === false, 'a 24-hour time is read as one');
  ok(S.parseClock('9:00-10:15')?.minutes === 540, 'a range is read from its start');
  ok(['9', '', 'later', '25:00', '9:75', '13 PM'].every((t) => S.parseClock(t) === null),
     'and a bare number, a word, an hour past 23 or a minute past 59 is not a time');
  ok(S.formatClock(545, true) === '9:05 AM' && S.formatClock(545, false) === '9:05' && S.formatClock(735, true) === '12:15 PM',
     'a time is written back the way the church wrote its own');

  const t = structuredClone(p0);
  t.sections[0].time = '9:00 AM';
  t.sections[0].lines.forEach((l, i) => { l.minutes = i === 3 ? 0 : 10; });
  let plan = S.schedule(t.sections[0]);
  const ids = t.sections[0].lines.map((l) => l.id);
  ok(plan.startsById[ids[0]] === '9:00 AM' && plan.startsById[ids[2]] === '9:20 AM' && plan.startsById[ids[3]] === '9:30 AM',
     'each line starts when the lines before it are done');
  ok(!(ids[4] in plan.startsById) && plan.end === null,
     'and a line with no minutes stops the count: a guessed time is one somebody turns up for');
  t.sections[0].lines.forEach((l) => { l.minutes = 10; });
  plan = S.schedule(t.sections[0]);
  ok(plan.end === 540 + 80, 'with every line timed, the part knows when it ends');
  t.sections[1].time = '10:00 AM';
  const late = S.overruns(t);
  ok(late.length === 1 && late[0].part === 'Sabbath School' && late[0].next === 'Divine Service' && late[0].by === 20,
     'and a part that runs into the next one is said, with the minutes');
  t.sections[1].time = '10:30 AM';
  ok(S.overruns(t).length === 0, 'and nothing is said when it fits');
}

// ---------------------------------------------------------------------------
// 10. ADVANCED: REMINDERS, AND WHAT IS LEFT TO FILL
// ---------------------------------------------------------------------------
{
  const r = structuredClone(filled);
  r.sections[0].time = '9:00 AM';
  r.sections[0].lines[1].note = 'PRIVATE NOTE FOR THE PLATFORM';
  r.sections[1].lines[3] = { ...r.sections[1].lines[3], who: '  maria   santos ' };
  const people = S.peopleIn(r);
  const maria = people.find((x) => x.name === 'Maria Santos');
  ok(people.length === 2 && maria?.duties.length === 2,
     'one person named twice, spelt with different spaces and capitals, is one person with two parts');
  const text = S.reminderText(r, maria);
  ok(text.startsWith('Hi Maria Santos. A reminder for Sabbath, October 3, 2026 at Grace SDA Church:')
     && text.includes('- Opening hymn (No. 12, Holy, Holy, Holy), Sabbath School, 9:00 AM'),
     'a reminder says the day, the church, the part and the time');
  // 28 lines in the template; vespers' three were taken out above and its one
  // empty line has nothing to fill; three are named.
  ok(S.stillToFill(p0) === 28 && S.stillToFill(r) === 28 - 3 - 3,
     'what is left to fill counts the lines that say what happens but not who leads it');
}

// ---------------------------------------------------------------------------
// 11. THE TWO COPIES
// ---------------------------------------------------------------------------
const NOTE = 'PRIVATE NOTE FOR THE PLATFORM';
const two = structuredClone(filled);
two.sections[0].time = '9:00 AM';
two.sections[0].lines.forEach((l) => { l.minutes = 10; });
two.sections[0].lines[1].note = NOTE;
{
  const platformText = S.programAsText(two, 'platform');
  ok(platformText.includes(`Note: ${NOTE}`) && platformText.includes('- 9:10 AM  Opening hymn'),
     'the platform copy has each start time and the notes');
  ok(platformText.includes('SABBATH SCHOOL · 9:00 AM to 10:20 AM'), 'and says when each part ends');
  ok(!S.programAsText(two).includes(NOTE) && !S.programAsText(two).includes('9:10 AM'),
     'the congregation copy has neither');

  const platformXml = S.documentXml(two, 'platform');
  const congregationXml = S.documentXml(two, 'congregation');
  ok(platformXml.includes(`Note: ${NOTE}`) && platformXml.includes('9:10 AM'), 'and so does the platform Word file');
  ok(!congregationXml.includes(NOTE), 'the congregation Word file does not');
  ok(S.programFileName(two, 'platform') === 'Sabbath-program-2026-10-03-platform.docx', 'and the two files are not called the same thing');
  try {
    const tree = parseXml(platformXml);
    const before = misplaced.length;
    walk(tree);
    ok(misplaced.length === before, 'the platform file keeps to Word\'s order too');
  } catch (e) {
    ok(false, `the platform file is well-formed XML (${e.message})`);
  }
}

// ---------------------------------------------------------------------------
// 12. A CHURCH'S OWN TEMPLATES, AND WHAT IS SHARED WITH A PERSON
// ---------------------------------------------------------------------------
{
  const tpl = S.templateFrom(two, 'Communion Sabbath');
  const flat = JSON.stringify(tpl);
  ok(tpl.name === 'Communion Sabbath' && tpl.sections[0].time === '9:00 AM' && tpl.sections[0].lines[0].minutes === 10,
     'a template keeps the parts, their times and the minutes');
  ok(!/Maria Santos|Pastor Ramos|Holy, Holy|PRIVATE NOTE|Fellowship/.test(flat),
     'and never this week\'s names, details, notes or announcements');
  const fresh = S.fromOwnTemplate(tpl, 'Grace SDA Church', friday);
  ok(fresh.date === '2026-10-03' && fresh.sections[0].lines.every((l) => !l.who && !l.detail && !l.note) && fresh.sections[0].lines[1].minutes === 10,
     'a program started from it is for the coming Sabbath, empty of names, with its minutes');
  ok(S.tidyTemplate({ id: 'x', name: 'Empty', sections: [] }) === null && S.tidyTemplate('nope') === null,
     'a template with nothing in it is not kept');

  const title = S.shareTitle(two);
  ok(title === 'Sabbath program · Sabbath, October 3, 2026' && S.isSharedProgram(title) && !S.isSharedProgram('Sabbath thoughts'),
     'a shared program is a post with a title This Sabbath can recognise');
  ok(S.sharedDate(title) === '2026-10-03', 'and the Sabbath it is for can be read back out of it');
  const mk = (date, at) => ({ id: date + at, title: `${S.SHARE_PREFIX}${S.dateLabel(date)}`, body: 'x', from: 'Maria', at });
  const order = [mk('2026-09-26', 'a'), mk('2026-10-10', 'b'), mk('2026-10-03', 'c'), mk('2026-09-19', 'd')]
    .sort(S.byComingSabbath('2026-10-02')).map((p) => S.sharedDate(p.title));
  ok(order.join(' ') === '2026-10-03 2026-10-10 2026-09-26 2026-09-19',
     'This Sabbath shows the coming Sabbath first, then later ones, then the past, most recent first');
  ok(S.tidyReceived({ id: 'z', title: 'Something else', body: 'x' }) === null,
     'a post that is not a program is never kept as one');
  const view = S.readShared(S.programAsText(two));
  ok(view.head[0] === 'Grace SDA Church' && view.parts[0].heading === 'SABBATH SCHOOL · 9:00 AM'
     && view.parts[0].items.includes('Opening hymn: No. 12, Holy, Holy, Holy (Maria Santos)'),
     'and a shared program reads back into its parts and lines');
}

// ---------------------------------------------------------------------------
// 13. THE PICTURE, AND WHERE A NOTE MAY NEVER GO
// ---------------------------------------------------------------------------
{
  const width = (s) => s.length * 10; // a pretend font: ten points a letter
  ok(JSON.stringify(S.wrap(width, 'one two three four', 100)) === JSON.stringify(['one two', 'three four']),
     'the picture wraps at a space');
  ok(S.wrap(width, 'abcdefghijklmnop', 50).every((l) => width(l) <= 50), 'and cuts a word too long for its column rather than let it run off');
  ok(S.wrap(width, 'a\nb', 100).length === 2, 'and keeps a line break');
  ok(S.pictureFileName(two) === 'Sabbath-program-2026-10-03.png', 'the picture is named for its Sabbath');

  const picture = code('lib/sabbath-program-picture.ts');
  ok(!/\.note\b/.test(picture), 'the picture never reads a note: it is the congregation\'s copy');
  const editor = code('components/SabbathProgram.tsx');
  ok(/share\(\{ title: shareTitle\(program\), body, audience \}\)/.test(editor)
     && /const body = programAsText\(program, 'congregation'\)/.test(editor),
     'sharing in the app always sends the congregation\'s copy');
  ok(!/\.note\b/.test(code('lib/sabbath-program.ts').slice(code('lib/sabbath-program.ts').indexOf('export function reminderText'),
     code('lib/sabbath-program.ts').indexOf('export function stillToFill'))),
     'and a reminder never carries a note');

  const page = code('app/sabbath/page.tsx');
  ok(/<ThisSabbath owner=\{owner\} role=\{rememberedRole\(owner\)\} received=\{received\} \/>/.test(page),
     'This Sabbath with no signal draws from the device only, and offers no sharing');
  ok(!/dangerouslySetInnerHTML/.test(page + code('components/ThisSabbath.tsx')),
     'a shared program is drawn as text, never as markup: it is a post somebody wrote');
  const worker = read('app/sw.js/route.ts');
  ok(/'\/sabbath',/.test(worker) && /'\/office',/.test(worker), 'the service worker keeps This Sabbath and the Office for no signal');
  ok((code('components/RoomRails.tsx').match(/\bthisSabbath,/g) ?? []).length === 3,
     'This Sabbath is in the Menu for Explorers, Guides and leadership');
  ok(/export function postsVisibleTo/.test(code('components/Blog.tsx')) && /postsVisibleTo\(db, currentUser\.id\)/.test(page),
     'the sample church reads shared programs by the same rule as its feed');
}

/** Every piece of text the picture would draw, read off a stand-in canvas. */
function drawnText(p) {
  const drawn = [];
  const ctx = {
    font: '', fillStyle: '', textAlign: '', textBaseline: '',
    measureText: (t) => ({ width: t.length * 18 }),
    fillText: (t) => drawn.push(t),
    fillRect() {}, scale() {},
  };
  S.drawProgram(p, { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
  return drawn;
}

// ---------------------------------------------------------------------------
// 14. THE CHURCH'S OWN DETAILS (Advanced)
// ---------------------------------------------------------------------------
// Asked for the same day: "users can add additional input in the advance
// settings if the basic is not enough for them".
{
  const x = structuredClone(filled);
  x.extras = [
    { id: 'e1', label: 'Deacons on duty', value: 'Anna Yu & John Reyes' },
    { id: 'e2', label: 'Offering for', value: '' },
  ];
  const text = S.programAsText(x);
  ok(text.includes('Deacons on duty: Anna Yu & John Reyes') && !text.includes('Offering for'),
     'a detail with something to say is printed under the theme; one left empty is not');
  const xml = S.documentXml(x);
  ok(textOf(xml).includes('Deacons on duty: |Anna Yu & John Reyes'), 'and it is in the Word file');
  try { parseXml(xml); ok(true, 'which stays well-formed with an ampersand in a detail'); }
  catch (e) { ok(false, `which stays well-formed with an ampersand in a detail (${e.message})`); }
  ok(S.readShared(text).head.includes('Deacons on duty: Anna Yu & John Reyes'), 'and This Sabbath shows it with the heading');
  x.sections[0].lines[1].note = 'Pianist plays the first verse through'; // a line that is drawn
  const drawn = drawnText(x);
  ok(drawn.includes('Deacons on duty: Anna Yu & John Reyes') && !drawn.some((t) => t.includes('Offering for')),
     'and on the picture, the empty one left off');
  ok(drawn.length > 10 && !drawn.some((t) => t.includes('Pianist')), 'and a platform note is never drawn on the picture');

  const tpl = S.templateFrom(x, 'With deacons');
  ok(tpl.extras.join('|') === 'Deacons on duty|Offering for' && !JSON.stringify(tpl).includes('Anna Yu'),
     'a template keeps the names of the details, not what they said');
  const next = S.fromOwnTemplate(tpl, 'Grace SDA Church', friday);
  ok(next.extras.length === 2 && next.extras.every((e) => e.value === '') && next.extras[0].label === 'Deacons on duty',
     'so the next program starts with the same details, empty');

  const tidied = S.tidyProgram({
    id: 'p', sections: [],
    extras: [{ id: 'q', label: 'a'.repeat(100), value: 'b'.repeat(500) }, 'junk', null],
  });
  ok(tidied.extras.length === 1 && tidied.extras[0].label.length === S.LIMITS.extraLabel
     && tidied.extras[0].value.length === S.LIMITS.extraValue,
     'stored details are cut to their limits, and anything that is not one is dropped');
  ok(S.tidyProgram({ id: 'old', sections: [] }).extras.length === 0,
     'and a program saved before details existed reads as having none');
}

fs.rmSync(out, { recursive: true, force: true });
console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
