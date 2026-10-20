// Pressing a link takes you TO THE THING, not near it.
//
// THE REPORT, in the owner's words: "when I click out some features, it doesn't
// direct to the feature... so it felt like I got scammed or I still need to look
// for the feature."
//
// Two separate faults produced that, and both only appear when the link is
// pressed from a page the link also points at — which is the common case, because
// the desk rail and the header are drawn on every screen:
//
//   1. A `#card` link. The address gains a hash, no component re-renders, and
//      the browser fires no event for a pushState. Nothing scrolls.
//   2. A `?room=` link. Same page, same component, so the tab state is never
//      re-read. The address says Approvals and the screen still says Pairings.
//
// So this walks both from the page they are already on. Landing is proved by
// the mark the arrival adds — `.beacon-landed` — and by the scroll position
// actually moving, because "the element exists" was never the failing half.
//
//   npm run build && node scripts/run-next.mjs start -p 4396
//   node tests/e2e/landing.js 4396

const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4396';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function signInAs(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const pick = page.getByText(who).first();
  if (await pick.count()) await pick.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it|Agree|OK/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(700);
  }
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // ---- 1. A hash link, pressed from the page it points at ----------------
  await signInAs(page, /Pastor|Admin|Director/i);
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const target = page.locator('#install');
  ok(await target.count() > 0, 'Settings has the #install card the chip names');

  // Put the card off screen first, or "it scrolled" proves nothing.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  const before = await page.evaluate(() => window.scrollY);
  ok(before > 200, `the card starts off screen (scrollY ${before})`);

  // The real control, pressed the real way. This is the Apple path: Safari
  // never fires beforeinstallprompt, so every iPhone user gets this link.
  const chip = page.locator('a[href="/settings#install"]').first();
  ok(await chip.count() > 0, 'the header Install chip is a link to the card');
  await chip.click();
  await page.waitForTimeout(1400);

  const after = await page.evaluate(() => window.scrollY);
  ok(after < before, `pressing it scrolled back up (${before} to ${after})`);

  const landedNear = await page.evaluate(() => {
    const el = document.getElementById('install');
    if (!el) return null;
    return Math.round(el.getBoundingClientRect().top);
  });
  ok(
    landedNear !== null && Math.abs(landedNear) < 160,
    `the card itself is at the top of the screen (${landedNear}px from it)`,
  );

  // ---- 2. THE HALF NEXT.JS DOES NOT DO ------------------------------------
  //
  // The check above is the real user path, and a Next `Link` to a hash does
  // some scrolling of its own — so on its own it does not prove whose code
  // ran. A bare `history.pushState` is invisible to Next and fires no browser
  // event at all. If the page still lands, it landed because of
  // lib/url-signal.ts and lib/scroll-to-hash.ts.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  const deep = await page.evaluate(() => window.scrollY);
  ok(deep > 200, `back to the bottom (scrollY ${deep})`);

  await page.evaluate(() => history.pushState(null, '', '/settings#tutorial'));
  await page.waitForTimeout(1600);

  const moved = await page.evaluate(() => {
    const el = document.getElementById('tutorial');
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return {
      y: window.scrollY,
      top: el ? Math.round(el.getBoundingClientRect().top) : null,
      atBottom: Math.abs(window.scrollY - max) < 4,
      maxScroll: Math.round(max),
    };
  });

  ok(moved.y !== deep, `a bare pushState still moved the page (${deep} to ${moved.y})`);
  // WHAT THIS IS ACTUALLY FOR: you press a link and arrive AT the card, rather
  // than at the top of a long page hunting for it. The old form of this check
  // said "within 160px of the top", which was the same thing back when every
  // screen was one long scroll.
  //
  // Rooms changed the geometry, not the behaviour. #tutorial opens the Help
  // room, and that room is 46px taller than the window — so the page scrolls to
  // its absolute bottom and the card still sits 247px down, because that is as
  // high as it can physically go. Demanding 160 there is demanding the page be
  // longer than it is.
  //
  // So: the card must be on screen, and the page must have gone as far toward
  // it as it can. That fails for the bug this guards (nothing moved, card off
  // screen) and passes for a short room, which is the point.
  const onScreen = moved.top !== null && moved.top >= 0 && moved.top < 700;
  ok(
    onScreen && (Math.abs(moved.top) < 160 || moved.atBottom),
    `and landed on the tutorial card (${moved.top}px from the top, ` +
      `page ${moved.atBottom ? 'scrolled as far as it goes' : 'has room left'})`,
  );

  // ---- 3. A TARGET THAT IS NOT THERE YET ---------------------------------
  //
  // The reason a plain `#link` was not enough. A browser looks once, finds
  // nothing, and gives up without a word — and in this app the card is usually
  // behind a tab that has not rendered or data that has not arrived. The hook
  // waits for it instead. Here the element is genuinely removed and put back
  // after most of a second, which is what a slow query looks like.
  // A DIFFERENT card from the one above, so the address genuinely changes.
  // Pressing a link to where you already are is correctly a no-op.
  await page.evaluate(() => {
    const el = document.getElementById('install');
    if (!el) return;
    el.removeAttribute('id');
    setTimeout(() => el.setAttribute('id', 'install'), 900);
  });
  // At the bottom before the link is pressed, and still there. On a busy CI
  // machine the previous landing's last correction arrived after this scroll
  // and pulled the page back to the card, so the check below started from the
  // card and saw nothing move (20 October 2026).
  let waited = -1;
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    const at = await page.evaluate(() => ({
      y: window.scrollY,
      max: document.documentElement.scrollHeight - window.innerHeight,
    }));
    waited = at.y;
    if (at.max - at.y < 8) break;
  }
  ok(
    await page.locator('#install').count() === 0,
    'the card is genuinely absent when the link is pressed',
  );

  await page.evaluate(() => history.pushState(null, '', '/settings#install'));
  await page.waitForTimeout(2600);

  const late = await page.evaluate(() => {
    const el = document.getElementById('install');
    return { y: window.scrollY, top: el ? Math.round(el.getBoundingClientRect().top) : null };
  });
  ok(late.y !== waited, `it waited for the card to appear, then landed (${waited} to ${late.y})`);
  ok(
    late.top !== null && Math.abs(late.top) < 160,
    `on the card, not near it (${late.top}px from the top)`,
  );

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} BAD`);
  process.exit(bad === 0 ? 0 : 1);
})();
