// One way into the chat, it lets a Guide choose who, and it moves when touched.
//
// ---------------------------------------------------------------------------
// THREE THINGS, ASKED FOR TOGETHER, WITH THE CHAT ICON CIRCLED IN RED ON A
// PHONE SCREENSHOT: "you can take out the chat room now since we already have
// the bubble, make sure that Bubble have choices of Explorers for Guides since
// Guides have multiple explorers to chat. Make some little animations at least
// for chat when you tap or click it for a better UI experience please, let's
// not make our web app static."
//
// 1. ONE WAY IN. The navigation carried a Talk row that opened /talk as a page.
//    An icon in the navigation is a PLACE YOU GO: tapping it left whatever you
//    were reading and threw away where you had scrolled to. Once the bubble
//    worked at every size and opened OVER the page, that row was a second and
//    worse way in to the same conversation.
//
// 2. THE CHOICE WAS ALREADY THERE, and this file is where that is recorded
//    rather than rebuilt. TalkSurface auto-opens a thread only when there is
//    exactly one, and shows the list with its unread counts otherwise. The
//    risk is the opposite of the request: somebody "simplifying" the surface
//    later by always opening the first thread would strand a Guide in one
//    conversation with no way to reach the other four, and nothing would error.
//
// 3. MOTION WITH A JOB. Not decoration -- each of the three says something the
//    static version left somebody to work out. And all of it stops under
//    prefers-reduced-motion, which is the half that is easy to forget because
//    it costs nothing on the machine the work is done on.
//
//   node tests/the-chat-is-the-bubble-and-it-moves.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
/** Comments blanked. Four checks in this project have now passed on prose. */
const strip = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
                                   (m) => ' '.repeat(m.length));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const shell   = strip(read('components/LiveAppShell.tsx'));
const dock    = strip(read('components/live/TalkDock.tsx'));
const surface = strip(read('components/live/TalkSurface.tsx'));
const thread  = strip(read('components/live/shared.tsx'));
const css     = read('app/globals.css');
// The bubble, the sheet, the header and the list are one shared frame since
// 30 September 2026, drawn by both halves of the app.
const frame   = strip(read('components/talk/Dock.tsx'));

// ---------------------------------------------------------------------------
// 1. ONE WAY IN
// ---------------------------------------------------------------------------
{
  ok(!/href: '\/talk'/.test(shell),
     'the navigation no longer carries a chat room that costs you your page');
  ok(/<TalkDock \/>/.test(shell),
     'and the bubble is mounted once in the shell, so the chat is still everywhere');

  // THE ROUTE SURVIVES, and that is not an oversight. "Open full" goes there on
  // a desktop, where a 22rem corner panel genuinely is small, and somebody may
  // have it bookmarked. What was removed is the standing invitation to leave.
  ok(fs.existsSync(path.join(root, 'app/talk/page.tsx')),
     'the route itself is still there, for Open full and for a bookmark');
  ok(/router\.push\('\/talk'\)/.test(dock),
     'and the desktop panel can still hand over to it');
}

// ---------------------------------------------------------------------------
// 2. A GUIDE WITH FIVE EXPLORERS CAN REACH ALL FIVE
// ---------------------------------------------------------------------------
//
// THE FAILURE THIS PREVENTS IS SILENT. Auto-opening the first thread whenever
// one exists would look tidier and would strand a Guide in one conversation
// with no way back to the others. Nothing would error; they would simply never
// see the other four.
{
  ok(/return rows\.length === 1 \? rows\[0\]\.pairing_id : '';/.test(surface),
     'a thread opens by itself ONLY when there is exactly one of them');

  ok(/const several = threads\.length > 1;/.test(surface)
     && /onBack=\{several && active \?/.test(surface),
     'and with more than one there is a way back to the list');

  ok(/!active \? \([\s\S]{0,160}<ThreadList/.test(surface),
     'the list is what a Guide sees before they have chosen anybody');

  // THE COUNT PER PERSON is what makes the list worth opening: a Guide at the
  // cap can see WHICH of the five is waiting without opening all five.
  ok(/t\.unread > 0 && \(/.test(frame),
     'each person in the list carries their own waiting count');
  ok(/aria-label=\{`\$\{t\.unread\} waiting`\}/.test(frame),
     'and the count is announced, not only coloured');
}

// ---------------------------------------------------------------------------
// 3. IT MOVES WHEN YOU TOUCH IT
// ---------------------------------------------------------------------------
{
  for (const name of ['talkPanelIn', 'talkSheetIn', 'talkMessageIn', 'talkViewForward', 'talkViewBack', 'talkCountPop']) {
    ok(new RegExp(`@keyframes ${name}`).test(css), `there is a ${name} animation`);
  }

  ok(/talk-panel-in/.test(frame) && /talk-panel-out/.test(frame),
     'the panel animates as it opens, and as it closes');
  ok(/talk-bubble/.test(frame),
     'and the bubble dips under the finger');
  // Asked for on 30 September 2026: "smooth animations too".
  ok(/talk-view-\$\{direction\}/.test(frame) && /key=\{view\}/.test(frame),
     'the list and a conversation slide past each other, the way you went');
  ok(/total > before\.current/.test(frame) && /talk-count-pop/.test(frame),
     'and the count on the bubble pops when it goes up, and only then');
  ok(/<TalkSheet\b/.test(dock) && /<TalkBubble\b/.test(dock),
     'the live bubble is drawn by that frame');

  // ONLY THE NEWEST ROW. This thread reloads wholesale, so animating every
  // entry would flicker the whole conversation whenever anything changed.
  ok(/isNewest \? 'talk-message-in' : ''/.test(thread),
     'only the newest message animates, so the thread does not flicker on reload');

  // TRANSFORM, NOT LAYOUT. Animating width or padding reflows the page behind
  // the bubble on every single press.
  // ASSERTED ON THE RULE, NOT ON A SLICE FROM THE FIRST MATCH. The first
  // `.talk-bubble` in this stylesheet is the one inside the reduced-motion
  // block, which appears EARLIER in the file than the rule it turns off -- so
  // slicing from it read `transform: none` and reported the press as missing.
  // A check that depends on the order two rules happen to sit in is a check
  // that will go red for the wrong reason later.
  ok(/\.talk-bubble:active:not\(:disabled\)\s*\{\s*transform: scale\(/.test(css),
     'the press is a transform, so it never reflows the page behind it');
  ok(/\.talk-bubble\s*\{\s*transition: transform/.test(css),
     'and it is transform that transitions, not width or padding');
}

// ---------------------------------------------------------------------------
// 4. AND ALL OF IT STOPS FOR SOMEBODY WHO ASKED FOR STILLNESS
// ---------------------------------------------------------------------------
//
// THE HALF THAT COSTS NOTHING TO FORGET. Reduced motion is off on the machine
// this was written on, so a missing rule here is invisible until it reaches
// somebody who gets motion sick from it.
{
  // AFTER THE RULE IT SWITCHES OFF, NOT MERELY SOMEWHERE. A media query adds no
  // weight, so of two rules with the same selector the LATER one wins -- and
  // until 30 September 2026 the only block that stopped these sat above the
  // rules that start them, so every one of them still played for people who
  // had asked for less movement. This check read "somewhere in a reduced-motion
  // block" and stayed green throughout. It now asks for the order that works.
  const reducedBlocks = [...css.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{/g)].map((m) => {
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < css.length && depth > 0) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') depth -= 1;
      i += 1;
    }
    return { at: m.index, body: css.slice(m.index, i) };
  });
  for (const cls of ['.talk-panel-in', '.talk-panel-out', '.talk-message-in', '.talk-view-forward', '.talk-view-back', '.talk-count-pop']) {
    const esc = cls.replace(/[.-]/g, (c) => `\\${c}`);
    // The last place it is switched ON: `.cls {` ... `animation:`, not inside a reduced block.
    const ons = [...css.matchAll(new RegExp(`(^|\\n)\\s*${esc}\\s*\\{[^}]*animation:\\s*(?!none)`, 'g'))]
      .map((m) => m.index)
      .filter((at) => !reducedBlocks.some((b) => at > b.at && at < b.at + b.body.length));
    const lastOn = Math.max(...ons, -1);
    const offAfter = reducedBlocks.some((b) => b.at > lastOn && b.body.includes(cls) && /animation:\s*none/.test(b.body));
    ok(lastOn >= 0 && offAfter, `${cls} is switched off under prefers-reduced-motion, after it is switched on`);
  }
  const lastPress = css.lastIndexOf('.talk-bubble:active:not(:disabled) {\n  transform: scale(');
  ok(reducedBlocks.some((b) => b.at > lastPress
       && /\.talk-bubble:active:not\(:disabled\)\s*\{\s*transform: none;/.test(b.body)),
     'including the press, which is a transition rather than an animation');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
