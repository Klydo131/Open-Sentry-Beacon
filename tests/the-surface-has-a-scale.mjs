// The app has one elevation scale, one focus ring, and both are legible.
//
// ---------------------------------------------------------------------------
// WHAT THIS IS ABOUT. Asked for: make the UI feel premium. Most of what reads
// as cheap in an interface is not colour or font choice, it is inconsistency —
// the same kind of surface drawn three weights apart on three screens — and
// details that were never finished, of which the focus ring is the usual one.
//
// THE FOCUS RING WAS A MEASURED FAULT, not a matter of taste. It was a single
// gold outline. Gold on white is 1.84:1 where WCAG asks 3:1 of a focus
// indicator, so on every white surface in the app — which is nearly all of it —
// a keyboard user got a ring they could barely see. It is handsome on the navy
// header and that is presumably where it was judged.
//
// No single colour serves both, so the ring is two layers. This file recomputes
// the contrast from the CSS rather than trusting the comment, because a token
// changed later would otherwise quietly reintroduce the same fault.
//
//   node tests/the-surface-has-a-scale.mjs
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const css = readFileSync('app/globals.css', 'utf8');
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const full = path.join(dir, name);
  if (statSync(full).isDirectory()) return walk(full);
  return /\.tsx$/.test(name) ? [full.split(path.sep).join('/')] : [];
});
const files = [...walk('components'), ...walk('app')];

// ---------------------------------------------------------------------------
// 1. THE FOCUS RING, MEASURED
// ---------------------------------------------------------------------------
{
  const token = (name) => (new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css) ?? [])[1];
  const navy = token('navy');
  const gold = token('gold');
  ok(Boolean(navy && gold), `the palette tokens are readable from the CSS (${navy}, ${gold})`);

  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  // The rule itself: an outline AND a second ring, not one of them.
  const block = css.slice(css.indexOf(':focus-visible {'), css.indexOf('}', css.indexOf(':focus-visible {')));
  ok(/outline:[^;]*var\(--navy\)/.test(block),
     'the focus ring has a navy outline, for light surfaces');
  ok(/box-shadow:[^;]*var\(--gold\)/.test(block),
     'and a gold band inside it, for dark ones');

  // AND EACH LAYER EARNS ITS PLACE. 3:1 is the WCAG 2.2 non-text minimum.
  const NEED = 3;
  const onWhite = ratio(navy, '#ffffff');
  const onNavy = ratio(gold, navy);
  ok(onWhite >= NEED,
     `on a white surface the navy layer is visible (${onWhite.toFixed(2)}:1, needs ${NEED})`);
  ok(onNavy >= NEED,
     `on the navy header the gold layer is visible (${onNavy.toFixed(2)}:1, needs ${NEED})`);

  // The fault this replaced, stated as a check so it cannot come back by
  // somebody "simplifying" the ring down to one colour again.
  const goldOnWhite = ratio(gold, '#ffffff');
  ok(goldOnWhite < NEED,
     `gold alone would still fail on white (${goldOnWhite.toFixed(2)}:1), which is why there are two layers`);
}

// ---------------------------------------------------------------------------
// 2. ONE SCALE, NOT A GUESS PER SCREEN
// ---------------------------------------------------------------------------
{
  for (const step of ['--lift-1', '--lift-2', '--lift-3']) {
    ok(css.includes(step), `${step} is defined`);
  }
  // TWO LAYERS PER STEP. A single blur reads as fog; the tight one draws the
  // edge and the wide one draws the height.
  const three = /--lift-3:\s*([^;]+);/.exec(css)?.[1] ?? '';
  ok((three.match(/rgba\(/g) ?? []).length >= 2,
     'the top step is layered rather than one wide blur');

  const offenders = files.filter((f) => {
    const src = readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    return /shadow-2xl/.test(src);
  });
  ok(offenders.length === 0,
     offenders.length
       ? `these still guess their own elevation instead of using the scale:\n        ${offenders.join('\n        ')}`
       : 'nothing guesses its own elevation any more');

  const ui = readFileSync('components/ui.tsx', 'utf8');
  ok(/elevation === 'raised' \? 'lift-3' : 'lift-1'/.test(ui),
     'a Card rests at lift-1 and a raised one is lift-3');
}

// ---------------------------------------------------------------------------
// 3. MOTION IS OPTIONAL, AND DISCOURAGEMENT SURVIVES THE POLISH
// ---------------------------------------------------------------------------
{
  const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  ok(/\.lift-hover\s*\{[^}]*transition:\s*none/.test(reduced),
     'the hover lift is switched off for anybody who asked for less motion');

  // THE ONE THAT MATTERS MOST HERE. tests/destructive-is-discouraged.mjs exists
  // because the most damaging control on a screen must not be the most
  // inviting. Making buttons feel better is exactly the change that would undo
  // it by giving every button the same lift.
  const ui = readFileSync('components/ui.tsx', 'utf8');
  const lifted = /variant === 'primary' \|\| variant === 'gold' \? 'lift-1 lift-hover' : ''/.test(ui);
  ok(lifted, 'only the two filled variants lift');
  ok(!/danger[^\n]*lift-hover/.test(ui),
     'and the destructive one does not, so polish did not make it inviting');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
