// A PDF kept on the device opens in the app.
//
// A PDF in My files offered only Download, and on an Android phone a download
// is saved to a folder with nothing shown, so the file seemed not to open.
// This walk puts a three-page PDF on the device, taps Read, and checks the
// reader really draws: pages painted with ink, the page count, a larger size,
// and Escape putting it away. At a phone, a pad and a computer's width.
//
//   npm run build && node scripts/run-next.mjs start -p 4392
//   node tests/e2e/a-pdf-opens-in-the-library.js 4392

const { chromium, launchOptions, isCancelledPrefetch } = require('./_playwright');
const PORT = process.argv[2] || '4392';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// Three pages, each with a line of text: the smallest PDF a reader must draw.
function threePagePdf() {
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = [];
  const pagesId = objs.length + 1 + 6; // after 3 contents + 3 pages
  for (let p = 1; p <= 3; p += 1) {
    const text = `BT /F1 28 Tf 72 700 Td (Sample booklet, page ${p}) Tj ET 0 0 1 rg 72 400 300 120 re f`;
    const content = add(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  add(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count 3 >>`);
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  let out = '%PDF-1.4\n';
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

async function walk(browser, viewport) {
  const tag = `${viewport.width}px`;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!isCancelledPrefetch(e.message)) errors.push(e.message); });
  // React reports an error thrown while a component cleans up here, not as a page error.
  page.on('console', (m) => { if (m.type() === 'error' && /TypeError|ReferenceError/.test(m.text())) errors.push(m.text()); });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const maria = page.getByText(/Maria Santos/i).first();
  if (await maria.count()) await maria.click();
  await page.waitForTimeout(1200);
  await page.goto(`${BASE}/library?room=mine`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  await page.locator('input[type="file"]').first().setInputFiles({ name: 'booklet.pdf', mimeType: 'application/pdf', buffer: threePagePdf() });
  const card = page.locator('[data-panel="device-file"]', { hasText: 'booklet' });
  await card.first().waitFor({ timeout: 15000 }).catch(() => {});
  const read = card.getByRole('button', { name: /^Read$/ });
  ok((await read.count()) === 1, `${tag}: a PDF on the device offers Read`);
  await read.click();

  const reader = page.locator('[data-pdf-reader]');
  await reader.waitFor({ timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-pdf-page]').length === 3, null, { timeout: 15000 });
  ok(true, `${tag}: the reader opens with all three pages`);
  ok(/1 of 3/.test(await reader.innerText()), `${tag}: it says which page of how many`);
  // Painted, not just placed: the first page's canvas has dark pixels on it.
  await page.waitForTimeout(1500);
  const inked = await page.locator('[data-pdf-page="1"] canvas').evaluate((c) => {
    if (!c.width || !c.height) return 0;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 0 && d[i] + d[i + 1] + d[i + 2] < 300) dark += 1;
    return dark;
  });
  ok(inked > 200, `${tag}: the first page is drawn with ink (${inked} dark samples)`);

  await page.locator('[data-pdf-page="3"]').evaluate((el) => el.closest('[data-pdf-reader] .overflow-auto').scrollTo(0, 1e6));
  await page.waitForTimeout(400);
  ok(/3 of 3/.test(await reader.innerText()), `${tag}: and keeps count as the reader scrolls`);

  // READ LIKE A BOOK: an option, one page (two on a wide screen) at a time.
  await page.locator('[data-pdf-reader] .overflow-auto').evaluate((el) => el.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const wide = viewport.width >= 900;
  await reader.locator('[data-book-toggle]').click();
  await page.locator('[data-book]').waitFor({ timeout: 5000 });
  const shownPages = () => page.locator('[data-book] [data-pdf-page]').evaluateAll((els) => els.map((e) => e.dataset.pdfPage));
  ok((await shownPages()).join() === '1', `${tag}: Book opens on the cover alone`);
  const bar = reader.locator('[data-book-bar]');
  await bar.getByRole('button', { name: 'Next' }).click();
  await page.waitForTimeout(300);
  ok((await shownPages()).join() === (wide ? '2,3' : '2'), `${tag}: Next turns to ${wide ? 'a two-page spread' : 'the next page'} (${(await shownPages()).join()})`);
  ok(/of 3/.test(await bar.innerText()), `${tag}: the book says where you are`);
  await page.waitForTimeout(1200);
  const bookInk = await page.locator('[data-book] [data-pdf-page] canvas').first().evaluate((c) => {
    if (!c.width || !c.height) return 0;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let dark = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i + 3] > 0 && (d[i] + d[i + 1] + d[i + 2] < 300 || d[i + 2] > 200)) dark += 1;
    return dark;
  });
  ok(bookInk > 200, `${tag}: the turned page is drawn (${bookInk} samples)`);
  const barBox = await bar.boundingBox();
  ok(!!barBox && barBox.y + barBox.height <= viewport.height + 1, `${tag}: the page buttons stay on screen`);
  if (!wide) {
    await bar.getByRole('button', { name: 'Next' }).click();
    await page.waitForTimeout(300);
    ok((await shownPages()).join() === '3' && await bar.getByRole('button', { name: 'Next' }).isDisabled(), `${tag}: the last page has no Next`);
  }
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(300);
  ok((await shownPages()).join() === (wide ? '1' : '2'), `${tag}: the left arrow key turns back`);
  ok(await page.evaluate(() => localStorage.getItem('hb-pdf-book')) === '1', `${tag}: Book is remembered for next time`);
  await reader.locator('[data-book-toggle]').click();
  await page.waitForTimeout(400);
  ok((await page.locator('[data-pdf-page]').count()) === 3 && (await page.locator('[data-book]').count()) === 0, `${tag}: Scroll brings every page back`);
  await page.evaluate(() => localStorage.setItem('hb-pdf-book', '0'));

  await page.locator('[data-pdf-page="1"]').scrollIntoViewIfNeeded();
  const before = await page.locator('[data-pdf-page="1"]').evaluate((el) => el.getBoundingClientRect().width);
  await reader.getByRole('button', { name: 'Larger' }).click();
  await page.waitForTimeout(300);
  const after = await page.locator('[data-pdf-page="1"]').evaluate((el) => el.getBoundingClientRect().width);
  ok(after > before, `${tag}: Larger makes the page bigger (${Math.round(before)} to ${Math.round(after)}px)`);

  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(sideways <= 0, `${tag}: the page behind does not scroll sideways (${sideways}px)`);

  await page.locator('[data-pdf-page="1"]').scrollIntoViewIfNeeded();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok((await reader.count()) === 0, `${tag}: Escape closes the reader`);
  ok(errors.length === 0, `${tag}: no script errors${errors.length ? `: ${errors[0]}` : ''}`);
  await context.close();
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1366, height: 900 }]) {
    await walk(browser, viewport);
  }
  await browser.close();
  console.log(bad === 0 ? '\nA PDF opens in the library.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
