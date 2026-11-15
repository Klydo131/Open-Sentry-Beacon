// An EPUB opens in the app, and a hostile one cannot do anything.
//
// An EPUB is a website in a zip, written by someone else. This holds the parts
// that do not need a browser: the zip reader, the paths inside a book, the
// limits against a zip that inflates to gigabytes, and the three layers that
// keep a chapter's code from running (the allowlist, the policy inside the
// chapter, the sandbox on its frame). The browser half is
// tests/e2e/a-book-opens-in-the-library.js.
//
//   node tests/a-book-opens-safely.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const fixture = createRequire(import.meta.url)('./e2e/_epub-fixture.js');

let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); if (!c) bad++; };

let epub;
try {
  epub = await import(pathToFileURL(path.join(root, 'lib/epub.ts')).href);
} catch (err) {
  const strippable = /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/.test(String(err && (err.code || err.message)));
  if (!strippable || process.env.EPUB_RETRY === '1') { console.error(`BAD could not load lib/epub.ts: ${err && err.message}`); process.exit(1); }
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)],
    { stdio: 'inherit', env: { ...process.env, EPUB_RETRY: '1' } });
  process.exit(r.status ?? 1);
}
const { readZip, resolvePath, EpubError, EPUB_LIMITS } = epub;

// ---- 1. The zip -------------------------------------------------------------
{
  const zip = readZip(new Uint8Array(fixture.sample()));
  ok(zip.has('META-INF/container.xml') && zip.has('OEBPS/ch1.xhtml'), 'the zip reader lists the parts of a book');
  const ch3 = new TextDecoder().decode(await zip.get('OEBPS/ch3.xhtml'));
  ok(ch3.includes('THE END MARKER'), 'a packed part is read back exactly (inflated)');
  const stored = new TextDecoder().decode(await zip.get('mimetype'));
  ok(stored === 'application/epub+zip', 'a stored part is read back exactly');
  ok((await zip.get('nothing/here')) === undefined, 'a part that is not there is undefined, not an error');
  const png = await zip.get('OEBPS/images/dot.png');
  ok(png && png[0] === 0x89 && png[1] === 0x50, 'a picture comes back as the same bytes');

  let said = '';
  try { readZip(new Uint8Array([1, 2, 3, 4, 5])); } catch (e) { said = e instanceof EpubError ? e.message : 'wrong error'; }
  ok(/not a book/.test(said), 'a file that is not a zip is refused in plain words');

  const bomb = readZip(new Uint8Array(fixture.bomb()));
  const small = fixture.bomb().length;
  ok(small < 100_000, `the bomb file is small (${small} bytes) but declares 40 MB`);
  let stopped = '';
  try { await bomb.get('OEBPS/ch1.xhtml'); } catch (e) { stopped = e instanceof EpubError ? e.message : ''; }
  ok(/too large/.test(stopped), 'a part that inflates past the limit is stopped, by our own count and not the zip\'s word');
  ok((await bomb.get('OEBPS/ch2.xhtml')) !== undefined, 'and the rest of that book is still readable');

  const truncated = fixture.sample().subarray(0, 600);
  let broke = false;
  try { readZip(new Uint8Array(truncated)); } catch (e) { broke = e instanceof EpubError; }
  ok(broke, 'a cut-off file is refused, not crashed on');
}

// ---- 2. Paths inside a book --------------------------------------------------
{
  ok(resolvePath('OEBPS/ch1.xhtml', 'images/dot.png') === 'OEBPS/images/dot.png', 'a path is read from the chapter\'s own folder');
  ok(resolvePath('OEBPS/text/ch1.xhtml', '../images/dot.png') === 'OEBPS/images/dot.png', 'and ../ goes up one');
  ok(resolvePath('OEBPS/ch1.xhtml', '../../../etc/passwd') === null, 'a path that climbs out of the book is refused');
  ok(resolvePath('OEBPS/ch1.xhtml', 'https://example.invalid/x') === null, 'an outside address is not a path in the book');
  ok(resolvePath('OEBPS/ch1.xhtml', '//example.invalid/x') === null, 'nor a protocol-relative one');
  ok(resolvePath('OEBPS/ch1.xhtml', 'javascript:alert(1)') === null, 'nor javascript:');
  ok(resolvePath('OEBPS/ch1.xhtml', '#top') === 'OEBPS/ch1.xhtml', 'a link to a place in the same chapter stays in it');
  ok(resolvePath('OEBPS/ch1.xhtml', 'ch2.xhtml?x=1#sec') === 'OEBPS/ch2.xhtml', 'a query and a fragment are not part of the path');
  ok(resolvePath('OEBPS/ch1.xhtml', 'My%20Pic.png') === 'OEBPS/My Pic.png', 'a path is percent-decoded');
  ok(resolvePath('OEBPS/ch1.xhtml', '%E0%A4%A') === null, 'a broken percent code is refused, not thrown');
  ok(EPUB_LIMITS.entry <= 25_000_000 && EPUB_LIMITS.entries <= 5000, 'the limits are held in one place');
}

// ---- 3. The three layers ------------------------------------------------------
{
  const lib = read('lib/epub.ts');
  const reader = read('components/EpubReader.tsx');
  ok(/default-src 'none'; img-src data:; style-src 'unsafe-inline'/.test(lib), 'layer 2: the chapter carries a policy that loads nothing but its own pictures');
  const sandbox = /sandbox="([^"]*)"/.exec(reader)?.[1] ?? '';
  ok(sandbox.length > 0 && !/allow-scripts/.test(sandbox) && !/allow-top-navigation|allow-popups|allow-forms|allow-modals/.test(sandbox),
    `layer 3: the frame is sandboxed with no scripts, forms, popups or navigation ("${sandbox}")`);
  ok(/srcDoc=/.test(reader) && !/\bsrc=\{/.test(reader.slice(reader.indexOf('<iframe'), reader.indexOf('/>', reader.indexOf('<iframe')) + 2)),
    'the chapter is given to the frame as text, never as an address');
  ok(!/dangerouslySetInnerHTML/.test(reader), 'the reader never writes a chapter into the app\'s own page');
  const kept = /const KEEP = new Set\(\(['"]([^'"]*)['"]/.exec(lib.replace(/\n\s*\+\s*/g, ''))?.[1] ?? '';
  ok(kept.length > 0 && !/\b(script|style|iframe|object|embed|form|input|svg|link|meta|base)\b/.test(kept), 'layer 1: the allowlist names no tag that can run or load anything');
  ok(/'data-to'/.test(lib) && !/setAttribute\('href'/.test(lib), 'layer 1: a link is rewritten to stay in the book; no href survives');
  ok(!/\bfetch\(|XMLHttpRequest|new WebSocket|sendBeacon/.test(lib + reader), 'the book code makes no network request at all');
  ok(!/innerHTML\s*=|insertAdjacentHTML|document\.write/.test(reader + lib.replace(/out\.body\.innerHTML;/g, '')), 'nothing assigns raw HTML');
}

console.log(bad ? `\n${bad} problem(s).` : '\nA book opens safely.');
process.exit(bad ? 1 : 0);
