// The Desktop look, in a browser: the default on a computer, it puts every
// room down the left side and puts the bottom bar away; on a phone it is
// Classic; and choosing Classic in Settings takes all of it away, for good.
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

// The top of a computer's screen: the header, what it shows, and what is beside it.
// The church home scrolled well down, and where the desk's column and the header end up.
async function deskAfterScrolling(page) {
  await page.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(600);
  return page.evaluate(() => {
    const rail = document.querySelector('.desk-rail')?.getBoundingClientRect();
    const header = document.querySelector('[data-app-header]')?.getBoundingClientRect();
    return { scrolled: Math.round(scrollY), deskTop: rail ? Math.round(rail.top) : null, barBottom: header ? Math.round(header.bottom) : null };
  });
}

const topOf = (page) => page.evaluate(() => {
  const header = document.querySelector('[data-app-header]');
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
  const back = header?.querySelector('[data-back-button]');
  const brand = header?.querySelector('[data-header-brand]');
  const h = header?.getBoundingClientRect();
  const logoRow = document.querySelector('[data-desktop-nav] a')?.getBoundingClientRect();
  const side = document.querySelector('[data-desktop-nav]')?.getBoundingClientRect();
  const you = header?.querySelector('a[href="/profile"]')?.getBoundingClientRect();
  return {
    bg: header ? getComputedStyle(header).backgroundColor : '',
    backThere: !!back, backShown: shown(back), brandThere: !!brand, brandShown: shown(brand),
    left: h ? Math.round(h.left) : null, bottom: h ? Math.round(h.bottom) : null,
    logoRowBottom: logoRow ? Math.round(logoRow.bottom) : null,
    sideRight: side && side.width ? Math.round(side.right) : null,
    youRight: you ? Math.round(you.right) : null, vw: innerWidth,
  };
});

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

  // 1. BEFORE ANYBODY CHOOSES, A COMPUTER IS ON DESKTOP. The owner, 3 October
  // 2026: "make Desktop the default on computers".
  await signInAs(page, 'Maria Santos');
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  ok((await sidebar(page).isVisible()) && !(await barShown(page)),
     'with nothing chosen, a computer has the rooms down the left and no bar along the bottom');

  // 2. CLASSIC IS ONE CHOICE AWAY, AND STAYS CHOSEN
  await choose(page, 'classic');
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok((await sidebar(page).count()) === 0 && (await barShown(page))
     && (await page.evaluate(() => getComputedStyle(document.body).paddingLeft)) === '0px',
     'choosing Classic: no sidebar at all, the bar along the bottom, the page where it was');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok((await sidebar(page).count()) === 0, 'and Classic stays after a reload: the default does not take it back');

  // 3. CHOOSE DESKTOP AGAIN
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

  // 3b. A COMPUTER'S TOP BAR, NOT A PHONE'S. The owner, 3 October 2026, with a
  // screenshot of the live app: "Top UI still looks like mobile, change the
  // desktop to real desktop design please". Office was reached from Settings,
  // so there is somewhere to go back to and the header has drawn its Back.
  const top = await topOf(page);
  ok(top.bg === 'rgb(255, 255, 255)', `the bar across the top is light, not the phone's navy band (${top.bg})`);
  ok(top.backThere && top.brandThere, 'the header has drawn its Back and its logo, so the next check measures something');
  ok(!top.backShown && !top.brandShown, 'and neither is shown: the logo is in the sidebar, and a computer has its own Back');
  ok(top.sideRight !== null && top.left >= top.sideRight - 1, `the bar starts after the sidebar (${top.left} >= ${top.sideRight})`);
  ok(top.logoRowBottom !== null && Math.abs(top.bottom - top.logoRowBottom) <= 1,
     `the bar and the sidebar's logo row end on one line (${top.bottom}, ${top.logoRowBottom})`);
  ok(top.youRight !== null && top.youRight >= top.vw - 48, `who you are sits at the right edge (${top.youRight} of ${top.vw})`);
  const desk = await deskAfterScrolling(page);
  ok(desk.scrolled > 100 && desk.deskTop !== null && desk.deskTop >= desk.barBottom,
     `scrolled ${desk.scrolled}px, the desk still starts below the bar, nothing of it underneath (${desk.deskTop} >= ${desk.barBottom})`);
  await page.goto(`${BASE}/office`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok((await sidebar(page).isVisible()) && !(await barShown(page)), 'still Desktop after a reload: this device remembers');
  for (const w of [1280, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(400);
    ok((await sideways(page)) <= 1, `nothing scrolls sideways at ${w} wide`);
  }

  // 4. ON A PHONE, THE DESKTOP LOOK IS CLASSIC
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

  // 5. CLASSIC AGAIN TAKES IT ALL AWAY
  await page.setViewportSize({ width: 1440, height: 900 });
  await choose(page, 'classic');
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok((await sidebar(page).count()) === 0 && (await barShown(page))
     && (await page.evaluate(() => getComputedStyle(document.body).paddingLeft)) === '0px',
     'choosing Classic again: no sidebar, the bar is back, the page where it was');
  const classicTop = await topOf(page);
  ok(classicTop.bg === 'rgb(30, 42, 74)' && classicTop.brandShown,
     `and Classic's header on a computer is the navy band with its logo, as it was (${classicTop.bg})`);
  // "yes fix it in Classic too" (3 October 2026): Classic's desk stuck 76px
  // from the top, under its header and the sample church's purple strip.
  const classicDesk = await deskAfterScrolling(page);
  ok(classicDesk.scrolled > 100 && classicDesk.deskTop !== null && classicDesk.deskTop >= classicDesk.barBottom,
     `in Classic too, scrolled ${classicDesk.scrolled}px, the desk starts below the header (${classicDesk.deskTop} >= ${classicDesk.barBottom})`);

  // 6. THE FRONT DOOR IS NOT PUSHED SIDEWAYS FOR A SIDEBAR THAT IS NOT THERE
  await choose(page, 'desktop');
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  ok((await page.evaluate(() => getComputedStyle(document.body).paddingLeft)) === '0px', 'the sign-in page keeps its own width');

  ok(errors.length === 0, `no errors in the page${errors.length ? `: ${errors[0]}` : ''}`);
  await browser.close();
  console.log(bad ? `RESULT: ${bad} BAD` : 'RESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
