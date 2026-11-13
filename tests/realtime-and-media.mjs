// Media and real-time: the invariants that are easy to break by accident.
//
// These are source assertions, not a running app. Each one exists because the
// opposite mistake is both easy to make and silent when made — the kind that
// ships and is found by a user, not by a reviewer.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8');

const realtime = read('lib/realtime.ts');
const store = read('lib/demo/store.tsx');
const types = read('lib/types.ts');
const seed = read('lib/demo/seed.ts');
const chat = read('components/Chat.tsx');
// Since 1 October 2026 both halves draw attachments through one component
// (components/talk/ChatAttachment.tsx); the sample half supplies the bytes from
// this device and frees the URL it made (components/Chat.tsx).
const attachment = read('components/talk/ChatAttachment.tsx') + '\n' + read('components/Chat.tsx');

let failures = 0;
function ok(condition, message) {
  console.log(`${condition ? 'OK  ' : 'BAD '} ${message}`);
  if (!condition) failures++;
}

// ---- Real-time -----------------------------------------------------------

ok(
  /export function setRealtimeTransport/.test(realtime),
  'real-time is a swappable seam, not a hard-coded BroadcastChannel',
);

ok(
  !/\bfetch\s*\(/.test(realtime) && !/WebSocket/.test(realtime),
  'the default transport makes no network request',
);

// The echo loop. If an incoming database were applied through saveDb, the
// receiving window would publish it straight back and two windows would volley
// forever. This is the assertion that catches that being "tidied up".
ok(
  /subscribeDb\(\(incoming\) => setDb\(/.test(store),
  'an incoming database is applied with setDb, never with saveDb (no echo loop)',
);

ok(
  /publishDb\(trimmed\)/.test(store) && /publishDb\(lean\)/.test(store),
  'both successful save paths publish, so a trimmed save still syncs',
);

// A write that cannot be broadcast is still a write.
ok(
  /publish\(msg\)\s*\{\s*try\s*\{/.test(realtime),
  'publish swallows its own errors so the feed cannot break the action',
);

ok(
  /msg\.origin === ORIGIN/.test(realtime),
  'a window ignores its own messages, so a chattier transport cannot loop',
);

// ---- Media ---------------------------------------------------------------

ok(
  /export interface PairingMedia/.test(types) && /pairing_media: PairingMedia\[\]/.test(types),
  'pairing media is a first-class collection on the database',
);

ok(
  /pairing_media: \[\]/.test(seed),
  'the seed declares pairing_media, so an old save migrates instead of crashing',
);

// The whole point of the design: bytes never enter the row, because the row is
// serialised into localStorage on every write.
ok(
  !/data:|base64|FileReader/.test(store),
  'the store never inlines file bytes into the database',
);

ok(
  /putMedia\(/.test(store) && /deleteMedia\(/.test(store),
  'bytes go to IndexedDB through localMedia, both on write and on delete',
);

// A row whose blob failed to write is worse than no row at all.
//
// Matched loosely on purpose. This used to pin the exact text `.catch(() => {`
// followed immediately by the rollback, so it failed the moment the handler
// took a parameter in order to REPORT the failure -- an improvement the test
// read as a regression. What matters is that a rejected write rolls the row
// back, not the shape of the handler that does it.
const rollback = /\.catch\(\s*\(?\w*\)?\s*=>\s*\{[\s\S]{0,900}?pairing_media:\s*prev\.pairing_media\.filter/;
ok(
  rollback.test(store),
  'a failed byte write removes the row again, leaving no broken attachment',
);
// And it must not fail silently. An attachment that vanishes with nothing
// logged is what made the WebKit failure take a CI run and a log dig to
// identify, when one line would have named it.
ok(
  /console\.(error|warn)\(/.test(store.slice(store.search(rollback))) ||
    /console\.(error|warn)\([^)]*attachment/i.test(store),
  'and it leaves a trace, rather than removing the attachment in silence',
);

// The permission rule, in one place.
ok(
  /const mediaFor = useCallback/.test(store),
  'the store owns the visibility rule (mediaFor), not the screens',
);

// Strip comments before asserting an ABSENCE. A previous version of this check
// failed on the explanatory comment in Chat.tsx that names the very pattern it
// forbids — a crude text sweep cannot tell a rule from a mention of the rule.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

ok(
  /mediaFor\(pairingId\)/.test(chat) && !/db\.pairing_media/.test(stripComments(chat)),
  'the chat screen asks mediaFor and never filters db.pairing_media itself',
);

// The regression this section exists to prevent a third time.
//
// [data-quest="chat-send"] is the tutorial anchor, and other suites index into
// it positionally — the message box is its first text control, Send is its
// first <button>. Putting the hidden file picker inside captured the first
// selector and typing timed out. Moving only the picker, and leaving the Attach
// button inside, then captured the second: the suite clicked Attach instead of
// Send, no message was sent, and nothing on screen looked wrong. Silent, and
// two separate debugging sessions.
//
// The message box became <MessageBox> — a growing textarea — when a one-line
// <input> turned out to be why nobody could read back a long message they had
// written. So the count below moved from <input> to <MessageBox>, and the
// no-raw-<input> rule that replaced it is the stronger of the two: it forbids
// the file picker by construction rather than by a separate check.
// The form lives in the shared composer since 1 October 2026
// (components/talk/Composer.tsx), which both halves draw.
const chatCode = stripComments(read('components/talk/Composer.tsx'));
const afterAnchor = chatCode.slice(chatCode.indexOf('data-quest="chat-send"'));
const formEnd = afterAnchor.indexOf('</form>');
const inForm = formEnd === -1 ? afterAnchor : afterAnchor.slice(0, formEnd);

ok(
  (inForm.match(/<MessageBox/g) || []).length === 1
    && (inForm.match(/<input/g) || []).length === 0,
  'the chat-send region holds exactly one message box and no raw <input>',
);
ok(
  // ONE button, which is Send whenever something is typed (and the
  // microphone only when the box is empty, so a walk that types first and
  // presses the first button always presses Send).
  (inForm.match(/<button/g) || []).length === 1
    && /type=\{action === 'record' \? 'button' : 'submit'\}/.test(inForm)
    && /'send' \| 'save' \| 'record' \| 'idle' =\s*editing \? 'save' : typed \? 'send'/.test(chatCode),
  'the chat-send region holds exactly one button, and it is Send once anything is typed',
);
ok(
  !/type="file"/.test(inForm),
  'the file picker is not inside the chat-send region',
);

// Both halves of the "upload as self, into a pairing you are in" policy.
const attach = store.slice(store.indexOf('const attachMedia'), store.indexOf('const removeMedia'));
ok(
  /p\.dm_id !== userId && p\.ds_id !== userId/.test(attach),
  'attaching is refused when the signed-in person is not in the pairing',
);
ok(
  /owner_id: userId/.test(attach),
  'an attachment is always owned by the person who made it',
);

const remove = store.slice(store.indexOf('const removeMedia'), store.indexOf('const mediaFor'));
ok(
  /row\.owner_id !== userId/.test(remove),
  'only the owner may remove an attachment',
);

// mediaFor must gate on membership, not merely filter by pairing id.
const mediaFor = store.slice(store.indexOf('const mediaFor'), store.indexOf('const mediaFor') + 800);
ok(
  /p\.dm_id !== userId && p\.ds_id !== userId/.test(mediaFor),
  'mediaFor returns nothing to somebody outside the pairing (no admin exception)',
);

// ---- Cross-platform: the bugs that only appear on somebody else's device --

// iOS Safari pulls a video out of the page and plays it fullscreen unless this
// is set. Desktop testing never shows it. Both other players in this repo set
// it; the attachment player did not, until it did.
ok(
  /playsInline/.test(attachment),
  'an attached video plays inline, so iOS does not hijack the screen',
);

// randomUUID is a secure-context API: undefined over plain http on a LAN
// address, and absent before Safari 15.4. Unguarded it throws rather than
// degrades, and attaching a file fails outright.
//
// The guard used to be written out inside localMedia.ts and this check looked
// for it there. It now lives in lib/uuid.ts and every caller delegates, so the
// check follows it — a test that pins an invariant to one file's wording fails
// the day that invariant is done properly somewhere else, which is the least
// useful failure available. What is asserted is the property, in both places it
// can now break: the helper still guards, and callers still use the helper.
const uuidHelper = read('lib/uuid.ts');
ok(
  /typeof c\.randomUUID === 'function'/.test(uuidHelper),
  'lib/uuid.ts does not assume a secure context (http on a LAN, older Safari)',
);
ok(
  /getRandomValues/.test(uuidHelper),
  'and its fallback is real randomness, not Math.random',
);
for (const f of ['lib/localMedia.ts', 'lib/realtime.ts', 'components/Feedback.tsx']) {
  const src = read(f).replace(/\/\/.*$/gm, '');
  ok(
    !/crypto\.randomUUID/.test(src),
    `${f}: calls uuid() rather than crypto.randomUUID directly`,
  );
}

// npm and npx are .cmd shims on Windows and Node will not exec them without a
// shell. This is the first command a Windows contributor runs.
const verifyScript = read('scripts/verify.mjs');
ok(
  /shell: NEEDS_SHELL/.test(verifyScript) && /win32/.test(verifyScript),
  'verify spawns npm and npx in a way Windows can actually execute',
);

const workflow = read('.github/workflows/verify.yml');
ok(
  /windows-latest/.test(workflow) && /macos-latest/.test(workflow),
  'CI actually runs on Windows and macOS, rather than assuming they work',
);

// ---- The object-URL leak -------------------------------------------------

ok(
  /release: \(url\) => URL\.revokeObjectURL\(url\)/.test(attachment)
    && /if \(made\) releaser\.current\?\.\(made\)/.test(attachment),
  'object URLs are revoked on unmount, so a long thread does not leak blobs',
);

console.log(failures === 0 ? '\nAll media and real-time checks passed.' : `\n${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
