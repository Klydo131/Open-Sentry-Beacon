// Every animation in the app stops for somebody who asked for less movement.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Phones, tablets and computers all have a setting for less
// motion (iOS: Reduce Motion; Android: Remove animations; Windows and macOS
// have their own). People turn it on because movement on a screen makes them
// dizzy or sick, or because it distracts. The app promises it: every
// animation stops, the screens stay the same.
//
// TWO WAYS THAT PROMISE HAS QUIETLY BROKEN HERE BEFORE, and this check holds
// against both of them for every animation, not just the ones somebody
// remembered:
//
//   1. THE SWITCH-OFF CAME FIRST. A `@media (prefers-reduced-motion: reduce)`
//      rule adds no weight, so when it sits ABOVE the rule that starts an
//      animation, the later rule wins and the animation plays anyway. Every
//      chat animation did this until 30 September 2026, under a check that
//      only asked whether a switch-off existed somewhere.
//   2. THE ANIMATION WAS OUT OF REACH. An inline `style={{ animation }}` beats
//      every stylesheet rule, so the tutorial's arrow bobbed for ever for the
//      people who had asked for stillness. Found 1 October 2026 by this check.
//
// WHAT COUNTS AS MOVEMENT. Anything that moves, grows or turns. A pure fade
// (only `opacity` and `visibility` change) is allowed to stay: it is a change
// of light, not of place, and stopping a fade-out can leave a screen covered.
// That is read from each animation's own keyframes, not from a list kept by
// hand, so a fade that later learns to slide is caught.
//
// And the things a stylesheet cannot reach:
//   * a scroll started from code (`behavior: 'smooth'`) goes through
//     scrollMotion() in lib/motion.ts, which asks the setting;
//   * an element animated from code (`el.animate(...)`) is animated only in
//     lib/motion.ts, behind prefersLessMotion();
//   * Tailwind's moving built-ins (spin, bounce, ping) carry `motion-safe:`.
//
// Plus the motion scale: the three lengths in app/globals.css (--motion-quick,
// --motion-base, --motion-slow) and in lib/motion.ts are the same numbers.
//
//   node tests/every-animation-can-be-stilled.mjs
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

// ---- Where the code lives ---------------------------------------------------

function sourceFiles(dirs, pattern) {
  const out = [];
  const walk = (dir) => {
    if (!fs.existsSync(path.join(root, dir))) return;
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') walk(rel); continue; }
      if (pattern.test(entry.name)) out.push(rel);
    }
  };
  dirs.forEach(walk);
  return out;
}

const code = sourceFiles(['app', 'components', 'lib'], /\.(tsx|ts)$/);

// Every stylesheet: the .css files, and the <style> blocks components carry
// (the journey bar keeps its own).
const sheets = [];
for (const file of sourceFiles(['app', 'components'], /\.css$/)) sheets.push({ file, css: read(file) });
for (const file of code) {
  for (const m of read(file).matchAll(/<style>\{`([\s\S]*?)`\}<\/style>/g)) sheets.push({ file, css: m[1] });
}

// ---- A small CSS reader -----------------------------------------------------
// Comments become spaces, so every position still points at the same place.
// It yields each rule with its selectors, its declarations, where it is, and
// whether it sits inside a reduced-motion block; and each @keyframes body.

function readCss(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => ' '.repeat(c.length));
  const rules = [];
  const keyframes = new Map();

  const close = (open) => {
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
      if (text[i] === '{') depth += 1;
      else if (text[i] === '}') { depth -= 1; if (depth === 0) return i; }
    }
    return text.length;
  };

  const block = (from, to, reduce) => {
    let at = from;
    while (at < to) {
      const open = text.indexOf('{', at);
      if (open < 0 || open >= to) return;
      const prelude = text.slice(at, open).replace(/[\s;]+/g, ' ').trim();
      const end = close(open);
      if (prelude.startsWith('@keyframes')) {
        keyframes.set(prelude.split(' ')[1], text.slice(open + 1, end));
      } else if (prelude.startsWith('@media') || prelude.startsWith('@supports')) {
        block(open + 1, end, reduce || /prefers-reduced-motion:\s*reduce/.test(prelude));
      } else if (prelude && !prelude.startsWith('@')) {
        rules.push({
          at: open,
          reduce,
          selectors: prelude.split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
          body: text.slice(open + 1, end),
        });
      }
      at = end + 1;
    }
  };

  block(0, text.length, false);
  return { rules, keyframes };
}

/** The keyframe names an `animation:` value uses, if any it plays. */
function playing(body, keyframes) {
  const names = [];
  for (const m of body.matchAll(/(?:^|[;\s])animation(?:-name)?\s*:\s*([^;]+)/g)) {
    const value = m[1].trim();
    if (/^none\b/.test(value)) continue;
    for (const part of value.split(',')) {
      const name = part.trim().split(/\s+/).find((t) => keyframes.has(t));
      names.push(name ?? part.trim().split(/\s+/)[0]);
    }
  }
  return names;
}

/** Only light changes, nothing moves: every property is opacity or visibility. */
function isFade(name, keyframes) {
  const body = keyframes.get(name);
  if (!body) return false;
  const props = [...body.matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
  return props.length > 0 && props.every((p) => p === 'opacity' || p === 'visibility');
}

// ---- 1. Every moving animation is stopped, AFTER it is started ---------------

{
  let moving = 0;
  let fades = 0;
  const loose = [];
  const reducedMoves = [];

  for (const { file, css } of sheets) {
    const { rules, keyframes } = readCss(css);
    const lastOn = new Map();

    for (const rule of rules) {
      const names = playing(rule.body, keyframes);
      if (!names.length) continue;
      const fade = names.every((n) => isFade(n, keyframes));
      if (rule.reduce) {
        // An animation INSIDE a reduced-motion block is the calmer stand-in
        // (the spinner's label breathes instead of the spinner turning). It
        // may only ever be a fade.
        if (!fade) reducedMoves.push(`${file}: ${rule.selectors.join(', ')} moves (${names.join(', ')}) inside a reduced-motion block`);
        continue;
      }
      if (fade) { fades += 1; continue; }
      for (const s of rule.selectors) lastOn.set(s, Math.max(lastOn.get(s) ?? -1, rule.at));
    }

    for (const [selector, on] of lastOn) {
      moving += 1;
      const stopped = rules.some((r) => r.reduce && r.at > on && r.selectors.includes(selector)
        && /(?:^|[;\s])animation(?:-name)?\s*:\s*none\b/.test(r.body));
      if (!stopped) loose.push(`${file}: ${selector}`);
    }
  }

  ok(moving >= 20, `found ${moving} moving animations to hold to this (and ${fades} fades, which may stay)`);
  ok(loose.length === 0,
     loose.length
       ? `these still move for somebody who asked for less movement -- each needs \`animation: none\` in a prefers-reduced-motion block AFTER the rule that starts it:\n      ${loose.join('\n      ')}`
       : 'every moving animation is switched off under prefers-reduced-motion, after it is switched on');
  ok(reducedMoves.length === 0,
     reducedMoves.length
       ? `a reduced-motion stand-in moves:\n      ${reducedMoves.join('\n      ')}`
       : 'and the stand-ins inside reduced-motion blocks only fade');
}

// ---- 2. Transitions and the page's own scrolling ----------------------------
// One rule in the reduced block covers every transition there is, inline ones
// included: `!important` in a stylesheet outranks a style attribute.

{
  const { rules } = readCss(read('app/globals.css'));
  ok(rules.some((r) => r.reduce && r.selectors.includes('*')
       && /transition-duration:\s*0\.01ms\s*!important/.test(r.body)),
     'every transition is cut to nothing under prefers-reduced-motion (`*`, !important)');
  ok(rules.some((r) => r.reduce && r.selectors.includes('html') && /scroll-behavior:\s*auto/.test(r.body)),
     'and the page jumps instead of gliding to an anchor');
}

// ---- 3. What a stylesheet cannot reach --------------------------------------

{
  const strip = (src) => src.replace(/<style>\{`[\s\S]*?`\}<\/style>/g, '');
  const inline = [];
  const tailwind = [];
  const smooth = [];
  const animate = [];
  for (const file of code) {
    const src = strip(read(file));
    // `style={{ animation: '...' }}`: beyond every stylesheet rule.
    if (/\banimation(?:Name)?\s*:\s*['"`]/.test(src)) inline.push(file);
    for (const m of src.matchAll(/(\S*)\banimate-(spin|bounce|ping)\b/g)) {
      if (!/motion-safe:$/.test(m[1])) tailwind.push(`${file}: animate-${m[2]}`);
    }
    if (file !== 'lib/motion.ts' && /behavior:\s*['"]smooth['"]/.test(src)) smooth.push(file);
    if (file !== 'lib/motion.ts' && /\.animate\(\s*\[/.test(src)) animate.push(file);
  }
  ok(inline.length === 0,
     inline.length ? `an inline animation no reduced-motion rule can reach: ${inline.join(', ')}`
                   : 'no animation is set inline, where a stylesheet could not stop it');
  ok(tailwind.length === 0,
     tailwind.length ? `Tailwind animations without motion-safe: ${tailwind.join(', ')}`
                     : "Tailwind's spin, bounce and ping are all motion-safe:");
  ok(smooth.length === 0,
     smooth.length ? `a scroll that glides whatever the setting says (use scrollMotion()): ${smooth.join(', ')}`
                   : 'every scroll started from code asks scrollMotion() how to travel');
  ok(animate.length === 0,
     animate.length ? `an element animated from code outside lib/motion.ts: ${animate.join(', ')}`
                    : 'elements are animated from code only in lib/motion.ts');

  const motion = read('lib/motion.ts');
  const fadeIn = motion.slice(motion.indexOf('export function fadeInAfter'));
  ok(/prefersLessMotion\(\)/.test(fadeIn.slice(0, fadeIn.indexOf('.animate('))),
     'and fadeInAfter asks prefersLessMotion() before it animates anything');
  const presence = motion.slice(motion.indexOf('export function usePresence'), motion.indexOf('export function fadeInAfter'));
  ok(/prefersLessMotion\(\)/.test(presence),
     'usePresence lets a panel go at once under reduced motion');
  ok(/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/.test(motion),
     'prefersLessMotion reads the same media query as the stylesheet');
}

// ---- 4. One motion scale, in CSS and in code --------------------------------

{
  const css = read('app/globals.css');
  const motion = read('lib/motion.ts');
  for (const size of ['quick', 'base', 'slow']) {
    const inCss = css.match(new RegExp(`--motion-${size}:\\s*(\\d+)ms`))?.[1];
    const inTs = motion.match(new RegExp(`\\b${size}:\\s*(\\d+)`))?.[1];
    ok(inCss && inCss === inTs, `--motion-${size} is ${inCss ?? '?'}ms in globals.css and ${inTs ?? '?'} in lib/motion.ts`);
  }
  ok(/--ease-settle:/.test(css) && /--ease-leave:/.test(css), 'and the two curves, settle and leave, are tokens');
}

// ---- 5. The pieces that use it ----------------------------------------------

{
  const panel = read('components/AnchoredPanel.tsx');
  ok(/leaving \? 'anchored-out' : 'anchored-in'/.test(panel),
     'a panel hanging off a button comes in from it and goes back into it');
  for (const f of ['LiveBell', 'NotificationBell', 'RoleSwitcher', 'ModeSwitch']) {
    const src = read(`components/${f}.tsx`);
    ok(/const panel = usePresence\(open\)/.test(src) && /\{panel\.mounted && \(/.test(src) && /leaving=\{panel\.leaving\}/.test(src),
       `${f} keeps its panel on the screen while it leaves`);
  }
  const menu = read('components/SubroomMenu.tsx');
  ok(/requestAnimationFrame\(\(\) => fadeInAfter\(from\)\)/.test(menu),
     'choosing another room fades the new one in, a frame after it is drawn');
  ok(/className="quest-arrow /.test(read('components/Quest.tsx')),
     "the tutorial's arrow bobs from a class a reduced-motion rule can stop");
  const dock = read('components/talk/Dock.tsx');
  ok(/const LEAVE_MS = MOTION\.quick \+ \d+;/.test(dock),
     "the chat waits for its own exit by the scale's number, not a copy of it");
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
