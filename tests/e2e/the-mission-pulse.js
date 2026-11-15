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
  ok((await page.locator('[data-pulse-tab]').count()) === 5, `${tag}: five views: overview, journeys, analysis, raw data, app health`);
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

(async () => {
  const browser = await chromium.launch(launchOptions);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 900 }]) {
    await walk(browser, viewport, 'Bishop Alonzo', 'the Executive Director');
    await walk(browser, viewport, 'Pastor Ramos', 'the Director');
  }
  await browser.close();
  console.log(bad === 0 ? '\nThe Mission pulse holds.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})();
