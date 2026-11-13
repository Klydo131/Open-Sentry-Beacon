// One tap from the wrong browser into Safari.
//
// WHAT THIS IS FOR. Apple permits only Safari to add an app to the iPhone home
// screen. That is not ours to change. What was ours was the distance between
// "you are in Chrome" and "you are in Safari", which was three written steps
// about a ••• menu whose position differs in every app that has one, and which
// people were failing at -- the reported version being (a bug report), because switching meant opening Safari and
// retyping the address, which loses the invitation link they were on.
//
// iOS reads a URL beginning `x-safari-https://` as "open the rest in Safari".
// One tap, same page, nothing retyped.
//
// THE THREE PROPERTIES CHECKED HERE, and each one is a way this could ship
// broken while looking fine:
//
//   1. The button appears where it is true: Chrome, Firefox, Edge and Opera on
//      iOS, and in-app browsers on iOS.
//   2. It NEVER appears where it is false. Real Safari does not need it, and
//      Android must never be told to open Safari, which its phone does not
//      have. Android inside Messenger is the case that catches a careless fix,
//      because `inAppBrowser()` matches there too.
//   3. The written steps survive underneath it. The scheme is undocumented and
//      some in-app browsers refuse the handoff silently, so a tap that does
//      nothing must leave a person no worse off than before.
//
//   npm run build && node scripts/run-next.mjs start -p 4396
//   node tests/e2e/safari-handoff.js 4396

const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4396';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 '
  + '(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
// Chrome on iOS keeps every Safari marker and appends CriOS. So does Firefox,
// with FxiOS. A Safari test that runs first matches both of them.
const IPHONE_CHROME = `${IPHONE_SAFARI.replace('Version/17.5 ', '')}CriOS/126.0.6478.108 `;
const IPHONE_FIREFOX = `${IPHONE_SAFARI} FxiOS/127.0 `;
const IPHONE_MESSENGER = `${IPHONE_SAFARI} [FB_IAB/MESSENGER;FBAV/450.0.0.34.109;]`;
const ANDROID_MESSENGER =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) '
  + 'Chrome/126.0.0.0 Mobile Safari/537.36 [FB_IAB/MESSENGER;FBAV/450.0.0.34.109;]';

const IPHONE = { width: 390, height: 844 };

/** The install card on Settings, where somebody goes looking on purpose. */
async function readCard(browser, userAgent, viewport = IPHONE) {
  const context = await browser.newContext({ userAgent, viewport });
  const page = await context.newPage();
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const body = await page.locator('body').innerText();
  // The href is the property, not the label. A button reading "Open in Safari"
  // that points at an ordinary https address does nothing at all.
  const hrefs = await page.locator('a[href^="x-safari-"]').evaluateAll(
    (nodes) => nodes.map((n) => n.getAttribute('href')),
  );
  // Where the browser actually ended up. /settings redirects a signed-out
  // visitor to /login, and carrying the page they are ON is the whole point --
  // somebody holding an invitation link must not be dropped at the home page.
  const here = page.url();
  await context.close();
  return { body, hrefs, here };
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  // ---- Chrome on an iPhone: the case the owner reported --------------------
  const chrome = await readCard(browser, IPHONE_CHROME);
  ok(/Chrome/i.test(chrome.body), 'the card names Chrome, so the reader knows which browser is the problem');
  ok(chrome.hrefs.length > 0, 'Chrome on iOS is offered a one-tap handoff to Safari');
  ok(chrome.hrefs.every((h) => h.startsWith('x-safari-http')),
     `and the link really carries the scheme (${chrome.hrefs[0] || 'none'})`);
  ok(chrome.hrefs.every((h) => h === `x-safari-${chrome.here}`),
     `and it carries the exact page they are on (${chrome.here})`);
  // The written steps must survive. A silent refusal by the browser leaves the
  // person with nothing otherwise.
  ok(/Add to Home Screen/i.test(chrome.body),
     'the written steps are still on screen underneath the button');

  // ---- Firefox on an iPhone, same rule -------------------------------------
  const firefox = await readCard(browser, IPHONE_FIREFOX);
  ok(firefox.hrefs.length > 0, 'Firefox on iOS is offered it too');

  // ---- Messenger on an iPhone ----------------------------------------------
  const messenger = await readCard(browser, IPHONE_MESSENGER);
  ok(/Messenger/i.test(messenger.body), 'the in-app browser is still named');
  ok(messenger.hrefs.length > 0, 'and offered the handoff');

  // ---- NEGATIVE: real Safari needs none of this ----------------------------
  const safari = await readCard(browser, IPHONE_SAFARI);
  ok(safari.hrefs.length === 0, 'real Safari is NOT told to open itself in Safari');
  ok(/Add to Home Screen/i.test(safari.body), 'and still gets the steps that work there');

  // ---- ANDROID IS NOT CHECKED HERE, AND THAT IS A DELIBERATE OMISSION -------
  //
  // The first version of this file asserted "Android is never offered a Safari
  // handoff", and it passed. It also passed with the iOS gate deliberately
  // removed, which means it was proving nothing: the surface these tests read
  // is the floating prompt, and on Android that renders the browser's own
  // install button instead of any written steps, so the handoff was never on
  // the page to be found either way.
  //
  // A green check that cannot fail is worse than no check, because it is
  // believed. The Android rule lives in safariHandoffUrl's `isIos()` gate and
  // is checked at the source level in tests/ios-install.mjs, which CAN fail
  // when it is removed. Proving it here would need a signed-in session on a
  // page that renders the settings card, which no other e2e test needs.
  void ANDROID_MESSENGER;

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
