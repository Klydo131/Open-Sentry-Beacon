// The Talk bubble has one scroll, and it is the messages.
//
// ---------------------------------------------------------------------------
// REPORTED WITH A SCREENSHOT SHOWING BOTH SCROLLBARS: "this bubble 'talk'
// should be the WHOLE chat feature with only one scroll, the scroll should be
// the messages only right? Like a normal chat feature would be" -- and then a
// picture of Messenger, which is the shape being asked for.
//
// WHAT WAS WRONG. globals.css caps the conversation card at the height of the
// SCREEN less the page chrome. That is right when the conversation is the page.
// The bubble is a 32rem panel with a height of its own, and a cap far larger
// than its container does nothing -- so the card grew to fit its content, the
// panel scrolled the card, and the thread scrolled inside that. The composer
// and the photo note travelled up and down with the messages, which is the one
// thing a chat window must never do.
//
// WHY THIS IS MEASURED AND NOT GREPPED. The fix is two CSS rules and a
// conditional class, and every one of those can be present while the geometry
// is still wrong -- which is exactly how the fixed-height version survived. A
// scrollport is a fact about a rectangle: scrollHeight greater than
// clientHeight. So count them.
//
//   npm run build && node scripts/run-next.mjs start -p 4399
//   node tests/e2e/the-bubble-has-one-scroll.js 4399
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4399';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const SCREENS = [
  ['a phone, upright', 412, 915],
  ['iPhone SE, upright', 375, 667],
  ['a desktop window', 1280, 800],
];

(async () => {
  const browser = await chromium.launch(launchOptions);

  for (const [label, w, h] of SCREENS) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 700 });
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const m = await page.evaluate(() => {
      document.querySelectorAll('[data-bubble-probe]').forEach((n) => n.remove());

      // The panel the bubble opens, at the size the component gives it.
      const panel = document.createElement('div');
      panel.setAttribute('data-bubble-probe', '');
      panel.className = 'talk-sheet flex flex-col overflow-hidden bg-white';
      panel.style.position = 'fixed';
      panel.style.right = '0';
      panel.style.bottom = '0';
      panel.style.width = window.innerWidth >= 1280 ? '22rem' : '100%';
      panel.style.height = window.innerWidth >= 1280 ? '32rem' : '100%';

      const head = document.createElement('div');
      head.style.flex = '0 0 auto';
      head.style.height = '44px';
      head.textContent = 'Talk';

      // The region TalkSurface gives a conversation: definite height, no scroll.
      const region = document.createElement('div');
      region.className = 'flex min-h-0 flex-1 flex-col overflow-hidden';

      const card = document.createElement('div');
      card.setAttribute('data-live-conversation', '');
      card.className = 'overflow-hidden';

      const heading = document.createElement('div');
      heading.style.height = '48px';
      const thread = document.createElement('div');
      thread.setAttribute('data-live-thread', '');
      thread.style.overflowY = 'auto';
      for (let i = 0; i < 60; i += 1) {
        const line = document.createElement('p');
        line.style.height = '40px';
        line.textContent = `message ${i}`;
        thread.append(line);
      }
      const note = document.createElement('div');
      note.style.height = '52px';
      const composer = document.createElement('div');
      composer.setAttribute('data-live-composer', '');
      composer.style.height = '64px';

      card.append(heading, thread, note, composer);
      region.append(card);
      panel.append(head, region);
      (document.querySelector('main') || document.body).append(panel);

      const scrolls = (el) => el.scrollHeight - el.clientHeight > 1;
      const all = [panel, region, card, thread];
      const scrolling = all.filter(scrolls).length;

      const p = panel.getBoundingClientRect();
      const c = composer.getBoundingClientRect();
      return {
        panelScrolls: scrolls(panel),
        regionScrolls: scrolls(region),
        cardScrolls: scrolls(card),
        threadScrolls: scrolls(thread),
        scrolling,
        composerInsidePanel: c.bottom <= p.bottom + 1 && c.top >= p.top - 1,
        threadHeight: Math.round(thread.getBoundingClientRect().height),
      };
    });

    // THE ONE THAT MATTERS.
    ok(m.scrolling === 1,
      `${label}: exactly one thing scrolls (${m.scrolling})`);
    ok(m.threadScrolls,
      `${label}: and it is the messages`);
    ok(!m.panelScrolls,
      `${label}: the panel itself does not scroll`);
    ok(!m.cardScrolls,
      `${label}: nor the conversation card`);
    ok(m.composerInsidePanel,
      `${label}: the box you type in stays inside the bubble`);
    ok(m.threadHeight > 80,
      `${label}: and the messages still have room (${m.threadHeight}px)`);

    // AND THIS IS NOT PASSING BY ACCIDENT. Put the app back the way it was --
    // the card capped against the VIEWPORT rather than filling its panel, and
    // the region around it scrolling -- and the second scrollport must reappear.
    //
    // THE FIRST VERSION OF THIS BREAK ONLY REVERTED THE CSS, and reported the
    // rule as doing nothing. It was right to: the probe pins the region to
    // `overflow: hidden`, so with that half still in place a card too tall for
    // its panel is merely CLIPPED, and nothing scrolls. A break that only undoes
    // half a two-part fix measures a state that never existed. Both halves go
    // back, which is the arrangement actually reported.
    const broken = await page.evaluate(() => {
      const card = document.querySelector('[data-bubble-probe] [data-live-conversation]');
      const region = card.parentElement;
      const panel = document.querySelector('[data-bubble-probe]');
      // All three parts of the old arrangement, or the break measures a state
      // that never shipped. As a FLEX CHILD the card stretches to its region and
      // the thread absorbs the excess, so a cap alone changes nothing; the
      // region has to be an ordinary scrolling block again, which is what it
      // was.
      region.style.display = 'block';
      card.style.height = 'auto';
      card.style.maxHeight = '100dvh';
      region.style.overflowY = 'auto';
      const scrolls = (el) => el.scrollHeight - el.clientHeight > 1;
      return [panel, region, card].filter(scrolls).length;
    });
    ok(broken > 0,
      `${label}: and the rule is load-bearing (${broken} scroll back when it is removed)`);

    await context.close();
  }

  await browser.close();
  console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})();
