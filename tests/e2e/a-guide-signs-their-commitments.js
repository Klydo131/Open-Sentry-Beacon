// A Guide signs their commitments before walking with anyone, and a Director
// sees who has not.
//
// The sample Guide opens their desk: the commitments card is at the top and
// cannot be signed until all six are ticked and their own full name is typed.
// Signed, it shrinks to one line with the renewal date. A Director's Alerts
// warn while a Guide has not signed. Phone and desktop.
//
//   npm run build && node scripts/run-next.mjs start -p 4396
//   node tests/e2e/a-guide-signs-their-commitments.js 4396

const { chromium, launchOptions, openByQuest, isCancelledPrefetch } = require('./_playwright');
const PORT = process.argv[2] || '4396';
const BASE = `http://localhost:${PORT}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function signInAs(page, name) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const who = page.getByText(new RegExp(name, 'i')).first();
  if ((await who.count()) === 0) return false;
  await who.click();
  await page.waitForTimeout(1800);
  return true;
}

async function walk(browser, viewport) {
  const tag = `${viewport.width}px`;
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!isCancelledPrefetch(e.message)) errors.push(e.message); });

  // A Director first: the warning is there while the Guides have not signed.
  ok(await signInAs(page, 'Pastor Ramos'), `${tag}: the Director signs in`);
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await openByQuest(page, 'tab-analytics');
  await page.locator('[data-pulse-tile]').first().waitFor({ timeout: 15000 });
  await page.locator('[data-pulse-tab="alerts"]').click();
  await page.waitForTimeout(500);
  ok((await page.locator('[data-warning="commitments"][data-severity="critical"]').count()) === 1, `${tag}: Alerts warn, urgently, that Guides have not signed`);

  // The Guide.
  ok(await signInAs(page, 'Maria Santos'), `${tag}: the Guide signs in`);
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  const card = page.locator('[data-commitments="unsigned"]');
  await card.waitFor({ timeout: 15000 });
  ok(await card.isVisible(), `${tag}: the commitments are at the top of the Guide's desk`);
  ok((await page.locator('[data-commitment]').count()) === 6, `${tag}: six commitments, each with its own tick`);
  const sign = page.locator('[data-commitments-sign]');
  ok(await sign.isDisabled(), `${tag}: it cannot be signed before anything is ticked`);
  for (const box of await page.locator('[data-commitment]').all()) await box.check();
  await page.locator('[data-commitments-name]').fill('Someone Else');
  ok(await sign.isDisabled(), `${tag}: nor with somebody else's name`);
  await page.locator('[data-commitments-name]').fill('  maria   santos ');
  ok(await sign.isEnabled(), `${tag}: all six ticked and their own name (any case) unlocks it`);
  await sign.click();
  await page.locator('[data-commitments="signed"]').waitFor({ timeout: 5000 });
  ok(/Renew by/.test(await page.locator('[data-commitments="signed"]').innerText()), `${tag}: signed, it shrinks to one line with the renewal date`);
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${tag}: nothing scrolls sideways`);

  // Back to the Director: one Guide fewer is unsigned.
  ok(await signInAs(page, 'Pastor Ramos'), `${tag}: the Director comes back`);
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await openByQuest(page, 'tab-analytics');
  await page.locator('[data-pulse-tile]').first().waitFor({ timeout: 15000 });
  await page.locator('[data-pulse-tab="journeys"]').click();
  await page.waitForTimeout(400);
  ok(/Guides who signed their commitments\s*1 of/.test(await page.locator('[data-pulse-people]').innerText()), `${tag}: the Director sees the signature counted`);
  ok(errors.length === 0, `${tag}: no script errors${errors.length ? `: ${errors[0]}` : ''}`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) await walk(browser, viewport);
  await browser.close();
  console.log(bad === 0 ? '\nA Guide signs their commitments.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})();
