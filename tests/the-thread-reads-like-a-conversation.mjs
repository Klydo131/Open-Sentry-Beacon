// The thread reads like a conversation, not like a stack of records.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Asked for plainly, from a phone: "How can we improve the
// design and UI of chat right now, something is still missing I assume."
//
// Nothing was missing. The proportions were wrong, and measuring the screenshot
// against a 412px phone says so exactly:
//
//     the "Private conversation" banner     ~109 CSS px
//     the photo-guidance note                ~95 CSS px
//     ONE ACTUAL MESSAGE                     ~91 CSS px
//
// Two permanent explanations took more than twice the room of the conversation
// they explained, on every thread, forever. And inside the thread every single
// bubble carried the speaker's name AND its own timestamp, so four short
// replies from one person produced four names and four clock times around
// about a dozen words.
//
// THE THREE THINGS THAT FIXES, and they are one idea: give the words the room,
// and let the layout carry what the labels were repeating.
//
//   1. A run of messages from one person is one piece of talking. The name goes
//      on the first, the time on the last, nothing in between.
//   2. A divider says where one day becomes the next, so the date can come off
//      every bubble that was not from today.
//   3. The photo note appears when somebody reaches for the paperclip -- which
//      is what its own comment always claimed it did.
//
//   node tests/the-thread-reads-like-a-conversation.mjs
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

// The thread is drawn by ONE component for both halves since 1 October 2026
// (components/talk/ChatView.tsx), with its time rules in lib/talk/thread.ts.
const src = read('components/talk/ChatView.tsx') + '\n' + read('lib/talk/thread.ts');
/** Comments blanked, so prose describing a rule is never mistaken for the rule.
 *  The same lesson tests/live-conversation-mobile.mjs states at the top of its
 *  own file -- and then failed to apply to one of its own assertions, which is
 *  how a comment added in this very chunk turned it red. */
const code = src.replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
                         (m) => ' '.repeat(m.length));

// ---------------------------------------------------------------------------
// 1. A RUN OF MESSAGES IS ONE PIECE OF TALKING
// ---------------------------------------------------------------------------
{
  ok(/const startsRun =/.test(code) && /const endsRun =/.test(code),
     'the thread knows where somebody starts and stops talking');

  // THE NAME IS SAID ONCE PER RUN, AND ONLY TO A SCREEN READER. In a
  // conversation between two people the side a bubble sits on says who is
  // speaking, and the header names the other person (owner's choice, 1 October
  // 2026). A screen reader cannot see sides, so it is told at the start of
  // each run -- never on all four messages.
  ok(/\{startsRun && <span className="sr-only">\{mine \? 'You:'/.test(code),
     'the speaker is said on the first message of a run, not on all four');

  ok(/endsRun \? clockTime\(entry\.at\)/.test(code),
     'and the time is on the last, where the run actually ended');

  // THE GAP MATTERS AS WELL AS THE SPEAKER. Two messages from one person three
  // hours apart are not one breath, and grouping them would hide that the
  // second was an afterthought hours later.
  // BOUND TO ITS USE, NOT MERELY PRESENT. The first version of this check
  // tested `/SAME_BREATH_MS/` against the whole file -- and when the time
  // comparison was deleted from `runsOn` on purpose, it stayed green, because
  // the constant is still DECLARED at the top of the file whether or not
  // anything reads it. A check that confirms a name exists somewhere is the
  // same mistake as the one that pinned a chip's spelling instead of its
  // behaviour, and it is the third time in two days. So the comparison itself
  // is what gets asserted.
  ok(/function runsOn[\s\S]{0,400}getTime\(\)[\s\S]{0,120}SAME_BREATH_MS/.test(code),
     'a long gap breaks a run even when the same person is talking');

  // A NEW DAY ALWAYS BREAKS A RUN. 23:59 and 00:02 are four minutes apart and
  // are not the same conversation.
  ok(/const startsRun = newDay \|\| !runsOn\(prev, entry\)/.test(code),
     'and so does a new day, however close the two clock times are');
}

// ---------------------------------------------------------------------------
// 2. THE DAY IS SAID ONCE, NOT ON EVERY BUBBLE
// ---------------------------------------------------------------------------
{
  ok(/function dayLabel/.test(code) && /function dayKey/.test(code),
     'the thread can name a day and tell two days apart');

  ok(/'Today'/.test(code) && /'Yesterday'/.test(code),
     'and says Today and Yesterday rather than making somebody read a date');

  ok(/weekday: 'long'/.test(code),
     'with the weekday inside the last week, which is how people remember it');

  ok(/sticky top-0/.test(code),
     'the divider sticks, so scrolling back always says which day you are in');

  // THE HALF THAT MAKES THE DIVIDER WORTH HAVING. The date used to ride along
  // on every message not from today. With a divider above, repeating it on each
  // bubble is the noise the divider was added to remove.
  ok(!/month: 'short', day: 'numeric', hour: 'numeric'/.test(code),
     'and a bubble carries the clock time only, because the divider has the date');
}

// ---------------------------------------------------------------------------
// 3. THE PHOTO NOTE APPEARS WHERE THE DECISION IS MADE
// ---------------------------------------------------------------------------
//
// Its comment always said "SAID ONCE, WHERE THE DECISION IS MADE". It rendered
// permanently. The comment described the intention and the code did something
// else, and nothing could tell them apart until somebody photographed it.
{
  // NARROWING IS ALLOWED, WIDENING IS NOT. This pinned the gate character for
  // character, so the day the note became dismissible -- a second reason to
  // keep it off the screen -- the check read the extra condition as a
  // violation and refused a commit that made the rule STRONGER. That is the
  // second time in this repository that an exact-expression pin has blocked
  // its own intention. The rule is "the paperclip opens it", so the paperclip
  // is what gets asserted; further `&&` conditions may only take the note away
  // sooner. The alternation stays spelled out, so a condition joined with `||`
  // -- which could put the note back without the paperclip -- still fails.
  ok(/\{onAttach && (?:[A-Za-z][\w.]* && )*(?:attaching|\(attaching \|\| files\.length > 0\)) && \(/.test(code),
     'the photo guidance waits until somebody reaches for the paperclip');

  ok(/setAttaching\(true\)/.test(code),
     'and the paperclip is what opens it');

  // THE PRIVACY HALF MUST BE READABLE BEFORE CHOOSING, not after uploading.
  // Tying it to the tap rather than to a finished upload is what keeps that
  // true, so the words are checked as well as the condition.
  ok(/location your camera\s*\n?\s*recorded is removed/.test(src),
     'and it still says the location is stripped, which is the part to read first');
}

// ---------------------------------------------------------------------------
// 4. THE PRIVACY PROMISE IS KEPT, AT EVERY SIZE
// ---------------------------------------------------------------------------
//
// THE THING THIS CHUNK MOST EASILY GETS WRONG. "Only the two people walking
// together can read this" is a privacy promise, and for somebody bringing a
// hard thing to their Guide it may be the most important sentence on screen.
// Reclaiming space must never have quietly deleted it on the small screen where
// space was tight -- which is the obvious, wrong way to have done this.
{
  ok(/Only the two people walking together can read this\./.test(src),
     'the promise is still there');
  ok(!/hidden sm:block[^>]*>\s*Only the two people/.test(src),
     'and is not hidden on a phone, which is where it matters most');
  // In rem since 1 October 2026, so it follows the Text size setting (13px at normal).
  ok(/<h2 className="text-\[0\.722rem\] font-extrabold leading-tight text-navy sm:text-base">/.test(code),
     'it is made smaller on a narrow screen rather than removed from it');
}

// ---- Readable by everybody who uses it (design review, 1 October 2026) ------
//
// The chat set its sizes in pixels, so Settings -> Text size, which scales the
// rem every other screen uses, left the messages exactly as small as they were.
// And its smallest print -- the time, "Seen", the empty line -- was 11px at
// about 4:1, or paler. These hold the fixes: sizes in rem, nothing read below
// 13px at normal size, the secondary text dark enough for AA, the controls
// people tap given 44px to land in, and the message field never under 16px,
// which is what makes an iPhone zoom the page when it is tapped.
{
  const talk = ['ChatView', 'ChatAttachment', 'Composer', 'MessageMenu']
    .map((n) => [n, read(`components/talk/${n}.tsx`)]);
  const px = talk.flatMap(([n, t]) => [...t.matchAll(/text-\[([0-9.]+)px\]/g)].map((m) => `${n}: ${m[0]}`));
  ok(px.length === 0, px.length ? `font sizes still in pixels: ${px.join(', ')}` : 'every chat font size is in rem, so Text size reaches it');
  const tiny = talk.flatMap(([n, t]) => [...t.matchAll(/text-\[([0-9.]+)rem\]/g)]
    .filter((m) => Number(m[1]) < 0.72).map((m) => `${n}: ${m[0]}`));
  ok(tiny.length === 0, tiny.length ? `below 13px: ${tiny.join(', ')}` : 'and nothing is smaller than 13px at normal size');
  const composer = talk.find(([n]) => n === 'Composer')[1];
  ok(/text-\[length:max\(16px,/.test(composer), 'the message field never drops under 16px');
  const faint = talk.filter(([n]) => n !== 'Composer')
    .flatMap(([n, t]) => [...t.matchAll(/text-(?:slate|gray)-(?:300|400)\b/g)].map((m) => `${n}: ${m[0]}`));
  ok(faint.length === 0, faint.length ? `text too pale to read: ${faint.join(', ')}` : 'no chat text is slate-400 or paler');
  ok(/text-\[#9A5A1C\]/.test(src) && !/text-\[#C2762B\]/.test(src), 'their name on a quoted reply is a dark enough amber (5.2:1)');
  ok(/chat-more grid h-11 min-h-0 w-11/.test(src), 'the ⋯ button is 44px');
  ok(/before:-inset-y-2\.5/.test(src) && /data-reactions/.test(src), 'the reaction pill has a 44px hit area round it');
  ok(/type="range"[\s\S]{0,400}className="block h-11 w-full/.test(talk.find(([n]) => n === 'ChatAttachment')[1]),
     'and the voice message\'s position bar is 44px tall to grab');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
