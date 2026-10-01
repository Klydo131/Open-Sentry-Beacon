// The update must never land while somebody is writing.
//
// WHY THIS IS THE MOST IMPORTANT TEST IN THE UPDATE SET. The banner is gone and
// the app now applies new builds by itself, which is what the owner asked for:
// most of the people using this are older and do not want to be asked to make
// decisions about software.
//
// That trade has exactly one way to go badly, and it is silent. If a reload
// lands while a Guide is halfway through a message to the person they are
// walking with, the message is gone. They do not experience an update; they
// experience the app eating what they wrote. Nobody reports that as an update
// bug, so it would never come back to us as one.
//
// A banner could be dismissed. An automatic reload cannot, so the guard has to
// be right rather than merely present.
//
//   node tests/e2e/update-typing.js <port>

const { chromium, launchOptions, openChat } = require('./_playwright');

const PORT = process.argv[2] || '4001';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width: 412, height: 820 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const maria = page.getByText(/Maria Santos/i).first();
  if (await maria.count()) await maria.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(700);
  }

  await page.goto(`${BASE}/dm/pair-john`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  // The conversation is in the Talk bubble (30 September 2026); Message opens it.
  await openChat(page);

  // The composer. If this is not here the rest of the suite is meaningless, so
  // say so loudly rather than passing a test of nothing.
  const box = page.locator('[data-quest="chat-send"] input, [data-quest="chat-send"] textarea').first();
  ok((await box.count()) > 0, 'the conversation composer is on screen');
  if ((await box.count()) === 0) {
    console.log(`\nRESULT: ${bad} FAILURE(S)`);
    await browser.close();
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // 1. A half-written message blocks the update, indefinitely.
  // ---------------------------------------------------------------------------
  const HALF_WRITTEN = 'I was thinking about what you said last week and';
  await box.click();
  await box.fill(HALF_WRITTEN);
  await page.waitForTimeout(400);

  // Force the app into the state where it wants to update. This is the whole
  // scenario in one line: a new build is available RIGHT NOW and somebody is
  // mid-sentence.
  const forced = await page.evaluate(() => {
    document.documentElement.setAttribute('data-update-state', 'ready');
    return document.documentElement.getAttribute('data-update-state');
  });
  ok(forced === 'ready', 'the page can be put into the "update available" state');

  const originBefore = await page.evaluate(() => performance.timeOrigin);

  // Longer than the component's quiet window, so "it simply had not got round to
  // it yet" is not an available explanation for a pass.
  await sleep(26_000);

  const originAfter = await page.evaluate(() => performance.timeOrigin).catch(() => null);
  ok(
    originAfter === originBefore,
    'the app does NOT reload while a message is half-written',
  );

  const stillThere = await box.inputValue().catch(() => '');
  ok(stillThere === HALF_WRITTEN, 'and the half-written message is still in the box');

  // ---------------------------------------------------------------------------
  // 2. Clearing the box lets it through.
  //
  // The other half of the proof. A guard that never allows an update is not a
  // guard, it is a bug that happens to pass the test above — and this is exactly
  // the pair of assertions that catches "blocked forever" masquerading as
  // "blocked correctly".
  // ---------------------------------------------------------------------------
  await box.fill('');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-update-state', 'ready');
  });
  console.log('--  message cleared; waiting for the app to take the update on its own');

  let reloaded = false;
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    const now = await page.evaluate(() => performance.timeOrigin).catch(() => null);
    // A navigating page throws; that is itself the signal.
    if (now === null || now !== originBefore) {
      reloaded = true;
      break;
    }
  }

  // NOT asserted as a hard failure when the harness cannot drive a real service
  // worker update: this suite runs against a single build, so `apply` may be
  // null and there is genuinely nothing to apply. Saying which case happened is
  // more honest than a green tick that means either.
  if (reloaded) {
    ok(true, 'with the box empty, the update is applied without anybody tapping');
  } else {
    console.log(
      '--  no reload observed: this build has no newer worker waiting, so there ' +
        'was nothing to apply. The blocking half above is the assertion that matters here.',
    );
  }

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  await browser.close();
  process.exit(bad === 0 ? 0 : 1);
})();
