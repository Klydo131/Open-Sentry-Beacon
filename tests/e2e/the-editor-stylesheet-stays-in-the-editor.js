// The editor's stylesheet does not redraw the room around it.
//
// ---------------------------------------------------------------------------
// TWO BUGS REPORTED FROM THE LIVE SITE ON ONE MORNING, both in the study room,
// both invisible to all 130 checks in the gate.
//
// THE FIRST: a tag box with `w-32` on it, measured at 828px, and an "Add" beside
// it the size of a banner. AFFiNE's theme carries `input { flex: 1 1 0% }`
// written against the bare element, so it lands on every input on the screen. A
// class beats an element selector, so the colours and the padding were fine --
// but `flex-basis: 0%` is what decides the size of a flex child, and `width` is
// never consulted. No width class could have fixed it.
//
// THE SECOND: the whiteboard's toolbar drawn at the bottom of the WINDOW rather
// than the bottom of the board, half cut off by the edge of the screen. It is
// `position: absolute; bottom: 0`, and an absolute box anchors to the nearest
// POSITIONED ancestor -- the canvas had none, so it climbed out to the
// full-screen shell.
//
// WHY NOTHING CAUGHT EITHER. Every study-room walk asks whether a thing EXISTS
// and whether pressing it does something. Both of these were present, both
// worked, and both were in the wrong place and the wrong size. Nothing in this
// repository had ever measured where a control in this room actually lands.
// That is what this file is for, and it is why the assertions are geometry
// rather than presence.
//
//   node tests/e2e/the-editor-stylesheet-stays-in-the-editor.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, newPage } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-leak-'));

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-leak`, {
    ...launchOptions, viewport: { width: 1280, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  await signInAsExplorer(page, BASE);
  await openStudyRoom(page, BASE);
  await newPage(page);
  await page.waitForTimeout(800);

  // -------------------------------------------------------------------------
  // 1. AN INPUT IS THE SIZE ITS CLASS ASKS FOR
  // -------------------------------------------------------------------------
  {
    const tag = await page.evaluate(() => {
      const box = document.querySelector('input[aria-label="Add a tag to this page"]');
      if (!box) return null;
      const cs = getComputedStyle(box);
      return {
        width: Math.round(box.getBoundingClientRect().width),
        rowWidth: Math.round(box.parentElement.getBoundingClientRect().width),
        grow: cs.flexGrow,
        basis: cs.flexBasis,
      };
    });
    ok(tag !== null, 'the tag box is on an open page');
    if (tag) {
      // `w-32` is 8rem. The root is 18px here (a senior-friendly base), so the
      // number to expect is 144 and not 128 -- asserted as a range rather than
      // a constant, because the point is "the class decided", not the arithmetic.
      ok(tag.width > 100 && tag.width < 200,
         `the tag box is the width its class asks for (${tag.width}px, not ${tag.rowWidth})`);
      ok(tag.grow !== '1' || tag.basis !== '0%',
         `and is not stretched by a rule meant for the editor (grow ${tag.grow}, basis ${tag.basis})`);
    }
  }

  // -------------------------------------------------------------------------
  // 2. AND SO IS EVERY OTHER INPUT ON THE SCREEN
  // -------------------------------------------------------------------------
  //
  // The tag box is where the leak showed. Fixing only that one leaves the next
  // input somebody adds to this screen broken in exactly the same way, which is
  // why the fix is a rule and this is a sweep.
  {
    const stretched = await page.evaluate(() => {
      const out = [];
      for (const box of document.querySelectorAll('input')) {
        if (box.closest('editor-host')) continue;
        const cs = getComputedStyle(box);
        // A forced grow is only wrong where the element did not ask for it.
        const asked = /flex-1|flex-auto|w-full|flex-\[/.test(box.className);
        if (cs.flexGrow === '1' && cs.flexBasis === '0%' && !asked) {
          out.push(`${box.getAttribute('aria-label') || box.placeholder || '?'}`);
        }
      }
      return out;
    });
    ok(stretched.length === 0,
       `no input outside the editor is stretched by the editor's stylesheet (${
         stretched.join(', ') || 'none is'})`);
  }

  // -------------------------------------------------------------------------
  // 2b. AND NO LABEL IS STRETCHED BY THE EDITOR'S `.truncate`
  // -------------------------------------------------------------------------
  //
  // Two BlockSuite blocks ship `.truncate { align-self: stretch }` into the
  // document, the same name as Tailwind's utility. It showed as "Hope Beacon"
  // sitting ten pixels above its own chevron once a page was open. Asserted
  // two ways: on that one label, which is where it was seen, and as a sweep,
  // which is where the next one would be.
  {
    const leak = await page.evaluate(() => {
      const way = document.querySelector('.sr-bar button');
      const svg = way?.querySelector('svg')?.getBoundingClientRect();
      const words = way?.querySelector('span')?.getBoundingClientRect();
      const stretched = [];
      for (const el of document.querySelectorAll('.truncate')) {
        if (el.closest('editor-host')) continue;
        if (/\bself-/.test(el.className)) continue;
        if (getComputedStyle(el).alignSelf === 'stretch') {
          stretched.push((el.textContent || '?').trim().slice(0, 30));
        }
      }
      return {
        off: svg && words ? Math.abs((svg.top + svg.height / 2) - (words.top + words.height / 2)) : 99,
        tall: words ? Math.round(words.height) : 0,
        stretched,
      };
    });
    ok(leak.off <= 2 && leak.tall < 40,
       `the way out's words sit level with its chevron (${leak.off.toFixed(1)}px apart, label ${leak.tall}px tall)`);
    ok(leak.stretched.length === 0,
       `no truncated label outside the editor is stretched by the editor's stylesheet (${
         leak.stretched.join(', ') || 'none is'})`);
  }

  // -------------------------------------------------------------------------
  // 3. THE WHITEBOARD'S TOOLS ARE ON THE WHITEBOARD
  // -------------------------------------------------------------------------
  {
    await page.getByRole('button', { name: /^Whiteboard$/ }).click();
    await page.waitForTimeout(3000);

    const board = await page.evaluate(() => {
      const canvas = document.querySelector('.affine-edgeless-viewport');
      const bar = document.querySelector('edgeless-toolbar-widget');
      if (!canvas || !bar) return null;
      const c = canvas.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      return {
        canvasTop: Math.round(c.top), canvasBottom: Math.round(c.bottom),
        canvasWidth: Math.round(c.width),
        barTop: Math.round(b.top), barBottom: Math.round(b.bottom),
        barWidth: Math.round(b.width),
        windowHeight: window.innerHeight,
      };
    });
    ok(board !== null, 'the whiteboard and its tools are both there');

    if (board) {
      // INSIDE THE BOARD, TOP AND BOTTOM. Before the fix the bar ran from 820 to
      // 900 against a board ending at 825: it had left the board entirely.
      ok(board.barBottom <= board.canvasBottom + 2,
         `the tools sit inside the board, not below it (bar ends ${
           board.barBottom}, board ends ${board.canvasBottom})`);
      ok(board.barTop >= board.canvasTop,
         'and not above it either');

      // AND REACHABLE. A toolbar the window cuts in half is a toolbar nobody
      // can press, which is what the screenshot showed.
      ok(board.barBottom <= board.windowHeight,
         `nothing is cut off by the edge of the screen (bar ends ${
           board.barBottom}, window is ${board.windowHeight})`);

      // THE BOARD GETS THE ROOM, AND THIS IS THE ASSERTION THAT SAYS SO.
      //
      // Reaching for `canvasWidth > barWidth` first was wrong: the toolbar
      // element is a full-width wrapper with the visible bar centred inside it,
      // so both reported 1244 and a passing layout looked like a failure. What
      // is actually checkable is that the board is not the READING COLUMN. At
      // this viewport that column is 828px wide, and squeezed to it AFFiNE's
      // toolbar laid itself out over its own zoom controls -- every element
      // present, correct, and on top of another, which is a fault only looking
      // finds.
      ok(board.canvasWidth > 900,
         `the board gets the room rather than the reading column (${board.canvasWidth}px)`);
    }
  }

  ok(errors.length === 0, `no page errors (${errors.slice(0, 1).join('') || 'none'})`);

  await page.screenshot({ path: `${OUT}/board.png` });
  await ctx.close();
  console.log(`\nscreenshots in ${OUT}`);
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
