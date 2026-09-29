// On a phone, every room in the sample app's header can be seen and tapped.
//
// Found on 29 September 2026 through a Safari failure: the tutorial's "See the
// journey chart" pointed at nothing on WebKit. The church link it points at
// lives in the header's sideways strip of rooms, and beside the brand and the
// pinned controls that strip was left with what was over: 45px at 412px wide,
// 23px at 390 and nothing at all at 360. So on most phones Church, Library,
// Office and Publish were not on screen, and WebKit's slightly wider text
// tipped the one-icon sliver at 412 under an icon's width. components/AppShell
// now gives the rooms their own row below `sm`, as the live header already did.
//
// Measured here at the three widths that matter, as a phone (touch, 2x): the
// church link is wholly inside the strip, the strip is most of the screen wide,
// and the first row did not wrap.
//
//   npm run build && node scripts/run-next.mjs start -p 4382
//   node tests/e2e/the-rooms-fit-a-phone.js 4382

const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4382';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  const browser = await chromium.launch(launchOptions);
  for (const width of [360, 390, 412]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.getByText(/Maria Santos/i).first().click();
    await page.waitForTimeout(1800);
    const m = await page.evaluate(() => {
      const link = document.querySelector('[data-quest="church-link"]');
      const strip = link?.closest('.overflow-x-auto');
      if (!link || !strip) return null;
      const l = link.getBoundingClientRect();
      const s = strip.getBoundingClientRect();
      const bell = document.querySelector('header [aria-label*="otification" i], header [aria-label*="alert" i]');
      const brand = document.querySelector('header a[aria-label$=" home"]');
      return {
        inside: l.left >= s.left - 0.5 && l.right <= s.right + 0.5,
        stripWidth: Math.round(s.width),
        belowBrand: Math.round(s.top) > Math.round(brand?.getBoundingClientRect().bottom ?? 0) - 1,
        oneFirstRow: !bell || Math.abs(bell.getBoundingClientRect().top - (brand?.getBoundingClientRect().top ?? 0)) < 20,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    ok(!!m, `${width}px: the header has its church link and rooms strip`);
    if (!m) { await ctx.close(); continue; }
    ok(m.inside, `${width}px: the church link is wholly on screen, not clipped by the strip`);
    ok(m.stripWidth >= width - 60, `${width}px: the rooms have a row of their own (${m.stripWidth}px wide)`);
    ok(m.belowBrand && m.oneFirstRow, `${width}px: the brand and the pinned controls stay on one row above it`);
    ok(m.overflow <= 0, `${width}px: nothing makes the page scroll sideways (${m.overflow}px)`);
    await ctx.close();
  }
  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
