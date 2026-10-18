// Beacon's own sound, in the real app under its real CSP.
//
// WHY THIS EXISTS. Asked for on 18 October 2026: "make sure the notification
// sound is unique and has a distinct sound." tests/beacon-has-its-own-sound.mjs
// runs the sound, the tags and the service worker's push handler in Node; this
// proves the path a phone takes:
//
//   1. Phone, pad and computer: Settings, General has the sound's switch, on by
//      default; Hear it plays Beacon's three notes (D6, A6, F♯6); switched off
//      it stays off after a reload; nothing sideways.
//   2. Chromium only, because it needs the browser's own DevTools to deliver a
//      push: a push to the real service worker while Beacon is on the screen
//      plays Beacon's sound and is shown silently, with a tag of its own; with
//      the switch off the next one keeps the device's sound; and the two are
//      two notifications, not one replacing the other in silence.
//
// What no browser here can show: a real phone's speaker, the iPhone silent
// switch, or what Android does with the media volume.
//
//   node tests/e2e/beacon-has-its-own-sound.js <port>
const { browser: engine, engineName, launchOptions, pageErrors } = require('./_playwright');
const { signIn } = require('./_looks');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

/** Every oscillator the page starts, by frequency. */
function record() {
  window.__oscs = [];
  const start = OscillatorNode.prototype.start;
  OscillatorNode.prototype.start = function (...args) {
    window.__oscs.push(this.frequency.value);
    return start.apply(this, args);
  };
}

/** Beacon's notes (lib/alert-sound.ts, BEACON_NOTES). */
const NOTES = [1174.66, 1760, 1479.98];
const theSound = (freqs) => NOTES.every((hz) => freqs.some((f) => Math.abs(f - hz) < 1));
const oscs = (page) => page.evaluate(() => window.__oscs.slice());

const SIZES = [
  { name: 'phone', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'pad', viewport: { width: 820, height: 1180 }, touch: true },
  { name: 'computer', viewport: { width: 1300, height: 800 }, touch: false },
];

(async () => {
  const browser = await engine.launch(launchOptions);

  // ---- 1. The setting, on every size ----
  for (const size of SIZES) {
    const context = await browser.newContext({
      viewport: size.viewport,
      hasTouch: size.touch,
      isMobile: size.touch && engineName === 'chromium',
    });
    await context.addInitScript(record);
    const page = await context.newPage();
    const caught = pageErrors(page);
    await signIn(page, BASE, 'Maria Santos');
    await page.goto(`${BASE}/settings?room=general`, { waitUntil: 'networkidle' });

    const toggle = page.getByRole('switch', { name: /own sound/i });
    await toggle.scrollIntoViewIfNeeded().catch(() => {});
    ok(await toggle.isVisible(), `${size.name}: Settings, General has the sound's switch`);
    ok((await toggle.getAttribute('aria-checked')) === 'true', `${size.name}: it is on by default`);
    // The phone's 56px tap floor turned the first version into a tall blob.
    const box = await toggle.boundingBox();
    ok(box && box.height <= 32 && box.width >= box.height * 1.6,
      `${size.name}: the switch looks like a switch (${box && `${Math.round(box.width)}x${Math.round(box.height)}`})`);

    await page.getByRole('button', { name: /Hear it/ }).click();
    await page.waitForTimeout(500);
    const heard = await oscs(page);
    ok(theSound(heard), `${size.name}: Hear it plays D6, A6 and F♯6 (${[...new Set(heard.map(Math.round))].join(', ')} Hz)`);

    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    ok(sideways <= 1, `${size.name}: nothing runs off the side (${sideways}px)`);

    await toggle.click();
    ok((await toggle.getAttribute('aria-checked')) === 'false', `${size.name}: the switch turns it off`);
    await page.reload({ waitUntil: 'networkidle' });
    const again = page.getByRole('switch', { name: /own sound/i });
    ok((await again.getAttribute('aria-checked')) === 'false', `${size.name}: and off is remembered after a reload`);
    await again.click();

    ok(caught.list().length === 0, `${size.name}: no page errors${caught.list().length ? `: ${caught.list()[0]}` : ''}`);
    await context.close();
  }

  // ---- 2. A push, delivered to the real service worker ----
  if (engineName !== 'chromium') {
    console.log(`OK  (push not delivered on ${engineName}: it needs Chromium's DevTools)`);
  } else {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.grantPermissions(['notifications'], { origin: BASE });
    await context.addInitScript(record);
    const page = await context.newPage();
    await signIn(page, BASE, 'Maria Santos');
    await page.goto(`${BASE}/settings?room=general`, { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    // The first tap of the visit, which is what lets a page make a sound.
    await page.getByRole('heading', { name: /Notifications/ }).first().click();

    const cdp = await context.newCDPSession(page);
    const registrations = [];
    cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => registrations.push(...e.registrations));
    await cdp.send('ServiceWorker.enable');
    for (let i = 0; i < 50 && !registrations.some((r) => r.scopeURL === `${BASE}/` && !r.isDeleted); i++) {
      await page.waitForTimeout(100);
    }
    const reg = registrations.find((r) => r.scopeURL === `${BASE}/` && !r.isDeleted);
    ok(Boolean(reg), 'the app\'s service worker is registered');

    const deliver = (payload) => cdp.send('ServiceWorker.deliverPushMessage', {
      origin: BASE, registrationId: reg.registrationId, data: JSON.stringify(payload),
    });
    const showing = () => page.evaluate(async () =>
      (await (await navigator.serviceWorker.ready).getNotifications())
        .map((n) => ({ title: n.title, tag: n.tag, silent: n.silent })));

    if (reg) {
      const before = (await oscs(page)).length;
      await deliver({ title: 'Somebody is praying for you', body: 'A sample prayer.', url: '/ds#prayer' });
      await page.waitForTimeout(1500);
      const first = (await showing()).find((n) => n.title === 'Somebody is praying for you');
      ok(Boolean(first), 'a push becomes a notification');
      ok(first && /^beacon:[0-9a-z]+$/.test(first.tag), `with a tag of its own (${first && first.tag})`);
      ok(first && first.silent === true, 'with Beacon on the screen it is shown silently');
      ok(theSound((await oscs(page)).slice(before)), 'because Beacon\'s own sound played for it');

      await page.evaluate(() => localStorage.setItem('hb-sound', 'off'));
      await page.waitForTimeout(1600); // past one burst
      const mid = (await oscs(page)).length;
      await deliver({ title: 'A new appointment', body: 'Sunday, in the sample church.', url: '/ds' });
      await page.waitForTimeout(1500);
      const list = await showing();
      const second = list.find((n) => n.title === 'A new appointment');
      ok(second && second.silent !== true, 'with the switch off, the next one keeps the device\'s own sound');
      ok((await oscs(page)).length === mid, 'and Beacon makes no sound of its own');
      ok(list.some((n) => n.title === 'Somebody is praying for you') && second,
        'two different things are two notifications: the second did not replace the first');
    }
    await context.close();
  }

  await browser.close();
  console.log(bad ? `RESULT: ${bad} BAD` : 'RESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
