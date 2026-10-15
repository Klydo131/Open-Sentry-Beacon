// The questions people ask can be read before anybody signs in, and again in
// Settings, and they work like a person expects.
//
// Asked for on 7 October 2026: "I want a complete FAQ in the app too please
// before users login and inside the app in settings."
//
// WHAT IT HAS TO PROVE, on a phone:
//   1. the front door and the sign-in screen both lead to it, signed out
//   2. it opens on every group and every question, with nothing to sign in for
//   3. a question opens its answer under it when tapped
//   4. searching narrows the list, says how many matched, and opens the
//      answer when only a few are left; a search for nothing says so
//   5. a link to one answer (/faq#faq-encrypted) opens that answer, in view
//   6. the page never scrolls sideways on a phone
//   7. inside the app, Settings, Help holds the same answers, and its search
//      works there too
//   8. nothing on the way logs an error
//
//   node tests/e2e/questions-answered.js [port]

const { browser: engine, launchOptions, pageErrors } = require('./_playwright');
const { signIn } = require('./_looks');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const visibleAnswer = (page, id) => page.locator(`[data-faq-item="${id}"] [data-faq-answer]`).isVisible();

(async () => {
  const browser = await engine.launch(launchOptions);
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    const page = await context.newPage();
    // The shared rule: WebKit's report of a prefetch the walk outran, or of the
    // release check a page change cut short, is not an error in the app. This
    // walk had its own copy that knew only the first, and the safari run of
    // 15 October 2026 failed it on the second (version.json and sw.js, cut
    // short 27 to 33 ms before the walk's next page).
    const thrown = pageErrors(page);
    const logged = [];
    page.on('console', (m) => { if (m.type() === 'error') logged.push(m.text()); });

    // ---- 1. Signed out, from the front door and from sign-in. ----
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    const doorLink = page.locator('a[data-faq-link]').first();
    ok(await doorLink.isVisible(), 'the front door has a way to the questions, before anybody signs in');
    await doorLink.click();
    await page.waitForURL(/\/faq$/, { timeout: 10_000 });
    ok(true, 'and it opens the questions page');

    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    ok(await page.locator('a[data-faq-link][href="/faq"]').first().isVisible(), 'the sign-in screen has one too');

    // ---- 2. Everything is there. ----
    await page.goto(`${BASE}/faq`, { waitUntil: 'networkidle' });
    await page.locator('[data-faq-item]').first().waitFor({ timeout: 10_000 });
    const shape = await page.evaluate(() => ({
      title: document.title,
      h1: document.querySelector('h1')?.textContent || '',
      groups: document.querySelectorAll('[data-faq-group]').length,
      items: document.querySelectorAll('[data-faq-item]').length,
      count: document.querySelector('[data-faq-count]')?.textContent || '',
      open: document.querySelectorAll('[data-faq-item][open]').length,
      privacy: !!document.querySelector('a[href="/privacy"]'),
    }));
    ok(/Questions people ask/.test(shape.h1) && /Questions people ask/.test(shape.title),
      `the page says what it is, in its heading and its tab ("${shape.title}")`);
    ok(shape.groups >= 8 && shape.items >= 50, `every group and every question is there (${shape.groups} groups, ${shape.items} questions)`);
    ok(new RegExp(`^${shape.items} questions`).test(shape.count), `and the line above them says how many ("${shape.count}")`);
    ok(shape.open === 0, 'every answer starts closed, so the questions read as a list');
    ok(shape.privacy, 'the full privacy notice is a tap away');

    // ---- 3. Tapping a question opens its answer. ----
    await page.locator('[data-faq-item="who-reads"] summary').click();
    ok(await visibleAnswer(page, 'who-reads'), 'tapping "Who can read my messages?" opens its answer');
    const who = await page.locator('[data-faq-item="who-reads"] [data-faq-answer]').innerText();
    ok(/stays between the two of you/.test(who) && /church’s leaders included|church's leaders included/.test(who),
      'and the answer is the same wording as the invitation and the sign-up');
    const box = await page.locator('[data-faq-item="who-reads"] summary').boundingBox();
    ok(box && box.height >= 44, `a question is a full finger's height to tap (${box ? Math.round(box.height) : 0}px)`);

    // ---- 4. Searching. ----
    const search = page.locator('[data-faq-search]');
    await search.fill('lost my phone');
    await page.waitForTimeout(200);
    const lost = await page.evaluate(() => ({
      items: [...document.querySelectorAll('[data-faq-item]')].map((d) => d.getAttribute('data-faq-item')),
      count: document.querySelector('[data-faq-count]')?.textContent || '',
    }));
    ok(lost.items.length >= 1 && lost.items.length <= 3 && lost.items.includes('sign-out'),
      `searching "lost my phone" narrows to the answer about signing out (${lost.items.join(', ')})`);
    ok(/match/.test(lost.count), `and says how many matched ("${lost.count}")`);
    ok(await visibleAnswer(page, 'sign-out'), 'with so few left, the answer is already open');
    ok(/Sign out everywhere else/.test(await page.locator('[data-faq-item="sign-out"] [data-faq-answer]').innerText()),
      'and it names the button to press');

    await search.fill('password');
    await page.waitForTimeout(200);
    const pw = await page.locator('[data-faq-item]').count();
    ok(pw > 3 && pw < shape.items, `a broader search leaves a shorter list (${pw} of ${shape.items})`);

    await search.fill('zebra crossing');
    await page.waitForTimeout(200);
    ok(await page.locator('[data-faq-item]').count() === 0, 'a search that matches nothing shows nothing');
    ok(/Nothing matches/.test(await page.locator('[data-faq-count]').innerText()), 'and says so, rather than a blank page');
    await search.fill('');

    // ---- 5. A link to one answer: arriving with it, and following it here. ----
    const where = (id) => page.evaluate((i) => {
      const d = document.getElementById(i);
      const r = d?.getBoundingClientRect();
      return { open: !!d?.open, top: r ? r.top : -1 };
    }, id);
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.goto(`${BASE}/faq#faq-encrypted`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const arrived = await where('faq-encrypted');
    ok(arrived.open, 'arriving by a link to one answer opens it');
    ok(arrived.top >= 0 && arrived.top < 844, `and brings it into view (${Math.round(arrived.top)}px from the top)`);
    ok(/not end-to-end encrypted/.test(await page.locator('#faq-encrypted [data-faq-answer]').innerText()),
      'the encryption answer says plainly what it is not');
    await page.evaluate(() => { window.location.hash = 'faq-complain'; });
    await page.waitForTimeout(600);
    const followed = await where('faq-complain');
    ok(followed.open && followed.top >= 0 && followed.top < 844,
      `and following one while already on the page does the same (${Math.round(followed.top)}px from the top)`);

    // ---- 6. Never sideways on a phone. ----
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(wide <= 1, `the page never scrolls sideways on a phone (${wide}px over)`);

    // ---- 7. Inside the app, in Settings, Help. ----
    await signIn(page, BASE, 'John Reyes');
    await page.goto(`${BASE}/settings#faq`, { waitUntil: 'networkidle' });
    const card = page.locator('[data-faq-card]');
    await card.waitFor({ timeout: 10_000 });
    ok(await card.isVisible(), 'Settings opens on Help with the questions in it');
    const inside = await card.locator('[data-faq-item]').count();
    ok(inside === shape.items, `the same questions as the page outside (${inside} of ${shape.items})`);
    await card.locator('[data-faq-search]').fill('different Guide');
    await page.waitForTimeout(200);
    ok(await card.locator('[data-faq-item="different-guide"] [data-faq-answer]').isVisible(),
      'and its search finds and opens "What if I need a different Guide?"');
    ok(await card.locator('a[href="/faq"]').isVisible(), 'with a link to the page of its own, to send somebody');

    // ---- 8. Quiet. ----
    const real = [...thrown.list(), ...logged].filter((e) => !/favicon|Failed to load resource.*404/.test(e));
    ok(real.length === 0, `nothing on the way logged an error${real.length ? `: ${real.slice(0, 3).join(' | ')}` : ''}`);
  } catch (e) {
    bad++;
    console.log(`BAD the walk stopped: ${e.message}`);
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} failed.` : '\nRESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})();
