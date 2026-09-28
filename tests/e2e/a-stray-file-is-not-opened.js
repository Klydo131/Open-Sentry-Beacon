// A file let go where nothing takes files is stopped, not opened in the app's
// place -- and nothing else about dragging changes.
//
// Asked for on 28 September 2026, with lesson studies: a handout dropped a few
// pixels from a study's file box was opened by the browser itself, which took
// the tab out of the app and the study being written with it.
// components/StrayFileDrops.tsx now stops such a drop on every screen. This walk
// runs on every engine the suites run on, WebKit included, because what a
// browser does with a dropped file is exactly the kind of thing that differs.
//
//   npm run build && node scripts/run-next.mjs start -p 4382
//   node tests/e2e/a-stray-file-is-not-opened.js 4382

const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4382';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const result = await page.evaluate(() => {
    const dragOf = (kind) => {
      const dt = new DataTransfer();
      if (kind === 'file') dt.items.add(new File(['%PDF-1.4'], 'handout.pdf', { type: 'application/pdf' }));
      else dt.setData('text/plain', 'a sentence');
      return dt;
    };
    // Returns true when the page stopped the browser's own handling.
    const fire = (target, type, dt) =>
      !target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));

    const out = {};
    const nowhere = document.querySelector('header') || document.body;
    const file = dragOf('file');
    out.fileOver = fire(nowhere, 'dragover', file);
    out.fileDropped = fire(nowhere, 'drop', file);

    const text = dragOf('text');
    out.textOver = fire(nowhere, 'dragover', text);
    out.textDropped = fire(nowhere, 'drop', text);

    // A place that does take files, the way every drop box in the app does.
    const box = document.createElement('div');
    let got = 0;
    box.addEventListener('drop', (e) => { e.preventDefault(); got = e.dataTransfer.files.length; });
    document.body.appendChild(box);
    fire(box, 'drop', dragOf('file'));
    out.boxGot = got;
    box.remove();
    return out;
  });

  ok(result.fileOver && result.fileDropped, 'a file dropped where nothing takes files is stopped, not opened by the browser');
  ok(!result.textOver && !result.textDropped, 'dragging text is left exactly as it was');
  ok(result.boxGot === 1, 'and a place that takes files still gets the file');

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
