// The Mission pulse opens the leaders' numbers, and it moves.
//
// The Executive Director and the Director open Analytics and find the pulse at
// the top: what needs attention, the outcomes of the period against the one
// before with a little chart each, the journey stage by stage with what has
// stalled, people and engagement, and the app's own health. Choosing another
// period changes the numbers and is remembered; Refresh works; nothing scrolls
// sideways on a phone; no script errors. Sample church only.
//
//   npm run build && node scripts/run-next.mjs start -p 4395
//   node tests/e2e/the-mission-pulse.js 4395

const { chromium, launchOptions, openByQuest, isCancelledPrefetch } = require('./_playwright');
const PORT = process.argv[2] || '4395';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function signInAs(page, name) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const who = page.getByText(new RegExp(name, 'i')).first();
  if ((await who.count()) === 0) return false;
  await who.click();
  await page.waitForTimeout(1800);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) { await consent.first().click().catch(() => {}); await page.waitForTimeout(600); }
  return true;
}

async function walk(browser, viewport, who, label) {
  const tag = `${label} at ${viewport.width}px`;
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!isCancelledPrefetch(e.message)) errors.push(e.message); });
  ok(await signInAs(page, who), `${tag}: signs in`);
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok(await openByQuest(page, 'tab-analytics'), `${tag}: opens Analytics`);
  const pulse = page.locator('[data-panel="mission-pulse"]');
  await pulse.waitFor({ timeout: 15000 });
  await page.locator('[data-pulse-tile]').first().waitFor({ timeout: 15000 });
  ok(await pulse.isVisible(), `${tag}: the Mission pulse is the first thing in Analytics`);
  ok((await page.locator('[data-pulse-attention] li').count()) >= 1, `${tag}: it says what needs attention (${(await page.locator('[data-pulse-attention] li').allInnerTexts()).map((t) => t.split('\n').pop()).join(' | ').slice(0, 160)})`);
  ok((await page.locator('[data-pulse-tile]').count()) === 8, `${tag}: eight outcomes, each with a number`);
  ok((await page.locator('[data-pulse-tile] svg rect').count()) > 20, `${tag}: each outcome has its little chart`);
  ok((await page.locator('[data-pulse-tab]').count()) === 7, `${tag}: seven views, alerts and automations among them`);
  await page.locator('[data-pulse-tab="journeys"]').click();
  await page.waitForTimeout(400);
  ok((await page.locator('[data-pulse-pathway] li').count()) === 6, `${tag}: the journey shows all six stages`);
  ok(/Explorers back this week/.test(await page.locator('[data-pulse-people]').innerText()), `${tag}: people and engagement shows who keeps coming back`);
  await page.locator('[data-pulse-tab="analysis"]').click();
  await page.waitForTimeout(400);
  const cards = page.locator('[data-pulse-finding]');
  ok((await cards.count()) === 5, `${tag}: the analysis asks five questions`);
  const said = (await cards.allInnerTexts()).join(' ');
  ok(/Not enough to say|r = /.test(said) && !/NaN|undefined|Infinity/.test(said), `${tag}: each answers with r or says there is not enough, never NaN`);
  ok(/Spearman/.test(await page.locator('[data-pulse-analysis]').innerText()), `${tag}: it says how the numbers are worked out and that a link is not a cause`);
  await page.locator('[data-pulse-tab="raw"]').click();
  await page.waitForTimeout(400);
  ok((await page.locator('[data-count-row]').count()) >= 7, `${tag}: the raw counts are shown, one row per part of the period`);
  ok((await page.locator('[data-journey-row]').count()) >= 1, `${tag}: one row per journey, numbered`);
  ok(!/Maria|John|Santos|Ramos|Alonzo/.test(await page.locator('[data-pulse-raw]').innerText()), `${tag}: no name appears in the raw data`);
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }).catch(() => null), page.locator('[data-pulse-csv="journeys"]').click()]);
  const csvText = download ? require('node:fs').readFileSync(await download.path(), 'utf8') : '';
  ok(/^\ufeff?Journey,Status,Stage/.test(csvText) && !/Maria|John|Santos/.test(csvText), `${tag}: the journey CSV downloads, with no names (${download ? download.suggestedFilename() : 'no file'})`);
  // THE WARNING SYSTEM. Lower the stalled line to one day: the sample journeys' last
  // steps are days old, so warnings appear, and the Alerts tab counts them.
  await page.locator('[data-pulse-tab="alerts"]').click();
  await page.waitForTimeout(400);
  ok((await page.locator('[data-rule]').count()) >= 10, `${tag}: the warning rules are listed, each with a switch and a line`);
  const stalledLine = page.locator('[data-rule-threshold="stalled"]');
  await stalledLine.fill('1');
  await page.waitForTimeout(500);
  ok((await page.locator('[data-warning="stalled"]').count()) === 1, `${tag}: lowering a line raises its warning`);
  ok(Number(await page.locator('[data-alert-count]').innerText()) >= 1, `${tag}: the Alerts tab counts the warnings`);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('hb-pulse-rules')).stalled.threshold) === 1, `${tag}: the line is kept on this device`);
  await page.locator('[data-rule="stalled"] input[type="checkbox"]').uncheck();
  await page.waitForTimeout(400);
  ok((await page.locator('[data-warning="stalled"]').count()) === 0, `${tag}: switching a rule off quiets it`);
  await page.locator('[data-rule="stalled"] input[type="checkbox"]').check();
  await page.waitForTimeout(300);

  // AUTOMATIONS. Follow-ups for stalled journeys: previewed, run once, never doubled.
  await page.locator('[data-pulse-tab="automations"]').click();
  await page.waitForTimeout(400);
  ok((await page.locator('[data-automation]').count()) === 4, `${tag}: four automations, each with Off, Ask first and Automatic`);
  const fu = page.locator('[data-automation="followups"]');
  const promised = await fu.locator('[data-preview]').innerText();
  ok(/Would add \d+ follow-up/.test(promised), `${tag}: it says what it will do before it does it (${promised})`);
  await fu.locator('[data-run="followups"]').click();
  await page.waitForTimeout(900);
  ok(/Added \d+ follow-up/.test(await page.locator('[data-automation-log]').innerText()), `${tag}: Run now adds the follow-ups and says so`);
  ok(/Nothing to add/.test(await fu.locator('[data-preview]').innerText()), `${tag}: and will not add them twice`);
  ok(/Last ran/.test(await fu.innerText()), `${tag}: it remembers when it last ran`);
  const brief = await page.locator('[data-briefing]').inputValue();
  ok(/Mission briefing/.test(brief) && /Needs attention/.test(brief) && !/Maria|John|Santos|Ramos|Alonzo/.test(brief), `${tag}: the weekly briefing is ready, with numbers and warnings and no names`);
  ok((await page.locator('[data-automation="guides"] [data-run]').isDisabled()), `${tag}: with nobody waiting, there is nothing to ask the Guides`);
  await page.locator('[data-automation="notify"] [data-mode="auto"]').click();
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('hb-pulse-auto')).mode.notify) === 'auto', `${tag}: choosing Automatic is kept`);
  await page.evaluate(() => { localStorage.removeItem('hb-pulse-rules'); localStorage.removeItem('hb-pulse-auto'); });

  await page.locator('[data-pulse-tab="health"]').click();
  await page.waitForTimeout(400);
  ok(/Feedback not closed/.test(await page.locator('[data-pulse-system]').innerText()), `${tag}: the app's own health is there for IT`);
  await page.locator('[data-pulse-tab="overview"]').click();
  await page.waitForTimeout(400);

  const before = await page.locator('[data-pulse-tile]').allInnerTexts();
  await page.locator('[data-pulse-period="365"]').click();
  await page.waitForTimeout(800);
  ok(await page.locator('[data-pulse-period="365"]').getAttribute('aria-pressed') === 'true', `${tag}: 12 months can be chosen`);
  ok(/12 months/.test(await pulse.innerText()), `${tag}: and the heading says so`);
  // The sample church's records are all recent, so 30 days and 12 months agree; a week does not.
  await page.locator('[data-pulse-period="7"]').click();
  await page.waitForTimeout(800);
  const week = await page.locator('[data-pulse-tile]').allInnerTexts();
  ok(week.join() !== before.join(), `${tag}: a different period gives different numbers`);
  await page.locator('[data-pulse-period="365"]').click();
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => localStorage.getItem('hb-pulse-period')) === '365', `${tag}: the period is remembered`);

  await page.locator('[data-pulse-refresh]').click();
  await page.waitForTimeout(800);
  ok(/Updated just now/.test(await pulse.innerText()), `${tag}: Refresh reads the numbers again`);
  for (const b of await page.locator('[data-pulse-period], [data-pulse-refresh]').all()) {
    const box = await b.boundingBox();
    if (box && box.height < 40) { ok(false, `${tag}: a pulse button is ${Math.round(box.height)}px tall`); break; }
  }
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${tag}: nothing scrolls sideways`);
  await page.evaluate(() => localStorage.removeItem('hb-pulse-period'));
  ok(errors.length === 0, `${tag}: no script errors${errors.length ? `: ${errors[0]}` : ''}`);
  await ctx.close();
}

// AUTOMATIC MEANS AUTOMATIC: with follow-ups on Automatic and a line that fires,
// opening Analytics adds them with nobody pressing anything, and opening it again
// does not add them twice.
async function automatic(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  ok(await signInAs(page, 'Pastor Ramos'), 'automatic: the Director signs in');
  await page.evaluate(() => {
    localStorage.setItem('hb-pulse-rules', JSON.stringify({ stalled: { on: true, threshold: 1 } }));
    localStorage.setItem('hb-pulse-auto', JSON.stringify({ mode: { followups: 'auto', guides: 'off', notify: 'off', briefing: 'ask' }, lastRun: {} }));
  });
  const openPulse = async () => {
    await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await openByQuest(page, 'tab-analytics');
    await page.locator('[data-pulse-tile]').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(1500);
    await page.locator('[data-pulse-tab="automations"]').click();
    await page.waitForTimeout(500);
  };
  await openPulse();
  const log = page.locator('[data-automation-log]');
  ok((await log.count()) === 1 && /Automatic: Added \d+ follow-up/.test(await log.innerText()), `automatic: opening Analytics added the follow-ups by itself (${(await log.count()) ? (await log.innerText()).trim() : 'nothing'})`);
  ok(/Nothing to add/.test(await page.locator('[data-automation="followups"] [data-preview]').innerText()), 'automatic: and nothing is left to add');
  await openPulse();
  ok((await page.locator('[data-automation-log]').count()) === 0, 'automatic: opening it again does not run it twice');
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  await automatic(browser);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    await walk(browser, viewport, 'Bishop Alonzo', 'the Executive Director');
    await walk(browser, viewport, 'Pastor Ramos', 'the Director');
  }
  await browser.close();
  console.log(bad === 0 ? '\nThe Mission pulse holds.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})();
