// How fast does a running app notice a new release, and what does it cost?
//
// The owner's sentence was. That is a claim
// with a number in it, and a claim with a number in it should have a test.
//
// The old pacing was a 15-minute timer plus the `focus` event. Both are desktop
// assumptions: fifteen minutes is a long time to stand in front of a room, and
// `focus` is not how a phone comes back — switching apps and returning to an
// installed PWA fires `visibilitychange`, and a bfcache restore fires `pageshow`
// and may fire nothing else at all.
//
// So this measures the promise rather than the mechanism:
//
//   1. a fresh load asks the server what build it is running, quickly;
//   2. a release that lands WHILE the app is open is on screen inside a minute;
//   3. coming back to the app checks immediately, by whichever event the device
//      happens to send — visibilitychange, pageshow or focus;
//   4. a hidden app costs nothing: no timer, no request;
//   5. events arriving together are one request, not three;
//   6. once it has found the update it stops asking.
//
// The service worker is blocked in these contexts, which is deliberate: it
// proves the server check stands on its own, the way it must on a device whose
// worker is the broken part.
const { chromium, launchOptions } = require('./_playwright');

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
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();

  // What the server actually says, before anything is faked.
  //
  // Read AFTER navigating, not before: on about:blank there is no origin to
  // fetch a same-origin URL from, so this came back null — and the app then saw
  // a body of `null`, decided the build was "unknown", and showed no banner.
  // "No banner while the app is current" passed on that, for entirely the wrong
  // reason. Anchoring the fake to the REAL build is what makes it a test.
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const real = await page
    .evaluate(async () => {
      const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      return r.json();
    })
    .catch(() => null);
  ok(!!(real && real.build), `the server reports a build (${real && real.build})`);
  if (!real || !real.build) {
    console.log('\nRESULT: 1 FAILURE(S) — no build to compare against');
    await browser.close();
    process.exit(1);
  }

  // A release that has not happened yet. `pretendNewer` is flipped on partway
  // through, so the app sees a deploy land underneath it exactly as it would in
  // real life — same URL, same headers, one different id.
  let pretendNewer = false;
  const hits = [];
  await page.route('**/version.json*', async (route) => {
    hits.push(Date.now());
    const body = pretendNewer
      ? { ...real, build: 'newer00000000', time: new Date(Date.now() + 60_000).toISOString() }
      : real;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-store' },
      body: JSON.stringify(body),
    });
  });

  // --------------------------------------------- 1. it asks, and asks early --
  const loadedAt = Date.now();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await sleep(4000);
  ok(hits.length >= 1, `it asks the server on load (${hits.length} request(s))`);
  if (hits.length) {
    const firstAfter = hits[0] - loadedAt;
    ok(
      firstAfter < 4000,
      `and asks within four seconds of opening (${(firstAfter / 1000).toFixed(1)}s)`,
    );
  }

  // Nothing is ever shown asking the person to update. The app applies builds
  // itself; this suite is about how fast it NOTICES one, not about a prompt.
  const banner = page.getByText(/Update ready|Please update/i).first();
  ok((await banner.count()) === 0, 'nothing asks the person to update');

  // ------------------- 2. a release landing while the app is open, on screen --
  //
  // The headline claim, and the slowest assertion in the suite. The cadence is
  // 30s for the first five minutes after opening; the app then reloads onto the
  // "new" build, which takes a few seconds more, so 90 is the honest budget.
  //
  // NOTE ON WHAT THIS SCENARIO REALLY IS. The build being announced here does
  // not exist — `/version.json` is faked and the bundle never changes — so the
  // app reloads, comes back as the same build, and finds the same "newer"
  // answer waiting. That is not a contrived test condition. It is exactly what
  // an edge cache serving `/version.json` from one deployment and the HTML from
  // another looks like from the inside, and this project has shipped ids that
  // disagreed before.
  //
  // With a banner that state was a prompt that never went away. With automatic
  // apply it is an infinite reload loop, and this assertion is how it was
  // found: every read of the page caught it mid-navigation, so the state was
  // never observed at all. The budget in lib/auto-update.ts is what stops it.
  pretendNewer = true;
  const releasedAt = Date.now();
  let noticedAt = null;
  let spent = null;
  let stableFor = 0;

  // Read both facts in one go, because they have to agree about the same
  // moment: a page caught mid-navigation answers neither.
  const look = () =>
    page
      .evaluate(() => {
        let n = 0;
        try {
          const raw = sessionStorage.getItem('beacon.autoupdate.attempts');
          n = raw ? Number(JSON.parse(raw).n) || 0 : 0;
        } catch {
          n = -1; // storage refused; distinguishable from "none spent"
        }
        return { state: document.documentElement.getAttribute('data-update-state'), n };
      })
      .catch(() => null);

  for (let i = 0; i < 90; i++) {
    const seen = await look();
    if (seen && (seen.state === 'ready' || seen.state === 'required')) {
      if (noticedAt === null) noticedAt = Date.now();
      // Settled means it has stopped reloading, not merely that it noticed.
      // Breaking on the first sight of 'ready' would race the reload that
      // follows it, and then everything below would be measuring a page that
      // was about to disappear.
      stableFor = seen.n === spent ? stableFor + 1 : 0;
      spent = seen.n;
      if (stableFor >= 8) break;
    } else {
      stableFor = 0;
    }
    await sleep(1000);
  }

  ok(
    noticedAt !== null,
    noticedAt
      ? `a release landing mid-session is noticed in ${((noticedAt - releasedAt) / 1000).toFixed(0)}s`
      : 'a release landing mid-session was never noticed in 90s — the app is probably ' +
          'reloading in a loop, which is what the attempt budget exists to stop',
  );
  ok(
    stableFor >= 8,
    stableFor >= 8
      ? 'and then it settles: eight seconds with no further reload'
      : 'it never settled — the reload count kept moving, which is the loop itself',
  );
  ok(
    (await page.getByRole('button', { name: /Restart|^Update$/i }).count()) === 0,
    'and still nothing is offered to tap',
  );

  // The budget itself, read from where the app keeps it. Without this, "it
  // settled" could pass on an app that reloaded fifty times and happened to be
  // quiet for the eight seconds it was watched.
  ok(
    spent !== null && spent >= 0 && spent <= 2,
    `a build it can never actually become costs at most two reloads, then it stops (spent: ${spent})`,
  );

  // --------------------------------- 6. having found it, it stops asking -----
  const afterFound = hits.length;
  await sleep(8000);
  ok(
    hits.length === afterFound,
    `it stops polling once the answer is known (${hits.length - afterFound} more in 8s)`,
  );

  // ------------------------------------------- 3, 4, 5 on a fresh page load --
  //
  // Back to "current" so the poller is live again, and a new page so the
  // fast-window timing starts over.
  pretendNewer = false;
  const page2 = await ctx.newPage();
  const hits2 = [];
  await page2.route('**/version.json*', async (route) => {
    hits2.push(Date.now());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Cache-Control': 'no-store' },
      body: JSON.stringify(real),
    });
  });
  await page2.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(4000);
  const base2 = hits2.length;
  ok(base2 >= 1, 'the second page asks on load too');

  // Hidden: document.visibilityState is read-only, so it is overridden here.
  // That tests our own listener logic rather than the browser's — which is the
  // honest scope of this assertion, and is exactly where the bug would live.
  await page2.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenFrom = hits2.length;
  await sleep(6000);
  ok(
    hits2.length === hiddenFrom,
    `a hidden app makes no requests (${hits2.length - hiddenFrom} in 6s)`,
  );

  // Coming back. Three events at once, which real devices do send.
  await page2.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    window.dispatchEvent(new Event('focus'));
  });
  await sleep(2500);
  const onReturn = hits2.length - hiddenFrom;
  ok(onReturn >= 1, 'coming back to the app checks straight away');
  ok(onReturn === 1, `three events at once make one request, not three (${onReturn})`);

  // Back online is its own trigger: signal returning is the likeliest moment
  // for a check to succeed after failing.
  const beforeOnline = hits2.length;
  await sleep(9000); // clear the minimum gap between checks
  await page2.evaluate(() => window.dispatchEvent(new Event('online')));
  await sleep(2500);
  ok(hits2.length > beforeOnline, 'coming back online checks too');

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  await ctx.close();
  await browser.close();
  process.exit(bad === 0 ? 0 : 1);
})();
