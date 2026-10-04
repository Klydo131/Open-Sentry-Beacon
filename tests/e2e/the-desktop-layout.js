// The app on a computer, in a browser: every room down the left side, a light
// bar across the top, and no bar along the bottom; on a phone, the bar and the
// navy header as they always were.
//
// Asked for on 3 October 2026: "This UI is not desktop friendly, can we make
// the desktop have it's own UI too", then "Top UI still looks like mobile",
// then "this is the classic. I dont want the UI classic with the outdated
// version where the UI is still mobile in desktop". So this is Classic on a
// computer, with nothing to choose. Classic's colours on a phone are walked in
// tests/e2e/the-classic-look-stays.js.
//
//   npm run build && node scripts/run-next.mjs start -p 4414
//   node tests/e2e/the-desktop-layout.js 4414

const { chromium, launchOptions, pageErrors } = require('./_playwright');

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

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => {
    try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 3650 * 24 * 60 * 60 * 1000)); } catch { /* fine */ }
  });
  const page = await context.newPage();
  // Through the shared filter, which leaves out what the walk itself cut
  // short: on WebKit a sidebar link's prefetch, cancelled by the next page,
  // is reported as a page error (seen on /mail, 4 October 2026).
  const pageErrorsSeen = pageErrors(page);

  // 1. A COMPUTER, WITH NOTHING CHOSEN: Classic, and Classic's computer layout.
  await signInAs(page, 'Maria Santos');
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  ok((await page.evaluate(() => document.documentElement.dataset.uiTheme)) === 'classic',
     'with nothing chosen, the page is Classic');
  ok((await sidebar(page).isVisible()) && !(await barShown(page)),
     'and on a computer Classic has the rooms down the left and no bar along the bottom');
  const rooms = await sidebar(page).locator('a').allInnerTexts();
  ok(['Home', 'My Explorers', 'Office', 'This Sabbath', 'My Files', 'Settings'].every((r) => rooms.some((t) => t.includes(r))),
     `every room a Guide has is there: ${rooms.map((t) => t.replace(/\s+/g, ' ').trim()).join(', ')}`);
  ok((await sidebar(page).locator('a[aria-current="page"]').innerText()).includes('Settings'), 'and the room you are in is lit');
  const main = await page.locator('main').first().boundingBox();
  const side = await sidebar(page).boundingBox();
  ok(!!main && !!side && main.x >= side.x + side.width, 'the page starts after the sidebar, nothing underneath it');
  ok((await page.locator('[data-panel="look-settings"] [data-ui-theme-choice="desktop"]').count()) === 0,
     'and Settings offers no separate Desktop look: this is Classic');

  await sidebar(page).getByRole('link', { name: /Office/ }).click();
  await page.waitForURL(/\/office/);
  await page.waitForTimeout(1000);
  ok((await sidebar(page).locator('a[aria-current="page"]').innerText()).includes('Office'), 'a room opens from the sidebar, and is lit there');

  // 2. A COMPUTER'S TOP BAR, NOT A PHONE'S. The owner, 3 October 2026, with a
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

  // 3. THE DESK STAYS BELOW THE BAR, scrolled part way and scrolled to the
  // very end (where a row ending early once pushed it underneath).
  const desk = await deskAfterScrolling(page);
  ok(desk.scrolled > 100 && desk.deskTop !== null && desk.deskTop >= desk.barBottom,
     `scrolled ${desk.scrolled}px, the desk still starts below the bar (${desk.deskTop} >= ${desk.barBottom})`);
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const atEnd = await page.evaluate(async () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 500));
    const rail = document.querySelector('.desk-rail')?.getBoundingClientRect();
    const header = document.querySelector('[data-app-header]')?.getBoundingClientRect();
    return { atEnd: Math.abs(scrollY - (document.documentElement.scrollHeight - innerHeight)) <= 1,
             deskTop: rail ? Math.round(rail.top) : null, barBottom: header ? Math.round(header.bottom) : null };
  });
  ok(atEnd.atEnd && atEnd.deskTop !== null && atEnd.deskTop >= atEnd.barBottom,
     `at the very end of a page, the desk still starts below the bar (${atEnd.deskTop} >= ${atEnd.barBottom})`);

  await page.goto(`${BASE}/office`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  for (const w of [1280, 1920]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(400);
    ok((await sideways(page)) <= 1 && (await sidebar(page).isVisible()), `the rooms are down the left and nothing scrolls sideways at ${w} wide`);
  }

  // 4. ON A PHONE: the bar along the bottom and the navy header, as always.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok(!(await sidebar(page).isVisible()) && (await barShown(page)), 'on a phone there is no sidebar, and the bar is there');
  const phone = await page.evaluate(() => {
    const body = getComputedStyle(document.body);
    return { pad: body.paddingLeft, ground: body.backgroundColor, header: getComputedStyle(document.querySelector('header')).backgroundColor };
  });
  ok(phone.pad === '0px' && phone.ground === 'rgb(244, 246, 251)' && phone.header === 'rgb(30, 42, 74)',
     'and the page is Classic\'s: no space kept for a sidebar, the same ground and navy header');

  // 5. A COMPUTER THAT CHOSE "DESKTOP" WHILE IT WAS A LOOK OF ITS OWN
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => localStorage.setItem('beacon-ui-theme', 'desktop'));
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok((await page.evaluate(() => document.documentElement.dataset.uiTheme)) === 'classic'
     && (await sidebar(page).isVisible()) && !(await barShown(page)),
     'is on Classic, and sees the same rooms down the left: nothing about its screen changed');

  // 5b. A LARGE iPAD TURNED SIDEWAYS IS A COMPUTER. The owner, 3 October 2026:
  // "keep the sidebar on large iPads". A 12.9-inch iPad Pro on its side is 1366
  // wide, past the 1280 the sidebar starts at; upright it is 1024, and an
  // 11-inch on its side is 1194, so both keep the bar.
  for (const [label, width, height, wantSidebar] of [
    ['12.9-inch iPad on its side', 1366, 1024, true],
    ['12.9-inch iPad upright', 1024, 1366, false],
    ['11-inch iPad on its side', 1194, 834, false],
  ]) {
    const pad = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await pad.addInitScript(() => {
      try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 3650 * 24 * 60 * 60 * 1000)); } catch { /* fine */ }
    });
    const tab = await pad.newPage();
    await signInAs(tab, 'Maria Santos');
    await tab.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
    await tab.waitForTimeout(1200);
    const side = await sidebar(tab).isVisible();
    const bar = await barShown(tab);
    ok(wantSidebar ? side && !bar : !side && bar,
       `${label} (${width} wide): ${wantSidebar ? 'the rooms are down the left, and no bar' : 'the bar along the bottom, and no sidebar'}`);
    ok((await sideways(tab)) <= 1, `${label}: nothing scrolls sideways`);
    await pad.close();
  }

  // 6. THE FRONT DOOR IS NOT PUSHED SIDEWAYS FOR A SIDEBAR THAT IS NOT THERE
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  ok((await page.evaluate(() => getComputedStyle(document.body).paddingLeft)) === '0px', 'the sign-in page keeps its own width');

  const errors = pageErrorsSeen.list();
  ok(errors.length === 0, `no errors in the page${errors.length ? `: ${errors[0]}` : ''}`);
  await browser.close();
  console.log(bad ? `RESULT: ${bad} BAD` : 'RESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
