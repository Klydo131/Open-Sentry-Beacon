// This Sabbath: a program shared in the app reaches the right Explorers, not
// the wrong ones, and can still be read with no signal.
//
// Asked for on 2 October 2026: "the output for Sabbath program can be share to
// Explorers too", with Advanced settings, a Canva-ready output, and "accessible
// to all devices, offline and online".
//
// Walked in the sample church, at phone width unless it says otherwise:
//
//   1. Maria, a Guide, switches Advanced on and plans with minutes: start
//      times appear, and a part that runs into the next one is said.
//   2. The platform copy carries a private note; the congregation copy, the
//      picture and the post do not.
//   3. She shares it with the people she walks with.
//   4. John, whom she walks with, finds it on This Sabbath; Peter, whom she does
//      not, does not.
//   5. With the network switched off, John's This Sabbath still shows it.
//   6. Nothing scrolls sideways on a phone, a tablet or a computer.
//
//   npm run build && node scripts/run-next.mjs start -p 4412
//   node tests/e2e/this-sabbath-reaches-explorers-offline.js 4412

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, launchOptions, engineName } = require('./_playwright');

const PORT = process.argv[2] || '4412';
const BASE = `http://localhost:${PORT}`;
const NOTE = 'Pianist plays the first verse through';

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

async function quietStart(context) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 3650 * 24 * 60 * 60 * 1000));
    } catch { /* a private window is not a reason to fail the suite */ }
  });
}

/** One file out of a zip whose entries are stored, which is how the app writes them. */
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

async function downloaded(page, button) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: button }).click()]);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-sabbath-')), download.suggestedFilename());
  await download.saveAs(file);
  return { name: download.suggestedFilename(), bytes: fs.readFileSync(file) };
}

const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await quietStart(context);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // 1. ADVANCED: TIMES, AND A PART THAT RUNS INTO THE NEXT
  await signInAs(page, 'Maria Santos');
  await page.goto(`${BASE}/office?room=sabbath`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('[data-advanced-switch]').check();
  await page.getByRole('button', { name: 'New program' }).click();
  await page.waitForTimeout(400);
  ok(/28 lines still need someone/.test(await page.locator('[data-still-to-fill]').innerText()),
     'a new program says how much is left to arrange');
  await page.getByLabel('Time of Sabbath School').fill('9:00 AM');
  for (const part of ['Song service', 'Opening hymn', 'Opening prayer', 'Welcome', 'Mission story', 'Lesson study', 'Closing hymn', 'Closing prayer']) {
    await page.getByLabel(`Minutes for ${part}`).first().fill('10');
  }
  ok((await page.locator('[data-program-line]').nth(2).locator('[data-line-start]').innerText()) === 'starts 9:20 AM',
     'each line shows when it starts');
  await page.getByLabel('Details for Opening hymn').first().fill('Holy, Holy, Holy');
  await page.getByLabel('Who leads Opening hymn').first().fill('Maria Santos');
  await page.getByLabel('Note for Opening hymn').first().fill(NOTE);
  const noteBox = await page.getByLabel('Note for Opening hymn').first().boundingBox();
  ok(noteBox && noteBox.width >= 240, `a note has room on a phone (${Math.round(noteBox?.width ?? 0)}px)`);
  // The box grows by CSS field-sizing. A browser without it keeps the note on
  // one line that scrolls, on purpose, so the check is for browsers that can.
  if (await page.evaluate(() => CSS.supports('field-sizing', 'content'))) {
    ok(await page.getByLabel('Note for Opening hymn').first().evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
       'and a note longer than the box shows every word, not the first few');
  } else {
    console.log(`SKIP a long note growing to fit: this browser has no field-sizing (engine: ${engineName})`);
  }
  const emptyNote = await page.getByLabel('Note for Opening prayer').first().boundingBox();
  const oneLineBox = await page.getByLabel('Who leads Opening prayer').first().boundingBox();
  ok(emptyNote && oneLineBox && Math.abs(emptyNote.height - oneLineBox.height) <= 1,
     `while an empty note is as tall as the boxes beside it (${Math.round(emptyNote?.height ?? 0)}px, ${Math.round(oneLineBox?.height ?? 0)}px)`);
  ok((await sideways(page)) <= 1, 'Advanced settings do not push the page sideways');
  await page.locator('[data-program-section] > button').nth(1).click();
  await page.getByLabel('Time of Divine Service').fill('10:00 AM');
  ok(/Sabbath School runs 20 minutes into Divine Service/.test(await page.locator('[data-overruns]').innerText().catch(() => '')),
     'Sabbath School running into the Divine Service is said, with the minutes');

  // A DETAIL OF THE CHURCH'S OWN, for what the standard fields do not cover.
  await page.getByRole('button', { name: 'Add a detail' }).click();
  await page.getByLabel('Name of this detail').fill('Deacons on duty');
  await page.getByLabel('What Deacons on duty says').fill('Anna Yu and Peter Tan');
  const detailBox = await page.getByLabel('What Deacons on duty says').boundingBox();
  ok(detailBox && detailBox.width >= 280, `what a detail says has the width of a phone (${Math.round(detailBox?.width ?? 0)}px)`);
  ok((await sideways(page)) <= 1, 'and a detail does not push the page sideways');

  // 2. THE NOTE STAYS ON THE PLATFORM'S COPY
  await page.getByLabel('For the platform, with times and notes').check();
  const platform = await downloaded(page, 'Download Word file');
  const platformXml = storedEntry(platform.bytes, 'word/document.xml');
  ok(platform.name.endsWith('-platform.docx') && platformXml.includes(NOTE) && platformXml.includes('9:10 AM'),
     'the platform Word file has the note and each start time');
  await page.getByLabel('For the congregation').check();
  const congregation = await downloaded(page, 'Download Word file');
  ok(!storedEntry(congregation.bytes, 'word/document.xml').includes(NOTE), 'the congregation Word file does not have the note');
  ok(storedEntry(congregation.bytes, 'word/document.xml').includes('Anna Yu and Peter Tan'), 'and it does have the church\'s own detail');
  const picture = await downloaded(page, 'Download picture');
  ok(picture.bytes.toString('latin1', 1, 4) === 'PNG' && picture.bytes.readUInt32BE(16) === 1080
     && picture.bytes.readUInt32BE(20) > 1000,
     `the picture is a PNG, 1080 wide (${picture.bytes.readUInt32BE(16)} x ${picture.bytes.readUInt32BE(20)})`);
  await page.locator('[data-reminders] summary').click();
  ok((await page.locator('[data-reminder]').count()) === 1, 'Reminders lists the one person named so far');

  // 3. SHARED WITH THE PEOPLE SHE WALKS WITH
  ok(await page.getByRole('radio', { name: /The people I walk with/ }).isChecked(),
     'a Guide shares with the people they walk with unless they choose otherwise');
  await page.getByRole('button', { name: 'Post it' }).click();
  await page.waitForTimeout(500);
  ok(/Posted/.test(await page.locator('[data-share-in-app] [role="status"]').first().innerText()), 'it posts');

  // 4. JOHN FINDS IT; PETER DOES NOT
  await signInAs(page, 'John Reyes');
  await page.goto(`${BASE}/sabbath`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const johnSees = await page.locator('[data-received-program]').first().innerText().catch(() => '');
  ok(/Sabbath, October|Sabbath, [A-Z]/.test(johnSees) && johnSees.includes('Opening hymn: Holy, Holy, Holy (Maria Santos)'),
     'John, whom Maria walks with, finds it on This Sabbath');
  ok(johnSees.includes('Shared by Maria Santos'), 'with her name on it');
  ok(johnSees.includes('Deacons on duty: Anna Yu and Peter Tan'), 'and the church\'s own detail under the date');
  ok(!johnSees.includes(NOTE), 'and without the platform note');
  ok((await page.locator('[data-panel="sabbath-programs"]').count()) === 0, 'an Explorer is not offered the editor');

  // 5. WITH NO SIGNAL
  if (engineName === 'chromium') {
    // The worker has to be controlling the page before the network goes, the
    // way it is for anybody who has opened the app once.
    await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready).catch(() => {});
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2500);
    const offline = await page.locator('[data-received-program]').first().innerText().catch(() => '');
    ok(offline.includes('Opening hymn: Holy, Holy, Holy (Maria Santos)'), 'with the network off, This Sabbath still shows it');
    await context.setOffline(false);
  } else {
    console.log(`SKIP the offline reload: Playwright drives service workers in Chromium only (engine: ${engineName})`);
  }

  await signInAs(page, 'Peter Tan');
  await page.goto(`${BASE}/sabbath`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  ok((await page.locator('[data-received-program]').count()) === 0,
     'Peter, whom Maria does not walk with, does not see it');

  // 6. EVERY WIDTH
  await signInAs(page, 'John Reyes');
  for (const [w, h, what] of [[390, 844, 'a phone'], [768, 1024, 'a tablet'], [1280, 860, 'a computer']]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/sabbath`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    ok((await page.locator('[data-received-program]').count()) === 1 && (await sideways(page)) <= 1,
       `This Sabbath fits ${what}, ${w} wide`);
  }

  // A Director's share goes to the whole church unless they choose otherwise.
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, 'Pastor Ramos');
  await page.goto(`${BASE}/sabbath`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'New program' }).click();
  await page.waitForTimeout(400);
  ok(await page.getByRole('radio', { name: /Everyone in the church/ }).isChecked(),
     'leadership shares with the whole church unless they choose otherwise, from This Sabbath too');

  ok(errors.length === 0, `no errors in the page${errors.length ? `: ${errors[0]}` : ''}`);

  await browser.close();
  console.log(`\n(engine: ${engineName})`);
  console.log(bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
