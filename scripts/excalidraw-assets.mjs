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
// ALSO LEFT OUT: Liberation Sans. The copy Excalidraw ships is version 1.05,
// whose licence is "the license agreement under which you accepted the
// Liberation font software" -- Red Hat's terms for the 1.x fonts, GPL-2.0 with
// a font exception and a trademark clause -- not the Open Font License of the
// later versions. It is only the drawing board's old "Helvetica" style; without
// it the browser's own sans-serif is used. Found by the licence audit of
// 1 October 2026.
//
// AND EVERY FONT SERVED GOES WITH ITS LICENCE. Most of these licences ask that
// it travel with every copy, and the subsetting that made these files small
// kept only the font's own name table. So LICENSES.txt is written next to them,
// read out of the font files themselves (scripts/woff2-names.mjs), and a face
// whose licence cannot be read is not served at all.
//
//   node scripts/excalidraw-assets.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { woff2Names } from './woff2-names.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Faces not served: one too large for what it is used for, one under a licence we do not ship. */
export const SKIPPED = ['Xiaolai', 'Liberation'];

/**
 * What a face's own files do not say, and where it is said instead. Excalifont's
 * subset files carry only "Copyright (c) 2024 by Excalidraw. All rights
 * reserved."; the original font file's licence field, quoted in Excalidraw's
 * source (packages/excalidraw/fonts/Excalifont/index.ts, checked 1 October
 * 2026), names the Open Font License.
 */
const STATED_UPSTREAM = {
  Excalifont: 'This Font Software is licensed under the SIL Open Font License, Version 1.1. '
    + "(Stated in the original font file's licence field, as quoted in Excalidraw's source, "
    + 'packages/excalidraw/fonts/Excalifont/index.ts. The subset files served here keep only the copyright line.)',
};

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
const notices = [];
let oflText = '';
for (const face of fs.readdirSync(from).sort()) {
  if (SKIPPED.includes(face)) continue;
  const source = path.join(from, face);
  if (!fs.statSync(source).isDirectory()) continue;
  const first = fs.readdirSync(source).find((f) => f.endsWith('.woff2'));
  let names = null;
  try { names = first ? woff2Names(fs.readFileSync(path.join(source, first))) : null; } catch { names = null; }
  const licence = names?.[13] || STATED_UPSTREAM[face] || '';
  const ofl = /Open Font License|scripts\.sil\.org\/OFL|openfontlicense/i.test(`${licence} ${names?.[14] ?? ''}`);
  const mit = /^MIT License/.test(names?.[0] ?? '') && /Permission is hereby granted/.test(names?.[0] ?? '');
  if (!names || (!licence && !ofl && !mit)) {
    console.log(`excalidraw-assets: ${face} says nothing about its licence, so it is not served.`);
    continue;
  }
  const full = (names[13] ?? '').indexOf('SIL OPEN FONT LICENSE Version 1.1');
  if (full !== -1 && !oflText) oflText = names[13].slice(full).trim();
  notices.push([
    `${names[1] ?? face}${names[5] ? ` -- ${names[5].trim()}` : ''}`,
    mit ? names[0].trim() : `Copyright: ${(names[0] ?? 'not stated').trim()}`,
    names[7] ? `Trademark: ${names[7].trim()}` : '',
    mit ? '' : `Licence: ${licence ? licence.trim() : 'SIL Open Font License, Version 1.1'}`
      + (ofl && full === -1 ? '\n(The full text of the SIL Open Font License is at the end of this file.)' : ''),
    names[14] ? `Licence address: ${names[14].trim()}` : '',
  ].filter(Boolean).join('\n'));
  fs.cpSync(source, path.join(to, face), { recursive: true });
  for (const f of fs.readdirSync(path.join(to, face))) {
    files += 1;
    bytes += fs.statSync(path.join(to, face, f)).size;
  }
}
const rule = '-'.repeat(72);
fs.writeFileSync(path.join(to, 'LICENSES.txt'), [
  'Fonts served by this app for the drawing board',
  '',
  'Copied unchanged from the @excalidraw/excalidraw package (MIT) by',
  'scripts/excalidraw-assets.mjs. What each font says about itself is quoted',
  'below, read out of the font files when they were copied.',
  '',
  `Not served: ${SKIPPED.join(', ')} (see scripts/excalidraw-assets.mjs for why).`,
  '',
  ...notices.flatMap((n) => [rule, n, '']),
  rule,
  oflText || 'SIL Open Font License, Version 1.1: https://openfontlicense.org',
  '',
].join('\n'));
console.log(`excalidraw-assets: ${files} font files (${Math.round(bytes / 1024)} KB) in public/excalidraw/fonts, with LICENSES.txt`);
