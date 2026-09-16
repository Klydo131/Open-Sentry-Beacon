// The study room opens, and somebody can write in it.
//
// ---------------------------------------------------------------------------
// WHY THIS WALK EXISTS AND THE OTHER CHECKS DO NOT COVER IT. The static checks
// assert the editor is imported lazily, gated behind a button, and that the
// build is configured to read BlockSuite at all. Every one of those can be true
// while the room opens to a blank box, because the editor is assembled at
// runtime from about a hundred custom elements and the failure mode is silence:
// no error, no text, nothing.
//
// It failed that way three times while being built -- once on a decorator, once
// on the `accessor` keyword, once on vanilla-extract -- and each time the page
// simply rendered nothing. So the only honest test is to open it and type.
//
// IT RUNS AGAINST THE TUTORIAL, which is what makes it possible at all: the
// demo needs no session, so a browser can reach the room without credentials
// this suite has no business holding. The tutorial and the live room share the
// same editor and differ only in where pages are kept, so what this proves
// about one holds for the other up to the document source.
//
//   node tests/e2e/the-study-room-opens.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-e2e-'));

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  // A phone, because that is what an Explorer has, and because the editor's
  // own layout is the part most likely to be wrong at 412 wide.
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-study-room`, {
    ...launchOptions, viewport: { width: 412, height: 915 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByText(/John Reyes/).first().click();
  await page.waitForTimeout(1700);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) { await consent.first().click().catch(() => {}); await page.waitForTimeout(600); }

  await page.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const study = page.getByRole('tab', { name: /Study/i })
    .or(page.getByRole('button', { name: /Study/i })).first();
  if (await study.count()) { await study.click(); await page.waitForTimeout(900); }

  // 1. THE ROOM IS THERE, AND CLOSED.
  const openButton = page.getByRole('button', { name: /Open my study room/i }).first();
  ok(await openButton.count() > 0, 'the Study tab offers a study room');

  const beforeText = await page.locator('body').innerText();
  ok(!/affine-paragraph/i.test(await page.content()),
     'and the editor is not on the page until it is asked for');
  ok(/nothing you type here is saved/i.test(beforeText),
     'the walkthrough says plainly that nothing is kept');

  // 2. IT OPENS.
  await openButton.click();
  // The chunk is several megabytes; on a cold build this is not instant, and a
  // short timeout here would produce a flaky suite rather than a true answer.
  await page.waitForSelector('affine-paragraph', { timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(1200);

  const host = await page.locator('editor-host').count();
  ok(host > 0, 'the editor mounts');
  ok(await page.locator('affine-paragraph').count() > 0,
     'and there is somewhere to type');

  // 3. SOMEBODY CAN WRITE IN IT, which is the whole point and the thing every
  //    silent failure got wrong.
  await page.locator('affine-paragraph').first().click();
  await page.waitForTimeout(400);
  await page.keyboard.type('Jesus wept.');
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.keyboard.type('John 11:35');
  await page.waitForTimeout(900);

  const written = (await page.locator('editor-host').innerText()).replace(/​/g, '');
  ok(/Jesus wept\./.test(written), 'what was typed is on the page');
  ok(/John 11:35/.test(written), 'and Enter started a second block rather than swallowing it');

  // 4. NOTHING BROKE QUIETLY.
  ok(errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ') || 'none'})`);

  // 5. AND IT STILL FITS THE PHONE.
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  ok(sideways <= 0, `the page does not scroll sideways at 412px (overflow ${sideways}px)`);

  await page.screenshot({ path: `${OUT}/study-room.png` });
  await ctx.close();

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
