// Does the app know whether it is installed, and does it keep asking if not?
//
// TWO PROPERTIES, AND THEY PULL AGAINST EACH OTHER. An app that never asks
// leaves people in a browser tab, losing their place every time they close it.
// An app that asks an installed user is broken in a way that reads as careless.
// So this checks both ends: the prompt comes back for somebody who has not
// installed, and it is gone the moment they have.
//
//   npm run build && node scripts/run-next.mjs start -p 4395
//   node tests/e2e/install-detection.js 4395
const { chromium, launchOptions, devices } = require('./_playwright');

const PORT = process.argv[2] || '4395';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// COUNTED BY ITS HOOK, NOT BY ITS WORDS.
//
// This was `getByText(/Install Hope Beacon/i)`, and it went red the day the
// heading changed -- correctly, but for a reason that has nothing to do with
// what this file is about, which is whether the prompt appears and how often.
// The copy differs per device now anyway: an iPhone is offered Add to Home
// Screen and a Mac Add to Dock, because no Apple menu contains the word
// Install. The element is the thing being counted, so count the element.
const seen = (page) => page.locator('[data-install-prompt]').count();

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const who = page.getByText(/Maria Santos/i).first();
  if (await who.count()) await who.click();
  await page.waitForTimeout(1700);
  const c = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await c.count()) await c.first().click().catch(() => {});
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  // ---- NOT INSTALLED: it asks, and it keeps asking ------------------------
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await signIn(page);
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  ok(await seen(page) > 0, 'a browser tab that has not installed is asked');

  // Dismiss, and it should go for now.
  await page.getByRole('button', { name: /Not now/i }).first().click();
  await page.waitForTimeout(400);
  ok(await seen(page) === 0, 'dismissing it puts it away');

  // A reload inside the snooze window must NOT nag again. Asking on every page
  // load is the version of "often" that gets an app deleted.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  ok(await seen(page) === 0, 'and a reload straight afterwards does not nag');

  // HOW LONG "for now" ACTUALLY IS, read off the stored value.
  //
  // The first version of this only wound the stored expiry into the past and
  // checked the prompt came back. That passes with a seven day snooze, because
  // overwriting the value says nothing about how it was set — the negative
  // control put it back to two days and the test still went green. Ask the
  // number directly instead.
  const dueIn = await page.evaluate(() => {
    const until = Number(localStorage.getItem('beacon-install-snoozed-until') || 0);
    return until - Date.now();
  });
  const minutes = Math.round(dueIn / 60000);
  // 13 November 2026, the owner. Closing it is thirty days now.
  const days = Math.round(dueIn / 86400000);
  ok(dueIn > 0 && days >= 28 && days <= 31,
     `"not now" puts it away for about a month, not an hour (it is ${days} days, ${minutes} minutes)`);

  // And an expired snooze really does let it back.
  await page.evaluate(() => {
    localStorage.setItem('beacon-install-snoozed-until', String(Date.now() - 1000));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  ok(await seen(page) > 0, 'once the month is up it asks again, because they still have no app');

  // ----  is a permanent way out -------------------------
  const already = page.getByRole('button', { name: /don.t ask again/i }).first();
  ok(await already.count() > 0, 'there is a one-tap permanent way out');
  if (await already.count()) {
    await already.click();
    await page.waitForTimeout(400);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    ok(await seen(page) === 0, 'and it survives a reload, unlike the monthly snooze');
  }
  // ---- INSTALLED WHILE THE PAGE IS OPEN -----------------------------------
  //
  // The half that a mount-time check cannot do. On Android the install happens
  // inside this very page, and the prompt used to carry on sitting there after
  // the person had already obeyed it. Nothing here reloads: the app has to
  // notice on its own.
  //
  // Checked with a negative control, because the mount-time check alone passes
  // the assertions above and would have made this file look like it covered
  // something it did not.
  const back = await ctx.newPage();
  await back.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await back.evaluate(() => {
    localStorage.removeItem('beacon-install-snoozed-until');
  });
  await back.reload({ waitUntil: 'networkidle' });
  await back.waitForTimeout(1500);
  ok(await seen(back) > 0, 'the prompt is on screen before installing');

  // COMING BACK TO THE TAB, which is the case a mount-time check cannot reach
  // and `appinstalled` does not cover either.
  //
  // On iOS the install happens in Safari's own chrome, so this page never sees
  // an appinstalled event at all. The person adds the app, opens it, then comes
  // back to the tab they left behind — and the tab has to work out on its own
  // that the answer has changed. Firing appinstalled here would have tested a
  // listener that already existed before any of this; the negative control
  // proved exactly that by passing without the new code.
  await back.evaluate(() => {
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await back.waitForTimeout(600);
  ok(await seen(back) === 0,
     'coming back to the tab after installing takes the prompt away, with no reload');

  await ctx.close();

  // ---- INSTALLED: it must never ask ---------------------------------------
  // display-mode: standalone is what an installed copy reports. Emulating the
  // media feature is how a real installed launch differs from a tab.
  const appCtx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const app = await appCtx.newPage();
  await app.emulateMedia({ media: 'screen', reducedMotion: null, colorScheme: null,
    forcedColors: null });
  await app.addInitScript(() => {
    // Stand in for an installed iOS copy, which reports navigator.standalone.
    Object.defineProperty(window.navigator, 'standalone', { value: true, configurable: true });
  });
  await signIn(app);
  await app.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await app.waitForTimeout(1600);
  ok(await seen(app) === 0, 'an installed copy is never asked to install');

  const chip = app.locator('a[title*="Install"], button[title*="Install"]');
  ok(await chip.count() === 0, 'and the header carries no Install control inside the app');

  await browser.close();
  console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
