// A study room holds many pages, keeps them apart, and can put one away.
//
// ---------------------------------------------------------------------------
// WHAT THIS IS ACTUALLY CHECKING. A second page is easy to make look right and
// easy to get wrong in a way no screenshot shows: two rows on the shelf and one
// document underneath, so everything typed on "Romans" is also on "Daniel"
// because both are rendering the same store. The assertion that matters is not
// that a page can be made, it is that what is written on one page is NOT on the
// other, and that it is still there when you come back.
//
// It also holds the shelf itself to being useful rather than decorative: a
// page's own words have to reach the list, or the list is a column of identical
// rows and nobody can find anything. That preview is written by the page as it
// is edited -- every page is a separate document that must be fetched before a
// word of it can be read, so a shelf that read them all would be twenty round
// trips before it could draw one line.
//
// And the bin is a bin, not a delete: the tap that ends a month of study is one
// somebody can take back.
//
//   node tests/e2e/a-study-room-holds-many-pages.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');
const {
  signInAsExplorer, openStudyRoom, shelfRows, openPage, newPage, backToShelf, writtenOnPage,
} = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-pages-'));

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const nameAndWrite = async (page, title, words) => {
  await page.getByLabel('Name this page').fill(title);
  await page.locator('affine-paragraph').first().click();
  await page.waitForTimeout(300);
  await page.keyboard.type(words);
  await page.waitForTimeout(600);
};

(async () => {
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-pages`, {
    ...launchOptions, viewport: { width: 412, height: 915 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  await signInAsExplorer(page, BASE);
  await openStudyRoom(page, BASE);

  // 1. THE ROOM OPENS ON ITS SHELF, which is the shape that was asked for:
  //    "a special room like the library page".
  ok(await shelfRows(page).count() >= 1, 'the room opens on a list of its pages');
  ok(await page.getByRole('button', { name: /Hope Beacon/i }).count() > 0,
     'and the way back out of the room is on the screen');

  // 2. A PAGE HAS A NAME AND WORDS, and both reach the shelf.
  await openPage(page, 0);
  await nameAndWrite(page, 'Romans', 'Therefore there is now no condemnation.');
  await backToShelf(page);

  const shelf = async () => page.locator('body').innerText();
  ok(/Romans/.test(await shelf()), 'a page somebody named is named on the shelf');
  ok(/no condemnation/.test(await shelf()),
     'and the shelf shows what is on it, without opening it');

  // 3. A SECOND PAGE IS A SECOND PAGE.
  await newPage(page);
  const fresh = await writtenOnPage(page);
  ok(!/no condemnation/.test(fresh),
     `a new page opens empty rather than showing the last one (${JSON.stringify(fresh.slice(0, 40))})`);
  await nameAndWrite(page, 'Daniel', 'The fourth man in the fire.');
  await backToShelf(page);

  ok(await shelfRows(page).count() === 2, 'the shelf now holds two pages');

  // 4. AND THE FIRST ONE IS STILL WHERE IT WAS.
  await page.getByText('Romans', { exact: true }).first().click();
  await page.waitForSelector('affine-paragraph', { timeout: 30_000 });
  await page.waitForTimeout(900);
  const back = await writtenOnPage(page);
  ok(/no condemnation/.test(back), 'going back finds the first page as it was left');
  ok(!/fourth man/.test(back), 'and nothing from the other page has leaked into it');

  // 5. SWITCHING IS NOT REOPENING. The room's opening state is the spinner; if
  //    it comes back, the whole workspace was rebuilt to change page.
  ok(await page.getByText(/Opening your study room/i).count() === 0,
     'moving between pages does not reopen the room');

  await backToShelf(page);

  // 6. SEARCH FINDS ONE AND HIDES THE OTHER.
  await page.getByLabel('Search your pages').fill('Daniel');
  await page.waitForTimeout(500);
  ok(await shelfRows(page).count() === 1, 'searching narrows the shelf to what matches');
  await page.getByLabel('Search your pages').fill('');
  await page.waitForTimeout(500);

  // 7. A PAGE CAN BE STARRED, and starred pages have somewhere to be.
  await page.getByRole('button', { name: /^Star Romans$/i }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Starred/i }).first().click();
  await page.waitForTimeout(600);
  ok(await shelfRows(page).count() === 1, 'a starred page is in Starred');
  ok(/Romans/.test(await shelf()), 'and it is the one that was starred');
  await page.getByRole('button', { name: /All pages/i }).first().click();
  await page.waitForTimeout(600);

  // 8. THE BIN IS A BIN. Putting a page away is not the same as destroying it,
  //    and the difference is the whole reason there is a bin.
  await page.getByRole('button', { name: /Move to bin/i }).first().click();
  await page.waitForTimeout(700);
  ok(await shelfRows(page).count() === 1, 'a page put in the bin leaves the shelf');

  await page.getByRole('button', { name: /Bin/i }).first().click();
  await page.waitForTimeout(600);
  ok(await shelfRows(page).count() === 1, 'and is in the bin');

  await page.getByRole('button', { name: /Put it back/i }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /All pages/i }).first().click();
  await page.waitForTimeout(600);
  ok(await shelfRows(page).count() === 2, 'and can be taken back out again');

  // 9. AND DELETING FOR GOOD ASKS FIRST.
  await page.getByRole('button', { name: /Move to bin/i }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Bin/i }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /^Delete forever$/i }).first().click();
  await page.waitForTimeout(400);
  ok(await page.getByText(/Delete it for good\?/i).count() > 0,
     'deleting a page for good asks before it does it');
  await page.getByRole('button', { name: /Yes, delete forever/i }).click();
  await page.waitForTimeout(900);
  ok(await shelfRows(page).count() === 0, 'and then it is gone');

  ok(errors.length === 0, `no page errors (${errors.slice(0, 1).join('') || 'none'})`);

  await page.screenshot({ path: `${OUT}/pages.png` });
  await ctx.close();
  console.log(`\nscreenshots in ${OUT}`);
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
