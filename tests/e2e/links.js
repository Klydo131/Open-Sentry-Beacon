// Links in a conversation, rendered by a real browser.
//
// tests/linkify.mjs proves the RULES. This proves the rules survive the trip
// through React and into the DOM — that a link really is an anchor somebody can
// tap, and that a hostile one really is not.
//
// The distinction matters. A unit test showing `safeHref('javascript:...')` is
// null says nothing about what the page does; the component could ignore it. So
// each case below is typed into the real composer, sent, and then read back out
// of the rendered thread.
//
//   npm run build && node scripts/run-next.mjs start -p 4370
//   node tests/e2e/links.js 4370

const { chromium, launchOptions, openChat } = require('./_playwright');
const PORT = process.argv[2] || '4370';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const box = (page) => page.locator('[data-quest="chat-send"] textarea').first();

async function send(page, text) {
  await box(page).fill(text);
  await page.locator('[data-quest="chat-send"] button[type="submit"]').first().click();
  await page.waitForTimeout(900);
}

/** Every anchor in the message thread, with what it points at. */
const anchors = (page) => page.evaluate(() => {
  const scroller = document.querySelector('[data-quest="chat-send"]')?.closest('div')?.parentElement;
  const root = scroller || document.body;
  return [...root.querySelectorAll('a[href]')]
    .filter((a) => !a.closest('nav') && !a.closest('header'))
    .map((a) => ({ href: a.getAttribute('href'), rel: a.getAttribute('rel'), target: a.getAttribute('target'), text: a.textContent }));
});

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const page = await context.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const maria = page.getByText(/Maria Santos/i).first();
  if (await maria.count()) await maria.click();
  await page.waitForTimeout(1400);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) await consent.first().click().catch(() => {});
  await page.waitForTimeout(600);

  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const card = page.locator('[data-quest="seeker-card"]').first();
  if (await card.count()) await card.click();
  await page.waitForTimeout(1500);
  // The conversation is in the Talk bubble (30 September 2026); Message opens it.
  await openChat(page);

  ok(await box(page).count() > 0, 'a conversation is open');
  if (!(await box(page).count())) {
    // Where it ended up instead, so a failure on a browser nobody here can
    // open says more than "no".
    const at = await page.evaluate(() => ({
      path: location.pathname + location.search,
      cards: document.querySelectorAll('[data-quest="seeker-card"]').length,
      composers: document.querySelectorAll('[data-quest="chat-send"]').length,
      textareas: document.querySelectorAll('textarea').length,
    }));
    console.log(`    at ${at.path}: ${at.cards} Explorer card(s), ${at.composers} composer(s), ${at.textareas} textarea(s)`);
    console.log('\nRESULT: cannot continue'); await browser.close(); process.exit(1);
  }

  // ---- 1. A real link becomes a real anchor -------------------------------
  await send(page, 'Have a read of https://adventist.org/study before Sabbath');
  let found = (await anchors(page)).filter((a) => a.href.includes('adventist.org/study'));
  ok(found.length === 1, 'a typed link is rendered as one anchor');
  if (found.length) {
    ok(found[0].href === 'https://adventist.org/study', `the href is the link itself (${found[0].href})`);
    ok(found[0].target === '_blank', 'it opens in a new tab');
    ok((found[0].rel || '').includes('noopener'), 'it carries rel=noopener');
    ok((found[0].rel || '').includes('noreferrer'), 'it carries rel=noreferrer');
  }

  // The sentence around it must still read correctly.
  ok(await page.getByText(/before Sabbath/).count() > 0,
     'the words around the link are still shown');

  // ---- 2. A script URL is NOT a link --------------------------------------
  const before = (await anchors(page)).length;
  await send(page, 'try javascript:alert(1) now');
  const after = await anchors(page);
  ok(after.length === before, 'a javascript: URL adds no anchor at all');
  ok(!after.some((a) => (a.href || '').toLowerCase().startsWith('javascript:')),
     'no anchor anywhere points at a javascript: URL');
  ok(await page.getByText(/try javascript:alert\(1\) now/).count() > 0,
     'and the reader still sees exactly what was typed');

  // ---- 3. The @ deception is not a link -----------------------------------
  const before2 = (await anchors(page)).length;
  await send(page, 'donate at https://adventist.org@evil.example/give please');
  const after2 = await anchors(page);
  ok(after2.length === before2, 'a URL carrying user info adds no anchor');
  ok(!after2.some((a) => (a.href || '').includes('evil.example')),
     'nothing links to the host hiding after the @');
  ok(await page.getByText(/adventist\.org@evil\.example/).count() > 0,
     'the whole deceptive URL is shown as text, @ and all');

  // ---- 4. Markup typed into a message stays text --------------------------
  await send(page, '<script>alert(1)</script> and https://example.org/ok');
  const scripts = await page.evaluate(() =>
    [...document.querySelectorAll('script')].filter((s) => (s.textContent || '').includes('alert(1)')).length);
  ok(scripts === 0, 'a <script> typed into a message did not become a script element');
  ok((await anchors(page)).some((a) => a.href.includes('example.org/ok')),
     'the genuine link in the same message is still linked');

  await browser.close();
  console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
