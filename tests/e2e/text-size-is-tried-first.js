// Text size is tried in the preview first, and changes the app only on Apply.
//
// Asked for on 3 October 2026: "text size should be tested and see first
// before applying, there should be an apply button for text size". Walked on
// a phone, where the size matters most, and on a computer.
//
//   npm run build && node scripts/run-next.mjs start -p 4416
//   node tests/e2e/text-size-is-tried-first.js 4416

const { chromium, launchOptions } = require('./_playwright');

const PORT = process.argv[2] || '4416';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function signInAs(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  await page.getByText(who).first().click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand, continue/i }).first();
  try {
    await consent.waitFor({ state: 'visible', timeout: 3000 });
    await consent.click();
    await page.waitForTimeout(600);
  } catch {
    // Not shown, or already accepted.
  }
}

const rootPx = (page) => page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
const stored = (page) => page.evaluate(() => localStorage.getItem('beacon-scale'));
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

(async () => {
  const browser = await chromium.launch(launchOptions);
  for (const [label, viewport, mobile] of [['phone', { width: 390, height: 844 }, true], ['computer', { width: 1440, height: 900 }, false]]) {
    const context = await browser.newContext({ viewport, isMobile: mobile, hasTouch: mobile });
    await context.addInitScript(() => {
      try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 3650 * 864e5)); } catch { /* fine */ }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await signInAs(page, 'Maria Santos');
    await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const card = page.locator('[data-panel="text-size"]');
    const apply = card.locator('[data-text-size-apply]');
    const preview = card.locator('[data-text-size-preview] p').nth(2);
    ok((await card.count()) === 1 && (await rootPx(page)) === 18, `${label}: Settings has the Text size card, and the app is at Normal (18px)`);
    ok(await apply.isDisabled(), `${label}: Apply waits until a different size is tried`);

    // 1. TRYING A SIZE CHANGES THE PREVIEW AND NOTHING ELSE
    await card.locator('[data-text-size="xlarge"]').click();
    await page.waitForTimeout(300);
    const tried = await preview.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    ok(Math.abs(tried - 18 * 1.3) < 0.2, `${label}: the preview is drawn at Extra large (${tried}px)`);
    ok((await rootPx(page)) === 18 && (await stored(page)) !== '1.3',
       `${label}: and the app has not moved: still 18px, nothing saved`);
    ok((await card.locator('[data-text-size="xlarge"]').getAttribute('aria-pressed')) === 'true'
       && /In use/.test(await card.locator('[data-text-size="normal"]').innerText()),
       `${label}: the size being tried is pressed, and the one in use says so`);
    ok(!(await apply.isDisabled()) && /Apply/.test(await card.locator('[data-text-size-status]').innerText()),
       `${label}: Apply is ready, and the card says what pressing it does`);
    ok((await sideways(page)) <= 1, `${label}: nothing scrolls sideways while trying it`);

    // 2. KEEPING THE CURRENT SIZE PUTS THE PREVIEW BACK
    await card.locator('[data-text-size-keep]').click();
    await page.waitForTimeout(300);
    ok((await apply.isDisabled()) && (await card.locator('[data-text-size="normal"]').getAttribute('aria-pressed')) === 'true',
       `${label}: "Keep Normal" puts the preview back, and Apply waits again`);

    // 3. APPLY CHANGES THE APP, AND THIS DEVICE REMEMBERS
    await card.locator('[data-text-size="large"]').click();
    await apply.click();
    await page.waitForTimeout(400);
    ok(Math.abs((await rootPx(page)) - 18 * 1.15) < 0.1 && (await stored(page)) === '1.15',
       `${label}: Apply makes the whole app Large (${await rootPx(page)}px) and saves it`);
    ok(/applied everywhere/.test(await card.locator('[data-text-size-status]').innerText()) && (await apply.isDisabled()),
       `${label}: and says it is applied`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    ok(Math.abs((await rootPx(page)) - 18 * 1.15) < 0.1
       && (await page.locator('[data-panel="text-size"] [data-text-size="large"]').getAttribute('aria-pressed')) === 'true',
       `${label}: still Large after a reload, and the card shows it`);

    // 4. BACK TO NORMAL, THE SAME WAY
    await page.locator('[data-panel="text-size"] [data-text-size="normal"]').click();
    await page.locator('[data-panel="text-size"] [data-text-size-apply]').click();
    await page.waitForTimeout(400);
    ok((await rootPx(page)) === 18 && (await stored(page)) === '1', `${label}: and back to Normal with Apply`);

    ok(errors.length === 0, `${label}: no errors in the page${errors.length ? `: ${errors[0]}` : ''}`);
    await context.close();
  }
  await browser.close();
  console.log(bad ? `RESULT: ${bad} BAD` : 'RESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
