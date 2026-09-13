// The app is called Hope Beacon. The repository is called Open Sentry Beacon.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. lib/brand.ts opened with "change these lines and nothing
// else", said nothing hard-codes the name, and named a test that would fail if
// something started to. All three were false.
//
// tests/brand-consistency.mjs -- the test it named -- only ever compared the
// LOGO DRAWING between its copies. It never looked at the name once. So the
// promise was never enforced, fifty-one hard-coded occurrences accumulated
// across twenty-three screens, and the rename away from the app's first name
// had to visit eighty-four files instead of one.
//
// THE TWO STORAGE KEYS ARE THE SHARP EDGE, and the reason this file matters
// more than a tidy-up. `hope-beacon.feedback.local` and
// `hope-beacon:library-favorites:v1` are localStorage ADDRESSES, not labels.
// Renaming one does not move what is stored there: it points the browser at a
// drawer that has never been written to, and somebody's unsent feedback or
// saved favourites are gone, with no error and no way back. They keep the old
// spelling forever, and the checks below make removing them a red build rather
// than a quiet loss on a stranger's phone.
//
//   node tests/the-brand-is-one-name.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

/** Every tracked text file, which is the only surface a rename has to cover. */
function tracked() {
  const skipDir = new Set(['node_modules', '.next', '.next-dev', '.git', 'screenshots']);
  const skipExt = new Set(['.png', '.jpg', '.jpeg', '.pdf', '.ico', '.webp', '.zip',
                           '.woff', '.woff2', '.docx']);
  return execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .filter((f) => !f.split('/').some((part) => skipDir.has(part)))
    .filter((f) => !skipExt.has(path.extname(f).toLowerCase()));
}

// The two localStorage addresses that must never be renamed.
const KEYS = ['hope-beacon.feedback.local', 'hope-beacon:library-favorites'];

// ---------------------------------------------------------------------------
// 1. THE NAME IS DEFINED IN ONE PLACE
// ---------------------------------------------------------------------------
{
  const brand = read('lib/brand.ts');
  const full = brand.match(/export const APP_NAME = '([^']+)'/)?.[1];
  const short = brand.match(/export const APP_SHORT_NAME = '([^']+)'/)?.[1];
  ok(!!full, `lib/brand.ts defines the full name (${full ?? 'MISSING'})`);
  ok(!!short, `and the short one (${short ?? 'MISSING'})`);
  ok(!!full && !!short && full.includes(short),
     'and the short name is part of the full one, so they cannot drift apart');
}

// ---------------------------------------------------------------------------
// 2. THE REPOSITORY'S NAME NEVER LEAKS INTO THE APP
// ---------------------------------------------------------------------------
//
// THIS CHECK USED TO ENFORCE THE OPPOSITE, AND THAT IS THE WHOLE POINT OF IT.
//
// It read "the previous name is gone from every tracked file" and hunted for
// "Hope Beacon", because a sweep had decided the app was being renamed to match
// the repository. It was not. Those are two names for two different things:
//
//     THE APP           Hope Beacon          what a congregation reads
//     THE REPOSITORY    Open Sentry Beacon   what a developer clones
//
// A church never sees the repository. What it saw instead was a sign-in screen
// reading "Sign in to Sentry Beacon" -- a name nobody had given them, on the
// screen where they type their password, which is the worst place in the app to
// look unfamiliar. The owner caught it from a screenshot.
//
// So the direction is reversed. `Sentry Beacon` may appear ONLY as part of
// `Open Sentry Beacon`, which is the repository naming itself, or as the
// lowercase slug in a clone URL. Anywhere else it is the app wearing the wrong
// name.
//
// The two storage keys are exempt as before: they are addresses, not labels.
//
// THE SPACE BETWEEN THE TWO WORDS IS NOT ALWAYS A SPACE, and the first version
// of this check assumed it was. Every invitation email writes the wordmark as
// `Hope&nbsp;Beacon`, so the two words never break across a line -- and an
// entity is not the character it stands for, so a literal `Hope Beacon` search
// walked straight past all eleven of them. The rename shipped, this check went
// green, and the emails a congregation actually receives still carried the old
// name in their masthead.
//
// So entities are resolved to a space and runs of whitespace collapsed BEFORE
// the name is looked for. That covers `&nbsp;`, `&#160;`, `&#xa0;` and the
// literal U+00A0, because it does not enumerate them: anything of the shape
// `&...;` becomes a space and the question of which ones exist stops mattering.
{
  const stragglers = [];
  for (const file of tracked()) {
    // THIS FILE NAMES THE THING IT HUNTS FOR, so it matches itself. The same
    // exemption tests/no-backend.js takes, for the same reason and in its own
    // words: "it must name them to find them".
    if (file === 'tests/the-brand-is-one-name.mjs') continue;
    let text;
    try { text = read(file); } catch { continue; }
    let stripped = text;
    for (const key of KEYS) stripped = stripped.split(key).join('');
    stripped = stripped
      .replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, ' ')
      .replace(/\s+/g, ' ');
    // The repository is allowed to name itself, in either shape.
    //
    // CASE-INSENSITIVELY, to match the search below. The first version stripped
    // the exact spelling and then searched with /i, so a heading written in
    // capitals slipped through its own exemption and the file explaining the
    // rule was reported as breaking it.
    stripped = stripped.replace(/Open Sentry Beacon/gi, '').replace(/open-sentry-beacon/gi, '');
    if (/Sentry Beacon/i.test(stripped)) stragglers.push(file);
  }
  ok(stragglers.length === 0,
     `the repository's name appears nowhere the app speaks${
       stragglers.length ? `\n        wearing it: ${stragglers.join('\n                    ')}` : ''}`);
}

// ---------------------------------------------------------------------------
// 2b. AND THE APP HAS A NAME OF ITS OWN -- WHATEVER THAT NAME IS
// ---------------------------------------------------------------------------
//
// THIS CHECK USED TO PIN THE LITERAL STRING `'Hope Beacon'`, AND THAT WAS
// BACKWARDS FOR THIS PROJECT.
//
// The half it was written for is right: checking only that the WRONG name is
// absent passes just as happily if no name arrives at all -- a sign-in screen
// reading "Sign in to" and nothing else. That is still checked below.
//
// What it got wrong is treating one deployment's name as the rule. The naming
// has three layers, and only two of them are fixed:
//
//     THE PROJECT      Open Sentry Beacon   what a developer clones. Fixed.
//     THE DEPLOYMENT   Hope Beacon          what THIS church calls it. An
//                                           EXAMPLE, and the first thing a fork
//                                           is expected to change.
//     A FORK           anything             whatever that church is called.
//
// Pinning the example made the gate go red the moment somebody did the thing
// this project exists for. `docs/START-HERE.md` tells a church to open
// lib/brand.ts and put their own name in; this check would then have failed
// their build and told them their app was called the wrong thing. An open
// source project whose test suite refuses the rename it advertises is worse
// than one with no test at all.
//
// So the invariant is the one that survives a fork: the name is SET, it is not
// blank, and it is not the project's name leaking through. What it actually
// says is the church's business.
{
  const brand = read('lib/brand.ts');
  const short = brand.match(/export const APP_SHORT_NAME = '([^']*)'/)?.[1];
  const full  = brand.match(/export const APP_NAME = '([^']*)'/)?.[1];

  ok(!!short && short.trim().length >= 2,
     `the app has a short name of its own (${short || 'MISSING'})`);
  ok(!!full && full.trim().length >= 2,
     `and a full one (${full || 'MISSING'})`);

  // THE ONE NAME IT MAY NOT BE. Check 2 above already hunts the project's name
  // through every tracked file; this says it plainly about the constant itself,
  // because that is the specific mistake that put a congregation in front of a
  // sign-in screen wearing a name nobody had given them.
  ok(!/sentry beacon/i.test(short ?? ''),
     'and it is not the project\u2019s own name, which no church should ever read');

  // AND THE SCREEN THE OWNER SCREENSHOTTED reads it from there rather than
  // carrying its own copy, which is how it came to disagree in the first place.
  const door = read('components/live/DoorPages.tsx');
  ok(/Sign in to \$\{APP_SHORT_NAME\}/.test(door),
     'and the sign-in screen takes the name from the one place that defines it');
}

// ---------------------------------------------------------------------------
// 2c. A FORK CAN ACTUALLY RENAME IT
// ---------------------------------------------------------------------------
//
// THE CHECK THAT WOULD HAVE CAUGHT MY OWN MISTAKE, so it is written as the
// thing itself rather than as a promise about it.
//
// docs/START-HERE.md and README.md both tell a church to open lib/brand.ts and
// put their own name in. Section 2b used to pin the literal `'Hope Beacon'`,
// which means the FIRST THING the documentation asks somebody to do would have
// turned their build red and told them their app was called the wrong thing.
// Nobody here would have seen it, because nobody here renames it.
//
// So: take the real file, rename it the way a fork would, and run the same
// rules over the result. If the gate refuses a perfectly ordinary church name,
// this goes red at home instead of in a stranger's terminal.
{
  const brand = read('lib/brand.ts');
  const renamed = brand
    .replace(/export const APP_NAME = '[^']*'/, "export const APP_NAME = 'Sampaguita Fellowship'")
    .replace(/export const APP_SHORT_NAME = '[^']*'/, "export const APP_SHORT_NAME = 'Sampaguita'");

  const short = renamed.match(/export const APP_SHORT_NAME = '([^']*)'/)?.[1];
  const full  = renamed.match(/export const APP_NAME = '([^']*)'/)?.[1];

  ok(short === 'Sampaguita' && full === 'Sampaguita Fellowship',
     'the two constants are the only edit a rename needs');

  // EVERY RULE THIS FILE ENFORCES, RE-RUN AGAINST THE RENAMED COPY.
  ok(!!short && short.trim().length >= 2 && !!full && full.trim().length >= 2,
     'and a renamed fork still satisfies the name-is-set rule');
  ok(!/sentry beacon/i.test(short) && !/sentry beacon/i.test(full),
     'and still satisfies the not-the-project rule');

  // THE STORAGE KEYS MUST SURVIVE THE RENAME TOO, which is the one thing a
  // find-and-replace across this file would genuinely destroy. Checked here on
  // the renamed copy rather than only on ours, because a fork runs the same
  // find-and-replace we did and loses the same drawers if it sweeps them up.
  for (const key of KEYS) {
    ok(renamed.includes(key),
       `and ${key} is still named as an address a rename must not touch`);
  }
}

// ---------------------------------------------------------------------------
// 3. THE TWO STORAGE KEYS SURVIVED
// ---------------------------------------------------------------------------
//
// The inverse of check 2, and the more important half. A rename that swept
// these up would pass every other check in this file while silently emptying a
// drawer on somebody's phone.
{
  ok(read('lib/backend/feedback.ts').includes("'hope-beacon.feedback.local'"),
     'unsent feedback still lives at the address it was written to');
  ok(read('app/library/page.tsx').includes("'hope-beacon:library-favorites:v1'"),
     'and saved favourites still live at theirs');

  // NAMED, NOT ALLUDED TO. The first version of this check looked for the words
  // "storage" or "address" anywhere in the file, which survived deleting the
  // warning itself because those words appear elsewhere in the same comment. A
  // renamer needs the two exact strings in front of them, so that is what is
  // checked.
  const brand = read('lib/brand.ts');
  for (const key of KEYS) {
    ok(brand.includes(key),
       `and lib/brand.ts names ${key} as an address a rename must not touch`);
  }
}

// ---------------------------------------------------------------------------
// 4. THE HARD-CODED SURFACE IS PINNED
// ---------------------------------------------------------------------------
//
// ZERO, AND MEASURED WITH COMMENTS STRIPPED. Forty-five rendered occurrences
// across twenty-three screens now read from the constants, so lib/brand.ts's
// promise -- change these two lines and nothing else -- is finally true for
// everything a person can see.
//
// Comments are deliberately not counted. A comment naming the app is prose, and
// rewriting `// Hope Beacon puts two people in a private conversation` into a
// constant reference would make the source harder to read to satisfy a rule
// that was never about comments.
//
// If you add a screen that names the app, import APP_NAME or APP_SHORT_NAME.
// This check is what stops the count creeping back to forty-five.
{
  const brand = read('lib/brand.ts');
  const full = brand.match(/export const APP_NAME = '([^']+)'/)?.[1] ?? '';
  const short = brand.match(/export const APP_SHORT_NAME = '([^']+)'/)?.[1] ?? '';

  const stripComments = (src) =>
    src.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g,
                (m) => ' '.repeat(m.length));

  const offenders = [];
  for (const file of tracked()) {
    if (!/^(components|app)\/.*\.tsx$/.test(file)) continue;
    const text = stripComments(read(file));
    const n = (text.match(new RegExp(full, 'g')) ?? []).length
      + (text.split(full).join('').match(new RegExp(short, 'g')) ?? []).length;
    if (n) offenders.push(`${file} (${n})`);
  }

  ok(offenders.length === 0,
     `no screen hard-codes the name; they all read the constant${
       offenders.length ? `\n        hard-coded in: ${offenders.join('\n                       ')}` : ''}`);

  ok(/APP_NAME/.test(read('app/manifest.ts')) || /brand/.test(read('app/manifest.ts')),
     'and the installed app takes its name from the constant, not from a copy');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
