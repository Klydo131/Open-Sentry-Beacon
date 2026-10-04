// Frutiger Aero: five looks under one row in Settings, Look, that opens to
// show them, each with its picture and what it is like.
//
// Asked for on 4 October 2026, with four design sheets: "Can we make more UI
// theme for fruteger aero, as sub file for 'look' so people can see the
// difference. Please make subfiles with drop down on it (with description)".
//
// What a person does, in order: finds the row, opens it, sees five looks with
// a picture and a description each, chooses one, and finds the whole app in it
// (the Menu with its own drawing and words, readable, nothing sideways),
// still chosen after a reload, with the row open on it. Then back to Classic.
// The invented sample church only. A phone and a computer.
//
//   node tests/e2e/frutiger-aero-looks.js [port]
const { browser: engine, launchOptions, pageErrors } = require('./_playwright');
const { signIn, choose, readable } = require('./_looks');

const BASE = `http://localhost:${process.argv[2] || '4414'}`;

// The five, as the registry lists them (lib/ui-themes.ts).
const AERO = [
  ['aero-eco', 'Frutiger Eco'],
  ['aero-dark', 'Dark Aero'],
  ['aero-technozen', 'Technozen'],
  ['aero-dorfic', 'DORFic'],
  ['aero-colors', 'Four Colors'],
];

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };
/** Whether a picture loads: waits for it, up to five seconds, rather than asking once. */
const loads = (img) => img.evaluate((el) => (el.complete && el.naturalWidth > 0) || new Promise((done) => {
  el.addEventListener('load', () => done(el.naturalWidth > 0), { once: true });
  el.addEventListener('error', () => done(false), { once: true });
  setTimeout(() => done(el.complete && el.naturalWidth > 0), 5000);
}));
/** A readable() that reports instead of stopping the walk. */
const reads = (locator, label) => readable(locator, label).then(() => ok(true, label), (e) => ok(false, e.message));

(async () => {
  const browser = await engine.launch(launchOptions);
  for (const [size, width, height] of [['phone', 390, 844], ['computer', 1440, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, hasTouch: size === 'phone' });
    // The install invitation is not what this walk is about.
    await context.addInitScript(() => localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864000000)));
    const page = await context.newPage();
    const errors = pageErrors(page);
    await signIn(page, BASE, 'Maria Santos');

    // 1. THE ROW: closed, named, described, its looks not yet shown.
    await page.goto(`${BASE}/settings?room=general`, { waitUntil: 'networkidle' });
    const family = page.locator('[data-look-family="aero"]');
    const toggle = family.locator('button[aria-expanded]');
    ok(await toggle.isVisible() && /Frutiger Aero/.test(await toggle.innerText()),
       `${size}: Settings, Look has a Frutiger Aero row`);
    ok(/glass/i.test(await toggle.innerText()) && /5 looks/.test(await toggle.innerText()),
       `${size}: it says what the family is like and how many looks it holds`);
    ok(await toggle.getAttribute('aria-expanded') === 'false'
       && !(await page.locator('[data-ui-theme-choice="aero-eco"]').isVisible()),
       `${size}: it starts closed while Classic is chosen`);

    // 2. OPENED: five looks, each with a picture that loaded and a description.
    await toggle.click();
    ok(await toggle.getAttribute('aria-expanded') === 'true', `${size}: one tap opens it`);
    for (const [id, name] of AERO) {
      const choice = page.locator(`[data-ui-theme-choice="${id}"]`);
      const shown = await choice.isVisible();
      const text = shown ? await choice.innerText() : '';
      const picture = shown && await loads(choice.locator('img'));
      ok(shown && text.includes(name) && text.length > name.length + 30 && picture,
         `${size}: ${name} is shown with its picture and its description`);
    }

    // 3. EACH ONE, CHOSEN: on the page, on the Menu, readable, nothing sideways.
    for (const [id, name] of AERO) {
      await choose(page, BASE, id);
      ok(/chosen/.test(await toggle.innerText()) && (await toggle.innerText()).includes(name),
         `${size}: the row says ${name} is chosen`);
      await page.reload({ waitUntil: 'networkidle' });
      ok(await page.evaluate((look) => document.documentElement.dataset.uiTheme === look, id)
         && await toggle.getAttribute('aria-expanded') === 'true'
         && await page.locator(`[data-ui-theme-choice="${id}"]`).getAttribute('aria-checked') === 'true',
         `${size}: ${name} is still chosen after a reload, and its row opens on it`);

      await page.goto(`${BASE}/menu`, { waitUntil: 'networkidle' });
      const art = page.locator('.fresh-art');
      ok(await art.getAttribute('src') === `/themes/${id}.svg` && await loads(art),
         `${size}: ${name}'s Menu shows its own drawing`);
      await reads(page.locator('.fresh-hero h2'), `${size}: ${name} welcome`);
      await reads(page.locator('.fresh-intro'), `${size}: ${name} welcome line`);
      await reads(page.locator('[data-theme-room] strong').first(), `${size}: ${name} room name`);
      await reads(page.locator('.fresh-room-copy > span').first(), `${size}: ${name} room description`);
      await reads(page.locator('.menu-group-head').first(), `${size}: ${name} section label`);
      const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      ok(sideways <= 0, `${size}: ${name} does not scroll sideways (overflow ${sideways}px)`);
      if (size === 'computer') {
        await reads(page.locator('[data-desktop-nav] nav a').first(), `${size}: ${name} sidebar room`);
      } else {
        await reads(page.locator('.tab-bar-tab').first(), `${size}: ${name} bottom bar`);
      }
      await page.screenshot({ path: `.ui-check/aero-${id}-${size}.png`, fullPage: false }).catch(() => {});
    }

    // 4. BACK TO CLASSIC, and the row closes again on its own.
    await choose(page, BASE, 'classic');
    await page.reload({ waitUntil: 'networkidle' });
    ok(await toggle.getAttribute('aria-expanded') === 'false' && /5 looks/.test(await toggle.innerText()),
       `${size}: Classic chosen again, the row is closed and says 5 looks`);
    await page.goto(`${BASE}/menu`, { waitUntil: 'networkidle' });
    ok(await page.locator('[data-fresh-menu]').count() === 0, `${size}: and the Menu is Classic's`);

    const seen = errors.list();
    ok(seen.length === 0, `${size}: no page errors (${seen.slice(0, 1).join('') || 'none'})`);
    await context.close();
  }
  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
