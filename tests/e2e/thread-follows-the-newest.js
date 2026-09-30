// A conversation opens on the newest message, and follows the one you send.
//
// THE BUG, from a phone: "when I message, it should always track to the latest."
// The screenshot showed the last reply half hidden behind the composer.
//
// There was no scrolling code in the thread AT ALL. It is a fixed-height box
// with `overflow-y-auto`, so it opened at scroll position ZERO — the oldest
// message in the conversation — and stayed there. Sending appended the new
// message below the fold, out of sight.
//
// It survived because a short conversation fits: you only meet this once there
// is more history than the box. So this test makes sure there IS more.
//
//   npm run build && node scripts/run-next.mjs start -p 4402
//   node tests/e2e/thread-follows-the-newest.js 4402

const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4402';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function signInAs(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const pick = page.getByText(who).first();
  if (await pick.count()) await pick.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it|Agree|OK/i });
  if (await consent.count()) await consent.first().click().catch(() => {});
  await page.waitForTimeout(800);
}

/** Where the thread is scrolled, and how far it could scroll. */
const where = (page) => page.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find(
    (d) => d.scrollHeight > d.clientHeight + 8 && /overflow-y-auto/.test(d.className || ''),
  );
  if (!el) return null;
  return {
    top: Math.round(el.scrollTop),
    max: Math.round(el.scrollHeight - el.clientHeight),
    fromBottom: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight),
  };
});

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 412, height: 780 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();

  await signInAs(page, /Maria Santos/i);
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const first = page.locator('[data-quest="seeker-card"]').first();
  ok(await first.count() > 0, 'there is an Explorer to open');
  await first.click();
  await page.waitForTimeout(1800);

  const boxSel = 'textarea, input[placeholder*="message" i]';
  const write = page.locator(boxSel).first();
  ok(await write.count() > 0, 'the conversation has somewhere to write');

  // MAKE THE THREAD LONGER THAN THE BOX. Without this the whole bug is
  // invisible, because everything already fits and scrollTop 0 IS the bottom.
  for (let i = 1; i <= 14; i++) {
    await write.fill(`Filling the thread, message ${i}`);
    await page.getByRole('button', { name: /^Send$/i }).first().click();
    await page.waitForTimeout(160);
  }
  await page.waitForTimeout(900);

  const sent = await where(page);
  ok(sent !== null, 'the thread scrolls, so there is more history than fits');
  if (sent) {
    ok(sent.max > 0, `and it really is taller than the box (${sent.max}px of scroll)`);
    ok(sent.fromBottom <= 48,
      `after sending, the newest message is in view (${sent.fromBottom}px from the bottom)`);
    if (sent.fromBottom > 48) {
      // Where the thread and the page stood, so a failure on a browser nobody
      // here can open says more than "no". Safari read 19px here on every run
      // until the bar began to step aside in a conversation, then 53px.
      const stood = await page.evaluate(() => {
        const el = [...document.querySelectorAll('div')].find(
          (d) => d.scrollHeight > d.clientHeight + 8 && /overflow-y-auto/.test(d.className || ''),
        );
        const r = el.getBoundingClientRect();
        const bar = document.querySelector('.tab-bar');
        return `thread ${Math.round(r.top)}..${Math.round(r.bottom)} of ${innerHeight}, page scrolled ${Math.round(scrollY)}; `
          + `bar ${bar ? getComputedStyle(bar).display : 'absent'}, --tab-bar ${getComputedStyle(document.documentElement).getPropertyValue('--tab-bar') || 'unset'}`;
      });
      console.log(`    ${stood}`);
    }
  }

  // The message just sent must be ON SCREEN, not merely in the DOM.
  const lastVisible = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('p, div')].filter(
      (n) => n.textContent && n.textContent.trim() === 'Filling the thread, message 14',
    );
    const el = nodes[nodes.length - 1];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight };
  });
  ok(lastVisible !== null, 'the message just sent is on the page');
  if (lastVisible) {
    ok(lastVisible.bottom <= lastVisible.vh + 2 && lastVisible.top >= 0,
      `and it is inside the screen, not below it (${lastVisible.top}..${lastVisible.bottom} of ${lastVisible.vh})`);
  }

  // ARRIVING AT A LONG THREAD lands at the bottom, not the top.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const arrived = await where(page);
  ok(arrived !== null, 'the reloaded thread still scrolls');
  if (arrived) {
    ok(arrived.fromBottom <= 48,
      `opening a long conversation lands on the newest message (${arrived.fromBottom}px from the bottom)`);
    ok(arrived.top > 0, 'rather than at the very top, where it used to open');
  }

  // READING HISTORY IS NOT INTERRUPTED. Scroll up, and stay up.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(
      (d) => d.scrollHeight > d.clientHeight + 8 && /overflow-y-auto/.test(d.className || ''),
    );
    if (el) el.scrollTop = 0;
  });
  await page.waitForTimeout(600);
  const parked = await where(page);
  ok(parked !== null && parked.top === 0, 'a reader can scroll back to the beginning');
  await page.waitForTimeout(1200);
  const stillParked = await where(page);
  ok(stillParked !== null && stillParked.top === 0,
    'and is not yanked back down while nothing new has arrived');

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} BAD`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
