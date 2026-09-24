// Asking for prayer, and somebody answering.
//
// WHY THIS IS A ROUND TRIP AND NOT A FORM TEST. Asking for prayer is the most
// exposed thing an Explorer does in this app. The failure that matters is not
// "the textarea does not submit" — it is that the request goes in, is stored
// correctly, and NOBODY EVER SEES IT. That is exactly what was happening: the
// request landed on the Care tab of one person's page, and a Guide had to open
// each Explorer in turn and click a third tab to discover anybody had asked.
//
// So the suite follows one request all the way round: Explorer sends it, the
// Guide is told without having to go looking, the Guide responds, and the
// Explorer sees that somebody is praying.
//
//   npm run build && node scripts/run-next.mjs start -p 4381
//   node tests/e2e/prayer.js 4381

const { chromium, launchOptions, openRoom } = require('./_playwright');
const PORT = process.argv[2] || '4381';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

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

// NOT the sample church's own request. It used to be the same sentence as one
// already in the seed, already marked as being prayed for, so every "is it
// there" and "is it being prayed for" below could pass without the request
// ever being sent -- found when a deliberately broken build passed them.
const REQUEST = 'Please pray for my sister, she starts a new job on Monday.';

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
  const page = await context.newPage();

  // ---- An Explorer asks --------------------------------------------------
  await signInAs(page, /John/i);
  await page.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  ok(await page.getByText('🙏 Prayer').count() > 0, 'the Explorer has a prayer card');

  // Prayer is a room now, not a stretch of the same scroll, so the card is not
  // rendered until its tab is the chosen one.
  await openRoom(page, /Prayer/i);

  const box = page.locator('textarea[placeholder*="pray with you"]');
  ok(await box.count() > 0, 'there is somewhere to write the request');
  await box.fill(REQUEST);

  const send = page.locator('[data-quest="ds-prayer"]');
  ok(!(await send.isDisabled()), 'the send button wakes up once something is written');
  await send.click();
  await page.waitForTimeout(1200);

  ok(await page.locator('[data-my-prayer]', { hasText: REQUEST.slice(0, 24) }).count() === 1,
    'the request appears in the Explorer\'s own list straight away');

  // ---- The Guide is told, WITHOUT having to go looking --------------------
  await signInAs(page, /Maria Santos/i);
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);

  // THE ONE THAT CAUGHT THE BUG. Before this, the Explorer list said nothing
  // at all about prayer, so a request could sit unseen indefinitely.
  ok(/asked for prayer/i.test(await page.locator('body').innerText()),
    'THE GUIDE\'S EXPLORER LIST SHOWS WHO HAS ASKED FOR PRAYER');

  const card = page.locator('[data-quest="seeker-card"]').first();
  if (await card.count()) { await card.click(); await page.waitForTimeout(1600); }

  const care = page.locator('button', { hasText: /^\s*(🤲\s*)?Care/ }).first();
  ok(await care.count() > 0, 'the Care tab exists');
  await care.click();
  await page.waitForTimeout(1300);

  ok(new RegExp(REQUEST.slice(0, 24), 'i').test(await page.locator('body').innerText()),
    'the Guide can read the request');

  const praying = page.getByRole('button', { name: /praying/i }).first();
  ok(await praying.count() > 0, 'the Guide can say they are praying');
  await praying.click();
  await page.waitForTimeout(1200);
  // THIS request, not the page. The sample church already has a request being
  // prayed for, so "somewhere on the page says so" passed with the button
  // broken.
  const sentRequest = page.locator('[data-prayer-request]', { hasText: REQUEST.slice(0, 24) });
  ok(await sentRequest.count() === 1 && /being prayed for/i.test(await sentRequest.innerText()),
    'the request is marked as being prayed for');

  // ---- The Explorer finds out ---------------------------------------------
  // The point of the whole feature. Somebody said the most vulnerable thing
  // they will say in this app; they have to learn that it was heard.
  await signInAs(page, /John/i);
  await page.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  await openRoom(page, /Prayer/i);
  const mineNow = page.locator('[data-my-prayer]', { hasText: REQUEST.slice(0, 24) });
  ok(await mineNow.count() === 1 && /being prayed for/i.test(await mineNow.innerText()),
    'THE EXPLORER SEES THAT SOMEBODY IS PRAYING FOR THEM');

  // ---- The church wall, anonymously ---------------------------------------
  await page.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  ok(await page.getByText('🙏 Prayer wall').count() > 0, 'the church has a prayer wall');

  // Scoped to the wall itself, not "everything below the heading". The first
  // version of this split the whole page on the heading and searched the rest,
  // which picked up the members further down the page and reported a leak that
  // was not one. The wall is the div that owns the heading.
  const wallBox = page.locator('div').filter({ has: page.getByText('🙏 Prayer wall') }).last();
  const wallText = await wallBox.innerText();
  ok(/pray/i.test(wallText), 'the wall is showing requests');

  // Every Explorer's name in the demo, checked against the wall's own text.
  // "Shared anonymously, no names" is a promise the screen makes in writing,
  // and it is the whole reason anybody ticks that box.
  const names = ['John', 'Grace', 'Anna', 'Marci'];
  const leaked = names.filter((n) => new RegExp(`\\b${n}\\b`).test(wallText));
  ok(leaked.length === 0,
    `NO ASKER'S NAME APPEARS ON THE PRAYER WALL${leaked.length ? ` (found ${leaked.join(', ')})` : ''}`);

  // ---- And the other way: the Guide asks ---------------------------------
  // "Can we make a feature where both Guide and Explorer can pray [for] each
  // other." The same round trip, reversed: the Guide asks, the Explorer is the
  // one who reads it and answers, and the Guide learns that somebody is
  // praying. Plus the two things a new route between two people needs: a way
  // to report it from where it is read, and it going nowhere else.
  const GUIDE_ASK = 'Please pray for my father, his surgery is on Friday.';

  await signInAs(page, /Maria Santos/i);
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  const johnCard = page.locator('[data-quest="seeker-card"]', { hasText: 'John' }).first();
  await johnCard.click();
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: /^\s*(🤲\s*)?Care/ }).first().click();
  await page.waitForTimeout(1100);

  const askBox = page.getByLabel(/What would you like John to pray for/i);
  ok(await askBox.count() > 0, 'the Guide has somewhere to ask John to pray for them');
  await askBox.fill(GUIDE_ASK);
  await page.getByRole('button', { name: /^Ask John$/ }).click();
  await page.waitForTimeout(900);
  const sent = page.locator('[data-my-ask]', { hasText: GUIDE_ASK.slice(0, 24) });
  ok(await sent.count() === 1, 'the Guide sees what they asked, once');

  await signInAs(page, /John/i);
  await page.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await openRoom(page, /Prayer/i);
  const askCard = page.locator('[data-asked-by-guide]', { hasText: GUIDE_ASK.slice(0, 24) });
  ok(await askCard.count() === 1, 'THE EXPLORER CAN READ WHAT THEIR GUIDE ASKED');
  ok(/Maria asked you to pray for them/i.test(await askCard.innerText()),
    'and it says who asked');
  ok(await askCard.getByRole('button', { name: /^Report$/ }).count() === 1,
    'the Explorer can report it from the request itself');
  await askCard.getByRole('button', { name: /I am praying for this/i }).click();
  await page.waitForTimeout(900);
  ok(/You told Maria you are praying/i.test(await askCard.innerText()),
    'the Explorer can say they are praying for their Guide');

  await signInAs(page, /Maria Santos/i);
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  await page.locator('[data-quest="seeker-card"]', { hasText: 'John' }).first().click();
  await page.waitForTimeout(1500);
  await page.locator('button', { hasText: /^\s*(🤲\s*)?Care/ }).first().click();
  await page.waitForTimeout(1100);
  ok(/John is praying for this/i.test(
    await page.locator('[data-my-ask]', { hasText: GUIDE_ASK.slice(0, 24) }).innerText()),
    'THE GUIDE LEARNS THAT THEIR EXPLORER IS PRAYING FOR THEM');

  await page.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok(!(await page.locator('body').innerText()).includes(GUIDE_ASK.slice(0, 24)),
    "a Guide's request never reaches the church wall");

  await browser.close();
  console.log(bad === 0 ? '\nAll prayer checks passed.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
