// My Files on a phone and a pad, and a computer's My Files as it was.
//
// Asked for on 6 October 2026: "The Library (My files) are not UI friendly for
// Mobile and Pad users, can we make it more aesthetic and simple use please.
// Desktop and Mac is ok for now."
//
// What was wrong, measured on a 390px phone before the change: the header's
// tagline ran off the right-hand edge ("Live church. Real conne"); a welcome
// banner filled the whole first screen; six filter cards, each 112px tall,
// filled the second; the first resource began on the third; Browse was 5.6
// screens long; and Delete on a file kept only on this device took one tap.
//
// Below 1280px (where the bar along the bottom is) the page now has a title,
// one row of filter chips, cards held to three lines, the file form behind a
// button, and a second tap to delete. From 1280px it is the page it was: this
// walk checks the computer's banner, cards and form are all still there, and
// the change was compared pixel for pixel on a computer when it was made.
//
//   node tests/e2e/my-files-on-a-phone-and-pad.js [port]

const { browser: engine, launchOptions } = require('./_playwright');
const { signIn } = require('./_looks');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const SIZES = [['phone', 390, 844], ['pad', 820, 1180], ['computer', 1280, 900]];

(async () => {
  const browser = await engine.launch({ ...launchOptions });
  try {
    for (const [size, width, height] of SIZES) {
      const small = width < 1280;
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: small });
      // The install invitation is its own walk's business, not this one's.
      await context.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
      const page = await context.newPage();
      await signIn(page, BASE, 'John Reyes');
      await page.goto(`${BASE}/library?room=browse`, { waitUntil: 'networkidle' });
      await page.locator('#all-library-resources').waitFor({ timeout: 10000 });

      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(sideways <= 1, `${size}: nothing scrolls sideways`);
      const header = await page.evaluate(() => Math.max(...[...document.querySelectorAll('header *')].map((el) => el.getBoundingClientRect().right)) - window.innerWidth);
      ok(header <= 1, `${size}: the header fits the screen (${Math.round(header)}px over)`);

      if (small) {
        // ---- A PHONE OR A PAD ------------------------------------------------
        ok(await page.locator('[data-library-title] h1').isVisible() && !(await page.getByText('Learn, grow, and come back anytime.').isVisible()),
           `${size}: a title, not a screen-filling banner`);
        const bar = await page.locator('nav.tab-bar').first().boundingBox();
        const firstCard = await page.locator('section[aria-labelledby="all-library-resources"] article').first().boundingBox();
        ok(firstCard && bar && firstCard.y < bar.y - 40,
           `${size}: the first resource begins on the first screen (at ${Math.round(firstCard?.y ?? 0)}px, the bar at ${Math.round(bar?.y ?? 0)}px)`);

        const chips = page.locator('[data-library-chips] button');
        ok((await chips.count()) === 6 && await page.locator('[data-library-chips]').isVisible()
           && !(await page.getByText('Everything in the collection').isVisible()),
           `${size}: the six filters are one row of chips, not six cards`);
        const study = chips.filter({ hasText: 'Bible study' });
        const said = Number((await study.getAttribute('aria-label')).match(/(\d+)$/)?.[1]);
        await study.click();
        const heading = (await page.locator('#all-library-resources').innerText()).trim();
        const shown = await page.locator('section[aria-labelledby="all-library-resources"] article').count();
        ok((await study.getAttribute('aria-pressed')) === 'true' && heading === `Bible study · ${said}` && shown === said,
           `${size}: a chip filters, and the heading names it and counts it ("${heading}", ${shown} shown)`);
        await chips.filter({ hasText: 'All' }).first().click();

        const lines = await page.evaluate(() => [...document.querySelectorAll('section[aria-labelledby="all-library-resources"] article p.line-clamp-3')].map((p) => {
          const line = parseFloat(getComputedStyle(p).lineHeight);
          return p.getBoundingClientRect().height / line;
        }));
        ok(lines.length > 0 && lines.every((n) => n <= 3.05),
           `${size}: every card's description is held to three lines (${lines.map((n) => n.toFixed(1)).join(', ')})`);

        // ---- ON THIS DEVICE ---------------------------------------------------
        await page.goto(`${BASE}/library?room=mine`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: /Upload files/ }).waitFor({ timeout: 10000 });
        ok(!(await page.locator('[data-link-form]').isVisible()), `${size}: the link form waits until it is asked for`);
        const top = async (sel) => (await page.locator(sel).first().boundingBox())?.y ?? -1;
        const addAt = await top('[data-device-note]');
        const emptyAt = await top('text=Your device library is empty');
        const musicAt = await top('[data-panel="music-moved"]');
        ok(addAt >= 0 && addAt < emptyAt && emptyAt < musicAt, `${size}: adding first, then the files, then the note about Music`);

        await page.getByRole('button', { name: /Add a link/ }).click();
        ok(await page.locator('[data-link-form]').isVisible(), `${size}: Add a link opens the form`);
        const boxes = page.locator('[data-link-form] input');
        await boxes.nth(0).fill('Sabbath School video');
        await boxes.nth(1).fill('https://www.example.org/lesson');
        await page.getByRole('button', { name: /➕ Add link/ }).click();
        const file = page.locator('[data-panel="device-file"]').filter({ hasText: 'Sabbath School video' });
        await file.waitFor({ timeout: 8000 });
        ok(await file.isVisible(), `${size}: the link is kept on this device`);
        const fileBox = await file.boundingBox();
        ok(fileBox && fileBox.x >= 0 && fileBox.x + fileBox.width <= width + 1, `${size}: and its row fits the screen`);

        await file.getByRole('button', { name: 'Delete' }).click();
        ok(await file.getByRole('button', { name: 'Tap again to delete' }).isVisible() && await file.isVisible(),
           `${size}: one tap on Delete asks, and deletes nothing`);
        await file.getByRole('button', { name: 'Tap again to delete' }).click();
        await page.waitForTimeout(400);
        ok((await page.locator('[data-panel="device-file"]').filter({ hasText: 'Sabbath School video' }).count()) === 0, `${size}: the second tap deletes it`);
      } else {
        // ---- A COMPUTER: AS IT WAS -------------------------------------------
        ok(await page.getByText('Learn, grow, and come back anytime.').isVisible() && !(await page.locator('[data-library-title]').isVisible()),
           `${size}: the banner, as before`);
        ok(await page.getByText('Everything in the collection').isVisible() && !(await page.locator('[data-library-chips]').isVisible()),
           `${size}: the six filter cards, as before`);
        await page.goto(`${BASE}/library?room=mine`, { waitUntil: 'networkidle' });
        await page.locator('[data-panel="music-moved"]').waitFor({ timeout: 10000 });
        ok(await page.locator('[data-link-form]').isVisible() && !(await page.getByRole('button', { name: /Add a link/ }).isVisible()),
           `${size}: the link form is open, as before`);
        ok(await page.getByText('Keep your own media close.').isVisible(), `${size}: and the device library's heading`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
