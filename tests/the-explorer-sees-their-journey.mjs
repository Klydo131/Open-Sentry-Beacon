// An Explorer can see they are moving, without being told what they are.
//
// ---------------------------------------------------------------------------
// THE ASK.
//
// The Guide has had the journey all along, as six named stages on their own
// screen. The Explorer had nothing at all: somebody could be moved forward and
// never know it had happened.
//
// THE TENSION THIS TEST EXISTS TO HOLD. The bar is drawn from the same
// journey_stage the Guide moves, and tests/e2e/seeker-no-stage.js walks every
// screen an Explorer can reach and fails if any of the six stage words appears.
// Those two facts pull against each other, and the resolution is that the bar
// carries a POSITION and never a NAME. So the checks below are not "does it
// look nice" -- they are the ones that keep both true at once:
//
//   - the width painted is the position the Guide actually moved them to
//   - nothing a person reads on that card is a stage name or a number
//
// THE COMPONENT IS RUN, NOT READ. A file whose source contains no stage word
// can still render one through a lookup, and a file that mentions
// prefers-reduced-motion in a comment satisfies a grep while animating anyway.
// So the real component is transpiled and executed against a stand-in React,
// and the element tree it returns is what gets inspected.
//
//   node tests/the-explorer-sees-their-journey.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// The six words the Guide sees and the Explorer must not.
const STAGES = ['Create', 'Connect', 'Care', 'Call', 'Cultivate', 'Commission'];

// ---------------------------------------------------------------------------
// BUILD AND RUN THE REAL COMPONENT
// ---------------------------------------------------------------------------
const js = ts.transpileModule(read('components/live/JourneyBar.tsx'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.React,
  },
}).outputText;

const React = {
  createElement: (type, props, ...children) => ({
    type,
    props: props ?? {},
    children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false),
  }),
  Fragment: 'fragment',
};

/**
 * Render once, with the hook states handed in rather than settled by React.
 *
 * `states` is read in the order the component asks for them. The setters are
 * recorded instead of applied, so an effect that computes a width can be run
 * and the number it tried to paint read back.
 */
function render({ guideName, states = [] }) {
  let asked = 0;
  const setters = [];
  const effects = [];
  const hooks = {
    useState(initial) {
      const i = asked++;
      const given = states[i];
      const value = given === undefined ? initial : given;
      const set = (next) => setters.push({ i, next });
      return [value, set];
    },
    useEffect(fn) { effects.push(fn); },
  };

  // Timers run at once so an effect's work is observable in one pass; a real
  // browser runs the same code a frame later.
  const win = {
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
  };

  const stubs = {
    react: hooks,
    '@/lib/live/data': { myJourneyProgress: async () => null },
    '@/components/ui': { Card: function Card(props) { return props; } },
    '@/lib/live/keep-up': { useKeepUp: () => {}, KEEP_UP_PEOPLE: ['pairings'] },
  };
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', 'React', 'window', js)(
    mod, mod.exports, (name) => stubs[name] ?? {}, React, win,
  );

  const tree = mod.exports.JourneyBar({ guideName });
  return { tree, setters, effects };
}

/** Every string a person actually reads. Stylesheets are not read by anyone. */
function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return `${node} `;
  if (typeof node !== 'object') return '';
  if (node.type === 'style') return '';
  return (node.children ?? []).map(textOf).join('');
}

/** Walk the whole tree, stylesheet included, looking at props. */
function every(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  out.push(node);
  for (const child of node.children ?? []) every(child, out);
  return out;
}

/** The one <style> the component ships with its markup. */
function styleText(tree) {
  const el = every(tree).find((n) => n.type === 'style');
  return el ? el.children.filter((c) => typeof c === 'string').join('') : '';
}

// ---------------------------------------------------------------------------
// 1. NO PAIRING, NO BAR
// ---------------------------------------------------------------------------
//
// An Explorer waiting to be matched has no journey yet, and a bar drawn at zero
// would be a claim about a relationship that has not started. The screen it sits
// on already says "Your Guide is being arranged" and that is the true sentence.
{
  const { tree } = render({ guideName: 'Maria Santos', states: [null] });
  ok(tree === null, 'somebody with no Guide is shown nothing at all');
}

// ---------------------------------------------------------------------------
// 2. THE WIDTH IS THE POSITION THE GUIDE MOVED THEM TO
// ---------------------------------------------------------------------------
//
// This is the whole feature: it matches the Journey the Guide sees.
// If the number the Guide moves and the width the Explorer sees ever come
// apart, the bar is decoration.
{
  for (const [step, expected] of [[1, 100 / 6], [3, 50], [6, 100]]) {
    const { setters, effects } = render({
      guideName: 'Maria Santos',
      states: [{ step, total: 6 }, 0, false],
    });
    // The second effect is the one that decides the width; the first only asks
    // the database. Running it is what makes this a measurement.
    effects.forEach((fn) => { const undo = fn(); if (typeof undo === 'function') undo(); });
    const width = setters.find((s) => typeof s.next === 'number');
    ok(width !== undefined, `step ${step} of 6 paints a width`);
    ok(width !== undefined && Math.abs(width.next - expected) < 0.001,
       `and it is ${expected.toFixed(1)}% of the way along, not something else`);
  }
}

// ---------------------------------------------------------------------------
// 3. NOTHING A PERSON READS IS A STAGE NAME
// ---------------------------------------------------------------------------
//
// Checked at every position, because a lookup that leaks would leak at one of
// them and a single sample would miss it.
{
  for (let step = 1; step <= 6; step++) {
    const { tree } = render({ guideName: 'Maria Santos', states: [{ step, total: 6 }, 50, false] });
    const words = textOf(tree);
    const hit = STAGES.filter((s) => new RegExp(`\\b${s}\\b`).test(words));
    ok(hit.length === 0, `at position ${step} the card names no stage${hit.length ? ` (found ${hit})` : ''}`);
  }
}

// ---------------------------------------------------------------------------
// 4. AND NOTHING A PERSON READS IS A NUMBER
// ---------------------------------------------------------------------------
//
// "3 of 6", "50%", "step 3" -- each hands back exactly what the missing label
// withholds, and the screen above this card says "Your journey is a
// relationship, not a score". A fraction is a score.
{
  const { tree } = render({ guideName: 'Maria Santos', states: [{ step: 3, total: 6 }, 50, false] });
  const words = textOf(tree);
  ok(!/\d/.test(words), `no digit is drawn anywhere on the card (${JSON.stringify(words.trim())})`);
  ok(!/%/.test(words), 'and no percentage either');

  // The label a screen reader announces is text too, and is the easiest place
  // for a number or a stage name to survive a review.
  const labels = every(tree)
    .map((n) => n.props?.['aria-label'])
    .filter((l) => typeof l === 'string');
  ok(labels.length >= 1, 'the bar tells a screen reader what it is');
  ok(!labels.some((l) => /\d/.test(l) || STAGES.some((s) => new RegExp(`\\b${s}\\b`).test(l))),
     `and says it without a number or a stage name (${JSON.stringify(labels)})`);
}

// ---------------------------------------------------------------------------
// 5. IT IS THEIR GUIDE'S CARD, NOT A GENERIC ONE
// ---------------------------------------------------------------------------
//
// First name only. The full name is already under the photograph directly
// above, and a surname repeated twice on one screen reads as a form letter.
{
  const named = textOf(render({ guideName: 'Maria Santos', states: [{ step: 2, total: 6 }, 33, false] }).tree);
  ok(/\bMaria\b/.test(named), 'the Guide is named');
  ok(!/Santos/.test(named), 'by the name they are called, not the one on the form');

  // SCOPED TO THE HEADLINE, because the sentence under the bar also contains
  // the words "your Guide" -- so a loose search for them passed happily on a
  // component whose greeting read "Walking it with undefined."
  const anon = textOf(render({ guideName: undefined, states: [{ step: 2, total: 6 }, 33, false] }).tree);
  ok(/Walking it with your Guide\./.test(anon),
     'and a missing name still reads as a sentence');
  ok(!/undefined|null/.test(anon), 'rather than leaking what was missing');
}

// ---------------------------------------------------------------------------
// 6. MOVEMENT IS OPTIONAL, THE POSITION IS NOT
// ---------------------------------------------------------------------------
//
// Somebody who has asked their device for less motion gets the true bar and
// none of the animation. Read off the stylesheet the component actually ships,
// with comments removed -- the first version of this check passed on the
// explanation of the rule rather than the rule.
{
  const css = strip(styleText(render({ guideName: 'A', states: [{ step: 3, total: 6 }, 50, false] }).tree));
  ok(/@media \(prefers-reduced-motion: reduce\)/.test(css),
     'the card asks whether this person wants less movement');
  const guard = css.slice(css.indexOf('prefers-reduced-motion'));
  ok(/transition:\s*none/.test(guard), 'and turns off the sliding fill for them');
  ok((guard.match(/animation:\s*none/g) ?? []).length >= 2,
     'along with the shimmer and the pulse');
  ok(/transition:\s*width/.test(css.slice(0, css.indexOf('prefers-reduced-motion'))),
     'while everybody else gets the fill actually moving');
}

// ---------------------------------------------------------------------------
// 7. IT IS ON THE EXPLORER'S SCREEN, UNDER THE PERSON IT IS SHARED WITH
// ---------------------------------------------------------------------------
//
// Every check above passes on a component nobody has mounted.
{
  const page = strip(read('components/live/ExplorerPage.tsx'));
  ok(/<JourneyBar guideName=\{pairing\.dm_name\}/.test(page),
     'the Explorer\'s screen draws the bar, and tells it who they walk with');
  const guideRoom = page.slice(page.indexOf("room === 'guide'"));
  ok(guideRoom.indexOf('<JourneyBar') !== -1
     && guideRoom.indexOf('<JourneyBar') > guideRoom.indexOf('<GuideCard'),
     'directly under the Guide, in the folder that opens first');
}

// ---------------------------------------------------------------------------
// 8. THE OLD GUARANTEE IS NOT QUIETLY WIDENED
// ---------------------------------------------------------------------------
//
// Rule 4 at the top of lib/live/data.ts: an Explorer is never HANDED their own
// stage. The easy way to build this bar was to add journey_stage to the columns
// getMyPairing() selects, and every screen already holding that pairing would
// have had it. This feature is a separate, named channel for exactly that
// reason, and the rule it sits beside has to stay true.
{
  const data = strip(read('lib/live/data.ts'));
  const fn = data.slice(data.indexOf('export async function getMyPairing'));
  const body = fn.slice(0, fn.indexOf('\n}') + 2);
  ok(!/journey_stage/.test(body),
     'getMyPairing still does not hand an Explorer their stage');

  const mine = data.slice(data.indexOf('export async function myJourneyProgress'));
  const progress = mine.slice(0, mine.indexOf('\n}') + 2);
  ok(/select\('journey_stage'\)/.test(progress),
     'the bar reads the stage it needs');
  ok(/return \{ step: at \+ 1, total: STAGE_ORDER\.length \}/.test(progress),
     'and returns a position rather than the name it read');
  ok(!/return[^;]*row\.journey_stage/.test(progress),
     'the name itself never leaves this function');
  ok(/if \(at < 0\) return null/.test(progress),
     'and a stage this build does not know draws nothing rather than the start');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
