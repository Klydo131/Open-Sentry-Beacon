// A new Sabbath program, or a new series of meetings, unfolds downward into
// view, and the screen travels to it.
//
// 3 November 2026, the founder: "I dont want the push button new page where I
// push it and then it will go up, it's not a good UI experience at all. I want
// it smooth with tweak animation or scroll down where I will see the new page
// going down on fill in, not a pop up." Until then the list was swapped for
// the page in one frame (lib/motion.ts, unfoldIn).
//
//   node tests/e2e/a-new-page-unfolds-into-view.js [port]

const { browser: engine, launchOptions, pageErrors } = require('./_playwright');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

/** Every unfolding the page starts, recorded as it starts: the 420ms is over long before anything could look. */
const recordUnfolds = () => {
  window.__unfolds = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    if (options && options.id === 'unfold-in') {
      window.__unfolds.push({ panel: this.getAttribute('data-panel'), clips: keyframes.some((k) => /inset\(0px 0px 100%|inset\(0 0 100%/.test(k.clipPath || '')) });
    }
    return animate.call(this, keyframes, options);
  };
};

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

/** Where the panel's top sits on the screen, and the scroll, a moment after the press. */
const where = (page, panel) => page.evaluate((p) => {
  const el = document.querySelector(`[data-panel="${p}"]`);
  return el ? { top: Math.round(el.getBoundingClientRect().top), vh: innerHeight, unfolds: window.__unfolds } : null;
}, panel);

(async () => {
  const browser = await engine.launch(launchOptions);
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    await context.addInitScript(recordUnfolds);
    const page = await context.newPage();
    const caught = pageErrors(page);
    await signInAs(page, 'Maria Santos');

    // THE SABBATH PROGRAM
    await page.goto(`${BASE}/office`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.locator('[data-subroom-toggle]').first().click();
    await page.waitForTimeout(300);
    await page.locator('[data-subroom-menu] [role="option"]', { hasText: 'Sabbath program' }).first().click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'New program' }).click();
    await page.waitForTimeout(700);
    const program = await where(page, 'sabbath-program');
    ok(!!program && program.unfolds.some((u) => u.panel === 'sabbath-program' && u.clips),
       `New program unfolds the new page downward, from its top edge (${JSON.stringify(program && program.unfolds)})`);
    ok(!!program && program.top >= 0 && program.top < program.vh * 0.5,
       `and the new page's top is on the screen, in its upper half (${program && program.top}px of ${program && program.vh})`);

    // THE SERIES OF MEETINGS, pressed from further down the page.
    await page.goto(`${BASE}/office?room=evangelism`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.__unfolds = []; });
    await page.getByRole('button', { name: 'New meetings' }).click();
    await page.getByRole('button', { name: 'Start with a plan' }).click();
    await page.waitForTimeout(800);
    const series = await where(page, 'evangelistic-meeting');
    ok(!!series && series.unfolds.some((u) => u.panel === 'evangelistic-meeting' && u.clips),
       `a new series unfolds downward too (${JSON.stringify(series && series.unfolds)})`);
    ok(!!series && series.top >= 0 && series.top < series.vh * 0.5,
       `and its top is on the screen, in its upper half (${series && series.top}px of ${series && series.vh})`);

    // LESS MOVEMENT, ASKED FOR: nothing unfolds, and the page still opens in view.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('button', { name: /Back|All meetings|‹/ }).first().click().catch(() => {});
    await page.waitForTimeout(600);
    await page.evaluate(() => { window.__unfolds = []; });
    const again = page.getByRole('button', { name: 'New meetings' });
    if (await again.count()) {
      await again.click();
      await page.getByRole('button', { name: 'Start with a plan' }).click();
      await page.waitForTimeout(600);
      const still = await where(page, 'evangelistic-meeting');
      ok(!!still && still.unfolds.length === 0 && still.top >= 0, `with less movement asked for, it opens in view without moving (${JSON.stringify(still)})`);
    } else {
      ok(false, 'the way back to the list of meetings was found');
    }

    const errors = caught.list();
    ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 2).join(' | ')}` : ''}`);
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
