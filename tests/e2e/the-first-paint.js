// The first frame a person sees is already in their look.
//
// Asked for on 3 October 2026: "fix the first paint flash too". The server
// cannot see which look a device chose, so every page arrived as Classic and
// React corrected it about a tenth of a second later. This walk notes the
// moment the look on <html> changes and the browser's own first-paint time,
// and checks which look was on the page when it first painted. Then, frame by
// frame, that the header is drawn in that look from its first frame on.
//
// WHY NOT SIMPLY THE FIRST ANIMATION FRAME. That was the first version, and it
// failed the sign-in page with the fix in place: on a first visit the browser
// holds both painting and the script back until the stylesheet arrives, and an
// animation-frame tick can fall in that wait, when nothing is drawn. The
// browser's first-paint entry is when something actually reached the screen.
//
// lib/look-before-paint.ts is what makes it pass; on the build before it, a
// computer that had chosen nothing first painted as "classic".
//
//   npm run build && node scripts/run-next.mjs start -p 4415
//   node tests/e2e/the-first-paint.js 4415

const { chromium, launchOptions } = require('./_playwright');

const PORT = process.argv[2] || '4415';
const BASE = `http://localhost:${PORT}`;
const NAVY = 'rgb(30, 42, 74)';

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// Runs before anything on the page. Notes every change of look with its time,
// and one entry per animation frame, until 400 frames.
function recordFrames() {
  const changes = [];
  window.__lookChanges = changes;
  new MutationObserver(() => {
    changes.push({ t: performance.now(), look: document.documentElement.dataset.uiTheme || '' });
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-ui-theme'] });
  const frames = [];
  window.__frames = frames;
  const t0 = 0;
  const look = () => {
    const bar = document.querySelector('nav.tab-bar');
    const header = document.querySelector('[data-app-header]');
    frames.push({
      t: Math.round(performance.now() - t0), // the same clock as the paint entry
      look: document.documentElement.dataset.uiTheme || '',
      header: header ? getComputedStyle(header).backgroundColor : '',
      bar: !!bar && getComputedStyle(bar).display !== 'none' && bar.getBoundingClientRect().height > 0,
      side: !!document.querySelector('[data-desktop-nav]'),
    });
    if (frames.length < 400) requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}

async function device({ width, height, mobile, stored }) {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width, height }, isMobile: mobile, hasTouch: mobile });
  await ctx.addInitScript((look) => {
    try {
      localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 3650 * 864e5));
      if (look) localStorage.setItem('beacon-ui-theme', look);
    } catch { /* a walk without storage sees the default, which is what it checks */ }
  }, stored || null);
  await ctx.addInitScript(recordFrames);
  const page = await ctx.newPage();
  return { browser, page };
}

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByText('Maria Santos').first().click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand, continue/i }).first();
  if (await consent.isVisible().catch(() => false)) { await consent.click(); await page.waitForTimeout(500); }
}

/**
 * Loads a page fresh, as when the app is opened. Returns its frames, and the
 * look on the page when the browser first painted: the server's, unless a
 * change came before that paint.
 */
async function framesOf(page, url) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  return page.evaluate(() => {
    const paint = performance.getEntriesByType('paint').find((e) => e.name === 'first-paint');
    const before = paint ? window.__lookChanges.filter((c) => c.t <= paint.startTime) : [];
    const frames = window.__frames;
    frames.firstPaint = paint ? Math.round(paint.startTime) : null;
    frames.lookAtFirstPaint = before.length ? before[before.length - 1].look : 'classic';
    return { frames, firstPaint: frames.firstPaint, lookAtFirstPaint: frames.lookAtFirstPaint };
  }).then(({ frames, firstPaint, lookAtFirstPaint }) => Object.assign(frames, { firstPaint, lookAtFirstPaint }));
}

(async () => {
  // 1. A COMPUTER THAT HAS CHOSEN NOTHING: Desktop, the default, from frame one.
  {
    const { browser, page } = await device({ width: 1440, height: 900, mobile: false });
    const door = await framesOf(page, '/login');
    ok(door.firstPaint !== null && door.lookAtFirstPaint === 'desktop',
       `the sign-in page first paints already in Desktop (${door.lookAtFirstPaint}, first paint at ${door.firstPaint}ms)`);
    await signIn(page);
    const frames = await framesOf(page, '/church');
    ok(frames.firstPaint !== null && frames.lookAtFirstPaint === 'desktop',
       `the church home first paints already in Desktop (${frames.lookAtFirstPaint}, first paint at ${frames.firstPaint}ms)`);
    ok(frames.filter((f) => f.t >= frames.firstPaint).every((f) => f.look === 'desktop'), 'and it never changes look after that');
    const drawn = frames.filter((f) => f.header);
    ok(drawn.length > 0, `the header is drawn (first at ${drawn[0]?.t}ms), so the next checks measure something`);
    const phoneLike = drawn.filter((f) => f.header === NAVY || f.bar || !f.side);
    ok(phoneLike.length === 0,
       `no frame shows the phone's navy header, the bottom bar, or a missing sidebar${phoneLike.length ? ` (first at ${phoneLike[0].t}ms: ${JSON.stringify(phoneLike[0])})` : ''}`);
    await browser.close();
  }

  // 2. A COMPUTER THAT CHOSE CLASSIC: Classic from frame one, and Classic all the way.
  {
    const { browser, page } = await device({ width: 1440, height: 900, mobile: false, stored: 'classic' });
    await signIn(page);
    const frames = await framesOf(page, '/church');
    ok(frames.firstPaint !== null && frames.lookAtFirstPaint === 'classic'
       && frames.filter((f) => f.t >= frames.firstPaint).every((f) => f.look === 'classic'),
       'a computer that chose Classic first paints in Classic, and stays in it');
    const drawn = frames.filter((f) => f.header);
    ok(drawn.length > 0 && drawn.every((f) => f.header === NAVY && f.bar && !f.side),
       'with Classic\'s navy header and bar from the first frame they are drawn in, and never a sidebar');
    await browser.close();
  }

  // 3. A PHONE: the look is on the page from frame one, and a phone draws Classic.
  {
    const { browser, page } = await device({ width: 390, height: 844, mobile: true });
    await signIn(page);
    const frames = await framesOf(page, '/church');
    ok(frames.firstPaint !== null && frames.lookAtFirstPaint === 'desktop',
       `a phone first paints with the look on the page too (${frames.lookAtFirstPaint})`);
    const drawn = frames.filter((f) => f.header);
    ok(drawn.length > 0 && drawn.every((f) => f.header === NAVY && f.bar),
       'and on a phone that look is drawn as Classic: the navy header and the bar, in every frame');
    await browser.close();
  }

  console.log(bad ? `RESULT: ${bad} BAD` : 'RESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
