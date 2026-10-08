const { chromium, launchOptions } = require('./_playwright');
const BASE = `http://localhost:${process.argv[2] || '3100'}`;
let bad = 0;
const ok = (condition, message) => {
  if (!condition) bad++;
  console.log(`${condition ? 'OK ' : 'BAD'} ${message}`);
};
const mobile = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
(async () => {
  const browser = await chromium.launch(launchOptions);
  for (const [width, height] of [[360, 800], [768, 1024], [1440, 1000]]) {
    const context = await browser.newContext({ viewport: { width, height }, userAgent: width < 1000 ? mobile : mac });
    const page = await context.newPage();
    await page.goto(`${BASE}/privacy`, { waitUntil: 'networkidle' });
    await page.getByText('Technical administration.', { exact: true }).waitFor({ state: 'visible' });
    await page.waitForTimeout(800);
    ok(await page.locator('[data-install-prompt]').count() === 0, `${width}px: the install card does not cover the privacy notice`);
    ok(await page.getByText('Technical administration.', { exact: true }).count() === 1, `${width}px: operator access is disclosed`);
    ok(await page.evaluate(() => !document.documentElement.style.getPropertyValue('--install-bar')), `${width}px: no empty install space remains`);
    await page.getByRole('link', { name: /Back to/ }).click();
    await page.waitForTimeout(800);
    ok(await page.locator('[data-install-prompt]').count() > 0, `${width}px: install guidance remains available on an ordinary page`);
    await context.close();
  }
  await browser.close();
  console.log(bad ? `RESULT: ${bad} FAILURE(S)` : 'RESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})().catch(error => { console.error(error); process.exit(1); });
