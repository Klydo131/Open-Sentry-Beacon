// Booking a meet-up: type part of a place, see which one it is, tap it, and the
// appointment opens that exact spot.
//
// Asked for on 26 September 2026: "I need to see the destination name, like
// auto name in google search, then just click or tap it to secure the
// location." This walks it in the sample app, on a phone-sized screen, where
// the place box searches a short list of sample landmarks instead of the map
// service -- the same component the live app uses.
//
//   npm run build && node scripts/run-next.mjs start -p 4382
//   node tests/e2e/meet-up-place.js 4382

const { chromium, launchOptions, devices, openRoom } = require('./_playwright');
const PORT = process.argv[2] || '4382';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = await context.newPage();
  const outside = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname !== 'localhost' && !u.protocol.startsWith('data') && !u.protocol.startsWith('blob')) outside.push(u.hostname);
  });

  // An Explorer in the sample church.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const pick = page.getByText(/John/i).first();
  if (await pick.count()) await pick.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it|Agree|OK/i });
  if (await consent.count()) { await consent.first().click().catch(() => {}); await page.waitForTimeout(700); }
  await page.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await openRoom(page, /My Guide/i);

  await page.getByRole('button', { name: /In person/ }).first().click();
  const box = page.getByRole('combobox', { name: 'Where you are meeting' });
  ok(await box.count() === 1, 'an in-person meeting asks where, in a box that suggests places');

  await box.click();
  await box.type('cathed', { delay: 60 });
  await page.waitForTimeout(900);
  const options = page.getByRole('option');
  const texts = (await options.allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  ok(texts.length === 2, `typing part of a word offers the places it could be (${texts.length})`);
  ok(texts.some((t) => /Manila Cathedral/.test(t) && /Intramuros/.test(t))
     && texts.some((t) => /Imus Cathedral/.test(t) && /Imus, Cavite/.test(t)),
    'each with its address, so two places with one kind of name can be told apart');

  await options.filter({ hasText: 'Imus Cathedral' }).first().click();
  await page.waitForTimeout(300);
  const chosen = page.locator('[data-place-chosen]');
  ok(await chosen.count() === 1 && /Meeting here/i.test(await chosen.innerText()),
    'tapping one pins it, and says so');
  const check = chosen.getByRole('link', { name: 'Check it on the map' });
  const href = (await check.count()) ? await check.getAttribute('href') : '';
  ok(/google\.com\/maps\/search\/\?api=1&query=14\.42978\d*%2C120\.93605\d*/.test(href || ''),
    'and "Check it on the map" opens that exact spot, not a search for its name');

  // Change it, and the box comes back with the name to edit.
  await chosen.getByRole('button', { name: 'Change' }).click();
  await page.waitForTimeout(300);
  ok(await box.inputValue() === 'Imus Cathedral', 'Change puts the name back in the box to edit');
  await page.waitForTimeout(900);
  await page.getByRole('option').filter({ hasText: 'Imus Cathedral' }).first().click();

  // Book it.
  const title = page.getByPlaceholder(/What.s it about/i).first();
  await title.fill('Coffee and a first study');
  await page.locator('input[type="datetime-local"]').first().fill('2031-06-12T10:30');
  await page.getByRole('button', { name: 'Schedule' }).first().click();
  await page.waitForTimeout(800);

  const row = page.locator('div', { hasText: 'Coffee and a first study' }).filter({ has: page.getByRole('link', { name: /Open in Maps/ }) }).last();
  ok(await row.count() > 0, 'the appointment is booked with an Open in Maps button');
  const text = (await row.innerText()).replace(/\s+/g, ' ');
  ok(/Imus Cathedral/.test(text) && !/https?:/.test(text), 'the appointment reads as the place, not as a web address');
  const open = await row.getByRole('link', { name: /Open in Maps/ }).first().getAttribute('href');
  ok(open === href, 'and its button opens the same spot that was checked');

  // The next time, the place they used comes first -- and only once.
  await page.getByRole('button', { name: /In person/ }).first().click();
  await box.click();
  await box.type('cathed', { delay: 60 });
  await page.waitForTimeout(900);
  const again = (await page.getByRole('option').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  ok(/Imus Cathedral/.test(again[0] || '') && /Met here before/.test(again[0] || ''),
    'next time, the place they met at is offered first');
  ok(again.filter((t) => /Imus Cathedral/.test(t)).length === 1 && again.some((t) => /Manila Cathedral/.test(t)),
    `and offered once, not again as a new place (${again.length} options)`);
  const bold = await page.locator('[data-match]').first().innerText().catch(() => '');
  ok(/^cathed$/i.test(bold), `the letters typed are drawn in bold (${bold})`);

  // Typed by hand still works.
  await box.fill('');
  await box.click();
  await box.fill('Church cafe, 12 Rizal St, Cavite');
  await page.waitForTimeout(900);
  const asTyped = page.getByRole('button', { name: /as typed/ });
  ok(await asTyped.count() > 0, 'an address typed by hand can be used just as it is');

  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(wide <= 390, `nothing is wider than the phone (${wide}px)`);
  ok(outside.length === 0, `the sample app asked no server outside itself (${[...new Set(outside)].join(', ') || 'none'})`);

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
