// A page can be filed in a folder, and a question can be saved as a view.
//
// ---------------------------------------------------------------------------
// THE LAST TWO FEATURES FROM THE OWNER'S SCREENSHOT of AFFiNE's sidebar:
// "Organize / First Folder", and "Collections".
//
// WHY BOTH, WHEN THE ROOM ALREADY HAS TAGS. A folder is a place a page is IN
// and is what a person DECIDES. A collection is a question the shelf answers,
// saved so nobody retypes it, and gathers pages that were never put there: the
// difference is that a folder is somebody's decision and a collection is what
// is true. A page written next week that matches a collection is in it without
// anybody doing anything, which is the assertion at the bottom of this walk and
// the only one that tells the two apart.
//
//   node tests/e2e/the-room-has-folders-and-collections.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, newPage, backToShelf, shelfRows } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-folders-'));

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function nameIt(page, title, folder, tag) {
  await page.getByLabel('Name this page').fill(title);
  if (folder !== undefined) {
    await page.getByLabel('Which folder this page is filed in').fill(folder);
    await page.getByLabel('Name this page').click();
    await page.waitForTimeout(500);
  }
  if (tag) {
    await page.getByLabel('Add a tag to this page').fill(tag);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500);
  }
  await page.locator('affine-paragraph').first().click();
  await page.waitForTimeout(300);
  await page.keyboard.type(`Notes about ${title}.`);
  await page.waitForTimeout(700);
}

(async () => {
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-folders`, {
    ...launchOptions, viewport: { width: 1280, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  await signInAsExplorer(page, BASE);
  await openStudyRoom(page, BASE);

  // 1. A PAGE CAN BE FILED SOMEWHERE.
  await newPage(page);
  ok(await page.getByLabel('Which folder this page is filed in').count() > 0,
     'a page can be filed in a folder');
  await nameIt(page, 'Romans 8', 'Romans study', 'Romans');
  await backToShelf(page);

  const chip = page.getByRole('button', { name: /Show every page in Romans study/i });
  ok(await chip.count() > 0, 'and the shelf says which folder it is in');

  // 2. A SECOND PAGE SOMEWHERE ELSE, so the filter has something to exclude.
  await newPage(page);
  await nameIt(page, 'Daniel 2', 'Daniel study', 'Daniel');
  await backToShelf(page);

  const folders = page.getByRole('group', { name: /Folders in this room/i });
  ok(await folders.count() > 0, 'the room lists its folders');
  const before = await shelfRows(page).count();

  await folders.getByRole('button', { name: /Romans study/i }).first().click();
  await page.waitForTimeout(700);
  const inFolder = await shelfRows(page).count();
  ok(inFolder < before && inFolder >= 1,
     `choosing a folder narrows the shelf to it (${inFolder} of ${before})`);

  await folders.getByRole('button', { name: /^Every folder$/i }).click();
  await page.waitForTimeout(600);
  ok(await shelfRows(page).count() === before, 'and Every folder gives them back');

  // 3. A SAVED VIEW. Narrow by tag, save the question, name it.
  await page.getByRole('button', { name: /^Show every page tagged Romans$/i }).first().click();
  await page.waitForTimeout(600);
  const save = page.getByRole('button', { name: /^Save this view$/i });
  ok(await save.count() > 0, 'a narrowed shelf offers to remember the question');
  await save.click();
  await page.waitForTimeout(500);
  await page.getByLabel('Name for this saved view').fill('Romans work');
  await page.getByRole('button', { name: /^Save it$/i }).click();
  await page.waitForTimeout(800);

  const saved = page.getByRole('group', { name: /Saved views/i });
  ok(await saved.count() > 0, 'and it is kept as a saved view');

  // 4. THE ASSERTION THAT TELLS A COLLECTION FROM A FOLDER. A page written
  //    AFTER the view was saved, that matches it, is in it. Nobody put it there.
  await page.getByRole('button', { name: /^Every tag$/i }).click();
  await page.waitForTimeout(500);
  await newPage(page);
  await nameIt(page, 'Romans 12', undefined, 'Romans');
  await backToShelf(page);

  await page.getByRole('button', { name: /Romans work/i }).first().click();
  await page.waitForTimeout(800);
  const gathered = await shelfRows(page).count();
  ok(gathered >= 2,
     `a page written after the view was saved is gathered by it (${gathered})`);

  const written = await page.locator('ul[aria-label^="Pages:"]').innerText();
  ok(/Romans 12/.test(written), 'and it is the one that was just written');
  ok(!/Daniel 2/.test(written), 'while a page that does not match stays out');

  // 5. FORGETTING A VIEW KEEPS THE PAGES.
  const rowsAll = await (async () => {
    await page.getByRole('button', { name: /Forget the saved view Romans work/i }).click();
    await page.waitForTimeout(800);
    return shelfRows(page).count();
  })();
  ok(rowsAll >= gathered, `forgetting the view keeps every page (${rowsAll})`);

  ok(errors.length === 0, `no page errors (${errors.slice(0, 1).join('') || 'none'})`);

  await page.screenshot({ path: `${OUT}/folders.png` });
  await ctx.close();
  console.log(`\nscreenshots in ${OUT}`);
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
