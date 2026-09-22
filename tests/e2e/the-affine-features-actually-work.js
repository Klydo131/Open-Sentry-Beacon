// The study room's features DO something, not just appear in a menu.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS BESIDE the-study-room-has-affines-features.js, WHICH ALREADY
// PASSES. That walk asks the slash menu what it OFFERS -- "the menu offers
// table view", "the menu offers code block" -- and then inserts exactly one of
// them. Seven of its assertions are satisfied by a string appearing in a list.
//
// This repository has spent a week on checks that stayed green while something
// was broken, and a menu entry is the purest example of the shape: the thing
// exists, it is named correctly, and nothing has established that choosing it
// does anything at all. A room advertised as "everything AFFiNE has" needs at
// least one walk that uses the features rather than reading their labels.
//
// So every assertion here is a before-and-after count of what is REALLY in the
// document: a block model that arrived, or an element on the whiteboard
// surface that was not there before the drag.
//
// TWO THINGS ARE DELIBERATELY NOT HERE, and saying why is the point:
//
//   - The file picker. `/image` and `/attachment` consume the command -- the
//     typed text is gone afterwards -- and then no <input type="file"> ever
//     reaches the DOM and no chooser fires, in headless Chromium, with no page
//     error. That is exactly as consistent with a sandbox that cannot raise a
//     file dialog as with a broken feature, so it is not asserted either way.
//     Pasting an image IS asserted below, and that path works.
//   - Bookmarks and embeds, which fetch the address they are given. There is
//     no outbound network here, so a failure would say nothing.
//
//   node tests/e2e/the-affine-features-actually-work.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, newPage, backToShelf } = require('./_study');
const os = require('node:os'), fs = require('node:fs'), path = require('node:path');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

/** Every block flavour the document actually holds, counted. */
const flavours = (page) => page.evaluate(() => {
  const host = document.querySelector('editor-host');
  const store = host?.std?.store ?? host?.std?.doc;
  const out = {};
  for (const b of store?.getAllModels?.() ?? []) {
    out[b.flavour] = (out[b.flavour] || 0) + 1;
  }
  return out;
});

/** How many things are drawn on the whiteboard surface. */
const onTheSurface = (page) => page.evaluate(() => {
  const host = document.querySelector('editor-host');
  const store = host?.std?.store ?? host?.std?.doc;
  const surface = (store?.getAllModels?.() ?? []).find((b) => b.flavour === 'affine:surface');
  return surface?.elementModels?.length ?? -1;
});

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-affine-'));
  const ctx = await chromium.launchPersistentContext(dir,
    { ...launchOptions, viewport: { width: 1400, height: 950 } });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  await signInAsExplorer(page, BASE);
  await openStudyRoom(page, BASE);
  await newPage(page);
  await page.waitForTimeout(1200);

  // -------------------------------------------------------------------------
  // 1. A SLASH COMMAND PUTS A REAL BLOCK IN THE DOCUMENT
  // -------------------------------------------------------------------------
  //
  // One word each, because AFFiNE's slash menu closes the moment a space is
  // typed -- "/code block" never reaches it, and a walk written that way
  // measures nothing while looking thorough.
  const wanted = [
    ['code', 'affine:code', 'a code block'],
    ['table', 'affine:table', 'a table'],
    ['kanban', 'affine:database', 'a kanban board'],
    ['divider', 'affine:divider', 'a divider'],
    ['bulleted', 'affine:list', 'a bulleted list'],
  ];

  // ONE FEATURE PER PAGE, AND THAT IS NOT LAZINESS. The first version of this
  // walk inserted all five into one document and reported that tables do not
  // work. They do. A code block keeps the caret, so the next `/table` was
  // typed INTO the code block as ordinary text, where no slash menu opens --
  // a walk describing its own focus handling and blaming the editor.
  //
  // Trying to steer out of it (Escape to select the block, Enter to open a
  // paragraph after it) then broke the FIRST insertion instead, because on an
  // untouched page there is nothing selected to escape from. A fresh page per
  // feature costs a few seconds and has no such state to get wrong.
  const insert = async (query, flavour) => {
    await backToShelf(page);
    await newPage(page);
    await page.waitForTimeout(900);
    await page.locator('affine-paragraph').first().click();
    await page.waitForTimeout(300);
    const before = (await flavours(page))[flavour] || 0;
    await page.keyboard.type(`/${query}`);
    await page.waitForTimeout(900);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1600);
    return { before, after: (await flavours(page))[flavour] || 0 };
  };

  for (const [query, flavour, human] of wanted) {
    const { before, after } = await insert(query, flavour);
    ok(after > before, `${human} lands in the document (${flavour} ${before} -> ${after})`);
  }

  // -------------------------------------------------------------------------
  // 2. A PICTURE CAN BE PASTED IN
  // -------------------------------------------------------------------------
  //
  // The path somebody actually uses for a photograph of a Bible page, and the
  // one that does not need a file dialog this sandbox cannot raise.
  {
    await backToShelf(page);
    await newPage(page);
    await page.waitForTimeout(900);
    await page.locator('affine-paragraph').first().click();
    await page.waitForTimeout(300);
    const before = (await flavours(page))['affine:image'] || 0;
    await page.evaluate(() => {
      const host = document.querySelector('editor-host');
      const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'probe.png', { type: 'image/png' }));
      const target = document.querySelector('affine-paragraph rich-text') || host;
      target.dispatchEvent(new ClipboardEvent('paste', {
        clipboardData: dt, bubbles: true, cancelable: true, composed: true,
      }));
    });
    await page.waitForTimeout(4000);
    const after = (await flavours(page))['affine:image'] || 0;
    ok(after > before, `a pasted picture becomes an image block (${before} -> ${after})`);
  }

  // -------------------------------------------------------------------------
  // 3. THE WHITEBOARD IS DRAWN ON, NOT JUST OPENED
  // -------------------------------------------------------------------------
  //
  // The existing walk asserts the toolbar exists. A toolbar is not a drawing.
  // Each tool here is reached by its keyboard shortcut, which is what the
  // toolbar's own tooltips tell somebody to press.
  {
    await page.getByRole('button', { name: /^Whiteboard$/ }).click();
    await page.waitForTimeout(3500);
    ok(await page.locator('affine-edgeless-root').count() >= 1, 'the whiteboard opens');

    const box = await page.locator('.affine-edgeless-viewport').first().boundingBox();
    ok(!!box, 'the board has a size to draw on');

    const drag = async (key, x1, y1, x2, y2) => {
      await page.mouse.click(box.x + 60, box.y + 60);
      await page.keyboard.press(key);
      await page.waitForTimeout(700);
      await page.mouse.move(box.x + x1, box.y + y1);
      await page.mouse.down();
      await page.mouse.move(box.x + x2, box.y + y2, { steps: 14 });
      await page.mouse.up();
      await page.waitForTimeout(1400);
      return onTheSurface(page);
    };

    if (box) {
      let n = await onTheSurface(page);
      for (const [key, human] of [['s', 'a shape'], ['p', 'a pen stroke'], ['f', 'a frame']]) {
        const after = await drag(key, 250 + Math.random() * 30, 200, 460, 360);
        ok(after > n, `${human} can be drawn on the board (surface held ${n}, now ${after})`);
        n = after;
      }
    }
  }

  ok(errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ') || 'none'})`);

  await ctx.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
