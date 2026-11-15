// The study room opens on four ways to start, on screen and on paper.
//
// Asked for on 16 November 2026: the room should look finished and be simple,
// with hands-on study for somebody who works on paper as much as on a screen.
// So Simple (where a new person lands) shows Start studying, each card opens a
// page already laid out, and the drawn shelf and lamp are gone.
//
//   npm run build && node scripts/run-next.mjs start -p 4415
//   node tests/e2e/the-study-room-starts-studying.js 4415

const { browser: engine, launchOptions, pageErrors } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, backToShelf, writtenOnPage } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function walk(browser, label, options) {
  const context = await browser.newContext(options);
  await context.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
  const page = await context.newPage();
  const caught = pageErrors(page);
  await signInAsExplorer(page, BASE);
  await openStudyRoom(page, BASE, 'simple');

  const cards = await page.locator('[data-study-start]').evaluateAll((els) => els.map((el) => el.getAttribute('data-study-start')));
  ok(JSON.stringify(cards) === JSON.stringify(['bible-study', 'paper-study', 'sermon-notes', 'journal']),
     `${label}: Simple opens on four ways to start (${cards.join(', ')})`);
  const ways = await page.locator('[data-study-start] .sr-start-way').allInnerTexts();
  ok(ways.includes('On screen') && ways.includes('Pen and paper'), `${label}: each says whether it is on screen or on paper`);
  ok(await page.locator('.sr-shelf-art, .sr-lamp-art, .sr-shelf-art--phone').count() === 0, `${label}: no drawn shelf or lamp`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, `${label}: nothing runs off the side (${over}px over)`);

  // ON PAPER: the page says what to do in the notebook, and where to bring it back.
  await page.locator('[data-study-start="paper-study"]').click();
  await page.waitForSelector('affine-paragraph, affine-list', { timeout: 60_000 });
  await page.waitForTimeout(900);
  const title = await page.getByLabel('Name this page').inputValue();
  const words = await writtenOnPage(page);
  ok(title === 'Study on paper' && /On paper/.test(words) && /Bring it here/.test(words) && /More, then Picture/.test(words),
     `${label}: Study on paper opens as itself (title "${title}")`);
  await backToShelf(page);

  // ON SCREEN.
  await page.locator('[data-study-start="bible-study"]').click();
  await page.waitForSelector('affine-paragraph, affine-list', { timeout: 60_000 });
  await page.waitForTimeout(900);
  ok(await page.getByLabel('Name this page').inputValue() === 'Bible study', `${label}: Bible study opens as itself`);
  await backToShelf(page);

  // THE JOURNAL: today's own page.
  await page.locator('[data-study-start="journal"]').click();
  await page.waitForSelector('affine-paragraph, affine-list', { timeout: 60_000 });
  await page.waitForTimeout(900);
  const today = await page.getByLabel('Name this page').inputValue();
  ok(today.length > 0 && today !== 'Bible study', `${label}: Today's journal opens today's page ("${today}")`);
  await backToShelf(page);

  const errors = caught.list();
  ok(errors.length === 0, `${label}: no page errors${errors.length ? `: ${errors.slice(0, 2).join(' | ')}` : ''}`);
  await context.close();
}

(async () => {
  const browser = await engine.launch(launchOptions);
  try {
    await walk(browser, 'computer', { viewport: { width: 1280, height: 860 } });
    await walk(browser, 'phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
