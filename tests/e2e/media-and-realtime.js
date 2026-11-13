// Attachments and live sync, proved in a real browser.
//
// Source assertions (tests/realtime-and-media.mjs) prove the rules are written.
// They cannot prove a person can actually attach a photo and see it, or that a
// second window updates without a refresh. This suite exists because a previous
// test suite in this project reported everything green on a guided tour that was
// completely stuck: asserting that code exists is not asserting that it works.
//
// THE TWO PAGES MUST SHARE ONE BROWSER CONTEXT. Playwright isolates storage per
// context, and BroadcastChannel is same-origin — two contexts would be two
// different partitions and the live-sync check would fail for a reason that has
// nothing to do with the app.

const { chromium, launchOptions, openChat } = require('./_playwright');
const PORT = process.argv[2] || '4001';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// A real 1x1 PNG, so the browser has genuine image bytes to store and decode.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function signInAsMaria(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const maria = page.getByText(/Maria Santos/i).first();
  if (await maria.count()) await maria.click();
  await page.waitForTimeout(1400);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
}

async function openFirstSeekerRoom(page) {
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const card = page.locator('[data-quest="seeker-card"]').first();
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(1200);
    // The conversation is in the Talk bubble (30 September 2026); Message opens it.
    await openChat(page);
    await page.waitForTimeout(1600);
  }
  return page.locator('[data-quest="chat-send"]').count();
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });

  const a = await context.newPage();
  await signInAsMaria(a);
  const hasChat = await openFirstSeekerRoom(a);
  ok(hasChat > 0, 'the conversation opens and the message box is present');

  // ---- Attaching a file -------------------------------------------------
  const fileInput = a.locator('input[type="file"]').first();
  ok(await fileInput.count() > 0, 'the conversation offers a file input');

  await fileInput.setInputFiles({
    name: 'prayer-notes.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await a.waitForTimeout(1800);

  // A picture shows as the picture now, not its file name (1 October 2026), so
  // it is found by its label: the open button says "Open the picture <name>".
  const shown = await a.locator('[data-chat-entry="media"] [aria-label*="prayer-notes.png"]').count();
  ok(shown > 0, 'the attachment appears in the conversation after choosing it');

  // The bytes must have reached IndexedDB, not the row. Proven by the picture
  // DECODING, not by the absence of an error line: a missing file falls back to
  // a plain file card, so "no error text" would pass with nothing to see.
  const decoded = await a.waitForFunction(
    () => [...document.querySelectorAll('[data-chat-image] img[alt="prayer-notes.png"]')]
      .some((img) => img.complete && img.naturalWidth > 0),
    null, { timeout: 5000 },
  ).then(() => true, () => false);
  ok(decoded, 'the attachment resolves to real bytes and draws as a picture');

  // And it must NOT have been inlined into the saved database, which is the
  // whole reason bytes live in IndexedDB. localStorage would blow its ~5 MB
  // quota and silently stop saving everything else.
  const dbSize = await a.evaluate(() => (localStorage.getItem('beacon-demo-v1') || '').length);
  ok(dbSize > 0 && dbSize < 500_000, `saved database stayed small (${dbSize} chars, no inlined bytes)`);

  // ---- Live sync between two windows ------------------------------------
  const b = await context.newPage();
  const hasChatB = await openFirstSeekerRoom(b);
  ok(hasChatB > 0, 'a second window opens the same conversation');

  // The second window must already show the attachment made in the first.
  ok(
    (await b.locator('[data-chat-entry="media"] [aria-label*="prayer-notes.png"]').count()) > 0,
    'the second window sees the attachment the first one made',
  );

  const marker = `live sync ${Date.now()}`;
  await a.locator('[data-quest="chat-send"] textarea[aria-label="Message"]').fill(marker);
  await a.locator('[data-quest="chat-send"]').getByRole('button', { name: /^Send$/ }).click();

  // No reload of page B anywhere in this block. That is the point.
  let seen = 0;
  for (let i = 0; i < 20 && seen === 0; i++) {
    await b.waitForTimeout(300);
    seen = await b.getByText(marker).count();
  }
  ok(seen > 0, 'a message sent in one window appears in the other WITHOUT a reload');

  await browser.close();
  console.log(bad === 0 ? '\nAll media and real-time browser checks passed.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
