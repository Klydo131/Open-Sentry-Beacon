// Does the LIVE app work, end to end, before a real church depends on it?
//
// WHY THIS IS SEPARATE FROM tests/e2e. Those run against the sample-data build,
// which is the right thing for most checks and useless for this one: live mode
// is a different code path, reached only when NEXT_PUBLIC_SUPABASE_URL and
// _ANON_KEY are set at BUILD time. Four live screens once shipped a placeholder
// for weeks because nobody could see them.
//
// It answers the question asked before a domain is pointed at anything: if a
// Director invites somebody tomorrow, does every screen in that journey exist?
//
//   node scripts/fake-supabase.mjs 4397          (or with TLS, see below)
//   NEXT_PUBLIC_SUPABASE_URL=https://localhost:4397 \
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=test-key npm run build
//   node scripts/run-next.mjs start -p 4930
//   node scripts/live-journey-check.mjs 4930
//
// TLS IS NOT OPTIONAL for the fixture. next.config.mjs only widens the CSP's
// connect-src for an https backend -- correct, and it means a plain http
// fixture is refused by the browser and every screen reports "Failed to fetch".
// Generate a self-signed pair and pass FAKE_SUPABASE_CERT_FILE / _KEY_FILE.
import { createRequire } from 'node:module';

// _playwright.js is CommonJS and already knows how to find Playwright wherever
// it happens to be installed, so it is reached rather than duplicated.
const require = createRequire(import.meta.url);
const { chromium, launchOptions, devices } = require('../tests/e2e/_playwright');

const BASE = `http://localhost:${process.argv[2] || '4930'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const PLACEHOLDER = /This live screen is being connected/i;
const SIGNIN = /Sign in to Hope Beacon/i;

(async () => {
  const b = await chromium.launch(launchOptions);
  const ctx = await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block', ignoreHTTPSErrors: true });
  const p = await ctx.newPage();

  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });

  // ---- 1. The front door, before anybody is signed in ---------------------
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1200);
  let text = await p.locator('body').innerText();
  ok(SIGNIN.test(text), 'live mode shows the real sign-in, not the sample-data tutorial');
  ok(/Forgot your password/i.test(text), 'and offers password recovery from the front door');
  ok(/invitation e-mail/i.test(text), 'and tells a first-time visitor where their password comes from');

  // ---- 2. Signed in ------------------------------------------------------
  await p.evaluate(() => {
    localStorage.setItem('sb-localhost-auth-token', JSON.stringify({
      access_token: 'fake', refresh_token: 'fake', expires_at: Date.now() / 1000 + 99999,
      token_type: 'bearer', user: { id: '11111111-1111-4111-8111-111111111111' },
    }));
    localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 9e6));
  });

  const screens = ['/admin', '/dm', '/church', '/mail', '/profile', '/settings', '/library'];
  for (const s of screens) {
    await p.goto(`${BASE}${s}`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2200);
    const body = await p.locator('body').innerText();
    const bad1 = PLACEHOLDER.test(body);
    const bad2 = SIGNIN.test(body);
    const bad3 = /Application error|Something went wrong|not ready/i.test(body);
    ok(!bad1 && !bad2 && !bad3,
       `${s.padEnd(10)} renders for a signed-in leader${bad1 ? ' [PLACEHOLDER]' : ''}${bad2 ? ' [BOUNCED TO SIGN-IN]' : ''}${bad3 ? ' [ERROR]' : ''}`);
  }

  // ---- 3. The join page, which is where an invited person actually lands --
  await ctx.clearCookies();
  const fresh = await (await b.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block', ignoreHTTPSErrors: true })).newPage();
  await fresh.goto(`${BASE}/join?token=sample`, { waitUntil: 'networkidle' });
  await fresh.waitForTimeout(1800);
  const join = await fresh.locator('body').innerText();
  ok(!PLACEHOLDER.test(join), 'the /join page an invitation links to is built, not a placeholder');
  ok(/password|set up|welcome|invit/i.test(join), 'and asks the new person for what it needs');

  console.log(`\nbrowser errors: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log('   ', e));
  await b.close();
  console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
})();
