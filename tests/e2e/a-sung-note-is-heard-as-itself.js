// Sing the note, sung to. The Tuner's practice (Advanced settings) in a real
// browser, with a made-up voice as the microphone.
//
// WHY THIS EXISTS. Asked for on 14 October 2026: choose a note, or five to
// ten, sing them, and be told whether each was hit, with "perfect pitch" for
// all of them; "MAKE SURE the tuner for voice is extremely accurate with 1 to
// 1 on voice to notes", and "Test, polish, and push". tests/the-music-room.mjs
// holds the ear and the judge to their numbers in Node; this proves the whole
// path a phone takes: the microphone, the audio clock, the tuner's frames, the
// judge, and what the screen says.
//
// The microphone is a WAV made by tests/e2e/_made-up-voice.js: a man's voice
// on "ah", with a scoop into each note, a vibrato, jitter, breath and a
// phone's thin low end. Chromium plays it as the microphone; WebKit cannot, so
// on Safari this checks the practice's setup and says it did not sing.
//
//   1. Five notes, C4 D4 E4 F4 G4, each sung in tune: 5 of 5, Perfect pitch.
//   2. C4 E4 G4 C5 G4, with E4 sung as F4 and C5 sung an octave low: 3 of 5,
//      each miss named for what it was, and no reward.
//   3. One note, under Reduce Motion: hit, and the reward standing still.
//   4. Every look (all nine): the setup, the verdict and Perfect pitch all
//      read at 4.5:1 or better, measured against what is painted behind them.
//      Asked for on 14 October 2026: "aesthetically pleasing to all themes".
//   And: a drone playing is stopped by Start, and the microphone the practice
//   opened is let go when it ends.
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

/**
 * A voice singing `notes` (MIDI), each held 2.2 s with a breath after. Long
 * enough for the judge (0.6 s held), its verdict on screen (0.9 s), and the
 * next note's judge to be waiting before the next note starts.
 */
function voiceFile(dir, name, notes) {
  const parts = [[0.4, null]];
  for (const n of notes) parts.push([2.2, n], [0.25, null]);
  const file = path.join(dir, `${name}.wav`);
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

/** Choose one note, or a run. */
async function mode(page, which) {
  await page.locator('[data-sing-mode]').getByRole('radio', { name: which === 'one' ? 'One note' : '5 to 10 notes' }).click();
}

/** Clear the notes and add these, by the note picker, as a person would. */
async function setNotes(page, names) {
  await mode(page, 'run');
  const clear = page.locator('[data-sing]').getByRole('button', { name: 'Clear' });
  if (await clear.count()) await clear.click();
  for (const n of names) {
    await page.locator('#sing-add').selectOption({ label: n });
    await page.locator('[data-sing]').getByRole('button', { name: '+ Add' }).click();
  }
}

const chips = (page) => page.locator('[data-sing-note-chip]').allInnerTexts().then((t) => t.map((s) => s.replace(/\s*×\s*$/, '').trim()));
const results = (page) => page.locator('[data-sing-result]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-sing-result'), e.innerText.replace(/^[✓✗–]\s*/, '').trim()]));

async function singIt(page, label) {
  await page.locator('[data-sing]').getByRole('button', { name: label }).click();
  await page.locator('[data-sing-results]').waitFor({ timeout: 40000 }).catch(() => {});
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
  console.log(`=== Sing the note, on ${engineName}${fake ? ', with a made-up voice as the microphone' : ' (no fake microphone: the setup only)'} ===`);

  // ---- 1. Five notes, all sung in tune ---------------------------------------
  {
    const { browser, page, errors } = await launch(voiceFile(tmp, 'in-tune', [60, 62, 64, 65, 67]));
    try {
      await openPractice(page);
      ok(/Sing the note/.test(await say(page, '[data-sing] h2')), 'Sing the note is in the Tuner\'s Advanced settings');
      await setNotes(page, ['C4', 'D4', 'E4', 'F4', 'G4']);
      ok((await chips(page)).join(' ') === 'C4 D4 E4 F4 G4', `five notes chosen with the note picker (${(await chips(page)).join(' ')})`);
      ok((await sideways(page)) <= 1, 'nothing scrolls sideways on a phone');

      if (fake) {
        // A drone left playing is stopped when the practice starts.
        await page.getByRole('button', { name: /Start the drone/ }).click();
        ok(await page.getByRole('button', { name: /Stop the drone/ }).isVisible(), 'the drone is playing');
        await singIt(page, 'Sing the 5 notes');
        ok(await page.getByRole('button', { name: /Start the drone/ }).isVisible(), 'and starting the practice stopped it, so the tuner hears the singer');
        const got = await results(page);
        ok(got.length === 5 && got.every(([r]) => r === 'hit'), `every note sung in tune is a hit (${got.map(([r, t]) => `${r}: ${t}`).join('; ')})`);
        ok(got.map(([, t]) => t.split(',')[0]).join(' ') === 'C4 D4 E4 F4 G4', 'and each is named as the note it was');
        ok(/5 of 5/.test(await say(page, '[data-sing-score]')), `the score says 5 of 5 (${await say(page, '[data-sing-score]')})`);
        ok(await page.locator('[data-perfect-pitch]').isVisible(), 'and Perfect pitch is shown');
        ok(/Perfect pitch!/.test(await say(page, '[data-perfect-pitch]')) && /From memory/.test(await say(page, '[data-perfect-pitch]')),
          'saying so, and that no note was played first');
        ok((await page.locator('.perfect-pitch-spark').count()) > 0, 'with notes bursting out of it');
        await page.screenshot({ path: path.join(tmp, 'perfect-pitch.png'), fullPage: false });
        ok((await micsLive(page)) === 0, 'the microphone the practice opened is let go when it ends');
      }
      ok(errors.list().length === 0, `no page errors${errors.list().length ? `: ${errors.list().join(' | ')}` : ''}`);
    } finally {
      await browser.close();
    }
  }

  // ---- 2. Two notes missed, one a semitone, one an octave --------------------
  if (fake) {
    const { browser, page, errors } = await launch(voiceFile(tmp, 'two-missed', [60, 65, 67, 60, 67]));
    try {
      await openPractice(page);
      await setNotes(page, ['C4', 'E4', 'G4', 'C5', 'G4']);
      await singIt(page, 'Sing the 5 notes');
      const got = await results(page);
      ok(got.map(([r]) => r).join(' ') === 'hit miss hit miss hit', `C4 E4 G4 C5 G4 sung as C4 F4 G4 C4 G4: hit, miss, hit, miss, hit (${got.map(([r, t]) => `${r}: ${t}`).join('; ')})`);
      ok(/^F4: a semitone above E4$/.test(got[1]?.[1] ?? ''), `the F4 is called a semitone above E4 (${got[1]?.[1]})`);
      ok(/^C4: an octave below C5$/.test(got[3]?.[1] ?? ''), `the low C is called an octave below C5, not C5 (${got[3]?.[1]})`);
      ok(/3 of 5/.test(await say(page, '[data-sing-score]')), `the score says 3 of 5 (${await say(page, '[data-sing-score]')})`);
      ok((await page.locator('[data-perfect-pitch]').count()) === 0, 'and there is no Perfect pitch');
      ok(errors.list().length === 0, `no page errors${errors.list().length ? `: ${errors.list().join(' | ')}` : ''}`);
    } finally {
      await browser.close();
    }
  }

  // ---- 3. One note, and Reduce Motion ----------------------------------------
  {
    const { browser, page, errors } = await launch(fake ? voiceFile(tmp, 'one', [57]) : null, { reducedMotion: 'reduce' });
    try {
      await openPractice(page);
      await mode(page, 'one');
      for (let i = 0; i < 6 && (await say(page, '[data-sing-single]')).trim() !== 'A3'; i++) {
        await page.getByRole('button', { name: 'A semitone lower' }).click();
      }
      ok((await say(page, '[data-sing-single]')).trim() === 'A3', 'one note is chosen with − and +, a semitone at a time');
      if (fake) {
        await singIt(page, 'Sing A3');
        const got = await results(page);
        ok(got.length === 1 && got[0][0] === 'hit', `the one note sung is a hit (${got.map(([r, t]) => `${r}: ${t}`).join('; ')})`);
        ok(/You hit the note/.test(await say(page, '[data-perfect-pitch]')), 'Perfect pitch, for one note');
        ok((await page.locator('.perfect-pitch-spark').count()) === 0, 'and under Reduce Motion nothing bursts: the reward stands still');
      } else {
        // No microphone to sing into: the setup, and an honest answer from Start.
        await setNotes(page, ['C4', 'D4']);
        ok(await page.locator('[data-sing]').getByRole('button', { name: /Sing the 2 notes/ }).isDisabled()
          && /add 3 more/.test(await say(page, '[data-sing-need]')), 'a run needs five notes, and says how many more');
        await page.locator('[data-sing]').getByRole('button', { name: /Pick for me/ }).click();
        ok((await chips(page)).length === 5, `Pick for me picks five notes (${(await chips(page)).join(' ')})`);
        await page.locator('#sing-count').selectOption('10');
        await page.locator('[data-sing]').getByRole('button', { name: /Pick for me/ }).click();
        ok((await chips(page)).length === 10, 'or ten');
        ok(await page.locator('[data-sing]').getByRole('button', { name: '+ Add' }).isDisabled(), 'and no more than ten');
        await page.locator('[data-sing-choice="tolerance:exact"]').click();
        ok((await page.locator('[data-sing-choice="tolerance:exact"]').getAttribute('aria-pressed')) === 'true', 'Exact can be chosen');
        await page.locator('[data-sing]').getByRole('button', { name: /Sing the 10 notes/ }).click();
        await page.waitForTimeout(1500);
        const listening = await page.locator('[data-sing-now]').isVisible();
        const said = /microphone/i.test(await say(page, '[data-sing]'));
        ok(listening || said, `Start either listens or says why it cannot (${engineName} has no fake microphone)`);
      }
      ok(errors.list().length === 0, `no page errors${errors.list().length ? `: ${errors.list().join(' | ')}` : ''}`);
    } finally {
      await browser.close();
    }
  }

  // ---- 4. Every look ------------------------------------------------------
  {
    // A C4 held, with a breath every three seconds: whenever the microphone
    // opens, a one-note practice of C4 is sung.
    const parts = [[0.3, null]];
    for (let i = 0; i < 15; i++) parts.push([3, 60], [0.3, null]);
    const held = path.join(tmp, 'held.wav');
    fs.writeFileSync(held, wav(sing(parts, { vowel: 'ah', sex: 'm', seed: 11 }), 48000));
    const { browser, page, errors } = await launch(fake ? held : null);
    try {
      for (const look of LOOKS) {
        if (look !== 'classic') await choose(page, BASE, look);
        await openPractice(page);
        await setNotes(page, ['C4', 'D4', 'E4', 'F4', 'G4']);
        const setup = {
          title: await contrast(page.locator('[data-sing] h2')),
          note: await contrast(page.locator('[data-sing-note-chip]')),
          chosen: await contrast(page.locator('[data-sing-mode] [aria-checked="true"]')),
          other: await contrast(page.locator('[data-sing-mode] [aria-checked="false"]')),
          pill: await contrast(page.locator('[data-sing-choice="part:any"] span').first()),
          hint: await contrast(page.locator('[data-sing-choice="part:bass"] span').nth(1)),
        };
        const worst = Object.entries(setup).sort((a, b) => a[1] - b[1])[0];
        ok(worst[1] >= 4.5, `${look}: the setup reads (worst ${worst[0]}, ${worst[1].toFixed(1)}:1)`);
        if (fake) {
          await mode(page, 'one');
          for (let i = 0; i < 24 && (await say(page, '[data-sing-single]')).trim() !== 'C4'; i++) {
            const now = (await say(page, '[data-sing-single]')).trim();
            await page.getByRole('button', { name: /^[A-G]♯?[2-3]$/.test(now) ? 'A semitone higher' : 'A semitone lower' }).click();
          }
          await page.locator('[data-sing]').getByRole('button', { name: 'Sing C4' }).click();
          await page.locator('[data-sing-verdict]').waitFor({ timeout: 8000 }).catch(() => {});
          const verdict = await contrast(page.locator('[data-sing-verdict]'));
          await page.locator('[data-perfect-pitch]').waitFor({ timeout: 8000 }).catch(() => {});
          const reward = await contrast(page.locator('[data-perfect-pitch] p').nth(1));
          const line = await contrast(page.locator('[data-perfect-pitch] p').nth(2));
          const result = await contrast(page.locator('[data-sing-result] span').nth(1));
          ok(verdict >= 4.5 && reward >= 4.5 && line >= 4.5 && result >= 4.5,
            `${look}: the verdict, Perfect pitch and the results read (${[verdict, reward, line, result].map((r) => r.toFixed(1)).join(', ')}:1)`);
          await page.screenshot({ path: path.join(tmp, `look-${look}.png`) });
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
