// The Office is a room with subrooms, not a page you scroll.
//
// THE REPORT, with a drawing: rooms are main folders, subrooms are folders
// inside them. "I want the user to just click or tap the subrooms so they can
// just go to their destination and not scroll down tirelessly. If I pick the
// Lesson studies subroom, I will automatically go there and create my own
// Lesson studies, not scroll down and find it."
//
// So this walks it the way a person would, in a real browser at phone width:
// open the room, press a subroom, and check that the thing you asked for is on
// screen WITHOUT SCROLLING and that the things you did not ask for are gone.
//
// "Without scrolling" is the whole feature, so it is measured rather than
// assumed: the panel's top must be inside the first screenful.
//
//   npm run build && node scripts/run-next.mjs start -p 4412
//   node tests/e2e/office-subrooms.js 4412

const { chromium, launchOptions, devices, engineName } = require('./_playwright');
const PORT = process.argv[2] || '4412';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// The Office belongs to Guides and leadership, so somebody has to be in it.
// Maria Santos is the sample church's Guide.
async function signInAs(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const pick = page.getByText(who).first();
  if (await pick.count()) await pick.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it|Agree|OK/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(700);
  }
}

// THE FURNITURE A REAL PERSON PUTS AWAY ON THEIR FIRST VISIT.
//
// On a touch device the install card is pinned to the bottom of the screen and
// a just-signed-in toast sits across the top. Both are fixed, both take taps,
// and leaving them up would make everything below a measurement of a first
// visit rather than of the room.
//
// Snoozed through the same key the card's own "I already have it installed"
// button writes, before the page loads, rather than by clicking it: the card
// animates in, and Playwright spent a minute chasing a moving target and then
// timed out. Setting the flag is what the app itself does, and it is the state
// every returning user is already in.
async function quietStart(context) {
  await context.addInitScript(() => {
    try {
      localStorage.setItem(
        'beacon-install-snoozed-until',
        String(Date.now() + 3650 * 24 * 60 * 60 * 1000),
      );
    } catch { /* a private window is not a reason to fail the suite */ }
  });
}

// The toast clears itself, so waiting is cheaper than fighting it.
const settle = (page) => page.waitForTimeout(2600);

(async () => {
  const browser = await chromium.launch(launchOptions);
  // A phone held upright, which is where the scrolling hurt.
  const context = await browser.newContext({ viewport: { width: 390, height: 780 } });
  await quietStart(context);
  const page = await context.newPage();

  await signInAs(page, 'Maria Santos');
  await page.goto(`${BASE}/office`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await settle(page);

  // THE SUBROOMS ARE A DROP-DOWN since 30 September 2026 (asked for: people did
  // not know to swipe the strip). Its button names the subroom you are in;
  // opening it lists every one of them.
  const toggle = page.locator('[data-subroom-toggle]').first();
  const opts = page.locator('[data-subroom-menu] [role="option"]');
  const openList = async (pg = page) => {
    if ((await pg.locator('[data-subroom-menu] [role="option"]').count()) === 0) {
      await pg.locator('[data-subroom-toggle]').first().click();
      await pg.waitForTimeout(300);
    }
  };
  const named = async (pg = page) => (await pg.locator('[data-subroom-toggle]').first().getAttribute('aria-label')) || '';

  await openList();
  const count = await opts.count();
  ok(count >= 2, `the Office offers subrooms to choose from (${count})`);

  // Opening the list must not widen the page.
  const doc = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  ok(doc.scrollW <= doc.clientW + 1,
     `the open list does not push the page sideways (${doc.scrollW} <= ${doc.clientW})`);

  // Every subroom is listed, and choosing one shows something.
  const labels = [];
  for (let i = 0; i < count; i += 1) labels.push((await opts.nth(i).innerText()).replace(/\s+/g, ' ').trim());
  const ids = [];
  for (let i = 0; i < count; i += 1) ids.push(await opts.nth(i).getAttribute('data-room'));
  console.log(`    subrooms: ${labels.join(' | ')}`);

  const studies = labels.findIndex((l) => /lesson studies/i.test(l));
  ok(studies > -1, 'one of them is Lesson studies, which is the one that was reported');

  if (studies > -1) {
    await opts.nth(studies).click();
    await page.waitForTimeout(700);

    ok(/lesson studies/i.test(await named()), 'pressing a subroom selects it, and the button now names it');

    // THE MEASUREMENT. The panel has to be on the first screen, not below it.
    const top = await page.evaluate(() => {
      const heads = [...document.querySelectorAll('h1, h2, h3')];
      const h = heads.find((e) => /lesson|series|study/i.test(e.textContent || ''));
      return h ? Math.round(h.getBoundingClientRect().top) : null;
    });
    ok(top !== null, 'the lesson studies panel is on the page');
    ok(top !== null && top >= 0 && top < 780,
       `and it is on the first screenful without scrolling (top: ${top}px)`);

    const scrolled = await page.evaluate(() => window.scrollY);
    ok(scrolled === 0, `nobody had to scroll to get there (scrollY ${scrolled})`);
  }

  // Choosing a different subroom puts the first one away. A subroom that does
  // not hide the others is a page with tabs drawn on it.
  const other = labels.findIndex((l, i) => i !== studies);
  if (other > -1 && studies > -1) {
    await openList();
    await opts.nth(other).click();
    await page.waitForTimeout(600);
    const stillThere = await page.evaluate(() => {
      const heads = [...document.querySelectorAll('h1, h2, h3')];
      return heads.some((e) => /lesson series|lesson study/i.test(e.textContent || ''));
    });
    ok(!stillThere, `choosing ${labels[other]} puts Lesson studies away`);
  }

  // THE CHOICE IS REMEMBERED. Coming back tomorrow should land where the work
  // is, which is the other half of not having to hunt.
  if (studies > -1) {
    await openList();
    await opts.nth(studies).click();
    await page.waitForTimeout(500);
    await page.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await page.goto(`${BASE}/office`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    ok(/lesson studies/i.test(await named()),
       'and coming back to the Office lands on the subroom you were last in');
  }

  // A LINK CAN STILL SEND SOMEBODY TO AN EXACT SUBROOM, which is what the desk
  // rail needs: `?room=` beats the remembered choice.
  const wanted = labels.findIndex((l, i) => i !== studies);
  if (wanted > -1) {
    const id = ids[wanted];
    await page.goto(`${BASE}/office?room=${id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const said = await named();
    ok(said.includes(labels[wanted].replace(/\s*\d+$/, '')), `?room=${id} beats the remembered subroom (${said})`);
  }

  await context.close();

  // -------------------------------------------------------------------------
  // The same room, on every shape of device somebody actually holds.
  // -------------------------------------------------------------------------
  // ASKED FOR AFTER THE FACT, and fairly: "I don't want to have problems again
  // when users switch from any other devices, especially mobile and pad,
  // especially iOS and Mac users."
  //
  // A strip of six choices that scrolls sideways inside itself is exactly the
  // shape that has gone wrong here before. `overflow-x` was rendered one way by
  // Blink and another by WebKit and left an empty strip down the side of every
  // screen; the fix for that is why the page must never scroll sideways at all.
  //
  // These descriptors are Playwright's own, so the numbers are the real devices
  // rather than numbers typed here that drift. Under E2E_BROWSER=webkit this
  // whole file runs on the engine inside Safari, which is what
  // .github/workflows/safari.yml does on a macOS runner.
  const SHAPES = [
    ['iPhone SE, upright', devices['iPhone SE']],
    ['iPhone 14 Pro Max, upright', devices['iPhone 14 Pro Max']],
    ['iPhone 14 Pro Max, on its side', devices['iPhone 14 Pro Max landscape']],
    ['iPad Mini, upright', devices['iPad Mini']],
    ['iPad Pro 11, upright', devices['iPad Pro 11']],
    ['iPad Pro 11, on its side', devices['iPad Pro 11 landscape']],
    ['a Mac window', { viewport: { width: 1440, height: 900 } }],
    ['a narrow Mac window', { viewport: { width: 1024, height: 768 } }],
  ].filter(([, d]) => d);

  // EVERY ROOM THAT HAS SUBROOMS NOW, not the Office alone. Each is walked as
  // the role that lives in it.
  const ROOMS = [
    ['Maria Santos', '/office', "a Guide's Office"],
    ['Maria Santos', '/dm', "a Guide's home"],
    ['Maria Santos', '/church', 'the Church'],
    ['Maria Santos', '/settings', 'Settings'],
    ['Maria Santos', '/library', 'the Library'],
    ['John Reyes', '/ds', "an Explorer's journey"],
  ];

  for (const [label, descriptor] of SHAPES) {
    for (const [who, path, roomName] of ROOMS) {
      const c = await browser.newContext(descriptor);
      await quietStart(c);
      const pg = await c.newPage();
      await signInAs(pg, who);
      await pg.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await pg.waitForTimeout(900);
      await settle(pg);

      // THE DROP-DOWN (30 September 2026): its button, and the list it opens.
      const button = pg.locator('[data-subroom-toggle]').first();
      const hasButton = (await button.count()) > 0;
      if (hasButton) { await button.click(); await pg.waitForTimeout(300); }
      const t = pg.locator('[data-subroom-menu] [role="option"]');
      const n = await t.count();

      const m = await pg.evaluate(() => {
        const btn = document.querySelector('[data-subroom-toggle]');
        const list = document.querySelector('[data-subroom-menu] [role="listbox"]');
        const b = btn ? btn.getBoundingClientRect() : null;
        const l = list ? list.getBoundingClientRect() : null;
        return {
          pageScrollW: document.documentElement.scrollWidth,
          pageClientW: document.documentElement.clientWidth,
          left: Math.round(Math.min(b ? b.left : 0, l ? l.left : 0)),
          right: Math.round(Math.max(b ? b.right : 0, l ? l.right : 0)),
          found: Boolean(b),
        };
      });

      const tag = `${label} · ${roomName}`;
      ok(n >= 2, `${tag}: offers subrooms (${n})`);

      // 1. The page never scrolls sideways. This is the iOS bug, restated.
      ok(m.pageScrollW <= m.pageClientW + 1,
         `${tag}: no sideways scroll (${m.pageScrollW} <= ${m.pageClientW})`);

      // 2. The button and the list it opens are inside the screen.
      ok(m.found && m.left >= -1 && m.right <= m.pageClientW + 1,
         `${tag}: the list is inside the screen`);

      // 3. Apple's floor for a touch target is 44 points.
      let smallest = 999;
      for (let i = 0; i < n; i += 1) {
        const box = await t.nth(i).boundingBox();
        if (box) smallest = Math.min(smallest, box.height);
      }
      ok(smallest >= 44, `${tag}: every subroom is a 44pt target (${smallest})`);

      // 4. THE LAST CHOICE IS REACHABLE, and opening it does not widen the page.
      if (n > 0) {
        const lastLabel = (await t.nth(n - 1).innerText()).replace(/\s+/g, ' ').replace(/\s*\d+$/, '').trim();
        await t.nth(n - 1).scrollIntoViewIfNeeded();
        await t.nth(n - 1).click();
        await pg.waitForTimeout(500);
        const said = (await button.getAttribute('aria-label')) || '';
        ok(said.includes(lastLabel), `${tag}: the last subroom opens`);
      }

      const after = await pg.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        c: document.documentElement.clientWidth,
      }));
      ok(after.w <= after.c + 1, `${tag}: still no sideways scroll with it open`);

      await c.close();
    }
  }

  await browser.close();
  console.log(`\n(engine: ${engineName})`);
  console.log(bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
