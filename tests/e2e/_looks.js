// What the walks through the looks share: signing in to the sample church,
// choosing a look in Settings, and measuring whether text can be read.
// Used by fresh-looks.js and frutiger-aero-looks.js.
const assert = require('node:assert/strict');

async function signIn(page, base, name) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
  await page.getByText(name, { exact: true }).first().click();
  await page.waitForTimeout(1000);
  const consent = page.getByRole('button', { name: /I understand, continue/i });
  if (await consent.isVisible()) await consent.click();
}

/**
 * Choose a look in Settings, General. A look in a family (Frutiger Aero) is
 * inside a drop-down that may be closed, so it is opened first, the way a
 * person would.
 */
async function choose(page, base, id) {
  await page.goto(`${base}/settings?room=general`, { waitUntil: 'networkidle' });
  const button = page.locator(`[data-ui-theme-choice="${id}"]`);
  if (!(await button.isVisible())) {
    const family = page.locator('[data-look-family]').filter({ has: button });
    await family.locator('button[aria-expanded="false"]').click();
  }
  await button.click();
  await page.waitForFunction((look) => document.documentElement.dataset.uiTheme === look, id);
  assert.equal(await button.getAttribute('aria-checked'), 'true');
}

// Measure the actual foreground against the nearest painted background,
// compositing translucent fills rather than assuming every card is white.
async function readable(locator, label) {
  assert.ok(await locator.isVisible(), `${label} is visible`);
  const ratio = await locator.evaluate((el) => {
    // rgb()/rgba() are 0 to 255. A colour mixed in CSS (color-mix, the
    // Frutiger Aero looks' glass) comes back as color(srgb r g b / a), 0 to 1:
    // read as 0 to 255, a white card measured as nearly black.
    const rgba = (value) => {
      const n = value.match(/[\d.]+/g)?.map(Number) ?? [];
      const scale = /^color\(srgb\b/.test(value) ? 255 : 1;
      return [(n[0] ?? 0) * scale, (n[1] ?? 0) * scale, (n[2] ?? 0) * scale, n[3] ?? 1];
    };
    const layers = [];
    for (let at = el; at; at = at.parentElement) layers.unshift(rgba(getComputedStyle(at).backgroundColor));
    let bg = [255, 255, 255];
    for (const c of layers) bg = bg.map((v, i) => c[i] * c[3] + v * (1 - c[3]));
    const color = rgba(getComputedStyle(el).color);
    let opacity = color[3];
    for (let at = el; at; at = at.parentElement) opacity *= Number(getComputedStyle(at).opacity);
    const fg = bg.map((v, i) => color[i] * opacity + v * (1 - opacity));
    const lum = (c) => c.map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const a = lum(fg), b = lum(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  assert.ok(ratio >= 4.5, `${label}: ${ratio.toFixed(2)}:1, requires 4.5:1`);
}

module.exports = { signIn, choose, readable };
