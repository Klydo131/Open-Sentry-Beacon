// The study room is an editor, not a text box.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS, IN THE OWNER'S WORDS. "that's it? that's what all the study
// room can do? write notes? where are all the features of affine?"
//
// That was a fair description of what was on the screen, and the cause was not
// missing features. Headings, quotes, three kinds of list, tables, callouts and
// dividers were all registered and all unreachable, because the room had blocks
// wired and no widgets: no slash menu to insert with, no toolbar to format
// with, nothing on a phone above the keyboard. Blocks are what an editor can
// hold; widgets are how a person gets at them. Wiring the first and not the
// second is exactly how an editor ends up looking like a text box.
//
// So the assertions here are about REACH rather than registration. A static
// check can see that the heading block is in the extension list; only a browser
// can see whether anybody can make one.
//
// WHAT IT DOES NOT COVER. The keyboard toolbar -- the bar above a phone's own
// keyboard -- needs a virtual keyboard to appear, and a headless browser has
// none. It is registered, it is untested here, and it says so rather than being
// quietly asserted around.
//
//   node tests/e2e/the-study-room-can-do-more-than-type.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, newPage } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-editor-'));

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

/** Everything written inside a custom element's shadow root, flattened. */
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
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-editor`, {
    ...launchOptions, viewport: { width: 412, height: 915 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  await signInAsExplorer(page, BASE);
  await openStudyRoom(page, BASE);
  // A BLANK PAGE. The first page on the shelf is the Getting Started guide now,
  // whose own heading is 28px, so "the block became a heading" compared the
  // guide's title against itself and failed on a working slash menu.
  await newPage(page);

  // The size of ordinary body text, read from the page rather than pinned to a
  // number, so a change of theme is not a failing test.
  const plainSize = await page.locator('affine-paragraph').first()
    .evaluate((el) => parseFloat(getComputedStyle(el.querySelector('rich-text') || el).fontSize));

  // ---------------------------------------------------------------------
  // 1. THERE IS A WAY TO INSERT THINGS
  // ---------------------------------------------------------------------
  await page.locator('affine-paragraph').first().click();
  await page.waitForTimeout(300);
  await page.keyboard.type('/');
  await page.waitForTimeout(1200);

  const items = await page.evaluate((fn) => {
    // eslint-disable-next-line no-eval
    const collect = eval(`(${fn})`);
    const menu = document.querySelector('affine-slash-menu');
    const inner = menu?.shadowRoot?.querySelector('inner-slash-menu');
    return collect(inner);
  }, textIn.toString());

  ok(items.length > 0, `the slash menu opens with something in it (${items.length} entries)`);
  for (const wanted of ['Heading 1', 'Quote', 'Bulleted List']) {
    ok(items.includes(wanted), `and offers ${wanted}`);
  }

  // ---------------------------------------------------------------------
  // 2. AND CHOOSING ONE DOES SOMETHING
  // ---------------------------------------------------------------------
  //
  // The menu opens on Text; one step down is Heading 1. Driven by keyboard
  // rather than by clicking a position, because the popover is placed by a
  // floating-ui calculation whose coordinates are not a thing to hard-code.
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(250);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  await page.keyboard.type('John 11');
  await page.waitForTimeout(500);

  const headingSize = await page.locator('affine-paragraph').first()
    .evaluate((el) => parseFloat(getComputedStyle(el.querySelector('rich-text') || el).fontSize));
  ok(headingSize > plainSize,
     `the block became a heading (${headingSize}px against ${plainSize}px of body text)`);

  // ---------------------------------------------------------------------
  // 3. AND TEXT CAN BE FORMATTED
  // ---------------------------------------------------------------------
  await page.keyboard.press('Enter');
  await page.keyboard.type('Jesus wept.');
  await page.waitForTimeout(500);
  await page.keyboard.down('Shift');
  for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowLeft');
  await page.keyboard.up('Shift');
  await page.waitForTimeout(1200);

  const toolbar = await page.evaluate((fn) => {
    // eslint-disable-next-line no-eval
    const collect = eval(`(${fn})`);
    const bar = document.querySelector('affine-toolbar-widget');
    return collect(bar).length;
  }, textIn.toString());
  const barVisible = await page.locator('affine-toolbar-widget editor-toolbar, editor-toolbar').count();
  ok(barVisible > 0 || toolbar > 0, 'selecting text raises the formatting toolbar');

  // Bold through the keyboard, which is the same command the toolbar button
  // runs and does not depend on where the popover landed.
  //
  // WITH THE MODIFIER THE EDITOR ACTUALLY LISTENS FOR. BlockSuite binds bold
  // to `Mod-b`, and @blocksuite/std/event/keymap.js turns Mod into Meta when
  // navigator.platform says Mac and into Ctrl everywhere else. safari.yml runs
  // on a macOS runner, so this pressed Ctrl+B on a Mac -- a key with nothing
  // bound to it -- and failed in all four WebKit runs. I reported that to the
  // owner as the one genuine Safari finding. It was this line.
  //
  // Proven on Chromium by making it report a Mac platform: Ctrl+B left the
  // words plain and Cmd+B bolded them, which is what a person on a Mac gets.
  // Read from the page rather than from Node's process.platform because the
  // browser's answer is the one the editor uses.
  const onAMac = await page.evaluate(() => /Mac|darwin/i.test(navigator.platform));
  await page.keyboard.press(onAMac ? 'Meta+b' : 'Control+b');
  await page.waitForTimeout(600);
  const bolded = await page.evaluate(() => {
    const blocks = [...document.querySelectorAll('affine-paragraph')];
    const last = blocks[blocks.length - 1];
    return [...last.querySelectorAll('*')].some((n) => {
      const w = getComputedStyle(n).fontWeight;
      return (w === 'bold' || Number(w) >= 600) && (n.textContent || '').trim().length > 0;
    });
  });
  ok(bolded, 'and bold actually lands on the words that were selected');

  // ---------------------------------------------------------------------
  // 4. NOTHING BROKE QUIETLY
  // ---------------------------------------------------------------------
  ok(errors.length === 0, `no page errors (${errors.slice(0, 1).join('') || 'none'})`);

  await page.screenshot({ path: `${OUT}/editor.png` });
  await ctx.close();
  console.log(`\nscreenshots in ${OUT}`);
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
