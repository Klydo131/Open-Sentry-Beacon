// A lesson series, built by the library and walked to the end by a seeker.
//
// The client's request in one sentence: "Can the library upload lesson series on
// specific areas of interest that can be pushed to seekers and walked through
// with them until they finish?" This walks that sentence, in order, in one
// browser, as three different people:
//
//   an admin builds it  →  a missionary pushes it  →  a seeker finishes it
//
// One persistent context on purpose. The demo database lives in localStorage and
// is shared by every persona, which is what makes it possible to prove that the
// thing one person created is the thing another person receives. Three separate
// contexts would prove three separate screens render.
//
// It also checks the in-person meeting map link, because that lives one tab away
// and a suite that has already signed in as a missionary may as well.
const { chromium, launchOptions, openRoom } = require('./_playwright');

const PORT = process.argv[2] || '4001';
const BASE = `http://localhost:${PORT}`;
const OUT =
  process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(
    require('node:path').join(require('node:os').tmpdir(), 'beacon-e2e-'),
  );

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

const SERIES = `Walking with grief ${Date.now().toString(36).slice(-4)}`;
const TOPIC = 'Hard seasons';

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

const bodyText = (page) => page.locator('body').innerText();

(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();

  // ------------------------------------------------ 1. the library builds it --
  ok(await signInAs(page, 'Pastor Ramos'), 'an admin can sign in');
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('[data-quest="tab-materials"]').first().click();
  await page.waitForTimeout(900);
  // The builder opens when asked for; the shelf is what the page shows first.
  await page.getByRole('button', { name: /^\+ New series$/ }).first().click();
  await page.waitForTimeout(400);

  const builder = page.getByText(/Build a lesson series/i);
  ok((await builder.count()) > 0, 'the library has a series builder');

  await page.getByLabel('Series name').fill(SERIES);
  await page.getByLabel('Topic', { exact: true }).fill(TOPIC);

  // Tap two lessons. The order tapped is the order walked, which is the whole
  // interaction — no drag handles, no position numbers to keep in your head.
  const lessonButtons = page.locator('button[aria-pressed]');
  const lessonCount = await lessonButtons.count();
  ok(lessonCount > 2, `the builder offers the lesson catalogue (${lessonCount})`);
  await lessonButtons.nth(0).click();
  await lessonButtons.nth(1).click();
  await page.waitForTimeout(300);

  const save = page.getByRole('button', { name: /Save series/i }).first();
  ok(await save.isEnabled(), 'Save turns on once it has a name, a topic and lessons');
  await save.click();
  await page.waitForTimeout(900);

  let text = await bodyText(page);
  ok(text.includes(SERIES), 'the new series appears on the shelf');
  ok(text.includes(TOPIC), 'filed under the area of interest it was given');
  await page.screenshot({ path: `${OUT}/series-1-library.png` });

  // -------------------------------------------- 2. the missionary pushes it --
  ok(await signInAs(page, 'Maria Santos'), 'a missionary can sign in');
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('[data-quest="seeker-card"]').first().click();
  await page.waitForTimeout(1400);

  const lessonsTab = page.getByRole('tab', { name: /Lesson|Resource|Study/i }).first();
  if (await lessonsTab.count()) {
    await lessonsTab.click();
    await page.waitForTimeout(800);
  }
  // Some builds put lessons under the Resources tab; find the card either way.
  if (!(await page.getByText(/Lesson series/i).count())) {
    const tabs = page.getByRole('tab');
    for (let i = 0; i < (await tabs.count()); i++) {
      await tabs.nth(i).click();
      await page.waitForTimeout(600);
      if (await page.getByText(/Lesson series/i).count()) break;
    }
  }

  ok((await page.getByText(/Lesson series/i).count()) > 0, 'the missionary sees the series shelf');
  text = await bodyText(page);
  ok(text.includes(SERIES), 'the series the admin built is offered to the missionary');

  const start = page
    .locator('div', { hasText: SERIES })
    .getByRole('button', { name: /Start this series/i })
    .first();
  const startAny = (await start.count())
    ? start
    : page.getByRole('button', { name: /Start this series/i }).first();
  await startAny.click();
  await page.waitForTimeout(1000);
  text = await bodyText(page);
  ok(/\d of \d/.test(text), 'starting it shows progress rather than a bare "assigned"');
  await page.screenshot({ path: `${OUT}/series-2-missionary.png` });

  // ------------------------- in-person meetings carry a map link, same visit --
  const meetTab = page.getByRole('tab', { name: /Meet|Plan|Talk/i }).first();
  if (await meetTab.count()) {
    await meetTab.click();
    await page.waitForTimeout(700);
  }
  const modeSelect = page.locator('select').filter({ hasText: /In person/i }).first();
  if ((await modeSelect.count()) > 0) {
    await modeSelect.selectOption('in_person').catch(() => {});
    await page.waitForTimeout(400);
    const place = page.getByPlaceholder(/Where\?/i).first();
    if (await place.count()) {
      await place.fill('Church café, 12 Rizal St, Cavite');
      const dt = page.locator('input[type="datetime-local"]').first();
      if (await dt.count()) await dt.fill('2027-01-05T10:30');
      const sched = page.getByRole('button', { name: /^Schedule$/i }).first();
      if (await sched.count()) {
        await sched.click();
        await page.waitForTimeout(900);
      }
    }
  }
  const maps = page.getByRole('link', { name: /Open in Maps/i }).first();
  const hasMaps = (await maps.count()) > 0;
  ok(hasMaps, 'an in-person meeting offers Open in Maps');
  if (hasMaps) {
    const href = await maps.getAttribute('href');
    ok(
      /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=/.test(href || ''),
      `it points at Google Maps (${(href || '').slice(0, 60)}…)`,
    );
    ok(
      !/[ ",]/.test((href || '').split('query=')[1] || ''),
      'the place is URL-encoded, not pasted raw into the address',
    );
  }

  // ------------------------------------------------ 3. the seeker walks it ---
  ok(await signInAs(page, 'John Reyes'), 'a seeker can sign in');
  await page.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // Lesson studies live in the Study room, not on one long scroll.
  await openRoom(page, /Study/i);

  // Read THIS series' card, not the whole page.
  //
  // The seeker already has the seeded series on their screen, so a bare
  // `body.innerText` match on "N of M" found somebody else's progress and passed
  // for the wrong reason — it reported "3 of 4" while this series was at 2 of 2.
  const card = () =>
    page
      .locator('[data-series]')
      .filter({ hasText: SERIES })
      .first()
      .innerText()
      .catch(() => '');

  text = await bodyText(page);
  ok(text.includes(SERIES), 'the seeker sees the series they were started on');
  // Case-insensitively: the topic is rendered uppercase by CSS, and innerText
  // reports what is on screen rather than what is in the data.
  ok(
    text.toLowerCase().includes(TOPIC.toLowerCase()),
    'and the area of interest it belongs to',
  );
  let mine = await card();
  ok(/0 of 2/.test(mine), `it opens at the beginning (${(mine.match(/\d of \d/) || [''])[0]})`);
  await page.screenshot({ path: `${OUT}/series-3-seeker.png` });

  // Walk it to the end. Only the next lesson is ever offered.
  for (let step = 1; step <= 2; step++) {
    const scope = page.locator('[data-series]').filter({ hasText: SERIES }).first();
    const done = scope.getByRole('button', { name: /^Mark done$/i }).first();
    if ((await done.count()) === 0) {
      ok(false, `step ${step}: a "Mark done" button is offered`);
      break;
    }
    await done.click();
    await page.waitForTimeout(1000);
    mine = await card();
    ok(
      new RegExp(`${step} of 2`).test(mine) || /Finished/i.test(mine),
      `after step ${step} this series moves on (${(mine.match(/\d of \d/) || ['none'])[0]})`,
    );
  }

  mine = await card();
  ok(/Finished/i.test(mine), 'finishing the last lesson finishes the series');
  ok(
    /finished the whole series/i.test(mine),
    'and the seeker is told so, rather than the card just going quiet',
  );
  text = await bodyText(page);
  await page.screenshot({ path: `${OUT}/series-4-finished.png` });

  // The rule from last round still binds: no stage name reaches a seeker, and a
  // series is grouped by area of interest precisely so it never has to.
  const lower = text.toLowerCase();
  ok(
    !/\bcultivate\b|\bcommission\b/.test(lower),
    'no journey-stage name appears on the seeker screen',
  );

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  await ctx.close();
  await browser.close();
  process.exit(bad === 0 ? 0 : 1);
})();
