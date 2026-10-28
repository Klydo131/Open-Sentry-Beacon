// The whiteboard is clean until asked, and then its tools are AFFiNE's own.
//
// 27 October 2026: "if I right click on it there are no option for me to
// delete objects, options to modify, or edit it." 28 October 2026: "I want the
// 3 dots to be back once I click an object". AFFiNE has that bar
// (affine-toolbar-widget); it never opened here because the room never told
// AFFiNE it was a whiteboard (lib/study/view-extensions.ts).
//
// Then, the same day: "tools will only appear when you double tap an object or
// the board (or right click in desktop). I want the board to be clean as
// possible." So the board opens with nothing over it but one line saying how
// to find the tools, and components/study/StudyBoardTools.tsx decides when
// AFFiNE's dock and AFFiNE's bar show.
//
// Walked as a person would, in Simple, with a mouse and then a finger: a clean
// board; a double-click for the dock, which makes no text box; a shape; a
// single click that selects it without a bar; a double-click for its bar, ⋮,
// Duplicate, Delete and Undo; right-clicks; Lock; the page's own writing that
// cannot be deleted by accident; Escape, a second double-click and Hide tools
// to put the dock away; and on a phone a double-tap and a long press.
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

/**
 * AFFiNE's bar over the selection, and the labels of its buttons -- if a person
 * can see it. AFFiNE keeps it open for any selection; the room shows it only
 * when asked, so an open bar the room has hidden counts as no bar.
 */
const selectionBar = (page) => page.evaluate(() => {
  const widget = document.querySelector('affine-toolbar-widget');
  const bar = widget?.shadowRoot?.querySelector('editor-toolbar');
  if (!bar || !bar.dataset.open || getComputedStyle(widget).display === 'none') return null;
  const r = bar.getBoundingClientRect();
  const labels = [...bar.querySelectorAll('editor-icon-button, editor-menu-button')].map((b) => b.getAttribute('aria-label') || '');
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, labels };
});

/** What a person sees over the board: the dock, the zoom, Undo and Redo, the hint. */
const chrome = (page) => page.evaluate(() => {
  const shown = (sel) => {
    const el = document.querySelector(sel);
    const style = el && getComputedStyle(el);
    if (!el || style.display === 'none' || style.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  return {
    dock: shown('edgeless-toolbar-widget'),
    zoom: shown('affine-edgeless-zoom-toolbar-widget'),
    undo: shown('.sr-board-history'),
    hint: shown('[data-board-hint]'),
  };
});

/** AFFiNE's text boxes: a double-click on empty board makes one, left to itself. */
const textBoxes = (page) => page.evaluate(() => (document.querySelector('editor-host')?.std?.store?.getAllModels?.() ?? [])
  .filter((b) => b.flavour === 'affine:edgeless-text').length);

/** What is selected on the board, by id. */
const selected = (page) => page.evaluate(() => [...(document.querySelector('affine-edgeless-root')?.gfx?.selection?.selectedIds ?? [])]);

/** The choices in AFFiNE's ⋯ menu, if it is open. */
const moreItems = async (page) => (await page.locator('affine-toolbar-widget editor-menu-action').allInnerTexts().catch(() => []))
  .map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);

async function openBoard(page) {
  await signInAsExplorer(page, BASE);
  await openStudyRoom(page, BASE, 'simple');
  await newPage(page);
  await page.getByRole('button', { name: /^Whiteboard$/ }).click();
  await page.waitForSelector('affine-edgeless-root', { timeout: 60_000 });
  await page.waitForSelector('[data-board-frame]', { timeout: 30_000 });
  await page.waitForTimeout(1200);
  return page.locator('.sr-board-frame').boundingBox();
}

/** Draw one shape with AFFiNE's own key, S, then back to Select; returns its box. */
async function drawShape(page, box) {
  // To the right of the card with the page's writing, which sits in the
  // middle of a new board.
  const cx = box.x + box.width * 0.8, cy = box.y + box.height * 0.3;
  await page.mouse.click(box.x + box.width - 40, box.y + box.height - 40);
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

/** A spot of empty board, away from the page's card in the middle. */
const emptyAt = (box) => ({ x: box.x + box.width * 0.15, y: box.y + box.height * 0.78 });

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
    const empty = emptyAt(box);

    // A CLEAN BOARD.
    const clean = await chrome(page);
    ok(!clean.dock && !clean.zoom && !clean.undo && !(await selectionBar(page)),
       `the board opens clean: no dock, zoom, Undo or bar over it (${JSON.stringify(clean)})`);
    ok(clean.hint && /Double-click or right-click/.test(await page.locator('[data-board-hint]').innerText()),
       'and one quiet line says how to find the tools');
    ok(await page.locator('[data-board-tools], .sr-board-bar').count() === 0,
       'the room’s old bar of pictures and words is still gone');

    const writing = await pageWriting(page);
    ok(writing.count === 1 && writing.locked, `the card with the page’s writing is locked on the board (${JSON.stringify(writing)})`);

    // AFFiNE'S KEYS WORK WITH THE DOCK PUT AWAY: S, and a drag, is a shape.
    // Taken out of the page rather than made invisible, the dock took its
    // keys with it (28 October 2026).
    const k0 = await onTheBoard(page);
    await page.mouse.click(box.x + box.width * 0.15, box.y + box.height * 0.3);
    await page.keyboard.press('s');
    await page.waitForTimeout(400);
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.32, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.keyboard.press('v');
    await page.waitForTimeout(300);
    ok(await onTheBoard(page) === k0 + 1 && !(await chrome(page)).dock,
       'with the dock put away, AFFiNE’s S key still draws a shape');

    // A DOUBLE-CLICK ON EMPTY BOARD: AFFiNE's dock, and no text box.
    const n0 = await onTheBoard(page);
    const t0 = await textBoxes(page);
    await page.mouse.dblclick(empty.x, empty.y);
    await page.waitForTimeout(700);
    const open = await chrome(page);
    ok(open.dock && open.undo && !open.hint, `a double-click on empty board brings AFFiNE’s dock, with Undo and Redo (${JSON.stringify(open)})`);
    ok(await onTheBoard(page) === n0 && await textBoxes(page) === t0,
       `and makes no text box, which is what AFFiNE alone would do there (${await textBoxes(page) - t0} made)`);
    ok(await page.getByRole('button', { name: 'Hide tools' }).isVisible() && await page.getByRole('button', { name: 'Redo' }).isVisible(),
       'beside it, Redo and Hide tools');

    // A DOUBLE-CLICK WITH THE PEN IS DRAWING, not a request for the tools.
    await page.keyboard.press('p');
    await page.waitForTimeout(300);
    await page.mouse.dblclick(empty.x + 40, empty.y - 40);
    await page.waitForTimeout(500);
    ok((await chrome(page)).dock, 'a double-click with the pen leaves the dock where it was');
    await page.keyboard.press('Escape');
    await page.keyboard.press('v');
    await page.waitForTimeout(300);
    const n0b = await onTheBoard(page);

    // A SHAPE, with the dock open; Escape finishing the tool leaves the dock.
    const shape = await drawShape(page, box);
    ok(await onTheBoard(page) === n0b + 1, 'a shape is drawn with AFFiNE’s own tool');
    ok((await chrome(page)).dock, 'and the Escape that finished the tool left the dock open');

    // ONE CLICK SELECTS; IT DOES NOT OPEN THE BAR.
    await page.mouse.click(empty.x, empty.y);
    await page.waitForTimeout(500);
    await page.mouse.click(shape.cx, shape.cy);
    await page.waitForTimeout(700);
    ok((await selected(page)).length === 1 && !(await selectionBar(page)),
       'one click on the shape selects it, with no bar over the board');
    // ESCAPE WITH SOMETHING SELECTED IS AFFiNE'S: it lets go of the shape, and
    // the dock stays. Read after AFFiNE, the board would already look empty
    // and the dock would go with the same key.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    ok((await selected(page)).length === 0 && (await chrome(page)).dock,
       'Escape lets go of the shape and leaves the dock open');

    // A DOUBLE-CLICK OPENS ITS BAR, WITH ⋮.
    await page.mouse.click(empty.x, empty.y);
    await page.waitForTimeout(500);
    await page.mouse.dblclick(shape.cx, shape.cy);
    await page.waitForTimeout(800);
    const bar = await selectionBar(page);
    ok(!!bar, 'a double-click on the shape opens its bar');
    ok(bar && bar.right > shape.left && bar.left < shape.right && (bar.bottom <= shape.top + 4 || bar.top >= shape.bottom - 4)
       && Math.min(Math.abs(shape.top - bar.bottom), Math.abs(bar.top - shape.bottom)) < 80,
       `and the bar floats next to the shape (${bar ? Math.round(bar.top) : '-'}px, shape at ${Math.round(shape.top)}px)`);
    ok(bar && bar.labels.includes('More menu') && bar.labels.includes('Lock') && bar.labels.includes('Add text'),
       `with Lock, Add text and ⋮ in it (${bar?.labels.filter(Boolean).join(', ')})`);
    ok(await page.locator('edgeless-shape-text-editor').count() === 0,
       'and the double-click did not start typing in the shape instead (Add text does that)');

    await page.locator('affine-toolbar-widget editor-menu-button[aria-label="More menu"]').click();
    await page.waitForTimeout(500);
    const items = await moreItems(page);
    ok(['Bring to Front', 'Send to Back', 'Copy', 'Duplicate', 'Delete'].every((w) => items.includes(w)),
       `⋮ opens the choices for it (${items.join(', ')})`);

    // DUPLICATE.
    const n1 = await onTheBoard(page);
    await page.locator('affine-toolbar-widget editor-menu-action', { hasText: /^\s*Duplicate\s*$/ }).click();
    await page.waitForTimeout(700);
    ok(await onTheBoard(page) === n1 + 1, 'Duplicate makes a copy');

    // DELETE, THEN UNDO ON THE ROOM'S OWN BUTTON.
    await page.mouse.click(empty.x, empty.y);
    await page.waitForTimeout(500);
    await page.mouse.dblclick(shape.cx, shape.cy);
    await page.waitForTimeout(700);
    await page.locator('affine-toolbar-widget editor-menu-button[aria-label="More menu"]').click();
    await page.waitForTimeout(400);
    const n2 = await onTheBoard(page);
    await page.locator('affine-toolbar-widget editor-menu-action', { hasText: /^\s*Delete\s*$/ }).click();
    await page.waitForTimeout(600);
    ok(await onTheBoard(page) === n2 - 1, 'Delete in ⋮ takes it off the board');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.waitForTimeout(600);
    ok(await onTheBoard(page) === n2, 'and the Undo button beside the dock brings it back');

    // A CLICK ON EMPTY BOARD PUTS THE BAR AWAY.
    await page.mouse.click(empty.x, empty.y);
    await page.waitForTimeout(500);
    ok(!(await selectionBar(page)), 'a click on empty board puts the bar away');

    // RIGHT-CLICK ON THE SHAPE: its ⋮ menu, already open.
    await page.mouse.click(shape.cx, shape.cy, { button: 'right' });
    await page.waitForTimeout(700);
    const right = await moreItems(page);
    ok(right.includes('Duplicate') && right.includes('Delete'), `right-click on the shape opens its ⋮ menu (${right.join(', ')})`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await page.mouse.click(empty.x, empty.y);
    await page.waitForTimeout(300);

    // LOCK: a locked shape does not go with the Delete key.
    await page.mouse.dblclick(shape.cx, shape.cy);
    await page.waitForTimeout(600);
    await page.locator('affine-toolbar-widget editor-icon-button[aria-label="Lock"]').click();
    await page.waitForTimeout(500);
    const n3 = await onTheBoard(page);
    await page.keyboard.press('Delete');
    await page.waitForTimeout(500);
    ok(await onTheBoard(page) === n3, 'a locked shape stays when Delete is pressed');
    const lockedBar = await selectionBar(page);
    ok(lockedBar && lockedBar.labels.some((l) => /unlock/i.test(l)) && !lockedBar.labels.includes('More menu'),
       `and its bar offers Unlock instead of ⋮ (${lockedBar?.labels.filter(Boolean).join(', ')})`);

    // THE PAGE'S OWN WRITING: locked, so neither Delete nor ⋮ can take it.
    await page.mouse.click(empty.x, empty.y);
    await page.waitForTimeout(400);
    const note = await page.locator('affine-edgeless-note').first().boundingBox();
    if (note) {
      await page.mouse.dblclick(note.x + 8, note.y + 8);
      await page.waitForTimeout(600);
      const noteBar = await selectionBar(page);
      ok(noteBar && !noteBar.labels.includes('More menu'), `the page’s writing has no ⋮ with Delete in it (${noteBar?.labels.filter(Boolean).join(', ')})`);
      await page.keyboard.press('Delete');
      await page.waitForTimeout(500);
      ok((await pageWriting(page)).count === 1, 'and the Delete key leaves it where it is');
    } else {
      ok(false, 'the page’s writing is on the board as a card');
    }

    // RIGHT-CLICK ON EMPTY BOARD: the board's own menu.
    await page.mouse.click(empty.x, empty.y);
    await page.waitForTimeout(400);
    await page.mouse.click(empty.x, empty.y - 60, { button: 'right' });
    await page.waitForTimeout(400);
    const boardItems = (await page.getByRole('menuitem').allInnerTexts()).map((t) => t.trim());
    ok(['Undo', 'Redo', 'Select everything', 'Show everything'].every((w) => boardItems.includes(w)) && (await chrome(page)).dock,
       `right-click on empty board offers the board’s own choices, with the dock (${boardItems.join(', ')})`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // PUTTING THE TOOLS AWAY: Escape, a second double-click, Hide tools.
    ok((await chrome(page)).dock, 'Escape closes that menu first, and the dock stays');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    ok(!(await chrome(page)).dock, 'Escape again, with nothing selected, puts the dock away');
    await page.mouse.dblclick(empty.x, empty.y);
    await page.waitForTimeout(600);
    await page.mouse.dblclick(empty.x, empty.y);
    await page.waitForTimeout(600);
    ok(!(await chrome(page)).dock, 'a second double-click on empty board puts it away too');
    await page.mouse.dblclick(empty.x, empty.y);
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Hide tools' }).click();
    await page.waitForTimeout(400);
    const hidden = await chrome(page);
    ok(!hidden.dock && !hidden.undo && !hidden.hint,
       `and so does Hide tools, and the line about finding them does not come back (${JSON.stringify(hidden)})`);
    ok(await onTheBoard(page) === n3 && await textBoxes(page) === t0, 'none of those double-clicks made a text box');

    // UNDO EVERYTHING. Neither the page's own skeleton nor the lock on its
    // writing is something anybody did, so neither is in the history: until
    // 28 October 2026 enough presses of Undo on a new page took the page apart.
    await page.mouse.dblclick(empty.x, empty.y);
    await page.waitForTimeout(600);
    const undoButton = page.getByRole('button', { name: 'Undo', exact: true });
    for (let i = 0; i < 40 && await undoButton.isEnabled(); i++) {
      await undoButton.click();
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
    const pclean = await chrome(p);
    ok(!pclean.dock && !pclean.undo && pclean.hint && /Double-tap the board/.test(await p.locator('[data-board-hint]').innerText()),
       `on a phone the board opens clean too, and the line says double-tap (${JSON.stringify(pclean)})`);

    // A FINGER. Chromium takes real touches through its DevTools protocol;
    // elsewhere the same taps are sent as the pointer events a finger makes,
    // to whatever is under that point, so the board's own code still decides.
    // Weaker than a real finger, and said so in the lines below.
    const cdp = engineName === 'chromium' ? await p.context().newCDPSession(p) : null;
    const how = engineName === 'chromium' ? '' : ` (${engineName}: as pointer events, not a real finger)`;
    const touch = async (x, y, holdMs) => {
      if (cdp) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await p.waitForTimeout(holdMs);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        return;
      }
      const fire = (type) => p.evaluate(([t, px, py]) => {
        const target = document.elementFromPoint(px, py);
        target?.dispatchEvent(new PointerEvent(t, { bubbles: true, composed: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py }));
      }, [type, x, y]);
      await fire('pointerdown');
      await p.waitForTimeout(holdMs);
      await fire('pointerup');
    };
    const doubleTap = async (x, y) => { await touch(x, y, 40); await p.waitForTimeout(90); await touch(x, y, 40); };

    const pe = emptyAt(pbox);
    await doubleTap(Math.round(pe.x), Math.round(pe.y));
    await p.waitForTimeout(700);
    const ptools = await chrome(p);
    const dockBox = await p.locator('edgeless-toolbar-widget').boundingBox();
    ok(ptools.dock && dockBox && dockBox.x >= pbox.x - 1 && dockBox.x + dockBox.width <= pbox.x + pbox.width + 1,
       `a double-tap on empty board brings the dock, inside the board${how} (${Math.round(dockBox?.width ?? 0)}px of ${Math.round(pbox.width)}px)`);
    const undo = await p.getByRole('button', { name: 'Undo', exact: true }).boundingBox().catch(() => null);
    ok(undo && undo.x >= pbox.x && undo.y >= pbox.y && undo.width >= 44, 'and Undo is on the board, big enough for a thumb');
    ok(!ptools.zoom, 'the zoom control stays away on a phone; two fingers zoom');

    // A shape put straight onto the canvas: a mouse drag does not draw in a
    // touch browser, and drawing is not what this part is about.
    const tx = Math.round(pbox.x + pbox.width * 0.75), ty = Math.round(pbox.y + pbox.height * 0.25);
    const placed = await p.evaluate(([cx, cy]) => {
      const root = document.querySelector('affine-edgeless-root');
      const gfx = root?.gfx;
      const surface = root?.std?.store?.getAllModels?.().find((b) => b.flavour === 'affine:surface');
      if (!gfx || !surface) return false;
      const [x, y] = gfx.viewport.toModelCoordFromClientCoord([cx, cy]);
      surface.addElement({ type: 'shape', shapeType: 'rect', xywh: `[${x - 40},${y - 30},80,60]` });
      return true;
    }, [tx, ty]);
    await p.waitForTimeout(500);
    ok(placed, 'a shape is put on the phone’s board');

    await doubleTap(tx, ty);
    await p.waitForTimeout(800);
    const pbar = await selectionBar(p);
    ok(pbar && pbar.labels.includes('More menu'), `a double-tap on the shape opens its bar with ⋮${how} (${pbar?.labels.filter(Boolean).join(', ')})`);

    await touch(Math.round(pe.x), Math.round(pe.y), 40);
    await p.waitForTimeout(600);
    await touch(tx, ty, 900);
    await p.waitForTimeout(700);
    const held = await moreItems(p);
    ok(held.includes('Delete'), `a long press with a finger on the shape opens its ⋮ menu${how} (${held.join(', ')})`);
    await phone.close();
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
