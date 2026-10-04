// Choose the new looks, read them at three sizes, and return to unchanged Classic.
// Only the invented sample church is used. Screenshots stay in ignored .ui-check.
// Run against a production server: node tests/e2e/fresh-looks.js PORT
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { browser: engine, launchOptions, openChat, pageErrors } = require('./_playwright');
const looks = require('./_looks');
const BASE = `http://localhost:${process.argv[2] || '4414'}`;
const shots = path.resolve('.ui-check/looks', process.env.E2E_BROWSER || 'chromium');
fs.mkdirSync(shots, { recursive: true });

// Signing in, choosing a look and measuring text are shared with the Frutiger
// Aero walk (_looks.js); BASE is this walk's server.
const signIn = (page, name) => looks.signIn(page, BASE, name);
const choose = (page, id) => looks.choose(page, BASE, id);
const { readable } = looks;

async function menuFingerprint(page) {
  return page.evaluate(() => ['body', 'header', '.room-surface', '.menu-group', '.menu-row', 'h1', '.tab-bar'].map((selector) => {
    const s = getComputedStyle(document.querySelector(selector));
    return [s.color, s.backgroundColor, s.backgroundImage, s.fontFamily, s.fontSize, s.borderRadius];
  }));
}

(async () => {
  const browser = await engine.launch(launchOptions);
  try {
    for (const [size, width, height] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 1000]]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: size !== 'desktop' });
      await context.addInitScript(() => localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864000000)));
      const page = await context.newPage();
      // WebKit's cancelled prefetch is not an error, and nor is the app's
      // release check cut short by this walk's own next page load; _playwright.js
      // says why for both. Of the five Safari runs read on 4 October 2026, the
      // release check failed this walk on three and the prefetch on none.
      const errors = pageErrors(page);
      await signIn(page, 'Maria Santos');
      await choose(page, 'classic');
      await page.goto(`${BASE}/menu`, { waitUntil: 'networkidle' });
      const classic = await menuFingerprint(page);
      const classicRooms = await page.locator('.menu-row[href]').evaluateAll((links) => links.map((l) => l.getAttribute('href')).filter((href) => href !== '/profile').sort());
      await page.screenshot({ path: path.join(shots, `classic-${size}.png`), fullPage: true });
      for (const look of ['beacon', 'study', 'focus']) {
        await choose(page, look);
        await readable(page.locator(`[data-ui-theme-choice="${look}"]`), `${look} chosen option`);
        await readable(page.locator('[data-ui-theme-choice="classic"]'), `${look} other option`);
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForFunction((id) => document.documentElement.dataset.uiTheme === id, look);
        await page.goto(`${BASE}/menu`, { waitUntil: 'networkidle' });
        await readable(page.locator('h1'), `${look} heading at ${size}`);
        await readable(page.locator('[data-theme-room] strong').first(), `${look} room label at ${size}`);
        await readable(page.locator('.fresh-intro'), `${look} welcome text at ${size}`);
        assert.match(await page.locator('.fresh-hero h2').evaluate((el) => getComputedStyle(el).fontFamily), /sans-serif/, `${look} heading has a portable native fallback`);
        await readable(page.locator('.menu-group-head').first(), `${look} section label at ${size}`);
        await readable(page.locator(width >= 1280 ? '[data-desktop-nav] nav a' : '.tab-bar-tab').first(), `${look} navigation at ${size}`);
        if (width < 1280) await readable(page.locator('.tab-bar-tab[aria-current] .tab-bar-pill'), `${look} selected navigation icon`);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${look} fits ${size}`);
        assert.equal(await page.locator('[data-desktop-nav]').count(), 1, `${look} keeps the existing desktop rail`);
        assert.deepEqual(await page.locator('[data-theme-room]').evaluateAll((links) => links.map((l) => l.getAttribute('href')).sort()), classicRooms, `${look} keeps every authorized room`);
        if (width >= 1280) {
          await readable(page.locator('[data-desktop-nav] .bg-white.text-navy').first(), `${look} real rail count`);
          // THE BAR'S THREE BUTTONS STAY ON PHONES AND PADS. On a computer the
          // rail is the rooms, the Guide's people and My Files among them, and
          // it does not repeat Menu | People | My Files above them (4 October
          // 2026: "This is not needed in Desktop I think, this is only for
          // mobile and pad").
          const goesTo = (href) => page.locator(`[data-desktop-nav] a[href="${href}"]`).count();
          assert.deepEqual(
            { menu: await goesTo('/menu'), people: await goesTo('/dm?room=people'), files: await goesTo('/library'), explorers: await goesTo('/dm') },
            { menu: 0, people: 0, files: 1, explorers: 1 },
            `${look} rail is the rooms, without the bar's three buttons repeated`);
        }
        await page.screenshot({ path: path.join(shots, `${look}-${size}.png`), fullPage: true });
        if (size === 'phone') {
          for (const probe of [320, 360, 768, 1024, 1194, 1279, 1280, 1366, 1920]) {
            await page.setViewportSize({ width: probe, height: 900 });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${look} reflows at ${probe}px`);
            assert.equal(await page.locator('[data-desktop-nav]').isVisible(), probe >= 1280, `${look} rail breakpoint at ${probe}px`);
            assert.equal(await page.locator('.tab-bar').isVisible(), probe < 1280, `${look} bottom tabs at ${probe}px`);
            const targets = await page.locator('[data-theme-room]').evaluateAll((links) => links.every((link) => link.getBoundingClientRect().height >= 56));
            assert.ok(targets, `${look} room targets stay generous at ${probe}px`);
          }
          await page.setViewportSize({ width, height });
          await page.evaluate(() => { document.documentElement.style.fontSize = '23.4px'; });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), `${look} fits enlarged text`);
          await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
        }
        assert.ok(await openChat(page), `${look} conversation opens`);
        await readable(page.locator('[data-message-text]').first(), `${look} message text`);
        await readable(page.locator('[data-chat-meta]').first(), `${look} message metadata`);
        await page.keyboard.press('Escape');
        await page.goto(`${BASE}/dm?room=people`, { waitUntil: 'networkidle' });
        const danger = page.locator('[data-danger]').first();
        await readable(danger, `${look} destructive control`);
        assert.ok(await danger.evaluate((el) => {
          const [r, g, b] = getComputedStyle(el).color.match(/\d+/g).map(Number);
          return r > g + 20 && r > b + 20;
        }), `${look} destructive control stays red`);
      }
      await choose(page, 'classic');
      await page.goto(`${BASE}/menu`, { waitUntil: 'networkidle' });
      assert.deepEqual(await menuFingerprint(page), classic, `Classic returns unchanged at ${size}`);
      if (size === 'phone') {
        const other = await context.newPage();
        await other.goto(`${BASE}/menu`, { waitUntil: 'networkidle' });
        await choose(page, 'beacon');
        await other.waitForFunction(() => document.documentElement.dataset.uiTheme === 'beacon' && !!document.querySelector('[data-fresh-menu]'));
        await choose(page, 'classic');
        await other.waitForFunction(() => document.documentElement.dataset.uiTheme === 'classic' && !document.querySelector('[data-fresh-menu]'));
        await other.close();
        await page.evaluate(() => {
          const set = Storage.prototype.setItem;
          Storage.prototype.setItem = function (key, value) {
            if (key === 'beacon-ui-theme') throw new DOMException('Storage refused', 'SecurityError');
            return set.call(this, key, value);
          };
        });
        await page.locator('[data-ui-theme-choice="focus"]').click();
        await page.waitForFunction(() => document.documentElement.dataset.uiTheme === 'focus');
        assert.equal(await page.locator('[data-ui-theme-choice="focus"]').getAttribute('aria-checked'), 'true');
        await page.locator('nav.tab-bar').getByRole('link', { name: 'Menu', exact: true }).click();
        await page.locator('[data-fresh-menu]').waitFor();
        assert.equal(await page.locator('html').getAttribute('data-ui-theme'), 'focus');
        await page.locator('[data-theme-room][href="/settings"]').click();
        // General is the default Settings folder, so this keeps the same tab
        // and tests the promised choice until reload, with writes still denied.
        await page.locator('[data-ui-theme-choice="classic"]').click();
        await page.locator('nav.tab-bar').getByRole('link', { name: 'Menu', exact: true }).click();
        await page.locator('.menu-row').first().waitFor();
        assert.equal(await page.locator('[data-fresh-menu]').count(), 0);
      }

      // An Explorer must still be able to report from the conversation itself.
      await signIn(page, 'John Reyes');
      for (const look of ['beacon', 'study', 'focus']) {
        await choose(page, look);
        await page.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
        assert.ok(await openChat(page));
        const report = page.locator('[data-talk-report]');
        await readable(report, `${look} Explorer report control`);
        await report.click();
        await readable(page.getByText(/This goes to your church/), `${look} report privacy notice`);
        const reason = page.locator('input[name="report-reason"]').first();
        await reason.check();
        await readable(reason.locator('..').locator('.text-navy'), `${look} selected report reason`);
        await readable(reason.locator('..').locator('.text-gray-600'), `${look} selected report explanation`);
        await readable(page.getByRole('button', { name: 'Send this report', exact: true }), `${look} gold action`);
        await page.keyboard.press('Escape');
        if (size === 'tablet') {
          await page.goto(`${BASE}/study`, { waitUntil: 'networkidle' });
          const count = page.locator('.sr-side-item[aria-current="true"] .opacity-60');
          await count.waitFor();
          assert.equal(await count.evaluate((el) => getComputedStyle(el).opacity), '1', `${look} selected sidebar count stays opaque`);
          await readable(count, `${look} selected Study Room count`);
        }
        // The same primary/muted utility combination used by message
        // timestamps and the local playlist player, exercised against real CSS.
        await page.evaluate(() => {
          const probe = document.createElement('div');
          probe.id = 'look-primary-probe';
          probe.className = 'bg-navy text-white p-4';
          const text = document.createElement('p');
          text.className = 'text-white/60';
          text.textContent = 'Timestamp';
          probe.append(text);
          document.body.append(probe);
        });
        await readable(page.locator('#look-primary-probe p'), `${look} primary surface metadata`);
        await page.locator('#look-primary-probe').evaluate((el) => el.remove());
      }
      assert.deepEqual(errors.list(), [], `no page errors at ${size}`);
      console.log(`OK Beacon, Study, Focus, Classic restoration and Explorer reporting at ${size}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
