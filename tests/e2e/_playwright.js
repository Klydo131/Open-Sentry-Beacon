// Find Playwright wherever it happens to live.
//
// One suite had `require('/opt/node22/lib/node_modules/playwright')` committed
// into it — an absolute path to one particular sandbox. It worked there and
// nowhere else, which is the worst kind of test bug: it does not fail, it just
// stops being portable, and the failure surfaces later as "the tests are broken
// on my machine" or a red CI job nobody can reproduce locally.
//
// Playwright is deliberately NOT a dependency of this project. It is a ~300 MB
// install with its own browser downloads, and the app does not use it at
// runtime — only these end-to-end walks do. So it may be a local devDependency,
// a global install, or absent entirely, and this resolves all three honestly.

const path = require('node:path');
const fs = require('node:fs');

const CANDIDATES = [
  // A normal local install, if someone has run `npm i -D playwright`.
  'playwright',
  // Common global locations, in the order they are likely to appear.
  '/opt/node22/lib/node_modules/playwright',
  '/usr/lib/node_modules/playwright',
  '/usr/local/lib/node_modules/playwright',
];

function loadPlaywright() {
  for (const candidate of CANDIDATES) {
    try {
      return require(candidate);
    } catch {
      // Try the next one.
    }
  }
  // A global install that npm knows about but node's resolver does not.
  try {
    const { execFileSync } = require('node:child_process');
    // shell on Windows: npm is npm.cmd there and execFile cannot run it.
    const prefix = execFileSync('npm', ['root', '-g'], {
      encoding: 'utf8',
      shell: process.platform === 'win32',
    }).trim();
    const candidate = path.join(prefix, 'playwright');
    if (fs.existsSync(candidate)) return require(candidate);
  } catch {
    // Fall through to the explanation below.
  }

  console.error(
    'Playwright is not installed.\n\n' +
      'These end-to-end walks drive a real browser, so they need it:\n' +
      '  npm i -D playwright        (local, recommended)\n' +
      '  npm i -g playwright        (global)\n\n' +
      'The static guards do not need a browser — `npm run verify` runs those\n' +
      'on their own and is what CI relies on.',
  );
  process.exit(2);
}

const playwright = loadPlaywright();

// WHICH ENGINE, AND WHY IT IS A CHOICE NOW.
//
// These suites ran on Chromium only, and that is a real blind spot rather than
// a detail. Every iOS bug reported so far came from WebKit behaving differently
// from Blink: `overflow-x: clip` handled differently, `dvh` against `vh`,
// Safari's rubber-band scrolling and its keyboard avoidance. Chromium at iPhone
// size proves the layout is not broken everywhere. It cannot prove it works on
// an iPhone, and twice it said everything was fine when it was not.
//
// E2E_BROWSER=webkit runs the same suites on WebKit, which is the engine behind
// Safari. That is what .github/workflows/safari.yml does on a macOS runner.
// Unset, nothing changes and Chromium is used exactly as before.
const ENGINE = (process.env.E2E_BROWSER || 'chromium').toLowerCase();
if (!['chromium', 'webkit', 'firefox'].includes(ENGINE)) {
  console.error(`E2E_BROWSER=${ENGINE} is not a Playwright engine. Use chromium, webkit or firefox.`);
  process.exit(2);
}
const engine = playwright[ENGINE];

// The pinned executable is a CHROMIUM path, provided by the sandbox that
// pre-installs the browser separately from the library. Applying it to WebKit
// would hand Playwright a Chromium binary and fail in a way that reads like
// WebKit being broken, so it is scoped to the engine it describes.
const EXECUTABLE =
  ENGINE === 'chromium'
    ? process.env.PLAYWRIGHT_CHROMIUM_PATH ||
      (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined)
    : undefined;

/**
 * Choose a room or subroom before looking for what it holds.
 *
 * Several long scrolling pages became tabbed folders. A card that used to be
 * reachable by scrolling is now rendered only while its tab is the chosen one,
 * so a suite that goes straight to the card times out on a page where the
 * feature is working perfectly. That is what happened to thirteen suites the
 * day rooms landed: the app was fine and the tests were describing the old
 * shape of it.
 *
 * Deliberately tolerant. A page with no tabs, a tab that is already selected,
 * and a label that does not exist are all a quiet no-op, so a caller never has
 * to know which pages were converted and which were left alone. It returns
 * whether it actually clicked, for the rare suite that wants to assert on that.
 *
 * Matches on the accessible tab role rather than on text, because the labels
 * carry emoji and a bare getByText finds the TAB when the suite meant the CARD
 * — which is exactly how the prayer suite passed its first assertion and then
 * timed out on its second.
 */
async function openRoom(page, label) {
  try {
    const tab = page.getByRole('tab', { name: label }).first();
    if ((await tab.count()) === 0) return false;
    if ((await tab.getAttribute('aria-selected')) === 'true') return true;
    await tab.click({ timeout: 5000 });
    await page.waitForTimeout(400);
    return true;
  } catch {
    return false;
  }
}

/**
 * A page error that is WebKit reporting a cancelled prefetch, not a failure.
 *
 * Next.js fetches the pages a screen links to ahead of time. When the walk
 * moves on before one of those arrives, WebKit cancels it and raises it as a
 * page error: "Fetch API cannot load http://localhost:PORT/cases?_rsc=...
 * due to access control checks." Nothing was refused and nothing broke; the
 * safari run of 29 September 2026 failed `the-study-room-on-every-size` on
 * exactly that line, at a size where the walk had passed the run before.
 *
 * ONLY THAT SHAPE IS FORGIVEN: this app's own address, a React Server
 * Components prefetch (`_rsc=`), and WebKit's cancellation wording. A real
 * refusal from anywhere else, or any other error, still fails the walk.
 */
function isCancelledPrefetch(message) {
  return /Fetch API cannot load https?:\s?\/\/?(localhost|127\.0\.0\.1)(:\d+)?\/\S*[?&]_rsc=\S* due to access control checks/
    .test(String(message));
}

module.exports = {
  // The selected engine. Named `chromium` because twenty-five suites already
  // destructure that name, and renaming them all to prove a point would be a
  // large diff for no behaviour. `browser` is the honest name; prefer it in
  // anything new.
  chromium: engine,
  browser: engine,
  engineName: ENGINE,
  playwright,
  // Playwright's device descriptors (viewport, pixel ratio, touch, user agent),
  // so a suite can say "iPhone SE" instead of hand-copying numbers that then
  // quietly drift away from the real device.
  devices: playwright.devices,
  // Suites pass this into launch()/launchPersistentContext() so the browser
  // lookup is decided in one place rather than repeated in every file.
  launchOptions: EXECUTABLE ? { executablePath: EXECUTABLE } : {},
  openRoom,
  isCancelledPrefetch,
};
