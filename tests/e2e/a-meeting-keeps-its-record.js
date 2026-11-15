// Both people keep the same appointment record (components/MeetingRecord.tsx).
//
// Asked for on 16 November 2026: a Guide and an Explorer should both see what
// was called off, what was deleted and what took place. The sample church
// carries one of each; the Explorer marks the agreed one as met, and the Guide
// sees the same record with that change.
//
//   npm run build && node scripts/run-next.mjs start -p 4397
//   node tests/e2e/a-meeting-keeps-its-record.js 4397

const { chromium, launchOptions, isCancelledPrefetch } = require('./_playwright');
const PORT = process.argv[2] || '4397';
const BASE = `http://localhost:${PORT}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function signIn(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByText(new RegExp(who, 'i')).first().click();
  await page.waitForTimeout(1600);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) { await consent.first().click().catch(() => {}); await page.waitForTimeout(500); }
}

async function openRecord(page) {
  const rec = page.locator('[data-meeting-record]').first();
  await rec.waitFor({ timeout: 20_000 });
  await rec.scrollIntoViewIfNeeded();
  if (!(await rec.evaluate((el) => el.open))) await rec.locator('summary').click();
  await page.waitForTimeout(300);
  return rec;
}

async function walk(browser, viewport) {
  const tag = `${viewport.width}px`;
  const ctx = await browser.newContext({ viewport, serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* fine */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!isCancelledPrefetch(e.message)) errors.push(e.message); });

  // THE EXPLORER.
  await signIn(page, 'John Reyes');
  await page.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  let rec = await openRecord(page);
  const summary = await rec.locator('[data-meeting-record-summary]').innerText();
  ok(/Met 2 times/.test(summary) && /1 called off/.test(summary) && /1 moved/.test(summary),
     `${tag}: the Explorer's record sums it up ("${summary}")`);
  const kinds = await rec.locator('[data-meeting-record-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-meeting-record-row')));
  ok(['held', 'agreed', 'called-off', 'moved', 'ahead'].every((k) => kinds.includes(k)), `${tag}: every ending is there (${kinds.join(', ')})`);
  const offRow = rec.locator('[data-meeting-record-row="called-off"]').first();
  ok(/John Reyes called it off/.test(await offRow.innerText()) && /Working late/.test(await offRow.innerText()),
     `${tag}: a called-off one says who, and why`);
  await rec.locator('[data-meeting-record-filter="off"]').click();
  const offOnly = await rec.locator('[data-meeting-record-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-meeting-record-row')));
  ok(offOnly.length === 2 && offOnly.every((k) => k === 'called-off' || k === 'moved'), `${tag}: "Called off or moved" shows only those (${offOnly.join(', ')})`);
  await rec.locator('[data-meeting-record-filter="all"]').click();

  await rec.locator('[data-meeting-mark="done"]').first().click();
  await page.waitForTimeout(500);
  rec = await openRecord(page);
  const after = await rec.locator('[data-meeting-record-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-meeting-record-row')));
  ok(!after.includes('agreed') && after.filter((k) => k === 'held').length === 2, `${tag}: "We met" records it as taken place`);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 0, `${tag}: nothing runs off the side (${over}px over)`);

  // THE GUIDE sees the same record, with the Explorer's answer and name.
  await signIn(page, 'Maria Santos');
  await page.goto(`${BASE}/dm/pair-john`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  rec = await openRecord(page);
  const held = await rec.locator('[data-meeting-record-row="held"]').allInnerTexts();
  ok(held.length === 2 && held.some((t) => /John Reyes marked it as met/.test(t)), `${tag}: the Guide sees the same record, and who marked it`);

  ok(errors.length === 0, `${tag}: no script errors${errors.length ? `: ${errors[0]}` : ''}`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 860 }]) await walk(browser, viewport);
  await browser.close();
  console.log(bad ? `\n${bad} check(s) failed` : '\nThe appointment record holds for both people.');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
