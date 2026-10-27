// The whiteboard says what you can do, and right-click and a long press do it.
//
// Reported on 27 October 2026, with a photograph of a selected triangle and
// nothing around it: "if I right click on it there are no option for me to
// delete objects, options to modify, or edit it", and it must work for "a 5
// year old, a professional, and a 75 year old" without discovering anything.
// AFFiNE's own bar for a selected thing never drew here and its canvas has no
// menu; the room's own bar and menu (components/study/StudyBoardTools.tsx) do
// the work, with AFFiNE's own actions (lib/study/board-actions.ts).
//
// Walked as a person would, in Simple (the whiteboard is for everybody now):
// tools by their words, a shape drawn, then colour, copy, right-click, delete,
// undo, writing on it, a long press with a finger, and the page's own writing
// that cannot be deleted from here.
//
//   node tests/e2e/the-whiteboard-says-what-you-can-do.js [port]

const { browser: engine, engineName, launchOptions, pageErrors } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, newPage } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

/** The colour of the board's canvas at a point of the screen. */
async function pixel(page, x, y) {
  return page.evaluate(([px, py]) => {
    for (const canvas of document.querySelectorAll('.sr-board-frame canvas')) {
      const r = canvas.getBoundingClientRect();
      if (px < r.left || px > r.right || py < r.top || py > r.bottom) continue;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      const scaleX = canvas.width / r.width;
      const scaleY = canvas.height / r.height;
      const d = ctx.getImageData(Math.round((px - r.left) * scaleX), Math.round((py - r.top) * scaleY), 1, 1).data;
      if (d[3] > 0) return [d[0], d[1], d[2]];
    }
    return null;
  }, [x, y]);
}

const what = (page) => page.locator('[data-board-selection]').innerText().catch(() => '');

async function openBoard(page) {
  await signInAsExplorer(page, BASE);
  await openStudyRoom(page, BASE, 'simple');
  await newPage(page);
  await page.getByRole('button', { name: /^Whiteboard$/ }).click();
  await page.waitForSelector('affine-edgeless-root', { timeout: 60_000 });
  await page.locator('[data-board-tools="tools"]').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  return page.locator('.sr-board-frame').boundingBox();
}

/** Draw one shape with the room's own Shape tool; returns its centre. */
async function drawShape(page, box) {
  await page.getByRole('button', { name: /^Shape: / }).click();
  const cx = box.x + box.width * 0.55, cy = box.y + box.height * 0.5;
  await page.mouse.move(cx - 70, cy - 45);
  await page.mouse.down();
  await page.mouse.move(cx + 70, cy + 45, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  return { cx, cy };
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

    const words = (await page.getByRole('toolbar', { name: 'Whiteboard tools' }).locator('.sr-board-word').allInnerTexts()).map((t) => t.trim());
    ok(['Select', 'Pen', 'Shape', 'Sticky note', 'Words', 'Arrow', 'Eraser', 'Undo', 'Redo', 'Show all'].every((w) => words.includes(w)),
       `in Simple, the board's tools each have a word, not only a picture (${words.join(', ')})`);
    ok(!(await page.locator('edgeless-toolbar-widget').isVisible().catch(() => false)),
       'and they are the only bar: AFFiNE\u2019s own bar of pictures is not shown in Simple');

    const { cx, cy } = await drawShape(page, box);
    if (!(await what(page))) { await page.mouse.click(cx, cy); await page.waitForTimeout(500); }
    ok(/This shape/.test(await what(page)), `selecting a shape says what it is (${await what(page)})`);
    const acts = (await page.getByRole('toolbar', { name: /What you can do/ }).locator('.sr-board-word').allInnerTexts()).map((t) => t.trim());
    ok(['Write on it', 'Colour', 'Copy', 'To front', 'To back', 'Delete', 'Done'].every((w) => acts.includes(w)),
       `and what can be done to it, in words (${acts.join(', ')})`);

    // COLOUR.
    const before = await pixel(page, cx, cy);
    await page.getByRole('button', { name: /^Colour$/ }).click();
    await page.getByRole('button', { name: /^Blue$/ }).first().click();
    await page.waitForTimeout(700);
    const after = await pixel(page, cx, cy);
    ok(before && after && after[2] > after[0] && JSON.stringify(before) !== JSON.stringify(after),
       `Colour, Blue turns it blue (${JSON.stringify(before)} to ${JSON.stringify(after)})`);

    // WRITE ON IT.
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /^Write on it$/ }).click();
    await page.waitForTimeout(600);
    ok(await page.locator('edgeless-shape-text-editor').count() === 1, 'Write on it opens the shape for words');
    await page.keyboard.type('Grace');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // COPY.
    await page.mouse.click(cx, cy);
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: /^Copy$/ }).click();
    await page.waitForTimeout(900);
    ok(/Copied/.test(await page.locator('[data-board-said]').innerText().catch(() => '')), 'Copy makes a copy and says so');

    // RIGHT-CLICK, ON EMPTY BOARD: everything.
    await page.mouse.click(box.x + 60, box.y + box.height - 140, { button: 'right' });
    await page.waitForTimeout(400);
    ok(await page.locator('[data-board-menu]').isVisible(), 'right-click on the empty board opens a menu');
    await page.getByRole('menuitem', { name: /Select everything/ }).click();
    await page.waitForTimeout(500);
    const all = await what(page);
    ok(/These 3 things/.test(all), `Select everything finds the shape, its copy and the page's writing (${all})`);
    await page.getByRole('button', { name: /^Done$/ }).click();

    // RIGHT-CLICK, ON THE SHAPE: delete, then undo.
    await page.mouse.click(cx, cy, { button: 'right' });
    await page.waitForTimeout(400);
    const items = (await page.getByRole('menuitem').allInnerTexts()).map((t) => t.trim());
    ok(['Write on it', 'Colour', 'Copy', 'Bring to front', 'Send to back', 'Delete'].every((w) => items.some((i) => i.endsWith(w))),
       `right-click on the shape offers what can be done to it (${items.join(', ')})`);
    await page.getByRole('menuitem', { name: /Delete/ }).click();
    await page.waitForTimeout(500);
    ok(/Deleted/.test(await page.locator('[data-board-said]').innerText()), 'Delete says it deleted, with Undo beside it');
    await page.locator('[data-board-said] button', { hasText: 'Undo' }).click();
    await page.waitForTimeout(600);
    await page.mouse.click(box.x + 60, box.y + box.height - 140, { button: 'right' });
    await page.getByRole('menuitem', { name: /Select everything/ }).click();
    await page.waitForTimeout(500);
    ok(/These 3 things/.test(await what(page)), `and Undo brings it back (${await what(page)})`);
    await page.getByRole('button', { name: /^Done$/ }).click();

    // THE PAGE'S OWN WRITING stays.
    const writing = await page.evaluate(() => {
      const note = document.querySelector('affine-edgeless-note');
      if (!note) return null;
      const r = note.getBoundingClientRect();
      return { x: r.left + 20, y: r.top + 12 };
    });
    if (writing) {
      await page.mouse.click(writing.x, writing.y, { button: 'right' });
      await page.waitForTimeout(400);
      const del = page.getByRole('menuitem', { name: /Delete/ });
      ok(await del.isDisabled(), 'the card with the page’s writing cannot be deleted from the board');
      await page.keyboard.press('Escape');
    } else {
      ok(false, 'the page’s writing is on the board as a card');
    }
    const errors = caught.list();
    ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 2).join(' | ')}` : ''}`);
    await context.close();

    // ---------------------------------------------------------------- finger
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await phone.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    const p = await phone.newPage();
    const pbox = await openBoard(p);
    const bar = await p.locator('.sr-board-bar .sr-board-row').first().boundingBox();
    ok(bar && bar.x >= pbox.x - 1 && bar.x + bar.width <= pbox.x + pbox.width + 1,
       `on a phone the bar wraps inside the board, every tool whole (${Math.round(bar?.width ?? 0)}px of ${Math.round(pbox.width)}px)`);
    const tx = Math.round(pbox.x + pbox.width / 2), ty = Math.round(pbox.y + pbox.height - 220);
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
    await p.waitForTimeout(400);
    ok(await p.locator('[data-board-menu]').isVisible(),
       `a long press with a finger opens the same menu${engineName === 'chromium' ? '' : ` (${engineName}: as pointer events, not a real finger)`}`);
    await phone.close();
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
