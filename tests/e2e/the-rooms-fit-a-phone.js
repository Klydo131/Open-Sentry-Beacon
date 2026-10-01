// On a phone or a pad, every room is reachable from the bar at the bottom.
//
// ---------------------------------------------------------------------------
// HISTORY. This walk was written on 29 September 2026 for the header's row of
// room icons, after a Safari failure showed that on most phones Church,
// Library, Office and Publish were not on screen at all: the row was left with
// 45px at 412px wide and nothing at 360. It measured that the church link was
// wholly inside its strip.
//
// On 30 September 2026 that row was replaced by what was asked for: "Menu |
// People | My Files as our bottom for our UI to make it simple in our Mobile
// and Pad". So this now walks the bar the way a person would, as a phone (touch,
// 2x) at the three widths that matter, as a pad upright and on its side, and as
// a desktop, where the bar must not be drawn at all:
//
//   - the three tabs are on screen, whole, tall enough to hit, and not clipped;
//   - the header is one row with no rooms in it;
//   - Menu opens the Menu, lists Home, and Home opens the church;
//   - the last thing in the Menu can be scrolled clear of the bar;
//   - My Files keeps the bar, and People brings you back to your own people;
//   - nothing scrolls sideways.
//
// The source half is tests/the-bottom-bar.mjs.
//
//   npm run build && node scripts/run-next.mjs start -p 4382
//   node tests/e2e/the-rooms-fit-a-phone.js 4382
// ---------------------------------------------------------------------------

const { chromium, launchOptions, openChat } = require('./_playwright');
const PORT = process.argv[2] || '4382';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const SIZES = [
  { name: '360 phone', width: 360, height: 740, mobile: true },
  { name: '390 phone', width: 390, height: 844, mobile: true },
  { name: '412 phone', width: 412, height: 915, mobile: true },
  { name: 'pad upright', width: 820, height: 1180, mobile: true },
  { name: 'pad on its side', width: 1194, height: 834, mobile: true },
  // AND A DESKTOP, since "Can we have the same dropdown and UI with Desktops
  // please?" (30 September 2026). The same checks, with a mouse.
  { name: 'desktop', width: 1440, height: 900, mobile: false },
];

async function signIn(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByText(who).first().click();
  await page.waitForURL(/\/(dm|ds|admin)/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(800);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) { await consent.first().click().catch(() => {}); await page.waitForTimeout(400); }
}

const bar = (page) => page.locator('nav[aria-label="Main"]');
const tab = (page, label) => bar(page).getByRole('link', { name: label, exact: true });

async function litTab(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('nav[aria-label="Main"] a[aria-current]')].map((a) => a.textContent.trim()).join(','));
}

// Tap (or click, on a desktop), then wait for the address rather than a fixed
// pause: a slow machine taking a second longer is not the app being wrong.
async function go(page, locator, url) {
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
  if (touch) await locator.tap({ timeout: 8000 });
  else await locator.click({ timeout: 8000 });
  await page.waitForURL(url, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  for (const size of SIZES) {
    const at = `${size.name} (${size.width}px)`;
    const ctx = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      isMobile: size.mobile, hasTouch: size.mobile, deviceScaleFactor: 2, serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    await signIn(page, /Maria Santos/i);

    // 1. THE BAR, WHOLE AND ON SCREEN.
    const m = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Main"]');
      if (!nav || getComputedStyle(nav).display === 'none') return null;
      const n = nav.getBoundingClientRect();
      const tabs = [...nav.querySelectorAll('a')].map((a) => {
        const r = a.getBoundingClientRect();
        const label = a.querySelector('.tab-bar-label');
        return {
          text: a.textContent.trim(),
          inside: r.left >= -0.5 && r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5,
          h: Math.round(r.height),
          clipped: label ? label.scrollWidth > label.clientWidth + 1 : true,
        };
      });
      const brand = document.querySelector('header a[aria-label$=" home"]');
      const bell = document.querySelector('header [aria-label*="otification" i]');
      // Any link in the header to a room is the old row coming back. The
      // Install chip's `/settings#install` is a way to a card, not a room.
      const church = [...document.querySelectorAll('header a[href]')]
        .some((el) => /^\/(church|office|publish|cases|mail|settings|library|menu)(\?|$)/.test(el.getAttribute('href'))
          && el.getBoundingClientRect().width > 0);
      const rail = !!document.querySelector('nav[aria-label="Workspace"]');
      return {
        atBottom: Math.abs(n.bottom - window.innerHeight) < 1,
        tabs,
        headerOneRow: !!brand && !!bell && Math.abs(bell.getBoundingClientRect().top - brand.getBoundingClientRect().top) < 24,
        roomsInHeader: church,
        rail,
        reserved: getComputedStyle(document.documentElement).getPropertyValue('--tab-bar').trim(),
      };
    });
    ok(!!m, `${at}: the bottom bar is drawn`);
    if (!m) { await ctx.close(); continue; }
    ok(m.atBottom, `${at}: it sits on the bottom edge`);
    ok(m.tabs.map((t) => t.text).join(' | ') === 'Menu | People | My Files',
       `${at}: it reads Menu | People | My Files (${m.tabs.map((t) => t.text).join(' | ')})`);
    ok(m.tabs.every((t) => t.inside), `${at}: every tab is wholly on screen`);
    ok(m.tabs.every((t) => t.h >= 44), `${at}: every tab is at least 44px tall (${m.tabs.map((t) => t.h).join(', ')})`);
    ok(m.tabs.every((t) => !t.clipped), `${at}: no label is cut off`);
    ok(/^\d+px$/.test(m.reserved), `${at}: the page makes room for it (${m.reserved || 'nothing'})`);
    ok(m.headerOneRow && !m.roomsInHeader, `${at}: the header is one row, with no rooms in it`);
    ok(!m.rail, `${at}: and there is no left column drawing the rooms a second time`);
    ok((await litTab(page)) === 'People', `${at}: a Guide's home lights People (${await litTab(page)})`);

    // 2. MENU, AND HOME IN IT.
    await go(page, tab(page, 'Menu'), /\/menu/);
    ok(/\/menu$/.test(new URL(page.url()).pathname), `${at}: Menu opens the Menu (${new URL(page.url()).pathname})`);
    ok((await litTab(page)) === 'Menu', `${at}: and Menu is lit`);
    const rooms = await page.locator('main a.menu-row').allInnerTexts();
    const want = ['Home', 'My Explorers', 'Office', 'Publish', 'My Files', 'Mail', 'Settings'];
    const missing = want.filter((w) => !rooms.some((r) => r.includes(w)));
    ok(missing.length === 0, `${at}: the Menu lists every room a Guide has${missing.length ? ` (missing ${missing.join(', ')})` : ''}`);

    const home = page.locator('main [data-quest="church-link"]');
    ok(await home.isVisible(), `${at}: Home in the Menu is the tutorial's church link`);
    await go(page, home, /\/church/);
    ok(/\/church$/.test(new URL(page.url()).pathname), `${at}: and it opens the church home`);
    ok((await litTab(page)) === 'Menu', `${at}: which keeps Menu lit, as a room reached from it`);

    // THE LAST LINE OF A LONG PAGE CAN BE READ. Scrolled to the end, the lowest
    // text on the church home ends above the bar AND above everything that
    // floats over the bottom of the screen and now stands on top of the bar
    // (the sample-data pill, the chat bubble, the install bar).
    //
    // First written against the Menu, which is shorter than a phone, so it
    // never scrolled and passed with the page's own room for the bar taken
    // away. The church home is the longest screen a Guide opens every day.
    //
    // Two things this got wrong the first time, both of them about measuring:
    // the page scrolls smoothly, so 400ms after asking it was still moving
    // and the "last line" was wherever it happened to be; and the person's own
    // desk (the note, the timer, the pocket) is beside <main>, not in it. Below
    // `xl` the desk is a closed drawer off the right edge (30 September 2026):
    // still laid out, so still measurable, and not on the screen -- so what is
    // hidden or off the screen is left out of "the last line".
    //
    // A STAND-IN FLOATER, because the real ones come and go: the sample-data
    // pill flashes on a timer, the chat bubble is live-only, the install bar and
    // the nudge appear on their own schedules. A first version measured whatever
    // happened to be up and failed with "nothing floating" when the pill was
    // between flashes, and passed the last-line check for the same reason. So
    // the walk pins its own floater exactly the way they are pinned
    // (`safe-bottom fixed bottom-3`, the pill's height, the whole width so it
    // crosses whatever is last on the page), measures against it and the real
    // ones, and takes it away again.
    await page.evaluate(() => {
      const stand = document.createElement('div');
      stand.className = 'safe-bottom fixed inset-x-0 bottom-3';
      stand.style.height = '56px';
      stand.style.pointerEvents = 'none';
      stand.setAttribute('aria-label', 'stand-in floater');
      stand.setAttribute('data-stand-in', '');
      document.body.appendChild(stand);
    });
    //
    // And a third, found on the desktop: from 1280px the desk beside the page
    // is a sticky column that scrolls ITSELF, so scrolling the window never
    // reaches its last line. Every <aside> is scrolled to its own end too.
    const clear = await page.evaluate(async () => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      document.querySelectorAll('aside').forEach((a) => { a.scrollTop = a.scrollHeight; });
      await new Promise((r) => setTimeout(r, 400));
      const vh = window.innerHeight;
      const column = document.querySelector('main')?.parentElement ?? document.body;
      const leaves = [...column.querySelectorAll('*')].filter((el) => {
        if (el.children.length || !(el.textContent || '').trim()) return false;
        if (getComputedStyle(el).visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.left < window.innerWidth && r.right > 0;
      });
      if (!leaves.length) return null;
      const lowest = leaves.reduce((a, b) => (b.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? b : a));
      const lr = lowest.getBoundingClientRect();
      const over = [...document.querySelectorAll('body *')].filter((el) => {
        if (getComputedStyle(el).position !== 'fixed') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > vh - 160 && r.top > vh * 0.25
          && r.left < lr.right && r.right > lr.left;
      });
      const top = over.length ? Math.min(...over.map((el) => el.getBoundingClientRect().top)) : vh;
      return {
        scrolled: document.documentElement.scrollHeight > vh,
        last: Math.round(lr.bottom),
        top: Math.round(top),
        text: lowest.textContent.trim().slice(0, 30),
        what: over.map((el) => el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 24)).join(' / '),
      };
    });
    // AND WHAT FLOATS STANDS ON THE BAR, not behind it. Everything pinned to
    // the bottom of a phone wears `.safe-bottom`; each one on screen, the
    // stand-in included, must end at or above the bar's top edge, or it is
    // half hidden under the bar.
    const floats = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Main"]');
      const top = nav ? nav.getBoundingClientRect().top : window.innerHeight;
      return [...document.querySelectorAll('.safe-bottom')]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
        .map((el) => ({
          what: el.getAttribute('aria-label') || (el.textContent || '').trim().slice(0, 24) || el.className.slice(0, 24),
          under: Math.round(el.getBoundingClientRect().bottom - top),
        }));
    });
    const under = floats.filter((f) => f.under > 1);
    ok(floats.some((f) => f.what === 'stand-in floater') && under.length === 0,
       `${at}: everything floating stands on top of the bar (${floats.map((f) => `${f.what}: ${f.under}px`).join(', ')})`);
    await page.evaluate(() => document.querySelector('[data-stand-in]')?.remove());

    ok(!!clear && clear.scrolled, `${at}: the church home is long enough to scroll, so this measures something`);
    ok(!!clear && clear.last <= clear.top,
       `${at}: its last line ("${clear?.text}") scrolls clear of the bar and what floats on it `
       + `(${clear?.last} <= ${clear?.top}: ${clear?.what})`);
    await page.evaluate(() => window.scrollTo(0, 0));

    // 3. MY FILES KEEPS THE BAR, AND PEOPLE BRINGS YOU BACK.
    await go(page, tab(page, 'My Files'), /\/library/);
    ok(/\/library$/.test(new URL(page.url()).pathname), `${at}: My Files opens /library`);
    ok(await bar(page).isVisible() && (await litTab(page)) === 'My Files',
       `${at}: and the bar is still there, with My Files lit`);
    await go(page, tab(page, 'People'), /\/dm/);
    const u = new URL(page.url());
    ok(u.pathname === '/dm' && u.searchParams.get('room') === 'people',
       `${at}: People opens My Explorers (${u.pathname}${u.search})`);
    // The subrooms are a drop-down (30 September 2026); its button names the one you are in.
    ok(/My Explorers/.test((await page.locator('[data-subroom-toggle]').first().getAttribute('aria-label')) || ''),
       `${at}: on the My Explorers subroom`);

    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(over <= 0, `${at}: nothing makes the page scroll sideways (${over}px)`);
    await ctx.close();
  }

  // AN EXPLORER: People is their Guide, and the Study Room is in their Menu.
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    await signIn(page, /John Reyes/i);
    ok((await litTab(page)) === 'People', `Explorer: their journey lights People (${await litTab(page)})`);
    await go(page, tab(page, 'People'), /\/ds/);
    const u = new URL(page.url());
    ok(u.pathname === '/ds' && u.searchParams.get('room') === 'guide', `Explorer: People opens My Guide (${u.pathname}${u.search})`);
    await go(page, tab(page, 'Menu'), /\/menu/);
    const rooms = await page.locator('main a.menu-row').allInnerTexts();
    ok(rooms.some((r) => r.includes('Study Room')), 'Explorer: the Study Room is in their Menu');
    ok(!rooms.some((r) => /Office|Admin Reports/.test(r)), 'Explorer: and no room that is not theirs');
    await ctx.close();
  }

  // THE CONVERSATION IS IN THE TALK BUBBLE (30 September 2026). A Guide
  // opening one Explorer lands on Appointments, which is not a conversation and
  // keeps the bar. Message opens the bubble: on a phone it covers the whole
  // screen, bar and all; on a desktop it is a panel standing on the bar.
  for (const [label, w, h, mobile] of [['phone', 390, 844, true], ['desktop', 1440, 900, false]]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 2, serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    await signIn(page, /Maria Santos/i);
    await page.goto(`${BASE}/dm/pair-john`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    ok(!(await page.locator('[data-conversation-screen]').count()), `Appointments (${label}): is not marked as a conversation`);
    ok(await bar(page).isVisible(), `Appointments (${label}): and keeps the bar`);
    ok(/Appointments/.test((await page.locator('[data-subroom-toggle]').first().getAttribute('aria-label')) || ''),
       `Appointments (${label}): it is the section the page opens on`);

    ok(await openChat(page), `bubble (${label}): Message opens the conversation`);
    const geo = await page.evaluate(() => {
      const sheet = document.querySelector('[data-talk-sheet] .talk-sheet')?.getBoundingClientRect();
      const nav = document.querySelector('nav[aria-label="Main"]')?.getBoundingClientRect();
      const box = document.querySelector('[data-quest="chat-send"]')?.getBoundingClientRect();
      const report = document.querySelector('[data-talk-report]')?.getBoundingClientRect();
      return {
        vh: innerHeight, vw: innerWidth,
        sheet: sheet && { top: Math.round(sheet.top), bottom: Math.round(sheet.bottom), left: Math.round(sheet.left), right: Math.round(sheet.right) },
        barTop: nav ? Math.round(nav.top) : null,
        composerBottom: box ? Math.round(box.bottom) : null,
        reportTop: report ? Math.round(report.top) : null,
      };
    });
    if (mobile) {
      ok(!!geo.sheet && geo.sheet.left <= 0 && geo.sheet.right >= geo.vw && geo.sheet.bottom >= geo.vh - 1,
         `bubble (${label}): it covers the screen, bar and all (${JSON.stringify(geo.sheet)})`);
    } else {
      ok(!!geo.sheet && geo.barTop !== null && geo.sheet.bottom <= geo.barTop + 1,
         `bubble (${label}): the panel stands on the bar (${geo.sheet?.bottom} <= ${geo.barTop})`);
    }
    ok(geo.composerBottom !== null && geo.composerBottom <= geo.vh, `bubble (${label}): the box to type in is on the screen (${geo.composerBottom} <= ${geo.vh})`);
    ok(geo.reportTop !== null && geo.reportTop >= 0 && geo.reportTop < geo.vh / 3,
       `bubble (${label}): Report is at the top of it (${geo.reportTop}px)`);
    await page.getByRole('button', { name: 'Close the chat' }).first().click();
    await page.waitForTimeout(500);
    ok(!(await page.locator('[data-talk-sheet]').count()) && await bar(page).isVisible(),
       `bubble (${label}): closing it puts the page and the bar back`);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    await signIn(page, /John Reyes/i);
    await page.goto(`${BASE}/ds?room=guide`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    ok(await bar(page).isVisible(), 'Explorer: their home keeps the bar');
    ok((await page.locator('[data-message-button]').count()) > 0, 'Explorer: and Message is on it, for the conversation with their Guide');
    await ctx.close();
  }

  // THE DESK IS A DRAWER BELOW 1280px (30 September 2026): a tab on the right
  // edge opens it, ››› puts it away, and nothing of it is on the page until
  // then. From 1280px it is the column beside the page, with no tab.
  for (const [label, w, h, mobile] of [['phone', 390, 844, true], ['pad', 820, 1180, true], ['desktop', 1440, 900, false]]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h }, isMobile: mobile && w < 700, hasTouch: mobile, deviceScaleFactor: 2, serviceWorkers: 'block',
    });
    const page = await ctx.newPage();
    await signIn(page, /Maria Santos/i);
    await page.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const tabShown = await page.locator('[data-desk-tab]').isVisible();
    const deskShown = await page.locator('[data-desk-drawer] aside').first().isVisible();
    if (w >= 1280) {
      ok(!tabShown && deskShown, `desk (${label}): beside the page, with no tab`);
      const beside = await page.evaluate(() => {
        const aside = document.querySelector('[data-desk-drawer] aside')?.getBoundingClientRect();
        const main = document.querySelector('main')?.getBoundingClientRect();
        return aside && main ? aside.left >= main.right - 1 : false;
      });
      ok(beside, `desk (${label}): and it is the column to the right of the page`);
    } else {
      ok(tabShown && !deskShown, `desk (${label}): a tab on the edge, and the desk out of the way until asked for`);
      await page.locator('[data-desk-tab]').click();
      await page.waitForTimeout(500);
      const open = await page.evaluate(async () => {
        const d = document.querySelector('[data-desk-drawer]');
        d.scrollTop = d.scrollHeight;
        await new Promise((r) => setTimeout(r, 400));
        const r = d.getBoundingClientRect();
        const leaves = [...d.querySelectorAll('*')].filter((el) => !el.children.length && (el.textContent || '').trim()
          && el.getBoundingClientRect().height > 0);
        const lowest = Math.max(...leaves.map((el) => el.getBoundingClientRect().bottom));
        return { left: Math.round(r.left), right: Math.round(r.right), lowest: Math.round(lowest), vw: innerWidth, vh: innerHeight };
      });
      ok(open.left >= 0 && open.right <= open.vw + 1, `desk (${label}): opened, it is inside the screen (${open.left}..${open.right})`);
      ok(open.lowest <= open.vh, `desk (${label}): and its last line can be scrolled to (${open.lowest} <= ${open.vh})`);
      await page.locator('[data-desk-close]').click();
      await page.waitForTimeout(500);
      ok(!(await page.locator('[data-desk-drawer] aside').first().isVisible()), `desk (${label}): ››› puts it away`);
    }
    await ctx.close();
  }

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
