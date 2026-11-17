// Discover cards on Home: skip one with ×, keep one in the Pocket.
//
// Runs against the sample church, where the stories are samples and the Pocket
// lives in the browser. The live half keeps cards through the database and is
// held by tests/discover-cards-skip-and-keep.mjs.
//
//   npm run build && node scripts/run-next.mjs start -p 4397
//   node tests/e2e/discover-cards-on-home.js 4397

const { browser: engine, launchOptions, pageErrors } = require('./_playwright');
const { signInAsExplorer } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '4397'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function walk(browser, label, options) {
  const context = await browser.newContext(options);
  await context.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
  const page = await context.newPage();
  const caught = pageErrors(page);
  await signInAsExplorer(page, BASE);
  await page.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-discover-card]', { timeout: 30_000 });

  const before = await page.locator('[data-discover-card]').count();
  ok(before >= 2, `${label}: Discover shows cards (${before})`);
  const box = await page.locator('[data-discover-skip]').first().boundingBox();
  ok(box && box.width >= 40 && box.height >= 40, `${label}: the × is a full tap target (${box?.width}×${box?.height})`);

  const firstTitle = await page.locator('[data-discover-card]').first().innerText();
  await page.locator('[data-discover-skip]').first().click();
  ok(await page.locator('[data-discover-card]').count() === before - 1, `${label}: × skips the card`);

  await page.locator('[data-discover-keep]').first().click();
  await page.waitForSelector('[data-discover-said]');
  const said = await page.locator('[data-discover-said]').first().innerText();
  const pocket = await page.evaluate(() => JSON.parse(localStorage.getItem('beacon-pocket') || '[]').map((i) => i.url));
  ok(/In your Pocket|Already/.test(said) && pocket.length > 0, `${label}: Add to Pocket keeps it ("${said}", ${pocket.length} in the Pocket)`);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const after = await page.locator('[data-discover-card]').allInnerTexts();
  ok(!after.includes(firstTitle), `${label}: a skipped card stays skipped after a reload`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, `${label}: nothing runs off the side (${over}px over)`);

  const errors = caught.list();
  ok(errors.length === 0, `${label}: no page errors${errors.length ? `: ${errors.slice(0, 2).join(' | ')}` : ''}`);
  await context.close();
}

(async () => {
  const browser = await engine.launch(launchOptions);
  try {
    await walk(browser, 'computer', { viewport: { width: 1280, height: 860 } });
    await walk(browser, 'phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
