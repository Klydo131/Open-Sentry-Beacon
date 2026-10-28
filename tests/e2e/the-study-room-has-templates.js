// Advanced has templates: a new page already laid out, for school, office,
// church and staff.
//
// 28 October 2026. Simple and Advanced became the same room ("The advance
// should be same with the simple feature"), and Advanced was given office
// tools "applicable for education sections and office and staff tools". The
// owner chose ten pages in four groups (lib/study/templates.ts), shown by
// components/study/StudyTemplates.tsx.
//
// Walked as a person would, on a computer and on a phone: Templates is not in
// Simple; in Advanced it opens on the four groups and ten cards; every card
// makes a page with the template's name, a heading of its own and the right
// number of tables; a table cell takes typing and Undo takes it back without
// taking the template apart; on a phone the page does not move sideways; and
// the shelf has every page afterwards.
//
//   node tests/e2e/the-study-room-has-templates.js [port]
const { browser: engine, launchOptions, pageErrors } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, shelfRows, backToShelf, writtenOnPage } = require('./_study');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// What each template must show once opened: its first heading, and how many
// tables it lays out. Written here by hand rather than read from the module, so
// a template that loses a section is caught rather than agreed with.
const EXPECTED = {
  'lesson-plan': { title: 'Lesson plan', heading: 'Aim', tables: 0 },
  attendance: { title: 'Attendance', heading: 'Write P for present', tables: 1 },
  'weekly-plan': { title: 'Weekly plan', heading: 'This week’s focus', tables: 0 },
  'meeting-notes': { title: 'Meeting notes', heading: 'Action items', tables: 0 },
  'task-board': { title: 'Task board', heading: 'Waiting on someone', tables: 0 },
  'sermon-notes': { title: 'Sermon notes', heading: 'A verse to remember', tables: 0 },
  'bible-study': { title: 'Bible study', heading: 'Observe: what does it say?', tables: 0 },
  'prayer-list': { title: 'Prayer list', heading: 'Thanksgiving', tables: 1 },
  'volunteer-schedule': { title: 'Volunteer schedule', heading: 'Set up and clean up', tables: 1 },
  'event-plan': { title: 'Event plan', heading: 'Budget', tables: 2 },
};

async function openTemplates(page) {
  const button = page.locator('[data-templates]');
  if ((await button.getAttribute('aria-expanded')) !== 'true') await button.click();
  await page.locator('#sr-templates').waitFor({ timeout: 10_000 });
}

async function walk(browser, label, options, every) {
  const context = await browser.newContext(options);
  await context.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
  const page = await context.newPage();
  const caught = pageErrors(page);
  await signInAsExplorer(page, BASE);

  await openStudyRoom(page, BASE, 'simple');
  ok(await page.locator('[data-templates]').count() === 0, `${label}: Simple has no Templates button`);

  await openStudyRoom(page, BASE, 'advanced');
  const before = await shelfRows(page).count();
  await openTemplates(page);
  const groups = await page.locator('#sr-templates section').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  ok(JSON.stringify(groups) === JSON.stringify(['Education', 'Office', 'Church', 'Staff']),
     `${label}: Templates opens on four groups (${groups.join(', ')})`);
  const cards = await page.locator('[data-template]').evaluateAll((els) => els.map((el) => el.getAttribute('data-template')));
  ok(cards.length === 10 && Object.keys(EXPECTED).every((id) => cards.includes(id)),
     `${label}: and ten cards, one for each template (${cards.length})`);
  // A CARD ON A PHONE IS ONE COLUMN, and nothing runs off the side.
  const widest = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(widest <= 0, `${label}: the gallery does not push the page sideways (${widest}px over)`);
  await page.locator('[data-templates]').click();

  const ids = every ? Object.keys(EXPECTED) : ['attendance', 'meeting-notes'];
  for (const id of ids) {
    const want = EXPECTED[id];
    await openTemplates(page);
    await page.locator(`[data-template="${id}"]`).click();
    await page.waitForSelector('affine-paragraph, affine-list', { timeout: 60_000 });
    await page.waitForTimeout(900);
    const title = await page.getByLabel('Name this page').inputValue();
    const words = await writtenOnPage(page);
    const tables = await page.locator('affine-table').count();
    ok(title === want.title && words.includes(want.heading) && tables === want.tables,
       `${label}: ${want.title} opens as itself (title "${title}", ${tables} table${tables === 1 ? '' : 's'}, "${want.heading}" ${words.includes(want.heading) ? 'there' : 'missing'})`);

    if (id === 'attendance') {
      // The table's head row is written, and a cell below it takes typing.
      ok(/Name/.test(await page.locator('affine-table').first().innerText()), `${label}: the attendance table has its head row`);
      // SIX COLUMNS ON A PHONE: the table scrolls inside itself, as Notion's
      // do, and the page never moves sideways under somebody's thumb.
      const sideways = await page.evaluate(() => {
        const t = document.querySelector('affine-table');
        const inside = [...t.querySelectorAll('*')].some((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowX) && e.scrollWidth > e.clientWidth);
        return { over: document.documentElement.scrollWidth - window.innerWidth, inside };
      });
      ok(sideways.over <= 0, `${label}: the page does not move sideways (${sideways.over}px over${sideways.inside ? '; the table scrolls inside itself' : ''})`);
      const cells = page.locator('affine-table [contenteditable="true"]');
      const n = await cells.count();
      if (n > 4) {
        await cells.nth(4).click();
        await page.keyboard.type('Room 4');
        await page.waitForTimeout(300);
      }
      ok(n > 4 && /Room 4/.test(await page.locator('affine-table').first().innerText()),
         `${label}: a cell under the head takes typing (${n} cells)`);
      // UNDO TAKES BACK THE TYPING, NOT THE TEMPLATE. A guard on behaviour:
      // with withoutTransact taken out of writeTemplate this stayed green,
      // because the page's history only starts once it is open, after the
      // template is written. Both keep it whole; this checks the outcome.
      const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
      for (let i = 0; i < 6; i++) { await page.keyboard.press(`${mod}+z`); await page.waitForTimeout(120); }
      await page.waitForTimeout(400);
      const after = await writtenOnPage(page);
      const flat = (t) => t.replace(/\s+/g, ' ').trim();
      ok(!/Room 4/.test(after) && flat(after) === flat(words) && await page.locator('affine-table').count() === 1,
         `${label}: Undo takes back the typing and leaves the template whole`);
    }
    await backToShelf(page);
  }

  const titles = await shelfRows(page).allInnerTexts();
  const made = ids.filter((id) => titles.some((t) => t.includes(EXPECTED[id].title)));
  ok((await shelfRows(page).count()) === before + ids.length && made.length === ids.length,
     `${label}: the shelf has every page made from a template (${made.length} of ${ids.length})`);

  const errors = caught.list();
  ok(errors.length === 0, `${label}: no page errors${errors.length ? `: ${errors.slice(0, 2).join(' | ')}` : ''}`);
  await context.close();
}

(async () => {
  const browser = await engine.launch(launchOptions);
  try {
    await walk(browser, 'computer', { viewport: { width: 1280, height: 860 } }, true);
    await walk(browser, 'phone', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, false);
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
