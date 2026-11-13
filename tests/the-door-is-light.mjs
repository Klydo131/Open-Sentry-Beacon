// The pages somebody sees before signing in download only what they need.
//
// ---------------------------------------------------------------------------
// FOUND 28 OCTOBER 2026, asked to. The sign-in page cost 432 kB of JavaScript (compressed, Next's own
// "First Load JS") for a form with two boxes: it carried the Director's whole
// Admin screen, both Guide screens and the Explorer's screen. They came in
// through components/LiveCorePages.tsx, a file kept to re-export every live
// screen after they were split up. It began with 'use client', and the build
// does not trim the exports of such a file, so importing the sign-in form from
// it imported everything it named. Each page now imports its screen from the
// file that holds it, the re-exporting file is gone, and the sign-in page is
// 305 kB.
//
// THE BUDGET IS THE CHECK, NOT THE FILE NAME. A rule that said "do not import
// LiveCorePages" would pass the day somebody writes the same file under
// another name. This reads the finished build instead: the compressed
// JavaScript each door page loads, measured the way Next measures it, against
// a ceiling that the old 432 kB is far above and today's 305 kB is under.
// Raise it only with a reason written beside it.
//
// Needs the build (npm run verify runs this after building).
//
//   node tests/the-door-is-light.mjs
// ---------------------------------------------------------------------------

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = process.env.BEACON_DIST_DIR || '.next';
const manifestPath = path.join(root, dist, 'app-build-manifest.json');

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

if (!fs.existsSync(manifestPath)) {
  console.log(`BAD there is no build to measure (${path.relative(root, manifestPath)}); run npm run build first`);
  process.exit(1);
}
const pages = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).pages;

/** Compressed kB of the JavaScript a page loads first, as Next counts it. */
const firstLoad = (page) => {
  const files = (pages[page] || []).filter((f) => f.endsWith('.js'));
  const bytes = files.reduce((sum, f) => sum + zlib.gzipSync(fs.readFileSync(path.join(root, dist, f))).length, 0);
  return { files: files.length, kB: Math.round(bytes / 1024) };
};

// The door: where a person arrives, signs in, signs up or accepts an invitation.
const CEILING_KB = 340;
for (const [page, name] of [
  ['/page', 'the front page'],
  ['/login/page', 'the sign-in page'],
  ['/signup/page', 'the sign-up page'],
  ['/join/page', 'the invitation page'],
]) {
  const size = firstLoad(page);
  ok(size.files > 0 && size.kB <= CEILING_KB,
     `${name} loads ${size.kB} kB of JavaScript, within ${CEILING_KB} kB (${size.files} files)`);
}

// EVERY OTHER PAGE HAS A CEILING TOO (8 November 2026, the pstack audit).
// Behind the door nothing was measured, and the heaviest pages were
// 379-413 kB: the Office, Admin and Settings. This does not make them lighter;
// it stops them growing unnoticed, the way the sign-in page once grew to
// 432 kB. Raise it only with a reason written beside it.
const INSIDE_KB = 430;
const door = new Set(['/page', '/login/page', '/signup/page', '/join/page']);
const inside = Object.keys(pages).filter((k) => k.endsWith('/page') && !door.has(k));
const heavy = inside.map((k) => [k, firstLoad(k).kB]).filter(([, kB]) => kB > INSIDE_KB);
const heaviest = inside.map((k) => [k, firstLoad(k).kB]).sort((a, b) => b[1] - a[1])[0];
ok(inside.length > 20 && heavy.length === 0,
   `every page behind the door loads ${INSIDE_KB} kB of JavaScript or less (${inside.length} pages; heaviest ${heaviest?.[0]} at ${heaviest?.[1]} kB${heavy.length ? `; over: ${heavy.map(([k, kB]) => `${k} ${kB}`).join(', ')}` : ''})`);

// And the file that carried every screen into them stays gone.
ok(!fs.existsSync(path.join(root, 'components/LiveCorePages.tsx')),
   'there is no file re-exporting every live screen for a page to import through');

console.log(bad ? `\n${bad} failed.` : '\nThe door is light.');
process.exit(bad ? 1 : 0);
