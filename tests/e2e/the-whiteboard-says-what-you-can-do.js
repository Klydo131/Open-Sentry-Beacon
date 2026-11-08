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
const { browser: engine, engineName, launchOptions, pageErrors, isCancelledPrefetch } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, newPage } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
let bad = 0;
// The last check made, so a page error can say which step it followed. Under
// WebKit the phone raises "ResizeObserver loop completed with undelivered
// notifications" about ten seconds into its board (Safari CI, 29 October to
// 2 November 2026), and neither its own log nor the checks said at which step.
let lastCheck = 'before the first check';
const ok = (c, m) => { if (!c) bad++; lastCheck = m; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };
/** Every page error with the step it followed, for the report only: what counts is pageErrors. */
const errorsAfterSteps = (page) => {
  const seen = [];
  page.on('pageerror', (err) => {
    // The same rule as pageErrors, so the report names what is counted.
    if (isCancelledPrefetch(String(err))) return;
    seen.push(`${String(err).split('\n')[0]} (after "${lastCheck.slice(0, 90)}")`);
  });
  return seen;
};

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

/** The four join handles around a selected note, by side, where a person sees them. */
const joinHandles = (page) => page.evaluate(() => {
  const found = {};
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (el.dataset?.join) { const r = el.getBoundingClientRect(); found[el.dataset.join] = { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }
      if (el.shadowRoot) walk(el.shadowRoot);
    }
  };
  walk(document);
  return found;
});

/** Notes and lines on the board, and which notes lie on top of each other. */
const notesAndLines = (page) => page.evaluate(() => {
  const models = document.querySelector('editor-host')?.std?.store?.getAllModels?.() ?? [];
  const surface = models.find((b) => b.flavour === 'affine:surface');
  const boxes = models.filter((b) => b.flavour === 'affine:note').map((n) => JSON.parse(n.xywh));
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const [a, b] = [boxes[i], boxes[j]];
    if (a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]) overlaps++;
  }
  const lines = (surface?.elementModels ?? []).filter((e) => e.type === 'connector');
  return { notes: boxes.length, lines: lines.length, overlaps, joined: lines.map((c) => [c.source?.id, c.target?.id]) };
});

/** A sticky note put straight on the board around a point on the screen; returns its id. */
const putNote = (page, x0, y0) => page.evaluate(([cx, cy]) => {
  const root = document.querySelector('affine-edgeless-root');
  const [x, y] = root.gfx.viewport.toModelCoordFromClientCoord([cx, cy]);
  const store = root.std.store;
  const id = store.addBlock('affine:note', { xywh: `[${x - 90},${y - 35},180,70]`, displayMode: 'edgeless' }, store.root.id);
  store.addBlock('affine:paragraph', { type: 'text' }, id);
  return id;
}, [x0, y0]);

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

    // A NOTE'S HANDLES WITH A MOUSE (8 November 2026): a click on one makes a
    // joined note, in view, and on nothing else; a drag joins two notes.
    await page.keyboard.press('Escape');
    const nA = { x: box.x + box.width * 0.12, y: box.y + box.height * 0.18 };
    const nB = { x: box.x + box.width * 0.6, y: box.y + box.height * 0.18 };
    const idA = await putNote(page, nA.x, nA.y);
    const idB = await putNote(page, nB.x, nB.y);
    await page.waitForTimeout(400);
    await page.mouse.click(nA.x, nA.y);
    await page.waitForTimeout(600);
    let hj = await joinHandles(page);
    ok(['top', 'right', 'bottom', 'left'].every((k) => hj[k]), `a clicked note shows a handle on all four sides (${Object.keys(hj).join(', ')})`);
    const m0 = await notesAndLines(page);
    if (hj.left) await page.mouse.click(hj.left.x, hj.left.y);
    await page.waitForTimeout(900);
    const m1 = await notesAndLines(page);
    const made = await page.evaluate(() => {
      const root = document.querySelector('affine-edgeless-root');
      const id = [...(root?.gfx?.selection?.selectedIds ?? [])][0];
      const el = id && root.gfx.getElementById(id);
      if (!el) return null;
      const [x, y] = root.gfx.viewport.toViewCoord(el.elementBound.x, el.elementBound.y);
      const [x2, y2] = root.gfx.viewport.toViewCoord(el.elementBound.x + el.elementBound.w, el.elementBound.y + el.elementBound.h);
      const v = root.getBoundingClientRect();
      return { inView: x >= 0 && y >= 0 && x2 <= v.width && y2 <= v.height };
    });
    ok(m1.notes === m0.notes + 1 && m1.lines === m0.lines + 1 && m1.overlaps === m0.overlaps,
       `a click on its left handle makes a joined note, on top of nothing (notes ${m0.notes}→${m1.notes}, lines ${m0.lines}→${m1.lines}, overlaps ${m1.overlaps})`);
    ok(made && made.inView, 'and the board moves so the new note, made past its edge, is all in view');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const aNow = await page.evaluate((id) => {
      const root = document.querySelector('affine-edgeless-root');
      const b = root.gfx.getElementById(id).elementBound;
      const [x, y] = root.gfx.viewport.toViewCoord(b.x + b.w / 2, b.y + b.h / 2);
      const v = root.getBoundingClientRect();
      return { x: v.left + x, y: v.top + y };
    }, idA);
    const bNow = await page.evaluate((id) => {
      const root = document.querySelector('affine-edgeless-root');
      const b = root.gfx.getElementById(id).elementBound;
      const [x, y] = root.gfx.viewport.toViewCoord(b.x + b.w / 2, b.y + b.h / 2);
      const v = root.getBoundingClientRect();
      return { x: v.left + x, y: v.top + y };
    }, idB);
    await page.mouse.click(aNow.x, aNow.y);
    await page.waitForTimeout(600);
    hj = await joinHandles(page);
    if (hj.right) {
      await page.mouse.move(hj.right.x, hj.right.y);
      await page.mouse.down();
      await page.mouse.move(bNow.x - 30, bNow.y, { steps: 15 });
      await page.mouse.move(bNow.x, bNow.y, { steps: 5 });
      await page.mouse.up();
    }
    await page.waitForTimeout(800);
    ok((await notesAndLines(page)).joined.some(([a, b]) => a === idA && b === idB), 'a drag from its right handle to another note joins the two');

    // RIGHT-CLICK ON A NOTE (8 November 2026): its bar, as for a shape. The
    // right press used to put the caret in the note's text, and a note being
    // written in shows no bar, so nothing opened.
    await page.keyboard.press('Escape');
    await page.mouse.click(empty.x, empty.y);
    await page.waitForTimeout(300);
    await page.mouse.click(bNow.x, bNow.y, { button: 'right' });
    await page.waitForTimeout(900);
    const rbar = await selectionBar(page);
    const inText = await page.evaluate(() => document.querySelector('affine-edgeless-root')?.gfx?.selection?.editing === true);
    ok(rbar && rbar.labels.includes('More menu') && !inText,
       `right-click on a note opens its bar, not its text (${rbar ? rbar.labels.filter(Boolean).join(', ') : 'no bar'}${inText ? '; in its text' : ''})`);
    await page.keyboard.press('Escape');

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
    const pwhen = errorsAfterSteps(p);
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
    const moreList = await p.locator('affine-toolbar-widget editor-menu-button[aria-label="More menu"] > div[data-orientation="vertical"]')
      .evaluate((el) => Math.round(el.getBoundingClientRect().bottom)).catch(() => null);
    ok(moreList !== null && moreList <= 844, `and the list ends on the screen, scrolling for the rest (bottom at ${moreList}px of 844)`);
    await touch(ex, ey, 40);
    await p.waitForTimeout(600);
    ok(!(await selectionBar(p)), 'a tap on empty board puts the bar away');

    // ITS COLOURS BY FINGER: the palette AFFiNE opens from the bar.
    await touch(tx, ty, 40);
    await p.waitForTimeout(800);
    // THE COLOURS ARE A FINGER WIDE FROM THEIR FIRST FRAME (3 November 2026).
    // Under WebKit a tap of a colour raised a ResizeObserver loop, and the
    // likeliest cause was the finger sizes arriving a frame or 250ms late, so
    // they are now handed over as AFFiNE adds each part (watchForFingers).
    // This guards the result. It is NOT the proof of that fix: on Chromium the
    // old timers also had the colours at 44px by their first frame, so this
    // passed before the change too. Safari CI is the test of the fix.
    await p.evaluate(() => {
      // Only the palette's colours: the bar's own button shows the current
      // colour as a small circle of the same kind, and that one stays small.
      const deep = (root, inPanel = false, out = []) => {
        for (const el of root.querySelectorAll('*')) {
          if (inPanel && el.localName === 'edgeless-color-button') out.push(el);
          if (el.shadowRoot) deep(el.shadowRoot, inPanel || el.localName === 'edgeless-color-panel', out);
        }
        return out;
      };
      window.__firstSwatch = null;
      const started = performance.now();
      const look = () => {
        const found = deep(document).map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
        if (found.length) { window.__firstSwatch = Math.round(Math.min(...found.map((r) => r.width))); return; }
        if (performance.now() - started < 3000) requestAnimationFrame(look);
      };
      requestAnimationFrame(look);
    });
    await p.locator('affine-toolbar-widget edgeless-shape-color-picker').tap({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(800);
    const firstSwatch = await p.evaluate(() => window.__firstSwatch);
    ok(firstSwatch !== null && firstSwatch >= 44,
       `the colours are a finger wide on the first frame they are drawn, not grown afterwards (${firstSwatch}px)`);
    const swatches = await p.locator('affine-toolbar-widget edgeless-color-panel edgeless-color-button').evaluateAll((els) => els
      .map((e) => { const r = e.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), right: r.right }; })
      .filter((x) => x.w > 0));
    ok(swatches.length >= 12 && swatches.every((x) => x.w >= 44 && x.h >= 44 && x.right <= 390),
       `the colours open with a finger, each 44px or more and on the screen (${swatches.length} colours, ${swatches.slice(0, 2).map((x) => `${x.w}x${x.h}`).join(', ')}…)`);
    const pickers = await p.locator('affine-toolbar-widget edgeless-shape-color-picker').evaluate((el) => {
      const list = el.shadowRoot?.querySelector('[data-orientation="vertical"]');
      if (!list) return null;
      const r = list.getBoundingClientRect();
      return { bottom: Math.round(r.bottom), scrolls: list.scrollHeight > list.clientHeight && getComputedStyle(list).overflowY === 'auto' };
    }).catch(() => null);
    ok(pickers && pickers.bottom <= 844 && pickers.scrolls,
       `and the colours that do not fit under the bar scroll, ending on the screen (${JSON.stringify(pickers)})`);
    ok(!(await chrome(p)).open, 'with a thing\'s bar open, the Tools button stands aside so nothing opens under it');
    // A COLOUR, PICKED BY FINGER, paints it. In WebKit a tap on AFFiNE's bar
    // sent no click until the room pressed it itself (StudyBoardTools.tsx).
    const fillOf = () => p.evaluate(() => {
      const gfx = document.querySelector('affine-edgeless-root')?.gfx;
      const id = [...(gfx?.selection?.selectedIds ?? [])][0];
      return JSON.stringify(id ? gfx.getElementById(id)?.fillColor ?? null : null);
    });
    const fillBefore = await fillOf();
    await p.locator('affine-toolbar-widget edgeless-color-panel edgeless-color-button').nth(3).tap({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(600);
    const fillAfter = await fillOf();
    ok(fillBefore !== 'null' && fillAfter !== fillBefore, `a finger's tap on a colour paints the shape with it (${fillBefore} to ${fillAfter})`);
    await touch(ex, ey, 40);
    await p.waitForTimeout(600);

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

    // MORE MEANS MORE TOOLS (8 November 2026): a second row with the tools the
    // first has not got, and Less to fold it away, the first row unmoved.
    await touch(ex, ey, 40);
    await p.waitForTimeout(500);
    const rowAt = async () => p.locator('[data-board-tray] button', { hasText: 'Select' }).boundingBox();
    const before = await rowAt();
    await p.locator('[data-board-tray] button', { hasText: 'More' }).tap({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(500);
    const words = async () => (await p.locator('[data-board-tray] button').allInnerTexts()).map((t) => t.trim());
    const withMore = await words();
    ok(['Move', 'Line', 'Marker', 'Frame', 'Less'].every((w) => withMore.includes(w)) && !withMore.includes('More'),
       `More opens a second row of tools the first has not got, and becomes Less (${withMore.join(', ')})`);
    const after = await rowAt();
    ok(before && after && Math.abs(before.y - after.y) < 2, 'and the first row stays where the thumb left it');
    const toolNow = () => p.evaluate(() => document.querySelector('affine-edgeless-root')?.gfx?.tool?.currentToolName$?.value);
    const picked = [];
    for (const [word, name] of [['Line', 'connector'], ['Marker', 'highlighter'], ['Frame', 'frame'], ['Move', 'pan']]) {
      await p.locator('[data-board-tray] button', { hasText: word }).tap({ timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(250);
      picked.push(`${word}=${await toolNow()}`);
      if ((await toolNow()) !== name) picked.push('(wrong)');
    }
    ok(!picked.includes('(wrong)'), `each of them is a real tool of AFFiNE's (${picked.join(', ')})`);
    const extra = await p.locator('[data-board-more-row] button').evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return r.width >= 44 && r.height >= 44;
    }));
    ok(extra.length === 4 && extra.every(Boolean), 'every one a finger wide');
    await p.locator('[data-board-tray] button', { hasText: 'Select' }).tap({ timeout: 5000 }).catch(() => {});
    await p.locator('[data-board-tray] button', { hasText: 'Less' }).tap({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(500);
    const withLess = await words();
    ok(!withLess.includes('Line') && withLess.includes('More') && withLess.includes('Pen'),
       `Less folds the second row away and the first is as it was (${withLess.join(', ')})`);
    const pfull = await chrome(p);
    ok(pfull.tray && !pfull.dock, 'and AFFiNE\'s dock never replaces the row on a phone');
    ok(!pfull.zoom, 'the zoom control stays away on a phone; two fingers zoom');
    await p.getByRole('button', { name: 'Hide tools' }).tap({ timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(500);
    const phidden = await chrome(p);
    ok(!phidden.dock && !phidden.tray && phidden.open, `Hide tools puts them away, and the Tools button is back (${JSON.stringify(phidden)})`);

    // A NOTE'S BAR FITS A PHONE, AND A NOTE JOINS ON EVERY SIDE (8 November
    // 2026). The bar used to run off a 390px screen with Lock, the bin and ⋯;
    // a note had a "+" left and right only, and a tap made no line.
    const nx = Math.round(pbox.x + pbox.width * 0.5), ny = Math.round(pbox.y + pbox.height * 0.2);
    await p.evaluate(([x0, y0]) => {
      const root = document.querySelector('affine-edgeless-root');
      const [x, y] = root.gfx.viewport.toModelCoordFromClientCoord([x0, y0]);
      const store = root.std.store;
      const id = store.addBlock('affine:note', { xywh: `[${x - 90},${y - 35},180,70]`, displayMode: 'edgeless' }, store.root.id);
      store.addBlock('affine:paragraph', { type: 'text' }, id);
    }, [nx, ny]);
    await p.waitForTimeout(500);
    await touch(nx, ny, 40);
    await p.waitForTimeout(900);
    const nbar = await selectionBar(p);
    ok(nbar && nbar.left >= 0 && nbar.right <= 390 && nbar.labels.includes('Delete') && nbar.labels.includes('More menu'),
       `a note's bar is all on the screen, bin and ⋮ included${how} (${nbar ? `${Math.round(nbar.left)}–${Math.round(nbar.right)}px: ${nbar.labels.filter(Boolean).join(', ')}` : 'no bar'})`);
    const joins = await p.evaluate(() => {
      const found = {};
      const walk = (root) => {
        for (const el of root.querySelectorAll('*')) {
          if (el.dataset?.join) { const r = el.getBoundingClientRect(); found[el.dataset.join] = { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; }
          if (el.shadowRoot) walk(el.shadowRoot);
        }
      };
      walk(document);
      return found;
    });
    ok(['top', 'right', 'bottom', 'left'].every((k) => joins[k] && joins[k].w >= 44),
       `a selected note has a join handle on all four sides, each a finger wide (${Object.keys(joins).join(', ') || 'none'})`);
    const parts = () => p.evaluate(() => {
      const models = document.querySelector('editor-host')?.std?.store?.getAllModels?.() ?? [];
      const surface = models.find((b) => b.flavour === 'affine:surface');
      return { notes: models.filter((b) => b.flavour === 'affine:note').length, lines: (surface?.elementModels ?? []).filter((e) => e.type === 'connector').length };
    });
    // A card exactly where AFFiNE would put the new note (its own distance
    // below), so "on top of no other card" is a real test, not luck.
    await p.evaluate(() => {
      const root = document.querySelector('affine-edgeless-root');
      const id = [...root.gfx.selection.selectedIds][0];
      const b = root.gfx.getElementById(id).elementBound;
      const store = root.std.store;
      const blocker = store.addBlock('affine:note', { xywh: `[${b.x},${b.y + b.h + 100},${b.w},${b.h}]`, displayMode: 'edgeless' }, store.root.id);
      store.addBlock('affine:paragraph', { type: 'text' }, blocker);
    });
    await p.waitForTimeout(300);
    const j0 = await parts();
    if (joins.bottom) await touch(Math.round(joins.bottom.x), Math.round(joins.bottom.y), 40);
    await p.waitForTimeout(1000);
    const j1 = await parts();
    ok(j1.notes === j0.notes + 1 && j1.lines === j0.lines + 1,
       `a tap on the bottom handle makes a note below, joined by a line${how} (notes ${j0.notes}→${j1.notes}, lines ${j0.lines}→${j1.lines})`);
    await touch(ex, ey, 40);
    await p.waitForTimeout(500);
    ok((await notesAndLines(p)).overlaps === 0, 'and the new note is put where it lies on top of no other card');
    // The card with the page's writing is locked: no handles to join it from.
    const lockedAt = await p.evaluate(() => {
      const root = document.querySelector('affine-edgeless-root');
      const note = root.std.store.getAllModels().find((b) => b.flavour === 'affine:note' && b.props?.displayMode !== 'edgeless');
      if (!note) return null;
      const b = JSON.parse(note.xywh);
      const [x, y] = root.gfx.viewport.toViewCoord(b[0] + 24, b[1] + 16);
      const v = root.getBoundingClientRect();
      return [Math.round(v.left + x), Math.round(v.top + y)];
    });
    if (lockedAt) await touch(lockedAt[0], lockedAt[1], 40);
    await p.waitForTimeout(800);
    const lockedJoins = Object.keys(await joinHandles(p));
    ok(lockedAt && lockedJoins.length === 0, `the locked card with the page's writing shows no handles to join it${how} (${lockedJoins.join(', ') || 'none'})`);
    await touch(ex, ey, 40);
    await p.waitForTimeout(500);

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
    ok(perrors.length === 0, `no page errors on the phone${perrors.length ? `: ${pwhen.slice(0, 3).join(' | ') || perrors.slice(0, 2).join(' | ')}` : ''}`);
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
    // Empty board first: with a thing's bar open, the Tools button stands aside.
    const te = emptyAt(tbox);
    await ttap(Math.round(te.x), Math.round(te.y));
    await t.waitForTimeout(600);
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
