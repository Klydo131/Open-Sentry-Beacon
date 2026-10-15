// Sing the note, sung to. The Tuner's practice (Advanced settings) in a real
// browser, with a made-up voice as the microphone.
//
// WHY THIS EXISTS. Asked for on 14 October 2026: choose a note, sing it, and
// be told whether it was hit, with "perfect pitch" as the reward; "MAKE SURE
// the tuner for voice is extremely accurate with 1 to 1 on voice to notes".
// Made simple on 15 October 2026: "just tap or click a note and I will just
// sing ... and it will detect if I hit a perfect note or close enough, that's
// all." tests/the-tuner-hears-the-note-sung.mjs holds the ear and the grades
// to their numbers in Node; this proves the whole path a phone takes: a key
// tapped, the microphone, the audio clock, the tuner's frames, the judge, and
// what the screen says.
//
// The microphone is a WAV made by tests/e2e/_made-up-voice.js: a man's voice
// on "ah" holding C4, with a breath every three seconds, a scoop into each
// note, a vibrato, jitter, breath and a phone's thin low end. Chromium plays
// it as the microphone; WebKit cannot, so on Safari this checks the keyboard
// and says it did not sing.
//
//   1. C4 tapped and sung: Perfect, with the burst of notes; sung again after
//      a breath, graded again with no second tap; D4 tapped: Try again, "You
//      sang C4" and go up; B3: go down. A drone playing is stopped by the tap.
//   2. Close enough: at a concert pitch of A = 445 the same C4 is 20 cents
//      flat of the app's C4, and is Close, "A little flat".
//   3. Under Reduce Motion: Perfect, standing still.
//   4. Every look (all nine): the keyboard, the chosen key, the grade and its
//      words all read at 4.5:1 or better, measured against what is painted
//      behind them. Asked for on 14 October 2026: "aesthetically pleasing to
//      all themes".
//   And: the microphone a tap opened is let go by Stop.
//
//   node tests/e2e/a-sung-note-is-heard-as-itself.js <port>
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { browser: engine, engineName, launchOptions, openRoom, pageErrors } = require('./_playwright');
const { signIn, choose } = require('./_looks');
const { sing, wav } = require('./_made-up-voice');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };
const say = (page, sel) => page.locator(sel).first().innerText().catch(() => '');
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

/** Every look a person can choose (lib/ui-themes.ts). */
const LOOKS = ['classic', 'beacon', 'study', 'focus', 'aero-eco', 'aero-dark', 'aero-technozen', 'aero-dorfic', 'aero-colors'];

/**
 * How well text shows: its colour against what is painted behind it, every
 * translucent layer composited (the Aero looks' glass included), faded by
 * every opacity it sits under. The same arithmetic as _looks.js's readable(),
 * returning the ratio so a look that fails is named with its number.
 */
const contrast = (locator) => locator.first().evaluate((el) => {
  const rgba = (v) => {
    const n = v.match(/[\d.]+/g)?.map(Number) ?? [];
    const k = /^color\(srgb\b/.test(v) ? 255 : 1;
    return [(n[0] ?? 0) * k, (n[1] ?? 0) * k, (n[2] ?? 0) * k, n[3] ?? 1];
  };
  const layers = [];
  for (let at = el; at; at = at.parentElement) layers.unshift(rgba(getComputedStyle(at).backgroundColor));
  let bg = [255, 255, 255];
  for (const c of layers) bg = bg.map((v, i) => c[i] * c[3] + v * (1 - c[3]));
  const c = rgba(getComputedStyle(el).color);
  let opacity = c[3];
  for (let at = el; at; at = at.parentElement) opacity *= Number(getComputedStyle(at).opacity);
  const fg = bg.map((v, i) => c[i] * opacity + v * (1 - opacity));
  const lum = (x) => x.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}).catch(() => 0);

// Count the microphones the page opens, to see each one let go.
const WATCH = () => {
  window.__mics = [];
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const ask = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => { const s = await ask(c); window.__mics.push(s); return s; };
  }
  try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864000000)); } catch { /* not a page of the app */ }
};
const micsLive = (page) => page.evaluate(() => window.__mics.flatMap((s) => s.getTracks()).filter((t) => t.readyState !== 'ended').length);

/** A C4 held for three seconds, with a breath after, over and over. */
function heldC4(dir) {
  const parts = [[0.3, null]];
  for (let i = 0; i < 20; i++) parts.push([3, 60], [0.3, null]);
  const file = path.join(dir, 'held-c4.wav');
  fs.writeFileSync(file, wav(sing(parts, { vowel: 'ah', sex: 'm', seed: 11 }), 48000));
  return file;
}

async function openPractice(page) {
  await page.goto(`${BASE}/music`, { waitUntil: 'networkidle' });
  await openRoom(page, 'Tuner');
  await page.locator('[data-music-tuner]').first().waitFor({ timeout: 15000 });
  const tick = page.locator('#music-advanced-tuner');
  if (!(await tick.isChecked())) await tick.check();
  await page.locator('[data-sing]').first().waitFor({ timeout: 5000 });
}

const key = (page, name) => page.locator('[data-sing-keys]').getByRole('button', { name, exact: true });
const grade = (page) => page.locator('[data-sing-verdict]').getAttribute('data-sing-verdict').catch(() => null);
const live = async (page) => (await say(page, '[data-sing-live]')).replace(/\s+/g, ' ').trim();

/** Tap a key and wait for its grade. */
async function tapAndSing(page, name) {
  await key(page, name).click();
  await page.locator('[data-sing-verdict="perfect"],[data-sing-verdict="close"],[data-sing-verdict="off"]').first().waitFor({ timeout: 12000 }).catch(() => {});
  return grade(page);
}

async function octaveTo(page, n) {
  for (let i = 0; i < 6; i++) {
    const now = Number((await say(page, '[data-sing-octave]')).match(/\d/)?.[0]);
    if (now === n) return;
    await page.getByRole('button', { name: now > n ? 'Lower octave' : 'Higher octave' }).click();
  }
}

async function launch(file, contextOptions = {}) {
  const fake = engineName === 'chromium';
  const browser = await engine.launch({
    ...launchOptions,
    args: fake && file
      ? ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${file}`, '--autoplay-policy=no-user-gesture-required']
      : [],
  });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, ...contextOptions });
  if (fake) await context.grantPermissions(['microphone'], { origin: BASE });
  await context.addInitScript(WATCH);
  const page = await context.newPage();
  const errors = pageErrors(page);
  await signIn(page, BASE, 'John Reyes');
  return { browser, page, errors };
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-sing-'));
  const fake = engineName === 'chromium';
  const voice = heldC4(tmp);
  console.log(`=== Sing the note, on ${engineName}${fake ? ', with a made-up voice as the microphone' : ' (no fake microphone: the keyboard only)'} ===`);

  // ---- 1. Tap a note and sing it ---------------------------------------------
  {
    const { browser, page, errors } = await launch(voice);
    try {
      await openPractice(page);
      ok(/Sing the note/.test(await say(page, '[data-sing] h2')), 'Sing the note is in the Tuner\'s Advanced settings');
      ok((await page.locator('[data-sing-keys] button').count()) === 12 && /Tap a note/.test(await live(page)),
        'it is a keyboard of twelve keys, and asks for a tap');
      ok((await sideways(page)) <= 1, 'nothing scrolls sideways on a phone');

      if (fake) {
        // A drone left playing is stopped when a key is tapped.
        await page.locator('[data-tuner-more]').click();
        await page.getByRole('button', { name: /Start the drone/ }).click();
        ok(await page.getByRole('button', { name: /Stop the drone/ }).isVisible(), 'the drone is playing');
        const first = await tapAndSing(page, 'C4');
        ok(await page.getByRole('button', { name: /Start the drone/ }).isVisible(), 'and tapping a key stopped it, so the tuner hears the singer');
        ok(first === 'perfect' && /Perfect/.test(await live(page)) && /Right on the note/.test(await live(page)),
          `C4 tapped, C4 sung: ${await live(page)}`);
        ok((await page.locator('[data-perfect-pitch]').count()) > 0 && (await page.locator('.perfect-pitch-spark').count()) > 0,
          'and the reward bursts out of the ring');
        await page.screenshot({ path: path.join(tmp, 'perfect.png') });
        // Sung again after a breath: graded again, with no second tap.
        const seen = [];
        for (let i = 0; i < 90; i++) { seen.push(await grade(page)); await page.waitForTimeout(100); }
        // Counted from the second look on: the first Perfect is still on screen when the watching starts.
        const again = seen.filter((g, i) => i > 0 && g === 'perfect' && seen[i - 1] !== 'perfect').length;
        ok(again >= 1 && seen.includes('listening'), `sung again after a breath, it is graded again (${again} more Perfect in 9 s)`);
        // A note the voice is not singing.
        const d4 = await tapAndSing(page, 'D4');
        ok(d4 === 'off' && /Try again/.test(await live(page)) && /You sang C4 ↑/.test(await live(page)),
          `D4 tapped, C4 sung: ${await live(page)}`);
        await octaveTo(page, 3);
        const b3 = await tapAndSing(page, 'B3');
        ok(b3 === 'off' && /You sang C4 ↓/.test(await live(page)), `B3 tapped, C4 sung: ${await live(page)}`);
        await page.locator('[data-sing]').getByRole('button', { name: 'Stop', exact: true }).click();
        await page.waitForTimeout(300);
        ok((await micsLive(page)) === 0 && /Tap a note/.test(await live(page)), 'Stop lets the microphone go, and the card rests');
      } else {
        await key(page, 'C4').click();
        await page.waitForTimeout(1500);
        const listening = await page.locator('[data-sing-verdict="listening"]').count();
        const said = /microphone/i.test(await say(page, '[data-sing]'));
        ok(listening > 0 || said, `a tap either listens or says why it cannot (${engineName} has no fake microphone)`);
      }
      ok(errors.list().length === 0, `no page errors${errors.list().length ? `: ${errors.list().join(' | ')}` : ''}`);
    } finally {
      await browser.close();
    }
  }

  // ---- 2. Close enough ----------------------------------------------------
  if (fake) {
    const { browser, page, errors } = await launch(voice);
    try {
      await openPractice(page);
      await page.locator('[data-pitch-toggle]').click();
      for (let i = 0; i < 5; i++) await page.getByRole('button', { name: '1 Hz higher' }).click();
      ok(/A = 445 Hz/.test(await say(page, '[data-tuner-a4]')), 'concert pitch set to A = 445');
      await page.waitForTimeout(1200);
      const g = await tapAndSing(page, 'C4');
      ok(g === 'close' && /Close/.test(await live(page)) && /A little flat ↑/.test(await live(page)),
        `C4 sung 20 cents under the app's C4 is close enough: ${await live(page)}`);
      ok((await page.locator('[data-perfect-pitch]').count()) === 0, 'and Close is no Perfect pitch');
      await page.locator('[data-sing]').getByRole('button', { name: 'Stop', exact: true }).click();
      ok(errors.list().length === 0, `no page errors${errors.list().length ? `: ${errors.list().join(' | ')}` : ''}`);
    } finally {
      await browser.close();
    }
  }

  // ---- 3. Reduce Motion ----------------------------------------------------
  if (fake) {
    const { browser, page, errors } = await launch(voice, { reducedMotion: 'reduce' });
    try {
      await openPractice(page);
      const g = await tapAndSing(page, 'C4');
      ok(g === 'perfect' && (await page.locator('[data-perfect-pitch]').count()) > 0, 'under Reduce Motion, Perfect is still rewarded');
      ok((await page.locator('.perfect-pitch-spark').count()) === 0, 'and nothing bursts: the reward stands still');
      await page.locator('[data-sing]').getByRole('button', { name: 'Stop', exact: true }).click();
      ok(errors.list().length === 0, `no page errors${errors.list().length ? `: ${errors.list().join(' | ')}` : ''}`);
    } finally {
      await browser.close();
    }
  }

  // ---- 4. Every look --------------------------------------------------------
  {
    const { browser, page, errors } = await launch(fake ? voice : null);
    try {
      for (const look of LOOKS) {
        if (look !== 'classic') await choose(page, BASE, look);
        await openPractice(page);
        const setup = {
          title: await contrast(page.locator('[data-sing] h2')),
          octave: await contrast(page.locator('[data-sing-octave] span')),
          key: await contrast(key(page, 'D4')),
          ask: await contrast(page.locator('[data-sing-verdict]')),
        };
        let worst = Object.entries(setup).sort((a, b) => a[1] - b[1])[0];
        ok(worst[1] >= 4.5, `${look}: the keyboard and its words read (worst ${worst[0]}, ${worst[1].toFixed(1)}:1)`);
        if (fake) {
          const g = await tapAndSing(page, 'C4');
          const after = {
            chosen: await contrast(key(page, 'C4')),
            grade: await contrast(page.locator('[data-sing-verdict]')),
            words: await contrast(page.locator('[data-sing-hint]')),
          };
          worst = Object.entries(after).sort((a, b) => a[1] - b[1])[0];
          ok(g === 'perfect' && worst[1] >= 4.5, `${look}: Perfect, the chosen key and the words read (worst ${worst[0]}, ${worst[1].toFixed(1)}:1)`);
          await page.screenshot({ path: path.join(tmp, `look-${look}.png`) });
          await page.locator('[data-sing]').getByRole('button', { name: 'Stop', exact: true }).click();
        }
      }
      ok(errors.list().length === 0, `no page errors in any look${errors.list().length ? `: ${errors.list().join(' | ')}` : ''}`);
    } finally {
      await browser.close();
    }
  }

  console.log(`(pictures in ${tmp})`);
  console.log(bad ? `\nRESULT: ${bad} BAD` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
