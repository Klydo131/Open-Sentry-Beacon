// In a conversation, your bubbles and theirs can be told apart in every look,
// and the box you write in lines up with the buttons beside it.
//
// Asked for on 7 October 2026, with a photograph of the composer in a dark
// look: "The chat box is still not aesthetically organize or align, and I
// can't distinguished the bubble if I am the one talking or the other account.
// Can we have the white and blue as the standard bubbles? (also create an
// alternative for dark themes in all UI themes)".
//
// WHAT WAS WRONG, MEASURED ON A PHONE. Under Focus both bubbles were
// rgb(27, 48, 73), and under Aero dark both were rgb(22, 50, 87): one colour.
// In the light looks they were a pale teal and a pale peach. And the writing
// box sat 8px above the paperclip and the send button, because a textarea is
// inline and leaves a line's descender gap under itself.
//
//   node tests/e2e/whose-words-are-whose.js [port]

const { browser: engine, launchOptions, openChat } = require('./_playwright');
const { signIn } = require('./_looks');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const rgb = (v) => (v.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const lum = (c) => c.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
  .reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

(async () => {
  const browser = await engine.launch(launchOptions);
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await context.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    const page = await context.newPage();
    await signIn(page, BASE, 'Maria Santos');

    await page.goto(`${BASE}/settings?room=general`, { waitUntil: 'networkidle' });
    const looks = await page.locator('[data-ui-theme-choice]').evaluateAll((els) => els.map((el) => el.getAttribute('data-ui-theme-choice')));

    // A conversation with both sides in it: the sample thread has John's
    // words, and one of Maria's is added.
    await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
    await page.locator('[data-quest="seeker-card"]').first().click();
    await page.waitForURL(/\/dm\/.+/);
    await openChat(page);
    await page.locator('[data-quest="chat-send"] textarea[aria-label="Message"]').fill('See you on Sabbath.');
    await page.locator('[data-quest="chat-send"]').getByRole('button', { name: /^Send$/ }).click();
    await page.waitForTimeout(700);
    const where = page.url();

    for (const look of looks) {
      await page.evaluate((l) => localStorage.setItem('beacon-ui-theme', l), look);
      await page.goto(where, { waitUntil: 'networkidle' });
      if (!(await page.locator('[data-quest="chat-send"]').count())) await openChat(page);
      await page.locator('[data-chat-entry][data-mine="true"]').first().waitFor({ timeout: 10_000 });
      const seen = await page.evaluate(() => {
        const paint = (el) => el && { bg: getComputedStyle(el).backgroundColor, ink: getComputedStyle(el).color };
        const mine = paint(document.querySelector('[data-chat-entry][data-mine="true"] [data-bubble] > div'));
        const theirs = paint(document.querySelector('[data-chat-entry]:not([data-mine]) [data-bubble] > div'));
        const box = (sel) => document.querySelector(sel)?.getBoundingClientRect();
        const field = box('[data-quest="chat-send"] textarea');
        const send = box('[data-quest="chat-send"] [data-composer-action]');
        const attach = box('[data-attach]');
        return { mine, theirs, fieldBottom: field?.bottom, sendBottom: send?.bottom, attachBottom: attach?.bottom,
          dark: getComputedStyle(document.documentElement).colorScheme.includes('dark') };
      });
      const m = rgb(seen.mine.bg), t = rgb(seen.theirs.bg);
      const blue = m[2] > m[0] + 60 && m[2] > m[1] + 30;
      const apart = ratio(m, t);
      ok(blue && apart >= 1.5 && ratio(rgb(seen.mine.ink), m) >= 4.5 && ratio(rgb(seen.theirs.ink), t) >= 4.5
           && (seen.dark ? lum(t) < 0.1 : t.every((v) => v >= 250)),
         `${look}: yours ${seen.mine.bg}, theirs ${seen.theirs.bg} (${seen.dark ? 'dark' : 'white'}), ${apart.toFixed(1)}:1 apart, each one's writing 4.5:1 or better`);
      ok(Math.abs(seen.fieldBottom - seen.sendBottom) <= 1 && Math.abs(seen.attachBottom - seen.sendBottom) <= 1,
         `${look}: the writing box, the paperclip and send share one line (bottoms ${seen.fieldBottom}, ${seen.attachBottom}, ${seen.sendBottom})`);
    }
    await context.close();
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
