// When may the app reload itself? Every answer, asserted, against the real code.
//
// The end-to-end suite proves the app does NOT reload while a message is
// half-written. It cannot reliably prove the other half — that a cleared box
// lets the update through — because that needs a genuinely newer service worker
// waiting, and a single-build harness has none.
//
// That gap matters. A suite that only ever demonstrates blocking would pass
// just as happily on a guard that blocks FOREVER, which is a real bug wearing
// the costume of a working one. So the policy lives in `lib/auto-update.ts` as
// pure functions with no timers and no side effects, and every branch is
// checked here, in milliseconds, with no browser.
//
// This imports the SHIPPED module rather than reproducing it. An earlier
// version copied the function body into this file and checked the copy against
// the source with regexes, which is a test of a copy plus a test of a regex —
// two things that can both pass while the app does something else.
//
//   node tests/auto-update-policy.mjs

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const target = pathToFileURL(path.join(root, 'lib/auto-update.ts')).href;

// Importing a .ts file needs type stripping, which is on by default from Node
// 22.18 and behind a flag from 22.6. Re-exec once with the flag rather than
// telling a contributor on 22.10 that the update policy is broken.
let mod;
try {
  mod = await import(target);
} catch (err) {
  const strippable =
    /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION|ERR_UNSUPPORTED_NODE_MODULE/.test(
      String(err && (err.code || err.message)),
    );
  if (!strippable || process.env.AUTO_UPDATE_POLICY_RETRY === '1') {
    console.error(
      'BAD could not load lib/auto-update.ts.\n' +
        '    This test runs the shipped policy rather than a copy of it, which\n' +
        '    needs Node 22.6 or newer. Node here: ' + process.version + '\n' +
        '    ' + String(err && err.message),
    );
    process.exit(1);
  }
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)],
    { stdio: 'inherit', env: { ...process.env, AUTO_UPDATE_POLICY_RETRY: '1' } },
  );
  process.exit(r.status ?? 1);
}

const { shouldApplyNow, hasUnsavedText, attemptsFor, nextAttempts, MAX_ATTEMPTS, ATTEMPTS_KEY } =
  mod;

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// ------------------------------------------------------------- the policy ---

const QUIET = 20_000;
const ctx = (o) => ({
  visibility: 'visible',
  idleMs: 60_000,
  quietMs: QUIET,
  unsaved: false,
  attempts: 0,
  maxAttempts: MAX_ATTEMPTS,
  ...o,
});

const cases = [
  [{ idleMs: 60_000, unsaved: true }, false, 'quiet for a minute but a half-written message is open'],
  [{ idleMs: 1_000, unsaved: true }, false, 'actively typing, with text in the box'],
  [{ idleMs: 1_000, unsaved: false }, false, 'actively typing, box empty — still mid-thought'],
  [{ idleMs: 60_000, unsaved: false }, true, 'quiet and nothing unsaved'],
  [{ idleMs: QUIET }, true, 'exactly at the quiet threshold'],
  [{ idleMs: QUIET - 1 }, false, 'one millisecond short of the threshold'],
  [{ visibility: 'hidden', idleMs: 0, unsaved: true }, true, 'backgrounded, even with text in a box nobody is looking at'],
  [{ visibility: 'hidden', idleMs: 0 }, true, 'backgrounded and empty'],
];

for (const [patch, expected, why] of cases) {
  ok(shouldApplyNow(ctx(patch)) === expected, `${expected ? 'applies' : 'waits'}: ${why}`);
}

// The pair that matters. If the guard ever blocks unconditionally, this fails.
ok(
  shouldApplyNow(ctx({ unsaved: true })) === false &&
    shouldApplyNow(ctx({ unsaved: false })) === true,
  'the ONLY difference between waiting and applying is the unsaved text itself',
);

// -------------------------------------------------------------- the budget ---
//
// A reload only helps if the app comes back as a different build. When it comes
// back as the same one — `/version.json` and the HTML served from two different
// deployments, a worker that will not install — every condition that triggered
// the reload is true again, and the app reloads forever. Nobody can reach
// Settings to escape a page that never finishes loading.
//
// This was not hypothetical. tests/e2e/update-speed.js hit it: "a release
// landing mid-session was never noticed" failed because every attempt to read
// the page caught it mid-navigation.

ok(shouldApplyNow(ctx({ attempts: MAX_ATTEMPTS })) === false,
   'stops reloading once the budget for this build is spent');
ok(shouldApplyNow(ctx({ attempts: MAX_ATTEMPTS + 5 })) === false,
   'and stays stopped past it, rather than wrapping round');
ok(shouldApplyNow(ctx({ attempts: MAX_ATTEMPTS - 1 })) === true,
   'but spends the last attempt it is allowed');
// The one that keeps the loop out of the case nobody would see.
ok(shouldApplyNow(ctx({ visibility: 'hidden', attempts: MAX_ATTEMPTS })) === false,
   'the budget binds a BACKGROUNDED app too — an unwatched loop is still a loop');
ok(MAX_ATTEMPTS >= 2,
   `more than one attempt allowed, so one lost race does not strand anybody (${MAX_ATTEMPTS})`);

ok(attemptsFor(null, 'abc') === 0, 'no stored count reads as no attempts');
ok(attemptsFor('not json', 'abc') === 0, 'unreadable storage reads as no attempts, not as "never update"');
ok(attemptsFor(JSON.stringify({ build: 'abc', n: 2 }), 'abc') === 2, 'a stored count for this build is read back');
ok(attemptsFor(JSON.stringify({ build: 'xyz', n: 9 }), 'abc') === 0,
   'a count recorded against a DIFFERENT build does not block this one — a successful update must clear it');
ok(attemptsFor(nextAttempts('abc', attemptsFor(null, 'abc')), 'abc') === 1,
   'spending an attempt records exactly one');
ok(attemptsFor(nextAttempts('abc', 1), 'abc') === 2, 'and the next one records two');
ok(typeof ATTEMPTS_KEY === 'string' && ATTEMPTS_KEY.length > 0, 'the storage key is named');

// ------------------------------------------------- what counts as unsaved ---
//
// `hasUnsavedText` takes the document as an argument precisely so this can be
// asked without a browser. It is the guard standing between an automatic reload
// and somebody's half-written message, and until now nothing exercised it
// directly — the browser suite only ever drove it through one real chat box.

const el = (tag, props = {}) => ({
  tagName: tag.toUpperCase(),
  type: props.type,
  value: props.value,
  innerText: props.innerText,
  isContentEditable: !!props.isContentEditable,
  getAttribute: (n) => (n === 'contenteditable' ? (props.isContentEditable ? 'true' : null) : null),
});

// hasUnsavedText uses `instanceof HTMLInputElement` to decide whether `type`
// applies. Standing those up for the fake document keeps the check honest
// rather than routing around it.
class FakeInput {}
class FakeTextarea {}
globalThis.HTMLInputElement = FakeInput;

const input = (props) => Object.assign(new FakeInput(), el('input', props));
const textarea = (props) => Object.assign(new FakeTextarea(), el('textarea', props));

const doc = ({ fields = [], editors = [], active = null }) => ({
  activeElement: active,
  querySelectorAll: (sel) => (sel === 'input, textarea' ? fields : editors),
});

const unsavedCases = [
  [doc({}), false, 'an empty page has nothing to lose'],
  [doc({ fields: [input({ value: '' })] }), false, 'an empty box is not unsaved text'],
  [doc({ fields: [input({ value: '   ' })] }), false, 'and neither is whitespace'],
  [doc({ fields: [input({ value: 'half a thought' })] }), true, 'a typed message blocks the update'],
  [doc({ fields: [textarea({ value: 'a longer note' })] }), true, 'a textarea counts too'],
  [doc({ fields: [input({ type: 'checkbox', value: 'on' })] }), false,
    'a ticked checkbox is not writing — its value is always "on"'],
  [doc({ fields: [input({ type: 'submit', value: 'Send' })] }), false,
    'a button\'s label is not writing either'],
  [doc({ fields: [input({ type: 'search', value: 'ruth' })] }), true,
    'but a search box IS held deliberately: waiting costs minutes, being wrong costs words'],
  [doc({ editors: [el('div', { innerText: 'drafted' })] }), true, 'a rich editor with text in it'],
  [doc({ editors: [el('div', { innerText: '  ' })] }), false, 'an empty rich editor'],
  [doc({ active: el('div', { isContentEditable: true }) }), true,
    'the cursor sitting in a rich editor, even before a key is pressed'],
];

for (const [d, expected, why] of unsavedCases) {
  ok(hasUnsavedText(d) === expected, `${expected ? 'unsaved' : 'clear'}: ${why}`);
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
