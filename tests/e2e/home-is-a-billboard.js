// Home opens on the church's announcements and blog posts, as cards you can see
// straight away and swipe through, and a card opens into the whole thing.
//
// Asked for on 7 October 2026: "It should look the Home Screen where people
// can see blogs and announcements right away please like a Bill board you can
// just see the image and photos right away and you can scroll on it."
//
// WHAT IT HAS TO PROVE, on the sample church, on a phone:
//   1. both rows are there, on the first screen, without scrolling
//   2. the blog row is pictures, and the pictures really load
//   3. a row swipes sideways and the page itself never does
//   4. a card opens the whole post, and closes again with Escape
//   5. opening a post counts as reading it (its writer sees 1 reader)
//   6. a draft is never on the board
//   7. in a dark look the words on a card can still be read
//   8. on a computer, the arrows move the row
//
//   node tests/e2e/home-is-a-billboard.js [port]

const { browser: engine, launchOptions } = require('./_playwright');
const { signIn } = require('./_looks');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const rgb = (v) => (v.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lum = (c) => c.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
  .reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

const openHome = async (page) => {
  await page.goto(`${BASE}/church?room=notices`, { waitUntil: 'networkidle' });
  await page.locator('[data-home-board="posts"] [data-board-card]').first().waitFor({ timeout: 15_000 });
};

(async () => {
  const browser = await engine.launch(launchOptions);
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    const page = await context.newPage();

    // ---- An Explorer opens Home. ----
    await signIn(page, BASE, 'John Reyes');
    await openHome(page);

    const rows = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-home-board]')].map((s) => {
      const heading = s.querySelector('h2').getBoundingClientRect();
      const cards = [...s.querySelectorAll('[data-board-card]')];
      return [s.getAttribute('data-home-board'), {
        headingTop: heading.top,
        cards: cards.length,
        firstCardTop: cards[0] ? cards[0].getBoundingClientRect().top : Infinity,
        cardHeight: cards[0] ? cards[0].getBoundingClientRect().height : 0,
        pictures: s.getAttribute('data-pictures'),
        titles: cards.map((c) => c.innerText),
      }];
    })));
    const notices = rows.notices || {};
    const posts = rows.posts || {};
    ok(notices.cards === 3, `the Announcements row has the church's three notices (${notices.cards})`);
    ok(posts.cards >= 3, `the blog row has the posts he may read (${posts.cards})`);
    ok(notices.headingTop < 844 && notices.firstCardTop < 844 && posts.headingTop < 844,
       `both rows start on the first screen, no scrolling (notices at ${Math.round(notices.headingTop)}px, blog at ${Math.round(posts.headingTop)}px, screen 844px)`);
    ok(posts.pictures === 'yes', 'the blog row is pictures');
    ok(notices.pictures === 'no' && notices.cardHeight < posts.cardHeight,
       `and a row of words stays short (${Math.round(notices.cardHeight)}px against ${Math.round(posts.cardHeight)}px)`);
    ok(!(posts.titles || []).some((t) => /Notes for Sabbath/.test(t)), 'a draft is never on the board');

    // The pictures are real pictures, not broken-image boxes. They load as
    // they come into view, so the row is swiped to its end first, the way a
    // person would, and each is given a few seconds.
    const strip = page.locator('[data-home-board="posts"] ul');
    await strip.evaluate((el) => el.scrollTo({ left: el.scrollWidth }));
    await page.waitForTimeout(800);
    const pictures = await page.locator('[data-home-board="posts"] img').evaluateAll((imgs) => Promise.all(imgs.map((img) => (
      img.complete ? Promise.resolve() : Promise.race([
        new Promise((r) => { img.onload = r; img.onerror = r; }),
        new Promise((r) => setTimeout(r, 4000)),
      ])
    ))).then(() => imgs.map((img) => ({ src: img.getAttribute('src'), w: img.naturalWidth, alt: img.alt }))));
    await strip.evaluate((el) => el.scrollTo({ left: 0 }));
    ok(pictures.length >= 3 && pictures.every((p) => p.w > 0),
       `every cover picture loads (${pictures.map((p) => `${p.src} ${p.w}px`).join(', ')})`);
    ok(pictures.every((p) => p.alt.length > 10), 'and each says what it shows, for somebody who cannot see it');

    // Sideways for the row, never for the page.
    const scroll = await page.evaluate(() => {
      const strip = document.querySelector('[data-home-board="posts"] ul');
      return { row: strip.scrollWidth - strip.clientWidth, page: document.documentElement.scrollWidth - innerWidth };
    });
    ok(scroll.row > 40, `the blog row swipes sideways (${scroll.row}px more to see)`);
    ok(scroll.page <= 0, `and the page itself does not (${scroll.page}px)`);

    // ---- Open a post. ----
    const park = page.locator('[data-home-board="posts"] [data-board-card]', { hasText: 'park clean-up' });
    await park.click();
    const sheet = page.locator('[data-board-reader] [role="dialog"]');
    await sheet.waitFor({ timeout: 5_000 });
    const opened = await sheet.evaluate((el) => ({
      text: el.innerText,
      picture: [...el.querySelectorAll('img')].some((i) => i.naturalWidth > 0 || !i.complete),
      focus: document.activeElement && document.activeElement.getAttribute('aria-label'),
      locked: getComputedStyle(document.body).overflow,
    }));
    ok(/Thank you to everybody who came to the park clean-up/.test(opened.text) && /stayed for an hour/.test(opened.text),
       'the card opens the whole post: title and every word');
    ok(/David Cruz/.test(opened.text), 'with who wrote it');
    ok(opened.picture, 'and its picture');
    ok(opened.focus === 'Close', `the keyboard lands on Close (${opened.focus})`);
    ok(opened.locked === 'hidden', 'Home stays still under the open post');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    ok(await page.locator('[data-board-reader]').count() === 0, 'Escape closes it');
    ok(await page.evaluate(() => getComputedStyle(document.body).overflow) !== 'hidden', 'and Home scrolls again');

    // ---- A dark look. ----
    await page.evaluate(() => localStorage.setItem('beacon-ui-theme', 'focus'));
    await openHome(page);
    const ink = await page.locator('[data-home-board="notices"] [data-board-card]').first().evaluate((card) => {
      let ground = 'rgba(0, 0, 0, 0)';
      for (let el = card; el && /rgba\(0, 0, 0, 0\)|transparent/.test(ground); el = el.parentElement) ground = getComputedStyle(el).backgroundColor;
      const title = card.querySelector('.text-navy');
      return { ground, title: getComputedStyle(title).color };
    });
    const contrast = ratio(rgb(ink.title), rgb(ink.ground));
    ok(contrast >= 4.5, `in Focus, a card's title reads at ${contrast.toFixed(1)}:1 (${ink.title} on ${ink.ground})`);
    await page.evaluate(() => localStorage.removeItem('beacon-ui-theme'));

    // ---- Its writer sees that it was read. ----
    await signIn(page, BASE, 'David Cruz');
    await page.goto(`${BASE}/church?room=blogs`, { waitUntil: 'networkidle' });
    const desk = page.locator('article', { hasText: 'park clean-up' }).first();
    await desk.waitFor({ timeout: 10_000 });
    ok(/\b1 reader\b/.test(await desk.innerText()), 'opening it from Home counted: its writer sees 1 reader');

    await context.close();

    // ---- On a computer, the arrows move the row. ----
    const wide = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await wide.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    const desktop = await wide.newPage();
    await signIn(desktop, BASE, 'John Reyes');
    await openHome(desktop);
    const row = desktop.locator('[data-home-board="posts"] ul');
    const before = await row.evaluate((el) => el.scrollLeft);
    await desktop.getByRole('button', { name: /On through .*From the blog/ }).click();
    await desktop.waitForTimeout(700);
    const after = await row.evaluate((el) => el.scrollLeft);
    ok(after > before + 100, `the arrow moves the blog row on (${before}px to ${after}px)`);
    await wide.close();
  } finally {
    await browser.close();
  }
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
