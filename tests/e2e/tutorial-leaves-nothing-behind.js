// A first-time visitor's demo is not replaced by the tutorial's leftovers.
//
// THE BUG, found in CI on WebKit and NOT a WebKit bug. Starting the tutorial
// parks the person's demo data and finishing puts it back. Both halves were
// written as "if there is something", and a first-time visitor has nothing:
// there is no `beacon-demo-v1` until something writes one. So the snapshot was
// skipped because there was nothing to snapshot, the restore was skipped for
// the same reason, and the tutorial's own database was left sitting there as
// the person's demo, with whatever they changed during the walk still in it.
// Their first look at the demo was the leftovers of a tutorial they had just
// finished, and nothing told them that is what they were looking at.
//
// WHY THIS EXISTS ALONGSIDE tutorial-space.js. That suite explores the demo
// first and then runs the tutorial, so it only meets this path when the setup
// happens to leave storage empty -- which is what WebKit did, by accident, and
// Chromium did not. A bug that needs an accident to appear is a bug that comes
// back. This one starts from empty ON PURPOSE, so the condition is the test
// rather than a coincidence, and it fails in any engine.
//
//   npm run build && node scripts/run-next.mjs start -p 4402
//   node tests/e2e/tutorial-leaves-nothing-behind.js 4402

const { chromium, launchOptions, openRoom } = require('./_playwright');
const BASE = `http://localhost:${process.argv[2] || '4402'}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const readDemo = (page) => page.evaluate(() => ({
  raw: localStorage.getItem('beacon-demo-v1'),
  snapshot: localStorage.getItem('beacon-demo-pretutorial'),
  stages: (() => {
    try {
      const d = JSON.parse(localStorage.getItem('beacon-demo-v1') || '{}');
      return (d.pairings || []).map((x) => `${x.id}:${x.journey_stage}`).sort().join(', ');
    } catch { return 'UNREADABLE'; }
  })(),
}));

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 412, height: 790 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();

  // ---- A visitor who has never saved anything -----------------------------
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    // Everything the demo owns, so this is a genuine first visit rather than a
    // half-cleared one.
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('beacon-')) localStorage.removeItem(k);
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const before = await readDemo(page);
  ok(before.raw === null,
     `nothing is saved before the tutorial, which is the case that broke (${before.raw === null ? 'empty' : 'NOT empty'})`);

  // ---- Run the tutorial ---------------------------------------------------
  const begin = page.locator('[data-quest-track="dm"]').first();
  ok(await begin.count() > 0, 'the tutorial can be started from the front door');
  if (await begin.count()) await begin.click();
  await page.waitForTimeout(2600);

  const during = await readDemo(page);
  ok(during.raw !== null, 'the tutorial lays out its own copy to walk through');
  // THE SNAPSHOT IS THE FIX. Without it there is nothing to put back, and the
  // old check for "the snapshot was cleaned up" passed by never taking one.
  ok(during.snapshot !== null,
     'and it parks what was there first, INCLUDING when what was there is nothing');

  // Change something inside the tutorial, so a leak would be visible.
  await page.goto(`${BASE}/dm/pair-john`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  // This test edits the tutorial's data, independently of its current step.
  // Use the real collapse control so the teaching panel cannot cover Journey.
  const shrink = page.getByRole('button', { name: 'Shrink tutorial', exact: true });
  if (await shrink.isVisible()) await shrink.click();
  // The sections of this page are a drop-down (30 September 2026).
  ok(await openRoom(page, /Journey/i), 'Journey opens through its real menu');
  const advance = page.getByRole('button', { name: /Advance to/i }).first();
  await advance.waitFor({ state: 'visible' });
  await advance.click();
  await page.waitForTimeout(1300);
  const mutated = await readDemo(page);
  ok(mutated.stages !== during.stages,
     `something was changed inside the tutorial, so a leak would show (${mutated.stages})`);

  // ---- Finish it ----------------------------------------------------------
  await page.evaluate(() => localStorage.setItem(
    'beacon-quest-v1-dm',
    JSON.stringify({ completed: ['open', 'message', 'react', 'advance', 'share', 'profile', 'done'] }),
  ));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const finish = page.getByRole('button', { name: /^Done$|Finish/i }).first();
  ok(await finish.count() > 0, 'the walk can be finished');
  if (await finish.count()) { await finish.click(); await page.waitForTimeout(1800); }

  const after = await readDemo(page);

  // THE ONE THAT MATTERS.
  //
  // NOT "the key is gone". The restore removes it, and the app then saves a
  // fresh demo over the top within the second, which is correct and is exactly
  // what a first-time visitor has: with no key at all the store starts from the
  // same seed, so the two are the same demo by different routes. Asserting the
  // key's absence was asserting a detail that is invisible to the person and
  // untrue for a reason that is not a bug.
  //
  // What a person would notice is whether the walk they just finished left its
  // fingerprints on their demo. That is what these two say.
  ok(after.stages === during.stages,
     `the demo is back to the untouched state a first visit gets (${after.stages})`);
  ok(after.stages !== mutated.stages,
     'so nothing the tutorial changed is left behind');
  ok(after.snapshot === null, 'and the parked copy is cleared rather than kept');

  // A reload must not resurrect it either: the restore has to have reached
  // storage, not only the screen.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const reloaded = await readDemo(page);
  ok(reloaded.stages !== mutated.stages, 'and it stays gone after a reload');
  ok(reloaded.snapshot === null, 'with no parked copy waiting to come back');

  await context.close();
  await browser.close();
  console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
