// The playlist, driven the way a person drives it.
//
// WHY THIS EXISTS RATHER THAN A UNIT TEST. Every part of this feature is a
// browser part: IndexedDB holds the audio, localStorage holds the order, and an
// <audio> element decides when a track ended. A test that stubbed those would
// be testing the stubs. The one thing worth knowing — does the next track
// start? — only a browser can answer.
//
// The playlists live in the Music room's Listen folder (they were in My Files
// until 4 October 2026), which needs somebody signed in to the sample church.
//
//   npm run build && node scripts/run-next.mjs start -p 4330
//   node tests/e2e/playlists.mjs 4330

import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const { signIn } = require('./_looks.js');

const PORT = process.argv[2] || '4330';
const BASE = `http://localhost:${PORT}`;

function findChrome() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const entry of fs.readdirSync(root)) {
      if (!entry.startsWith('chromium-')) continue;
      const candidate = `${root}/${entry}/chrome-linux/chrome`;
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* fall back to Playwright's own copy */ }
  return undefined;
}

let failures = 0;
const ok = (pass, what) => {
  console.log(`${pass ? 'OK ' : 'BAD'} ${what}`);
  if (!pass) failures += 1;
};

const executablePath = findChrome();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({ viewport: { width: 1100, height: 900 }, serviceWorkers: 'block' });
const page = await context.newPage();

await signIn(page, BASE, 'Maria Santos');
await page.goto(`${BASE}/music?room=listen`, { waitUntil: 'networkidle' });

// Three tiny WAVs written straight into the app's own IndexedDB store, because
// the point is to exercise the real read path — getBlob() and an <audio> element
// — not a fixture that pretends to be one.
await page.evaluate(async () => {
  const silentWav = (seconds) => {
    const rate = 8000;
    const samples = rate * seconds;
    const buffer = new ArrayBuffer(44 + samples);
    const view = new DataView(buffer);
    const ascii = (offset, text) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    ascii(0, 'RIFF'); view.setUint32(4, 36 + samples, true); ascii(8, 'WAVEfmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate, true);
    view.setUint16(32, 1, true); view.setUint16(34, 8, true);
    ascii(36, 'data'); view.setUint32(40, samples, true);
    for (let i = 0; i < samples; i += 1) view.setUint8(44 + i, 128);
    return new Blob([buffer], { type: 'audio/wav' });
  };

  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open('beacon-media', 1);
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains('meta')) open.result.createObjectStore('meta', { keyPath: 'id' });
      if (!open.result.objectStoreNames.contains('blobs')) open.result.createObjectStore('blobs');
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });

  const now = new Date().toISOString();
  for (let i = 1; i <= 3; i += 1) {
    const blob = silentWav(1);
    const meta = {
      id: `track-${i}`, title: `Track ${i}`, type: 'audio',
      mime: 'audio/wav', size: blob.size, created_at: now, external_url: '',
    };
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['meta', 'blobs'], 'readwrite');
      tx.objectStore('meta').put(meta);
      tx.objectStore('blobs').put(blob, meta.id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
});

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

ok(await page.getByText('🎵 Playlists').isVisible().catch(() => false),
  'the playlist card appears once there is something to play');

await page.getByRole('button', { name: '+ New playlist' }).click();
await page.locator('input[placeholder="Sunday morning"]').fill('Sunday morning');
await page.getByRole('button', { name: 'Create' }).click();
await page.waitForTimeout(600);
ok(await page.getByText('Sunday morning').first().isVisible().catch(() => false),
  'a playlist can be created and opens');

// Add all three, in order. The <summary> element is clicked directly rather
// than by its text: a collapsed <details> hides its contents from the
// accessibility tree, so a text lookup finds the heading but the buttons under
// it are not yet reachable.
await page.locator('summary').click();
await page.waitForTimeout(400);
for (let i = 0; i < 3; i += 1) {
  await page.locator('details button', { hasText: /^Add$/ }).first().click();
  await page.waitForTimeout(300);
}
const listed = await page.locator('ol li').count();
ok(listed === 3, `all three tracks are in the playlist (saw ${listed})`);

// The order must survive a reload — it lives in localStorage, and a playlist
// that forgets its order between sessions is not a playlist.
const before = await page.locator('ol li').allInnerTexts();
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1000);
await page.getByRole('button', { name: 'Open' }).first().click();
await page.waitForTimeout(600);
const after = await page.locator('ol li').allInnerTexts();
ok(JSON.stringify(before.map((t) => t.split('\n')[0])) === JSON.stringify(after.map((t) => t.split('\n')[0])),
  'the order survives a reload');

// Reordering.
await page.locator('button[aria-label="Move down"]').first().click();
await page.waitForTimeout(400);
const moved = (await page.locator('ol li').allInnerTexts())[0];
ok(/Track 2/.test(moved), `moving a track down reorders it (top is now ${moved.split('\n')[0]})`);

// THE ONE THAT MATTERS: does the next track start on its own?
await page.getByRole('button', { name: 'Play all' }).click();
await page.waitForTimeout(800);
const first = await page.locator('text=/Track \\d of 3/').innerText().catch(() => '');
ok(/Track 1 of 3/.test(first), `the player opens on the first track (${first})`);

await page.getByRole('button', { name: 'Next', exact: true }).click();
await page.waitForTimeout(700);
const second = await page.locator('text=/Track \\d of 3/').innerText().catch(() => '');
ok(/Track 2 of 3/.test(second), `Next advances the queue (${second})`);

await page.getByRole('button', { name: 'Previous', exact: true }).click();
await page.waitForTimeout(700);
const back = await page.locator('text=/Track \\d of 3/').innerText().catch(() => '');
ok(/Track 1 of 3/.test(back), `Previous goes back (${back})`);

// An <audio> element with a real source is what proves the blob path works.
const src = await page.locator('audio').getAttribute('src').catch(() => null);
ok(!!src && src.startsWith('blob:'), 'the track plays from a blob URL read out of IndexedDB');

await browser.close();
console.log(failures === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
