// The chat is a bubble on every screen, not a room you navigate to.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. The dock was `hidden xl:block`, so only a screen 1280px or
// wider ever got the floating chat. Everybody else was sent to /talk -- a PAGE,
// which means leaving whatever you were reading and losing the place you had
// scrolled to, every time you want to see whether somebody replied. On a phone
// that is most of the app's use.
//
// Reported from a phone, with a screenshot: "I dont like this as a separate sub
// room on the phone or pad, I want it as a bubble like what you did at desktop
// and mac."
//
// THE OLD REASONING WAS HALF RIGHT, and the half that was right is kept. The
// file's own comment defended the fence: "a small floating panel on a small
// screen covers the thing it floats over, which is why the phone does not get
// one." True. What it missed is that the panel does not have to be small --
// collapsed it is a bubble covering almost nothing, and opened it takes the
// whole screen, the way a conversation does in every messaging app people
// already use. Neither the objection nor the request had to lose.
//
// WHY A FENCE IS WHAT THIS CHECKS. A `hidden xl:block` is one token. It is
// invisible in review, it produces no error, and the feature simply does not
// exist for most people while looking completely finished in the source. The
// same shape hid the library's "who already has this" chip behind
// `pairings.length === 1` for its whole life, and the check written over that
// one pinned the spelling instead of the behaviour, so it stayed green
// throughout. This one names the fence.
//
//   node tests/the-chat-is-a-bubble-everywhere.mjs
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

const dock = read('components/live/TalkDock.tsx');
// THE BUBBLE'S FRAME IS SHARED NOW (30 September 2026): the bubble, the sheet
// and the header are components/talk/Dock.tsx, drawn by the live bubble and by
// the sample app's (components/DemoTalkDock.tsx). The shape rules below read
// the frame; who gets a bubble, and where not, is still TalkDock's.
const frame = read('components/talk/Dock.tsx');
const demo = read('components/DemoTalkDock.tsx');
const css  = read('app/globals.css');

/** The source with comments stripped, so prose about a rule is not the rule. */
const blank = (src) => src.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g,
                          (m) => ' '.repeat(m.length));
const code = blank(frame);
const who = blank(dock);

ok(/<TalkSheet\b/.test(who) && /<TalkBubble\b/.test(who) && /<TalkSheet\b/.test(blank(demo)) && /<TalkBubble\b/.test(blank(demo)),
   'both halves of the app draw the same bubble and the same sheet');

// ---------------------------------------------------------------------------
// 1. THE FENCE IS GONE
// ---------------------------------------------------------------------------
//
// THE WHOLE POINT OF THE FILE. Measured on the code with comments blanked, so
// the paragraph above explaining `hidden xl:block` does not read as the thing
// itself -- which would make this check pass by being described.
{
  ok(!/hidden\s+xl:block/.test(code),
     'the dock is not hidden below xl any more, so a phone gets the bubble');

  // THE TWO REMAINING `hidden`s ARE NAMED, NOT COUNTED AROUND. The first draft
  // of this check was a regex that excluded them by matching their exact class
  // strings -- which is a check that fails the moment somebody reorders two
  // Tailwind classes, and whose only possible repair is to loosen it. Both are
  // listed here instead, so adding a third is a visible edit to this line.
  //
  //   hidden font-bold sm:inline                       the word beside the bubble
  //   hidden px-2 ... xl:inline-block                  "Open full"
  //
  // Neither hides the CHAT. One hides a label on a narrow screen, the other
  // hides a button that would do nothing there.
  {
    // NOT `\bhidden\b`, WHICH THE FIRST DRAFT USED AND WHICH COUNTED FIVE.
    // A hyphen is a word boundary, so that also matched `overflow-hidden` and
    // two `aria-hidden`s -- none of which hides anything from anybody. Only the
    // standalone Tailwind display utility counts, so the match requires
    // whitespace or a quote on both sides.
    const fences = (code.match(/(?:^|[\s"'`])hidden(?=[\s"'`])/g) ?? []).length;
    ok(fences === 2,
       `only the two deliberate ones are left: the word and "Open full" (found ${fences})`);
  }
}

// ---------------------------------------------------------------------------
// 2. OPEN MEANS THE WHOLE SCREEN ON A PHONE, AND A CORNER PANEL ON A DESKTOP
// ---------------------------------------------------------------------------
//
// The distinction the old comment was right about. `inset-0` unqualified is the
// phone and pad case; the `xl:` overrides put it back in the corner where there
// is room for the page beside it.
{
  ok(/fixed inset-0/.test(code),
     'opened, it covers the screen it is on');
  ok(/xl:inset-auto/.test(code) && /xl:bottom-4/.test(code) && /xl:right-4/.test(code),
     'and goes back to the corner on a desktop, where the page can sit beside it');
  ok(/xl:h-\[32rem\]/.test(code) && /xl:w-\[22rem\]/.test(code),
     'at the size it already had there, which nobody asked to change');
  ok(/h-full w-full/.test(code),
     'while filling the sheet below that');
}

// ---------------------------------------------------------------------------
// 3. AND IT CLEARS THE NOTCH AT BOTH ENDS
// ---------------------------------------------------------------------------
//
// A full-screen overlay is the one place in this app where BOTH safe areas
// matter: nothing else reaches the top edge, so `.safe-bottom` alone was
// always enough until now.
//
// THE TOP ONE IS THE EASY ONE TO FORGET, because it costs nothing on the
// desktop the work is done on and hides the header behind the clock on the
// phone it ships to.
{
  ok(/\.talk-sheet\s*\{[^}]*padding-top:\s*env\(safe-area-inset-top/s.test(css),
     'the sheet keeps its header out from under the status bar and the notch');
  ok(/\.talk-sheet\s*\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom/s.test(css),
     'and its composer off the home indicator');
  ok(/@media \(min-width: 1280px\)\s*\{\s*\.talk-sheet/s.test(css),
     'and drops both where it is a corner panel instead, which has no notch to clear');

  // AN iPAD PRO IN LANDSCAPE IS 1366 CSS PIXELS. It takes the xl branch and it
  // has a home indicator, so the corner panel needs the inset that the sheet
  // does not.
  // Since the bottom bar is on a desktop too (30 September 2026), the corner
  // panel stands on it: the taller of the inset and the bar.
  ok(/xl:\[margin-bottom:max\(env\(safe-area-inset-bottom,0px\),var\(--tab-bar,0px\)\)\]/.test(code),
     'and the corner panel still clears the home indicator on a large pad, and stands on the bottom bar');
}

// ---------------------------------------------------------------------------
// 4. THE THINGS THAT WERE ALREADY RIGHT, STILL RIGHT
// ---------------------------------------------------------------------------
{
  ok(/if \(path === '\/talk'\) return null;/.test(who),
     'no bubble on the chat’s own page, which would be a second copy of it');
  ok(/profile\.role !== 'ds' && profile\.role !== 'dm'/.test(who),
     'and only for the two roles that have a conversation at all');

  // THE COUNT IS WHY THE BUBBLE IS WORTH ITS SPACE. Without it this is a button
  // that says nothing until you press it, which is the thing it replaced.
  ok(/total > 99 \? '99\+' : total/.test(code),
     'the waiting count is still on the bubble');

  // THE WORD IS HIDDEN ON A PHONE, so the button must say its own name.
  ok(/aria-label=\{total > 0 \? `Talk, \$\{total\} waiting` : 'Talk'\}/.test(code),
     'and the bubble is named for a screen reader, since the word is hidden at that size');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
