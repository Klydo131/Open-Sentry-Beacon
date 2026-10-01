// The composer is on the screen, on a phone.
//
// THE BUG, photographed on an Android phone: a Guide opened a conversation with
// their Explorer and the screen ended mid-sentence, on the line about photo
// sizes. The box to type in and the Send button were below the glass, and
// dragging did not bring them up: the thread fills nearly the whole screen and
// `overscroll-contain` stops a drag inside it from scrolling the page, which is
// correct and left nowhere to pull.
//
// WHY THE OLD VERSION OF THIS FILE PASSED THROUGHOUT. It asserted that certain
// class names appeared in the source. Class names are not geometry, so it went
// green for a card that did not fit, and worse, one of the things it checked
// for was an attribute that never reached the DOM at all: `Card` takes a fixed
// prop list, a JSX attribute with a dash in its name is exempt from excess
// property checking, and `data-live-conversation` was therefore accepted by the
// compiler and dropped on the floor. Every rule written against that selector
// matched nothing.
//
// So this file now checks the three things the fix is actually made of, and
// tests/e2e/conversation-fits-the-glass.js measures the result in a browser.
//
//   node tests/live-conversation-mobile.mjs

import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const conversation = read('components/live/shared.tsx');
const ui = read('components/ui.tsx');
const css = read('app/globals.css');
const guide = read('components/live/GuidePages.tsx');
const explorer = read('components/live/ExplorerPage.tsx');

let bad = 0;
const ok = (condition, message) => {
  console.log(`${condition ? 'OK ' : 'BAD'} ${message}`);
  if (!condition) bad++;
};

// ---- 1. The hook reaches the DOM ------------------------------------------
ok(/'data-live-conversation'\?: boolean;/.test(ui),
   'Card declares the conversation attribute, so it is not silently dropped');
ok(/data-live-conversation=\{liveConversation \? '' : undefined\}/.test(ui),
   'and writes it onto the element the CSS selects');

// ---- 2. The card is bounded by the chrome, not by a fraction ---------------
const rule = css.slice(css.indexOf('[data-live-conversation] {'));
const block = rule.slice(0, rule.indexOf('}'));
ok(/flex-direction:\s*column/.test(block), 'the card is a column');
for (const part of ['--app-header', '--install-bar', '--beacon-chrome-top']) {
  ok(new RegExp(`max-height[^;]*100dvh[^;]*${part.replace(/-/g, '\\-')}`).test(block),
     `its height subtracts ${part}, which a fraction of the viewport cannot know`);
}
ok(/max-height:\s*calc\(100vh/.test(block),
   'with a vh line underneath for anything too old to know dvh');

// Only the thread may give up space, and it must be allowed to shrink below
// its content or the cap achieves nothing.
ok(/\[data-live-conversation\] > :not\(\[data-live-thread\]\)[\s\S]{0,60}flex:\s*0 0 auto/.test(css),
   'the heading, the note and the composer never shrink');
const thread = css.slice(css.indexOf('[data-live-thread] {'));
ok(/flex:\s*1 1 auto/.test(thread.slice(0, 120)), 'the thread takes what is left');
ok(/min-height:\s*0/.test(thread.slice(0, 120)),
   'and may shrink below its content, which is the half that is easy to omit');

// ---- 3. No guessed height survives in the component ------------------------
//
// Read with the comments removed. The note explaining what the old numbers were
// has to name them, and a check that cannot tell an explanation from the thing
// it explains is a check that fails on its own documentation.
const code = conversation
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');
ok(!/55dvh|55vh/.test(code),
   'the thread no longer guesses a fraction of the viewport');
ok(!/min-h-48|sm:min-h-72/.test(code),
   'and carries no minimum that could push the composer back off the glass');
// MEASURED ON `code`, NOT ON THE RAW FILE, and that is the fix rather than a
// bigger number. This read `conversation` -- the source WITH its comments --
// while the two checks directly above it read `code`, whose whole reason for
// existing is stated twelve lines up: "a check that cannot tell an explanation
// from the thing it explains is a check that fails on its own documentation."
//
// That is exactly what happened. A comment added between the element and its
// `overflow-y-auto` pushed the gap to 736 characters and this went red, while
// the thread scrolled perfectly well the entire time. With the prose removed
// the two sit 323 characters apart, so the window is doing what it was meant to
// do -- keeping the class on the same element rather than finding one anywhere
// in the file.
ok(/data-live-thread[\s\S]{0,700}overflow-y-auto/.test(code),
   'message history still scrolls inside its own thread');
ok(/data-live-composer[\s\S]{0,500}safe-area-inset-bottom/.test(conversation),
   'the composer still clears an installed phone’s home indicator');
ok(/<Card className="overflow-hidden" data-live-conversation>/.test(conversation),
   'and the conversation card still carries the attribute all of this hangs on');

// Both roles must use this shared implementation. A one-off phone fix in either
// screen would leave the other role behind. Since 30 September 2026 both roles
// meet it in ONE place: the bubble's surface, drawn for a Guide and an Explorer
// alike (TalkDock lets exactly those two in).
const surface = read('components/live/TalkSurface.tsx');
ok(/import \{ Conversation, Notice, errorText \} from '@\/components\/live\/shared';/.test(surface)
   && /<Conversation/.test(surface),
   'the conversation in the bubble uses the shared responsive component');
ok(/role !== 'ds' && profile\.role !== 'dm'/.test(read('components/live/TalkDock.tsx')),
   'and the bubble is the Guide\'s and the Explorer\'s alike');
ok(!/<Conversation/.test(guide) && !/<Conversation/.test(explorer),
   'and neither page draws a conversation of its own that a phone fix could miss');

console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
process.exit(bad === 0 ? 0 : 1);
