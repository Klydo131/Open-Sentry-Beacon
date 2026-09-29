// A study can have a drawing, and the drawing board costs nothing until it is
// used, asks nothing of anybody else's server, and carries nothing but the
// picture.
//
// Asked for on 28 September 2026: "Make sure studies feature has Excalidraw on
// it's tools please, and make sure it works." tests/e2e/a-study-can-have-a-
// drawing.js is the "it works": a real board, a real drag, the drawing read
// back out of the saved picture. This file holds the rules around it that a
// walk cannot see.
//
//   node tests/a-study-can-have-a-drawing.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onlyTheDrawing, carriesDrawing, isDrawingName, nextDrawingName, SCENE_KEYWORD } from '../lib/drawing-file.ts';
import { withoutForeignFonts } from '../components/draw/excalidraw-asset-path.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '');

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(tsx?|mjs|js)$/.test(e.name)) out.push(rel);
  }
  return out;
}
const source = ['app', 'components', 'lib'].flatMap((d) => walk(d));

// ---------------------------------------------------------------------------
// 1. A MEGABYTE THAT ARRIVES ONLY WHEN SOMEBODY PRESSES DRAW
// ---------------------------------------------------------------------------
{
  const importers = source.filter((f) => /from '@excalidraw\/excalidraw'|import\('@excalidraw\/excalidraw'\)/.test(code(read(f))));
  ok(importers.length === 1 && importers[0] === path.join('components', 'draw', 'DrawingBoard.tsx'),
    `Excalidraw is imported by the drawing board and nothing else (${importers.join(', ') || 'none'})`);
  const boardImports = source.filter((f) => /from '@\/components\/draw\/DrawingBoard'/.test(code(read(f))));
  ok(boardImports.length === 0, `and the board itself is never imported directly (${boardImports.join(', ') || 'none'})`);
  const door = code(read('components/draw/Draw.tsx'));
  ok(/dynamic\(\s*\(\) => import\('@\/components\/draw\/DrawingBoard'\)[\s\S]*?ssr: false/.test(door),
    'it comes in through next/dynamic, off the server, when the board is opened');
}

// ---------------------------------------------------------------------------
// 2. THE BOARD TALKS TO NOBODY ELSE, AND SAYS NOTHING UNTRUE
// ---------------------------------------------------------------------------
{
  const board = code(read('components/draw/DrawingBoard.tsx'));
  // BEFORE EXCALIDRAW LOADS, NOT AFTER. It works out every font's address as
  // its module is evaluated; set in the board's own body, the path came too
  // late and every font was asked of esm.sh (found by the walk, 28 September).
  const assetPath = code(read('components/draw/excalidraw-asset-path.ts'));
  ok(/EXCALIDRAW_ASSET_PATH = '\/excalidraw\/'/.test(assetPath), 'its fonts are asked for from the app itself, not esm.sh');
  ok(withoutForeignFonts('url(/excalidraw/fonts/a.woff2) format(\'woff2\'), url(https://esm.sh/@excalidraw/excalidraw@0.18.1/dist/prod/fonts/a.woff2) format(\'woff2\')')
       === "url(/excalidraw/fonts/a.woff2) format('woff2')",
    "and Excalidraw's esm.sh fallback is taken off every font before the browser checks it");
  ok(withoutForeignFonts('url(https://esm.sh/x.woff2)') === 'url(https://esm.sh/x.woff2)',
    'but a font is never left with no source at all');
  ok(/new Proxy\(w\.FontFace, \{\s*construct\(/.test(assetPath) && /withoutForeignFonts\(source\)/.test(assetPath),
    'every font made while the board is loaded goes through that');
  const first = board.indexOf("import '@/components/draw/excalidraw-asset-path';");
  ok(first !== -1 && first < board.indexOf("from '@excalidraw/excalidraw'") && first === board.indexOf('import '),
    'and that is set by the very first import, before Excalidraw works out where its fonts are');
  ok(/aiEnabled=\{false\}/.test(board), "the AI tools, which call Excalidraw's servers, are off");
  ok(/validateEmbeddable=\{false\}/.test(board), 'web embeds are off');
  ok(/tools: \{ image: false \}/.test(board),
    'pictures inside a drawing are off: a photo there would skip the step that removes its location');
  for (const action of ['loadScene', 'saveToActiveFile', 'export', 'saveAsImage']) {
    ok(new RegExp(`${action}: false`).test(board), `and so is ${action}: the way out is Save or Cancel`);
  }
  ok(/<WelcomeScreen>[\s\S]*<WelcomeScreen\.Center\.Heading>/.test(board),
    'its own welcome is replaced: it says drawings are "saved in your browser", and here they are not');
  ok(/<MainMenu>/.test(board) && !/Socials|LiveCollaborationTrigger/.test(board),
    'and its menu is ours: no links out, no collaboration');
  ok(/exportEmbedScene: true/.test(board), 'the drawing is saved inside the picture, so it can be changed later');
  ok(/blob\.size > MAX_BYTES/.test(board) && /const MAX_BYTES = 10 \* 1024 \* 1024;/.test(board),
    'and a drawing over the 10 MB a study holds is refused on the board, by name, not after an upload');
  ok(/Leave without saving this drawing\?/.test(board), 'leaving with a change nobody saved asks first');

  const css = read('components/draw/drawing-board.css');
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, '').match(/[^{}]+(?=\{)/g) ?? [];
  ok(rules.length > 0 && rules.every((r) => r.split(',').every((sel) => sel.trim().startsWith('[data-drawing-board]'))),
    'its own stylesheet reaches nothing outside the board');
}

// ---------------------------------------------------------------------------
// 3. THE FONTS ARE SERVED HERE, AND THE POLICY IS NOT WIDENED FOR THEM
// ---------------------------------------------------------------------------
{
  const pkg = JSON.parse(read('package.json'));
  ok(/node scripts\/excalidraw-assets\.mjs/.test(pkg.scripts.prebuild ?? ''), 'every build copies the fonts in first');
  ok(/node scripts\/excalidraw-assets\.mjs/.test(pkg.scripts.predev ?? ''), 'and so does every dev server');
  ok(/^\/public\/excalidraw\/$/m.test(read('.gitignore')), 'and the copies are not kept in git: the package is the source');
  const script = read('scripts/excalidraw-assets.mjs');
  ok(/SKIPPED = \['Xiaolai'\]/.test(script), 'the thirteen-megabyte CJK face is left out');
  const config = read('next.config.mjs');
  ok(/"font-src 'self' data:"/.test(config) && !/esm\.sh|unpkg/.test(config),
    "the Content-Security-Policy still allows fonts from 'self' only");
  ok(pkg.dependencies['@excalidraw/excalidraw'] === '0.18.1', 'the version is pinned exactly');
  ok(pkg.overrides?.['@excalidraw/excalidraw']?.nanoid && pkg.overrides?.['@excalidraw/mermaid-to-excalidraw']?.['@mermaid-js/parser'],
    'and the packages it pins with known advisories are overridden to fixed versions');
}

// ---------------------------------------------------------------------------
// 4. A DRAWING LEAVES WITH THE PICTURE AND THE DRAWING, AND NOTHING ELSE
// ---------------------------------------------------------------------------
{
  // A PNG assembled by hand, carrying the things a photo can: a camera's EXIF,
  // free text, international text. CRCs are not checked by the stripper, so
  // zeros stand in for them.
  const chunk = (type, data) => {
    const body = Buffer.from(data);
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'latin1');
    return Buffer.concat([head, body, Buffer.alloc(4)]);
  };
  const text = (keyword, value) => chunk('tEXt', Buffer.concat([Buffer.from(keyword, 'latin1'), Buffer.from([0]), Buffer.from(value, 'latin1')]));
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', Buffer.alloc(13, 1)),
    chunk('eXIf', 'GPS 14.5995 N 120.9842 E'),
    text('Comment', 'taken at home'),
    chunk('iTXt', 'Author\0\0\0\0\0somebody'),
    chunk('iCCP', 'Phone camera profile\0\0xx'),
    text(SCENE_KEYWORD, '{"elements":[]}'),
    chunk('IDAT', Buffer.alloc(20, 7)),
    chunk('IEND', ''),
  ]);
  const clean = Buffer.from(onlyTheDrawing(new Uint8Array(png)) ?? []);
  const has = (s) => clean.includes(Buffer.from(s, 'latin1'));
  ok(clean.length > 0 && carriesDrawing(new Uint8Array(clean)), 'the drawing itself is kept');
  ok(has('IHDR') && has('IDAT') && has('IEND'), 'and so is the picture');
  ok(!has('eXIf') && !has('GPS'), "a camera's EXIF, where a location lives, is cut out");
  ok(!has('taken at home') && !has('iTXt') && !has('somebody'), 'and so is any other text');
  ok(!has('iCCP') && !has('Phone camera profile'), 'and a colour profile that names a device');
  ok(onlyTheDrawing(new Uint8Array(Buffer.from('not a png'))) === null, 'something that is not a PNG is not passed as one');

  const shrink = code(read('lib/live/shrink-image.ts'));
  const fn = shrink.slice(shrink.indexOf('export async function shrinkImage'));
  const drawn = fn.indexOf('onlyTheDrawing(');
  ok(drawn !== -1 && drawn < fn.indexOf('carriesLocation(') && drawn < fn.indexOf('canvas.toBlob'),
    'every upload of a drawing goes through that stripping, before anything else could re-draw it');
  ok(/isDrawingName\(file\.name\) && \/\^image\\\/png\$\/i\.test/.test(fn),
    'and only a PNG named as a drawing takes that path');

  ok(isDrawingName('Drawing 2.excalidraw.png') && !isDrawingName('photo.png'), 'a drawing is known by its name');
  ok(nextDrawingName(['Drawing 1.excalidraw.png', 'notes.pdf']) === 'Drawing 2.excalidraw.png',
    'and the next one is numbered after the ones already there');
}

// ---------------------------------------------------------------------------
// 5. IN EVERY PLACE A STUDY IS WRITTEN, ON BOTH HALVES OF THE APP
// ---------------------------------------------------------------------------
{
  const studies = code(read('components/LiveStudies.tsx'));
  ok((studies.match(/<DrawButton\b/g) ?? []).length === 3,
    'a study being edited, a new study in a series and each study in a new series can each be drawn for');
  const edit = studies.slice(studies.indexOf('<DrawButton'), studies.indexOf('<DrawButton') + 400);
  ok(/onDrawn=\{\(file\) => act\(\(\) => live\.attachLessonFile\(lesson\.id, file\)\)\}/.test(edit),
    'a drawing on a saved study goes on as a handout does, through the same upload');
  const replace = studies.slice(studies.indexOf('onReplace={(next) => act(async () => {'));
  ok(replace.indexOf('live.attachLessonFile(lesson.id, next)') !== -1
     && replace.indexOf('live.attachLessonFile(lesson.id, next)') < replace.indexOf('live.removeLessonFile(f.id)'),
    'changing a drawing adds the new picture BEFORE removing the old, so a failure leaves two, never none');
  ok(/<SavedDrawing file=\{f\} canChange=\{false\}/.test(studies),
    'a reader sees a drawing as a picture, and cannot change it');
  ok(/canChange=\{f\.added_by === profile\?\.id\}/.test(studies), 'only whoever drew it is offered Change');

  const sample = code(read('components/LessonSeriesLibrary.tsx'));
  ok(/<DrawButton\b/.test(sample) && /keepDrawing\(await fileToDataUrl\(/.test(sample),
    'the sample app draws with the same board');
  // NOT IN THE SAMPLE DATABASE, which is re-written to localStorage on every
  // change (tests/realtime-and-media.mjs): the row holds an id, the picture is
  // kept once, in the tab.
  const store = code(read('lib/demo/store.tsx'));
  ok(/drawing_id: drawingId/.test(store) && !/data:|base64/.test(store),
    'and its database keeps only which drawing, never the picture');
  const kept = code(read('lib/demo/drawings.ts'));
  ok(/sessionStorage\.setItem\(PREFIX \+ id, url\)/.test(kept) && /if \(!isPngDataUrl\(url\)\) return '';/.test(kept),
    'the picture is kept once in the tab, and nothing but a PNG, because it is drawn as an <img>');
  ok(/drawingById\(series\.drawing_id\) && \(/.test(code(read('components/MySeries.tsx'))), 'an Explorer in the sample app sees it too');
}

console.log(bad === 0 ? '\nA study can have a drawing, and nothing else comes with it.' : `\n${bad} failed.`);
process.exit(bad === 0 ? 0 : 1);
