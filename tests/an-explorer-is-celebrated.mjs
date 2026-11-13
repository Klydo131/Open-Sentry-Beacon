// Finishing something is celebrated, and not the same way every time.
//
// Asked for on 13 November 2026. lib/celebrate.ts,
// components/Celebration.tsx, the .celebrate-* rules in app/globals.css.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); if (!c) bad++; };

const lib = read('lib/celebrate.ts');
const kinds = [...(lib.match(/CELEBRATIONS = \[([^\]]*)\]/)?.[1] ?? '').matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
ok(kinds.length >= 4, `there is a variety: ${kinds.length} kinds (${kinds.join(', ')})`);
ok(/filter\(\(k\) => k !== last\)/.test(lib), 'never the same kind twice in a row');

const css = read('app/globals.css');
for (const k of kinds) ok(new RegExp(`\\.celebrate-${k}\\s*\\{[^}]*animation-name`).test(css), `${k} has its own animation`);
const block = css.slice(css.indexOf('/* ---- Celebrations'));
ok(!/\b(forwards|both)\b/.test(block), 'no fill-mode that would leave a layer behind (tests/an-entrance-leaves-no-layer)');
ok(/prefers-reduced-motion: reduce\)\s*\{\s*\.celebrate-field \{ display: none; \}/.test(block) && /\.celebrate-fireworks \{ animation: none; \}/.test(block),
   'asked for less motion, the words stay and the burst does not draw');
ok(/\.celebrate \{[^}]*pointer-events: none/.test(block), 'a celebration never takes a tap');

const comp = read('components/Celebration.tsx');
ok(/role="status"/.test(comp), 'the words are announced to a screen reader');
ok(/setTimeout\(\(\) => setBurst\(null\)/.test(comp), 'and it goes away by itself');

for (const shell of ['components/AppShell.tsx', 'components/LiveAppShell.tsx']) {
  ok(/<Celebration \/>/.test(read(shell)), `${shell} draws celebrations`);
}
ok(/markLessonRead\(lesson\.id\)\.then\(\(\) => celebrate\(/.test(read('components/LiveStudies.tsx')), 'a lesson marked done is celebrated');
ok(/setMoved\(true\);\s*celebrate\(/.test(read('components/live/JourneyBar.tsx')), 'a step forward on the journey is celebrated');
ok(/next\.length > c\.length\) queueMicrotask\(\(\) => celebrate\(/.test(read('components/Quest.tsx')), 'a tutorial step done is celebrated');

console.log(bad ? `RESULT: ${bad} FAILURE(S)` : 'RESULT: ALL OK');
process.exit(bad ? 1 : 0);
