// A note somebody has read once can be put away.
//
// ---------------------------------------------------------------------------
// ASKED FOR WITH A SCREENSHOT, both banners ringed in red: "i always need a
// fullscreen for messages please, make an option to exit or x on the red
// circles. It takes out the user's experience."
//
// The arithmetic is the argument. On that phone the two notes take roughly a
// fifth of the glass on EVERY conversation, FOREVER, to say two things that are
// true once. A promise repeated past the point of being read stops being a
// promise and becomes furniture.
//
// THE PART THIS FILE EXISTS TO HOLD. Dismissing a note must never be mistaken
// for removing what it describes:
//
//   * The conversation is private because `messages_read` is
//     `in_pairing(pairing_id)`, and for no other reason.
//   * Photographs are stripped of their location by the upload path.
//   * BOTH are stated in the privacy notice, which is where they bind. That
//     page is checked here, so a later tidy-up cannot quietly delete the
//     promise along with the banner and leave the app claiming neither.
//
// The rest is the mechanics that make a dismissal stick without breaking a
// private window or the server render.
//
//   node tests/a-note-read-once-can-be-put-away.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const shared = strip(read('components/live/shared.tsx'));

// Both notes, not just the one that was easy to reach.
const puts = (shared.match(/<PutAway\b/g) ?? []).length;
ok(puts === 2, `both notes carry a way to put them away (${puts} of 2)`);
ok(/\{showPrivacy && \(/.test(shared),
   'the privacy note can be put away');
ok(/showPhotoNote &&/.test(shared),
   'and so can the photo note');

// A real target. A 20px x in the corner of a banner is a miss, not a control.
const put = /function PutAway\(\{[\s\S]*?\n\}/.exec(shared);
ok(!!put && /h-11 w-11/.test(put[0]),
   'the x is a 44px target rather than a decoration');
ok(!!put && /aria-label=/.test(put[0]),
   'and says what it hides, for somebody who cannot see the banner');

// The mechanics of remembering.
const hook = /function useKeepable\([\s\S]*?\n\}/.exec(shared);
ok(!!hook, 'the choice is remembered');
const body = hook ? hook[0] : '';
ok(/useEffect\(\(\) => \{[\s\S]*?localStorage\.getItem/.test(body),
   'read in an effect, not during render, so the server and the browser agree');
const reads = (body.match(/localStorage/g) ?? []).length;
const guards = (body.match(/catch/g) ?? []).length;
ok(guards >= 2 && reads >= 2,
   `every access is guarded, because a private window throws (${guards} guards)`);

// AND THE PROMISE ITSELF SURVIVES THE BANNER.
const privacy = read('app/privacy/page.tsx');
ok(/Not\s*\n?\s*other Guides, not Directors|yours and your Guide/i.test(privacy)
   || /conversation is yours/i.test(privacy),
   'the privacy notice still says the conversation is private');
ok(/location your camera\s*\n?\s*recorded is removed|removed<\/strong> before it is stored/i.test(privacy),
   'and still says a photo loses the location your camera recorded');

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
