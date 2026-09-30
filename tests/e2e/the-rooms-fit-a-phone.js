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

const { chromium, launchOptions } = require('./_playwright');
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

// Tap, then wait for the address rather than a fixed pause: a slow machine
// taking a second longer is not the app being wrong.
async function go(page, locator, url) {
  await locator.tap({ timeout: 8000 });
  await page.waitForURL(url, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  for (const size of SIZES) {
    const at = `${size.name} (${size.width}px)`;
    const ctx = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      isMobile: size.mobile, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block',
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
      const church = [...document.querySelectorAll('header [data-quest="church-link"]')]
        .some((el) => el.getBoundingClientRect().width > 0);
      return {
        atBottom: Math.abs(n.bottom - window.innerHeight) < 1,
        tabs,
        headerOneRow: !!brand && !!bell && Math.abs(bell.getBoundingClientRect().top - brand.getBoundingClientRect().top) < 24,
        roomsInHeader: church,
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
    // and the "last line" was wherever it happened to be; and below `xl` the
    // person's own rail (the note, the timer, the pocket) stacks UNDER the
    // page, so the last line is in the column, not in <main>.
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
    const clear = await page.evaluate(async () => {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 400));
      const vh = window.innerHeight;
      const column = document.querySelector('main')?.parentElement ?? document.body;
      const leaves = [...column.querySelectorAll('*')].filter((el) => {
        if (el.children.length || !(el.textContent || '').trim()) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
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
    ok(await page.getByRole('tab', { name: /My Explorers/ }).first().getAttribute('aria-selected') === 'true',
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

  // A DESKTOP: the rail is the navigation, and the bar is not drawn.
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await signIn(page, /Maria Santos/i);
    const d = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Main"]');
      return {
        hidden: !nav || getComputedStyle(nav).display === 'none',
        reserved: getComputedStyle(document.documentElement).getPropertyValue('--tab-bar').trim(),
        church: [...document.querySelectorAll('header [data-quest="church-link"]')].some((el) => el.getBoundingClientRect().width > 0),
      };
    });
    ok(d.hidden && !d.reserved, `desktop (1440px): no bottom bar, and nothing reserved for one (${d.reserved || 'none'})`);
    ok(d.church, 'desktop (1440px): the header keeps its rooms, as before');
    await ctx.close();
  }

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
