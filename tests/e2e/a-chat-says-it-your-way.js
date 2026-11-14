// A chat can say it your way: emoji you pick, stickers, an effect, a look.
//
// Asked for on 14 November 2026 (lib/talk/expression.ts). This walks the
// sample conversation in a real browser and checks what a person would see:
//
//   * the smiling face opens a panel between the thread and the message bar,
//     and the bar's form still holds exactly one text box and one button;
//   * an emoji is ADDED to what is being written and nothing is sent;
//   * a sticker goes at once and is drawn as a sticker, not as its words;
//   * an effect is named above the bar, travels with the next message, plays
//     once and can be played again from the message;
//   * a colour and a ground change only this side, with ink that reads, and
//     are still there after a reload;
//   * a reaction from behind "More" lands on the message;
//   * nothing scrolls sideways at a phone's width.
//
//   npm run build && node scripts/run-next.mjs start -p 4391
//   node tests/e2e/a-chat-says-it-your-way.js 4391

const { chromium, launchOptions, openChat, isCancelledPrefetch } = require('./_playwright');
const PORT = process.argv[2] || '4391';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function signInAsMaria(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const maria = page.getByText(/Maria Santos/i).first();
  if (await maria.count()) await maria.click();
  await page.waitForTimeout(1400);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) { await consent.first().click().catch(() => {}); await page.waitForTimeout(600); }
}

async function openConversation(page) {
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const card = page.locator('[data-quest="seeker-card"]').first();
  if (await card.count()) { await card.click(); await page.waitForTimeout(1600); }
  await openChat(page);
  await page.waitForTimeout(400);
}

/** Contrast of two #rrggbb / rgb() colours, as WCAG measures it. */
function contrast(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

async function walk(browser, viewport, shots) {
  const tag = `${viewport.width}px`;
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  // A page preload cut short by moving on is not an error (tests/e2e/_playwright.js).
  page.on('pageerror', (e) => { if (!isCancelledPrefetch(e.message)) errors.push(e.message); });
  // Script errors only: a missing file is the server's business, not this walk's.

  await signInAsMaria(page);
  await openConversation(page);
  const form = page.locator('[data-quest="chat-send"]');
  ok((await form.count()) > 0, `${tag}: the conversation opens`);

  // --- The panel ---
  await page.locator('[data-expression]').click();
  await page.waitForTimeout(300);
  ok(await page.locator('[data-expression-panel]').isVisible(), `${tag}: the smiling face opens the panel`);
  ok((await form.locator('textarea').count()) === 1 && (await form.locator('button').count()) === 1,
    `${tag}: the form still holds exactly one text box and one button`);
  const small = await page.locator('[data-pick-emoji]').evaluateAll((els) =>
    els.filter((e) => e.getBoundingClientRect().height < 43.5 || e.getBoundingClientRect().width < 43.5).length);
  ok(small === 0, `${tag}: every emoji is at least 44px to tap (${small} smaller)`);

  // --- Emoji: added, not sent ---
  const before = await page.locator('[data-chat-entry]').count();
  await form.locator('textarea').fill('Praise God');
  await page.locator('[data-pick-emoji]', { hasText: '🙌' }).first().click();
  ok((await form.locator('textarea').inputValue()) === 'Praise God🙌', `${tag}: an emoji is added to what is being written`);
  ok((await page.locator('[data-chat-entry]').count()) === before, `${tag}: and nothing is sent by picking one`);

  // --- An effect on the next message ---
  await page.getByRole('tab', { name: 'Effects' }).click();
  await page.locator('[data-pick-effect="confetti"]').click();
  ok(await page.locator('[data-composer-effect="confetti"]').isVisible(), `${tag}: the bar says the next message arrives with confetti`);
  await form.getByRole('button', { name: /^Send$/ }).click();
  await page.waitForTimeout(500);
  ok((await page.locator('[data-celebration="confetti"]').count()) === 1, `${tag}: the effect plays as the message arrives`);
  ok((await page.locator('[data-composer-effect]').count()) === 0, `${tag}: and is not kept for the message after`);
  const badge = page.locator('[data-message-effect="confetti"]').last();
  ok(await badge.isVisible(), `${tag}: the message carries what it was sent with`);
  await page.waitForTimeout(3200);
  ok((await page.locator('[data-celebration]').count()) === 0, `${tag}: the effect ends by itself`);
  await badge.click();
  await page.waitForTimeout(300);
  ok((await page.locator('[data-celebration="confetti"]').count()) === 1, `${tag}: and plays again when asked`);
  await page.waitForTimeout(3000);

  // --- A sticker ---
  await page.getByRole('tab', { name: 'Stickers' }).click();
  await page.locator('[data-pick-sticker="Praying for you"]').click();
  await page.waitForTimeout(700);
  const last = page.locator('[data-chat-entry]').last();
  ok((await last.locator('[data-sticker="Praying for you"]').count()) === 1, `${tag}: a sticker is sent at once and drawn as a sticker`);
  ok(!/\[sticker:/.test(await last.innerText()), `${tag}: its travelling words are not shown`);
  if (shots) await page.screenshot({ path: `${shots}/chat-stickers-${viewport.width}.png` });

  // --- A reaction from behind More ---
  await page.locator('[data-chat-entry="message"] [data-bubble]').last().click();
  await page.waitForTimeout(400);
  await page.locator('[data-more-reactions]').click();
  await page.locator('[data-react="Celebrate"]').click();
  await page.waitForTimeout(600);
  ok(/🎉/.test(await page.locator('[data-reactions]').last().innerText()), `${tag}: a reaction from behind More lands on the message`);

  // --- The look ---
  await page.getByRole('tab', { name: 'Look' }).click();
  await page.locator('[data-pick-colour="violet"]').click();
  await page.locator('[data-pick-paper="dawn"]').click();
  await page.waitForTimeout(300);
  const mine = page.locator('[data-mine="true"] .bubble-mine').last();
  const paint = await mine.evaluate((el) => { const s = getComputedStyle(el); return { ground: s.backgroundColor, ink: s.color }; });
  ok(paint.ground === 'rgb(109, 40, 217)', `${tag}: my messages take the colour I chose (${paint.ground})`);
  ok(contrast(paint.ground, paint.ink) >= 4.5, `${tag}: and the words on it read (${contrast(paint.ground, paint.ink).toFixed(1)}:1)`);
  ok((await page.locator('[data-live-thread]').getAttribute('data-chat-paper')) === 'dawn', `${tag}: the ground behind the chat changes`);
  if (shots) await page.screenshot({ path: `${shots}/chat-look-${viewport.width}.png` });

  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(sideways <= 0, `${tag}: nothing scrolls sideways (${sideways}px)`);

  // --- Kept on this device ---
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await openChat(page);
  await page.waitForTimeout(600);
  ok((await page.locator('[data-live-thread]').getAttribute('data-chat-colour')) === 'violet', `${tag}: the look is still there after a reload`);
  ok((await page.locator('[data-celebration]').count()) === 0, `${tag}: opening an old conversation plays nothing`);

  ok(errors.length === 0, `${tag}: no script errors${errors.length ? `: ${errors[0]}` : ''}`);
  await context.close();
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const shots = process.env.SHOTS || '';
  await walk(browser, { width: 390, height: 844 }, shots);
  await walk(browser, { width: 820, height: 1180 }, shots);
  await walk(browser, { width: 1366, height: 900 }, shots);

  // Less motion asked for: the words, and nothing that moves.
  const calm = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await calm.newPage();
  await signInAsMaria(page);
  await openConversation(page);
  await page.locator('[data-expression]').click();
  await page.getByRole('tab', { name: 'Stickers' }).click();
  await page.locator('[data-pick-sticker="Amen!"]').click();
  await page.waitForTimeout(600);
  const moving = await page.locator('[data-chat-entry] [data-sticker]').last()
    .evaluate((el) => getComputedStyle(el).animationName);
  ok(moving === 'none', `less motion: a sticker does not move (${moving})`);
  await calm.close();

  await browser.close();
  console.log(bad === 0 ? '\nAll chat expression checks passed.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
