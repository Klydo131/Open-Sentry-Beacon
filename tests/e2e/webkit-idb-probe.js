// What can this browser actually put in IndexedDB?
//
// WHY THIS EXISTS. Attachments fail on WebKit and pass on Chromium, and two
// attempts to fix it by reasoning failed: reading the File into an ArrayBuffer
// broke Chromium, and holding the bytes across the write did nothing. Both were
// guesses dressed as diagnoses, seventeen minutes of CI apart.
//
// So this stops guessing. It runs a battery of storage attempts against the
// real IndexedDB in the real browser and prints which ones survive, with the
// actual error for the ones that do not. The app is not involved: this is the
// platform being asked a direct question.
//
// The distinction that matters is the LAST case. `new File([bytes], ...)` is
// backed by memory and every browser stores it happily. A File that came out of
// an <input type="file"> is backed by a file on disk, and that is the one the
// app really handles.
//
//   node tests/e2e/webkit-idb-probe.js <port>
//   E2E_BROWSER=webkit node tests/e2e/webkit-idb-probe.js <port>
const { chromium, launchOptions, engineName } = require('./_playwright');

const PORT = process.argv[2] || '4001';
const BASE = `http://localhost:${PORT}`;
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

(async () => {
  const browser = await chromium.launch(launchOptions);
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  // Any page on a real origin will do: IndexedDB is per origin and the app is
  // not involved. That lets the fast workflow serve one static file instead of
  // building Next.js, which is the difference between a one minute answer and a
  // seventeen minute one.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  // A real, disk-backed File, the same way the app gets one.
  await page.evaluate(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'probe-input';
    document.body.appendChild(input);
  });
  await page.locator('#probe-input').setInputFiles({
    name: 'probe.png', mimeType: 'image/png', buffer: PNG,
  });

  const results = await page.evaluate(async () => {
    const DB = 'idb-probe';
    const STORE = 'things';

    function open() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('open failed'));
      });
    }

    // Put one value, then read it back in a SEPARATE transaction, because a
    // write that reports success and a read that returns the bytes are two
    // different claims.
    async function roundTrip(key, value) {
      const db = await open();
      await new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put(value, key);
        t.oncomplete = () => resolve();
        // WebKit reports a null error on abort, so say which hook fired.
        t.onerror = () => reject(t.error || new Error('transaction errored, error was null'));
        t.onabort = () => reject(t.error || new Error('transaction ABORTED, error was null'));
      });
      const back = await new Promise((resolve, reject) => {
        const t = db.transaction(STORE, 'readonly');
        const r = t.objectStore(STORE).get(key);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error || new Error('read failed'));
      });
      db.close();
      if (back == null) return 'stored, but read back as null';
      const size = back.size ?? back.byteLength ?? -1;
      return `ok (${back.constructor && back.constructor.name}, ${size} bytes)`;
    }

    async function attempt(label, make) {
      try {
        return { label, result: await roundTrip(label, await make()) };
      } catch (e) {
        return { label, result: `FAILED — ${e && (e.name ? e.name + ': ' : '')}${e && e.message}` };
      }
    }

    const input = document.getElementById('probe-input');
    const picked = input.files[0];
    const bytes = await picked.arrayBuffer();

    return [
      await attempt('plain object', async () => ({ hello: 'world' })),
      await attempt('ArrayBuffer', async () => bytes.slice(0)),
      await attempt('Uint8Array', async () => new Uint8Array(bytes.slice(0))),
      await attempt('Blob from bytes', async () => new Blob([bytes.slice(0)], { type: 'image/png' })),
      await attempt('File built in memory', async () =>
        new File([bytes.slice(0)], 'memory.png', { type: 'image/png' })),
      // THE SHAPE THE APP NOW STORES: raw bytes with their type beside them.
      // If this ever joins the failing list, lib/localMedia.ts is out of options
      // and the media library needs a different home entirely.
      await attempt('{ bytes, mime } — what we store', async () =>
        ({ bytes: bytes.slice(0), mime: 'image/png' })),
      // The one the app USED to store, kept so the reason is visible.
      await attempt('File from <input>, disk-backed', async () => picked),
      // And the same File after its input has been cleared.
      await attempt('File from <input> after reset', async () => { input.value = ''; return picked; }),
    ];
  });

  console.log(`\n=== IndexedDB storage probe on ${engineName} ===\n`);
  for (const r of results) console.log(`  ${r.label.padEnd(34)} ${r.result}`);
  console.log('');

  const failed = results.filter((r) => /FAILED|read back as null/.test(r.result));
  console.log(failed.length === 0
    ? 'RESULT: this browser stores every shape tested'
    : `RESULT: ${failed.length} shape(s) this browser will not store: ${failed.map((f) => f.label).join(', ')}`);

  await browser.close();
  // Always exit 0. This is an instrument, not a gate: a difference between
  // engines is the finding, not a build failure.
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
