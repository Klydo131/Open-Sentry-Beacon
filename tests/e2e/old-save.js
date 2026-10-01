// A database saved by yesterday's build must still open in today's.
//
// This suite exists because of an outage, and the gap it fills is the reason the
// outage reached a phone. Every other suite starts in a clean browser context
// with empty storage, so every other suite is testing a FIRST run. Nobody's
// second run was ever tested — and the demo database lives in localStorage, so
// the second run is the one where the data on the device and the code in the
// bundle can disagree.
//
// They disagreed. `lesson_series` was added to the database shape without being
// added to the hand-written list that filled newer collections into older saves.
// On any device with saved demo data `db.lesson_series` was undefined, the first
// .filter() on it threw during render, and the app fell to the "Beacon needs a
// fresh copy" screen — which could not help, because that screen clears caches
// and service workers and deliberately never touches storage. The person could
// refresh forever and nothing would change.
//
// So this checks the general rule rather than the one collection that bit:
//
//   1. no single missing collection can stop the app starting,
//   2. a collection present but the wrong type is treated as missing,
//   3. and with lesson_series absent from the save, all three screens that read
//      it still render — and the feature is actually there, not silently empty.
const { chromium, launchOptions, openByQuest } = require('./_playwright');

const PORT = process.argv[2] || '4001';
const BASE = `http://localhost:${PORT}`;
const DB_KEY = 'beacon-demo-v1';

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

const CRASH = /Beacon needs a fresh copy/i;

async function signInAs(page, name) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const who = page.getByText(new RegExp(name, 'i')).first();
  if ((await who.count()) === 0) return false;
  await who.click();
  await page.waitForTimeout(1800);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
  return true;
}

// Load a route and report what actually happened, rather than assuming.
// A crash here is silent from the outside: the page still returns 200 and still
// renders HTML — just the recovery screen instead of the app.
async function open(page, route) {
  const errors = [];
  const onError = (e) => errors.push(String(e).split('\n')[0]);
  page.on('pageerror', onError);
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  const text = await page.locator('body').innerText();
  const hasMain = await page.locator('main').count();
  page.off('pageerror', onError);
  return { crashed: CRASH.test(text), hasMain: hasMain > 0, text, errors };
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();

  // Get a real saved database, the way a real device gets one: by using the app.
  // Signing in is what first writes it — a bare page load keeps the seed in
  // memory and stores nothing.
  ok(await signInAs(page, 'John Reyes'), 'a seeker can sign in');
  const saved = await page.evaluate((k) => localStorage.getItem(k), DB_KEY);
  ok(!!saved, 'using the app writes a database to storage');
  if (!saved) {
    console.log('\nRESULT: 1 FAILURE(S) — nothing saved, cannot test old saves');
    await browser.close();
    process.exit(1);
  }

  const full = JSON.parse(saved);
  const collections = Object.keys(full).filter((k) => Array.isArray(full[k]));
  ok(collections.length > 5, `the database has collections to drop (${collections.length})`);

  // ---------------------------------------- 1. drop each collection in turn --
  //
  // Deliberately every collection, not just the one that broke. Naming the
  // collection is how this happened in the first place; the rule is that no
  // collection may be special.
  const casualties = [];
  for (const key of collections) {
    const older = { ...full };
    delete older[key];
    await page.evaluate(
      ([k, v]) => localStorage.setItem(k, v),
      [DB_KEY, JSON.stringify(older)],
    );
    const r = await open(page, '/ds');
    if (r.crashed || !r.hasMain) casualties.push(`${key}${r.crashed ? ' (crash screen)' : ''}`);
  }
  ok(
    casualties.length === 0,
    casualties.length === 0
      ? `a save missing any one collection still opens (${collections.length} tried)`
      : `these missing collections stop the app: ${casualties.join(', ')}`,
  );

  // ------------------------------- 2. present but the wrong type is the same --
  //
  // null is what a half-written save leaves behind, and null.filter throws in
  // exactly the way undefined.filter does.
  const nulled = { ...full, lesson_series: null, meetings: null };
  await page.evaluate(
    ([k, v]) => localStorage.setItem(k, v),
    [DB_KEY, JSON.stringify(nulled)],
  );
  let r = await open(page, '/ds');
  ok(!r.crashed && r.hasMain, 'a collection saved as null is treated as missing, not fatal');

  // ------------------------------------- 3. the three screens that read it ---
  //
  // From here on an init script strips lesson_series before every page load, so
  // the app is permanently in the state the owner's phone was in: it fills the
  // collection in on load, saves it back, and finds it gone again next time.
  await ctx.addInitScript((k) => {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) return;
      const db = JSON.parse(raw);
      if (db && typeof db === 'object' && 'lesson_series' in db) {
        delete db.lesson_series;
        localStorage.setItem(k, JSON.stringify(db));
      }
    } catch {}
  }, DB_KEY);

  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [DB_KEY, saved]);

  r = await open(page, '/ds');
  ok(!r.crashed && r.hasMain, "the seeker's screen opens on a save with no lesson_series");
  // Context, not a claim. React's error boundary catches a render throw, so a
  // fully crashed page reports NO pageerror — asserting on this read green
  // against known-broken code when I checked. `crashed` is the real signal.
  if (r.errors.length) console.log(`     (console: ${r.errors[0]})`);

  ok(await signInAs(page, 'Pastor Ramos'), 'an admin can sign in on an old save');
  r = await open(page, '/admin');
  ok(!r.crashed && r.hasMain, "the admin's screen opens too");
  // Admin's rooms are a drop-down (30 September 2026): open it, then Materials.
  await openByQuest(page, 'tab-materials');
  await page.waitForTimeout(900);
  let text = await page.locator('body').innerText();
  ok(!CRASH.test(text), 'including the Materials tab, where the series library lives');
  // The point of filling from the seed rather than an empty array: the feature
  // is present on an old save, not merely non-fatal.
  ok(/Learning to pray/i.test(text), 'and the seeded series are there, not an empty shelf');

  ok(await signInAs(page, 'Maria Santos'), 'a missionary can sign in on an old save');
  r = await open(page, '/dm');
  ok(!r.crashed && r.hasMain, "the missionary's dashboard opens");
  await page.locator('[data-quest="seeker-card"]').first().click().catch(() => {});
  await page.waitForTimeout(1400);
  text = await page.locator('body').innerText();
  ok(!CRASH.test(text), "and a seeker's room, which offers series to start");

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  await ctx.close();
  await browser.close();
  process.exit(bad === 0 ? 0 : 1);
})();
