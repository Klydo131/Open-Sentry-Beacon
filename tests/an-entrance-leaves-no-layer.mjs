// An entrance animation must leave nothing behind when it ends.
//
// Found on 12 November 2026 by the study-room walks: each look's page entrance
// was written with `animation-fill-mode: both`, which keeps the last frame for
// ever. An element holding an opacity or transform animation is its own layer,
// so the Study Room, which is position: fixed at z-index 100 inside the page,
// was trapped under the purple tutorial bar (z-index 60) and the header:
// "All pages" and the way out could not be pressed, in every look but Old
// Classic. `backwards` gives the same entrance and lets go once it ends.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); if (!c) bad++; };

const sheets = ['app/home.css', ...fs.readdirSync(path.join(root, 'app/themes'))
  .filter((f) => f.endsWith('.css')).map((f) => `app/themes/${f}`)];
const kept = [];
for (const f of sheets) {
  const css = fs.readFileSync(path.join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/animation\s*:\s*([^;}]+)/g)) {
    if (/\b(both|forwards)\b/.test(m[1])) kept.push(`${f}: ${m[1].trim()}`);
  }
  for (const m of css.matchAll(/animation-fill-mode\s*:\s*(both|forwards)/g)) kept.push(`${f}: fill-mode ${m[1]}`);
}
ok(kept.length === 0, kept.length
  ? `these keep their last frame, which traps full-screen views under the bars:\n        ${kept.join('\n        ')}`
  : `no look's entrance keeps its last frame (${sheets.length} sheets)`);

console.log(bad ? `RESULT: ${bad} FAILURE(S)` : 'RESULT: ALL OK');
process.exit(bad ? 1 : 0);
