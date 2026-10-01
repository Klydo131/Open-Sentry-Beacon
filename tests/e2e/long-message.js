// A long message has to be readable while you write it, and after you send it.
//
// THE COMPLAINT. "When they create a very long message they can't see the whole
// message at all, or scroll up or down to see the whole message." The second
// half is the diagnosis: the composer was an `<input>`, a single line that
// accepted 4000 characters. There is no up or down in a one-line box, so
// nothing was broken and nothing could have been scrolled — the text simply ran
// off sideways and only the few words under the cursor were visible.
//
// This runs at 390x844, an iPhone, because that is where it was reported.
//
//   npm run build && node scripts/run-next.mjs start -p 4341
//   node tests/e2e/long-message.js 4341

const { chromium, devices, launchOptions, openChat } = require('./_playwright');
const PORT = process.argv[2] || '4341';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// Long enough to need several lines on a phone, and made of many short words so
// it wraps normally rather than testing the unbreakable-string case.
const LONG = [
  'Good evening pastor, I wanted to share something that has been on my heart',
  'for a while now and I hope it is alright to write it all here.',
  'My mother has been unwell since the start of the year and the treatment has',
  'been very expensive for our family, and I have not been able to find steady',
  'work since the shop closed in March.',
  'I have been praying about it every morning but I confess that lately I have',
  'found it hard to keep believing that things will change for us.',
  'Please pray for my family, and for me to have patience and faith.',
].join(' ');

(async () => {
  const browser = await chromium.launch(launchOptions);
  const iPhone = devices['iPhone 13'] || { viewport: { width: 390, height: 844 } };
  const context = await browser.newContext({ ...iPhone });
  const page = await context.newPage();

  // Sign in to the sample data and open a conversation.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const maria = page.getByText(/Maria Santos/i).first();
  if (await maria.count()) await maria.click();
  await page.waitForTimeout(1400);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) await consent.first().click().catch(() => {});
  await page.waitForTimeout(600);

  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const card = page.locator('[data-quest="seeker-card"]').first();
  if (await card.count()) await card.click();
  await page.waitForTimeout(1200);
  // The conversation is in the Talk bubble (30 September 2026); Message opens it.
  await openChat(page);
  await page.waitForTimeout(1600);

  const box = page.locator('[data-quest="chat-send"] textarea').first();
  ok(await box.count() > 0, 'the composer is a textarea, not a single-line input');
  if (!(await box.count())) {
    console.log('\nRESULT: cannot continue without the composer');
    await browser.close();
    process.exit(1);
  }

  const before = await box.evaluate((el) => el.getBoundingClientRect().height);

  await box.click();
  await box.fill(LONG);
  await page.waitForTimeout(500);

  const after = await box.evaluate((el) => el.getBoundingClientRect().height);
  ok(after > before + 20, `the box grows as you write (${Math.round(before)}px -> ${Math.round(after)}px)`);

  // Everything written is reachable: either it all fits, or the box scrolls.
  const reachable = await box.evaluate((el) => {
    const fits = el.scrollHeight <= el.clientHeight + 2;
    const scrolls = getComputedStyle(el).overflowY === 'auto' || getComputedStyle(el).overflowY === 'scroll';
    return { fits, scrolls };
  });
  ok(reachable.fits || reachable.scrolls,
     'all of the text is reachable — it either fits or the box scrolls');

  // The cap has to hold: Send must still be on screen, or you cannot send what
  // you just managed to write.
  const view = page.viewportSize();
  const sendBox = await page.locator('[data-quest="chat-send"] button[type="submit"]').first()
    .boundingBox().catch(() => null);
  ok(sendBox !== null && sendBox.y >= 0 && sendBox.y + sendBox.height <= view.height + 1,
     'the Send button is still on screen with a long message in the box');

  // And the page itself must not have started scrolling sideways.
  const wide = await page.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  ok(!wide, 'the page does not scroll sideways while composing');

  // Send it, then check it can be read back in full.
  await page.locator('[data-quest="chat-send"] button[type="submit"]').first().click();
  await page.waitForTimeout(1200);

  const bubble = page.getByText(/has been on my heart/i).first();
  ok(await bubble.count() > 0, 'the long message appears in the thread');

  if (await bubble.count()) {
    const readable = await bubble.evaluate((el) => {
      // Walk up to the scrolling thread and confirm the whole bubble can be
      // brought into view, rather than being clipped away.
      const style = getComputedStyle(el);
      const clipped = style.overflow === 'hidden'
        && el.scrollHeight > el.clientHeight + 2;
      let node = el.parentElement;
      let scroller = null;
      while (node && !scroller) {
        const s = getComputedStyle(node);
        if (s.overflowY === 'auto' || s.overflowY === 'scroll') scroller = node;
        node = node.parentElement;
      }
      return { clipped, hasScroller: Boolean(scroller) };
    });
    ok(!readable.clipped, 'the message bubble is not clipped');
    ok(readable.hasScroller, 'the thread it sits in can be scrolled');
  }

  await browser.close();
  console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
