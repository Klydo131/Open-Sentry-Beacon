// The right-hand drawer holds the look and the text size, in the asked order.
//
// Asked for on 16 November 2026: in the drawer, Theme comes before the room's
// colours, and Text size after them and before the study timer. They are the
// same settings as Settings, General: choosing one here shows there.
//
//   npm run build && node scripts/run-next.mjs start -p 4397
//   node tests/e2e/the-drawer-holds-look-and-text.js 4397

const { chromium, launchOptions, isCancelledPrefetch } = require('./_playwright');
const PORT = process.argv[2] || '4397';
const BASE = `http://localhost:${PORT}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function walk(browser, viewport, who, path) {
  const tag = `${who} at ${viewport.width}px`;
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  // The install offer would otherwise sit over a phone's first visit.
  await ctx.addInitScript(() => {
    try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 3650 * 864e5)); } catch { /* fine */ }
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!isCancelledPrefetch(e.message)) errors.push(e.message); });
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByText(new RegExp(who, 'i')).first().click();
  await page.waitForTimeout(1800);
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  // A first-time Explorer reads the privacy notice before anything else.
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) { await consent.first().click().catch(() => {}); await page.waitForTimeout(600); }
  // On a phone the drawer is tucked at the edge: open it as a person would.
  const tab = page.locator('[data-desk-tab]');
  if ((await tab.count()) && await tab.first().isVisible()) { await tab.first().click(); await page.waitForTimeout(600); }
  const rail = page.locator('aside.desk-rail');
  ok((await rail.count()) === 1, `${tag}: the drawer is on the page`);
  const order = await rail.evaluate((el) => {
    const at = (sel) => { const n = el.querySelector(sel); return n ? Array.prototype.indexOf.call(el.querySelectorAll('*'), n) : -1; };
    return { look: at('[data-quick-look]'), colours: at('[data-room-palettes]'), text: at('[data-quick-text]'), timer: at('[data-focus-timer], [data-today-card]'), any: el.innerText };
  });
  ok(order.look > -1 && order.look < order.colours, `${tag}: Theme comes before the room colours`);
  ok(order.text > order.colours, `${tag}: Text size comes after the room colours`);
  ok(order.timer > -1 && order.text < order.timer, `${tag}: and before the study time`);
  // Choosing in the drawer is choosing in Settings.
  await rail.locator('[data-quick-look-choice="focus"]').click();
  await page.waitForTimeout(400);
  ok(await rail.locator('[data-quick-look-choice="focus"]').getAttribute('aria-checked') === 'true', `${tag}: a theme can be chosen in the drawer`);
  await rail.locator('[data-quick-text-size="large"]').click();
  await page.waitForTimeout(400);
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const look = page.locator('[data-ui-theme-choice="focus"]');
  ok((await look.count()) > 0 && (await look.first().getAttribute('aria-checked')) === 'true', `${tag}: Settings shows the same theme chosen`);
  ok(/Large is in use/i.test(await page.locator('[data-text-size-status]').innerText().catch(() => '')), `${tag}: and the same text size in use`);
  ok(errors.length === 0, `${tag}: no script errors${errors.length ? `: ${errors[0]}` : ''}`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    await walk(browser, viewport, 'John Reyes', '/ds');
  }
  await browser.close();
  console.log(bad === 0 ? '\nThe drawer holds the look and the text.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})();
