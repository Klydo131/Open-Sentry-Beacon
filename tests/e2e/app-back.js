// An installed app must have a way back.
//
// `display: 'standalone'` in the manifest is what makes the app feel like an
// app, and it is also what removes the browser's Back and Reload. That was
// reported from a real desktop install: "why can't I see the back, refresh and
// forward when I install it as a web app?"
//
// Two things now answer it, and this suite checks both, because only one of
// them works on every platform:
//
//   1. The manifest asks for `minimal-ui` through `display_override`, which
//      persuades desktop Chrome, Edge and Android Chrome to keep a slim Back
//      and Reload. Safari has never implemented it.
//   2. components/BackButton.tsx puts a Back in the header itself. This is the
//      only one an iPhone home-screen app will ever show, so it is the one that
//      actually has to work.
//
// The button is deliberately absent on the first screen of a session — there is
// nowhere to go back to, and offering one that closes the app is worse than
// offering none. That absence is asserted here too, because "it is always
// visible" would be an easy and wrong way to make this pass.
const { chromium, launchOptions } = require('./_playwright');
const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-e2e-'));
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const back = (page) => page.getByRole('button', { name: /Go back/i });

(async () => {
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-back`, {
    ...launchOptions, viewport: { width: 412, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  // ---- 1. The manifest asks for minimal-ui ----
  const res = await page.goto(`${BASE}/manifest.webmanifest`, { waitUntil: 'networkidle' });
  const manifest = JSON.parse(await res.text());
  ok(
    Array.isArray(manifest.display_override) && manifest.display_override.includes('minimal-ui'),
    'the manifest asks for minimal-ui, so an installed window keeps Back and Reload',
  );
  ok(
    manifest.display === 'standalone',
    'display stays standalone, so a browser without minimal-ui behaves exactly as before',
  );

  // ---- 2. The in-app Back, which is the only one iOS will show ----
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByText(/Maria Santos/).first().click();
  await page.waitForTimeout(1700);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) { await consent.first().click().catch(() => {}); await page.waitForTimeout(600); }

  const home = page.url();
  ok(/\/dm/.test(home), 'the missionary lands on their own home');
  ok(await back(page).count() === 0, 'no Back on the screen the session started on');

  // Go one level in, staying inside the app shell. /library deliberately runs
  // outside it and has its own way back, so it is the wrong screen to test with.
  //
  // Through the Menu tab since 30 September 2026: at 412px the rooms are no
  // longer icons in the header but rows in the Menu, and the Menu is itself a
  // screen inside the shell, one tap in from home.
  await page.locator('nav[aria-label="Main"]').getByRole('link', { name: 'Menu', exact: true }).click();
  await page.waitForURL(/\/menu/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  ok(/\/menu/.test(page.url()), 'moved to a second screen inside the shell');
  ok(await back(page).count() > 0, 'Back appears once there is somewhere to go back to');

  await back(page).first().click();
  await page.waitForTimeout(1400);
  ok(/\/dm/.test(page.url()), 'Back returns to the screen we came from');

  await ctx.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} PROBLEM(S)`);
  process.exit(bad ? 1 : 0);
})();
