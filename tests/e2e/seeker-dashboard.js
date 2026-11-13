// The seeker's home is a dashboard, not just a content page.
//
// Every other role has had one since the beginning. A seeker had to go looking
// to find out their missionary had written to them. This walks the real path —
// the missionary sends a message, then the seeker signs in — and asserts the
// strip tells them so, without ever naming a journey stage.
const { chromium, launchOptions, openChat } = require('./_playwright');
const BASE = `http://localhost:${process.argv[2] || '3100'}`;
// Screenshots and browser profiles go somewhere writable that is not the
// repo. Overridable so CI can collect them as artifacts.
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-e2e-'));
const STAGES = ['Create', 'Connect', 'Care', 'Call', 'Cultivate', 'Commission'];
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const signInAs = async (page, name) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByText(new RegExp(name)).first().click();
  await page.waitForTimeout(1700);
  const c = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await c.count()) { await c.first().click().catch(() => {}); await page.waitForTimeout(600); }
};

(async () => {
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-dsdash`, {
    ...launchOptions, viewport: { width: 412, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  // The missionary writes to John, so the last word in the thread is hers.
  await signInAs(page, 'Maria Santos');
  await page.goto(`${BASE}/dm/pair-john`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  // The conversation is in the Talk bubble (30 September 2026); Message opens it.
  await openChat(page);
  const box = page.locator('[data-quest="chat-send"] input, [data-quest="chat-send"] textarea').first();
  ok(await box.count() > 0, 'the missionary can reach the message box');
  const MSG = 'Would this Thursday evening suit you for a study?';
  await box.fill(MSG);
  await page.waitForTimeout(250);
  await page.locator('[data-quest="chat-send"] button').first().click();
  await page.waitForTimeout(1500);

  // Now the seeker arrives.
  await signInAs(page, 'John Reyes');
  await page.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1700);
  const t = await page.locator('body').innerText();

  ok(/Waiting for you/.test(t), 'the seeker lands on a priority strip');
  ok(/Maria is waiting to hear from you/.test(t), 'it says their missionary is waiting on them');
  ok(t.includes(MSG.slice(0, 40)), 'and shows what she actually said');

  const hit = STAGES.filter((s) => new RegExp(`\\b${s}\\b`).test(t));
  ok(hit.length === 0, `no journey stage anywhere on it${hit.length ? ' (found ' + hit + ')' : ''}`);

  const iWait = t.indexOf('Waiting for you');
  const iWalk = t.indexOf('Walking with you');
  ok(iWait > -1 && iWalk > -1 && iWait < iWalk, 'the strip sits above the missionary card');

  await page.screenshot({ path: `${OUT}/ds-dashboard.png` });
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  await ctx.close();
  process.exit(bad ? 1 : 0);
})();
