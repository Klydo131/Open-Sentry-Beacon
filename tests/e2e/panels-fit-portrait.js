// Pop-ups stay on the screen when the phone is held upright.
//
// THE BUG, photographed: the notification panel opened with its left half off
// the edge of a phone in portrait. The heading read "ons", the switch was
// labelled "ications", and a safeguarding report said "rding report needs your
// attention". Turning the phone sideways made it look fixed. It was not fixed;
// there was simply room, which is why it was reported as "only good for
// horizontal".
//
// `absolute right-0 w-80` aligns a panel's right edge to the BUTTON's, then
// draws 320px leftwards. The bell sits about two thirds across a phone header,
// so on a 412px screen the panel starts at roughly -50px. Nothing in that rule
// knows how wide the screen is.
//
// WHY THIS MEASURES RECTANGLES RATHER THAN READING CLASSES. The sample-data
// bell already carried a patch for this, `fixed inset-x-3 top-16 sm:absolute`,
// and it LOOKS right in the source while hiding a magic 4rem that is wrong for
// any header taller than one row. Only the geometry can tell you.
//
//   npm run build && node scripts/run-next.mjs start -p 4398
//   node tests/e2e/panels-fit-portrait.js 4398

const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4398';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// Portrait, which is the case that was broken. The narrow ones matter most:
// an iPhone SE is still a phone people bring to church.
const SCREENS = [
  ['iPhone SE, upright', 375, 667],
  ['a common Android, upright', 412, 915],
  ['iPad mini, upright', 744, 1133],
  ['iPad, upright', 820, 1180],
  // One landscape pass, to prove the fix did not simply move the problem.
  ['a phone on its side', 915, 412],
];

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const pick = page.getByText(/Pastor Ramos/i).first();
  if (await pick.count()) await pick.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it|Agree|OK/i });
  if (await consent.count()) await consent.first().click().catch(() => {});
  await page.waitForTimeout(900);
}

/** Every edge of the panel, against every edge of the screen. */
async function measure(page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-anchored-panel]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left),
      right: Math.round(r.right),
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      width: Math.round(r.width),
      height: Math.round(r.height),
      vw: document.documentElement.clientWidth,
      vh: window.innerHeight,
      scrolls: el.scrollHeight > el.clientHeight + 1,
      // The page itself must not have gained a sideways scroll because of it.
      pageWide: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  for (const [label, w, h] of SCREENS) {
    const context = await browser.newContext({
      viewport: { width: w, height: h },
      hasTouch: true,
      isMobile: w < 700,
    });
    const page = await context.newPage();
    await signIn(page);

    // ---- The notification bell ------------------------------------------
    const bell = page.getByRole('button', { name: /Notifications/i }).first();
    ok(await bell.count() > 0, `${label}: the bell is in the header`);
    await bell.click();
    await page.waitForTimeout(500);

    const m = await measure(page);
    ok(m !== null, `${label}: the panel opened`);
    if (m) {
      ok(m.left >= 0, `${label}: nothing is off the left edge (left ${m.left})`);
      ok(m.right <= m.vw, `${label}: nothing is off the right edge (right ${m.right} of ${m.vw})`);
      ok(m.bottom <= m.vh, `${label}: it fits above the bottom (bottom ${m.bottom} of ${m.vh})`);
      ok(m.top >= 0, `${label}: it starts below the top (top ${m.top})`);
      ok(!m.pageWide, `${label}: the page did not gain a sideways scroll`);
      // Wide enough to read. A panel squeezed to 120px is on screen and useless.
      ok(m.width >= Math.min(300, m.vw - 24) - 1,
        `${label}: it is still wide enough to read (${m.width}px)`);
    }

    // Tapping away closes it. On a phone this is the only way out that does not
    // involve finding a small button.
    //
    // The point is COMPUTED from the panel's own rectangle. Picking the middle
    // of the screen looked reasonable and landed inside the panel in landscape,
    // where the panel is wide and the screen is short: the code was right and
    // the test was wrong, which is the more expensive of the two.
    //
    // AND NOT ON SOMETHING THAT DOES ITS OWN THING. The bottom edge is the tab
    // bar, so that point tapped a link to another room: the panel then went
    // because the page changed, and on WebKit a slower page change left it on
    // screen at the moment of checking (the Safari runs of 3 and 4 October
    // 2026). The first point, from a few candidates outside the panel, that is
    // not a link, a button or a field.
    const away = await page.evaluate(({ w, h }) => {
      const panel = document.querySelector('[data-anchored-panel]');
      const r = panel ? panel.getBoundingClientRect() : { left: w, right: w, top: 0, bottom: 0 };
      const tries = [
        [Math.max(4, r.left - 12), Math.min(h - 120, r.bottom + 40)],
        [Math.max(4, r.left - 12), h / 2],
        [8, h / 2],
        [w / 2, Math.min(h - 120, r.bottom + 60)],
        [8, h - 140],
      ];
      for (const [x, y] of tries) {
        const t = document.elementFromPoint(x, y);
        if (!t || (panel && panel.contains(t))) continue;
        if (t.closest('a, button, input, textarea, select, [role="button"], [contenteditable="true"]')) continue;
        return { x, y };
      }
      return { x: 8, y: h / 2 };
    }, { w, h });
    await page.mouse.click(away.x, away.y);
    // Waited for, not slept past.
    await page.waitForFunction(() => !document.querySelector('[data-anchored-panel]'), null, { timeout: 3000 }).catch(() => {});
    ok(await page.locator('[data-anchored-panel]').count() === 0,
      `${label}: tapping elsewhere closes it`);

    await context.close();
  }

  // ---- The live/tutorial switch, the other anchored panel ----------------
  const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await signIn(page);
  const mode = page.getByRole('button', { name: /Switch between the live app and the tutorial/i }).first();
  if (await mode.count()) {
    await mode.click();
    await page.waitForTimeout(500);
    const m = await measure(page);
    ok(m !== null, 'the mode switch panel opens on a small phone');
    if (m) {
      ok(m.left >= 0 && m.right <= m.vw,
        `the mode switch panel is fully on the screen (${m.left} to ${m.right} of ${m.vw})`);
      ok(m.bottom <= m.vh, `and fits above the bottom (${m.bottom} of ${m.vh})`);
    }
    // Escape closes it.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    ok(await page.locator('[data-anchored-panel]').count() === 0, 'Escape closes it');
  } else {
    ok(false, 'the mode switch button was not found');
  }

  // ---- A long list still fits, and scrolls -------------------------------
  //
  // The panel had no height limit at all. Eleven notifications ran off the
  // bottom of a phone with nothing to scroll, which is the vertical half of the
  // same complaint.
  const tall = page.getByRole('button', { name: /Notifications/i }).first();
  await tall.click();
  await page.waitForTimeout(500);
  const t = await measure(page);
  if (t) {
    ok(t.bottom <= t.vh, `a full list still ends above the bottom (${t.bottom} of ${t.vh})`);
    ok(t.height <= t.vh, 'and is never taller than the screen');
  } else {
    ok(false, 'the panel did not open for the height check');
  }

  // ---- EVERY OTHER POP-UP IN THE APP -------------------------------------
  //
  // "Not just the bell, all of the pop ups." So this half does not name a
  // component: it opens each overlay a person can actually reach and measures
  // whatever `[role="dialog"]` is on the screen against the viewport. A new
  // overlay added later is covered without anybody remembering to add it here.
  //
  // The rule for all of them is the same and it is not opinionated: no edge of
  // a pop-up may be outside the screen, and if it is too tall it must scroll
  // rather than run off the bottom.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const ph = await phone.newPage();

  const overlay = () => ph.evaluate(() => {
    const el = document.querySelector('[role="dialog"], [data-anchored-panel]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: Math.round(r.left), right: Math.round(r.right),
      top: Math.round(r.top), bottom: Math.round(r.bottom),
      height: Math.round(r.height),
      vw: document.documentElement.clientWidth,
      vh: window.innerHeight,
      // A backdrop legitimately fills the screen; what must fit is the panel
      // inside it, so measure the deepest scrollable box when there is one.
      inner: (() => {
        const box = el.querySelector('.overlay-sheet, .overlay-sheet-tall');
        if (!box) return null;
        const b = box.getBoundingClientRect();
        return { top: Math.round(b.top), bottom: Math.round(b.bottom), height: Math.round(b.height) };
      })(),
      pageWide: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    };
  });

  const fits = async (name) => {
    const m = await overlay();
    if (!m) { ok(false, `${name}: nothing opened`); return; }
    ok(m.left >= 0 && m.right <= m.vw,
      `${name}: fits sideways (${m.left} to ${m.right} of ${m.vw})`);
    ok(!m.pageWide, `${name}: the page did not gain a sideways scroll`);
    const box = m.inner ?? m;
    ok(box.bottom <= m.vh + 1,
      `${name}: ends on the screen (bottom ${box.bottom} of ${m.vh})`);
    ok(box.height <= m.vh,
      `${name}: is never taller than the screen (${box.height} of ${m.vh})`);
  };

  // The consent notice, which is the very first pop-up anybody ever sees.
  await ph.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await ph.waitForTimeout(1100);
  const who = ph.getByText(/Grace Lim/i).first();
  if (await who.count()) await who.click();
  await ph.waitForTimeout(1700);
  if (await ph.locator('[role="dialog"]').count()) {
    await fits('the welcome notice');
  }
  const agree = ph.getByRole('button', { name: /I understand|Continue|Got it|Agree|OK/i });
  if (await agree.count()) await agree.first().click().catch(() => {});
  await ph.waitForTimeout(900);

  // What's new, and Feedback, both of which live in Settings.
  await ph.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await ph.waitForTimeout(1400);

  for (const [label, name] of [["What's new", /What.s new/i], ['Feedback', /Feedback|Tell us/i]]) {
    const opener = ph.getByRole('button', { name }).first();
    if (await opener.count() === 0) { ok(false, `${label}: no button to open it`); continue; }
    await opener.click();
    await ph.waitForTimeout(700);
    await fits(label);
    await ph.keyboard.press('Escape');
    await ph.waitForTimeout(300);
    if (await ph.locator('[role="dialog"]').count()) {
      // Not every sheet closes on Escape; tap the backdrop instead.
      await ph.mouse.click(8, 8);
      await ph.waitForTimeout(400);
    }
  }

  // The sample-data account switcher, which had the same magic 4rem the
  // sample-data bell did.
  const tryAccount = ph.getByRole('button', { name: /Try any account/i }).first();
  if (await tryAccount.count()) {
    await tryAccount.click();
    await ph.waitForTimeout(600);
    await fits('the account switcher');
    await ph.keyboard.press('Escape');
    await ph.waitForTimeout(300);
  } else {
    ok(false, 'the account switcher button was not found');
  }

  await phone.close();

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} BAD`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
