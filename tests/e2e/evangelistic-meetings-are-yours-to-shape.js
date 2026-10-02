// Evangelistic meetings: a Guide shapes a series their own way, and what is
// shared reaches the right Explorers, with no signal too, and never the team's
// own blocks.
//
// Asked for on 2 October 2026: "super customizable, unlike Sabbath program it
// has a template that can put input, but for EMs users can have much more
// freedom to customise their meeting". The owner chose blocks, a list's own
// columns, many nights and the meeting's own look; kept on the device and
// shared as posts; for Guides and above.
//
// Walked in the sample church, at phone width unless it says otherwise:
//
//   1. Maria starts a planned series of three nights and names it.
//   2. She gives it its own look: a colour, a heading face, the name on the left.
//   3. She adds a column of her own to a night's program, and a paragraph.
//   4. She arranges the night's blocks, and copies the night to a new one.
//   5. The Word file holds her columns and look; the team's checklist is only
//      in the team's copy. The picture is a PNG.
//   6. She posts the first night to the people she walks with. John reads it
//      on This Sabbath, with no signal too; Peter does not see it.
//   7. Nothing scrolls sideways on a phone, a tablet or a computer, and it is
//      all still there after a reload.
//
//   npm run build && node scripts/run-next.mjs start -p 4413
//   node tests/e2e/evangelistic-meetings-are-yours-to-shape.js 4413

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, launchOptions, engineName } = require('./_playwright');

const PORT = process.argv[2] || '4413';
const BASE = `http://localhost:${PORT}`;
const TEAM_ONLY = 'Book the place';
const NIGHT_TEAM_ONLY = 'Pick up the projector';

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
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-meetings-')), download.suggestedFilename());
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

  // 1. A PLANNED SERIES, NAMED
  await signInAs(page, 'Maria Santos');
  await page.goto(`${BASE}/office?room=evangelism`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'New meetings' }).click();
  await page.getByLabel('First night', { exact: true }).fill('2026-10-04');
  await page.getByLabel('How many nights', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Start with a plan' }).click();
  await page.waitForTimeout(400);
  ok((await page.locator('[data-night]').count()) === 3, 'a planned series has the nights asked for');
  ok(/Night 1 · Sun, Oct 4 · 7:00 PM/.test(await page.locator('[data-night]').first().innerText()),
     'each night is dated from the first, at the usual time');
  await page.getByLabel('Name of the meetings').fill('Hope for Today');
  await page.getByLabel('Place', { exact: true }).fill('Riverside Hall');

  // 2. ITS OWN LOOK
  await page.locator('[data-look] summary').click();
  // The swatch is what a person taps; its radio is there for keyboards and screen readers.
  await page.locator('[data-look] label[title="Forest"]').click();
  ok(await page.getByRole('radio', { name: 'Forest' }).isChecked(), 'a colour is chosen by tapping its swatch');
  await page.getByRole('radio', { name: 'Clean' }).check();
  await page.getByRole('radio', { name: 'On the left' }).check();
  const preview = await page.locator('[data-look-preview]').evaluate((el) => ({
    border: getComputedStyle(el).borderTopColor, align: getComputedStyle(el).textAlign,
  }));
  ok(preview.border === 'rgb(31, 81, 48)' && preview.align === 'left', 'the look is shown as it is chosen');
  await page.locator('[data-look] summary').click();

  // 3. A COLUMN OF HER OWN, AND A PARAGRAPH
  const night1 = page.locator('[data-night]').first();
  await night1.getByLabel('Topic of night 1').fill('The Blessed Hope');
  await night1.locator('[data-columns] summary').click();
  await night1.getByRole('button', { name: 'Add a column' }).click();
  await night1.getByLabel('Column 4 of Program').fill('Song');
  await night1.locator('[data-columns] summary').click();
  await night1.getByLabel('Time, line 1 of Program').fill('7:00 PM');
  await night1.getByLabel('Who, line 1 of Program').fill('David Cruz');
  await night1.getByLabel('Song, line 1 of Program').fill('Opening song');
  const cell = await night1.getByLabel('Song, line 1 of Program').boundingBox();
  // Side by side, four columns would leave each box about 60px on a phone.
  ok(cell && cell.width >= 240, `a box in a list has the width of a phone (${Math.round(cell?.width ?? 0)}px)`);
  await night1.getByRole('button', { name: 'Add a block' }).click();
  await night1.getByRole('button', { name: /A paragraph/ }).click();
  await night1.getByLabel('Name of this block, in night 1').nth(1).fill('Tonight');
  await night1.getByLabel('Words for Tonight').fill('Bring a friend.');
  // And a checklist for the team, on the night itself, which must never be posted.
  await night1.getByRole('button', { name: 'Add a block' }).click();
  await night1.getByRole('button', { name: /A checklist/ }).click();
  await night1.getByLabel('Item 1 of To do').fill(NIGHT_TEAM_ONLY);
  ok(await night1.getByLabel('Team only: To do').isChecked(), 'a checklist starts as the team\'s only');
  ok((await sideways(page)) <= 1, 'blocks and columns do not push the page sideways');

  // 4. ARRANGED, AND COPIED TO A NEW NIGHT
  await night1.getByRole('button', { name: 'Arrange blocks' }).click();
  await night1.getByRole('button', { name: 'Move Tonight up' }).click();
  await night1.getByRole('button', { name: 'Done' }).click();
  ok((await night1.locator('[data-block]').first().locator('input').first().inputValue()) === 'Tonight',
     'a block moves where it is put');
  await night1.getByRole('button', { name: 'Copy to a new night' }).click();
  await page.waitForTimeout(300);
  ok((await page.locator('[data-night]').count()) === 4, 'copying a night adds one');
  const night4 = page.locator('[data-night]').nth(3);
  ok(/Night 4 · Wed, Oct 7/.test(await night4.innerText()) && /No topic yet/.test(await night4.innerText()),
     'on the day after the last night, with the blocks and no topic');
  ok((await night4.getByLabel('Song, line 1 of Program').inputValue()) === 'Opening song',
     'and the copy keeps her own column');

  // 5. THE WORD FILE, BOTH COPIES, AND THE PICTURE
  const shared = await downloaded(page, 'Download Word file');
  const sharedXml = storedEntry(shared.bytes, 'word/document.xml');
  ok(shared.name === 'Hope-for-Today.docx' && sharedXml.includes('Riverside Hall') && sharedXml.includes('The Blessed Hope')
     && sharedXml.includes('>Song<') && sharedXml.includes('Bring a friend.'),
     'the Word file has the series, its nights, her column and her paragraph');
  ok(!sharedXml.includes(TEAM_ONLY) && !sharedXml.includes(NIGHT_TEAM_ONLY), 'what is shared leaves out the team\'s checklists');
  const styles = storedEntry(shared.bytes, 'word/styles.xml');
  ok(styles.includes('1F5130') && styles.includes('w:ascii="Arial"') && styles.includes('<w:jc w:val="left"/>'),
     'and carries her colour, heading face and the name on the left');
  await page.getByLabel('Everything, for the team').check();
  const team = await downloaded(page, 'Download Word file');
  ok(team.name.endsWith('-team.docx') && storedEntry(team.bytes, 'word/document.xml').includes(TEAM_ONLY)
     && storedEntry(team.bytes, 'word/document.xml').includes(NIGHT_TEAM_ONLY),
     'the team\'s copy has both checklists');
  await page.getByLabel('What is shared').check();
  await page.getByLabel('What to take away').selectOption({ index: 1 });
  const picture = await downloaded(page, 'Download picture');
  ok(picture.bytes.toString('latin1', 1, 4) === 'PNG' && picture.bytes.readUInt32BE(16) === 1080
     && picture.name === 'Hope-for-Today-night-1.png',
     `one night's picture is a PNG, 1080 wide (${picture.name})`);

  // 6. POSTED; JOHN READS IT, WITH NO SIGNAL TOO; PETER DOES NOT
  ok(/Night 1/.test(await page.locator('[data-meeting-share]').innerText()), 'Share in the app posts the night chosen');
  ok(await page.locator('[data-meeting-share]').getByRole('radio', { name: /The people I walk with/ }).isChecked(),
     'a Guide shares with the people they walk with unless they choose otherwise');
  await page.locator('[data-meeting-share]').getByRole('button', { name: 'Post it' }).click();
  await page.waitForTimeout(500);
  ok(/Posted/.test(await page.locator('[data-meeting-share] [role="status"]').innerText()), 'it posts');

  await signInAs(page, 'John Reyes');
  await page.goto(`${BASE}/sabbath`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const johnSees = await page.locator('[data-received-meeting]').first().innerText().catch(() => '');
  ok(johnSees.includes('Hope for Today') && johnSees.includes('The Blessed Hope')
     && johnSees.includes('7:00 PM · Song service · David Cruz · Opening song'),
     'John, whom Maria walks with, finds the night on This Sabbath, every column of it');
  ok(johnSees.includes('Bring a friend.') && johnSees.includes('Shared by Maria Santos'),
     'with her paragraph and her name');
  ok(!johnSees.includes(TEAM_ONLY) && !johnSees.includes(NIGHT_TEAM_ONLY), 'and without either of the team\'s checklists');
  ok((await page.locator('[data-panel="evangelistic-meetings"]').count()) === 0, 'an Explorer is not offered the planner');

  if (engineName === 'chromium') {
    await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready).catch(() => {});
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(2500);
    const offline = await page.locator('[data-received-meeting]').first().innerText().catch(() => '');
    ok(offline.includes('The Blessed Hope'), 'with the network off, This Sabbath still shows it');
    await context.setOffline(false);
  } else {
    console.log(`SKIP the offline reload: Playwright drives service workers in Chromium only (engine: ${engineName})`);
  }

  await signInAs(page, 'Peter Tan');
  await page.goto(`${BASE}/sabbath`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  ok((await page.locator('[data-received-meeting]').count()) === 0, 'Peter, whom Maria does not walk with, does not see it');

  // 7. EVERY WIDTH, AND STILL THERE AFTER A RELOAD
  await signInAs(page, 'John Reyes');
  for (const [w, h, what] of [[390, 844, 'a phone'], [768, 1024, 'a tablet'], [1280, 860, 'a computer']]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/sabbath`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    ok((await page.locator('[data-received-meeting]').count()) === 1 && (await sideways(page)) <= 1,
       `This Sabbath with a meeting fits ${what}, ${w} wide`);
  }
  await signInAs(page, 'Maria Santos');
  for (const [w, h, what] of [[768, 1024, 'a tablet'], [1280, 860, 'a computer']]) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(`${BASE}/office?room=evangelism`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    await page.locator('[data-meeting-row]').first().click();
    await page.waitForTimeout(300);
    ok((await sideways(page)) <= 1, `the planner fits ${what}, ${w} wide`);
  }
  ok((await page.getByLabel('Name of the meetings').inputValue()) === 'Hope for Today'
     && (await page.locator('[data-night]').count()) === 4,
     'everything is still there after a reload');

  // A Director's share goes to the whole church unless they choose otherwise.
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAs(page, 'Pastor Ramos');
  await page.goto(`${BASE}/office?room=evangelism`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: 'New meetings' }).click();
  await page.getByRole('button', { name: 'Start blank' }).click();
  await page.waitForTimeout(300);
  ok(await page.locator('[data-meeting-share]').getByRole('radio', { name: /Everyone in the church/ }).isChecked(),
     'leadership shares with the whole church unless they choose otherwise');
  ok((await page.locator('[data-night]').count()) === 1 && (await page.locator('[data-block]').count()) === 0,
     'a blank start is one night with nothing on it');

  ok(errors.length === 0, `no errors in the page${errors.length ? `: ${errors[0]}` : ''}`);

  await browser.close();
  console.log(`\n(engine: ${engineName})`);
  console.log(bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
