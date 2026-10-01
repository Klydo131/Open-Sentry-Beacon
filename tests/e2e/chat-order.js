// A conversation must read in the order it happened.
//
// THE BUG THIS EXISTS TO CATCH. Chat.tsx rendered the thread in two passes —
// every message, then every attachment — so a file always appeared at the very
// bottom however long ago it was sent. A Guide attached a study sheet, the
// Explorer replied, and the reply drew ABOVE the attachment while the
// timestamps underneath said the opposite.
//
// The one assertion that matters is the middle one: a file sent BEFORE a
// message has to appear ABOVE it. Under the old code that is exactly what could
// never happen, so this suite fails against it — checked by reverting the
// component and running this, not by assuming.
//
//   npm run build && node scripts/run-next.mjs start -p 4340
//   node tests/e2e/chat-order.js 4340

const { chromium, launchOptions, openChat } = require('./_playwright');
const PORT = process.argv[2] || '4340';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function signInAsMaria(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const maria = page.getByText(/Maria Santos/i).first();
  if (await maria.count()) await maria.click();
  await page.waitForTimeout(1400);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
}

async function openFirstSeekerRoom(page) {
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const card = page.locator('[data-quest="seeker-card"]').first();
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(1600);
  }
  // The conversation is in the Talk bubble (30 September 2026); Message opens it.
  await openChat(page);
  return page.locator('[data-quest="chat-send"]').count();
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  const page = await context.newPage();

  await signInAsMaria(page);
  ok((await openFirstSeekerRoom(page)) > 0, 'the conversation opens');

  const send = async (body) => {
    await page.locator('[data-quest="chat-send"] textarea[aria-label="Message"]').fill(body);
    await page.locator('[data-quest="chat-send"]').getByRole('button', { name: /^Send$/ }).click();
    // Long enough for the store to write and re-render, short enough that four
    // of these do not dominate the run.
    await page.waitForTimeout(700);
  };

  const attach = async (name) => {
    await page.locator('input[type="file"]').first().setInputFiles({
      name, mimeType: 'image/png', buffer: PNG,
    });
    // Attaching writes bytes to IndexedDB before the row appears.
    await page.waitForTimeout(1800);
  };

  // Alternating on purpose. Two messages then two files would still pass under
  // the old two-pass render, which is how a bug like this survives a test.
  await send('FIRST message');
  await attach('second-file.png');
  await send('THIRD message');
  await attach('fourth-file.png');

  // Each entry's words AND its labels: a picture shows as the picture, and its
  // name is only in "Open the picture <name>" (1 October 2026).
  const entries = await page.locator('[data-chat-entry]').evaluateAll((nodes) => nodes.map((n) =>
    [n.innerText, ...[...n.querySelectorAll('[aria-label]')].map((e) => e.getAttribute('aria-label'))].join('\n')));
  const text = entries.join('\n');
  console.log('\n--- rendered order ---');
  entries.forEach((e, i) => console.log(`${i + 1}. ${e.split('\n')[0]}`));
  console.log('----------------------\n');

  const at = (needle) => entries.findIndex((e) => e.includes(needle));
  const first = at('FIRST message');
  const second = at('second-file.png');
  const third = at('THIRD message');
  const fourth = at('fourth-file.png');

  ok(first >= 0 && second >= 0 && third >= 0 && fourth >= 0,
    `all four entries rendered (indexes ${first}, ${second}, ${third}, ${fourth})`);

  ok(first < second, 'a message sent first draws above a file attached after it');

  // THE ONE THAT CATCHES THE BUG. Under the two-pass render every file was
  // forced below every message, so this could not hold.
  ok(second < third, 'A FILE ATTACHED BEFORE A MESSAGE DRAWS ABOVE THAT MESSAGE');

  ok(third < fourth, 'the second file draws below the message that preceded it');

  // Each entry carries its own sender and time. A file that lost its footer
  // would read as belonging to whoever spoke last.
  ok(/You/.test(text), 'entries are attributed to a sender');

  await browser.close();
  console.log(bad === 0 ? '\nAll conversation-order checks passed.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
