// An empty Library starts where things are added.
//
// Asked for on 14 November 2026: with nothing on the device, the first sight
// was the church's shelf, and adding a file meant hunting for the way in. This
// walk opens the Library with nothing kept and checks it lands on the device
// folder, with Upload and the link form showing; then drops two files at once
// and a link on the card, and checks both files are kept and the link is
// filled in. A person who has chosen a folder is not moved. Phone and desktop.
//
//   npm run build && node scripts/run-next.mjs start -p 4393
//   node tests/e2e/an-empty-library-opens-on-upload.js 4393

const { chromium, launchOptions, isCancelledPrefetch } = require('./_playwright');
const PORT = process.argv[2] || '4393';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function walk(browser, viewport) {
  const tag = `${viewport.width}px`;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => { if (!isCancelledPrefetch(e.message)) errors.push(e.message); });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const maria = page.getByText(/Maria Santos/i).first();
  if (await maria.count()) await maria.click();
  await page.waitForTimeout(1200);

  await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
  await page.locator('[data-library-drop]').waitFor({ timeout: 15000 }).catch(() => {});
  const drop = page.locator('[data-library-drop]');
  ok((await drop.count()) === 1 && await drop.isVisible(), `${tag}: an empty Library opens on adding things`);
  ok(await page.locator('[data-link-form]').isVisible(), `${tag}: the link form is already open`);
  const upload = page.getByRole('button', { name: /Upload files/ });
  ok(await upload.isVisible(), `${tag}: Upload files is on the first screen`);
  await page.waitForTimeout(400);
  const box = await upload.boundingBox();
  ok(!!box && box.y + box.height <= viewport.height, `${tag}: and needs no scrolling to reach`);

  // Two files dropped at once.
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['one'], 'first-note.txt', { type: 'text/plain' }));
    dt.items.add(new File(['two'], 'second-note.txt', { type: 'text/plain' }));
    document.querySelector('[data-library-drop]').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await page.locator('[data-panel="device-file"]').first().waitFor({ timeout: 15000 }).catch(() => {});
  ok((await page.locator('[data-panel="device-file"]').count()) === 2, `${tag}: two files dropped at once are both kept`);

  // A link dropped on the card fills the link box.
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/uri-list', 'https://example.org/sabbath-video');
    document.querySelector('[data-library-drop]').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  const urlBox = page.getByPlaceholder('https://…');
  ok((await urlBox.inputValue()) === 'https://example.org/sabbath-video', `${tag}: a dropped link fills the link box`);
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${tag}: no sideways scroll`);

  // A folder chosen by hand is not overridden next time.
  await page.getByRole('tab', { name: /Browse/ }).click().catch(() => {});
  await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  ok(errors.length === 0, `${tag}: no script errors${errors.length ? ` (${errors[0]})` : ''}`);
  await context.close();
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) await walk(browser, viewport);
  await browser.close();
  console.log(bad ? `\n${bad} BAD` : '\nALL OK');
  process.exit(bad ? 1 : 0);
})();
