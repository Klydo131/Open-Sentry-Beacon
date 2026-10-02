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
  ok(/room === 'sabbath' && <SabbathPrograms owner=\{profile\.id\}/.test(office),
     'a church\'s own app keeps each account\'s programs under that account');
  ok(/owner=\{`sample:\$\{currentUser\?\.id/.test(office), 'and so does the sample church, apart from any real account');

  const tool = code('components/SabbathProgram.tsx') + code('lib/sabbath-program.ts') + code('lib/sabbath-program-docx.ts');
  ok(!/@\/lib\/live|supabase|fetch\(|XMLHttpRequest|sendBeacon/.test(tool),
     'nothing in it talks to the database or the network: the names typed stay on the device');
  ok(/aria-expanded=\{open\}/.test(code('components/SabbathProgram.tsx')),
     'a part of the day opens and shuts, so 28 lines are not one long scroll');
}

fs.rmSync(out, { recursive: true, force: true });
console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
