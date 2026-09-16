// A loop that runs for ever may only move things the GPU can move.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Reported from a phone: "The animation is not that smooth, I
// can still and feel it's lagging loop. Can you make it smooth please."
//
// The journey bar's sheen animated `background-position`. A background position
// is a PAINT property: every frame, for ever, the browser re-drew the gradient
// across the whole bar. Sixty times a second of repainting on a mid-range phone
// is what "lagging" was. Nothing was wrong with the timing or the design.
//
// Only two properties can be animated without the browser painting anything
// again -- `transform` and `opacity` -- because they are handed to the
// compositor and moved there. Everything else costs a repaint (colour,
// shadow, background position) or a reflow (width, height, top, left), and a
// reflow costs a repaint too.
//
// A ONE-SHOT ANIMATION IS NOT THE SAME PROBLEM, which is why this only looks at
// looping ones. A 200ms entrance that repaints is a fraction of one frame's
// worth of work; the same animation set to `infinite` never stops costing it.
// So the rule is narrow on purpose: loop for ever, move only what is free.
//
//   node tests/an-animation-that-loops-does-not-repaint.mjs
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

// Everywhere CSS lives: the stylesheet, and the <style> blocks components
// carry. A rule that only read globals.css would have missed this one entirely,
// because the journey bar keeps its own.
function everyStylesheet() {
  const out = [{ file: 'app/globals.css', css: read('app/globals.css') }];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { walk(rel); continue; }
      if (!/\.(tsx|ts)$/.test(entry.name)) continue;
      const src = read(rel);
      for (const m of src.matchAll(/<style>\{`([\s\S]*?)`\}<\/style>/g)) {
        out.push({ file: rel, css: m[1] });
      }
    }
  };
  walk('components');
  walk('app');
  return out;
}

// Properties that cost a repaint or a reflow every frame. `background-position`
// is first because it is the one that caused this.
const EXPENSIVE = [
  'background-position', 'background-size', 'box-shadow', 'filter',
  'width', 'height', 'top', 'left', 'right', 'bottom',
  'margin', 'padding', 'border-width', 'background-color', 'color',
];

const sheets = everyStylesheet();
ok(sheets.length > 1, `found ${sheets.length} stylesheets, including component ones`);

const offenders = [];
let loops = 0;

for (const { file, css } of sheets) {
  // Which keyframe names are used by an INFINITE animation?
  const looping = new Set();
  for (const m of css.matchAll(/animation:\s*([^;]+);/g)) {
    if (!/\binfinite\b/.test(m[1])) continue;
    const name = m[1].trim().split(/\s+/)[0];
    if (name) looping.add(name);
  }
  loops += looping.size;

  for (const name of looping) {
    const at = css.search(new RegExp(`@keyframes\\s+${name}\\b`));
    if (at < 0) continue;
    const open = css.indexOf('{', at);
    let depth = 0, end = open;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
    }
    const body = css.slice(open, end);
    for (const prop of EXPENSIVE) {
      if (new RegExp(`(^|[;{\\s])${prop}\\s*:`).test(body)) {
        offenders.push(`${file}: @keyframes ${name} animates ${prop}`);
      }
    }
  }
}

ok(loops > 0, `and ${loops} animation(s) that loop for ever, which is what this is about`);

ok(offenders.length === 0,
   offenders.length
     ? `a forever-loop repaints every frame:\n      ${offenders.join('\n      ')}`
     : 'every forever-loop moves only transform and opacity');

// AND THE LOOPS STOP FOR SOMEBODY WHO ASKED FOR LESS MOVEMENT. Cheap is not the
// same as wanted: a smooth animation that will not stop is still the thing that
// setting exists to turn off.
{
  const css = sheets.map((s) => s.css).join('\n');
  ok(/prefers-reduced-motion/.test(css),
     'and a reduced-motion rule exists to switch them off');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
