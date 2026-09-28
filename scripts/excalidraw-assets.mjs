// Puts the drawing board's fonts where the app itself serves them.
//
// WHY. Excalidraw draws its hand-lettered text with its own fonts, and when it
// is not told where they are it fetches them from esm.sh. This app's
// Content-Security-Policy (next.config.mjs) allows fonts from 'self' and
// nowhere else, on purpose -- so without this, every word on a drawing would
// fall back to a plain system font, silently, in production only. And a church
// app asking a CDN for a font on every drawing tells that CDN who is drawing.
//
// So the fonts are copied out of the installed package into public/excalidraw/
// before every build and every dev server, and components/draw/DrawingBoard.tsx
// points Excalidraw at /excalidraw/. They come from node_modules, so they are
// always the version the code expects and nothing binary is kept in git.
//
// LEFT OUT: Xiaolai, the Chinese, Japanese and Korean handwriting face. It is
// thirteen megabytes on its own, against about half a megabyte for the rest,
// and is only asked for when somebody writes those scripts on a drawing. Then
// the policy refuses the CDN and the browser uses a system font that has them,
// so the words still appear, in a plainer hand.
//
//   node scripts/excalidraw-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Faces too large to serve for what they are used for. */
export const SKIPPED = ['Xiaolai'];

// A direct dependency, so npm puts it at the top of node_modules. (Not found
// through require.resolve: the package's `exports` map does not expose its own
// package.json, so asking for it throws even when it is installed.)
const from = path.join(root, 'node_modules/@excalidraw/excalidraw/dist/prod/fonts');
if (!fs.existsSync(from)) {
  // Not installed: nothing to copy. Never fail a build over a font -- the
  // board still draws, with the browser's own fonts.
  console.log('excalidraw-assets: @excalidraw/excalidraw is not installed; nothing copied.');
  process.exit(0);
}

const to = path.join(root, 'public/excalidraw/fonts');
fs.rmSync(to, { recursive: true, force: true });
fs.mkdirSync(to, { recursive: true });

let files = 0;
let bytes = 0;
for (const face of fs.readdirSync(from)) {
  if (SKIPPED.includes(face)) continue;
  const source = path.join(from, face);
  if (!fs.statSync(source).isDirectory()) continue;
  fs.cpSync(source, path.join(to, face), { recursive: true });
  for (const f of fs.readdirSync(path.join(to, face))) {
    files += 1;
    bytes += fs.statSync(path.join(to, face, f)).size;
  }
}
console.log(`excalidraw-assets: ${files} font files (${Math.round(bytes / 1024)} KB) in public/excalidraw/fonts`);
