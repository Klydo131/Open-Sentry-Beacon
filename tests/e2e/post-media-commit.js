// Device photos must survive reload, and a successful request is not a commit.
const { browser, launchOptions, engineName } = require('./_playwright');
const { build } = require('esbuild');
const path = require('node:path');
const BASE = `http://localhost:${process.argv[2] || '4001'}`;

(async () => {
  console.log('Compiling the device-media fixture');
  const compiled = await build({
    absWorkingDir: path.resolve(__dirname, '../..'),
    entryPoints: ['lib/post-media.ts'], bundle: true, write: false,
    format: 'iife', globalName: 'PostMedia', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const code = compiled.outputFiles[0].text;
  console.log('Launching the browser');
  const b = await browser.launch(launchOptions);
  try {
    const page = await b.newPage();
    await page.goto(`${BASE}/privacy`);
    await page.addScriptTag({ content: code });
    console.log('Saving the photo');
    const saved = await page.evaluate(async () => {
      const bytes = [0, 255, 17, 128, 42];
      const src = await PostMedia.keepPostFile(new Blob([new Uint8Array(bytes)], { type: 'image/png' }));
      return { src, bytes };
    });
    await page.reload();
    await page.addScriptTag({ content: code });
    const roundtrip = await page.evaluate(async ({ src }) => {
      const file = await PostMedia.readPostFile(src);
      return { bytes: [...new Uint8Array(await file.arrayBuffer())], mime: file.type };
    }, saved);
    require('node:assert/strict').deepEqual(roundtrip, { bytes: saved.bytes, mime: 'image/png' });
    console.log('OK  exact photo bytes and MIME survive reload');

    // Abort a real transaction after its put request succeeds. Resolving from
    // request.onsuccess would falsely report the rolled-back file as saved.
    const rejected = await page.evaluate(async () => {
      const put = IDBObjectStore.prototype.put;
      let succeeded = false;
      let rejected = false;
      let key;
      IDBObjectStore.prototype.put = function (...args) {
        key = args[1];
        const request = put.apply(this, args);
        request.addEventListener('success', () => { succeeded = true; this.transaction.abort(); });
        return request;
      };
      try {
        await PostMedia.keepPostFile(new Blob(['not committed']));
      } catch (error) { rejected = error instanceof Error; }
      finally { IDBObjectStore.prototype.put = put; }
      return { rejected, succeeded, missing: !(await PostMedia.readPostFile(`device:${key}`)) };
    });
    require('node:assert/strict').deepEqual(rejected, { rejected: true, succeeded: true, missing: true });
    console.log('OK  an abort after request success rejects the save');

    // Chromium can seed the old Blob format. Playwright's WebKit cannot write
    // that format at all, which is why new writes use bytes instead.
    if (engineName === 'chromium') {
      const legacy = await page.evaluate(async () => {
        await new Promise((resolve, reject) => {
          const open = indexedDB.open('beacon-post-media', 1);
          open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('files', 'readwrite');
            tx.objectStore('files').put(new Blob(['old photo'], { type: 'image/jpeg' }), 'legacy');
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onabort = () => { db.close(); reject(tx.error); };
          };
          open.onerror = () => reject(open.error);
        });
        const file = await PostMedia.readPostFile('device:legacy');
        return { text: await file.text(), mime: file.type };
      });
      require('node:assert/strict').deepEqual(legacy, { text: 'old photo', mime: 'image/jpeg' });
      console.log('OK  existing Blob photos remain readable');
    }
    await page.evaluate(async ({ src }) => {
      await PostMedia.forgetPostFile(src);
      if (await PostMedia.readPostFile(src)) throw new Error('Deleted photo remains readable');
    }, saved);
    console.log('OK  a committed deletion removes the photo');
  } finally { await b.close(); }
})().catch(error => { console.error(error); process.exit(1); });
