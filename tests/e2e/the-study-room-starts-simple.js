// The study room starts Simple, Advanced brings the rest back, and the writing
// on a page can be read in every dark look.
//
// Asked for on 7 October 2026: "the study room for Explorers have some UI bugs
// specially for dark themes, the text are dark too. Also the study room is way
// complicated for a new user of the app, it must have simple UI and advance UI."
//
// WHAT WAS WRONG, MEASURED. Under Focus and Aero dark the writing on an open
// page was near-black on a near-black page: 1.01:1, every line of it. The
// editor's colours are AFFiNE's own and no look reached them. And a new
// Explorer met, before writing a word, four places, three rows of filters, a
// star on every page, Markdown in and out, a whiteboard switch, a folder box,
// tags and ten insert buttons.
//
//   node tests/e2e/the-study-room-starts-simple.js [port]

const { browser: engine, launchOptions } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, shelfRows, openPage, backToShelf } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

/** Contrast of two computed colours, as rgb() strings. */
const ratio = (a, b) => {
  const lum = (v) => (v.match(/[\d.]+/g) || []).slice(0, 3).map(Number)
    .map((c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((t, c, i) => t + c * [0.2126, 0.7152, 0.0722][i], 0);
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

(async () => {
  const browser = await engine.launch(launchOptions);
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    const page = await context.newPage();
    await signInAsExplorer(page, BASE);

    // SIMPLE, FOR SOMEBODY WHO HAS NEVER CHOSEN: nothing stored at all.
    await page.evaluate(() => localStorage.removeItem('beacon.study-mode'));
    await page.goto(`${BASE}/study`, { waitUntil: 'networkidle' });
    await page.getByLabel('Search your pages').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800);
    const places = page.getByRole('navigation', { name: 'Places in your study room' }).getByRole('button');
    ok(await page.locator('[data-study-mode="simple"]').isVisible(), 'a new Explorer finds the room Simple, and the switch to say so');
    ok(JSON.stringify(await places.allInnerTexts()) === JSON.stringify(['All pages', 'Bin']),
       `Simple shows the pages and the bin, nothing else (${(await places.allInnerTexts()).join(', ')})`);
    ok(await page.getByRole('button', { name: /^Star / }).count() === 0, 'no star on every page');
    ok(await page.getByText('Your pages, anywhere').count() === 0, 'no Markdown in and out');
    ok(await shelfRows(page).count() > 0, 'and the pages are all there');

    await openPage(page, 0);
    const tools = await page.getByRole('toolbar', { name: 'Add to this page' }).getByRole('button').allInnerTexts();
    ok(tools.length === 4, `a page in Simple has the four basics to add (${tools.join(', ')})`);
    ok(await page.getByRole('group', { name: 'How to look at this page' }).count() === 0
         && await page.getByLabel('Which folder this page is filed in').count() === 0,
       'and no whiteboard switch, no folder box');
    await backToShelf(page);

    // ADVANCED BRINGS IT ALL BACK, AND IS REMEMBERED.
    await page.locator('[data-study-mode] [data-mode="advanced"]').click();
    await page.waitForTimeout(400);
    ok((await places.allInnerTexts()).length === 4, `Advanced has all four places (${(await places.allInnerTexts()).join(', ')})`);
    ok(await page.getByRole('button', { name: /^Star / }).count() > 0, 'and a star on every page');
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByLabel('Search your pages').waitFor({ timeout: 60_000 });
    ok(await page.locator('[data-study-mode="advanced"]').isVisible(), 'and stays Advanced after the page is opened again');
    await openPage(page, 0);
    ok((await page.getByRole('toolbar', { name: 'Add to this page' }).getByRole('button').count()) > 4
         && await page.getByRole('group', { name: 'How to look at this page' }).isVisible(),
       'a page in Advanced has the whole insert bar and the whiteboard');
    await backToShelf(page);
    await page.locator('[data-study-mode] [data-mode="simple"]').click();

    // THE WRITING IN EVERY DARK LOOK. A look is dark when it says so with
    // color-scheme; every look Settings offers is tried, so one added later is
    // measured without editing this file.
    await page.goto(`${BASE}/settings?room=general`, { waitUntil: 'networkidle' });
    const looks = await page.locator('[data-ui-theme-choice]').evaluateAll((els) => els.map((el) => el.getAttribute('data-ui-theme-choice')));
    let dark = 0;
    for (const look of looks) {
      await page.evaluate((l) => localStorage.setItem('beacon-ui-theme', l), look);
      await openStudyRoom(page, BASE, 'simple');
      if (!(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme.includes('dark')))) continue;
      dark += 1;
      await openPage(page, 0);
      const seen = await page.evaluate(() => {
        const room = document.querySelector('.sr');
        const para = document.querySelector('affine-paragraph [data-v-text], affine-paragraph v-text, affine-paragraph');
        return { ink: getComputedStyle(para).color, ground: getComputedStyle(room).backgroundColor, theme: room.dataset.theme };
      });
      const r = ratio(seen.ink, seen.ground);
      ok(seen.theme === 'dark' && r >= 4.5, `${look}: the writing on a page is ${r.toFixed(1)}:1 on the room (${seen.ink} on ${seen.ground}), the editor dark too`);
      await backToShelf(page);
    }
    ok(dark >= 2, `the dark looks were found and tried (${dark})`);
    await context.close();
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
