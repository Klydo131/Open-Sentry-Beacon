// The room's colours work under every look, not only Classic.
//
// Asked for on 4 October 2026, with a picture of the Office swatches on the
// desk: "This colors doesnt work for other Themes in settings, please
// integrate it too". Under Beacon, Study and Focus the look painted over the
// palette, so choosing one changed nothing. Now the first swatch is the
// look's own colours and the others recolour it in the look's own light
// (lib/room-theme.ts, atTheLook): Warm Office under Focus is a warm dark, and
// Slate under Beacon a cool light. The arithmetic is checked for every look
// and palette by tests/room-colours-keep-the-look-light.mjs; this walk checks
// what the browser actually paints, and that no text on the pages a Guide
// uses most becomes harder to read than it is in the look itself.
//
// Walked as the sample Guide, whose swatches are the Office ones, on a
// computer (the desk is a column) and on a phone (the desk is a drawer).
//
//   npm run build && node scripts/run-next.mjs start -p 4417
//   node tests/e2e/room-colours-in-every-look.js 4417

const { chromium, launchOptions } = require('./_playwright');

const PORT = process.argv[2] || '4417';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const channels = (css) => (css.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lum = (css) => {
  const [r, g, b] = channels(css).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const rgb = (hex) => {
  const n = hex.replace('#', '');
  return `rgb(${parseInt(n.slice(0, 2), 16)}, ${parseInt(n.slice(2, 4), 16)}, ${parseInt(n.slice(4, 6), 16)})`;
};

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.getByText('Maria Santos').first().click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand, continue/i }).first();
  if (await consent.isVisible().catch(() => false)) { await consent.click(); await page.waitForTimeout(500); }
}

async function setLook(page, look, where = '/church') {
  await page.evaluate((l) => localStorage.setItem('beacon-ui-theme', l), look);
  await page.goto(`${BASE}${where}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
}

async function choose(page, key, scope = '') {
  await page.locator(`${scope}[data-room-palette="${key}"]`).first().click();
  await page.waitForTimeout(500);
}

// What the page shows: the page itself, a card, which swatch is on, and what
// the chosen swatch draws (its first colour is the page it promises).
const seen = (page) => page.evaluate(() => {
  const css = (el, p) => (el ? getComputedStyle(el)[p] : '');
  const pressed = document.querySelector('[data-room-palette][aria-pressed="true"]');
  return {
    page: css(document.body, 'backgroundColor'),
    card: css(document.querySelector('main .bg-white'), 'backgroundColor'),
    pressed: pressed ? pressed.getAttribute('data-room-palette') : null,
    pressedName: pressed ? pressed.getAttribute('aria-label') : null,
    promised: pressed ? (/rgba?\([^)]*\)/.exec(css(pressed, 'backgroundImage')) || [''])[0] : '',
    swatches: [...document.querySelectorAll('[data-room-palette]')].map((b) => b.getAttribute('data-room-palette')),
  };
});

// Every piece of text on the page under 3:1 against what is really behind it,
// see-through backgrounds blended. Returned as "text|classes" so two looks can
// be compared: what a palette must not do is add to the look's own list.
const hardToRead = (page) => page.evaluate(() => {
  const parse = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b, a] = m.map(Number); return { r, g, b, a: m.length > 3 ? a : 1 }; };
  const over = (t, u) => ({ r: t.r * t.a + u.r * (1 - t.a), g: t.g * t.a + u.g * (1 - t.a), b: t.b * t.a + u.b * (1 - t.a), a: 1 });
  const L = (c) => { const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const behind = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== 'none') {
        const stop = /rgba?\([^)]*\)/.exec(s.backgroundImage);
        if (!stop) return null;
        const c = parse(stop[0]); layers.push(c); if (c.a >= 0.99) break;
      }
      const c = parse(s.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 0.99) break; }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = layers[i].a >= 0.99 ? layers[i] : over(layers[i], base);
    return base;
  };
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('svg,[aria-hidden="true"],.sr-only')) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect(); if (r.width < 3 || r.height < 3) continue;
    const s = getComputedStyle(el); if (s.visibility === 'hidden') continue;
    const bg = behind(el); if (!bg) continue;
    let fg = parse(s.color); if (fg.a < 1) fg = over(fg, bg);
    const a = L(fg), b = L(bg);
    if ((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) < 3) out.push(`${el.textContent.trim().slice(0, 30)}|${el.className}`);
  }
  return out;
});

// The pages where a first version left text unreadable.
const PAGES = ['/dm', '/settings'];
async function noWorseThanTheLook(page, look, key, label) {
  const added = [];
  for (const where of PAGES) {
    await setLook(page, look);
    await choose(page, 'look-own');
    await page.goto(`${BASE}${where}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const own = new Set(await hardToRead(page));
    await setLook(page, look);
    await choose(page, key);
    await page.goto(`${BASE}${where}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    for (const x of await hardToRead(page)) if (!own.has(x)) added.push(`${where}: ${x.split('|')[0]}`);
  }
  ok(added.length === 0,
     `${label}: no text on ${PAGES.join(' or ')} is harder to read than in the look itself${added.length ? ` (${added.slice(0, 4).join('; ')})` : ''}`);
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  // 1. A COMPUTER: THE DESK IS A COLUMN.
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addInitScript(() => {
      try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 3650 * 864e5)); } catch { /* fine */ }
      // Every frame's page colour, and whether the page's content is drawn yet.
      window.__frames = [];
      const t0 = performance.now();
      const tick = () => {
        if (document.body) {
          const main = document.querySelector('main');
          window.__frames.push([getComputedStyle(document.body).backgroundColor, !!(main && main.textContent.trim().length > 20)]);
        }
        if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await signIn(page);

    // CLASSIC IS AS IT WAS: four Office swatches, The Desk on.
    await setLook(page, 'classic');
    let s = await seen(page);
    ok(s.swatches.join(',') === 'desk,slate,study,focus' && s.pressed === 'desk',
       `Classic: the four Office colours, The Desk chosen (${s.swatches.join(', ')})`);

    // FOCUS: its own colours first, and chosen, under a name of their own.
    await setLook(page, 'focus');
    s = await seen(page);
    ok(s.swatches[0] === 'look-own' && s.swatches.length === 5 && s.pressed === 'look-own',
       `Focus: its own colours come first and are chosen (${s.swatches.join(', ')})`);
    ok(s.pressedName === "Focus's own", `and are called "Focus's own", not "Focus", the Office palette (${s.pressedName})`);
    ok(s.page === rgb('#081324'), `Focus: the page is Focus's night blue (${s.page})`);
    const focusOwn = s;

    // WARM OFFICE RECOLOURS FOCUS, IN FOCUS'S DARK.
    await choose(page, 'study');
    s = await seen(page);
    const [r, , b] = channels(s.page);
    ok(s.pressed === 'study', 'Focus: Warm Office is chosen');
    ok(s.page !== focusOwn.page && r > b, `Focus + Warm Office: the page turns warm (${s.page})`);
    ok(contrast(s.page, focusOwn.page) < 1.05, `and stays as dark as Focus's own (${contrast(s.page, focusOwn.page).toFixed(2)}:1 from it)`);
    ok(s.page === s.promised, `and is exactly what its swatch drew (${s.promised})`);
    ok(s.card !== focusOwn.card && contrast(s.card, focusOwn.card) < 1.05,
       `and the cards follow, at Focus's own brightness (${s.card})`);
    const header = await page.evaluate(() => getComputedStyle(document.querySelector('[data-app-header]')).backgroundColor);
    ok(header !== s.page, `and the top bar is the palette's card colour, not lost in the page (${header})`);

    // IT IS REMEMBERED, FOR FOCUS, AND IS THERE WHEN THE PAGE IS.
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const again = await seen(page);
    ok(again.pressed === 'study' && again.page === s.page, 'Focus + Warm Office is still chosen after a reload');
    // Applied in an effect, the page's content showed in Focus's own blue for
    // 60 to 120 ms first. Measured on 4 October 2026.
    const frames = await page.evaluate(() => window.__frames);
    const early = frames.filter(([colour, content]) => content && colour !== again.page).length;
    ok(frames.some(([, content]) => content) && early === 0,
       `and no frame draws the page's content in Focus's own colours first (${early} of ${frames.length} frames did)`);

    // BEACON KEEPS ITS OWN: the choice belongs to the look it was made in.
    await setLook(page, 'beacon');
    s = await seen(page);
    ok(s.pressed === 'look-own' && s.page === rgb('#edf7ff'),
       `Beacon still opens in its own colours (${s.page}); Focus's choice is Focus's`);
    const beaconOwn = s;
    await choose(page, 'slate');
    s = await seen(page);
    ok(s.page !== beaconOwn.page && s.page === s.promised && contrast(s.page, beaconOwn.page) < 1.05,
       `Beacon + Slate: Slate's cool grey-blue in Beacon's light, as its swatch drew (${s.page})`);

    // NOTHING BECOMES HARDER TO READ. Measured before the fix: a cream
    // palette under Focus left Focus's pale red at 1.5:1, and Slate under
    // Beacon left grey on grey at 1.1:1.
    await noWorseThanTheLook(page, 'focus', 'study', 'Focus + Warm Office');
    await noWorseThanTheLook(page, 'beacon', 'slate', 'Beacon + Slate');

    // BACK TO THE LOOK'S OWN.
    await setLook(page, 'focus');
    await choose(page, 'study');
    await choose(page, 'look-own');
    s = await seen(page);
    ok(s.pressed === 'look-own' && s.page === focusOwn.page && s.card === focusOwn.card,
       'choosing the look\'s own colours puts Focus back exactly as it was');
    const leftover = await page.evaluate(() => document.body.style.getPropertyValue('--look-page'));
    ok(leftover === '', 'and nothing of the palette is left on the page');

    // CLASSIC IS UNTOUCHED BY ANY OF IT.
    await setLook(page, 'classic');
    s = await seen(page);
    const surface = await page.evaluate(() => getComputedStyle(document.querySelector('.room-surface')).backgroundImage);
    ok(s.pressed === 'desk' && /245, 247, 251/.test(surface),
       'Classic still shows The Desk, the choice made in Classic, with its own wash');

    ok(errors.length === 0, `computer: no errors in the page${errors.length ? `: ${errors[0]}` : ''}`);
    await context.close();
  }

  // 2. A PHONE: THE DESK IS A DRAWER, AND IT WORKS THERE TOO.
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => {
      try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 3650 * 864e5)); } catch { /* fine */ }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await signIn(page);
    await setLook(page, 'study');
    const studyOwn = await seen(page);
    await page.locator('[data-desk-tab]').click();
    await page.waitForTimeout(600);
    await choose(page, 'slate', '[data-desk-drawer] ');
    const s = await seen(page);
    ok(s.page !== studyOwn.page && s.page === s.promised,
       `phone, Study + Slate from the drawer: the page follows, as the swatch drew (${s.page})`);
    const drawer = await page.evaluate(() => {
      const card = document.querySelector('[data-desk-drawer] .rounded-2xl');
      return {
        card: card ? getComputedStyle(card).backgroundColor : '',
        panel: getComputedStyle(document.body).getPropertyValue('--look-panel').trim(),
      };
    });
    ok(drawer.card === rgb(drawer.panel) && drawer.card !== rgb('#fffbf2'),
       `and so does the desk in the drawer (${drawer.card}, not Study's own card colour)`);
    // Behind the cards the drawer was Classic's grey in every look until 4
    // October 2026, a light strip around Focus's dark cards.
    const ground = await page.evaluate(() => getComputedStyle(document.querySelector('[data-desk-drawer]')).backgroundColor);
    ok(ground === s.page, `and the drawer behind them is the page's colour, not Classic's grey (${ground})`);
    ok(errors.length === 0, `phone: no errors in the page${errors.length ? `: ${errors[0]}` : ''}`);
    await context.close();
  }

  await browser.close();
  console.log(bad ? `RESULT: ${bad} BAD` : 'RESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
