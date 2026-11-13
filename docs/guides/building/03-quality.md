# Proving it works: the gate, the walks and Safari

Every change to Hope Beacon passes the same gate before it reaches anybody, and
the gate is one command. This chapter says what it runs, how to read it when it
fails, how to write a check that earns its place, and what the gate cannot see,
so nobody mistakes a green run for more than it is.

## One command

```bash
npm run verify        # typecheck, production build, every static check: about a minute
npm run verify:all    # the same, then every browser walk against that build: several minutes
```

`scripts/verify.mjs` runs, in order:

1. **The typecheck**, `tsc --noEmit`. A type error anywhere stops everything.
2. **The production build**, `npm run build`, exactly as the host will build it.
3. **Every static check**, in the order listed in `scripts/verify.mjs`: 178 of
   them in this edition. Each is a small Node script in `tests/` that exits
   non-zero on a failure. Part VIII lists every one, with what it holds.
4. With `--all`: **every browser walk** in `tests/e2e/`, 74 in this edition,
   against the build it just made, on a free port it chose, four at a time.

At the end it prints one line per stage, and the whole run fails if any did.

> **IMPORTANT** · Run it before you say a change is done
>
> "It works on my machine" and "the screen looked right" are not the gate. The
> owner's rule, and `AGENTS.md`'s, is that `npm run verify` passes before a
> change is offered, and `verify:all` before anything touches a screen.

## Where else it runs

| Workflow | When | What it proves |
| --- | --- | --- |
| `verify.yml` | Every push to `main`, and every pull request | The gate on **Ubuntu, Windows and macOS**. A green run on one system is not a green build |
| `safari.yml` | Every push to `main`, every pull request, and by hand | Every walk on **WebKit**, the engine every iPhone and iPad uses, whatever the browser's name |
| `fresh-install.yml` | Every push to `main`, and pull requests | Every migration **run**, in order, on an empty database, then the protections that have gone missing before, and a fingerprint a live project can be compared with |
| `links.yml` | Weekly | Every link on the church's starter shelf still opens |
| `webkit-probe.yml` | When the storage code changes | One storage question asked of WebKit in a minute, instead of seventeen |
| `backup.yml`, `keep-awake.yml` | Scheduled | For a deployed church: an encrypted weekly backup, and a free project that never falls asleep |

## Reading a failure

The gate prints each check's own output under a rule with its name, then the
summary. Start at the **first** failure: later ones are often the same cause.

- **A static check failed.** Its name is the promise that broke, such as
  *a case is reachable by whoever is in it*. Open the file: its first lines say
  what it holds and why. Run it alone with `node tests/<name>.mjs`.
- **A walk failed.** Its output says which step, and on what it expected and
  found. Run it alone against a build: `npm run build`, `node scripts/run-next.mjs
  start -p 4321`, then `node tests/e2e/<name>.js 4321`.
- **The build failed on one system only.** Usually a path (`\` against `/`), a
  case-sensitive file name, or a shell command. Tests here walk files in Node,
  never with `find` or `grep`, for that reason.

## Writing a static check

A static check is the cheapest proof there is: it runs in milliseconds, needs
no browser, and runs on every push forever. Write one for every rule that a
future change could quietly break.

```js
// A sentence that is the promise, as the first line.
//
// Why it exists: what went wrong, or what was asked for, and when.
//
//   node tests/the-thing-holds.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let bad = 0;
const check = (ok, what) => { console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}`); if (!ok) bad += 1; };

check(/railGroupsFor/.test(read('app/menu/page.tsx')), 'the Menu draws the one list of rooms');

process.exit(bad ? 1 : 0);
```

Then add it to the list in `scripts/verify.mjs`, with a comment above it saying
why, and name the file as the sentence it holds.

**Four rules, each learned by a check that printed `ok` while covering
nothing:**

1. **Break it on purpose.** Before trusting a new check, break the thing it
   guards and watch it go red. Then put it back. A check that cannot fail is
   not a check.
2. **Assert behaviour, not shape.** Where the logic can run in Node, run it:
   the Music room's check plays hostile files into the real readers. Reading
   source text is the fallback, for promises that only exist in source.
3. **Match the thing, not a list of the things that existed.** A rule with an
   allowlist of eight labels never checked the ninth.
4. **Strip comments before searching code.** One check matched its own
   comment and passed for weeks.

## Writing a browser walk

A walk is a real browser, on a production build, doing what a person does. Use
one when the promise is about what somebody sees or can do.

- Start from a walk near yours in `tests/e2e/`; they share `_playwright.js`,
  which finds Playwright wherever it is installed and holds `pageErrors()`.
- A walk takes the port as its only argument and signs in as a sample person.
- **Collect page errors with `pageErrors()`**, never a raw `pageerror`
  listener. It forgives exactly one thing: a request cancelled by the walk's own
  next page load, which WebKit reports as an error. Nothing else.
- Wait for what a person waits for: a heading, a button, text. Never a fixed
  sleep, which is a slow pass on a fast machine and a failure on a slow one.
- Check a phone (390 by 844) and a computer (1440 by 900) when layout matters.
- A walk named `.mjs` is run by hand and not by the gate; use it for a check
  that needs something the gate cannot provide.

## Safari, honestly

Chromium is not Safari. Several bugs that reached real iPhones passed every
Chromium walk: a sideways strip down every screen, a message box that jumped
when the keyboard opened, an image store WebKit refused. So:

- **Anything that touches layout, storage, media or the keyboard** goes through
  a draft pull request, which runs `safari.yml` on WebKit, before it is offered.
- **A walk that fails only on WebKit is a real failure** until proved
  otherwise. Look at what WebKit does differently before touching the walk.
- **WebKit refuses a `Blob` in IndexedDB.** Store `{ bytes: ArrayBuffer, mime }`.
- **Where WebKit cannot be driven** (it has no fake microphone, for instance),
  the walk checks the most it can, and the chapter or report says what was not
  tested.

## What the gate cannot see

Say these plainly whenever a change is offered:

- **The live database.** The gate runs the sample half. A change to a policy or
  a migration is proved by `fresh-install.yml` and the SQL tests in
  `supabase/tests/`, and on a real project only after the migration is applied
  there.
- **A real phone.** Emulated devices are close, not the same. Anything about
  installing, the keyboard, or alerts with the app closed needs a person holding
  one.
- **The deployed site.** A build that passed here is not proof that the host
  built and served it. Report *pushed, build not observed* until somebody has
  looked.

## When a walk fails sometimes

A walk that fails one run in five is telling you something about timing. The
house rule:

1. **Never retry it until it passes.** That hides the one failure that matters.
2. **Find what it raced**: an update check, a lazy folder still loading, a
   slow runner. The fix belongs in the walk (wait for the right thing) or in the
   app (stop the race), and the reason goes in a comment beside it.
3. **Forgive only what you can name.** `pageErrors()` forgives one named thing,
   with a check of its own (`tests/a-walk-forgives-only-what-it-cut-short.mjs`)
   so the forgiveness cannot grow.
