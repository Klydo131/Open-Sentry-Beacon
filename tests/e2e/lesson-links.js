// Links in lesson study, rendered by a real browser.
//
// tests/e2e/links.js proves this for a conversation. This proves the other half
// of what was asked for: a link typed into a SERIES DESCRIPTION is tappable
// where the series is read.
//
// It matters more here than in a chat. A conversation link comes from one person
// you already walk with; a series description is written once by the library and
// then shown to everybody who is offered that series. One bad link there reaches
// every Explorer in the church, and it arrives wearing the church's authority.
//
// So the deceptive URL is the point of this file. `https://adventist.org@evil.example`
// is a valid address that goes to evil.example, and a reader skimming a lesson
// description sees the name of their own denomination on the left of the @. It
// must be shown in full and must not be a link.
//
//   npm run build && node scripts/run-next.mjs start -p 4371
//   node tests/e2e/lesson-links.js 4371
const { chromium, launchOptions } = require('./_playwright');

const PORT = process.argv[2] || '4371';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const STAMP = Date.now().toString(36).slice(-4);
const SERIES = `Grief and hope ${STAMP}`;
const TOPIC = `Hard seasons ${STAMP}`;
const GOOD = 'https://hopechannel.com/grief';
const TRAP = 'https://adventist.org@evil.example/give';
const DESC = `Start here ${GOOD} — and donate at ${TRAP} please`;

async function signInAs(page, name) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const who = page.getByText(new RegExp(name, 'i')).first();
  if ((await who.count()) === 0) return false;
  await who.click();
  await page.waitForTimeout(1800);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
  return true;
}

/** Every anchor on the page that is part of the content, not the chrome. */
const anchors = (page) => page.evaluate(() =>
  [...document.querySelectorAll('a[href]')]
    .filter((a) => !a.closest('nav') && !a.closest('header') && !a.closest('footer'))
    .map((a) => ({ href: a.getAttribute('href'), rel: a.getAttribute('rel'), target: a.getAttribute('target') })));

(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width: 412, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();

  // ---- the library writes a description with a link in it -------------------
  ok(await signInAs(page, 'Pastor Ramos'), 'an admin can sign in');
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('[data-quest="tab-materials"]').first().click();
  await page.waitForTimeout(900);
  // The builder opens when asked for; the shelf is what the page shows first.
  await page.getByRole('button', { name: /^\+ New series$/ }).first().click();
  await page.waitForTimeout(400);

  ok(await page.getByLabel('Description').count() > 0, 'the series builder takes a description');
  await page.getByLabel('Series name').fill(SERIES);
  await page.getByLabel('Topic', { exact: true }).fill(TOPIC);
  await page.getByLabel('Description').fill(DESC);

  const lessons = page.locator('button[aria-pressed]');
  await lessons.nth(0).click();
  await page.waitForTimeout(200);

  const save = page.getByRole('button', { name: /Save series/i }).first();
  ok(await save.isEnabled(), 'Save turns on');
  await save.click();
  await page.waitForTimeout(1000);

  // ---- the shelf shows it -------------------------------------------------
  const body = await page.locator('body').innerText();
  ok(body.includes(SERIES), 'the series is on the shelf');

  const found = await anchors(page);
  const good = found.filter((a) => a.href === GOOD);
  ok(good.length === 1, `the genuine link in the description is one anchor (${good.length})`);
  if (good.length) {
    ok(good[0].target === '_blank', 'it opens in a new tab');
    ok((good[0].rel || '').includes('noopener') && (good[0].rel || '').includes('noreferrer'),
       'it carries rel=noopener noreferrer');
  }

  // The half this file exists for.
  ok(!found.some((a) => (a.href || '').includes('evil.example')),
     'nothing in a lesson description links to the host hiding after the @');
  ok(body.includes('adventist.org@evil.example'),
     'and the reader is shown the whole deceptive address as text, @ and all');

  // ---- the picker rows above are still buttons, not links -----------------
  // An <a> inside a <button> would break the toggle that builds a series.
  const inButtons = await page.evaluate(() =>
    [...document.querySelectorAll('button[aria-pressed] a')].length);
  ok(inButtons === 0, 'no anchor is nested inside a lesson toggle');

  await browser.close();
  console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
