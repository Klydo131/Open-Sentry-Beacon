// A study room holds more than one page, and they stay apart.
//
// ---------------------------------------------------------------------------
// WHAT THIS IS ACTUALLY CHECKING. Adding a second page is easy to make look
// right and easy to get wrong in a way no screenshot shows: two chips at the
// top and one document underneath, so everything typed on "Romans" is also on
// "Daniel" because both are rendering the same store. The assertion that
// matters is not that a page can be made, it is that what is written on one
// page is NOT on the other, and that it is still there when you come back.
//
// The second thing it holds down is that switching pages does not tear the room
// down. The workspace owns the sync engine and every page in the room; rebuilt
// on every switch, a person moving between two pages would re-download the room
// each time, which on mobile data is the difference between a room and a reason
// to stop using the app. So the walk switches back and forth and asserts the
// editor never went through its opening state again.
//
//   node tests/e2e/a-study-room-holds-many-pages.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-pages-'));

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const write = async (page, words) => {
  await page.locator('affine-paragraph').first().click();
  await page.waitForTimeout(300);
  await page.keyboard.type(words);
  await page.waitForTimeout(600);
};
const onPage = async (page) => (await page.locator('editor-host').innerText()).replace(/​/g, '');

(async () => {
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-pages`, {
    ...launchOptions, viewport: { width: 412, height: 915 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByText(/John Reyes/).first().click();
  await page.waitForTimeout(1700);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) { await consent.first().click().catch(() => {}); await page.waitForTimeout(600); }

  await page.goto(`${BASE}/study`, { waitUntil: 'networkidle' });
  await page.waitForSelector('affine-paragraph', { timeout: 60_000 });
  await page.waitForTimeout(1200);

  // 1. A ROOM OPENS ON A PAGE, and says which one.
  // SCOPED TO THE STRIP. The app's own room rail marks its active link the
  // same way, so an unscoped query counts the Study Room link in the navigation
  // as well and the assertion is about the wrong thing entirely.
  const strip = page.locator('nav[aria-label="Pages in this room"] [aria-current="page"]');
  ok(await strip.count() === 1, `the room opens on one page and marks it (${await strip.count()})`);

  // 2. IT CAN BE NAMED, because "Page 1" is not what a study is called.
  await page.getByRole('button', { name: /Name this page/i }).click();
  await page.waitForTimeout(300);
  await page.getByLabel('Name this page').fill('Romans');
  await page.getByRole('button', { name: /Save name/i }).click();
  await page.waitForTimeout(600);
  ok(await page.getByRole('button', { name: 'Romans' }).count() > 0,
     'and naming it puts the name on the page chip');

  await write(page, 'Therefore there is now no condemnation.');
  ok(/no condemnation/.test(await onPage(page)), 'what is typed lands on it');

  // 3. A SECOND PAGE IS A SECOND PAGE.
  await page.getByRole('button', { name: /New page/i }).click();
  await page.waitForSelector('affine-paragraph', { timeout: 30_000 });
  await page.waitForTimeout(1200);

  const fresh = await onPage(page);
  ok(!/no condemnation/.test(fresh),
     `a new page opens empty rather than showing the last one (${JSON.stringify(fresh.slice(0, 40))})`);

  await write(page, 'The fourth man in the fire.');
  ok(/fourth man/.test(await onPage(page)), 'and takes writing of its own');

  // 4. AND THE FIRST ONE IS STILL WHERE IT WAS.
  await page.getByRole('button', { name: 'Romans' }).click();
  await page.waitForTimeout(1200);
  const back = await onPage(page);
  ok(/no condemnation/.test(back), 'going back finds the first page as it was left');
  ok(!/fourth man/.test(back), 'and nothing from the other page has leaked into it');

  // 5. SWITCHING IS NOT REOPENING. The room's opening state is the spinner; if
  //    it comes back, the whole workspace was rebuilt to change page.
  const reopened = await page.getByText(/Opening your study room/i).count();
  ok(reopened === 0, 'switching pages does not reopen the room');

  // 6. A PAGE CAN BE PUT AWAY, and it asks first.
  await page.getByRole('button', { name: /^Delete this page$/i }).click();
  await page.waitForTimeout(400);
  ok(await page.getByText(/Delete Romans and everything written on it\?/i).count() > 0,
     'deleting a page asks before it does it, and names the page');
  await page.getByRole('button', { name: /Yes, delete this page/i }).click();
  await page.waitForTimeout(1200);

  const left = await strip.count();
  ok(left === 1, 'and the room lands on a page that still exists');
  ok(!/no condemnation/.test(await onPage(page)), 'showing the page that was kept');

  // 7. THE LAST PAGE CANNOT BE DELETED, because a room with no pages is not a
  //    state this editor has, and offering it would be offering a dead end.
  ok(await page.getByRole('button', { name: /Delete this page/i }).count() === 0,
     'the last page is not offered a delete button at all');

  ok(errors.length === 0, `no page errors (${errors.slice(0, 1).join('') || 'none'})`);

  await page.screenshot({ path: `${OUT}/pages.png` });
  await ctx.close();
  console.log(`\nscreenshots in ${OUT}`);
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
