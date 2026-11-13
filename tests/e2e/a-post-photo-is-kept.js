// A photo added to a post is really kept, in every browser, and a save that
// fails says so.
//
// WHY THIS EXISTS. On WebKit, adding a photo to a post in the sample church
// left an empty grey square and no message (home-is-a-billboard, 13 October
// 2026). Two mistakes, both already learned once by the attachments store
// (lib/localMedia.ts) and repeated by the post photo store:
//
//   - it stored a Blob, which WebKit will not keep in IndexedDB at all
//     (tests/e2e/webkit-idb-probe.js asks the engine directly);
//   - it treated a write as done when the request succeeded, before the
//     transaction committed, so a save that failed afterwards looked kept.
//
// This drives lib/post-media.ts itself in the real browser, so on the WebKit
// run it is Safari's engine answering, not a reading of the code.
//
//   node tests/e2e/a-post-photo-is-kept.js <port>
//   E2E_BROWSER=webkit node tests/e2e/a-post-photo-is-kept.js <port>
const path = require('node:path');
const { build } = require('esbuild');
const { chromium, launchOptions, engineName } = require('./_playwright');

const PORT = process.argv[2] || '4001';
const BASE = `http://localhost:${PORT}`;
const root = path.resolve(__dirname, '..', '..');

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  // The store, bundled on its own: the app's pages are not involved.
  const bundled = await build({
    stdin: {
      contents: "import * as pm from '@/lib/post-media'; window.__postMedia = pm;",
      resolveDir: root,
      loader: 'ts',
    },
    alias: { '@': root },
    bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020',
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  });
  const code = bundled.outputFiles[0].text;

  const browser = await chromium.launch(launchOptions);
  // bypassCSP: the bundle is put into the page as a script, which the app's
  // policy rightly refuses. IndexedDB is per origin, so the app's origin is
  // what matters, not its pages.
  const context = await browser.newContext({ serviceWorkers: 'block', bypassCSP: true });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ content: code });

  const r = await page.evaluate(async () => {
    const pm = window.__postMedia;
    const out = {};
    const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const raw = (id) => new Promise((resolve, reject) => {
      const o = indexedDB.open('beacon-post-media', 1);
      o.onerror = () => reject(o.error);
      o.onsuccess = () => {
        const g = o.result.transaction('files').objectStore('files').get(id);
        g.onsuccess = () => { resolve(g.result); o.result.close(); };
        g.onerror = () => { reject(g.error); o.result.close(); };
      };
    });

    try {
      const src = await pm.keepPostFile(new Blob([bytes], { type: 'image/png' }));
      const back = await pm.readPostFile(src);
      out.kept = back instanceof Blob && back.type === 'image/png'
        && JSON.stringify([...new Uint8Array(await back.arrayBuffer())]) === JSON.stringify([...bytes]);
      const row = await raw(src.slice('device:'.length));
      out.bytes = !!row && !(row instanceof Blob) && row.bytes instanceof ArrayBuffer && row.mime === 'image/png';
      await pm.forgetPostFile(src);
      out.forgotten = (await pm.readPostFile(src)) === undefined;
    } catch (e) {
      out.keepError = String((e && (e.message || e.name)) || e);
    }

    // The request succeeds and the save fails after it, which is how WebKit
    // failed. The store must reject, so the picker can say so.
    const realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const req = realPut.apply(this, args);
      const tx = this.transaction;
      req.addEventListener('success', () => tx.abort());
      return req;
    };
    try {
      await pm.keepPostFile(new Blob([bytes], { type: 'image/png' }));
      out.failureReported = false;
    } catch (e) {
      out.failureReported = true;
      out.failureWords = String((e && (e.message || e.name)) || e);
    } finally {
      IDBObjectStore.prototype.put = realPut;
    }
    return out;
  });

  console.log(`=== the post photo store on ${engineName} ===`);
  ok(r.kept === true, `a photo is kept and read back byte for byte${r.keepError ? ` (refused: ${r.keepError})` : ''}`);
  ok(r.bytes === true, 'and it is stored as bytes with its type, not as a Blob');
  ok(r.forgotten === true, 'taking it off the post removes it from the device');
  ok(r.failureReported === true,
    `a save that fails after its request succeeded is reported${r.failureWords ? ` ("${r.failureWords}")` : ''}, not taken as kept`);

  await browser.close();
  console.log(bad ? `\nRESULT: ${bad} BAD` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
