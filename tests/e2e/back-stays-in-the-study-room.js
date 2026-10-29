// Back goes back inside the study room, and a new screen settles in gently.
//
// 29 October 2026: "when click back or tap back in the study room it all goes
// back to the menu, it seems to disorient me when I just want to go back to
// the study room." And: "Make the transition to have subtle animations to
// transition."
//
// WHAT WAS WRONG. An open page was only the room's own state, so the browser's
// Back, a phone's back swipe and the top-left button all skipped past it and
// out of the room, to the menu. Now (components/study/StudyRoomEditor.tsx,
// BACK GOES BACK INSIDE THE ROOM) opening a page takes one step in the
// history, Back takes it off, and the button on a page says "Study Room".
// A new screen settles in (lib/motion.ts, settleIn): a page from the right,
// the shelf from the left, a whiteboard by fading only, and nothing at all
// for somebody whose device asks for less movement.
//
// Walked with a mouse on a computer, where the places are a sidebar, and with
// a finger on a phone.
//
//   node tests/e2e/back-stays-in-the-study-room.js [port]

const { browser: engine, launchOptions, pageErrors } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, openPage } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

/** Whether the shelf is what is showing: its search box. */
const onShelf = (page) => page.getByLabel('Search your pages').isVisible().catch(() => false);

/** The words on the top-left button. */
const backWords = async (page) => (await page.locator('[data-study-back]').innerText().catch(() => '')).trim();

/**
 * Every transition the room starts, recorded as it starts. Looking for it
 * afterwards does not work: opening a page loads the editor, which keeps the
 * page busy for most of a second, and by the time anything can look the
 * 220ms transition has long finished. Only the room's own, named 'settle-in'
 * (lib/motion.ts), are counted: a spinner's glow is not a transition.
 */
const recordTransitions = () => {
  window.__settles = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    if (options && options.id === 'settle-in') {
      window.__settles.push(keyframes.some((k) => k.transform && k.transform !== 'none'));
    }
    return animate.call(this, keyframes, options);
  };
};

/** The transitions started by `act`: how many, and whether any slid rather than only faded. */
const motion = async (page, act) => {
  await page.evaluate(() => { window.__settles = []; });
  await act();
  await page.waitForTimeout(400);
  return page.evaluate(() => ({ count: window.__settles.length, slides: window.__settles.some(Boolean) }));
};

(async () => {
  const browser = await engine.launch(launchOptions);
  try {
    // ------------------------------------------------------------- computer
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await context.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    await context.addInitScript(recordTransitions);
    const page = await context.newPage();
    const caught = pageErrors(page);
    await signInAsExplorer(page, BASE);
    const home = new URL(page.url()).pathname;
    await openStudyRoom(page, BASE, 'simple');

    ok(await onShelf(page) && /Hope Beacon/.test(await backWords(page)),
       `on the shelf the top-left button is the way out of the room (${await backWords(page)})`);

    // A PLACE ON THE SHELF, then a page from it.
    const places = page.getByRole('navigation', { name: 'Places in your study room' });
    const place = await motion(page, () => places.getByRole('button', { name: /Journal/ }).click());
    ok(place.count > 0, `a new place on the shelf settles in (${JSON.stringify(place)})`);
    await places.getByRole('button', { name: /All pages/ }).click();
    await page.waitForTimeout(600);

    const opening = await motion(page, () => page.locator('ul[aria-label^="Pages:"] li button').first().click());
    ok(opening.count > 0 && opening.slides, `a page opening slides in, a little (${JSON.stringify(opening)})`);
    await page.waitForSelector('affine-paragraph', { timeout: 60_000 });
    await page.waitForTimeout(900);
    ok(await backWords(page) === 'Study Room', `on a page the top-left button says it goes back to the Study Room (${await backWords(page)})`);

    // THE BROWSER'S BACK: the shelf, not the menu.
    await page.goBack();
    await page.waitForTimeout(900);
    ok(await onShelf(page) && new URL(page.url()).pathname === '/study',
       `the browser's Back closes the page and stays in the study room (${new URL(page.url()).pathname})`);
    ok(/Hope Beacon/.test(await backWords(page)), 'and the top-left button is the way out again');

    // THE PLACE IS KEPT: back from a Journal page is back to the Journal.
    await places.getByRole('button', { name: /Journal/ }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /Today.s page/ }).first().click();
    await page.waitForSelector('affine-paragraph', { timeout: 60_000 });
    await page.waitForTimeout(900);
    await page.goBack();
    await page.waitForTimeout(900);
    ok(await onShelf(page) && await places.getByRole('button', { name: /Journal/ }).getAttribute('aria-current') === 'true',
       'Back from a Journal page is back in the Journal, where it was opened from');

    // THE TOP-LEFT BUTTON ON A PAGE, and then Back leaves the room at once:
    // the page's step went with it, so no press of Back does nothing.
    await places.getByRole('button', { name: /All pages/ }).click();
    await page.waitForTimeout(600);
    await openPage(page, 0);
    const closing = await motion(page, () => page.locator('[data-study-back]').click());
    ok(closing.count > 0 && closing.slides, `the shelf slides back in from the other side (${JSON.stringify(closing)})`);
    await page.waitForTimeout(800);
    ok(await onShelf(page), 'the top-left button on a page goes back to the shelf');
    await page.goBack();
    await page.waitForTimeout(1500);
    ok(new URL(page.url()).pathname !== '/study',
       `and the next Back leaves the room, with no step in between that does nothing (${new URL(page.url()).pathname}; the app's own home is ${home})`);

    // THE WHITEBOARD ONLY FADES: its canvas measures where it is as it opens.
    await openStudyRoom(page, BASE, 'simple');
    await openPage(page, 0);
    const board = await motion(page, () => page.getByRole('button', { name: /^Whiteboard$/ }).click());
    ok(board.count > 0 && !board.slides, `the whiteboard fades in and does not slide (${JSON.stringify(board)})`);
    await page.waitForSelector('affine-edgeless-root', { timeout: 60_000 });
    await page.waitForTimeout(900);
    await page.goBack();
    await page.waitForTimeout(900);
    ok(await onShelf(page), 'Back from a whiteboard is back on the shelf too');

    // LESS MOVEMENT, ASKED FOR: nothing moves, and everything still works.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const still = await motion(page, () => page.locator('ul[aria-label^="Pages:"] li button').first().click());
    ok(still.count === 0, `with less movement asked for, a page opens without moving (${JSON.stringify(still)})`);
    await page.waitForSelector('affine-paragraph', { timeout: 60_000 });
    await page.waitForTimeout(600);
    await page.goBack();
    await page.waitForTimeout(800);
    ok(await onShelf(page), 'and Back still goes back to the shelf');
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    const errors = caught.list();
    ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 2).join(' | ')}` : ''}`);
    await context.close();

    // ---------------------------------------------------------------- phone
    const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await phone.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    const p = await phone.newPage();
    await signInAsExplorer(p, BASE);
    await openStudyRoom(p, BASE, 'simple');
    await openPage(p, 0);
    const button = await p.locator('[data-study-back]').boundingBox();
    ok(await backWords(p) === 'Study Room' && button && button.height >= 44,
       `on a phone a page's top-left button says Study Room, a finger high (${await backWords(p)})`);
    await p.goBack();
    await p.waitForTimeout(900);
    ok(await onShelf(p) && new URL(p.url()).pathname === '/study', 'and the phone’s Back goes to the shelf, not the menu');
    await phone.close();
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
