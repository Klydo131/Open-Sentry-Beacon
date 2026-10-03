// No screen scrolls sideways on a phone.
//
// THE REPORTS, three of them now, all the same shape: a notification panel with
// its left half off the glass, an invitation row showing "Re-send", "Cancel"
// and half the word "Copy", and "overlapping design". Each was found by a
// person holding a phone, and each was invisible on a desktop because there was
// room for the mistake to hide in.
//
// The general symptom is one number. If a page's content is wider than the
// screen, something on it is unreachable, whatever the cause: a fixed width, a
// long word, a table, or a row that asked to wrap and also refused to shrink.
// So this walks the app at phone width and compares those two numbers on every
// screen, and when they disagree it NAMES THE WIDEST ELEMENT rather than just
// failing, because "something overflows" is not a thing anybody can act on.
//
//   npm run build && node scripts/run-next.mjs start -p 4401
//   node tests/e2e/no-sideways-scroll.js 4401

const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4401';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// Signed-in screens, which are the ones with the dense rows on them. The door
// pages are covered by the other suites.
const ROUTES = [
  '/church', '/admin', '/dm', '/ds', '/library', '/settings', '/profile',
  '/mail', '/cases', '/office', '/church?room=blogs', '/menu',
];

// Two widths: the narrowest phone still in use, and a common Android.
const WIDTHS = [360, 412];

async function signIn(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const pick = page.getByText(who).first();
  if (await pick.count()) await pick.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it|Agree|OK/i });
  if (await consent.count()) await consent.first().click().catch(() => {});
  await page.waitForTimeout(800);
}

/** The widest thing on the page, and how far past the edge it reaches. */
async function overflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const over = doc.scrollWidth - doc.clientWidth;
    if (over <= 1) return { over: 0 };
    // Name the culprit. Deepest element wins, so the report points at the row
    // rather than at <body>.
    let worst = null;
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      const past = Math.round(r.right - doc.clientWidth);
      if (past > 1 && (!worst || past > worst.past || el.contains(worst.el) === false)) {
        if (!worst || past >= worst.past) {
          worst = { el, past, right: Math.round(r.right) };
        }
      }
    }
    const el = worst?.el;
    return {
      over: Math.round(over),
      past: worst?.past ?? null,
      tag: el ? el.tagName.toLowerCase() : null,
      cls: el ? String(el.className).slice(0, 120) : null,
      text: el ? (el.textContent || '').trim().slice(0, 60) : null,
    };
  });
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  for (const width of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    // A Director sees the most crowded screens: invitations, approvals, the
    // whole admin room.
    await signIn(page, /Pastor Ramos/i);

    for (const route of ROUTES) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' }).catch(() => {});
      await page.waitForTimeout(900);
      const o = await overflow(page);
      ok(
        o.over === 0,
        o.over === 0
          ? `${width}px ${route}: fits`
          : `${width}px ${route}: ${o.over}px past the edge, widest is <${o.tag} class="${o.cls}"> "${o.text}"`,
      );
    }

    await context.close();
  }

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} BAD`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
