// The Terms of Use and Privacy Notice: readable, agreed in a box of their own,
// recorded with their versions, and asked about again when they change.
//
// 28 October 2026: "update our UI for agreeing on 'Terms' and 'Privacy
// Policy'. I want all of those to be handled professionally so that we won't
// face any legalities in the future." The owner chose this app, and that the
// church's legal name and Data Protection Officer are a setting its Director
// fills in. lib/legal.ts says why each rule is there.
//
// Walked on the sample side, as a person would, on a phone: the Terms page and
// the Privacy Notice, each with its version and the church named; a Director
// changing the church's Data Protection Officer and the notice following; and
// an Explorer whose agreement predates the current documents, stopped before
// the app until they agree, then let in with the agreement recorded.
// tests/e2e/join-consent.js walks the join form's two boxes.
//
//   node tests/e2e/the-terms-are-agreed.js [port]
const { browser: engine, launchOptions, pageErrors } = require('./_playwright');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const DB_KEY = 'beacon-demo-v1';
const readDb = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), DB_KEY);

async function signIn(page, name) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.getByText(name, { exact: true }).first().click();
  await page.waitForTimeout(1500);
}

(async () => {
  const browser = await engine.launch(launchOptions);
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    const page = await context.newPage();
    const caught = pageErrors(page);

    // ---- THE TERMS OF USE ---------------------------------------------------
    await page.goto(`${BASE}/terms`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    ok(await page.getByRole('heading', { name: 'Terms of Use', level: 1 }).isVisible(), 'there is a Terms of Use page');
    const version = await page.locator('[data-legal-version]').innerText();
    ok(/version \d{4}-\d{2}-\d{2}/.test(version), `it says which version is in force (${version.trim()})`);
    ok(await page.locator('[data-church-legal="complete"]').count() === 1
       && /Grace SDA Sample Church, Inc\./.test(await page.locator('[data-church-legal]').innerText()),
       'and names the church it is an agreement with');
    const missing = [];
    for (const id of ['eligibility', 'account', 'conduct', 'content', 'privacy', 'limits', 'leaving', 'changes', 'law']) {
      if (await page.locator(`section#${id}[data-terms-section="${id}"] h2`).count() !== 1) missing.push(id);
    }
    ok(missing.length === 0, `with who may use it, the account, conduct, what you write, privacy, limits, leaving, changes and the law, each a link target${missing.length ? ` (missing: ${missing.join(', ')})` : ''}`);
    ok(await page.getByText(/laws of the Republic of the Philippines/).count() > 0, 'governed by the laws of the Philippines');
    ok(await page.getByText(/withdraw|take that permission back/i).count() === 0,
       'and it promises no withdrawal the app does not offer (0035 removed it; leaving is how)');
    ok(await page.locator('a[href="/policy"]').count() > 0 && await page.locator('a[href^="/privacy"]').count() > 0,
       'it links to the safeguarding policy and the privacy notice it includes');
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(wide <= 0, `it fits a phone (${wide}px over)`);

    // ---- THE PRIVACY NOTICE ---------------------------------------------------
    await page.goto(`${BASE}/privacy`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    ok(/version \d{4}-\d{2}-\d{2}/.test(await page.locator('[data-legal-version]').innerText()), 'the privacy notice says its version too');
    ok(await page.locator('[data-legal-missing]').count() === 0
       && /privacy@example\.org/.test(await page.locator('[data-church-legal]').innerText()),
       'and names the church and its Data Protection Officer, so "two lines are still missing" is gone');
    ok(await page.locator('a[href="/terms"]').count() > 0, 'and links to the Terms of Use');

    // ---- A DIRECTOR FILLS IN THE LEGAL DETAILS ---------------------------------
    await signIn(page, 'Pastor Ramos');
    await page.goto(`${BASE}/settings?room=church`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const form = page.locator('[data-church-legal-form]');
    ok(await form.count() === 1, 'a Director finds the church’s legal details in Settings, under Church');
    await form.locator('[data-church-legal-field="dpo_name"]').fill('A. Officer');
    await form.locator('[data-church-legal-field="dpo_email"]').fill('dpo@example.org');
    await form.locator('[data-church-legal-save]').click();
    await page.waitForTimeout(400);
    await page.goto(`${BASE}/privacy`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const named = await page.locator('[data-church-legal]').innerText();
    ok(/A\. Officer/.test(named) && /dpo@example\.org/.test(named), `and the notice names what they saved (${named.replace(/\s+/g, ' ').slice(0, 90)}…)`);

    // ---- AN AGREEMENT TO AN EARLIER VERSION IS ASKED ABOUT AGAIN ---------------
    // As if John agreed before the current documents: his record names an
    // older version. He has given the separate permission to keep sensitive
    // information, or that question, which comes first, would be asked
    // instead (components/ConsentHost.tsx).
    await page.evaluate((k) => {
      const db = JSON.parse(localStorage.getItem(k));
      db.profiles = db.profiles.map((p) => (p.id === 'ds-john'
        ? { ...p, consent_at: p.consent_at || new Date().toISOString(), terms_version: '2026-01-01', privacy_version: '2026-01-01' }
        : p));
      localStorage.setItem(k, JSON.stringify(db));
    }, DB_KEY);
    await signIn(page, 'John Reyes');
    await page.waitForTimeout(500);
    const step = page.locator('[data-agreement-step]');
    ok(await step.isVisible(), 'an Explorer who agreed to an earlier version is stopped before the app');
    ok(/updated our terms/i.test(await step.innerText()) && await step.locator('[data-what-changed] li').count() > 0,
       'and told what changed');
    const go = page.locator('[data-agreement-continue]');
    ok(await go.isDisabled() && !(await step.locator('[data-agreement-box]').isChecked()),
       'the box is unticked and the button waits for it');
    await step.locator('[data-agreement-box]').check();
    await go.click();
    await page.waitForTimeout(600);
    ok(!(await step.isVisible()), 'agreeing lets them in');
    const john = (await readDb(page)).profiles.find((p) => p.id === 'ds-john');
    ok(john.terms_version === '2026-10-28' && john.privacy_version === '2026-10-28' && !!john.terms_agreed_at,
       `and records the versions and when (${john.terms_version}, ${john.terms_agreed_at})`);

    const errors = caught.list();
    ok(errors.length === 0, `no page errors${errors.length ? `: ${errors.slice(0, 2).join(' | ')}` : ''}`);
    await context.close();
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
