// The client's requirement 2 and 8, end to end:
//   "DMs recommend DS with an email address and name … If the DS accepts the
//    admin's invite, DS enters through the app with a new account paired to the
//    recommending DM."
//   "The app begins on … Connect for DS (initiated by DM)."
//
// A missionary recommends somebody who has NO account. The admin invites them.
// The invite link is opened and completed. A pairing must exist, with that
// missionary, at stage Connect — and the DM must still be unable to invite.
const { chromium, launchOptions } = require('./_playwright');
const BASE = `http://localhost:${process.argv[2] || '3100'}`;
// Screenshots and browser profiles go somewhere writable that is not the
// repo. Overridable so CI can collect them as artifacts.
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-e2e-'));
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const signInAs = async (page, name) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByText(new RegExp(name)).first().click();
  await page.waitForTimeout(1600);
  const c = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await c.count()) { await c.first().click().catch(() => {}); await page.waitForTimeout(600); }
};

const readDb = (page) => page.evaluate(() => {
  const raw = localStorage.getItem('beacon-demo-v1');
  if (raw) return JSON.parse(raw);
  const k = Object.keys(localStorage).find((x) => /db/i.test(x));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
});

(async () => {
  // One persistent context: the demo store lives in localStorage, so the
  // missionary, the admin and the new seeker must share a browser profile the
  // way three people share one church.
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-rec`, {
    ...launchOptions, viewport: { width: 1280, height: 1000 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  // ---- 1. The missionary recommends someone with no account ----
  await signInAs(page, 'Maria Santos');
  await page.goto(`${BASE}/mail`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);

  const NAME = 'Ruth Delacruz';
  const EMAIL = 'ruth.delacruz@example.com';
  ok(await page.getByLabel('Their full name').count() > 0, 'the recommend form takes a name');
  ok(await page.getByLabel('Their email address').count() > 0, 'the recommend form takes an email');

  await page.getByLabel('Their full name').fill(NAME);
  await page.getByLabel('Their email address').fill(EMAIL);
  await page.getByLabel('Why them').fill('She asked me about the Sabbath twice.');
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Send to the admin/i }).click();
  await page.waitForTimeout(1400);

  {
    const db = await readDb(page);
    const rec = (db.recommendations || []).find((r) => r.full_name === NAME);
    ok(!!rec, 'a recommendation was stored');
    ok(rec && rec.email === EMAIL, 'it carries the email');
    ok(rec && rec.status === 'pending', 'it starts pending');
    ok(!(db.profiles || []).some((p) => p.full_name === NAME),
       'the recommended person has NO account yet');
  }

  // A missionary must NOT be able to invite. That boundary does not move.
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  ok(!page.url().includes('/admin'), `a DM cannot reach the admin desk (landed on ${page.url().replace(BASE, '')})`);

  // ---- 2. The admin sees it and invites ----
  await signInAs(page, 'Pastor Ramos');
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const body = await page.locator('body').innerText();
  ok(body.includes(NAME), 'the admin sees the recommended name');
  ok(body.includes(EMAIL), 'the admin sees the email');
  ok(/Maria Santos/.test(body), 'the admin sees who recommended them');

  await page.getByRole('button', { name: /Invite Ruth/i }).first().click();
  await page.waitForTimeout(1600);

  let token = '';
  {
    const db = await readDb(page);
    const inv = (db.invites || []).find((i) => i.email === EMAIL);
    ok(!!inv, 'an invite was created');
    ok(inv && inv.role === 'ds', 'the invite is for a seeker');
    ok(inv && !!inv.pair_with_dm, 'the invite carries the recommending missionary');
    const maria = (db.profiles || []).find((p) => p.full_name === 'Maria Santos');
    ok(inv && maria && inv.pair_with_dm === maria.id, 'and it is the right missionary');
    const rec = (db.recommendations || []).find((r) => r.full_name === NAME);
    ok(rec && rec.status === 'invited', 'the recommendation reads as invited');
    token = inv ? inv.token : '';
  }

  // ---- 3. The seeker opens the link and finishes signing up ----
  ok(!!token, 'we have an invite token to open');
  await page.goto(`${BASE}/join?token=${token}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${OUT}/rec-join.png` });

  const nameField = page.locator('input[type="text"], input:not([type])').first();
  if (await nameField.count()) { await nameField.fill(NAME); await page.waitForTimeout(300); }

  // Tick consent, because the button is disabled until it is.
  //
  // The form gained a permission box — deliberately never pre-ticked, since "a
  // box that arrives already ticked is not consent, it is a default somebody
  // failed to notice". This suite kept filling only the name and then waited
  // for a button that could never become enabled, which Playwright reports as a
  // 30-second timeout rather than as the missing step it is.
  //
  // And since 28 October 2026 a second box beside it, agreeing to the Terms of
  // Use and the Privacy Notice (components/AgreementBox.tsx), which comes
  // first; "the first checkbox" then ticked that one and left the permission
  // empty. Each is ticked by name now.
  const terms = page.locator('[data-agreement-box]').first();
  ok(await terms.count() > 0, 'the join page asks for agreement to the Terms of Use and Privacy Notice');
  await terms.check();
  const consent = page.locator('input[type="checkbox"]:not([data-agreement-box])').first();
  if (await consent.count()) { await consent.check().catch(() => {}); await page.waitForTimeout(300); }

  const finish = page.getByRole('button', { name: /join|finish|create|continue|sign up/i }).last();
  ok(await finish.count() > 0, 'the join page offers a way to finish');
  await finish.click();
  await page.waitForTimeout(2200);

  // ---- 4. The pairing must exist, at Connect ----
  {
    const db = await readDb(page);
    const her = (db.profiles || []).find((p) => p.full_name === NAME);
    ok(!!her, 'the seeker now has an account');
    const maria = (db.profiles || []).find((p) => p.full_name === 'Maria Santos');
    const pair = (db.pairings || []).find((p) => her && p.ds_id === her.id);
    ok(!!pair, 'a pairing was created on acceptance');
    ok(pair && maria && pair.dm_id === maria.id, 'paired with the missionary who recommended her');
    ok(pair && pair.journey_stage === 'connect', `and it starts at Connect (got ${pair && pair.journey_stage})`);
    ok(pair && pair.status === 'active', 'the pairing is active');
  }

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  await ctx.close();
  process.exit(bad ? 1 : 0);
})();
