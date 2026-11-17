// Discover on Home: apps only, never news, and its own section.
//
// The founder, 17 November 2026: Discover is for applications; news and
// church updates belong to Church & Mission Updates alone. In the sample
// church no apps are configured (NEXT_PUBLIC_DISCOVER_LINKS is the
// deployment's own list), so Discover is not drawn at all, and no story
// appears anywhere but in the updates. The skip and keep rules are held by
// tests/discover-cards-skip-and-keep.mjs.
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
  await page.waitForSelector('[data-church-updates]', { timeout: 30_000 });
  await page.waitForSelector('[data-good-news]', { timeout: 30_000 });

  ok(await page.locator('[data-church-updates] [data-discover], [data-church-updates] [data-discover-card]').count() === 0,
     `${label}: Church & Mission Updates holds no Discover cards`);
  const configured = await page.evaluate(() => Boolean(document.querySelector('[data-discover]')));
  const news = await page.locator('[data-discover-card]:not([data-discover-card="app"])').count();
  ok(news === 0, `${label}: no news card in Discover (${configured ? 'apps configured' : 'no apps configured, so no Discover'})`);
  ok(await page.locator('[data-update-card]').count() > 0, `${label}: the stories are in Church & Mission Updates`);

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
