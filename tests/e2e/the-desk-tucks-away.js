// On a computer the desk can be tucked away for a full-width page, and put back.
//
// Asked for on 12 November 2026. components/DeskDrawer.tsx.
//
//   node scripts/run-next.mjs dev -p 4414
//   node tests/e2e/the-desk-tucks-away.js 4414

const { chromium, launchOptions, pageErrors } = require('./_playwright');

const PORT = process.argv[2] || '4414';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const pick = page.getByText('Maria').first();
  if (await pick.count()) await pick.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand, continue/i }).first();
  try {
    await consent.waitFor({ state: 'visible', timeout: 3000 });
    await consent.click();
    await page.waitForTimeout(600);
  } catch { /* not shown */ }
}

const shown = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none'
    && r.width > 0 && r.right > 0 && r.left < window.innerWidth;
}, sel);
const mainWidth = (page) => page.evaluate(() => document.querySelector('main')?.getBoundingClientRect().width ?? 0);

(async () => {
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = pageErrors(page);
  await signIn(page);
  await page.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // 1. As it was: the desk is the column beside the page, with its own arrows.
  ok(await shown(page, 'aside.desk-rail'), 'the desk starts as the column beside the page');
  ok(await shown(page, '[data-desk-tuck]'), 'with a Full width ››› at its top');
  ok(!(await shown(page, '[data-desk-tab]')), 'and no cabinet tab on the edge');
  const before = await mainWidth(page);

  // 2. Tucked: the page widens, the desk waits behind the cabinet tab.
  await page.click('[data-desk-tuck]');
  await page.waitForTimeout(500);
  ok(!(await shown(page, 'aside.desk-rail')), 'tucked, the desk is off the screen');
  ok(await shown(page, '[data-desk-tab]'), 'the cabinet tab is on the right edge');
  const after = await mainWidth(page);
  ok(after > before, `the page is wider (${before} -> ${after})`);

  // 3. Remembered across a reload, from the first paint.
  await page.reload({ waitUntil: 'domcontentloaded' });
  ok(await page.evaluate(() => document.documentElement.dataset.deskTucked === '1'),
     'after a reload it is still tucked, before the app has loaded');
  await page.waitForLoadState('networkidle');

  // 4. The tab opens it as a drawer; Escape puts it away.
  await page.click('[data-desk-tab]');
  await page.waitForTimeout(600);
  ok(await shown(page, 'aside.desk-rail'), 'the tab slides the desk in');
  ok(await shown(page, '[data-desk-pin]'), 'with a way to keep it beside the page');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  ok(!(await shown(page, 'aside.desk-rail')), 'Escape puts it away');

  // 5. Pinned back: the column returns and the choice is forgotten.
  await page.click('[data-desk-tab]');
  await page.waitForTimeout(600);
  await page.click('[data-desk-pin]');
  await page.waitForTimeout(600);
  ok(await shown(page, 'aside.desk-rail') && !(await shown(page, '[data-desk-tab]')),
     'Keep beside the page brings the column back');
  ok(await page.evaluate(() => localStorage.getItem('beacon-desk-tucked') === null), 'and this device forgets the tuck');

  // 6. A phone is unchanged: no Full width button, the drawer as before.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(400);
  ok(!(await shown(page, '[data-desk-tuck]')), 'on a phone there is no Full width button');
  ok(await shown(page, '[data-desk-tab]'), 'and the cabinet tab is there as always');

  const seen = errors.list();
  ok(seen.length === 0, `no errors in the page${seen.length ? `: ${seen[0]}` : ''}`);
  await browser.close();
  console.log(bad ? `RESULT: ${bad} BAD` : 'RESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
