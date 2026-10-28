// The bar over selected words is on top of the page, never under it.
//
// 28 October 2026. Selecting a word on a page opens AFFiNE's own bar over it
// (Bold, Italic, Link, and ⋮ for the rest), the way Notion and Apple Notes do.
// On the first lines of a page that bar opened underneath the room's insert
// bar, which is stuck to the top of the page, so it was there and nobody could
// see it: AFFiNE keeps its editor in a layer of its own, and the insert bar is
// outside that layer. While the bar is open the insert bar now steps back
// (lib/study/view-extensions.ts, whenAffineBarShows; study-shell.css).
//
// Checked by what the browser itself says is on top at the middle of the bar,
// on a computer and on a phone, and that the insert bar goes back to its place
// over the writing when the bar closes.
//
//   node tests/e2e/the-bar-over-a-selection-is-on-top.js [port]
const { browser: engine, launchOptions, pageErrors } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, newPage } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

/** AFFiNE's bar: whether it is open, its buttons, and what is on top at its middle. */
const theBar = (page) => page.evaluate(() => {
  const widget = document.querySelector('affine-toolbar-widget');
  const bar = widget?.shadowRoot?.querySelector('editor-toolbar');
  if (!bar || !bar.dataset.open) return null;
  const r = bar.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return {
    labels: [...bar.querySelectorAll('editor-icon-button, editor-menu-button')].map((b) => b.getAttribute('aria-label') || ''),
    onTop: top === widget || !!(top && widget.contains(top)),
    covering: top ? `${top.tagName.toLowerCase()}.${String(top.className).split(' ')[0]}` : 'nothing',
  };
});

async function walk(browser, label, options) {
  const context = await browser.newContext(options);
  await context.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
  const page = await context.newPage();
  const caught = pageErrors(page);
  await signInAsExplorer(page, BASE);
  await openStudyRoom(page, BASE, 'simple');
  await newPage(page);
  const first = page.locator('affine-paragraph').first();
  await first.click();
  await page.keyboard.type('The Lord is my shepherd; I shall not want.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('He makes me lie down in green pastures.');
  await page.waitForTimeout(400);

  // Words on the FIRST line, right under the insert bar, selected the way a
  // person does with a keyboard.
  await first.click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 8; i++) await page.keyboard.press('Shift+ArrowRight');
  await page.waitForTimeout(800);
  const bar = await theBar(page);
  ok(!!bar, `${label}: selecting a word opens AFFiNE’s bar over it`);
  ok(bar?.onTop, `${label}: and it is on top, not under the insert bar (on top at its middle: ${bar?.covering})`);
  ok(['Bold', 'Italic', 'Link', 'More menu'].every((l) => bar?.labels.includes(l)),
     `${label}: with Bold, Italic, Link and ⋮ in it (${bar?.labels.filter(Boolean).join(', ')})`);

  // And when the bar closes, the insert bar is back over the writing.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('End');
  await page.waitForTimeout(600);
  const z = await page.locator('.sr-formatbar').evaluate((el) => getComputedStyle(el).zIndex);
  ok(!(await theBar(page)) && z === '10', `${label}: with nothing selected, the insert bar is back in its place (z-index ${z})`);

  const errors = caught.list();
  ok(errors.length === 0, `${label}: no page errors${errors.length ? `: ${errors.slice(0, 2).join(' | ')}` : ''}`);
  await context.close();
}

(async () => {
  const browser = await engine.launch(launchOptions);
  try {
    await walk(browser, 'computer', { viewport: { width: 1280, height: 860 } });
    await walk(browser, 'phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
