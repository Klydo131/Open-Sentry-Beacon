// Opening a shared link from inside another app's browser.
//
// THE REPORTED BUG. A church shared the address in Messenger. Tapping it opens
// Messenger's OWN web view, which reports itself as an iPhone or iPad, is not
// standalone, and is on the right host — so every check said "offer the
// install" and the card printed "Tap Share at the bottom of Safari, choose Add
// to Home Screen".
//
// There is no Safari. On iOS no in-app browser can install anything; only
// Safari can. Apple users were handed steps that cannot be carried out, with
// nothing saying the browser was the problem, and concluded the app was broken.
//
// The controls that matter are the pair: the SAME page must give Safari
// instructions in Safari and refuse to in Messenger. One without the other
// proves nothing — a card that never mentions Safari would pass half of this.
//
//   npm run build && node scripts/run-next.mjs start -p 4390
//   node tests/e2e/in-app-browser.js 4390

const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4390';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
  + '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

// A real Messenger in-app UA: Safari's string with Facebook's markers appended.
const IPHONE_MESSENGER = `${IPHONE_SAFARI} [FB_IAB/MESSENGER;FBAV/450.0.0.34.109;]`;
const IPAD_SAFARI =
  'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
  + '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

async function readCard(browser, userAgent, viewport) {
  const context = await browser.newContext({ userAgent, viewport });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  // The prompt waits a beat so it does not land mid-paint.
  await page.waitForTimeout(3500);
  const text = await page.locator('body').innerText();
  await context.close();
  return text;
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  // ---- POSITIVE CONTROL: real Safari on an iPhone --------------------------
  // Without this the test below proves nothing: a card that never mentions
  // Safari at all would "pass" the Messenger check.
  const safari = await readCard(browser, IPHONE_SAFARI, { width: 390, height: 844 });
  ok(/Add Hope Beacon to your Home Screen/i.test(safari),
    'real Safari is still offered the install, in the words its own menu uses');
  ok(/Add to Home Screen/i.test(safari), 'real Safari gets the Add to Home Screen step');
  ok(!/built-in browser|Open in Safari/i.test(safari),
    'real Safari is NOT told to open itself in Safari');

  // ---- THE BUG: Messenger's in-app browser ---------------------------------
  const messenger = await readCard(browser, IPHONE_MESSENGER, { width: 390, height: 844 });
  ok(/Messenger/i.test(messenger),
    'the card NAMES the app whose browser you are trapped in');
  ok(/Open in Safari/i.test(messenger),
    'THE FIRST STEP IN MESSENGER IS TO LEAVE MESSENGER');
  // This assertion was weaker on the first attempt — it looked for "Tap Share
  // at the bottom/top", and the pill that actually shipped to the reporter said
  // plain "Tap Share, then ...". It passed against the broken build, which
  // means it was testing nothing. This is the exact string from the bug report.
  ok(!/Tap Share, then/i.test(messenger),
    'MESSENGER IS NOT GIVEN THE SAFARI SHARE STEP IT CANNOT FOLLOW');
  // And Share must never be the FIRST thing asked of somebody in Messenger:
  // whatever else the card says, leaving Messenger has to come before it.
  // "Add to Home Screen" IS NO LONGER USABLE HERE, and dropping it is not a
  // weakening. It is now in the HEADING of every Apple card -- that is the whole
  // point of the rename, since no Apple menu says Install -- so searching for it
  // finds the title rather than a step, and reports that Share was asked first
  // on a card whose first step is to leave Messenger. The step wording is what
  // this assertion was ever about.
  const shareAt = messenger.search(/Tap Share/i);
  const safariAt = messenger.search(/Open in Safari/i);
  ok(safariAt >= 0 && (shareAt < 0 || safariAt < shareAt),
    'leaving Messenger is asked BEFORE any Share step, not after');

  // ---- iPad: Share is at the TOP, not the bottom ---------------------------
  // The old copy said "bottom" on every device. A non-technical person told to
  // look at the bottom looks at the bottom, does not find it, and stops.
  const ipad = await readCard(browser, IPAD_SAFARI, { width: 1024, height: 1366 });
  ok(/top of Safari/i.test(ipad) || !/bottom of Safari/i.test(ipad),
    'an iPad is not told to look at the bottom of Safari');

  await browser.close();
  console.log(bad === 0 ? '\nAll in-app browser checks passed.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
