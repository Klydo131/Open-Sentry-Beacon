// Reporting somebody, and a Director acting on it.
//
// This is the feature where "it renders" is not the question. The questions are
// whether an Explorer can actually reach the control while upset, whether the
// report arrives in front of a Director, and — the one that decides whether
// anybody ever uses it — whether the person reported is told.
//
//   npm run build && node scripts/run-next.mjs start -p 4370
//   node tests/e2e/safeguarding.js 4370

const { chromium, launchOptions, openChat, openByQuest } = require('./_playwright');
const PORT = process.argv[2] || '4370';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function signInAs(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const pick = page.getByText(who).first();
  if (await pick.count()) await pick.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();

  // ---- The policy page stands on its own -------------------------------
  await page.goto(`${BASE}/policy`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const policy = await page.locator('body').innerText();
  ok(/How we treat each other/i.test(policy), 'the conduct policy page loads');
  ok(/never told/i.test(policy), 'the policy states the reported person is never told');
  ok(/emergency services/i.test(policy), 'the policy points at emergency services first');
  ok(/No sexual content/i.test(policy), 'the policy names the thing it exists for');

  // ---- A Guide reports their Explorer -----------------------------------
  await signInAs(page, /Maria Santos/i);
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const card = page.locator('[data-quest="seeker-card"]').first();
  if (await card.count()) { await card.click(); await page.waitForTimeout(1600); }
  // The conversation is in the Talk bubble (30 September 2026); Message opens it.
  await openChat(page);

  const reportLink = page.getByRole('button', { name: /^Report$/ });
  ok(await reportLink.count() > 0, 'a conversation offers a Report control');

  await reportLink.first().click();
  await page.waitForTimeout(700);
  const dialog = await page.locator('body').innerText();
  ok(/is\s+not\s+told/i.test(dialog), 'the dialog says the other person is not told BEFORE anything is typed');

  // The button must be inert until a reason is chosen — a report with no
  // reason gives a Director nothing to act on.
  const sendBtn = page.getByRole('button', { name: /Send this report/i });
  ok(await sendBtn.isDisabled(), 'the report cannot be sent without choosing a reason');

  await page.getByText(/Something inappropriate was sent/i).first().click();
  await page.waitForTimeout(300);
  await page.locator('textarea').first().fill('Sent a photo that was not appropriate.');
  ok(!(await sendBtn.isDisabled()), 'choosing a reason enables the report');

  await sendBtn.click();
  await page.waitForTimeout(900);
  ok(/Reported\. Thank you\./i.test(await page.locator('body').innerText()),
    'the reporter is told it went through');

  // ---- THE ONE THAT MATTERS: the subject is not told ---------------------
  //
  // A first draft of this asserted the word "report" appears nowhere on the
  // Explorer's screen, and it failed — correctly. The Explorer has their OWN
  // Report control, because both sides can report, and stripping it to make an
  // assertion pass would have removed the feature from the person most likely
  // to need it. So the check is what it should always have been: they can
  // report, and nothing tells them they have BEEN reported.
  await signInAs(page, /John/i);
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const seekerView = await page.locator('body').innerText();

  ok(/report/i.test(seekerView),
    'the Explorer has their own Report control — reporting runs both ways');
  ok(!/not appropriate/i.test(seekerView),
    "THE REPORTER'S WORDS DO NOT REACH THE PERSON REPORTED");
  ok(!/(you (have been|were) reported|reported you|report against)/i.test(seekerView),
    'NOTHING TELLS THE EXPLORER THEY HAVE BEEN REPORTED');

  // The notification bell is the likeliest leak: the Directors were notified,
  // and a bug that fanned that out to everyone would show up here.
  const bell = await page.locator('body').innerText();
  ok(!/safeguarding report needs your attention/i.test(bell),
    "the Directors' notification did not reach the person it is about");

  // ---- A Director sees it and can decide --------------------------------
  await signInAs(page, /Pastor Ramos/i);
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);

  // ADMIN'S ROOMS ARE A DROP-DOWN (30 September 2026). Closed, it carries the
  // count waiting in the rooms you are not in; open, Safeguarding has its own.
  const toggle = page.locator('[data-subroom-toggle]').first();
  ok(/1/.test(await toggle.innerText().catch(() => '')),
     `the closed list says something is waiting (${(await toggle.innerText().catch(() => '')).replace(/\n/g, ' ')})`);
  await toggle.click();
  await page.waitForTimeout(300);
  const tab = page.locator('[data-quest="tab-reports"]');
  ok(await tab.count() > 0, 'the Director has a Safeguarding room');
  ok(/1/.test(await tab.innerText()), `the room carries an unread count (${(await tab.innerText()).replace(/\n/g, ' ')})`);

  await tab.click();
  await page.waitForTimeout(900);
  const adminView = await page.locator('body').innerText();
  ok(/reported/i.test(adminView), 'the Director can see who reported whom');
  ok(/not appropriate/i.test(adminView), "the reporter's own words reach the Director");

  // Both outcomes must be offered, equally.
  ok(await page.getByRole('button', { name: /I have dealt with it/i }).count() > 0,
    'the Director can record that they dealt with it');
  ok(await page.getByRole('button', { name: /Nothing to answer/i }).count() > 0,
    'the Director can record that there was nothing to answer — as easily');

  await page.getByRole('button', { name: /Nothing to answer/i }).first().click();
  await page.waitForTimeout(900);
  const after = await page.locator('body').innerText();
  ok(/Decided/i.test(after) && /Nothing to answer/i.test(after),
    'a decided report moves to Decided and stays visible — never deleted');

  await browser.close();
  console.log(bad === 0 ? '\nAll safeguarding checks passed.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
