// The invited registration asks for three things and will not proceed without
// permission.
//
// The assertion that matters is the disabled button. A consent checkbox that
// does not actually block anything is decoration, and decoration is worse than
// nothing here: it looks like the church asked, and produces a record saying
// they did, while a person who never noticed the box is signed up anyway.
const { chromium, launchOptions } = require('./_playwright');
const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-join-'));
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  const ctx = await chromium.launchPersistentContext(`${OUT}/p`, {
    ...launchOptions, viewport: { width: 412, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(`${BASE}/join?token=demo-invite-ruth`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  // Dismiss the install banner. It is fixed to the bottom of the viewport and
  // sits over the end of this form, which on a phone is where the optional
  // questions and the join button are. Worth knowing rather than working
  // around silently — see the note in the report.
  const dismiss = page.locator('button[aria-label*="Dismiss" i], button[aria-label*="Close" i]').first();
  if (await dismiss.count()) { await dismiss.click().catch(() => {}); await page.waitForTimeout(400); }

  ok(await page.getByText(/Your name \*/).count() > 0, 'name is marked required');
  ok(await page.getByText(/^Email \*$/).count() > 0, 'email is marked required');

  // Read-only, so an invitation cannot be redirected to a different address by
  // whoever opens the link.
  const email = page.locator('input[readonly]').first();
  ok(await email.count() > 0, 'the email is read-only');
  ok((await email.inputValue()).includes('ruth.bautista'), 'it shows the invited address');

  // TWO BOXES SINCE 28 OCTOBER 2026: the Terms of Use and Privacy Notice, and,
  // separately, the permission to keep sensitive information (lib/legal.ts).
  const terms = page.locator('[data-agreement-box]').first();
  const box = page.locator('input[type=checkbox]:not([data-agreement-box])').first();
  ok(await terms.count() > 0 && (await terms.isChecked()) === false,
    'there is a box agreeing to the Terms of Use and Privacy Notice, NOT ticked by default');
  ok(await page.locator('[data-agreement-terms]').getAttribute('href') === '/terms'
     && await page.locator('[data-agreement-privacy]').getAttribute('href') === '/privacy'
     && await page.locator('[data-agreement-terms]').getAttribute('target') === '_blank',
    'both documents are links beside it, opening in a new tab so the form keeps what was typed');
  ok(await box.count() > 0, 'there is a permission checkbox');
  ok((await box.isChecked()) === false, 'it is NOT ticked by default');
  ok(await page.getByText(/Grace SDA Church/).count() > 0, 'the consent names the church');
  // THIS ASSERTION USED TO DEMAND A PROMISE THE APP NO LONGER KEEPS.
  //
  // The consent said "I can withdraw this at any time from Settings, and my
  // details are removed when I do", and Settings had the button behind it.
  // Migration 0035 removed the withdrawal and the button together, because a
  // member may correct their details but not erase the record of having
  // changed them; their Guide and their Director see the change.
  //
  // So the check flips. What matters now is that the app does NOT make a
  // promise it cannot honour, at the exact moment it asks somebody to trust
  // it, and that what replaced it is stated instead of merely omitted.
  ok(await page.getByText(/withdraw/i).count() === 0,
    'the app promises no withdrawal it can no longer honour');
  ok(await page.getByText(/keep them truthful/i).count() > 0,
    'and states the obligation that replaced it');
  ok(await page.getByText(/can see when I change them/i).count() > 0,
    'and says who sees a change, which is why the withdrawal went');

  const join = page.getByRole('button', { name: /Join Hope Beacon/i }).first();
  ok(await join.isDisabled(), 'cannot join without ticking permission');
  await box.check();
  await page.waitForTimeout(400);
  ok(await join.isDisabled(), 'nor with the permission alone, without agreeing to the terms');
  await terms.check();
  await page.waitForTimeout(400);
  ok(!(await join.isDisabled()), 'ticking both enables joining');

  // Eight boxes is what a form looks like when nobody decided which matter.
  ok(await page.getByText(/Birthday/).count() === 0, 'optional questions are hidden by default');
  await page.getByText(/Tell your Guide a little more/i).first().click();
  await page.waitForTimeout(500);
  ok(await page.getByText(/Birthday/).count() > 0, 'they open when asked for');

  await page.screenshot({ path: `${OUT}/join.png`, fullPage: true });
  console.log(`\nshot: ${OUT}/join.png`);
  await ctx.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
