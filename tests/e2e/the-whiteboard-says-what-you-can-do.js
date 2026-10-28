// The whiteboard works like every whiteboard: tools along the bottom, and a
// selected thing gets a bar with ⋯ for everything else.
//
// 27 October 2026: "if I right click on it there are no option for me to
// delete objects, options to modify, or edit it." The room answered with a bar
// of its own across the top of the board, in pictures and words.
//
// 28 October 2026, with a photograph of that bar circled: "This is not the
// solution for replacing the '3 dots'... I want the 3 dots to be back once I
// click an object", and the room should feel like Notion, Obsidian and Notes.
// AFFiNE has that bar (affine-toolbar-widget); it never opened here because
// the room never told AFFiNE it was a whiteboard (lib/study/view-extensions.ts).
// Now it does, and the room's own bar is gone. What the room still adds is
// components/study/StudyBoardTools.tsx: Undo and Redo, the right-click and
// long-press menu, and the lock on the card with the page's own writing.
//
// Walked as a person would, in Simple: a shape drawn, then its bar, ⋯,
// Duplicate, Delete and Undo, a right-click, Lock, the page's own writing that
// cannot be deleted by accident, and a long press with a finger on a phone.
//
//   node tests/e2e/the-whiteboard-says-what-you-can-do.js [port]
const { browser: engine, engineName, launchOptions, pageErrors } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, newPage } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

/** How many things are on the board: the surface's elements and its blocks. */
const onTheBoard = (page) => page.evaluate(() => {
  const host = document.querySelector('editor-host');
  const store = host?.std?.store;
  const models = store?.getAllModels?.() ?? [];
  const surface = models.find((b) => b.flavour === 'affine:surface');
  if (!surface) return -1;
  return (surface.elementModels?.length ?? 0) + models.filter((b) => b.flavour === 'affine:note').length;
});

/** The card with the page's own writing: whether it is there and locked. */
const pageWriting = (page) => page.evaluate(() => {
  const store = document.querySelector('editor-host')?.std?.store;
  const notes = (store?.getAllModels?.() ?? []).filter((b) => b.flavour === 'affine:note' && b.props?.displayMode !== 'edgeless');
  return { count: notes.length, locked: notes.length > 0 && notes.every((n) => n.props?.lockedBySelf === true) };
});

/** AFFiNE's bar over the selection, and the labels of its buttons. */
const selectionBar = (page) => page.evaluate(() => {
  const bar = document.querySelector('affine-toolbar-widget')?.shadowRoot?.querySelector('editor-toolbar');
  if (!bar || !bar.dataset.open) return null;
  const r = bar.getBoundingClientRect();
  const labels = [...bar.querySelectorAll('editor-icon-button, editor-menu-button')].map((b) => b.getAttribute('aria-label') || '');
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, labels };
});

/** The choices in AFFiNE's ⋯ menu, if it is open. */
const moreItems = async (page) => (await page.locator('affine-toolbar-widget editor-menu-action').allInnerTexts().catch(() => []))
  .map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);

async function openBoard(page) {
  await signInAsExplorer(page, BASE);
  await openStudyRoom(page, BASE, 'simple');
  await newPage(page);
  await page.getByRole('button', { name: /^Whiteboard$/ }).click();
  await page.waitForSelector('affine-edgeless-root', { timeout: 60_000 });
  await page.getByRole('toolbar', { name: 'Undo and redo' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  return page.locator('.sr-board-frame').boundingBox();
}

/** Draw one shape with AFFiNE's own key, S, then back to Select; returns its box. */
async function drawShape(page, box) {
  const cx = box.x + box.width * 0.55, cy = box.y + box.height * 0.45;
  await page.mouse.click(box.x + box.width - 40, box.y + 80);
  await page.keyboard.press('s');
  await page.waitForTimeout(400);
  await page.mouse.move(cx - 70, cy - 45);
  await page.mouse.down();
  await page.mouse.move(cx + 70, cy + 45, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  await page.waitForTimeout(300);
  return { cx, cy, top: cy - 45, bottom: cy + 45, left: cx - 70, right: cx + 70 };
}

(async () => {
  const browser = await engine.launch(launchOptions);
  try {
    // ---------------------------------------------------------------- mouse
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await context.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    const page = await context.newPage();
    // Through the shared collector, which leaves out a fetch the walk itself
    // cut short (tests/e2e/_playwright.js, pageErrors).
    const caught = pageErrors(page);
    const box = await openBoard(page);

    ok(await page.locator('[data-board-tools], .sr-board-bar').count() === 0,
       'the room’s own bar of pictures and words is gone from the board');
    ok(await page.locator('edgeless-toolbar-widget').isVisible().catch(() => false),
       'the tools are AFFiNE’s bar along the bottom, in Simple too');
    ok(await page.getByRole('button', { name: 'Undo' }).isVisible() && await page.getByRole('button', { name: 'Redo' }).isVisible(),
       'Undo and Redo are buttons on the board, for a phone with no Ctrl+Z');

    const writing = await pageWriting(page);
    ok(writing.count === 1 && writing.locked, `the card with the page’s writing is locked on the board (${JSON.stringify(writing)})`);

    // A SHAPE, AND ITS BAR WITH ⋯.
    const n0 = await onTheBoard(page);
    const shape = await drawShape(page, box);
    ok(await onTheBoard(page) === n0 + 1, 'a shape is drawn with AFFiNE’s own tool');
    await page.mouse.click(shape.cx, shape.cy);
    await page.waitForTimeout(700);
    const bar = await selectionBar(page);
    ok(!!bar, 'selecting the shape opens a bar for it');
    ok(bar && bar.right > shape.left && bar.left < shape.right && (bar.bottom <= shape.top + 4 || bar.top >= shape.bottom - 4)
       && Math.min(Math.abs(shape.top - bar.bottom), Math.abs(bar.top - shape.bottom)) < 80,
       `and the bar floats next to the shape, not across the top of the board (${bar ? Math.round(bar.top) : '-'}px, shape at ${Math.round(shape.top)}px)`);
    ok(bar && bar.labels.includes('More menu') && bar.labels.includes('Lock'),
       `with Lock and ⋯ in it (${bar?.labels.join(', ')})`);

    await page.locator('affine-toolbar-widget editor-menu-button[aria-label="More menu"]').click();
    await page.waitForTimeout(500);
    const items = await moreItems(page);
    ok(['Bring to Front', 'Send to Back', 'Copy', 'Duplicate', 'Delete'].every((w) => items.includes(w)),
       `⋯ opens what every whiteboard offers (${items.join(', ')})`);

    // DUPLICATE.
    const n1 = await onTheBoard(page);
    await page.locator('affine-toolbar-widget editor-menu-action', { hasText: /^\s*Duplicate\s*$/ }).click();
    await page.waitForTimeout(700);
    ok(await onTheBoard(page) === n1 + 1, 'Duplicate makes a copy');

    // DELETE, THEN UNDO ON THE ROOM'S OWN BUTTON.
    await page.mouse.click(shape.cx, shape.cy);
    await page.waitForTimeout(500);
    await page.locator('affine-toolbar-widget editor-menu-button[aria-label="More menu"]').click();
    await page.waitForTimeout(400);
    const n2 = await onTheBoard(page);
    await page.locator('affine-toolbar-widget editor-menu-action', { hasText: /^\s*Delete\s*$/ }).click();
    await page.waitForTimeout(600);
    ok(await onTheBoard(page) === n2 - 1, 'Delete in ⋯ takes it off the board');
    await page.getByRole('button', { name: 'Undo' }).click();
    await page.waitForTimeout(600);
    ok(await onTheBoard(page) === n2, 'and the Undo button brings it back');

    // RIGHT-CLICK ON THE SHAPE: the same ⋯ menu, without finding the dots.
    await page.mouse.click(box.x + box.width - 40, box.y + 80);
    await page.waitForTimeout(300);
    await page.mouse.click(shape.cx, shape.cy, { button: 'right' });
    await page.waitForTimeout(700);
    const right = await moreItems(page);
    ok(right.includes('Duplicate') && right.includes('Delete'), `right-click on the shape opens the same ⋯ menu (${right.join(', ')})`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // RIGHT-CLICK ON EMPTY BOARD: the board's own menu.
    await page.mouse.click(box.x + 80, box.y + box.height - 160, { button: 'right' });
    await page.waitForTimeout(400);
    const boardItems = (await page.getByRole('menuitem').allInnerTexts()).map((t) => t.trim());
    ok(['Undo', 'Redo', 'Select everything', 'Show everything'].every((w) => boardItems.includes(w)),
       `right-click on empty board offers the board’s own choices (${boardItems.join(', ')})`);
    await page.keyboard.press('Escape');

    // LOCK: a locked shape does not go with the Delete key.
    await page.mouse.click(shape.cx, shape.cy);
    await page.waitForTimeout(500);
    await page.locator('affine-toolbar-widget editor-icon-button[aria-label="Lock"]').click();
    await page.waitForTimeout(500);
    const n3 = await onTheBoard(page);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(500);
    ok(await onTheBoard(page) === n3, 'a locked shape stays when Delete is pressed');
    const lockedBar = await selectionBar(page);
    ok(lockedBar && lockedBar.labels.some((l) => /unlock/i.test(l)) && !lockedBar.labels.includes('More menu'),
       `and its bar offers Unlock instead of ⋯ (${lockedBar?.labels.join(', ')})`);

    // THE PAGE'S OWN WRITING: locked, so neither Delete nor ⋯ can take it.
    const note = await page.locator('affine-edgeless-note').first().boundingBox();
    if (note) {
      await page.mouse.click(note.x + 8, note.y + 8);
      await page.waitForTimeout(500);
      const noteBar = await selectionBar(page);
      ok(noteBar && !noteBar.labels.includes('More menu'), `the page’s writing has no ⋯ with Delete in it (${noteBar?.labels.join(', ')})`);
      await page.keyboard.press('Delete');
      await page.waitForTimeout(500);
      ok((await pageWriting(page)).count === 1, 'and the Delete key leaves it where it is');
    } else {
      ok(false, 'the page’s writing is on the board as a card');
    }

    // UNDO EVERYTHING. Neither the page's own skeleton nor the lock on its
    // writing is something anybody did, so neither is in the history: until
    // 28 October 2026 enough presses of Undo on a new page took the page apart.
    for (let i = 0; i < 40 && await page.getByRole('button', { name: 'Undo' }).isEnabled(); i++) {
      await page.getByRole('button', { name: 'Undo' }).click();
      await page.waitForTimeout(150);
    }
    const afterAll = await pageWriting(page);
    ok(afterAll.count === 1 && afterAll.locked,
       `Undo, however many times, leaves the page’s writing in place and locked (${JSON.stringify(afterAll)})`);

    const errors = caught.list();
    ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 2).join(' | ')}` : ''}`);
    await context.close();

    // ---------------------------------------------------------------- finger
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await phone.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    const p = await phone.newPage();
    const pbox = await openBoard(p);
    const tools = await p.locator('edgeless-toolbar-widget').boundingBox();
    ok(tools && tools.x >= pbox.x - 1 && tools.x + tools.width <= pbox.x + pbox.width + 1,
       `on a phone the tools fit inside the board (${Math.round(tools?.width ?? 0)}px of ${Math.round(pbox.width)}px)`);
    const undo = await p.getByRole('button', { name: 'Undo' }).boundingBox();
    ok(undo && undo.x >= pbox.x && undo.y >= pbox.y && undo.width >= 44, 'and Undo is on the board, big enough for a thumb');

    // A shape put straight onto the canvas: a mouse drag does not draw in a
    // touch browser, and drawing is not what this part is about.
    const tx = Math.round(pbox.x + pbox.width * 0.55), ty = Math.round(pbox.y + pbox.height * 0.45);
    const placed = await p.evaluate(([cx, cy]) => {
      const root = document.querySelector('affine-edgeless-root');
      const gfx = root?.gfx;
      const surface = root?.std?.store?.getAllModels?.().find((b) => b.flavour === 'affine:surface');
      if (!gfx || !surface) return false;
      const [x, y] = gfx.viewport.toModelCoordFromClientCoord([cx, cy]);
      surface.addElement({ type: 'shape', shapeType: 'rect', xywh: `[${x - 60},${y - 40},120,80]` });
      return true;
    }, [tx, ty]);
    await p.waitForTimeout(500);
    ok(placed, 'a shape is put on the phone’s board');
    if (engineName === 'chromium') {
      // A real finger, through the engine's own touch input.
      const cdp = await p.context().newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
      await p.waitForTimeout(900);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      // Playwright can hold a finger down only in Chromium (its touch driver is
      // Chromium's DevTools protocol). Elsewhere the same press and hold is sent
      // as the pointer events a finger makes, to whatever is under that point,
      // so the board's own long-press code still decides. Weaker than a real
      // finger, and said so in the line below.
      const fire = (type) => p.evaluate(([t, x, y]) => {
        const target = document.elementFromPoint(x, y);
        target?.dispatchEvent(new PointerEvent(t, { bubbles: true, composed: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y }));
      }, [type, tx, ty]);
      await fire('pointerdown');
      await p.waitForTimeout(900);
      await fire('pointerup');
    }
    await p.waitForTimeout(700);
    const held = await moreItems(p);
    ok(held.includes('Delete'),
       `a long press with a finger on the shape opens its ⋯ menu${engineName === 'chromium' ? '' : ` (${engineName}: as pointer events, not a real finger)`} (${held.join(', ')})`);
    await phone.close();
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
