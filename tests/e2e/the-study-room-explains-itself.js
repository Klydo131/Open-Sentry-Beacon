// A new room comes with a page that shows what the room can do.
//
// ---------------------------------------------------------------------------
// ASKED FOR, WITH A SCREENSHOT OF AFFiNE'S OWN "Getting Started": "Make sure
// there is an instruction manual inside the study room so Explorers can see the
// full potential of the Affine features like what Affine did in the tutorial."
//
// WHAT THIS WALK CHECKS AND WHAT IT DELIBERATELY DOES NOT. It checks the page
// is there, is made of the blocks it describes, and can be binned like any
// other. It does NOT check that binning it is permanent, and the reason is
// worth writing down: the only room a walk can reach is the walkthrough's, and
// the walkthrough keeps its pages in memory. Reload and the room is brand new,
// so the guide correctly reappears -- an assertion about "stays deleted" would
// pass on the bug and fail on the fix. That was written first and watched
// report a failure that was not one.
//
// The permanence rule is held by tests/a-guide-is-given-once.mjs, against a
// room that actually remembers, in Node.
//
//   node tests/e2e/the-study-room-explains-itself.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, shelfRows, backToShelf } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-guide-'));

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-guide`, {
    ...launchOptions, viewport: { width: 390, height: 844 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  await signInAsExplorer(page, BASE);
  await openStudyRoom(page, BASE);

  // 1. IT IS ON THE SHELF, NAMED, WITHOUT OPENING ANYTHING.
  const named = page.getByText(/Getting started in your Study Room/i);
  ok(await named.count() > 0, 'a new room comes with a Getting Started page');

  // 2. AND IT IS MADE OF THE BLOCKS IT DESCRIBES.
  await named.first().click();
  await page.waitForSelector('affine-paragraph', { timeout: 60_000 });
  await page.waitForTimeout(1500);

  const written = (await page.locator('editor-host').innerText()).replace(/​/g, '');
  for (const named of ['Journal', 'Whiteboard', 'tag', 'Bin']) {
    ok(new RegExp(named, 'i').test(written), `it tells somebody about ${named}`);
  }
  ok(/2 Timothy 2:15/.test(written), 'and ends where a church study guide should');

  const todos = await page.locator('affine-list').count();
  ok(todos >= 8, `the things to try are real list blocks (${todos})`);
  const rules = await page.locator('affine-divider').count();
  ok(rules >= 3, `and the rules between sections are real dividers (${rules})`);

  // 3. A BOX CAN BE TICKED, which is the feature teaching itself.
  const box = page.locator('affine-list .affine-list-block__todo-prefix, affine-list [data-checked]').first();
  if (await box.count()) {
    await box.click();
    await page.waitForTimeout(600);
  }
  ok(errors.length === 0, `nothing broke (${errors.slice(0, 1).join('') || 'none'})`);

  // 4. IT CAN BE BINNED LIKE ANY OTHER PAGE, which is the whole of what a
  //    browser can honestly say here. Whether it stays binned is asked of a
  //    room that remembers, in tests/a-guide-is-given-once.mjs.
  await backToShelf(page);
  const before = await shelfRows(page).count();

  const row = page.locator('ul[aria-label^="Pages:"] li')
    .filter({ hasText: /Getting started in your Study Room/i }).first();
  await row.getByRole('button', { name: /Move to bin/i }).click();
  await page.waitForTimeout(900);
  ok(await shelfRows(page).count() === before - 1, 'it can be put in the bin like any page');

  await page.screenshot({ path: `${OUT}/guide.png` });
  await ctx.close();
  console.log(`\nscreenshots in ${OUT}`);
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
