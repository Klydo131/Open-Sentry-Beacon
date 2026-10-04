// The Sabbath program, walked the way a Guide would on a phone.
//
// Asked for on 2 October 2026: Guides and everybody above them make their own
// Sabbath program in the Office and download it for Word or Google Docs. Kept
// on the device, by the owner's choice.
//
// So, in the sample church at phone width: open the Office, choose the folder,
// start a program, fill a line, download it, and read the file that arrived.
// Then the parts that matter as much as the file: it is still there after a
// reload, the next person on the same device does not see it, and an Explorer
// is not offered it.
//
// The Word file's structure is checked in depth by
// tests/a-sabbath-program-is-a-word-file.mjs. This proves the button gives the
// person that file, and that the browser's own XML parser can read it.
//
//   npm run build && node scripts/run-next.mjs start -p 4412
//   node tests/e2e/a-sabbath-program-downloads.js 4412

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium, launchOptions, engineName, pageErrors } = require('./_playwright');

const PORT = process.argv[2] || '4412';
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

// The install card is pinned over the bottom of a phone on a first visit.
// Snoozed through the key its own button writes, as tests/e2e/office-subrooms.js does.
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
    const method = buf.readUInt16LE(at + 8);
    const size = buf.readUInt32LE(at + 18);
    const nameLength = buf.readUInt16LE(at + 26);
    const extra = buf.readUInt16LE(at + 28);
    const start = at + 30 + nameLength + extra;
    if (buf.toString('utf8', at + 30, at + 30 + nameLength) === name) {
      return method === 0 ? buf.toString('utf8', start, start + size) : null;
    }
    at = start + size;
  }
  return null;
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
  await quietStart(context);
  const page = await context.newPage();
  const errors = pageErrors(page);

  // 1. A GUIDE FINDS IT IN THE OFFICE
  await signInAs(page, 'Maria Santos');
  await page.goto(`${BASE}/office`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('[data-subroom-toggle]').first().click();
  await page.waitForTimeout(300);
  const option = page.locator('[data-subroom-menu] [role="option"]', { hasText: 'Sabbath program' });
  ok((await option.count()) === 1, 'the Office offers a Guide a Sabbath program folder');
  await option.first().click();
  await page.waitForTimeout(600);
  ok(await page.locator('[data-panel="sabbath-programs"]').isVisible(), 'choosing it opens the Sabbath program');

  // 2. A NEW PROGRAM STARTS FROM THE FOUR PARTS THE OWNER CHOSE
  await page.getByRole('button', { name: 'New program' }).click();
  await page.waitForTimeout(500);
  const editor = page.locator('[data-panel="sabbath-program"]');
  ok(await editor.isVisible(), 'New program opens one, ready to fill');
  const heads = (await page.locator('[data-program-section] > button').allInnerTexts()).map((t) => t.split('\n')[0].trim());
  ok(heads.join(' | ') === 'Sabbath School | Divine Service | Afternoon program (AY) | Sunset vespers',
     `with Sabbath School, the Divine Service, the afternoon program and vespers (${heads.join(' | ')})`);
  ok((await page.locator('[data-program-section] > button[aria-expanded="true"]').count()) === 1,
     'and only the first part open, so the page is not 28 lines long');

  // The squeeze this layout was rebuilt for, twice: a line's name six letters
  // wide ("Song se"), and then the person's name ("Who lead").
  const partBox = await page.getByLabel('Part 2 of Sabbath School').boundingBox();
  ok(partBox && partBox.width >= 240, `a line's name has room to be read on a phone (${Math.round(partBox?.width ?? 0)}px)`);
  const whoBox = await page.getByLabel('Who leads Opening hymn').first().boundingBox();
  ok(whoBox && whoBox.width >= 240, `and so does the name of who leads it (${Math.round(whoBox?.width ?? 0)}px)`);

  // MOVING AND REMOVING are a mode of their own, so the boxes keep their width.
  const first = page.locator('[data-program-section]').first();
  const before = await first.locator('[data-program-line]').count();
  await first.getByRole('button', { name: 'Arrange lines', exact: true }).click();
  await page.getByRole('button', { name: 'Move Song service down', exact: true }).click();
  await page.getByRole('button', { name: 'Remove Closing prayer', exact: true }).click();
  await first.getByRole('button', { name: 'Done', exact: true }).click();
  await page.waitForTimeout(200);
  ok((await first.locator('[data-program-line]').count()) === before - 1, 'a line can be removed');
  ok((await page.getByLabel('Part 1 of Sabbath School').inputValue()) === 'Opening hymn',
     'and a line can be moved: Song service went down one, so Opening hymn leads');

  // 3. FILLED IN, AND DOWNLOADED
  await page.getByLabel('Theme or sermon title (optional)').fill('Rest & renewal');
  await page.getByLabel('Time of Sabbath School').fill('9:00 AM');
  await page.getByLabel('Details for Opening hymn').first().fill('No. 12, Holy, Holy, Holy');
  await page.getByLabel('Who leads Opening hymn').first().fill('Maria Santos');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Download Word file' }).click(),
  ]);
  const name = download.suggestedFilename();
  ok(/^Sabbath-program-\d{4}-\d{2}-\d{2}\.docx$/.test(name), `the download is a Word file named for its Sabbath (${name})`);
  const saved = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-sabbath-walk-')), name);
  await download.saveAs(saved);
  const bytes = fs.readFileSync(saved);
  ok(bytes.readUInt32LE(0) === 0x04034b50, 'and it is a zip, which is what a .docx is');
  const documentXml = storedEntry(bytes, 'word/document.xml') || '';
  ok(documentXml.includes('Maria Santos') && documentXml.includes('No. 12, Holy, Holy, Holy'),
     'what was typed is in the document');
  ok(documentXml.includes('Rest &amp; renewal'), 'an ampersand is escaped on its way into the file');
  ok(documentXml.indexOf('Opening hymn') < documentXml.indexOf('Song service'),
     'and the file is in the order the lines were arranged');
  const parsed = await page.evaluate((xml) => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return doc.getElementsByTagName('parsererror').length === 0 ? doc.documentElement.localName : 'parsererror';
  }, documentXml);
  ok(parsed === 'document', `the browser's own XML parser reads the document part (${parsed})`);
  ok((await page.getByRole('status').allInnerTexts()).some((t) => t.includes(name)), 'and the screen says which file arrived');

  const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(wide <= 1, `the editor does not push the page sideways (${wide}px)`);

  // NEXT WEEK STARTS FROM THIS ONE: most weeks change only who does what.
  const thisWeek = await page.locator('[data-panel="sabbath-program"] h2').innerText();
  await page.getByRole('button', { name: 'Reuse next week' }).click();
  await page.waitForTimeout(400);
  const nextWeek = await page.locator('[data-panel="sabbath-program"] h2').innerText();
  ok(/^Sabbath, /.test(nextWeek) && nextWeek !== thisWeek,
     `Reuse next week opens a copy for the following Sabbath (${thisWeek} -> ${nextWeek})`);
  ok((await page.getByLabel('Who leads Opening hymn').first().inputValue()) === 'Maria Santos', 'with every name kept');

  // 4. STILL THERE TOMORROW, ON THIS DEVICE
  await page.goto(`${BASE}/office?room=sabbath`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const rows = page.locator('[data-program-row]');
  ok((await rows.count()) === 2 && /Rest & renewal/.test(await rows.last().innerText()),
     'after a reload both programs are still in the list');
  ok((await rows.first().innerText()).includes(nextWeek), 'newest Sabbath first');

  // 5. THE NEXT PERSON ON THE SAME DEVICE STARTS WITH THEIR OWN LIST
  await signInAs(page, 'Pastor Ramos');
  await page.goto(`${BASE}/office?room=sabbath`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok(await page.locator('[data-panel="sabbath-programs"]').isVisible(), 'a Director has the Sabbath program too');
  ok((await page.locator('[data-program-row]').count()) === 0, 'and does not see the Guide\'s program on the same device');

  // 6. AN EXPLORER IS NOT OFFERED IT
  await signInAs(page, 'John Reyes');
  await page.goto(`${BASE}/office?room=sabbath`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  ok((await page.locator('[data-panel="sabbath-programs"], [data-panel="sabbath-program"]').count()) === 0,
     'an Explorer who types the address is not shown it');

  const failures = errors.list();
  ok(failures.length === 0, `no errors in the page${failures.length ? `: ${failures[0]}` : ''}`);

  await browser.close();
  console.log(`\n(engine: ${engineName})`);
  console.log(bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
