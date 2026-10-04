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

// WHAT THE BROWSER SAW, SAID IN WORDS WHEN A WALK FAILS.
//
// The Safari walks run on a Mac in CI, and the only record they kept of a
// failure was a folder of screenshots uploaded as an artifact. Nobody working
// in a sandbox can open that folder, so a WebKit failure could be counted but
// not explained: for a week an Explorer's page failed to open on WebKit and the
// log said only which check went red.
//
// So every page a walk opens is watched, quietly, and the last things it saw
// are printed to the log if -- and only if -- the walk exits with a failure:
// where it navigated, what the page threw, what the console called an error,
// and which requests failed. A green walk prints nothing extra. Nothing is sent
// anywhere; it is the job's own log.
//
// Next.js cancels a prefetch when the walk moves on, and WebKit reports each
// one; those are left out, or they would fill the record with noise.
const TRAIL = [];
const TRAIL_MAX = 80;
function note(kind, text) {
  const at = new Date().toISOString().slice(11, 23);
  TRAIL.push(`${at} ${kind}: ${String(text).replace(/\s+/g, ' ').slice(0, 300)}`);
  if (TRAIL.length > TRAIL_MAX) TRAIL.shift();
}
const cancelledPrefetch = (url, why) => /[?&]_rsc=/.test(url) && /cancel|abort/i.test(why || '');

function watchPage(page) {
  if (!page || page.__beaconWatched) return page;
  page.__beaconWatched = true;
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) note('page', frame.url());
  });
  page.on('pageerror', (err) => {
    if (isCancelledPrefetch(err)) return;
    note('threw', (err && err.message) || err);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') note('console error', msg.text());
  });
  page.on('requestfailed', (req) => {
    const why = (req.failure() && req.failure().errorText) || '';
    if (cancelledPrefetch(req.url(), why)) return;
    note('request failed', `${req.method()} ${req.url()} ${why}`);
  });
  page.on('crash', () => note('crashed', page.url()));
  return page;
}

function watchContext(context) {
  if (!context || context.__beaconWatched) return context;
  context.__beaconWatched = true;
  context.on('page', watchPage);
  for (const page of context.pages()) watchPage(page);
  return context;
}

function watchBrowser(browser) {
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...args) => watchContext(await newContext(...args));
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...args) => watchPage(await newPage(...args));
  return browser;
}

// Patched on this engine object only, so a suite that asks for `chromium` or
// `browser` gets watched pages without changing a line.
{
  const launch = engine.launch.bind(engine);
  engine.launch = async (...args) => watchBrowser(await launch(...args));
  const persistent = engine.launchPersistentContext.bind(engine);
  engine.launchPersistentContext = async (...args) => watchContext(await persistent(...args));
}

process.on('exit', (code) => {
  if (code === 0 || TRAIL.length === 0) return;
  console.log(`\n--- what the browser saw (${ENGINE}, last ${TRAIL.length} events) ---`);
  for (const line of TRAIL) console.log(`  ${line}`);
});

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
    // A page that still draws a strip of tabs.
    const tab = page.getByRole('tab', { name: label }).first();
    if ((await tab.count()) > 0) {
      if ((await tab.getAttribute('aria-selected')) === 'true') return true;
      await tab.click({ timeout: 5000 });
      await page.waitForTimeout(400);
      return true;
    }
    // EVERY SET OF SUB-ROOMS IS A DROP-DOWN since 30 September 2026
    // (components/SubroomMenu.tsx). Its button names the room you are in; the
    // rooms themselves are options in a list that is only there once it is
    // opened. A page can have two of them (a room's, and one person's
    // sections), so each is tried in turn and closed again if it is not the
    // one holding `label`.
    const toggles = page.locator('[data-subroom-toggle]');
    const n = await toggles.count();
    for (let i = 0; i < n; i += 1) {
      const toggle = toggles.nth(i);
      if (!(await toggle.isVisible())) continue;
      const said = ((await toggle.getAttribute('aria-label')) || '').replace(/^[^:]*:\s*/, '').replace(/, \d+ of \d+\. Show all$/, '');
      if (typeof label === 'string' ? said.includes(label) : label.test(said)) return true;
      await toggle.click({ timeout: 5000 });
      await page.waitForTimeout(250);
      const option = page.getByRole('option', { name: label }).first();
      if ((await option.count()) > 0) {
        await option.click({ timeout: 5000 });
        await page.waitForTimeout(400);
        return true;
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Press the thing the tutorial calls `quest` (`tab-materials`, `room-study`),
 * opening the drop-down it lives in first when it is not on the screen.
 *
 * Since 30 September 2026 every tab and sub-room is an option in a closed list
 * (components/SubroomMenu.tsx), so `[data-quest="tab-materials"]` is simply not
 * in the page until its list is opened. Returns whether it was pressed.
 */
async function openByQuest(page, quest) {
  const target = () => page.locator(`[data-quest="${quest}"]`).first();
  try {
    if ((await target().count()) > 0 && (await target().isVisible())) {
      await target().click({ timeout: 5000 });
      await page.waitForTimeout(400);
      return true;
    }
    const toggles = page.locator('[data-subroom-toggle]');
    for (let i = 0; i < (await toggles.count()); i += 1) {
      const toggle = toggles.nth(i);
      if (!(await toggle.isVisible())) continue;
      await toggle.click({ timeout: 5000 });
      await page.waitForTimeout(250);
      if ((await target().count()) > 0) {
        await target().click({ timeout: 5000 });
        await page.waitForTimeout(400);
        return true;
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Open the conversation: the typing box, wherever it is.
 *
 * THE CHAT LIVES IN THE TALK BUBBLE since 30 September 2026. A page about one
 * person carries Message, which opens the bubble at them; anywhere else the
 * bubble itself does, and with several conversations and none named it opens
 * on the list, so the first one is chosen. Tolerant like openRoom: returns
 * whether a box to type in is now on the screen.
 */
async function openChat(page) {
  const box = page.locator(COMPOSER).first();
  try {
    const message = page.locator('[data-message-button]');
    // THE BUBBLE REMEMBERS BEING OPEN, so after moving to another page it can
    // already be up, on somebody else's conversation, and covering the very
    // Message button that would open the right one. Put it down first when
    // there is a Message button to press.
    if ((await page.locator('[data-talk-sheet]').count()) > 0 && (await message.count()) > 0) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(350);
    } else if ((await box.count()) > 0 && (await box.isVisible())) {
      return true;
    }
    let pressed = false;
    for (let i = 0; i < (await message.count()); i += 1) {
      if (await message.nth(i).isVisible()) { await message.nth(i).click({ timeout: 5000 }); pressed = true; break; }
    }
    if (!pressed) {
      const bubble = page.locator('[data-talk-bubble]').first();
      if ((await bubble.count()) === 0) return false;
      await bubble.click({ timeout: 5000 });
    }
    await page.waitForTimeout(500);
    if ((await box.count()) === 0) {
      const thread = page.locator('[data-talk-thread]').first();
      if ((await thread.count()) > 0) { await thread.click({ timeout: 5000 }); await page.waitForTimeout(400); }
    }
    return (await box.count()) > 0;
  } catch {
    return false;
  }
}

/** The box a message is typed into, in the sample chat or the live one. */
const COMPOSER = '[data-quest="chat-send"] textarea, [data-live-composer] textarea';

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

/**
 * A request the walk itself cut short by moving to the next page.
 *
 * About 1.5 seconds after every page load the app checks for a new release:
 * it asks the server for /version.json, then asks the browser to re-check
 * /sw.js. A walk that moves to its next page at that moment cancels both.
 * WebKit reports each as "Cannot load http://localhost:PORT/... due to access
 * control checks", and Playwright raises that as a page error. Nothing went
 * wrong: the app handles the failed check, and the next page runs its own.
 * (Seen seven times in five Safari runs on 3 and 4 October 2026, each time
 * followed by the walk's next page load within 3 to 131ms.)
 *
 * So the rule is about ORDER, not words: the message, then the main page
 * navigating within CUT_SHORT_MS. The same words with no navigation after
 * them, another address, another path, or any other error still fail the walk.
 */
const CUT_SHORT_MS = 500;

function isCutShortMessage(message) {
  return /cannot load https?:\s?\/\/?(localhost|127\.0\.0\.1)(:\d+)?\/(?:version\.json|sw\.js)(?:\?\S*)? due to access control checks/i
    .test(String(message));
}

/**
 * Collect a page's errors, leaving out the two kinds of cancellation above.
 *
 *   const errors = pageErrors(page);
 *   ...
 *   assert.deepEqual(errors.list(), []);
 *
 * `now` is only there so tests/a-walk-forgives-only-what-it-cut-short.mjs can
 * drive the rule with a pretend clock.
 */
function pageErrors(page, now = Date.now) {
  const errors = [];
  // Cut-short messages waiting to see whether a navigation follows.
  let waiting = [];
  let documentRequest = null;

  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequest = request;
  });
  page.on('requestfailed', (request) => {
    if (request === documentRequest) documentRequest = null;
  });

  page.on('pageerror', (err) => {
    const text = String(err);
    if (isCancelledPrefetch(text)) return;
    if (isCutShortMessage(text)) waiting.push({ text, at: now() });
    else errors.push(text);
  });

  page.on('framenavigated', (frame) => {
    // History and hash changes also emit framenavigated, but cancel no fetch.
    if (frame !== page.mainFrame() || !documentRequest) return;
    documentRequest = null;
    const navigatedAt = now();
    const tooLongAgo = waiting.filter((w) => navigatedAt - w.at > CUT_SHORT_MS);
    errors.push(...tooLongAgo.map((w) => w.text));
    waiting = [];
  });

  // Anything still waiting when asked was never followed by a navigation.
  return { list: () => [...errors, ...waiting.map((w) => w.text)] };
}

module.exports = {
  openChat,
  openByQuest,
  COMPOSER,
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
  pageErrors,
  CUT_SHORT_MS,
};
