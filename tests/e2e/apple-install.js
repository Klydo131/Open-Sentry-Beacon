// 
//
// THE BUG. Safari has never fired `beforeinstallprompt`, on iOS or on macOS.
// So on every Apple device the header's Install chip has no prompt to hand the
// browser and falls back to a link. That link pointed at `/settings`, and the
// install card lives near the bottom of a long page.
//
// From the user's side: they press a button that says Install, Settings opens,
// and nothing that mentions installing is on screen. There is no error and
// nothing looks broken, so the reasonable conclusion is that the button does
// not work. Android users never saw this, because Chrome gives them a real
// one-tap prompt and they never take this branch.
//
// The fix is an anchor and an opened accordion, which is why this test checks
// where the link goes AND what is on screen after following it. Checking only
// the href would have passed before the accordion was opened, and the person
// would still be looking at a button instead of an answer.
//
//   npm run build && node scripts/run-next.mjs start -p 4390
//   node tests/e2e/apple-install.js 4390
const { chromium, launchOptions, devices } = require('./_playwright');

const PORT = process.argv[2] || '4390';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  const browser = await chromium.launch(launchOptions);
  // An iPhone profile, so the app's isIos() sees an iOS user agent and takes
  // the Apple branch. beforeinstallprompt never fires here, exactly as on a
  // real iPhone.
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const who = page.getByText(/Maria Santos/i).first();
  if (await who.count()) await who.click();
  await page.waitForTimeout(1600);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) await consent.first().click().catch(() => {});
  await page.waitForTimeout(800);

  // ---- 1. The chip is a link, and it points AT the card ---------------------
  const chip = page.locator('a[title*="Install"], button[title*="Install"]').first();
  ok(await chip.count() > 0, 'the header offers Install on an iPhone');

  const tag = await chip.evaluate((el) => el.tagName.toLowerCase()).catch(() => '');
  const href = await chip.getAttribute('href').catch(() => null);

  // On Apple it MUST be a link. A <button> here would be the dead one: with no
  // deferred prompt to call, its click handler has nothing to do.
  ok(tag === 'a', `it is a link rather than a button with nothing behind it (got <${tag}>)`);
  ok((href || '').includes('/settings#install'),
     `it points at the install card, not the top of Settings (got ${href})`);

  // ---- 2. Following it lands on the card, with the steps already open ------
  await chip.click();
  await page.waitForTimeout(1800);

  ok(page.url().includes('#install'), 'the anchor survives the navigation');

  const card = page.locator('#install');
  ok(await card.count() > 0, 'the card has an id to scroll to');

  // SCOPED TO THE CARD, and that is the point rather than a detail. The first
  // version of this read document.body, and every one of these assertions
  // passed while the bug was present -- because the floating InstallPrompt
  // shows on iOS too and contains the very same words. The test was reading
  // the thing that already worked and reporting on the thing that did not.
  const cardText = (await card.count()) ? await card.innerText() : '';
  // THE WORD "INSTALL" IS THE BUG NOW, NOT THE FIXTURE. No Apple menu contains
  // it, so somebody told to press it searches a Share sheet for a word that is
  // not in it. This used to assert the heading said "Install Hope Beacon"; it
  // now asserts the opposite, and that the heading names the real control.
  ok(/Add Hope Beacon to your Home Screen/i.test(cardText),
     'the card offers Add to Home Screen, which is what the iPhone menu says');
  ok(!/\binstall\b/i.test(cardText),
     'and the card never says "install" to an iPhone');

  // The actual answer the person pressed the button for. Before the fix they
  // had to find the card and then press "Show me how" to get this.
  ok(/Add to Home Screen/i.test(cardText),
     'the iOS steps are already showing IN THE CARD, without a second button to find');
  ok(/Share/i.test(cardText), 'and they name the Share button');
  ok(!/Show me how/i.test(cardText),
     'the "Show me how" button is not still sitting there unpressed');

  // The card must be in view, not somewhere below the fold. Measured against
  // where the viewport actually is: a card 2000px down reports a sane-looking
  // rect, so the check has to be that it intersects the visible band.
  //
  // HONEST NOTE: this one does not currently discriminate. Settings is short
  // enough on a phone that the card is on screen even without the anchor, so
  // it stayed green while the bug was present. It is kept because the page will
  // grow and the day it does, this is the assertion that notices.
  if (await card.count()) {
    const view = await card.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: window.innerHeight };
    });
    ok(view.top < view.h && view.bottom > 0,
       `the card is in view after following the link (top ${view.top}, viewport ${view.h})`);
  }

  // ---- 3. THE BANNER MUST HAVE A BUTTON -----------------------------------
  //
  // Reported as (a bug report). It was
  // written as `{!manual && !inApp && <button>Install</button>}`, so it
  // rendered for Chrome and for nobody else: every Apple user, the one family
  // that cannot install by itself, got a banner made entirely of text.
  //
  // The button cannot install on iOS, because that API does not exist there.
  // What it must do is SHOW THE STEPS. So this checks both halves: the button
  // is on screen, and pressing it puts the instructions in front of the person.
  // Checking only that a button exists would pass on the dead button that
  // caused this in the first place.
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);

  const banner = page.locator('text=Add Hope Beacon to your Home Screen').first();
  ok(await banner.count() > 0, 'the banner appears on an iPhone by itself');

  const cta = page.getByRole('button', { name: /^Add to Home Screen$/i }).first();
  ok(await cta.count() > 0, 'and its button says Add to Home Screen');

  // The steps are NOT hidden behind the button, and must not be: somebody who
  // arrived from a Messenger link has to be told to leave Messenger without
  // pressing anything. in-app-browser.js enforces that, and this checks the
  // same thing from the other side.
  ok(await page.getByText(/Add to Home Screen/i).count() > 0,
     'the Add to Home Screen steps are visible without pressing anything');
  ok(await page.getByText(/Tap Share/i).count() > 0,
     'and they name the Share button, which is the control people could not find');

  if (await cta.count()) {
    // Nothing on Apple can install programmatically, so the button must not
    // pretend to. What it does is point at the control, which lives in the
    // browser's own chrome rather than on the page.
    await cta.click();
    await page.waitForTimeout(400);
    ok(await page.getByText(/Now look for the Share button/i).count() > 0,
       'pressing it points at the Share button rather than doing nothing');
  }

  // ---- 4. macOS Safari gets the same treatment, with its own wording -------
  //
  // Safari on a Mac fires beforeinstallprompt no more than Safari on a phone,
  // and the control is in a different place with a different name: File, then
  // Add to Dock. A Mac user told to "tap Share at the bottom" is being given
  // an iPhone's instructions.
  //
  // Chromium reports itself as Chrome, so isMacSafari() needs the user agent
  // overridden to exercise this branch at all.
  const macCtx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    serviceWorkers: 'block',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 '
      + '(KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  });
  const mac = await macCtx.newPage();
  await mac.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await mac.waitForTimeout(1500);
  const macWho = mac.getByText(/Maria Santos/i).first();
  if (await macWho.count()) await macWho.click();
  await mac.waitForTimeout(1800);
  const macConsent = mac.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await macConsent.count()) await macConsent.first().click().catch(() => {});
  await mac.waitForTimeout(1600);

  ok(await mac.getByText(/Add Hope Beacon to your Dock/i).count() > 0,
     'macOS Safari is offered Add to Dock, which is what its own menu says');
  const macCta = mac.getByRole('button', { name: /^Add to Dock$/i }).first();
  ok(await macCta.count() > 0, 'and the button says Add to Dock, not Install');
  ok(await mac.getByText(/Add to Dock/i).count() > 0,
     'and it gives the Mac steps, Add to Dock, not the iPhone ones');
  ok(await mac.getByText(/Add to Home Screen/i).count() === 0,
     'a Mac is never told to tap Share at the bottom of a phone');
  if (await macCta.count()) {
    await macCta.click();
    await mac.waitForTimeout(400);
    // A Mac has no Share step at all. Add to Dock lives under File in the menu
    // bar, so pointing at a toolbar was pointing at the wrong control.
    ok(await mac.getByText(/File menu|menu bar/i).count() > 0,
       'and pressing it points at the File menu, not a phone’s Share button');
  }

  await browser.close();
  console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
