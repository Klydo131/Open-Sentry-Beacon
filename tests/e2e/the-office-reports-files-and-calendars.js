// The Office's Reports, folders and calendars, walked in the sample church.
//
// Asked for on 2 October 2026: a progress report for Guides and higher, in
// the Office with the Reports subroom; folders to keep many Sabbath programs
// and evangelistic meetings in order; and a way to put them on a calendar.
//
//   1. Maria, a Guide, opens Reports and finds her own Explorers' progress,
//      the Bible studies and lessons, and who needs her; changes the period;
//      writes a note that is still there after a reload; downloads the Word
//      file.
//   2. Pastor Ramos, a Director, finds every Explorer in the church by stage
//      and by Guide, and nothing from inside a pairing.
//   3. A program put in a folder is listed in that folder.
//   4. A planned series and a Sabbath program each download a calendar file
//      with an event for each night or timed part; one night opens in Google
//      Calendar.
//
//   npm run build && node scripts/run-next.mjs start -p 4414
//   node tests/e2e/the-office-reports-files-and-calendars.js 4414

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, launchOptions, engineName, isCancelledPrefetch } = require('./_playwright');

const PORT = process.argv[2] || '4414';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function signInAs(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const pick = page.getByText(who).first();
  if (await pick.count()) await pick.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it|Agree|OK/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(700);
  }
}

function storedEntry(buf, name) {
  let at = 0;
  while (at + 30 <= buf.length && buf.readUInt32LE(at) === 0x04034b50) {
    const size = buf.readUInt32LE(at + 18);
    const n = buf.readUInt16LE(at + 26);
    const extra = buf.readUInt16LE(at + 28);
    const start = at + 30 + n + extra;
    if (buf.toString('utf8', at + 30, at + 30 + n) === name) return buf.toString('utf8', start, start + size);
    at = start + size;
  }
  return '';
}

async function downloaded(page, button, scope = page) {
  const [download] = await Promise.all([page.waitForEvent('download'), scope.getByRole('button', { name: button }).click()]);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-office-')), download.suggestedFilename());
  await download.saveAs(file);
  return { name: download.suggestedFilename(), bytes: fs.readFileSync(file) };
}

const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await context.addInitScript(() => {
    try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 3650 * 24 * 60 * 60 * 1000)); } catch { /* fine */ }
  });
  const page = await context.newPage();
  const errors = [];
  // WebKit's cancelled prefetch is not an error (_playwright.js says why).
  page.on('pageerror', (e) => { if (!isCancelledPrefetch(e)) errors.push(String(e)); });

  // 1. A GUIDE'S PROGRESS REPORT
  await signInAs(page, 'Maria Santos');
  await page.goto(`${BASE}/office?room=reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const report = page.locator('[data-panel="progress-report"]');
  ok((await report.count()) === 1, 'a Guide has Reports in the Office, with the progress report');
  ok(/^(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}$/.test(await page.locator('[data-period]').innerText()),
     'it opens on this month');
  const people = await report.locator('[data-explorer]').allInnerTexts();
  ok(people.some((t) => t.includes('John Reyes') && t.includes('Connect · step 2 of 6')) && people.some((t) => t.includes('Grace Lim'))
     && !people.some((t) => t.includes('Peter Tan')),
     'it is the Explorers she walks with, each at their stage, and not another Guide\'s');
  ok((await report.locator('[data-progress-totals] li').count()) === 9 && /Bible studies held/.test(await report.locator('[data-progress-totals]').innerText()),
     'a Guide\'s summary counts Bible studies, lessons and follow-ups too');
  ok(/1 follow-up overdue/.test(await report.locator('[data-attention]').first().innerText().catch(() => '')),
     'and says who needs her: John has a follow-up overdue');
  await page.getByLabel('Period').selectOption('this-quarter');
  ok(/^Quarter \d, \d{4} \(/.test(await page.locator('[data-period]').innerText()), 'the period can be a quarter, as Sabbath School counts');
  await page.getByLabel('Period').selectOption('this-month');
  await page.getByLabel('Your notes for this report').fill('Answered prayer for John\'s mother.');
  ok((await sideways(page)) <= 1, 'the report does not push a phone sideways');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok((await page.getByLabel('Your notes for this report').inputValue()) === 'Answered prayer for John\'s mother.',
     'her notes for the month are still there after a reload');
  const word = await downloaded(page, 'Download Word file', report);
  const xml = storedEntry(word.bytes, 'word/document.xml');
  ok(/^Progress-report-\d{4}-\d{2}\.docx$/.test(word.name) && xml.includes('John Reyes') && xml.includes('Answered prayer for John'),
     `the Word file has her Explorers and her notes (${word.name})`);

  // 2. A DIRECTOR'S: EVERY EXPLORER, STAGES ONLY
  await signInAs(page, 'Pastor Ramos');
  await page.goto(`${BASE}/office?room=reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const church = page.locator('[data-panel="progress-report"]');
  const all = await church.locator('[data-explorer]').allInnerTexts();
  ok(all.some((t) => t.includes('John Reyes') && t.includes('With Maria Santos')) && all.some((t) => t.includes('Peter Tan')),
     'a Director sees every Explorer in the church, with their Guide');
  ok(!/Bible studies held/.test(await church.locator('[data-progress-totals]').innerText())
     && /stay between each Guide and Explorer/.test(await church.innerText()),
     'and nothing from inside a pairing, and the screen says why');
  ok((await church.locator('[data-by-guide] li').count()) >= 2, 'with each Guide summed');
  for (const [w, h] of [[768, 1024], [1280, 860]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(500);
    ok((await sideways(page)) <= 1, `the report fits ${w} wide`);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // 3. FOLDERS
  await signInAs(page, 'Maria Santos');
  await page.goto(`${BASE}/office?room=sabbath`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'New program' }).click();
  await page.getByLabel('Folder', { exact: true }).fill('Quarter 4');
  await page.getByLabel('Time of Sabbath School').fill('9:00 AM');
  const sabbathIcs = await downloaded(page, 'Add to calendar');
  const sabbathText = sabbathIcs.bytes.toString('utf8');
  ok(sabbathIcs.name.endsWith('.ics') && (sabbathText.match(/BEGIN:VEVENT/g) ?? []).length === 1 && /DTSTART:\d{8}T090000/.test(sabbathText),
     'a Sabbath program with a timed part downloads a calendar file with that part in it');
  await page.getByRole('button', { name: 'All programs' }).click();
  await page.getByRole('button', { name: 'New program' }).click();
  await page.getByRole('button', { name: 'All programs' }).click();
  await page.waitForTimeout(300);
  ok((await page.locator('[data-folder="Quarter 4"] [data-program-row]').count()) === 1
     && (await page.locator('[data-program-row]').count()) === 2,
     'a program in a folder is listed in it, and one in none is listed on its own');

  // 4. A SERIES ON THE CALENDAR
  await page.goto(`${BASE}/office?room=evangelism`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'New meetings' }).click();
  await page.getByLabel('First night', { exact: true }).fill('2026-10-04');
  await page.getByLabel('How many nights', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Start with a plan' }).click();
  await page.waitForTimeout(400);
  await page.getByLabel('Folder', { exact: true }).fill('Youth Week');
  const ics = await downloaded(page, 'Add to calendar');
  const text = ics.bytes.toString('utf8');
  ok((text.match(/BEGIN:VEVENT/g) ?? []).length === 3 && text.includes('DTSTART:20261004T173000') && text.includes('DTEND:20261004T210000'),
     'the whole series is one calendar file with every night, 5:30 to 9:00 PM');
  await page.getByLabel('What to take away').selectOption({ index: 1 });
  const google = await page.locator('[data-google-calendar]').getAttribute('href');
  ok(google && google.startsWith('https://calendar.google.com/calendar/render?') && google.includes('20261004T173000'),
     'one night opens in Google Calendar, filled in');
  await page.getByRole('button', { name: 'All meetings' }).click();
  ok((await page.locator('[data-folder="Youth Week"] [data-meeting-row]').count()) === 1, 'and the series sits in its folder');
  ok((await sideways(page)) <= 1, 'nothing here pushes a phone sideways');

  ok(errors.length === 0, `no errors in the page${errors.length ? `: ${errors[0]}` : ''}`);
  await browser.close();
  console.log(`\n(engine: ${engineName})`);
  console.log(bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
