// The room has what AFFiNE has: databases, a canvas, tags and a journal.
//
// ---------------------------------------------------------------------------
// REPORTED, WITH FOUR SCREENSHOTS AND A LINK TO AFFiNE'S REPOSITORY: "Did you
// even scan the whole affine on how the whole notion works? ... I want the
// whole feature please."
//
// The honest answer was no. The room registered nine of AFFiNE's blocks and
// left out roughly thirty, and every previous walk asserted that the nine
// worked -- so the suite was green and the room was a quarter of what had been
// asked for three times. A test that checks only what was built cannot tell
// anybody that something was not built.
//
// So this walk asserts against AFFiNE'S OWN LIST rather than against ours: the
// slash menu has to offer the things their menu offers, by name.
//
//   node tests/e2e/the-study-room-has-affines-features.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions, pageErrors } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, openPage, backToShelf } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-affine-'));

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

/**
 * Everything written inside a custom element's shadow root, flattened.
 *
 * WHY NOT `innerText`. The slash menu is a Lit element that keeps its list in a
 * shadow root, and `innerText` on the host returns an empty string: the first
 * version of this walk read nothing and reported seven features missing that
 * were all present. A test that cannot see the thing it is testing fails in the
 * direction of "you did not build it", which wastes exactly as much time as a
 * false pass and is harder to disbelieve.
 */
const textIn = (host) => {
  const out = [];
  const walk = (node) => {
    for (const child of node.children) {
      const t = (child.textContent || '').trim();
      if (t && t.length < 40) out.push(t);
      if (child.shadowRoot) walk(child.shadowRoot);
      walk(child);
    }
  };
  if (host) walk(host.shadowRoot ?? host);
  return out;
};

(async () => {
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-affine`, {
    ...launchOptions, viewport: { width: 1280, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  // Through the shared collector, which leaves out WebKit's report of a fetch
  // the walk itself cut short (tests/e2e/_playwright.js, pageErrors).
  const caught = pageErrors(page);

  // WHAT THE BROWSER ACTUALLY FETCHES, counted rather than reasoned about. The
  // claim being tested is that opening the ROOM no longer downloads the whole
  // editor, so the two numbers have to be taken at two different moments.
  let bytes = 0;
  let phase = 'sign-in';
  const files = []; // what was counted, and when, so a failure says which file
  page.on('response', async (res) => {
    if (!res.url().endsWith('.js')) return;
    const at = phase;
    try {
      const n = (await res.body()).length;
      bytes += n;
      files.push({ at, n, name: res.url().split('/').pop() });
    } catch { /* aborted */ }
  });

  await signInAsExplorer(page, BASE);
  bytes = 0;
  phase = 'room';
  await openStudyRoom(page, BASE);
  const toOpenTheRoom = bytes;

  phase = 'page';
  await openPage(page, 0);
  const toOpenAPage = bytes - toOpenTheRoom;

  ok(toOpenTheRoom < toOpenAPage,
     `the list of pages costs less than the editor (${Math.round(toOpenTheRoom / 1024)} kB `
     + `for the room, then ${Math.round(toOpenAPage / 1024)} kB for the first page)`);
  if (toOpenTheRoom >= toOpenAPage) {
    // WebKit has counted the editor with the room since at least 20 October
    // and Chromium never has. The largest files of each step say why.
    for (const at of ['room', 'page']) {
      const top = files.filter((f) => f.at === at).sort((x, y) => y.n - x.n).slice(0, 8);
      console.log(`  ${at}: ${top.map((f) => `${f.name} ${Math.round(f.n / 1024)} kB`).join(', ') || 'nothing'}`);
    }
  }

  // -------------------------------------------------------------------------
  // 1. AFFiNE'S OWN BLOCKS, BY NAME, out of the slash menu.
  // -------------------------------------------------------------------------
  await page.locator('affine-paragraph').first().click();
  await page.waitForTimeout(400);
  await page.keyboard.type('/');
  await page.waitForTimeout(1200);

  ok(await page.locator('affine-slash-menu').count() > 0, 'the slash menu opens');
  const items = await page.evaluate((fn) => {
    // eslint-disable-next-line no-eval
    const collect = eval(`(${fn})`);
    const menu = document.querySelector('affine-slash-menu');
    return collect(menu?.shadowRoot?.querySelector('inner-slash-menu'));
  }, textIn.toString());
  const offered = items.join(' | ').toLowerCase();

  // These are the ones the room did NOT have before today. Each is a feature
  // named in the screenshots or in AFFiNE's own menu.
  for (const wanted of ['table view', 'kanban', 'code block', 'image', 'equation', 'attachment', 'linked doc']) {
    ok(offered.includes(wanted), `the menu offers "${wanted}"`);
  }
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // -------------------------------------------------------------------------
  // 2. A DATABASE IS A REAL BLOCK, not a menu entry that does nothing. This is
  //    the "Kanban for Todos" in the screenshot.
  // -------------------------------------------------------------------------
  await page.keyboard.type('/kanban');
  await page.waitForTimeout(900);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  ok(await page.locator('affine-database').count() >= 1,
     'a kanban board can be put on a page');

  // -------------------------------------------------------------------------
  // 3. TAGS. Typed on an open page, and then used to narrow the shelf.
  // -------------------------------------------------------------------------
  // Behind "File this page" since 27 October 2026, with a sentence on what a
  // tag is for (components/study/StudyFiling.tsx).
  await page.locator('[data-filing]').click();
  const tagBox = page.getByLabel('Add a tag to this page');
  ok(await tagBox.count() > 0, 'a page can be tagged');
  await tagBox.fill('Romans');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(600);
  ok(await page.getByRole('button', { name: /Take the tag Romans off this page/i }).count() > 0,
     'and the tag is on the page, with a way to take it off again');

  await backToShelf(page);
  const chip = page.getByRole('button', { name: /^Show every page tagged Romans$/i });
  ok(await chip.count() > 0, 'the tag shows on the page in the list');
  await chip.first().click();
  await page.waitForTimeout(700);
  const rowsWhenFiltered = await page.locator('ul[aria-label^="Pages:"] li').count();
  ok(rowsWhenFiltered >= 1, `the list narrows to that tag (${rowsWhenFiltered} shown)`);

  // -------------------------------------------------------------------------
  // 4. THE JOURNAL: one page per day, and the same page twice.
  // -------------------------------------------------------------------------
  await page.getByRole('button', { name: /^Every tag$/i }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Journal/i }).first().click();
  await page.waitForTimeout(700);

  const today = page.getByRole('button', { name: /Today's page|Start today's page/i }).first();
  await today.click();
  await page.waitForSelector('affine-paragraph', { timeout: 60_000 });
  await page.waitForTimeout(900);
  const named = await page.getByLabel('Name this page').inputValue();
  const day = new Date();
  ok(named.includes(String(day.getDate())) && named.includes(String(day.getFullYear())),
     `today's page is named after today (${JSON.stringify(named)})`);

  await page.keyboard.type('');
  await backToShelf(page);
  await page.getByRole('button', { name: /Journal/i }).first().click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /Today's page/i }).first().click();
  await page.waitForSelector('affine-paragraph', { timeout: 60_000 });
  await page.waitForTimeout(900);
  await backToShelf(page);
  await page.getByRole('button', { name: /Journal/i }).first().click();
  await page.waitForTimeout(700);
  const journalRows = await page.locator('ul[aria-label^="Pages:"] li').count();
  // PRESSED TWICE, ONE PAGE. A Today button that makes a new page every time
  // gives somebody four pages for one morning and no way to tell which one has
  // the thing they wrote first.
  ok(journalRows === 1, `pressing Today twice gives one page, not two (${journalRows})`);

  // -------------------------------------------------------------------------
  // 5. THE WHITEBOARD. The switch beside the title in AFFiNE's own app.
  // -------------------------------------------------------------------------
  await openPage(page, 0);
  const board = page.getByRole('button', { name: /^Whiteboard$/ });
  ok(await board.count() > 0, 'a page can be looked at as a whiteboard');
  await board.click();
  await page.waitForTimeout(2500);
  ok(await page.locator('affine-edgeless-root').count() >= 1,
     'and the canvas is really there');
  const toolbar = await page.locator('edgeless-toolbar-widget, affine-toolbar-widget').count();
  ok(toolbar >= 1, `with the tools to draw on it (${toolbar})`);

  const errors = caught.list();
  ok(errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ') || 'none'})`);

  await page.screenshot({ path: `${OUT}/affine-features.png`, fullPage: false });
  await ctx.close();
  console.log(`\nscreenshots in ${OUT}`);
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
