# End-to-end walks

Plain Node + Playwright. No framework, no config file — each suite is
`node <file> <port>` and exits non-zero when it fails.

They exist because four separate rounds of tutorial bugs were all found by a
person holding a phone rather than by anything automatic, and every one of them
had already survived a clean typecheck and a clean build. A screen can compile,
render, and still be a button that does nothing.

## Running them

Almost always, run the lot:

```bash
npm run test:all
```

That builds, starts the app on a free port, waits until the server answers with
the build id it just built, runs every suite, and tears the server down. The
wait matters: `next start` happily serves a stale process on a busy port, and a
suite that passes against yesterday's build is worse than no suite.

To run one on its own:

```bash
npm run build
npx next start -p 4002
node tests/e2e/tutorial-tut2.js 4002
```

**Every suite takes the port as `argv[2]`.** `tests/test-portability.mjs` fails
the build if one stops doing that — a hardcoded port produces a connection error
that reads exactly like the app being down, and that has cost real time twice.

## Playwright

Deliberately **not** a dependency: it is a ~300 MB install with its own browser
downloads, and the app does not use it at runtime. `_playwright.js` finds it
wherever it lives — a local devDependency, a global install — and says so
plainly when it is absent, rather than failing in a way that looks like a broken
test.

```bash
npm i -D playwright && npx playwright install chromium
```

## What each one asserts

- **tutorial-tut2** — every step's spotlight is on screen, clear of the sticky
  header, not intersecting the panel at any of five sampled points, and
  `elementFromPoint` at its centre resolves to a real `[data-quest]` target. A
  ring drawn over an overlay that eats the tap is a failure, not a pass.
- **tutorial-repeat** — six consecutive runs in one persistent browser profile
  must follow a byte-identical route. Fresh contexts hide state accumulation;
  this is the one that caught the tutorial breaking on run 5, once a sample
  seeker ran out of journey stages.
- **tutorial-space** — advance a seeker by hand, run the tutorial, advance
  someone inside it, finish, and assert your own data came back exactly and the
  tutorial's changes did not leak into it.
- **quest-roles** — completes all four role walks at phone width. Each walk
  points at different screens, so this is four chances to find a step whose
  target no longer exists.
- **seeker-no-stage** — opens the seeker's screens and asserts no stage name
  appears anywhere, including inside a tutorial hint. This one is a product
  rule, not a UI detail: keep it passing.
- **header-layers** — after opening a header panel, is the middle of that panel
  the thing you would hit if you tapped there? See the note at the top of the
  file; this is the question `isVisible()` does not ask.
- **old-save** — a save written by an older version still opens. Written after a
  release crashed for everybody who had used the app before.
- **update-typing** — types half a message, puts the app into the "new build
  available" state, and waits past the quiet window. The app must not reload,
  and the half-written message must still be in the box. **The most important
  test in the update set:** the banner is gone and new builds now apply on their
  own, and the one way that trade goes badly is silent. Nobody reports "the app
  lost my sentence" as an update bug. Its companion is `tests/auto-update-policy.mjs`,
  which asserts the *other* half — that a cleared box lets the update through —
  because a suite that only ever demonstrates blocking would pass just as
  happily on a guard that blocks forever.
- **update-speed**, **update-flow** — the rest of the update path: how fast a
  running app notices a build that lands underneath it, and that Settings tells
  the truth about which build it is on while offering nothing to tap.
- **links**, **lesson-links** — a link somebody typed becomes a tappable anchor,
  and a hostile one does not. `links` does it in a conversation; `lesson-links`
  does it in a series description, which matters more because that text is
  written once and shown to everyone offered the series. Both send
  `https://adventist.org@evil.example/give` — a valid address that goes to
  evil.example while a skimming reader sees their own denomination on the left
  of the `@` — and assert it is displayed in full and linked nowhere. Both were
  run against a deliberately weakened validator first and went red.

The rest cover individual screens and are named after them.

## update-flow needs two real builds

A mocked second build proves nothing, so this one runs in two phases against a
genuinely rebuilt app:

```bash
npm run build && npx next start -p 4001
node tests/e2e/update-flow.js 4001 install   # installs the worker, checks the panel
# stop the server, `npm run build` again, restart it
node tests/e2e/update-flow.js 4001 update    # the app must now reload by itself
```

It reuses one persistent profile across both phases on purpose — the update path
only exists for an app that is already installed.

## The rule these encode

**A test with a "keep going anyway" path will report success for the bug it
exists to catch.** An earlier version of the tutorial suite pressed "Skip this
step" whenever the highlighted element could not be clicked, and printed
`ALL OK` on a tutorial that was completely stuck.

If you add a suite: make it fail first. Break the thing it covers and watch it
go red. A test that has never failed is a comment with a run time.
