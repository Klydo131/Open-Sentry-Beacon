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
// 2. AND ONLY ONE ROUTE RENDERS IT
// ---------------------------------------------------------------------------
//
// THE RULE CHANGED WHEN THE ROOM BECAME A ROOM, and the change is the point
// rather than a loosening. The editor used to sit in a card inside somebody
// else's screen behind an "Open my study room" button, because a megabyte
// should not land on an Explorer reading their journey. It now takes the whole
// window and has a route of its own, so walking into /study IS the asking and
// the button would be a door in front of a door.
//
// What replaces the button is this: nothing but the /study route renders the
// room at all. Lose that and the old problem is back, quietly, on whichever
// screen picked it up.
{
  const walk = (dir, out = []) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(rel, out);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
    }
    return out;
  };

  const renderers = [...walk('app'), ...walk('components')].filter((f) => {
    if (f.endsWith(ROOM)) return false;
    return /<StudyRoom[\s/>]/.test(strip(read(f)));
  });

  ok(renderers.length === 1 && renderers[0] === 'app/study/page.tsx',
     `only the /study route renders the room (found: ${renderers.join(', ') || 'none'})`);
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
// 5. THE ROOM HAS EVERY FEATURE, AND THE SHELF DOES NOT WAIT FOR THEM
// ---------------------------------------------------------------------------
//
// THIS SECTION USED TO ASSERT THE OPPOSITE, and it was wrong in a way worth
// recording. It held a hand-picked list of nine blocks and named five whole
// feature areas -- databases, embeds, attachments, code, data views -- that the
// room was checked for NOT having. Every assertion passed. The owner, with four
// screenshots of AFFiNE and a link to their repository: "Did you even scan the
// whole affine on how the whole notion works? ... I want the whole feature
// please." A suite that checks only what was built cannot tell anybody that
// something was not built, and this file was the reason nobody noticed.
//
// So the invariant is inverted. The feature set is AFFiNE'S OWN, entire, and
// what is held instead is the thing that made the trim tempting: the WEIGHT has
// to be paid at the moment somebody opens a page, not at the moment they open
// the room.
{
  const exts = strip(read('lib/study/extensions.ts'));
  const views = strip(read('lib/study/view-extensions.ts'));

  // EVERY BLOCK AFFiNE HAS. Not a list to keep in step with theirs by hand --
  // their own function, so a block they add is a block this room gains.
  ok(/getInternalStoreExtensions\(\)/.test(exts),
     'the room can hold every block AFFiNE has, by taking their own set');
  ok(/getInternalViewExtensions\(\)/.test(views),
     'and can draw every one of them');

  // AND THE SCHEMA SIDE MATTERS MOST. Dropping a block from the view costs that
  // feature. Dropping it from the schema costs everybody who already wrote one:
  // their page raises `schema for flavour: ... not found`, the block is skipped,
  // and what they wrote in it is in the database with nothing able to draw it.
  ok(!/getInternalViewExtensions/.test(exts),
     'the schema half carries no drawing, so opening the room stays cheap');

  // THE SPLIT, WHICH IS WHAT MAKES THE ABOVE AFFORDABLE. Over a megabyte
  // gzipped may not be fetched before a list of page titles can be drawn, so
  // the drawing half must be reached by `await import(...)` and never by a
  // plain import at the top of a file.
  const heavy = ['lib/study/view-extensions', 'lib/study/effects'];
  const sources = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const here = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(here); }
      else if (/\.(ts|tsx)$/.test(entry.name)) sources.push(here);
    }
  };
  for (const dir of ['app', 'components', 'lib']) walk(dir);

  for (const module of heavy) {
    const statically = sources.filter((file) => {
      const src = strip(read(file));
      // `import ... from '<module>'` or a bare `import '<module>'`, but not
      // `await import('<module>')`, which is the whole point.
      return new RegExp(`(^|\\n)\\s*import\\s[^\\n]*['"][^'"]*${module.replace('lib/study', '(@/lib/study|\\.)')}['"]`)
        .test(src);
    });
    ok(statically.length === 0,
       `nothing imports ${module} at the top of a file (${statically.join(', ') || 'nothing does'})`);
  }

  // The editor screen itself must fetch it rather than carry it.
  const editor = strip(read(EDITOR));
  ok(/await Promise\.all\(\[\s*import\('@\/lib\/study\/effects'\)/.test(editor)
     || (/import\('@\/lib\/study\/effects'\)/.test(editor)
         && /import\('@\/lib\/study\/view-extensions'\)/.test(editor)),
     'the editor is fetched when a page is opened, not when the room is');

  // The editor arrives with no colours of its own; every BlockSuite rule reads
  // a --affine-* variable that only this stylesheet defines. It rides with the
  // effects, so it is fetched at the same moment and never before.
  ok(/@toeverything\/theme\/style\.css/.test(strip(read('lib/study/effects.ts'))),
     'and it brings the stylesheet that defines its colours');

  // BOTH WAYS OF LOOKING AT A PAGE. The whiteboard is a scope, not a second
  // editor, and the room now asks for whichever one somebody chose.
  ok(/\.get\(mode\)/.test(editor) && /'page' \| 'edgeless'/.test(editor),
     'a page can be looked at as a page or as a whiteboard');
}

// ---------------------------------------------------------------------------
// 6. AND THE ROOM NEVER LIES ABOUT WHAT IS HAPPENING
// ---------------------------------------------------------------------------
//
// Three separate reports of this room "not working" were a working editor with
// nothing on screen to say otherwise. Every state it can be in now has to say
// which one it is: opened, opened-but-not-saving, or never reached at all.
{
  const editor = strip(read(EDITOR));

  ok(/onTrouble\s*=/.test(editor),
     'the room listens for a source that cannot save');
  ok(/setTrouble/.test(editor) && /Not saved yet/.test(read(EDITOR)),
     'and says so on screen rather than letting somebody write into nothing');

  // A page that never arrived is not an empty page, and rendering an editor
  // with no blocks in it is the white rectangle that started all of this.
  ok(/setStalled\(true\)/.test(editor),
     'a room that could not be reached is told apart from an empty one');
  ok(/Try again/.test(read(EDITOR)),
     'and offers the one action that helps');
}

// ---------------------------------------------------------------------------
// 7. AND THE PAGE LIST IS NOT BLANKED BEFORE IT ARRIVES
// ---------------------------------------------------------------------------
//
// `meta.initialize()` means "if this room has no page list, give it an empty
// one". Run before the database answers, a room that HAS pages looks like a
// room that has none, so it writes an empty list -- and when the real list
// arrives, two clients have set the same key concurrently and Yjs keeps one of
// them. Lose that toss and an Explorer opens a room listing one page while
// everything else they have written sits in the database with nothing pointing
// at it.
//
// Measured in tests/a-room-that-already-exists-still-opens.mjs: with the call
// before the wait, a room seeded with two stored pages came back with one.
// This holds the order, because the order is the fix.
{
  const editor = strip(read(EDITOR));
  const wait = editor.indexOf('waitForSynced');
  const init = editor.indexOf('meta.initialize()');
  ok(wait !== -1 && init !== -1 && init > wait,
     'the page list is only initialised after the database has had its say');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
