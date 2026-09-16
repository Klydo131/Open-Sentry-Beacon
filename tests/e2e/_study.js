// Getting into the study room, in one place.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Four walks all had the same forty lines at the top: sign in
// as a sample person, dismiss the consent box, go to /study, wait for the
// editor. When the room stopped opening straight onto a page -- it opens onto a
// shelf of pages now, which is what was asked for -- all four broke in the same
// way and had to be repaired four times. Once is enough.
//
// The underscore keeps it out of the suite list: scripts/verify.mjs runs every
// tests/e2e/*.js that does not start with one.
// ---------------------------------------------------------------------------

/** Sign in as the sample Explorer the walkthrough provides. */
async function signInAsExplorer(page, BASE) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByText(/John Reyes/).first().click();
  await page.waitForTimeout(1700);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
}

/**
 * Walk into the room. Lands on the shelf, which is where the room opens.
 *
 * WAITS ON THE SEARCH BOX, NOT THE NAVIGATION, and the difference cost three
 * walks a timeout each. The places strip is rendered twice -- a sidebar for
 * wide screens and a row of chips for narrow ones, one of them display:none --
 * so waiting for it on a phone waits for whichever came first in the DOM, and
 * if that is the hidden one it waits forever. The search field exists once, and
 * only once the shelf is actually up.
 */
async function openStudyRoom(page, BASE) {
  await page.goto(`${BASE}/study`, { waitUntil: 'networkidle' });
  // The chunk is most of a megabyte; a short timeout here makes a flaky suite
  // rather than a true answer.
  await page.getByLabel('Search your pages').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
}

/** Every page row on the shelf, in the order the shelf shows them. */
function shelfRows(page) {
  return page.locator('ul[aria-label^="Pages:"] li');
}

/**
 * Open a page from the shelf and wait for the editor.
 *
 * Returns once there is somewhere to type, so a caller can start typing without
 * repeating the wait and without guessing at a timeout.
 */
async function openPage(page, which = 0) {
  await shelfRows(page).nth(which).locator('button').first().click();
  await page.waitForSelector('affine-paragraph', { timeout: 60_000 });
  await page.waitForTimeout(900);
}

/** Start a new page and wait for it to be open and ready to write in. */
async function newPage(page) {
  await page.getByRole('button', { name: /New page/i }).first().click();
  await page.waitForSelector('affine-paragraph', { timeout: 60_000 });
  await page.waitForTimeout(900);
}

/** Back to the shelf from an open page. */
async function backToShelf(page) {
  await page.getByRole('button', { name: /^All pages$/i }).first().click();
  await page.getByLabel('Search your pages').waitFor({ timeout: 20_000 }).catch(() => {});
  // The shelf is brought up to date when a page is left, so give that write a
  // moment before reading the list back.
  await page.waitForTimeout(900);
}

/** What the open editor currently holds, with the zero-width marks taken out. */
async function writtenOnPage(page) {
  return (await page.locator('editor-host').innerText()).replace(/​/g, '');
}

module.exports = {
  signInAsExplorer,
  openStudyRoom,
  shelfRows,
  openPage,
  newPage,
  backToShelf,
  writtenOnPage,
};
