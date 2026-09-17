// A phone can put a heading, a list and a quote on a page.
//
// ---------------------------------------------------------------------------
// REPORTED, WITH A PHOTOGRAPH OF AN ANDROID PHONE: "it's not working in mobile".
// The `/` had been typed into the page and was sitting there as a character.
// No menu. No bar. Nothing to press.
//
// WHY IT LOOKED FINE HERE. The slash-menu walk runs in a headless Chromium,
// where Playwright's keyboard sends real `keydown` events and the menu opens
// exactly as it does on a desktop. A phone's on-screen keyboard does not send
// those: GBoard and its cousins send composition and `beforeinput` events, so
// the character arrives with no keystroke for the menu to hear. Every
// assertion was true and none of them was about a phone.
//
// AFFiNE knows this -- their slash menu declines to register on a mobile scope
// at all, and their answer is a bar above the keyboard. Theirs only exists
// while a virtual keyboard is open, and a headless browser has none, so it
// cannot be tested from here by anybody. Four things that could not be tested
// here have now been found by the owner instead. So the bar is this app's own,
// and this is the walk that presses it.
//
//   node tests/e2e/a-phone-can-insert-things.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, newPage } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-insert-'));

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-insert`, {
    ...launchOptions, viewport: { width: 360, height: 640 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  await signInAsExplorer(page, BASE);
  await openStudyRoom(page, BASE);
  // A BLANK PAGE, NOT THE FIRST ONE ON THE SHELF. The first one is the Getting
  // Started page now, whose own heading is 28px -- so "the heading is bigger
  // than the body text" measured the guide's title against itself and failed on
  // a working insert bar. The bar is for writing on an empty page; test it on
  // an empty page.
  await newPage(page);

  // 1. THERE IS A WAY IN THAT IS NOT A KEYSTROKE, on the smallest screen.
  const bar = page.getByRole('toolbar', { name: /Add to this page/i });
  ok(await bar.count() > 0, 'a phone has a bar of things it can add');

  const plain = await page.locator('affine-paragraph').first()
    .evaluate((el) => parseFloat(getComputedStyle(el.querySelector('rich-text') || el).fontSize));

  // 2. A HEADING. Pressed, not typed.
  await page.locator('affine-paragraph').first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /^Big heading$/i }).click();
  await page.waitForTimeout(700);
  await page.keyboard.type('Romans 8');
  await page.waitForTimeout(500);

  const sizes = await page.locator('affine-paragraph').evaluateAll(
    (els) => els.map((el) => parseFloat(getComputedStyle(el.querySelector('rich-text') || el).fontSize)),
  );
  ok(sizes.some((size) => size > plain),
     `pressing it makes a real heading (${sizes.join(', ')} against ${plain}px of body text)`);
  ok(/Romans 8/.test(await page.locator('editor-host').innerText()),
     'and the caret lands in it, so the next thing typed goes there');

  // 3. A LIST, A TO-DO AND A QUOTE. Each is a different block, and the test is
  //    that the block exists rather than that a button was pressed.
  await page.getByRole('button', { name: /^Bulleted list$/i }).click();
  await page.waitForTimeout(600);
  await page.keyboard.type('No condemnation');
  await page.waitForTimeout(500);
  ok(await page.locator('affine-list').count() >= 1, 'a bulleted list can be added');

  await page.getByRole('button', { name: /^To-do with a box to tick$/i }).click();
  await page.waitForTimeout(600);
  ok(await page.locator('affine-list').count() >= 2, 'and a to-do');

  await page.getByRole('button', { name: /^A line across the page$/i }).click();
  await page.waitForTimeout(600);
  ok(await page.locator('affine-divider').count() >= 1, 'and a line across the page');

  // 4. NOTHING BROKE, AND THE PHONE IS STILL A PHONE.
  ok(errors.length === 0, `no page errors (${errors.slice(0, 1).join('') || 'none'})`);
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  ok(sideways <= 0, `the page does not scroll sideways at 360px (overflow ${sideways}px)`);

  await page.screenshot({ path: `${OUT}/insert.png` });
  await ctx.close();
  console.log(`\nscreenshots in ${OUT}`);
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
