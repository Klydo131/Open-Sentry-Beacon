// The install prompt never lands on top of something you have to tap.
//
// THE BUG, reported by CI as two unrelated failures on a Mac runner:
// e2e · mobile-devices timed out tapping a Guide's Explorer row on an iPad
// Mini, and e2e · panels-fit-portrait timed out clicking the notification bell
// on a phone held sideways. Playwright names the element that received the
// touch instead, and in both cases it was the same thing: the install steps
// list, inside `fixed bottom-4 right-...`. One cause, two symptoms, neither of
// them about the screen it was reported against.
//
// The prompt has two layouts and only one of them makes room for itself. The
// bar along the bottom measures its own height, publishes it as
// `--install-bar`, and globals.css spends that as padding so the page can
// always scroll clear. The desktop card floats at bottom-right and reserves
// nothing, which is fine over a wide window with margins and is not fine over a
// tablet held upright. `isDesktop()` asked only about width, and an iPad Mini in
// portrait is exactly 768 CSS pixels.
//
// WHY THIS RUNS IN CHROMIUM WHEN THE FAILURE WAS ON WEBKIT. Nothing here is
// WebKit-specific. The prompt only appeared there because the manual, no-native-
// install path is chosen from the user agent, and headless Chromium never fires
// beforeinstallprompt so the card was never drawn at all. Emulating an iPad --
// its user agent, its touch, its size -- puts any engine on the same path, so
// this fails in the browser that is actually available here rather than waiting
// for a Mac to notice.
//
//   npm run build && node scripts/run-next.mjs start -p 4403
//   node tests/e2e/the-install-prompt-covers-nothing.js 4403

const { chromium, launchOptions } = require('./_playwright');
const BASE = `http://localhost:${process.argv[2] || '4403'}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

// The sizes CI failed on, plus the one just under the old threshold as a
// control that this was never about being small.
const SCREENS = [
  ['an iPad Mini upright', 768, 1024, IPAD],
  ['an iPad upright', 820, 1180, IPAD],
  ['a phone on its side', 915, 412, IPHONE],
  ['a phone upright', 390, 844, IPHONE],
];

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const who = page.getByText(/Maria Santos/i).first();
  if (await who.count()) await who.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it|Agree|OK/i });
  if (await consent.count()) await consent.first().click().catch(() => {});
  await page.waitForTimeout(900);
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  for (const [label, width, height, ua] of SCREENS) {
    const context = await browser.newContext({
      viewport: { width, height },
      userAgent: ua,
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    await signIn(page);
    await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
    // The manual prompt appears on a short delay, so it has to be waited for or
    // this measures a screen it has not landed on yet.
    await page.waitForTimeout(2400);

    const seen = await page.evaluate(() => {
      const el = document.querySelector('[data-install-prompt]');
      return {
        showing: !!el,
        layout: el ? el.getAttribute('data-install-prompt') : null,
        reserved: getComputedStyle(document.documentElement)
          .getPropertyValue('--install-bar').trim(),
      };
    });
    ok(seen.showing, `${label}: the install prompt is on screen, so this measures something`);
    // A FINGER GETS THE BAR. The floating card is for a pointer that can be put
    // somewhere precise and a window wide enough to have margins spare.
    ok(seen.layout === 'bar',
       `${label}: it is the bar that makes room for itself, not the floating card (got ${seen.layout})`);

    // WHATEVER IS SHOWN MUST MAKE ROOM FOR ITSELF. This is the property, and
    // the floating card is the thing that never had it.
    const px = parseInt(seen.reserved || '0', 10);
    ok(px > 0, `${label}: it reserves its own height at the bottom (${seen.reserved || 'nothing'})`);

    // AND THE PROOF, which is not a rectangle but a tap that lands. This is the
    // exact action that timed out in CI.
    const card = page.locator('[data-quest="seeker-card"]').first();
    ok(await card.count() > 0, `${label}: there is an Explorer row to open`);
    let opened = false;
    if (await card.count()) {
      try {
        await card.tap({ timeout: 6000 });
        await page.waitForTimeout(1200);
        opened = /\/dm\//.test(page.url());
      } catch { opened = false; }
    }
    ok(opened, `${label}: tapping an Explorer opens them (${page.url().replace(BASE, '') || '/'})`);

    await context.close();
  }

  // 2. A MAC, WHERE THE CARD AND TALK SHARED ONE CORNER (4 October 2026).
  //
  // The WebKit job timed out clicking Send, and the Report dialog's reasons,
  // with the install card named as what received the click. On a computer the
  // card, the closed Talk button and the open chat panel were all at
  // bottom-right; the card is the layer on top. Mac Safari's user agent with a
  // mouse puts any engine on the card's path, as the iPad does above.
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const reachable = (page, selector) => page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find((n) => n.getBoundingClientRect().width > 0);
    if (!el) return 'absent';
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    if (top && (top === el || el.contains(top))) return 'reachable';
    return top && top.closest('[data-install-prompt]') ? 'under the install card' : `under ${top ? top.tagName : 'nothing'}`;
  }, selector);
  const cardShown = (page) => page.evaluate(() => {
    const el = document.querySelector('[data-install-prompt="card"]');
    return el ? getComputedStyle(el).display !== 'none' : false;
  });
  for (const [label, width, height] of [['a Mac, 1280 wide', 1280, 1000], ['a Mac, 1440 wide', 1440, 900], ['a Mac, 1180 wide', 1180, 820]]) {
    const context = await browser.newContext({ viewport: { width, height }, userAgent: MAC });
    const page = await context.newPage();
    await signIn(page);
    await page.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);

    ok(await cardShown(page), `${label}: the install card is on screen, so this measures something`);
    ok(await reachable(page, '[data-talk-bubble]') === 'reachable',
       `${label}: the Talk button can be pressed with the card showing (${await reachable(page, '[data-talk-bubble]')})`);

    // The bell's list drops from the top right. Standing above Talk, the card
    // reached the middle of it on WebKit (header-layers, 4 October 2026).
    await page.getByRole('button', { name: /notification/i }).first().click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(600);
    ok(!(await cardShown(page)), `${label}: with the bell's list open the card is not there`);
    ok(await reachable(page, '[role="dialog"]') === 'reachable',
       `${label}: and the list can be pressed (${await reachable(page, '[role="dialog"]')})`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    if (await page.locator('[role="dialog"]').count()) {
      await page.getByRole('button', { name: /notification/i }).first().click({ timeout: 6000 }).catch(() => {});
      await page.waitForTimeout(400);
    }
    ok(await cardShown(page), `${label}: closing the list brings the card back`);

    await page.locator('[data-talk-bubble]').first().click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(900);
    const thread = page.locator('[data-talk-thread]').first();
    if (await thread.count()) { await thread.click({ timeout: 6000 }).catch(() => {}); await page.waitForTimeout(1200); }
    ok(!(await cardShown(page)), `${label}: with a conversation open the card is not there`);
    // Send appears once there is something to send; until then it is the
    // microphone.
    await page.locator('[data-quest="chat-send"] textarea').first().fill('Hello').catch(() => {});
    await page.waitForTimeout(300);
    ok(await reachable(page, '[data-composer-action="send"]') === 'reachable',
       `${label}: Send can be pressed (${await reachable(page, '[data-composer-action="send"]')})`);
    ok(await reachable(page, '[data-talk-report]') === 'reachable',
       `${label}: and so can Report (${await reachable(page, '[data-talk-report]')})`);

    await page.getByRole('button', { name: 'Close the chat' }).first().click({ timeout: 6000 }).catch(() => {});
    await page.waitForTimeout(900);
    ok(await cardShown(page), `${label}: when the chat closes, the card comes back`);
    const fits = await page.evaluate(() => {
      const r = document.querySelector('[data-install-prompt="card"]').getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight;
    });
    ok(fits, `${label}: and the whole card, close button and all, is inside the window`);
    await context.close();
  }

  await browser.close();
  console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
