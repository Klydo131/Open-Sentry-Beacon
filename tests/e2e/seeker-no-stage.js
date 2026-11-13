// Phase 2 verification: walk every screen a seeker can reach and prove no
// stage label appears anywhere in the rendered text.
const { chromium, launchOptions, openRoom } = require('./_playwright');
const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const STAGES = ['Create', 'Connect', 'Care', 'Call', 'Cultivate', 'Commission'];
let bad = 0; const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };
(async () => {
  const b = await chromium.launch(launchOptions);
  const page = await b.newPage({ viewport: { width: 412, height: 900 } });

  // The public front door first — nobody is signed in there at all.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await page.waitForTimeout(900);
  {
    const t = await page.locator('body').innerText();
    const hit = STAGES.filter(s => new RegExp(`\\b${s}\\b`).test(t));
    ok(hit.length === 0, `public landing shows no stage name${hit.length ? ' (found ' + hit + ')' : ''}`);
  }

  // Sign in as a seeker.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
  const john = page.getByText(/John Reyes/).first();
  if (!(await john.count())) { console.log('BAD could not find the seeker persona'); process.exit(1); }
  await john.click(); await page.waitForTimeout(1800);
  const c = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await c.count()) { await c.first().click().catch(()=>{}); await page.waitForTimeout(800); }

  for (const path of ['/ds', '/church', '/library', '/profile', '/settings', '/mail']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    const t = await page.locator('body').innerText();
    const hit = STAGES.filter(s => new RegExp(`\\b${s}\\b`).test(t));
    ok(hit.length === 0, `${path} shows no stage name${hit.length ? ' (found ' + hit + ')' : ''}`);
  }

  // The notification bell, opened.
  await page.goto(`${BASE}/ds`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1200);
  const bell = page.getByRole('button', { name: /notification/i }).first();
  if (await bell.count()) {
    await bell.click(); await page.waitForTimeout(900);
    const t = await page.locator('body').innerText();
    const hit = STAGES.filter(s => new RegExp(`\\b${s}\\b`).test(t));
    ok(hit.length === 0, `notification bell shows no stage name${hit.length ? ' (found ' + hit + ')' : ''}`);
  } else { console.log('    (no bell found to open)'); }

  // And the control: an admin MUST still see the ladder.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1000);
  const pastor = page.getByText(/Pastor Ramos/).first();
  if (await pastor.count()) {
    await pastor.click(); await page.waitForTimeout(1800);
    await page.goto(`${BASE}/church`, { waitUntil: 'networkidle' }); await page.waitForTimeout(1400);
    // The chart lives in the numbers room now, not on the church home scroll.
    await openRoom(page, /numbers/i);
    const t = await page.locator('body').innerText();
    const seen = STAGES.filter(s => new RegExp(`\\b${s}\\b`).test(t));
    ok(seen.length >= 4, `admin still sees the stage chart (found ${seen.join(',') || 'none'})`);
  }

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  await b.close(); process.exit(bad ? 1 : 0);
})();
