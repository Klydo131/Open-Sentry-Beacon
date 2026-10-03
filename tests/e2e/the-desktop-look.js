// The Desktop look, in a browser: chosen in Settings, it puts every room down
// the left side of a computer screen and puts the bottom bar away; on a phone
// it is Classic; and choosing Classic again takes all of it away.
//
// Asked for on 3 October 2026: "This UI is not desktop friendly, can we make
// the desktop have it's own UI too", alongside "make sure the classic UI
// remains the same". Classic's own walk is tests/e2e/the-classic-look-stays.js.
//
//   npm run build && node scripts/run-next.mjs start -p 4414
//   node tests/e2e/the-desktop-look.js 4414

const { chromium, launchOptions } = require('./_playwright');

const PORT = process.argv[2] || '4414';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function signInAs(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const pick = page.getByText(who).first();
  if (await pick.count()) await pick.click();
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

const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const barShown = (page) => page.evaluate(() => {
  const bar = document.querySelector('nav[aria-label="Main"]');
  return !!bar && getComputedStyle(bar).display !== 'none';
});
const sidebar = (page) => page.locator('[data-desktop-nav]');

async function choose(page, id) {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const option = page.locator(`[data-panel="look-settings"] [data-ui-theme-choice="${id}"]`);
  await option.scrollIntoViewIfNeeded();
  await option.click();
  await page.waitForTimeout(500);
  return option;
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 3650 * 24 * 60 * 60 * 1000)); } catch { /* fine */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // 1. CLASSIC FIRST: no sidebar at all, the bar along the bottom.
  await signInAs(page, 'Maria Santos');
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  ok((await sidebar(page).count()) === 0 && (await barShown(page)), 'on Classic a computer has no sidebar, and the bar along the bottom');

  // 2. CHOOSE DESKTOP
  const option = await choose(page, 'desktop');
  ok((await option.getAttribute('aria-checked')) === 'true' && (await page.evaluate(() => document.documentElement.dataset.uiTheme)) === 'desktop',
     'Settings offers Desktop, and choosing it puts it on the page');
  ok(await sidebar(page).isVisible(), 'the rooms appear down the left side');
  ok(!(await barShown(page)), 'and the bar along the bottom is put away');
  const rooms = await sidebar(page).locator('a').allInnerTexts();
  ok(['Home', 'My Explorers', 'Office', 'This Sabbath', 'My Files', 'Settings'].every((r) => rooms.some((t) => t.includes(r))),
     `every room a Guide has is there: ${rooms.map((t) => t.replace(/\s+/g, ' ').trim()).join(', ')}`);
  ok((await sidebar(page).locator('a[aria-current="page"]').innerText()).includes('Settings'), 'and the room you are in is lit');
  const main = await page.locator('main').first().boundingBox();
  const side = await sidebar(page).boundingBox();
  ok(!!main && !!side && main.x >= side.x + side.width, 'the page starts after the sidebar, nothing underneath it');

  await sidebar(page).getByRole('link', { name: /Office/ }).click();
  await page.waitForURL(/\/office/);
  await page.waitForTimeout(1000);
  ok((await sidebar(page).locator('a[aria-current="page"]').innerText()).includes('Office'), 'a room opens from the sidebar, and is lit there');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok((await sidebar(page).isVisible()) && !(await barShown(page)), 'still Desktop after a reload: this device remembers');
  for (const w of [1280, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(400);
    ok((await sideways(page)) <= 1, `nothing scrolls sideways at ${w} wide`);
  }

  // 3. ON A PHONE, THE DESKTOP LOOK IS CLASSIC
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok(!(await sidebar(page).isVisible()) && (await barShown(page)), 'on a phone there is no sidebar, and the bar is back');
  const phone = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { pad: body.paddingLeft, ground: body.backgroundColor, header: getComputedStyle(document.querySelector('header')).backgroundColor };
  });
  ok(phone.pad === '0px' && phone.ground === 'rgb(244, 246, 251)' && phone.header === 'rgb(30, 42, 74)',
     'and the page is Classic\'s: no space kept for a sidebar, the same ground and header');

  // 4. CLASSIC AGAIN TAKES IT ALL AWAY
  await page.setViewportSize({ width: 1440, height: 900 });
  await choose(page, 'classic');
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok((await sidebar(page).count()) === 0 && (await barShown(page))
     && (await page.evaluate(() => getComputedStyle(document.body).paddingLeft)) === '0px',
     'choosing Classic again: no sidebar, the bar is back, the page where it was');

  // 5. THE FRONT DOOR IS NOT PUSHED SIDEWAYS FOR A SIDEBAR THAT IS NOT THERE
  await choose(page, 'desktop');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  ok((await page.evaluate(() => getComputedStyle(document.body).paddingLeft)) === '0px', 'the sign-in page keeps its own width');

  ok(errors.length === 0, `no errors in the page${errors.length ? `: ${errors[0]}` : ''}`);
  await browser.close();
  console.log(bad ? `RESULT: ${bad} BAD` : 'RESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
