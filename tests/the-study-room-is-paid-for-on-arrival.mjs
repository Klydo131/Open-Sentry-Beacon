// Nobody pays for the study room until they open it.
//
// ---------------------------------------------------------------------------
// THE NUMBER THIS FILE EXISTS FOR. The study room's editor is BlockSuite, and
// it measures 3.25 MB gzipped -- against 0.54 MB for the whole of the rest of
// this application. Six times the entire app, for one room, on phones on
// Philippine mobile data.
//
// Measured after wiring it in:
//
//   shared JS, every screen    102 kB -> 107 kB
//   /ds first load             287 kB -> 339 kB
//   editor chunk               4.63 MB, separate, fetched on tap
//
// That gap is held open by exactly one thing: StudyRoom imports the editor
// through next/dynamic with ssr:false, behind a button. A plain import would
// fold it into the page chunk and every Explorer would download three megabytes
// to look at their journey. Nothing would go red; the app would just get slow
// for the people least able to afford it.
//
// So this checks the shape rather than the size. A size assertion needs a build
// to run and would be skipped in the fast gate, which is where a regression
// like this would actually land.
//
//   node tests/the-study-room-is-paid-for-on-arrival.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const strip = (src) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

const EDITOR = 'components/study/StudyRoomEditor.tsx';
const ROOM = 'components/study/StudyRoom.tsx';

// ---------------------------------------------------------------------------
// 1. ONE FILE IMPORTS THE EDITOR, AND IT DOES SO LAZILY
// ---------------------------------------------------------------------------
{
  // Every source file in the app, so a new importer is caught wherever it
  // appears rather than in a list somebody remembers to update.
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel, out);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
    }
    return out;
  };
  const files = [...walk('app'), ...walk('components'), ...walk('lib')];

  const importers = files.filter((f) => {
    if (f.endsWith(EDITOR)) return false;
    return /StudyRoomEditor/.test(strip(read(f)));
  });

  ok(importers.length === 1 && importers[0].endsWith(ROOM),
     `only StudyRoom reaches the editor (found: ${importers.join(', ') || 'none'})`);

  const room = strip(read(ROOM));

  // NAMED, NOT MERELY PRESENT. The first version of this asked whether the file
  // contained `dynamic(() => import(` anywhere. It passed when the editor was
  // switched to a static import and an unrelated dynamic() was left behind --
  // the exact regression this file exists to stop, waved through because the
  // shape it looked for was still somewhere on the page.
  ok(/dynamic\(\s*\(\)\s*=>\s*import\(\s*['"][^'"]*StudyRoomEditor['"]/.test(room),
     'the EDITOR specifically arrives through a dynamic import');

  // And the other half: a static import beside the dynamic one would fold the
  // chunk back into the page and the dynamic call would become decoration.
  ok(!/^\s*import[^\n]*StudyRoomEditor[^\n]*from/m.test(room),
     'and is never also imported statically');

  ok(/ssr:\s*false/.test(room),
     'with ssr:false, so it is never part of the page a phone first receives');
}

// ---------------------------------------------------------------------------
// 2. AND NOT EVEN FETCHED UNTIL SOMEBODY ASKS
// ---------------------------------------------------------------------------
//
// dynamic() alone would still fetch the chunk as soon as the Study tab renders.
// The room is behind state that starts closed, so an Explorer who never opens
// it never downloads it.
{
  const room = strip(read(ROOM));

  // THE RULE CHANGED WHEN THE ROOM BECAME A ROOM, and the change is the point
  // rather than a loosening. On its own page at /study, walking in IS the
  // asking, so it opens on arrival: `useState(fullPage)`. Everywhere else --
  // embedded in somebody else's screen, which is how this started -- it must
  // still start closed, or three megabytes lands on a page nobody asked it of.
  //
  // So what is asserted is that the default is closed and opening is opt-in,
  // not that the initial value is the literal `false`.
  ok(/useState\(fullPage\)/.test(room),
     'the room opens on arrival only on its own page');
  ok(/fullPage\s*=\s*false/.test(room),
     'and stays closed by default anywhere it is embedded');

  const gated = /\{\s*open\s*\?[\s\S]{0,400}?<StudyRoomEditor/.test(room);
  ok(gated, 'the editor is rendered only once it has been opened');
}

// ---------------------------------------------------------------------------
// 3. THE EXPLORER'S ROOM IS THE EXPLORER'S
// ---------------------------------------------------------------------------
{
  const room = strip(read(ROOM));
  ok(/role\s*!==\s*'ds'/.test(room),
     'a Guide or a Director is not shown a door into somebody else\'s study room');
}

// ---------------------------------------------------------------------------
// 4. THE BUILD STILL KNOWS HOW TO READ BLOCKSUITE
// ---------------------------------------------------------------------------
//
// Four separate things had to be arranged before this package would compile at
// all, each found by a build failing rather than by reading a document. Any one
// of them removed puts the build back to a syntax error pointing at the wrong
// file.
{
  const cfg = strip(read('next.config.mjs'));
  ok(/blocksuiteAliases/.test(cfg),
     'imports resolve to compiled output, not to TypeScript source');
  ok(/`\$\{spec\}\$`|spec \+ '\$'/.test(cfg),
     'and the aliases are exact matches, or a package name swallows its own subpaths');
  ok(/extensionAlias/.test(cfg),
     'a `.js` specifier that means `.ts` still resolves');
  ok(/accessor-loader/.test(cfg),
     'the accessor keyword is lowered, because neither webpack nor SWC can read it');
  ok(/createVanillaExtractPlugin/.test(cfg),
     'and vanilla-extract styles are compiled rather than met at runtime');

  const csp = strip(read('next.config.mjs'));
  ok(/worker-src 'self' blob:/.test(csp),
     "the editor's blob worker is allowed, without widening default-src");
}

// ---------------------------------------------------------------------------
// 5. AND THE ROOM CARRIES ONLY WHAT A ROOM NEEDS
// ---------------------------------------------------------------------------
//
// The first working version called getInternalViewExtensions(), which loads
// every block BlockSuite has: the infinite canvas, the databases, the embeds,
// the attachments. Measured, that put 4.61 MB on the one screen an Explorer
// opens to write, and it was reported as the room being broken before anybody
// got as far as it being slow.
{
  const editor = strip(read(EDITOR));
  ok(!/getInternal(Store|View)Extensions/.test(editor),
     'the editor names the blocks it needs rather than loading every block there is');

  const exts = strip(read('lib/study/extensions.ts'));

  // The weight, by name. Each of these is a whole feature area that a page of
  // handwritten study notes has no use for.
  for (const gone of ['affine-block-database', 'affine-block-embed',
                      'affine-block-surface', 'affine-block-data-view',
                      'affine-block-attachment', 'affine-block-code']) {
    ok(!exts.includes(gone), `the study room does not carry ${gone}`);
  }

  // AND THE HALF THAT IS NOT OPTIONAL. DefaultInlineManager declares every one
  // of these as a dependency. Drop one and the manager does not construct, so
  // no rich text renders anywhere -- an empty paragraph zero pixels tall, no
  // error on screen, one line in the console. It is not a feature list; it is
  // all or nothing.
  for (const need of ['affine-inline-latex', 'affine-inline-mention',
                      'affine-inline-reference', 'affine-inline-footnote',
                      'affine-inline-link', 'affine-inline-preset']) {
    ok(exts.includes(need),
       `the inline set is complete (${need}), or no text renders at all`);
  }

  // The editor arrives with no colours of its own; every BlockSuite rule reads
  // a --affine-* variable that only this stylesheet defines.
  ok(/@toeverything\/theme\/style\.css/.test(editor),
     'and the editor brings the stylesheet that defines its colours');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
