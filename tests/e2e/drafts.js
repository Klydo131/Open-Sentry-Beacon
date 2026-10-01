// An unsent message waits for you, and disappears when you delete it.
//
// The three things this proves, in a real browser:
//
//   1. Type, leave the conversation, come back — the text is still there.
//   2. Delete every character — the draft is gone, and stays gone.
//   3. A draft written to ONE person never appears in the box open to another.
//
// The third is the one with consequences. A single shared storage key would put
// half a message meant for one Explorer into the composer open to a different
// one, and in this app that is not a glitch, it is a disclosure. It is also
// exactly the bug the obvious implementation has for one render after switching
// conversations, which is why useDraft keeps the text and its key together.
//
//   npm run build && node scripts/run-next.mjs start -p 4360
//   node tests/e2e/drafts.js 4360

const { chromium, launchOptions, openChat } = require('./_playwright');
const PORT = process.argv[2] || '4360';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const DRAFT_A = 'Thinking about what you said on Sabbath, and I wanted to ask';
const DRAFT_B = 'A completely different note for somebody else entirely';

const box = (page) => page.locator('[data-quest="chat-send"] textarea').first();

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const maria = page.getByText(/Maria Santos/i).first();
  if (await maria.count()) await maria.click();
  await page.waitForTimeout(1400);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) await consent.first().click().catch(() => {});
  await page.waitForTimeout(600);
}

/** Open the seeker room at `index` on the Guide's list. Returns its URL. */
async function openRoom(page, index) {
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const cards = page.locator('[data-quest="seeker-card"]');
  const n = await cards.count();
  if (n <= index) return null;
  await cards.nth(index).click();
  await page.waitForTimeout(1500);
  // The conversation is in the Talk bubble (30 September 2026); Message opens it.
  await openChat(page);
  return page.url();
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const page = await context.newPage();

  await signIn(page);

  const roomA = await openRoom(page, 0);
  ok(Boolean(roomA) && (await box(page).count()) > 0, 'the first conversation opens with a composer');
  if (!roomA) { console.log('\nRESULT: cannot continue'); await browser.close(); process.exit(1); }

  // ---- 1. A draft survives leaving and coming back -------------------------
  await box(page).fill(DRAFT_A);
  await page.waitForTimeout(600); // outlast the 300ms debounce

  await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.goto(roomA, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await openChat(page);

  ok(await box(page).inputValue() === DRAFT_A,
     'the draft is still in the box after leaving and coming back');

  // ---- 2. It survives a full reload, not just client-side navigation -------
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await openChat(page);
  ok(await box(page).inputValue() === DRAFT_A, 'the draft survives a reload');

  // ---- 3. A draft belongs to ONE conversation ------------------------------
  const roomB = await openRoom(page, 1);
  if (roomB && roomB !== roomA) {
    const leaked = await box(page).inputValue();
    ok(leaked === '',
       `the second conversation opens EMPTY, not holding the first one's draft (found: ${JSON.stringify(leaked.slice(0, 40))})`);

    // And a draft written here stays here.
    await box(page).fill(DRAFT_B);
    await page.waitForTimeout(600);

    await page.goto(roomA, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await openChat(page);
    ok(await box(page).inputValue() === DRAFT_A,
       'going back to the first conversation shows ITS draft, not the second one');

    await page.goto(roomB, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await openChat(page);
    ok(await box(page).inputValue() === DRAFT_B,
       'and the second conversation still has its own');

    // Tidy up so the deletion test below is unambiguous.
    await box(page).fill('');
    await page.waitForTimeout(600);
  } else {
    console.log('--  only one conversation in the sample data; isolation not exercised');
  }

  // ---- 4. Deleting every character removes the draft -----------------------
  await page.goto(roomA, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await openChat(page);
  ok(await box(page).inputValue() === DRAFT_A, 'the draft is there before deleting it');

  await box(page).fill('');
  await page.waitForTimeout(600);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await openChat(page);
  ok(await box(page).inputValue() === '', 'after deleting all the text the draft is gone');

  // Whitespace is not a draft either — select-all-and-type-space is a delete.
  await box(page).fill('   ');
  await page.waitForTimeout(600);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await openChat(page);
  ok(await box(page).inputValue() === '', 'a box holding only spaces is not kept as a draft');

  // ---- 5. Sending clears the draft ----------------------------------------
  await box(page).fill('This one actually gets sent.');
  await page.waitForTimeout(600);
  await page.locator('[data-quest="chat-send"] button[type="submit"]').first().click();
  await page.waitForTimeout(1200);

  ok(await box(page).inputValue() === '', 'the box is empty straight after sending');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await openChat(page);
  ok(await box(page).inputValue() === '',
     'and the sent message is not left behind as a draft');

  // ---- 6. Nothing was written to the shared store --------------------------
  // Drafts are for this device only. If one ever reached the app's own data it
  // would be readable by the other side of the conversation.
  const inAppData = await page.evaluate(() => {
    const out = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (!k || k.startsWith('hb-draft:')) continue;
      const v = localStorage.getItem(k) || '';
      if (v.includes('Thinking about what you said on Sabbath')) out.push(k);
    }
    return out;
  });
  ok(inAppData.length === 0,
     `the draft text is not in any non-draft store (found in: ${inAppData.join(', ') || 'nothing'})`);

  await browser.close();
  console.log(`\n${bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILED`}`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
