// The study room opens, and somebody can write in it.
//
// ---------------------------------------------------------------------------
// WHY THIS WALK EXISTS AND THE OTHER CHECKS DO NOT COVER IT. The static checks
// assert the editor is imported lazily, gated behind a button, and that the
// build is configured to read BlockSuite at all. Every one of those can be true
// while the room opens to a blank box, because the editor is assembled at
// runtime from about a hundred custom elements and the failure mode is silence:
// no error, no text, nothing.
//
// It failed that way three times while being built -- once on a decorator, once
// on the `accessor` keyword, once on vanilla-extract -- and each time the page
// simply rendered nothing. So the only honest test is to open it and type.
//
// IT RUNS AGAINST THE TUTORIAL, which is what makes it possible at all: the
// demo needs no session, so a browser can reach the room without credentials
// this suite has no business holding. The tutorial and the live room share the
// same editor and differ only in where pages are kept, so what this proves
// about one holds for the other up to the document source.
//
//   node tests/e2e/the-study-room-opens.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, openPage, writtenOnPage } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-e2e-'));

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  // A phone, because that is what an Explorer has, and because the editor's
  // own layout is the part most likely to be wrong at 412 wide.
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-study-room`, {
    ...launchOptions, viewport: { width: 412, height: 915 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  await signInAsExplorer(page, BASE);

  // 1. IT IS A ROOM, reachable from the navigation rather than buried in a tab.
  //    This is the part that was wrong first time and is worth asserting: the
  //    room was a card at the bottom of My Journey's Study tab, which is not
  //    what a room is here.
  //    CHECKED AT DESKTOP WIDTH, because that is where the tutorial HAS
  //    navigation: AppShell draws only the left rail, which is `xl:block`, and
  //    unlike the live shell it has no horizontal strip below that. A phone
  //    walking the demo therefore has no room navigation at all -- pre-existing,
  //    worth its own fix, and not something to assert away here by pretending
  //    the link is missing when it is the navigation that is.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const doorway = page.getByRole('link', { name: /Study Room/i }).first();
  ok(await doorway.count() > 0, 'the Study Room is a room in the navigation');
  await page.setViewportSize({ width: 412, height: 915 });

  // 2. AND IT OPENS ON ARRIVAL, because walking in is the asking.
  await openStudyRoom(page, BASE);
  ok(/nothing you write here is saved/i.test(await page.locator('body').innerText()),
     'the walkthrough says plainly that nothing is kept');

  // THE ROOM OPENS ON ITS SHELF, NOT ON A PAGE, which is the change asked for:
  // "a special room like the library page". So the editor is one tap in.
  await openPage(page, 0);

  const host = await page.locator('editor-host').count();
  ok(host > 0, 'the editor mounts');
  ok(await page.locator('affine-paragraph').count() > 0,
     'and there is somewhere to type');

  // AND IT LOOKS LIKE A ROOM BEFORE ANYBODY TOUCHES IT, which is the assertion
  // that would have caught what two screenshots caught instead. An untouched
  // page used to be one empty paragraph, and BlockSuite draws its placeholder
  // only while the caret is inside the block, so a room nobody had tapped
  // rendered as white space and nothing else. Every check above passed while
  // that was true.
  //
  // THE TEST IS THE OUTCOME, NOT THE MECHANISM. A new room now opens on its
  // Getting Started page, which is words on a screen and satisfies this far
  // better than a placeholder did -- but it means there is no placeholder to
  // find, and pinning the mechanism made a genuine improvement look like a
  // regression. What has to be true is that somebody who has tapped nothing
  // sees something telling them what the room is for.
  const hint = page.locator('.affine-paragraph-placeholder.visible');
  const placeholder = await hint.count() > 0 && /\S/.test(await hint.first().innerText());
  const onScreen = (await page.locator('editor-host').innerText()).replace(/\u200b/g, '').trim();
  ok(placeholder || onScreen.length > 40,
     `an untouched room says what it is for, before anybody taps it (${
       placeholder ? 'placeholder' : `${onScreen.length} characters on the page`})`);

  // 3. SOMEBODY CAN WRITE IN IT, which is the whole point and the thing every
  //    silent failure got wrong.
  await page.locator('affine-paragraph').first().click();
  await page.waitForTimeout(400);
  await page.keyboard.type('Jesus wept.');
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.keyboard.type('John 11:35');
  await page.waitForTimeout(900);

  const written = (await page.locator('editor-host').innerText()).replace(/​/g, '');
  ok(/Jesus wept\./.test(written), 'what was typed is on the page');
  ok(/John 11:35/.test(written), 'and Enter started a second block rather than swallowing it');

  // 4. NOTHING BROKE QUIETLY.
  ok(errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ') || 'none'})`);

  // 5. AND IT STILL FITS THE PHONE.
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  ok(sideways <= 0, `the page does not scroll sideways at 412px (overflow ${sideways}px)`);

  await page.screenshot({ path: `${OUT}/study-room.png` });
  await ctx.close();

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
