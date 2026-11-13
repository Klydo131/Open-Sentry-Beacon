// The install steps, in whichever browser is actually in somebody's hand.
//
// THE ASK.
//
// The card had four situations: Safari on iPhone, Safari on Mac, Chrome on
// Android, Chrome or Edge on a computer. Anybody in Samsung Internet, Opera,
// Brave, Firefox, Vivaldi or one of the smaller Chromium browsers was shown
// Chrome's menu, could not find it, and stopped. On Android in this part of the
// world Samsung Internet alone is a large share of handsets.
//
// WHAT THIS CHECKS, and why it is a browser test rather than a source one: the
// steps are only worth anything if the right ones are ON THE SCREEN. Each pass
// below loads Settings under a real user agent and reads what the card says.
//
//   npm run build && node scripts/run-next.mjs start -p 4397
//   node tests/e2e/install-every-browser.js 4397

const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4397';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// Real user agent strings. The tokens are the point: Samsung says
// SamsungBrowser, Edge says EdgA, Opera says OPR, and every one of them ALSO
// says Chrome, which is why testing for Chrome first would answer "Chrome" for
// all of them.
const AGENTS = [
  ['samsung', 'Samsung Internet',
   'Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36'],
  ['edge', 'Edge on Android',
   'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.0.0'],
  ['opera', 'Opera on Android',
   'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 OPR/76.0.0.0'],
  ['firefox', 'Firefox on Android',
   'Mozilla/5.0 (Android 13; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0'],
  ['vivaldi', 'Vivaldi',
   'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36 Vivaldi/6.5'],
  ['chrome', 'Chrome on Android',
   'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'],
  // A CHROMIUM BROWSER NOBODY HAS HEARD OF, which is the case the catch-all
  // entry exists for and the one every list of named browsers gets wrong.
  ['chromium-other', 'an unrecognised Chromium browser',
   'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) HolaBrowser/3.2 Mobile Safari/537.36'],
  // THE TRAP. "Le Hola" is a LeEco PHONE MODEL, not a browser. Anything that
  // searches a user agent for "Hola" tells this person they are using a browser
  // they have never installed. This is plain Chrome on that handset and must be
  // reported as Chrome.
  ['chrome', 'Chrome on a phone whose MODEL NAME contains Hola',
   'Mozilla/5.0 (Linux; Android 10; Le Hola Build/QP1A.190711.020) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Mobile Safari/537.36'],
];

async function openSettings(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const pick = page.getByText(/Maria Santos/i).first();
  if (await pick.count()) await pick.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it|Agree|OK/i });
  if (await consent.count()) await consent.first().click().catch(() => {});
  await page.waitForTimeout(700);
  // #install opens the steps without a further press, which is the whole point
  // of the header's Install chip.
  await page.goto(`${BASE}/settings#install`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  for (const [expected, label, ua] of AGENTS) {
    const context = await browser.newContext({
      viewport: { width: 420, height: 900 },
      userAgent: ua,
    });
    const page = await context.newPage();
    await openSettings(page);

    const chosen = await page.evaluate(() => {
      const on = document.querySelector('[data-install-browser][aria-pressed="true"]');
      return on ? on.getAttribute('data-install-browser') : null;
    });
    ok(chosen === expected, `${label} opens on "${expected}" (got ${chosen})`);

    // Every browser is reachable, not only the guessed one.
    const chips = await page.locator('[data-install-browser]').count();
    ok(chips >= 8, `${label} can still pick any of the others (${chips} listed)`);

    await context.close();
  }

  // ---- The steps shown are the ones for the browser chosen ----------------
  const context = await browser.newContext({
    viewport: { width: 420, height: 900 },
    userAgent: AGENTS[0][2], // Samsung Internet
  });
  const page = await context.newPage();
  await openSettings(page);

  const text = () => page.locator('body').innerText();
  const shown = await text();
  ok(/Add page to/i.test(shown), 'Samsung Internet is told "Add page to", which is what its menu says');
  ok(!/Cast, save and share/i.test(shown), 'and is not shown Chrome’s menu instead');

  // Pressing another chip changes the steps. A list that does not answer is a
  // list of buttons.
  await page.locator('[data-install-browser="samsung"]').first().waitFor();
  await page.locator('[data-install-browser="chromium-other"]').first().click();
  await page.waitForTimeout(500);
  const other = await text();
  ok(/Hola/i.test(other), 'the catch-all entry names Hola, which is what was asked for');
  ok(!/Add page to/i.test(other), 'and the Samsung steps are gone');

  await page.locator('[data-install-browser="firefox"]').first().click();
  await page.waitForTimeout(500);
  const ff = await text();
  ok(/cannot install web apps/i.test(ff),
     'Firefox on a computer is told plainly that it cannot, rather than given steps that fail');

  // ---- iPhone gets no list at all ----------------------------------------
  //
  // Only Safari can install on Apple hardware. A row of desktop browsers to
  // choose from is a choice that is not this person’s to make.
  const iphone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  });
  const ip = await iphone.newPage();
  await openSettings(ip);
  const ipText = await ip.locator('body').innerText();
  ok(await ip.locator('[data-install-browser]').count() === 0,
     'an iPhone is not offered a browser picker');
  ok(/Add to Home Screen/i.test(ipText), 'it is given the Safari steps directly');

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} BAD`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
