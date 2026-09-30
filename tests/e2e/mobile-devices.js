// The app on a phone AND a tablet, at real device sizes, with touch instead of
// a mouse.
//
// WHAT THIS PROVES AND WHAT IT DOES NOT. It runs Chromium with each device's
// viewport, pixel ratio, touch support and user agent. That is enough to catch
// the things that actually break on phones in practice: controls pushed off
// screen, tap targets too small to hit, a composer that a soft keyboard would
// bury, horizontal scroll, and features that silently need a mouse.
//
// It is NOT Safari. iOS runs WebKit, and no amount of Chromium emulation is
// WebKit — engine bugs (video fullscreen behaviour, IndexedDB in private mode,
// date parsing) will not show up here. Those are covered by source assertions
// in tests/realtime-and-media.mjs and by the CI matrix, and where neither can
// reach, they are listed honestly as untested rather than assumed.

const { chromium, devices, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4001';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// THE SENTENCE THAT USED TO BE HERE WAS WRONG, AND IT IS WORTH KEEPING THE
// CORRECTION VISIBLE: "if it works at 375 wide it works at everything above
// it." That is true of a layout with no breakpoints and false of this one.
// Tailwind changes what is on screen at 768 (`md:`), 1024 (`lg:`) and 1280
// (`xl:`), so a tablet does not get the phone layout scaled up — it gets a
// DIFFERENT layout, one that phones never render and that no test here saw.
// This project has already shipped exactly that bug once: the church page was
// reachable only above `lg`, so it existed on a laptop and did not exist on a
// phone, and nobody noticed because nothing tested the width in between.
//
// A tablet is also the device a pastor actually presents from. So: the two ends
// of the phone range, and four tablet shapes that straddle every breakpoint.
// Portrait AND landscape, because rotating an iPad crosses `md`→`lg` and is one
// gesture away at all times.
const TARGETS = [
  ['iPhone SE', devices['iPhone SE'] || { viewport: { width: 375, height: 667 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['Pixel 5', devices['Pixel 5'] || { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true }],
  // 768 portrait: the first width where `md:` rules appear.
  ['iPad Mini', devices['iPad Mini'] || { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  // 1024 landscape: `lg:` appears, but the height is only 768 — the combination
  // that hides things below the fold on a device people hold in landscape.
  ['iPad Mini landscape', devices['iPad Mini landscape'] || { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  // 834 portrait: between `md` and `lg`, the width nothing else covers.
  ['iPad Pro 11', devices['iPad Pro 11'] || { viewport: { width: 834, height: 1194 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  // 1194 landscape: past `lg`, still touch-only and still no mouse.
  ['iPad Pro 11 landscape', devices['iPad Pro 11 landscape'] || { viewport: { width: 1194, height: 834 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
];

async function run(browser, label, device) {
  // Chromium cannot emulate WebKit, so drop any Safari user agent rather than
  // pretend: a false UA would only make the results harder to trust.
  const { userAgent, ...rest } = device;
  const context = await browser.newContext(rest);
  const page = await context.newPage();

  // WHY THE CONSOLE IS CAPTURED. The first WebKit run said only that the
  // attachment "did not appear", which is the least useful thing a test can
  // say about a failure it is the sole witness to. The app now logs why a file
  // could not be saved; printing that here is what turns a red tick into a
  // diagnosis without anybody having to reproduce it on a Mac by hand.
  const problems = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => problems.push(`pageerror: ${String(e).slice(0, 300)}`));

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const maria = page.getByText(/Maria Santos/i).first();
  if (await maria.count()) await maria.tap();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().tap().catch(() => {});
    await page.waitForTimeout(700);
  }

  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1700);

  // Nothing may scroll sideways. On a phone that is the single most common
  // layout failure and it makes an app feel broken immediately.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok(overflow <= 1, `${label}: no horizontal scroll on the missionary list (${overflow}px)`);

  const card = page.locator('[data-quest="seeker-card"]').first();
  if (await card.count()) {
    await card.tap();
    await page.waitForTimeout(1700);
  }

  // EVERY DESTINATION IS REACHABLE BY TAPPING, at this width.
  //
  // This is the check the tablet targets were added for. Horizontal scroll is
  // the loud failure; an unreachable page is the quiet one. `/church` was once
  // linked only by `lg:inline-flex` in the header and `xl:block` in a left rail,
  // so it existed on a laptop and simply did not exist on a phone — no error, no
  // broken layout, just a page nobody could get to. A tablet sits on the other
  // side of those same breakpoints and can lose a destination the same way, in
  // either orientation.
  //
  // Asserting on the RENDERED, VISIBLE link rather than on the class list: what
  // matters is whether a finger can reach it, not which utility produced it.
  //
  // OR TWO TAPS AWAY, THROUGH THE MENU (30 September 2026). Below 1280px the
  // rooms are no longer icons in the header: the bottom bar's Menu tab lists
  // them. That counts only when it is SEEN to work here: the Menu tab on
  // screen and big enough to hit, and the room's row on screen when the Menu
  // opens (in a second tab, so this page stays where it is for the checks
  // below). A Menu that silently lost the room fails exactly as a missing
  // header link did.
  const tappable = async (loc) => {
    const n = await loc.count();
    for (let i = 0; i < n; i++) {
      if (await loc.nth(i).isVisible().catch(() => false)) {
        const box = await loc.nth(i).boundingBox().catch(() => null);
        // On screen, and big enough to hit. A 4px sliver is not a link.
        if (box && box.width >= 24 && box.height >= 24) return true;
      }
    }
    return false;
  };
  const menuTab = await tappable(page.locator('nav[aria-label="Main"] a[href="/menu"]'));
  let menuRows = null;
  if (menuTab) {
    const side = await page.context().newPage();
    await side.goto(`${BASE}/menu`, { waitUntil: 'networkidle' }).catch(() => {});
    await side.locator('main a.menu-row').first().waitFor({ timeout: 10000 }).catch(() => {});
    menuRows = {};
    for (const href of ['/church', '/settings']) {
      menuRows[href] = await tappable(side.locator(`main a.menu-row[href="${href}"]`));
    }
    await side.close();
  }
  for (const [href, what] of [['/church', 'the church page'], ['/settings', 'settings']]) {
    const link = page.locator(`a[href="${href}"], a[href^="${href}?"]`);
    const count = await link.count();
    const direct = await tappable(link);
    const viaMenu = !!menuRows && menuRows[href];
    ok(direct || viaMenu,
       `${label}: ${what} is reachable by tapping (${direct ? 'on screen' : viaMenu ? 'Menu, then its row' : `${count} link(s) in the DOM, none reachable`})`);
  }

  const composer = page.locator('[data-quest="chat-send"]');
  ok(await composer.count() > 0, `${label}: the conversation composer is reachable`);

  const roomOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  ok(roomOverflow <= 1, `${label}: no horizontal scroll in the conversation (${roomOverflow}px)`);

  // ATTACHMENTS ARE NOT IN EVERY BUILD, and the test says which build it is
  // looking at rather than guessing.
  //
  // Open Sentry Beacon puts an attach control in the conversation. The private
  // application keeps media in the library and player instead, so there is no
  // attach button in its chat at all. Porting this file between them failed on
  // that difference and looked like a tablet bug for a while.
  //
  // Two wrong ways to handle it. Fail anyway: the suite goes red over a feature
  // the app was never supposed to have. Skip silently: the day attachments break
  // on a phone, the suite goes green and says nothing. So it branches, and
  // PRINTS which branch it took — a reader can see whether the checks ran.
  const attach = page.getByRole('button', { name: /Attach a file/i });
  const hasAttach = (await attach.count()) > 0;

  const send = page.locator('[data-quest="chat-send"] button').first();
  const sb = await send.boundingBox();
  // 44px is Apple's own minimum and the number most accessibility guidance
  // settles on; a control smaller than that is one a thumb misses.
  ok(sb !== null && sb.height >= 44, `${label}: send is a real tap target (${sb ? Math.round(sb.height) : 0}px tall)`);

  if (!hasAttach) {
    console.log(`--  ${label}: no attach control in this build, so the attachment checks are not applicable`);
  } else {
    const b = await attach.first().boundingBox();
    ok(b !== null && b.height >= 44, `${label}: attach is a real tap target (${b ? Math.round(b.height) : 0}px tall)`);

    await page.locator('input[type="file"]').first().setInputFiles({
      name: 'from-phone.png',
      mimeType: 'image/png',
      buffer: PNG,
    });
    await page.waitForTimeout(1900);
    const showed = (await page.getByText(/from-phone\.png/i).count()) > 0;
    ok(showed, `${label}: a file attached from a phone appears in the conversation`);
    // Only meaningful once the attachment actually rendered. As a bare check
    // for the absence of an error string it passed vacuously -- nothing on
    // screen means no error on screen -- and it reported OK through the whole
    // WebKit failure it was supposed to describe.
    if (showed) {
      ok(
        (await page.getByText(/file not on this device/i).count()) === 0,
        `${label}: the attachment resolves to real bytes`,
      );
    } else {
      console.log(`     (bytes check skipped for ${label}: nothing rendered to check)`);
      if (problems.length) {
        console.log(`     the browser said: ${problems[problems.length - 1]}`);
      } else {
        console.log('     the browser reported no error, so the write did not throw');
      }
    }
    const afterOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    ok(afterOverflow <= 1, `${label}: an attachment does not widen the page (${afterOverflow}px)`);
  }

  await context.close();
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  for (const [label, device] of TARGETS) {
    await run(browser, label, device);
  }
  await browser.close();
  console.log(bad === 0 ? '\nAll mobile device checks passed.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
