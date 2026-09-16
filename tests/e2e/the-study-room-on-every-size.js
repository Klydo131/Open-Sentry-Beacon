// The study room opens and can be written in, at every size somebody has.
//
// ---------------------------------------------------------------------------
// WHY A SECOND WALK. the-study-room-opens.js proves the editor assembles and
// accepts typing, once, at 412px. That is the phone most people here have and
// it is the right default, but "it works" was being claimed from one viewport
// while the room was asked to work on everything from a 360px Android to a
// desktop browser.
//
// The editor is the part most likely to be wrong at a size nobody checked: its
// own defaults are a 944px document with 96px of padding a side, written for a
// desktop window, and on a phone that left a column 220 pixels wide with the
// placeholder cut off mid-word. Nothing went red. The page simply looked wrong
// at the size nobody had opened it at.
//
// WHAT THIS CANNOT DO. There is no WebKit in this sandbox, so every size below
// is Chromium at those dimensions. It is not Safari and it is not iOS, and the
// difference is real: Safari's viewport units and its handling of a focused
// contenteditable both differ. An iPhone still has to be looked at by somebody
// holding one.
//
//   node tests/e2e/the-study-room-on-every-size.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, openPage } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-sizes-'));

// The sizes real people arrive on, not a tidy series. The two ends are what
// matter: 360 is the smallest Android still in use here, and the desktop end is
// where the editor's own defaults stop being absurd.
const SIZES = [
  { name: 'small Android', width: 360, height: 640 },
  { name: 'iPhone size', width: 390, height: 844 },
  { name: 'large Android', width: 412, height: 915 },
  { name: 'tablet, portrait', width: 768, height: 1024 },
  { name: 'tablet, landscape', width: 1024, height: 768 },
  { name: 'small laptop', width: 1280, height: 800 },
  { name: 'desktop', width: 1440, height: 900 },
];

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-sizes`, {
    ...launchOptions, viewport: { width: 412, height: 915 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  await signInAsExplorer(page, BASE);

  for (const size of SIZES) {
    const at = `${size.name} (${size.width}px)`;
    errors.length = 0;

    await page.setViewportSize({ width: size.width, height: size.height });
    // THE SHELF FIRST, THEN A PAGE. The room opens on its list of pages now,
    // so "the editor arrives" means arriving at the end of that walk rather
    // than on landing.
    const arrived = await openStudyRoom(page, BASE)
      .then(() => openPage(page, 0))
      .then(() => true)
      .catch(() => false);
    ok(arrived, `${at}: the shelf opens and a page can be opened from it`);
    if (!arrived) continue;

    // 1. IT SAYS WHAT IT IS FOR before anybody touches it. An empty BlockSuite
    //    page draws nothing at all, which is what got reported as broken.
    const hint = page.locator('.affine-paragraph-placeholder.visible');
    ok(await hint.count() > 0, `${at}: an untouched room says what it is for`);

    // 2. AND THE HINT IS NOT CUT OFF, which is how the too-narrow column showed
    //    itself: "Write what you not..." with the rest clipped. scrollWidth
    //    beyond clientWidth is the clip, and it is invisible to a screenshot
    //    somebody scrolls past.
    if (await hint.count() > 0) {
      const clipped = await hint.first().evaluate((el) => el.scrollWidth - el.clientWidth);
      ok(clipped <= 1, `${at}: and the whole of it fits (clipped by ${clipped}px)`);
    }

    // 3. THERE IS ROOM TO WRITE, measured against the card the room sits in
    //    rather than the window. At desktop widths the shell puts a rail on
    //    each side, so a column that is half the window can still be the whole
    //    of the room -- comparing to the window called that a failure and was
    //    wrong about it.
    const fit = await page.locator('affine-note').first().evaluate((note) => {
      const card = note.closest('.affine-page-viewport')?.parentElement;
      return {
        note: note.getBoundingClientRect().width,
        card: card ? card.getBoundingClientRect().width : 0,
      };
    });
    ok(fit.card > 0 && fit.note >= fit.card * 0.8,
       `${at}: the writing column fills the room (${Math.round(fit.note)}px of ${Math.round(fit.card)}px)`);
    ok(fit.note <= size.width, `${at}: and does not run off the screen`);

    // 4. SOMEBODY CAN WRITE IN IT. The whole point, at every size.
    await page.locator('affine-paragraph').first().click();
    await page.waitForTimeout(300);
    await page.keyboard.type('Nagbasa ako ngayon.');
    await page.waitForTimeout(600);
    const written = (await page.locator('editor-host').innerText()).replace(/​/g, '');
    ok(/Nagbasa ako ngayon\./.test(written), `${at}: what was typed is on the page`);

    // 5. NOTHING BROKE QUIETLY, and the page does not scroll sideways.
    ok(errors.length === 0, `${at}: no page errors (${errors.slice(0, 1).join('') || 'none'})`);
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    ok(sideways <= 0, `${at}: no sideways scroll (overflow ${sideways}px)`);

    await page.screenshot({ path: `${OUT}/study-${size.width}.png` });
  }

  await ctx.close();
  console.log(`\nscreenshots in ${OUT}`);
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
