// A tutorial must not close the chat while its intended control is mounting.
// Removing the real composer's anchor for two measurement ticks reproduces the
// delayed mount deterministically. The Message fallback remains on the page,
// outside the sheet; it is guidance into the chat, not a reason to close it.
const assert = require('node:assert/strict');
const { browser, launchOptions } = require('./_playwright');
const BASE = `http://localhost:${process.argv[2] || '4001'}`;

(async () => {
  const instance = await browser.launch(launchOptions);
  try {
    const context = await instance.newContext({
      viewport: { width: 412, height: 820 },
      serviceWorkers: 'block',
    });
    // This walk uses only the fictional sample. Refuse any external backend.
    await context.route(/^https?:\/\//, (route) =>
      new URL(route.request().url()).origin === BASE ? route.continue() : route.abort(),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.locator('[data-quest-track="ds"]').first().click();
    await page.waitForURL('**/ds');
    const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
    if (await consent.count()) await consent.first().click();
    await page.locator('[aria-label="Beacon tutorial"]').waitFor({ state: 'visible' });
    await page.locator('[data-message-button]').first().click();
    const sheet = page.locator('[data-talk-sheet]');
    const composer = page.locator('[data-quest="chat-send"]');
    await sheet.waitFor({ state: 'visible' });
    await composer.waitFor({ state: 'visible' });
    assert.match(await page.locator('[aria-label="Beacon tutorial"]').textContent(), /Say hello/);
    console.log('OK the Explorer tutorial opens a real conversation sheet');

    await page.evaluate(() => {
      const anchor = document.querySelector('[data-quest="chat-send"]');
      const state = { anchor, closed: 0 };
      state.onClose = () => { state.closed += 1; };
      window.__tutorialChatMount = state;
      window.addEventListener('beacon:close-talk', state.onClose);
      anchor.removeAttribute('data-quest');
      window.dispatchEvent(new Event('resize'));
    });
    // Longer than both the sheet's exit timer and two 350ms tutorial ticks.
    await page.waitForTimeout(900);
    const delayed = await page.evaluate(() => {
      const state = window.__tutorialChatMount;
      const result = {
        closed: state.closed,
        sheet: !!document.querySelector('[data-talk-sheet]'),
        missing: !document.querySelector('[data-quest="chat-send"]'),
      };
      state.anchor.setAttribute('data-quest', 'chat-send');
      window.removeEventListener('beacon:close-talk', state.onClose);
      delete window.__tutorialChatMount;
      window.dispatchEvent(new Event('resize'));
      return result;
    });
    assert.deepEqual(delayed, { closed: 0, sheet: true, missing: true },
      'waiting for the chat target must not close the conversation through its outside fallback');
    console.log('OK a delayed chat target leaves the conversation open');

    await page.waitForFunction(() => {
      const ring = [...document.querySelectorAll('div')].find((node) =>
        (node.style.boxShadow || '').includes('9999px'));
      if (!ring) return false;
      const rect = ring.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return hit?.closest('[data-quest]')?.getAttribute('data-quest') === 'chat-send';
    });
    const message = 'A fictional note from the delayed-chat tutorial check.';
    await composer.locator('textarea').fill(message);
    await composer.getByRole('button', { name: 'Send', exact: true }).click();
    await sheet.getByText(message, { exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() =>
      document.querySelector('[aria-label="Beacon tutorial"]')?.textContent.includes('React or reply'));
    console.log('OK the restored target highlights, sends, and advances the tutorial');
  } finally {
    await instance.close();
  }
})().catch((error) => { console.error(error); process.exit(1); });
