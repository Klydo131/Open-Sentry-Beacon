// The Music room, walked the way a choir member would.
//
// Asked for on 4 October 2026: "another room for music for music lovers and
// choir ... take out the audio tools from the library ... I want a tuner, a
// piece scanner, and beat maker (where you can track the beat like a
// conductor)". tests/the-music-room.mjs holds the arithmetic and the code's
// promises; this proves the screens do what they say, in a browser:
//
//   - everybody finds Music in their rooms, and My Files points to it
//   - the Tuner hears a 440 Hz tone as A4 in tune, follows a change of
//     concert pitch, and lets the microphone go on Stop, on leaving the
//     folder and when the phone locks
//   - concert pitch is heard: a choice plays its A and says what it does, the
//     starting note follows it, Compare plays 440 then yours, and Listen for
//     the A takes an instrument's A and offers it
//   - Advanced settings (5 October 2026), off until ticked: the Tuner's trail,
//     drone and transposing instruments; the Conductor's clicks between beats,
//     silent beats, count-in, speed trainer and saved tempos, counted by the
//     sounds actually made; the score's transpose, loop, sound and silent
//     part; and the Play folder's keyboard, chords and beat maker
//   - the Conductor's baton moves on the beat, follows tapped tempo and a
//     change of time signature, runs silent, and closes its audio on Stop
//   - a score file opens, plays, follows your part and a change of tempo
//     while playing, is kept, and opens again after a reload; a hostile one
//     is refused in words
//   - a photo of a page becomes a clean page, is kept without the photo,
//     and is deleted with two taps
//
// THE MICROPHONE IS FAKE, AND ONLY ON CHROMIUM: Chromium can be handed a WAV
// file to use as the microphone. WebKit cannot, so on Safari the walk checks
// only that pressing Start either listens or says plainly why it cannot.
//
// The invented sample church only. A phone and a computer.
//
//   node tests/e2e/the-music-room.js [port]
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { browser: engine, engineName, launchOptions, openRoom, pageErrors } = require('./_playwright');
const { signIn } = require('./_looks');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
const FIXTURE = path.join(__dirname, '..', 'fixtures', 'music', 'four-parts.musicxml');

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

/** Two seconds of A 440 Hz, as a 16-bit mono WAV: the fake microphone's sound. */
function toneWav(hz, seconds = 2, rate = 44100) {
  const n = Math.round(seconds * rate);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 0.5 * 32767), 44 + i * 2);
  return buf;
}

// Before any page script: count every audio clock and every microphone the
// page opens, so the walk can see that each one was closed again.
const WATCH = () => {
  window.__clocks = [];
  window.__mics = [];
  const Clock = window.AudioContext || window.webkitAudioContext;
  if (Clock) {
    const Watched = class extends Clock {
      constructor(...args) { super(...args); window.__clocks.push(this); }
    };
    // Every tone made, so a click can be counted rather than assumed.
    window.__osc = 0;
    const make = Clock.prototype.createOscillator;
    Watched.prototype.createOscillator = function (...args) { window.__osc += 1; return make.apply(this, args); };
    window.AudioContext = Watched;
    if (window.webkitAudioContext) window.webkitAudioContext = Watched;
  }
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const ask = md.getUserMedia.bind(md);
    // window.__micDelay holds the answer back, as a person reading the
    // browser's question does, so the walk can leave before it comes.
    md.getUserMedia = async (c) => {
      if (window.__micDelay) await new Promise((r) => setTimeout(r, window.__micDelay));
      const s = await ask(c); window.__mics.push(s); return s;
    };
  }
  // Refuse a Blob in IndexedDB the way WebKit does, on every engine, so a
  // store that forgets it fails here and not only on Safari (4 October 2026:
  // the room's pieces did exactly that).
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    if (value instanceof Blob) throw new DOMException('A Blob cannot be stored here (as on WebKit).', 'DataCloneError');
    return put.call(this, value, key);
  };
  // about:blank has no storage, and this runs there too.
  try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864000000)); } catch { /* not a page of the app */ }
};
const micsLive = (page) => page.evaluate(() => window.__mics.flatMap((s) => s.getTracks()).filter((t) => t.readyState !== 'ended').length);
const clocksOpen = (page) => page.evaluate(() => window.__clocks.filter((c) => c.state !== 'closed').length);
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const say = (page, sel) => page.locator(sel).first().innerText().catch(() => '');

// The Tuner, Conductor and Pieces are fetched when first needed (the audit of
// 4 October 2026), so opening one shows "Opening" for a moment on a slow
// machine. Open the folder, then wait for what it draws, as a person would.
const FOLDER = { Tuner: '[data-music-tuner]', Conductor: '[data-music-conductor]', Pieces: '[data-music-pieces]', Listen: '[data-music-listen]', Play: '[data-music-play]' };
async function openFolder(page, name) {
  await openRoom(page, name);
  await page.locator(FOLDER[name]).first().waitFor({ timeout: 15000 }).catch(() => {});
}

/** A photo of a page lying on a desk, a little crooked, drawn in the page and returned as PNG bytes. */
async function deskPhoto(page) {
  const b64 = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 900;
    const g = c.getContext('2d');
    g.fillStyle = '#6b5b4b'; g.fillRect(0, 0, 1200, 900);
    // The paper, skewed, and darker on one side as if in shadow.
    const corners = [[260, 90], [930, 130], [960, 840], [220, 800]];
    const grad = g.createLinearGradient(220, 0, 960, 0);
    grad.addColorStop(0, '#f2efe8'); grad.addColorStop(1, '#a9a69f');
    g.fillStyle = grad;
    g.beginPath(); corners.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill();
    // Staves of five lines, and noteheads.
    g.strokeStyle = '#222'; g.lineWidth = 2;
    for (let s = 0; s < 6; s += 1) {
      for (let l = 0; l < 5; l += 1) {
        const y = 200 + s * 100 + l * 10;
        g.beginPath(); g.moveTo(300, y + (s * 3)); g.lineTo(890, y + 20 + s * 3); g.stroke();
      }
      g.fillStyle = '#111';
      for (let n = 0; n < 8; n += 1) { g.beginPath(); g.ellipse(340 + n * 70, 215 + s * 100 + (n % 5) * 5, 8, 6, -0.3, 0, Math.PI * 2); g.fill(); }
    }
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  });
  return Buffer.from(b64, 'base64');
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-music-walk-'));
  const wav = path.join(tmp, 'a440.wav');
  fs.writeFileSync(wav, toneWav(440));
  const fakeMic = engineName === 'chromium';
  const browser = await engine.launch({
    ...launchOptions,
    args: fakeMic
      ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${wav}`, '--autoplay-policy=no-user-gesture-required']
      : [],
  });

  try {
    for (const [size, width, height, who] of [['phone', 390, 844, 'John Reyes'], ['computer', 1280, 900, 'Maria Santos']]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: size === 'phone' });
      if (fakeMic) await context.grantPermissions(['microphone'], { origin: BASE });
      await context.addInitScript(WATCH);
      const page = await context.newPage();
      const errors = pageErrors(page);
      await signIn(page, BASE, who);

      // 1. EVERYBODY FINDS IT -------------------------------------------------
      if (size === 'phone') {
        await page.goto(`${BASE}/menu`, { waitUntil: 'networkidle' });
        ok(await page.locator('a[href="/music"]').first().isVisible(), `${size}: an Explorer finds Music in the Menu`);
      } else {
        await page.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
        ok(await page.locator('a[href="/music"]').first().isVisible(), `${size}: a Guide finds Music in the rooms down the left`);
      }
      await page.goto(`${BASE}/music`, { waitUntil: 'networkidle' });
      ok(/Music/.test(await say(page, '[data-music-room] h1')), `${size}: the Music room opens`);
      ok(await page.getByText('Beacon media player').first().isVisible(), `${size}: it opens on Listen, with the media player`);
      ok(await page.getByRole('button', { name: /Add music from this phone/ }).isVisible(), `${size}: music can be added from here`);
      ok((await sideways(page)) <= 1, `${size}: nothing scrolls sideways in Listen`);

      // 2. THE TUNER ----------------------------------------------------------
      await openFolder(page, 'Tuner');
      ok(await page.locator('[data-music-tuner]').isVisible(), `${size}: the Tuner folder opens`);
      ok(/A = 440 Hz/.test(await say(page, '[data-tuner-a4]')), `${size}: concert pitch starts at A 440`);
      await page.getByRole('button', { name: /Start listening/ }).click();
      if (fakeMic) {
        await page.waitForFunction(() => /A\s*4/.test(document.querySelector('[data-tuner-reading] p')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
        ok(/^A\s*4$/.test((await say(page, '[data-tuner-reading] p')).trim()), `${size}: a 440 Hz tone reads as A4`);
        // Read twenty times over two seconds, as a person watching would: the
        // fake microphone's file starts again every two seconds, and a tuner
        // shows the seam for a moment the way it would show a breath.
        const heard = [];
        for (let i = 0; i < 20; i += 1) { heard.push((await say(page, '[data-tuner-verdict]')).trim()); await page.waitForTimeout(100); }
        const steady = heard.filter((v) => /In tune/.test(v)).length;
        ok(steady >= 15, `${size}: and as in tune (${steady} of 20 readings${steady < 20 ? `; otherwise ${[...new Set(heard.filter((v) => !/In tune/.test(v)))].join(', ')}` : ''})`);
        ok(await page.locator('[data-tuner-needle]').isVisible(), `${size}: the needle is drawn`);
        // A choir tuned to A 445 hears the same tone as flat.
        for (let i = 0; i < 5; i += 1) await page.getByRole('button', { name: '+ 1' }).click();
        await page.waitForTimeout(600);
        ok(/A = 445 Hz/.test(await say(page, '[data-tuner-a4]')) && /flat/.test(await say(page, '[data-tuner-verdict]')),
           `${size}: at A 445 the same tone reads flat (${(await say(page, '[data-tuner-verdict]')).trim()})`);
        await page.reload({ waitUntil: 'networkidle' });
        await openFolder(page, 'Tuner');
        ok(/A = 445 Hz/.test(await say(page, '[data-tuner-a4]')), `${size}: the chosen concert pitch is remembered on the phone`);
        await page.locator('[data-pitch-choice="440"]').click();
        // That choice plays its A; let it finish before counting audio clocks.
        await page.waitForTimeout(1300);
        // Stop lets the microphone go.
        await page.getByRole('button', { name: /Start listening/ }).click();
        await page.waitForTimeout(800);
        ok((await micsLive(page)) === 1, `${size}: listening holds one microphone`);
        await page.getByRole('button', { name: /Stop listening/ }).click();
        await page.waitForTimeout(200);
        ok((await micsLive(page)) === 0 && (await clocksOpen(page)) === 0, `${size}: Stop lets the microphone and its audio go`);
        // Leaving the folder does too.
        await page.getByRole('button', { name: /Start listening/ }).click();
        await page.waitForTimeout(800);
        await openFolder(page, 'Conductor');
        await page.waitForTimeout(200);
        ok((await micsLive(page)) === 0, `${size}: leaving the Tuner lets the microphone go`);
        // And the phone locking.
        await openFolder(page, 'Tuner');
        await page.getByRole('button', { name: /Start listening/ }).click();
        await page.waitForTimeout(800);
        await page.evaluate(() => {
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange'));
        });
        await page.waitForTimeout(200);
        ok((await micsLive(page)) === 0, `${size}: the phone locking lets the microphone go`);
        await page.evaluate(() => { delete document.hidden; });
        // Left while the browser was still asking: the answer arrives after,
        // and the microphone must not start listening behind the person's back.
        await page.reload({ waitUntil: 'networkidle' });
        await openFolder(page, 'Tuner');
        await page.evaluate(() => { window.__micDelay = 1200; });
        await page.getByRole('button', { name: /Start listening/ }).click();
        await page.waitForTimeout(150);
        await openFolder(page, 'Conductor');
        await page.waitForTimeout(1700);
        ok((await page.evaluate(() => window.__mics.length)) === 1 && (await micsLive(page)) === 0,
           `${size}: a microphone allowed after leaving the Tuner is let go at once`);
        await page.evaluate(() => { window.__micDelay = 0; });
        await openFolder(page, 'Tuner');
      } else {
        await page.waitForTimeout(1500);
        const listening = await page.getByRole('button', { name: /Stop listening/ }).isVisible();
        const said = await page.locator('[data-music-tuner] [role="alert"]').isVisible();
        ok(listening || said, `${size}: Start either listens or says why it cannot (${engineName} has no fake microphone)`);
        if (listening) await page.getByRole('button', { name: /Stop listening/ }).click();
      }
      // CONCERT PITCH YOU CAN HEAR (asked for on 4 October 2026: "I just put
      // the Hertz and nothing much is happening").
      ok(/A = 440 Hz/.test(await say(page, '[data-tuner-a4]')) && /standard/.test(await say(page, '[data-pitch-words]')),
         `${size}: concert pitch is back at 440, called the standard`);
      await page.locator('[data-pitch-choice="442"]').click();
      await page.waitForTimeout(150);
      ok(/A at 442 Hz/.test(await say(page, '[data-pitch-now]')), `${size}: choosing 442 plays its A (${(await say(page, '[data-pitch-now]')).trim() || 'nothing'})`);
      ok(/A = 442 Hz/.test(await say(page, '[data-tuner-a4]')) && /8 cents higher/.test(await say(page, '[data-pitch-words]')),
         `${size}: and says what it does (${(await say(page, '[data-pitch-words]')).trim()})`);
      ok((await page.locator('[data-pitch-choice="442"]').getAttribute('aria-pressed')) === 'true', `${size}: the 442 choice is shown as chosen`);
      ok(/C4 sounds at 262\.8 Hz, from your concert pitch A = 442 Hz/.test(await say(page, '[data-pipe-hz]')),
         `${size}: the starting note follows it (${(await say(page, '[data-pipe-hz]')).trim()})`);
      ok(/A = 442/.test(await say(page, '[data-tuner-against]')), `${size}: and the tuner says what it measures against`);
      await page.waitForTimeout(1000);
      await page.getByRole('button', { name: /Compare with 440/ }).click();
      await page.waitForTimeout(400);
      const first = (await say(page, '[data-pitch-now]')).trim();
      await page.waitForTimeout(1500);
      const second = (await say(page, '[data-pitch-now]')).trim();
      ok(/standard A, 440/.test(first) && /your A, 442/.test(second), `${size}: Compare plays 440, then yours (${first} / ${second})`);
      await page.waitForTimeout(1600);
      ok(!(await say(page, '[data-pitch-now]')).trim() && (await clocksOpen(page)) === 0, `${size}: and goes quiet by itself, closing its audio`);
      // Matching an instrument: the fake microphone holds an A at 440.
      if (fakeMic) {
        await page.getByRole('button', { name: /Listen for the A/ }).click();
        await page.waitForFunction(() => /The A you played is/.test(document.querySelector('[data-pitch-heard]')?.textContent || ''), null, { timeout: 9000 }).catch(() => {});
        const heard = (await say(page, '[data-pitch-heard]')).trim();
        ok(/The A you played is 4(39\.\d|40\.\d) Hz/.test(heard), `${size}: Listen for the A hears the instrument's A (${heard || 'nothing'})`);
        ok((await micsLive(page)) === 0, `${size}: and lets the microphone go once it has heard it`);
        await page.getByRole('button', { name: 'Use 440 Hz' }).click();
        ok(/A = 440 Hz/.test(await say(page, '[data-tuner-a4]')) && /Concert pitch is now A = 440 Hz/.test(await say(page, '[data-pitch-heard]')),
           `${size}: Use 440 Hz makes it the concert pitch`);
        await page.waitForTimeout(1200);
      } else {
        await page.getByRole('button', { name: /Listen for the A/ }).click();
        await page.waitForTimeout(1500);
        const listening = await page.getByRole('button', { name: /Stop listening for the A/ }).isVisible();
        const said = await page.locator('[data-music-tuner] [role="alert"]').isVisible();
        ok(listening || said, `${size}: Listen for the A either listens or says why it cannot (${engineName} has no fake microphone)`);
        if (listening) await page.getByRole('button', { name: /Stop listening for the A/ }).click();
        await page.locator('[data-pitch-choice="440"]').click();
        await page.waitForTimeout(1200);
      }
      // THE TUNER'S ADVANCED SETTINGS: off until ticked.
      ok(!(await page.locator('[data-tuner-trail]').count()), `${size}: the Tuner is simple until Advanced is ticked`);
      await page.locator('#music-advanced-tuner').check();
      ok(await page.locator('[data-tuner-trail]').isVisible() && await page.locator('[data-tuner-drone]').isVisible() && await page.locator('[data-tuner-instrument]').isVisible(),
         `${size}: Advanced opens the trail, the drone and the instrument`);
      await page.getByRole('button', { name: /Start the drone/ }).click();
      await page.waitForTimeout(300);
      ok((await clocksOpen(page)) === 1 && await page.getByRole('button', { name: /Stop the drone/ }).isVisible(), `${size}: the drone sounds`);
      await page.getByRole('button', { name: /Stop the drone/ }).click();
      await page.waitForTimeout(600);
      ok((await clocksOpen(page)) === 0, `${size}: and stops, closing its audio`);
      if (fakeMic) {
        await page.locator('#tuner-instrument').selectOption('Bb');
        await page.getByRole('button', { name: /Start listening/ }).click();
        await page.waitForFunction(() => /B\s*4/.test(document.querySelector('[data-tuner-reading] p')?.textContent || ''), null, { timeout: 8000 }).catch(() => {});
        ok(/^B\s*4$/.test((await say(page, '[data-tuner-reading] p')).trim()) && /Sounds as A4/.test(await say(page, '[data-tuner-sounds]')),
           `${size}: for a B♭ clarinet, a concert A reads as B (${(await say(page, '[data-tuner-reading] p')).trim()}; ${(await say(page, '[data-tuner-sounds]')).trim()})`);
        await page.waitForTimeout(600);
        const inked = await page.locator('[data-tuner-trail] canvas').evaluate((c) => {
          const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200 && d[i + 1] > d[i] + 60) n += 1;
          return n;
        });
        ok(inked > 30, `${size}: the trail draws the voice (${inked} pixels of line)`);
        await page.getByRole('button', { name: /Stop listening/ }).click();
        await page.locator('#tuner-instrument').selectOption('C');
      }
      await page.locator('#music-advanced-tuner').uncheck();
      ok(!(await page.locator('[data-tuner-trail]').count()), `${size}: unticked, the Tuner is simple again`);
      await page.waitForTimeout(300);
      // The pitch pipe sounds and goes quiet by itself.
      await page.getByRole('button', { name: /Play C4/ }).click();
      ok(await page.locator('[data-music-tuner]').getByRole('button', { name: '■ Stop', exact: true }).isVisible(), `${size}: the starting note sounds`);
      await page.waitForTimeout(2800);
      ok(await page.getByRole('button', { name: /Play C4/ }).isVisible() && (await clocksOpen(page)) === 0,
         `${size}: and stops by itself, closing its audio`);
      ok((await sideways(page)) <= 1, `${size}: nothing scrolls sideways in the Tuner`);

      // 3. THE CONDUCTOR ------------------------------------------------------
      await openFolder(page, 'Conductor');
      const hand = page.locator('[data-baton-hand]');
      ok(/80/.test(await say(page, '[data-tempo]')) && (await page.locator('[data-baton] circle').count()) === 5,
         `${size}: the Conductor starts at 80 in 4/4 (four beats and the hand)`);
      await page.getByRole('button', { name: '▶ Start' }).click();
      await page.waitForTimeout(900);
      const a = await hand.evaluate((el) => `${el.getAttribute('cx')},${el.getAttribute('cy')}`);
      await page.waitForTimeout(170);
      const b = await hand.evaluate((el) => `${el.getAttribute('cx')},${el.getAttribute('cy')}`);
      ok(a !== b, `${size}: the baton moves (${a} then ${b})`);
      ok(await page.locator('[data-baton] circle.fill-teal-700').count() === 1, `${size}: the beat it is on is lit`);
      // Tap the beat five times, and check the tempo against when the taps
      // actually landed, not against the half second the walk meant: on a
      // busy CI machine a click can arrive hundreds of milliseconds late
      // (Safari's runner read 63 for taps meant as 120, 4 October 2026).
      // The arithmetic of tap tempo is held by tests/the-music-room.mjs;
      // this holds the wiring.
      await page.evaluate(() => {
        window.__tapsAt = [];
        document.addEventListener('click', (e) => {
          if (e.target instanceof Element && e.target.closest('button')?.textContent?.includes('Tap the beat')) window.__tapsAt.push(performance.now());
        }, true);
      });
      for (let i = 0; i < 5; i += 1) { await page.getByRole('button', { name: /Tap the beat/ }).click(); await page.waitForTimeout(500); }
      const tapped = Number((await say(page, '[data-tempo]')).trim());
      const expected = await page.evaluate(() => {
        // The rule in lib/music/beat.ts: a pause over two seconds starts a new
        // count; the last four gaps are averaged; 30 to 240.
        let kept = [];
        for (const at of window.__tapsAt) {
          if (kept.length && at - kept[kept.length - 1] > 2000) kept = [];
          kept = [...kept, at].slice(-5);
        }
        const gaps = kept.slice(1).map((t, i) => t - kept[i]);
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        return Math.min(240, Math.max(30, Math.round(60000 / mean)));
      });
      ok(Math.abs(tapped - expected) <= 1, `${size}: the tempo follows the taps (${tapped}, from taps that landed at ${expected} a minute)`);
      await page.getByRole('button', { name: '3/4' }).click();
      ok((await page.locator('[data-baton] circle').count()) === 4, `${size}: 3/4 draws three beats`);
      await page.locator('#conductor-sound').uncheck();
      await page.waitForTimeout(600);
      const c = await hand.evaluate((el) => `${el.getAttribute('cx')},${el.getAttribute('cy')}`);
      await page.waitForTimeout(170);
      const d = await hand.evaluate((el) => `${el.getAttribute('cx')},${el.getAttribute('cy')}`);
      ok(c !== d, `${size}: silent, the baton still keeps time`);
      await page.getByRole('button', { name: '■ Stop' }).click();
      await page.waitForTimeout(200);
      ok((await clocksOpen(page)) === 0, `${size}: Stop closes the conductor's audio`);
      ok((await sideways(page)) <= 1, `${size}: nothing scrolls sideways in the Conductor`);

      // 3b. THE CONDUCTOR'S ADVANCED SETTINGS, heard: each tone the page makes is counted.
      await page.locator('#conductor-sound').check();
      await page.getByRole('button', { name: '4/4' }).click();
      await page.locator('#conductor-tempo').fill('120');
      await page.locator('#music-advanced-conductor').check();
      ok(await page.locator('[data-conductor-subdivision]').isVisible(), `${size}: Advanced opens the Conductor's extra settings`);
      const tones = async (ms) => {
        await page.evaluate(() => { window.__osc = 0; });
        await page.getByRole('button', { name: '▶ Start' }).click();
        await page.waitForTimeout(ms);
        await page.getByRole('button', { name: '■ Stop' }).click();
        await page.waitForTimeout(150);
        return page.evaluate(() => window.__osc);
      };
      const plain = await tones(2000);
      await page.getByRole('button', { name: '2 to a beat' }).click();
      const halves = await tones(2000);
      ok(plain >= 3 && halves >= plain * 1.6, `${size}: two clicks to a beat doubles the clicks (${plain}, then ${halves})`);
      await page.getByRole('button', { name: 'Beats only' }).click();
      for (const n of [2, 3, 4]) await page.getByRole('button', { name: new RegExp(`^Beat ${n}: Normal`) }).click();
      const firstOnly = await tones(2000);
      ok(firstOnly <= Math.ceil(plain / 4) + 1, `${size}: silent beats make no sound (${firstOnly} clicks where there were ${plain})`);
      for (const n of [2, 3, 4]) {
        await page.getByRole('button', { name: new RegExp(`^Beat ${n}: Silent`) }).click();
        await page.getByRole('button', { name: new RegExp(`^Beat ${n}: Loud`) }).click();
      }
      await page.locator('#conductor-count-in').check();
      const counted = await tones(3200);
      ok(counted >= 3 && counted <= 5, `${size}: count-in sounds one bar, then the hand alone (${counted} clicks in 3.2 seconds at 120)`);
      await page.locator('#conductor-count-in').uncheck();
      await page.locator('#conductor-trainer').check();
      for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Less: Every' }).click();
      await page.getByRole('button', { name: '▶ Start' }).click();
      await page.waitForTimeout(4400);
      const trained = Number((await say(page, '[data-tempo]')).trim());
      await page.getByRole('button', { name: '■ Stop' }).click();
      ok(trained >= 122, `${size}: the speed trainer gets faster bar by bar (120, then ${trained})`);
      await page.locator('#conductor-trainer').uncheck();
      const keptBpm = (await say(page, '[data-tempo]')).trim();
      await page.locator('#conductor-tempo-name').fill('Hymn 100');
      await page.getByRole('button', { name: /^Save \d+ in/ }).click();
      ok((await page.locator('[data-saved-tempo]').filter({ hasText: 'Hymn 100' }).count()) === 1, `${size}: a tempo is saved with its name`);
      await page.locator('#conductor-tempo').fill('70');
      await page.locator('[data-saved-tempo]').filter({ hasText: 'Hymn 100' }).click();
      ok((await say(page, '[data-tempo]')).trim() === keptBpm, `${size}: and one tap brings it back (${keptBpm})`);
      await page.reload({ waitUntil: 'networkidle' });
      await openFolder(page, 'Conductor');
      ok(await page.locator('#music-advanced-conductor').isChecked() && (await page.locator('[data-saved-tempo]').filter({ hasText: 'Hymn 100' }).count()) === 1,
         `${size}: Advanced and the saved tempo are remembered on the phone`);
      await page.locator('#music-advanced-conductor').uncheck();
      ok(!(await page.locator('[data-conductor-subdivision]').count()), `${size}: unticked, the Conductor is simple again`);
      ok((await clocksOpen(page)) === 0 && (await sideways(page)) <= 1, `${size}: nothing left sounding, nothing sideways`);

      // 4. PIECES: a score file ----------------------------------------------
      await openFolder(page, 'Pieces');
      await page.locator('[data-score-input]').setInputFiles(FIXTURE);
      await page.locator('[data-panel="score-view"]').waitFor({ timeout: 8000 }).catch(() => {});
      const refused = await page.locator('[data-music-pieces] [role="alert"]').innerText().catch(() => '');
      ok(/Sing, my soul/.test(await say(page, '[data-score-title]')), `${size}: a MusicXML score opens with its own title${refused ? ` (it said: ${refused})` : ''}`);
      const parts = await page.locator('[data-panel="score-view"] li').count();
      ok(parts === 4, `${size}: every part is listed (${parts})`);
      ok(/96/.test(await say(page, '[data-score-tempo]')), `${size}: at the tempo the score asks for`);
      await page.getByRole('button', { name: '▶ Play' }).click();
      await page.waitForTimeout(700);
      ok(await page.locator('[data-playhead]').getAttribute('visibility') === 'visible', `${size}: it plays, and the playhead moves`);
      await page.locator('#score-mine').selectOption({ index: 1 });
      const mineId = await page.locator('#score-mine').inputValue();
      ok(await page.locator(`[data-line="${mineId}"].fill-teal-700`).count() === 1, `${size}: your part is drawn apart from the rest`);
      await page.getByRole('button', { name: '+ 5' }).click();
      await page.waitForTimeout(300);
      ok(/101/.test(await say(page, '[data-score-tempo]')) && await page.locator('[data-panel="score-view"]').getByRole('button', { name: '■ Stop' }).isVisible(),
         `${size}: the tempo changes while it keeps playing`);
      await page.locator('[data-panel="score-view"]').getByRole('button', { name: '■ Stop' }).click();
      await page.waitForTimeout(200);
      ok((await clocksOpen(page)) === 0, `${size}: Stop closes the score's audio`);
      // THE SCORE'S ADVANCED SETTINGS.
      await page.locator('#music-advanced-pieces').check();
      ok(await page.locator('[data-score-advanced]').isVisible(), `${size}: Advanced opens transpose, loop, sound and singing your part`);
      await page.getByRole('button', { name: 'Up a semitone' }).click();
      await page.getByRole('button', { name: 'Up a semitone' }).click();
      ok(/\+2 semitones/.test(await say(page, '[data-score-transpose]')), `${size}: the music moves up two semitones`);
      await page.locator('#score-loop').check();
      await page.locator('#score-loop-from').fill('1');
      await page.locator('#score-loop-to').fill('2');
      ok(/Looping beats 1 to 2, up 2 semitones/.test(await say(page, '[data-score-playing-as]')), `${size}: it says what it will play (${(await say(page, '[data-score-playing-as]')).trim()})`);
      await page.getByRole('button', { name: '▶ Play' }).click();
      await page.waitForTimeout(2600);
      const at = Number(await page.locator('[data-playhead]').getAttribute('x1'));
      ok(at >= 10 && at <= 10 + 2 * 28 + 3, `${size}: the loop keeps playing beats 1 and 2 (the playhead is at ${Math.round(at)})`);
      await page.locator('#score-sound').selectOption('organ');
      ok(await page.locator('[data-panel="score-view"]').getByRole('button', { name: '■ Stop' }).isVisible(), `${size}: a new sound carries on playing`);
      await page.locator('[data-panel="score-view"]').getByRole('button', { name: '■ Stop' }).click();
      await page.locator('#score-sing-mine').check();
      ok((await page.locator(`[data-line="${mineId}"]`).getAttribute('opacity')) === '0.25', `${size}: I sing my part silences it`);
      await page.locator('#score-sing-mine').uncheck();
      await page.locator('#music-advanced-pieces').uncheck();
      await page.locator('#music-advanced-pieces').check();
      ok(/As written/.test(await say(page, '[data-score-transpose]')) && !(await page.locator('#score-loop').isChecked()),
         `${size}: unticking Advanced plays the score as written again`);
      await page.locator('#music-advanced-pieces').uncheck();
      await page.waitForTimeout(200);
      ok((await clocksOpen(page)) === 0, `${size}: and nothing is left sounding`);
      await page.locator('#score-from').fill('3');
      ok(/beat 4/.test(await page.locator('[data-panel="score-view"]').getByRole('button', { name: /Play/ }).innerText()),
         `${size}: the start beat can be chosen without tapping the notes`);
      ok((await sideways(page)) <= 1, `${size}: the score fits; only its strip of notes scrolls`);
      await page.locator('[data-panel="score-view"]').getByRole('button', { name: 'Close' }).click();
      ok(/Sing, my soul/.test(await say(page, '[data-piece-list]')), `${size}: the score is kept in Pieces`);
      await page.reload({ waitUntil: 'networkidle' });
      await openFolder(page, 'Pieces');
      ok(/Sing, my soul/.test(await say(page, '[data-piece-list]')), `${size}: and is still there after a reload`);
      await page.locator('[data-piece-list] li').filter({ hasText: 'Sing, my soul' }).getByRole('button', { name: 'Open' }).click();
      await page.locator('[data-panel="score-view"]').waitFor({ timeout: 5000 }).catch(() => {});
      ok(await page.locator('[data-panel="score-view"]').isVisible(), `${size}: it opens again from the list`);
      await page.locator('[data-panel="score-view"]').getByRole('button', { name: 'Close' }).click();

      // A file built to attack an XML reader is refused in words.
      await page.locator('[data-score-input]').setInputFiles({
        name: 'trap.musicxml',
        mimeType: 'application/xml',
        buffer: Buffer.from('<?xml version="1.0"?><!DOCTYPE s [<!ENTITY a "aaaaaaaa"><!ENTITY b "&a;&a;&a;&a;">]><score-partwise><part-list/></score-partwise>'),
      });
      await page.waitForTimeout(600);
      ok(await page.locator('[data-music-pieces] [role="alert"]').isVisible(), `${size}: a booby-trapped score is refused, and says so`);
      ok((await page.locator('[data-piece-list] li').count()) === 1, `${size}: and nothing is kept from it`);

      // 5. PIECES: a photo of a page ----------------------------------------
      await page.getByRole('button', { name: /Scan a page/ }).click();
      await page.locator('[data-scan-input]').setInputFiles({ name: 'page.png', mimeType: 'image/png', buffer: await deskPhoto(page) });
      await page.locator('[data-corner="0"]').waitFor({ timeout: 8000 }).catch(() => {});
      ok((await page.locator('[data-corner]').count()) === 4, `${size}: the photo opens with four dots to put on the corners`);
      // A dot is a button and the arrows move it, for anybody not dragging.
      if (size === 'computer') {
        // Dragged onto the paper's corners, on the computer.
        const paper = [[260, 90], [930, 130], [960, 840], [220, 800]];
        for (let i = 0; i < 4; i += 1) {
          await page.locator(`[data-corner="${i}"]`).scrollIntoViewIfNeeded();
          const box = await page.locator('[data-panel="page-scanner"] svg').boundingBox();
          const dot = await page.locator(`[data-corner="${i}"]`).boundingBox();
          await page.mouse.move(dot.x + dot.width / 2, dot.y + dot.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + (paper[i][0] / 1200) * box.width, box.y + (paper[i][1] / 900) * box.height, { steps: 8 });
          await page.mouse.up();
        }
        const moved = await page.locator('[data-corner]').evaluateAll((els) => els.map((el) => [Number(el.getAttribute('cx')), Number(el.getAttribute('cy'))]));
        ok(moved.every(([x, y], i) => Math.abs(x - paper[i][0]) < 12 && Math.abs(y - paper[i][1]) < 12),
           `${size}: the dots can be dragged onto the corners (${moved.map((p) => p.map(Math.round).join(',')).join(' ')})`);
      }
      await page.locator('[data-corner="1"]').focus();
      const before = await page.locator('[data-corner="1"]').getAttribute('cx');
      await page.keyboard.press('ArrowLeft');
      ok(Number(await page.locator('[data-corner="1"]').getAttribute('cx')) < Number(before), `${size}: a dot moves with the arrow keys`);
      await page.getByRole('button', { name: /Make a clean page/ }).click();
      await page.locator('[data-clean-page]').waitFor({ timeout: 15000 }).catch(() => {});
      const made = await page.locator('[data-clean-page]').evaluate((img) => new Promise((done) => {
        const measure = () => {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth; c.height = img.naturalHeight;
          const g = c.getContext('2d');
          g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          let white = 0; let black = 0;
          for (let i = 0; i < d.length; i += 4) { if (d[i] > 240) white += 1; else if (d[i] < 60) black += 1; }
          const n = d.length / 4;
          done({ w: c.width, h: c.height, white: white / n, black: black / n });
        };
        if (img.complete && img.naturalWidth) measure(); else img.addEventListener('load', measure, { once: true });
      })).catch(() => null);
      ok(made && made.w === 1240 && made.h === 1753, `${size}: the clean page is a page's shape (${made ? `${made.w}×${made.h}` : 'none'})`);
      ok(made && made.white > 0.85 && made.black > 0.002, `${size}: white paper with black ink, the shadow gone (${made ? `${Math.round(made.white * 100)}% white, ${(made.black * 100).toFixed(1)}% ink` : ''})`);
      await page.locator('#scan-title').fill('Hymn 100, page 1');
      await page.getByRole('button', { name: 'Keep this page' }).click();
      await page.locator('[data-panel="piece-page"]').waitFor({ timeout: 8000 }).catch(() => {});
      ok(/Hymn 100, page 1/.test(await say(page, '[data-panel="piece-page"] h2')), `${size}: it is kept, and opens`);
      const kept = await page.evaluate(() => new Promise((done) => {
        const open = indexedDB.open('beacon-music');
        open.onsuccess = () => {
          const t = open.result.transaction('blobs', 'readonly').objectStore('blobs').getAll();
          t.onsuccess = () => { done(t.result.map((b) => (b instanceof Blob ? `blob:${b.type}` : b.mime))); open.result.close(); };
        };
      }));
      ok(kept.length === 2 && kept.includes('image/png') && kept.includes('text/xml'), `${size}: the phone holds the clean page and the score, and not the photo (${kept.join(', ')})`);
      await page.locator('[data-panel="piece-page"]').getByRole('button', { name: 'Close' }).click();
      const row = page.locator('[data-piece-list] li').filter({ hasText: 'Hymn 100' });
      await row.getByRole('button', { name: 'Delete' }).click();
      ok(await row.getByRole('button', { name: 'Tap again to delete' }).isVisible(), `${size}: deleting asks for a second tap`);
      await row.getByRole('button', { name: 'Tap again to delete' }).click();
      await page.waitForTimeout(300);
      ok((await page.locator('[data-piece-list] li').filter({ hasText: 'Hymn 100' }).count()) === 0, `${size}: and then it is gone`);
      ok((await sideways(page)) <= 1, `${size}: nothing scrolls sideways in Pieces`);

      // 5b. PLAY ----------------------------------------------------------------
      await openFolder(page, 'Play');
      ok(await page.locator('[data-play-keyboard]').isVisible() && !(await page.locator('[data-play-chords]').count()),
         `${size}: Play opens on a keyboard, and nothing more until Advanced`);
      const c4 = page.locator('[data-key="C4"]');
      await c4.dispatchEvent('pointerdown', { pointerId: 7, isPrimary: true, bubbles: true });
      await page.waitForTimeout(150);
      ok((await c4.getAttribute('aria-pressed')) === 'true' && (await say(page, '[data-play-last]')).trim() === 'C4' && (await clocksOpen(page)) === 1,
         `${size}: holding a key sounds it and lights it`);
      await c4.dispatchEvent('pointerup', { pointerId: 7, isPrimary: true, bubbles: true });
      await page.waitForTimeout(100);
      ok((await c4.getAttribute('aria-pressed')) === 'false', `${size}: letting go stops it`);
      await page.getByRole('button', { name: 'Higher' }).click();
      ok(/From C5/.test(await say(page, '[data-play-octave]')), `${size}: the keyboard moves up an octave`);
      await page.locator('#music-advanced-play').check();
      await page.locator('[data-chord="G"]').click();
      ok(/Playing G/.test(await say(page, '[data-play-chord-now]')), `${size}: a chord plays`);
      await page.locator('#play-key').selectOption('F');
      ok((await page.locator('[data-chord="B♭"]').count()) === 1, `${size}: and the chords follow the key (F has B♭)`);
      const firstKick = page.locator('[data-play-beats] [aria-label="Bass drum, step 2"]');
      const was = await firstKick.getAttribute('aria-pressed');
      await firstKick.click();
      ok((await firstKick.getAttribute('aria-pressed')) !== was, `${size}: a square of the beat turns on and off`);
      await page.getByRole('button', { name: '▶ Play the beat' }).click();
      await page.waitForTimeout(800);
      ok((await page.locator('[data-play-beats] button.outline').count()) >= 1, `${size}: the beat plays, lighting each step`);
      await page.locator('[data-play-beats]').getByRole('button', { name: '+ 5' }).click();
      ok((await say(page, '[data-play-tempo]')).trim() === '95', `${size}: its tempo changes while it plays`);
      await page.locator('#play-pattern-name').fill('Sunday groove');
      await page.getByRole('button', { name: 'Save this beat' }).click();
      await page.getByRole('button', { name: '■ Stop the beat' }).click();
      ok(await page.getByRole('button', { name: '▶ Play the beat' }).isVisible(), `${size}: and stops`);
      await openFolder(page, 'Listen');
      await page.waitForTimeout(300);
      ok((await clocksOpen(page)) === 0, `${size}: leaving Play closes its audio`);
      await page.reload({ waitUntil: 'networkidle' });
      await openFolder(page, 'Play');
      ok(await page.locator('#music-advanced-play').isChecked() && (await page.locator('#play-pattern option', { hasText: 'Sunday groove' }).count()) === 1,
         `${size}: Advanced and the saved beat are remembered on the phone`);
      ok((await sideways(page)) <= 1, `${size}: nothing scrolls sideways in Play`);
      await page.locator('#music-advanced-play').uncheck();
      ok(!(await page.locator('[data-play-chords]').count()), `${size}: unticked, Play is a keyboard again`);

      // 6. MY FILES -----------------------------------------------------------
      await page.goto(`${BASE}/library?room=mine`, { waitUntil: 'networkidle' });
      ok(!(await page.getByText('Beacon media player').count()), `${size}: My Files no longer carries the full player`);
      ok(await page.locator('[data-panel="music-moved"]').isVisible(), `${size}: it says where the player went`);
      await page.locator('[data-panel="music-moved"] a[href="/music"]').click();
      await page.waitForURL(/\/music/);
      ok(/\/music/.test(page.url()), `${size}: and one tap goes there`);

      const thrown = errors.list();
      ok(thrown.length === 0, `${size}: nothing threw${thrown.length ? `: ${thrown.join(' | ')}` : ''}`);
      await context.close();
    }
  } finally {
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
