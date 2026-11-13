// A link to a card lands on the card even when the smooth scroll is cut short
// or the page changes height underneath it.
//
// WHY THIS EXISTS. On WebKit, landing.js followed `/settings#install` to a
// card that appeared late and finished 2842px away from it (13 October 2026).
// The scroll was aimed once and nothing looked again. lib/scroll-to-hash.ts now
// waits for the page to stop moving, checks, and goes the rest of the way.
//
// This makes the two things that defeat a single aimed scroll happen on
// purpose, so Chromium shows them too:
//
//   1. the smooth scroll is stopped part-way, as WebKit stops it;
//   2. the page grows above the card while the scroll is under way, as
//      Settings does when a link switches it to another section.
//
// And one that must NOT be corrected: the person scrolls away themselves.
//
//   node tests/e2e/a-link-lands-even-when-the-page-moves.js <port>
const { chromium, launchOptions, engineName } = require('./_playwright');

const PORT = process.argv[2] || '4396';
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
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(700);
  }
}

// Where the card is, and how far the page could have gone toward it.
const where = (page) => page.evaluate(() => {
  const el = document.getElementById('install');
  if (!el) return { top: null };
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  const top = Math.round(el.getBoundingClientRect().top - margin);
  const most = document.documentElement.scrollHeight - window.innerHeight;
  const room = Math.round(Math.max(0, Math.min(most, window.scrollY + top)) - window.scrollY);
  return { top, room, y: Math.round(window.scrollY) };
});

// Take the card away, go to the bottom, follow the link, and bring the card
// back after a moment, which is how a card behind loading data arrives.
async function follow(page, during) {
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    const el = document.getElementById('install');
    if (el) { el.removeAttribute('id'); window.__card = el; }
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForTimeout(300);
  await page.evaluate((what) => {
    history.pushState(null, '', '/settings#install');
    setTimeout(() => {
      window.__card.setAttribute('id', 'install');
      // Just after the card is found (the hook looks every 100 ms) and the
      // smooth scroll has begun.
      setTimeout(() => {
        if (what === 'cut') {
          // Stop the smooth scroll where it is. A scroll to the current
          // position ends one in progress, which is what WebKit did.
          window.scrollTo({ top: window.scrollY, behavior: 'auto' });
        } else if (what === 'grow') {
          const tall = document.createElement('div');
          tall.style.height = '1600px';
          tall.dataset.grown = '1';
          window.__card.parentElement.insertBefore(tall, window.__card);
        } else if (what === 'person') {
          window.dispatchEvent(new WheelEvent('wheel', { deltaY: 400 }));
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'auto' });
        }
      }, 160);
    }, 500);
  }, during);
  await page.waitForTimeout(3600);
  return where(page);
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await signInAs(page, /Pastor|Admin|Director/i);

  console.log(`=== landing on a card that moves, on ${engineName} ===`);
  const cut = await follow(page, 'cut');
  ok(cut.top !== null && Math.abs(cut.room) <= 48,
    `the smooth scroll stopped part-way, and it still landed (${cut.room}px short of where it could go)`);

  const grow = await follow(page, 'grow');
  ok(grow.top !== null && Math.abs(grow.room) <= 48,
    `the page grew 1600px above the card mid-scroll, and it still landed (${grow.room}px short)`);

  const person = await follow(page, 'person');
  ok(person.top !== null && Math.abs(person.room) > 400,
    `but when the person scrolls away themselves, it leaves them there (${person.room}px from the card)`);

  await browser.close();
  console.log(bad ? `\nRESULT: ${bad} BAD` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
