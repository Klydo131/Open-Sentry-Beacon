// The study room turns into an Obsidian vault, and a vault turns back into it.
//
// ---------------------------------------------------------------------------
// The names, the front matter and the zip are decided in lib/study/obsidian.ts
// and can be checked without a browser, which is why they live there. Turning
// a page's BLOCKS into Markdown is BlockSuite's job and needs a live editor;
// that half is walked in tests/e2e/.
//
// THE ZIP IS CHECKED AGAINST A REAL `unzip`, AND THAT IS THE POINT OF THIS
// FILE. A zip container written by hand is exactly the kind of thing that
// round-trips perfectly through its own reader and cannot be opened by
// anything else -- the reader and the writer agree on the same mistake. Info-
// ZIP and Python's zipfile have no such loyalty, so both are asked.
//
//   node tests/a-room-can-become-a-vault.mjs
// ---------------------------------------------------------------------------
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-vault-'));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const bundle = path.join(out, 'obsidian.mjs');
await build({
  entryPoints: [path.join(root, 'lib/study/obsidian.ts')],
  outfile: bundle,
  bundle: true, format: 'esm', platform: 'node', target: 'es2020', logLevel: 'silent',
});
const V = await import(pathToFileURL(bundle).href);

// ---------------------------------------------------------------------------
// 1. NAMES THAT SURVIVE EVERY MACHINE THE VAULT MIGHT BE OPENED ON
// ---------------------------------------------------------------------------
ok(V.safeName('Romans 8:28') === 'Romans 8 28',
   'a colon becomes a space, so a verse does not turn into a different number');
ok(!/[\\/:*?"<>|]/.test(V.safeName('a/b\\c:d*e?f"g<h>i|j')),
   'none of the characters Windows refuses survives');
ok(V.safeName('Notes.') === 'Notes' && V.safeName('Notes ') === 'Notes',
   'a name cannot end in a dot or a space, which Windows writes and cannot open');
ok(V.safeName('CON') !== 'CON' && V.safeName('con') !== 'con',
   'a DOS device name is not used as a filename');
ok(V.safeName('') === 'Untitled' && V.safeName('   ') === 'Untitled',
   'a page with no title still gets a name');
ok(V.safeName('a'.repeat(400)).length <= 120, 'a very long title is cut to a length a filesystem takes');

// ---------------------------------------------------------------------------
// 2. WHERE A PAGE LANDS IN THE VAULT
// ---------------------------------------------------------------------------
const page = (over) => ({ id: 'abc123', title: 'Romans 8', tags: [], folder: '',
  journalDate: '', created: Date.UTC(2026, 8, 17), updated: Date.UTC(2026, 8, 22),
  markdown: 'Body.', ...over });

ok(V.vaultPath(page({})) === 'Romans 8', 'an unfiled page sits at the top of the vault');
ok(V.vaultPath(page({ folder: 'Sermons' })) === 'Sermons/Romans 8', 'a folder is a folder');
ok(V.vaultPath(page({ journalDate: '2026-09-22' })) === 'Journal/2026-09-22',
   'a journal entry is a daily note, named for its day');
ok(V.vaultPath(page({ journalDate: '2026-09-22', title: 'Prayer meeting' })) === 'Journal/2026-09-22',
   'and renaming that page does not stop it being that day');
ok(V.vaultPath(page({ journalDate: '2026-09-22', folder: 'Sermons' })) === 'Sermons/2026-09-22',
   'a journal entry somebody filed stays where they filed it');

const names = V.vaultFilenames([
  page({ id: 'a', title: 'Notes' }), page({ id: 'b', title: 'Notes' }), page({ id: 'c', title: 'Notes' }),
]);
ok(names.get('a') === 'Notes.md' && names.get('b') === 'Notes (2).md' && names.get('c') === 'Notes (3).md',
   'two pages honestly called the same thing do not overwrite each other');

// ---------------------------------------------------------------------------
// 3. FRONT MATTER, AND READING IT BACK
// ---------------------------------------------------------------------------
const withTags = page({ title: 'Romans 8', tags: ['Romans', 'Prayer meeting'], journalDate: '2026-09-22' });
const file = V.toVaultFile(withTags);
ok(file.startsWith('---\n'), 'a vault file opens with front matter');
ok(/\ntags:\n  - Romans\n  - "?Prayer meeting"?/.test(file), 'tags are a YAML list, which Obsidian reads natively');
ok(/\ndate: 2026-09-22\n/.test(file), 'a daily note says which day it is');

const read = V.parseVaultFile(file);
ok(read.title === 'Romans 8', 'the title comes back');
ok(read.tags.join('|') === 'Romans|Prayer meeting', 'the tags come back, including one with a space');
ok(read.journalDate === '2026-09-22', 'the day comes back');
ok(read.body.trim() === 'Body.', 'and the body is the body, without the front matter');

ok(V.parseVaultFile('no front matter here').body === 'no front matter here',
   'a plain Markdown file with no front matter is still readable');
ok(V.parseVaultFile('---\ntags: [one, two]\n---\nx').tags.join('|') === 'one|two',
   "Obsidian's inline `tags: [a, b]` is understood as well");

// A vault will contain keys written by plugins this app has never heard of.
const foreign = V.parseVaultFile('---\ntitle: X\ncssclass: two-column\naliases: [Y]\n---\nbody');
ok(foreign.extra.some((l) => l.includes('cssclass')) && foreign.extra.some((l) => l.includes('aliases')),
   'front matter this app did not write is kept rather than dropped');

// ---------------------------------------------------------------------------
// 4. LINKS
// ---------------------------------------------------------------------------
ok(V.wikilinksIn('see [[Romans 8]] and [[Prayer|the page]]').join('|') === 'Romans 8|Prayer',
   'wikilinks are found, with or without an alias');
ok(V.linksToTitles('[[abc123]]', (id) => (id === 'abc123' ? 'Romans 8' : undefined)) === '[[Romans 8]]',
   'a link by id becomes a link by title, which is the only kind Obsidian resolves');
ok(V.linksToTitles('[[gone]]', () => undefined) === '[[gone]]',
   'a link to a page that is not in the export is left alone rather than blanked');

// ---------------------------------------------------------------------------
// 5. THE ZIP, AGAINST TWO READERS THAT ARE NOT OURS
// ---------------------------------------------------------------------------
const vault = [
  { path: 'Romans 8.md', text: V.toVaultFile(page({ title: 'Romans 8', tags: ['Romans'] })) },
  { path: 'Sermons/Ang Panalangin.md', text: V.toVaultFile(page({ title: 'Ang Panalangin', folder: 'Sermons' })) },
  { path: 'Journal/2026-09-22.md', text: V.toVaultFile(page({ journalDate: '2026-09-22' })) },
];
const bytes = V.zipVault(vault, Date.UTC(2026, 8, 22, 10, 30));
const zipPath = path.join(out, 'vault.zip');
fs.writeFileSync(zipPath, Buffer.from(bytes));

let infozip = '';
try { infozip = execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' }); } catch (e) { infozip = String(e); }
ok(/No errors detected/.test(infozip), `Info-ZIP opens it and finds no errors (${infozip.trim().split('\n').pop()})`);

let listed = '';
try { listed = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }); } catch { listed = ''; }
ok(listed.includes('Sermons/Ang Panalangin.md'), 'a folder inside the vault survives, with its name intact');

let py = '';
try {
  py = execFileSync('python3', ['-c',
    `import zipfile;z=zipfile.ZipFile(${JSON.stringify(zipPath)});print(z.testzip() or 'ok');` +
    `print(z.read('Journal/2026-09-22.md').decode('utf-8')[:3])`,
  ], { encoding: 'utf8' });
} catch (e) { py = String(e); }
ok(/^ok/m.test(py) && /---/.test(py), "Python's zipfile agrees, and the file inside reads back as text");

const back = V.unzipVault(bytes);
ok(back.files.length === 3, `our own reader finds all three files (${back.files.length})`);
ok(back.files[1].text === vault[1].text, 'and a file with a non-ASCII name comes back byte for byte');
ok(back.skipped.length === 0, 'nothing was skipped');

// ---------------------------------------------------------------------------
// 6. A VAULT SOMEBODY ELSE ZIPPED
// ---------------------------------------------------------------------------
//
// The import side has to cope with a folder zipped by a person, not by us.
const theirs = path.join(out, 'theirs');
fs.mkdirSync(path.join(theirs, 'Studies'), { recursive: true });
fs.writeFileSync(path.join(theirs, 'Studies', 'Grace.md'), '---\ntags:\n  - Grace\n---\n\nOn grace.\n');
fs.writeFileSync(path.join(theirs, 'Plain.md'), 'No front matter at all.\n');
execFileSync('zip', ['-q', '-r', '-0', path.join(out, 'theirs.zip'), '.'], { cwd: theirs });
const mine = V.unzipVault(new Uint8Array(fs.readFileSync(path.join(out, 'theirs.zip'))));
const grace = mine.files.find((f) => f.path.endsWith('Grace.md'));
ok(!!grace, 'a vault zipped by somebody else can be read');
ok(grace && V.parseVaultFile(grace.text).tags.join('|') === 'Grace', 'and its tags come through');
ok(V.folderOf('Studies/Grace.md') === 'Studies', 'the folder it was in becomes the folder it goes in');
ok(V.folderOf('Journal/2026-09-22.md') === '', 'except Journal, which is where daily notes already live');
ok(V.journalDateOf('Journal/2026-09-22.md') === '2026-09-22', 'a date-named file comes back as that day');
ok(V.journalDateOf('Romans 8.md') === '', 'and an ordinary page does not');

// ---------------------------------------------------------------------------
// 7. PICTURES
// ---------------------------------------------------------------------------
//
// AFFiNE writes a picture as `![](assets/x.png)`, a path relative to the NOTE.
// That is right for a flat export and wrong for this one: a page filed in
// Sermons becomes Sermons/Romans 8.md, and the relative path then points at
// Sermons/assets/x.png, where nothing is. Obsidian's own `![[x.png]]` embed
// resolves by filename from any depth, so that is what goes in the file.
ok(V.picturesAsEmbeds('![a photo](assets/bible.png)') === '![[bible.png]]',
   'a picture becomes an embed that resolves from any folder in the vault');
ok(V.picturesAsEmbeds('![](https://example.org/x.png)') === '![](https://example.org/x.png)',
   'a picture that lives on the web is left exactly as it is');
ok(V.embedsAsPictures('![[bible.png]]') === '![](assets/bible.png)',
   'and back again, into the form the adapter can read');
ok(V.embedsAsPictures('![[Another page]]') === '![[Another page]]',
   'an embed of a NOTE is not mangled into a broken picture');
ok(V.picturesWanted('![[a.png]] and ![x](assets/b.jpg) and ![](https://e.org/c.gif)').join('|') === 'a.png|b.jpg',
   'a note says which pictures it wants, however it asked, and not the web ones');

// A picture has to survive the zip as BYTES. Decoding it as text does not
// fail, it quietly produces replacement characters and the picture is gone.
{
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');
  const mixed = V.zipVault([
    { path: 'Note.md', text: '---\ntitle: Note\n---\n\n![[bible.png]]\n' },
    { path: 'assets/bible.png', bytes: new Uint8Array(png) },
  ], Date.UTC(2026, 8, 22));
  const mixedPath = path.join(out, 'mixed.zip');
  fs.writeFileSync(mixedPath, Buffer.from(mixed));

  let tested = '';
  try { tested = execFileSync('unzip', ['-t', mixedPath], { encoding: 'utf8' }); } catch (e) { tested = String(e); }
  ok(/No errors detected/.test(tested), 'a vault holding a picture is still a zip a real unzip opens');

  // The oracle that matters: the bytes, out of a real unzip, compared exactly.
  let got = Buffer.alloc(0);
  try {
    got = execFileSync('unzip', ['-p', mixedPath, 'assets/bible.png'], { encoding: 'buffer', maxBuffer: 1 << 24 });
  } catch { got = Buffer.alloc(0); }
  ok(got.equals(png), `the picture comes back byte for byte (${got.length} of ${png.length} bytes)`);

  const back = V.unzipVault(mixed);
  const note = back.files.find((f) => f.path === 'Note.md');
  const pic = back.files.find((f) => f.path === 'assets/bible.png');
  ok(!!note?.text && note.text.includes('![[bible.png]]'), 'our reader gives the note back as text');
  ok(!!pic?.bytes && Buffer.from(pic.bytes).equals(png), 'and the picture back as bytes, not as mangled text');
  ok(pic?.text === undefined, 'a picture is never handed back as a string');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
