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
// 29 October 2026, on phones and tablets: "so hard to delete objects,
// customize, and use the tools when we are trying to tap or double tap." So a
// finger is walked on its own: one tap opens a thing's bar, which has a bin and
// buttons a finger wide; a Tools button; a phone's row of AFFiNE's tools; a
// double-tap that forgives a finger; and the same on an iPad-sized screen.
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
  // The bar's own buttons, as big as a person can press them: the ones in it,
  // not the ones folded inside its menus (those are 0px until opened).
  const buttons = [...bar.children]
    .filter((b) => b.tagName !== 'EDITOR-TOOLBAR-SEPARATOR')
    .map((b) => { const q = b.getBoundingClientRect(); return { label: b.getAttribute('aria-label') || b.tagName.toLowerCase(), w: Math.round(q.width), h: Math.round(q.height) }; })
    .filter((b) => b.w > 0);
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, labels, buttons };
});

/** What a person sees over the board: the dock, the zoom, Undo and Redo, the hint, the Tools button, the row of tools. */
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
    // A touched screen's own: the Tools button, and the row of tools on a phone.
    open: shown('[data-board-open]'),
    tray: shown('[data-board-tray]'),
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
    ok(!clean.open && !clean.tray, 'a mouse gets no Tools button: double-click and right-click are its way in');

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
    ok(bar && bar.labels.includes('More menu') && bar.labels.includes('Lock') && bar.labels.includes('Add text') && bar.labels.includes('Delete'),
       `with Lock, Add text, a bin and ⋮ in it (${bar?.labels.filter(Boolean).join(', ')})`);
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

    // THE BIN ON THE BAR: the same Delete, without opening ⋮.
    await page.mouse.click(empty.x, empty.y);
    await page.waitForTimeout(500);
    await page.mouse.dblclick(shape.cx, shape.cy);
    await page.waitForTimeout(700);
    await page.locator('affine-toolbar-widget editor-icon-button[aria-label="Delete"]').click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    ok(await onTheBoard(page) === n2 - 1, 'the bin on the bar takes it off the board too');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await page.waitForTimeout(600);
    ok(await onTheBoard(page) === n2, 'and Undo brings it back again');

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
    ok(lockedBar && lockedBar.labels.some((l) => /unlock/i.test(l)) && !lockedBar.labels.includes('More menu') && !lockedBar.labels.includes('Delete'),
       `and its bar offers Unlock instead of ⋮ or a bin (${lockedBar?.labels.filter(Boolean).join(', ')})`);

    // THE PAGE'S OWN WRITING: locked, so neither Delete nor ⋮ can take it.
    await page.mouse.click(empty.x, empty.y);
    await page.waitForTimeout(400);
    const note = await page.locator('affine-edgeless-note').first().boundingBox();
    if (note) {
      await page.mouse.dblclick(note.x + 8, note.y + 8);
      await page.waitForTimeout(600);
      const noteBar = await selectionBar(page);
      ok(noteBar && !noteBar.labels.includes('More menu') && !noteBar.labels.includes('Delete'),
         `the page’s writing has no ⋮ with Delete in it, and no bin (${noteBar?.labels.filter(Boolean).join(', ')})`);
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
    // 29 October 2026: "it's pretty bad and clunky for mobile and pad. It's so
    // hard to delete objects, customize, and use the tools when we are trying
    // to tap or double tap." Walked again with a finger on a phone and on an
    // iPad-sized screen (components/study/StudyBoardTools.tsx, A FINGER).
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await phone.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    const p = await phone.newPage();
    const pcaught = pageErrors(p);
    const pbox = await openBoard(p);
    const pclean = await chrome(p);
    ok(!pclean.dock && !pclean.undo && !pclean.tray && pclean.hint && /Tap a thing/.test(await p.locator('[data-board-hint]').innerText()),
       `on a phone the board opens clean too, and the line says to tap a thing (${JSON.stringify(pclean)})`);
    const toolsButton = p.locator('[data-board-open]');
    const openBox = await toolsButton.boundingBox();
    ok(pclean.open && openBox && openBox.height >= 44 && openBox.x + openBox.width <= pbox.x + pbox.width,
       'with one Tools button in the corner, a finger high, inside the board');

    // A FINGER. Chromium takes real touches through its DevTools protocol;
    // elsewhere the same taps are sent as the pointer events a finger makes,
    // to whatever is under that point, so the board's own code still decides.
    // Weaker than a real finger, and said so in the lines below. Buttons are
    // pressed with Playwright's own tap, a touch in every engine.
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

    // A shape put straight onto the canvas: a mouse drag does not draw in a
    // touch browser, and drawing is not what this part is about.
    const put = (page, cx, cy) => page.evaluate(([x0, y0]) => {
      const root = document.querySelector('affine-edgeless-root');
      const gfx = root?.gfx;
      const surface = root?.std?.store?.getAllModels?.().find((b) => b.flavour === 'affine:surface');
      if (!gfx || !surface) return false;
      const [x, y] = gfx.viewport.toModelCoordFromClientCoord([x0, y0]);
      surface.addElement({ type: 'shape', shapeType: 'rect', xywh: `[${x - 40},${y - 30},80,60]` });
      return true;
    }, [cx, cy]);
    const tx = Math.round(pbox.x + pbox.width * 0.75), ty = Math.round(pbox.y + pbox.height * 0.25);
    const pe = emptyAt(pbox);
    const ex = Math.round(pe.x), ey = Math.round(pe.y);
    ok(await put(p, tx, ty), 'a shape is put on the phone’s board');
    await p.waitForTimeout(500);

    // ONE TAP ON A THING: selected, with its bar, and a bin on the bar.
    const pn0 = await onTheBoard(p);
    await touch(tx, ty, 40);
    await p.waitForTimeout(800);
    const pbar = await selectionBar(p);
    ok(pbar && pbar.labels.includes('Delete') && pbar.labels.includes('More menu'),
       `one tap on the shape opens its bar, with a bin and ⋮${how} (${pbar?.labels.filter(Boolean).join(', ')})`);
    ok(pbar && pbar.left >= 0 && pbar.right <= 390, `and the whole bar is on the screen (${pbar ? `${Math.round(pbar.left)}–${Math.round(pbar.right)}px` : '-'} of 390)`);
    const small = (pbar?.buttons ?? []).filter((b) => b.w < 44 || b.h < 44);
    ok(pbar && pbar.buttons.length >= 5 && small.length === 0,
       `every button on it is a finger wide, 44px or more (${small.map((b) => `${b.label} ${b.w}x${b.h}`).join(', ') || `${pbar?.buttons.length} buttons`})`);

    // ⋮ BY FINGER: its choices a finger high.
    await p.locator('affine-toolbar-widget editor-menu-button[aria-label="More menu"]').tap({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(700);
    const heights = await p.locator('affine-toolbar-widget editor-menu-action').evaluateAll((els) => els
      .map((e) => ({ t: e.innerText.trim(), h: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.h > 0));
    ok(heights.length >= 8 && heights.every((x) => x.h >= 44),
       `⋮ opens with a finger, and each choice in it is 44px high or more (${heights.map((x) => `${x.t} ${x.h}`).slice(0, 3).join(', ')}…)`);
    await touch(ex, ey, 40);
    await p.waitForTimeout(600);
    ok(!(await selectionBar(p)), 'a tap on empty board puts the bar away');

    // THE BIN.
    await touch(tx, ty, 40);
    await p.waitForTimeout(800);
    await p.locator('affine-toolbar-widget editor-icon-button[aria-label="Delete"]').tap({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(700);
    ok(await onTheBoard(p) === pn0 - 1, `the bin on the bar takes it off the board in one tap${how}`);

    // THE TOOLS BUTTON: on a phone, AFFiNE's tools as one row, named.
    // Tolerant, so a missing button fails the lines below rather than ending
    // the walk: then the row of tools is opened the other way, a double-tap.
    if (!(await toolsButton.tap({ timeout: 5000 }).then(() => true).catch(() => false))) await doubleTap(ex, ey);
    await p.waitForTimeout(800);
    const ptools = await chrome(p);
    ok(ptools.tray && !ptools.dock && ptools.undo && !ptools.open,
       `Tools brings a row of tools, with Undo, and the button steps aside (${JSON.stringify(ptools)})`);
    const tray = await p.locator('[data-board-tray] button').evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { word: e.innerText.trim(), w: Math.round(r.width), h: Math.round(r.height), left: r.left, right: r.right };
    }));
    ok(['Select', 'Pen', 'Eraser', 'Shape', 'Note', 'Text', 'More'].every((w) => tray.some((t) => t.word === w)),
       `the row has Select, Pen, Eraser, Shape, Note, Text and More (${tray.map((t) => t.word).join(', ')})`);
    ok(tray.every((t) => t.w >= 44 && t.h >= 44 && t.left >= pbox.x && t.right <= pbox.x + pbox.width),
       `every one a finger wide and inside the board (${tray.map((t) => `${t.w}x${t.h}`).join(' ')})`);
    await p.getByRole('button', { name: 'Undo', exact: true }).tap({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(600);
    ok(await onTheBoard(p) === pn0, 'and Undo brings back what the bin took');

    // A TOOL FROM THE ROW: Shape, then a tap on the board puts one there.
    const pn1 = await onTheBoard(p);
    await p.locator('[data-board-tray] button', { hasText: 'Shape' }).tap({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(400);
    ok(await p.locator('[data-board-tray] button', { hasText: 'Shape' }).getAttribute('aria-pressed') === 'true',
       'Shape in the row shows it is the tool in use');
    await touch(Math.round(pbox.x + pbox.width * 0.3), Math.round(pbox.y + pbox.height * 0.55), 40);
    await p.waitForTimeout(900);
    ok(await onTheBoard(p) === pn1 + 1, `a tap on the board with it puts a shape there${how}`);
    ok(await p.locator('[data-board-tray] button', { hasText: 'Select' }).getAttribute('aria-pressed') === 'true' && !!(await selectionBar(p)),
       `and AFFiNE goes back to Select, with the new shape's bar open to change it${how}`);

    // MORE: AFFiNE's own dock, with everything else.
    await touch(ex, ey, 40);
    await p.waitForTimeout(500);
    await p.locator('[data-board-tray] button', { hasText: 'More' }).tap({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(800);
    const pfull = await chrome(p);
    ok(pfull.dock && !pfull.tray, `More in the row brings AFFiNE's own dock in its place (${JSON.stringify(pfull)})`);
    ok(!pfull.zoom, 'the zoom control stays away on a phone; two fingers zoom');
    await p.getByRole('button', { name: 'Hide tools' }).tap({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(500);
    const phidden = await chrome(p);
    ok(!phidden.dock && !phidden.tray && phidden.open, `Hide tools puts them away, and the Tools button is back (${JSON.stringify(phidden)})`);

    // A DOUBLE-TAP THAT FORGIVES A FINGER: 28px apart, 200ms apart.
    await touch(ex, ey, 40);
    await p.waitForTimeout(200);
    await touch(ex + 26, ey - 10, 40);
    await p.waitForTimeout(800);
    ok((await chrome(p)).tray, `two taps a finger's width apart still count as a double-tap${how}`);
    await p.getByRole('button', { name: 'Hide tools' }).tap({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(400);

    // A DOUBLE-TAP AND A LONG PRESS on a thing, as before.
    await doubleTap(tx, ty);
    await p.waitForTimeout(800);
    const pbar2 = await selectionBar(p);
    ok(pbar2 && pbar2.labels.includes('More menu'), `a double-tap on the shape opens its bar with ⋮ too${how} (${pbar2?.labels.filter(Boolean).join(', ')})`);
    await touch(ex, ey, 40);
    await p.waitForTimeout(600);
    await touch(tx, ty, 900);
    await p.waitForTimeout(700);
    const held = await moreItems(p);
    ok(held.includes('Delete'), `a long press with a finger on the shape opens its ⋮ menu${how} (${held.join(', ')})`);
    const perrors = pcaught.list();
    ok(perrors.length === 0, `no page errors on the phone${perrors.length ? `: ${perrors.slice(0, 2).join(' | ')}` : ''}`);
    await phone.close();

    // ---------------------------------------------------------------- tablet
    // An iPad-sized screen, touched: the same one tap and bin, and AFFiNE's own
    // dock, which fits there, with the zoom control off its left end.
    const pad = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
    await pad.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    const t = await pad.newPage();
    const tbox = await openBoard(t);
    const tcdp = engineName === 'chromium' ? await t.context().newCDPSession(t) : null;
    const ttap = async (x, y) => {
      if (tcdp) {
        await tcdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await t.waitForTimeout(40);
        await tcdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        return;
      }
      for (const type of ['pointerdown', 'pointerup']) {
        await t.evaluate(([ty2, px, py]) => {
          document.elementFromPoint(px, py)?.dispatchEvent(new PointerEvent(ty2, { bubbles: true, composed: true, cancelable: true, pointerId: 8, pointerType: 'touch', isPrimary: true, clientX: px, clientY: py }));
        }, [type, x, y]);
        await t.waitForTimeout(40);
      }
    };
    const sx = Math.round(tbox.x + tbox.width * 0.75), sy = Math.round(tbox.y + tbox.height * 0.25);
    await put(t, sx, sy);
    await t.waitForTimeout(500);
    await ttap(sx, sy);
    await t.waitForTimeout(800);
    const tbar = await selectionBar(t);
    ok(tbar && tbar.labels.includes('Delete') && tbar.left >= 0 && tbar.right <= 820 && (tbar.buttons ?? []).every((b) => b.w >= 44 && b.h >= 44),
       `on a tablet one tap opens the bar too, a finger's size, with the bin${how} (${tbar?.labels.filter(Boolean).join(', ')})`);
    await t.locator('[data-board-open]').tap({ timeout: 5000 }).catch(() => {});
    await t.waitForTimeout(800);
    const ttools = await chrome(t);
    ok(ttools.dock && !ttools.tray && !ttools.zoom,
       `and Tools brings AFFiNE's own dock, which fits a tablet, without the zoom control on it (${JSON.stringify(ttools)})`);
    await pad.close();
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
