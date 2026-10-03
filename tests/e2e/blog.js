// A Guide writes; the Explorers they walk with read it, and only them.
//
// Four things this has to prove, and the last two are the ones worth writing a
// test for:
//   1. the Guide can write and publish a post
//   2. an Explorer paired with that Guide sees it on their home page
//   3. a DRAFT never reaches anybody
//   4. the reader count counts PEOPLE and excludes the author
//
// Points 3 and 4 are where a blog quietly goes wrong. A draft that leaks is a
// privacy failure with a friendly face, and a counter that ticks up when the
// writer re-reads their own post flatters them with their own attention.
const { chromium, launchOptions, openRoom } = require('./_playwright');
const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-blog-'));
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const signInAs = async (page, name) => {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByText(new RegExp(name)).first().click();
  await page.waitForTimeout(1700);
  const c = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await c.count()) { await c.first().click().catch(() => {}); await page.waitForTimeout(600); }
};

const TITLE = 'Thursday evening, and what I am reading';
const BODY = 'A short note for this week.\n\nSecond paragraph, so the renderer has two to make.';

(async () => {
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-blog`, {
    ...launchOptions, viewport: { width: 412, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  // ---- The Guide writes, in Home's Blog folder. ----
  // 3 October 2026: "Blog and announcement will be the sub rooms of home, so
  // basically we will take out publish". The desk is open on arrival.
  await signInAs(page, 'Maria Santos');
  await page.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await openRoom(page, /Blog/i);

  const desk = page.getByText(/Your blog/i).first();
  ok(await desk.count() > 0, 'the Guide has a blog desk on their dashboard');
  await desk.scrollIntoViewIfNeeded();

  // The seeded post proves the count renders before anything is written.
  const seeded = page.getByText(/2 readers/i).first();
  ok(await seeded.count() > 0, 'a published post shows its reader count');

  // The seeded DRAFT is visible to its author, and labelled as one.
  ok(await page.getByText(/DRAFT/).count() > 0, 'the author sees their own draft, marked DRAFT');

  // SIMPLE FIRST: a title, the post and Publish, ready without pressing Write.
  ok(await page.locator('#blog-title').isVisible(), 'the writing box is open on arrival, with nothing to press first');
  // The fieldset's own heading, not the words in the Advanced hint beside the box.
  const whoSees = () => page.locator('legend', { hasText: 'Who sees it' }).count();
  ok((await whoSees()) === 0 && (await page.getByRole('button', { name: /Save as draft/i }).count()) === 0,
     'and it is simple: no audience to choose and no draft button until Advanced settings');
  await page.locator('[data-blog-advanced]').check();
  await page.waitForTimeout(300);
  ok((await whoSees()) > 0 && (await page.getByRole('button', { name: /Save as draft/i }).count()) > 0,
     'Advanced settings shows who sees it, and saving as a draft');
  await page.locator('[data-blog-advanced]').uncheck();
  await page.waitForTimeout(300);
  await page.locator('#blog-title').fill(TITLE);
  await page.locator('#blog-body').fill(BODY);
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /^Publish$/i }).first().click();
  await page.waitForTimeout(1200);
  ok(await page.getByText(TITLE).count() > 0, 'the new post appears on the Guide\'s desk');
  ok(await page.locator('#blog-title').isVisible() && (await page.locator('#blog-title').inputValue()) === '',
     'and the box stays open, empty, for the next one');

  // A brand new post has nobody reading it yet, and the author opening their
  // own page must not create a reader.
  const zero = await page.getByText(/0 readers/i).count();
  ok(zero > 0, 'a new post starts at 0 readers — the author is not counted');

  // ---- An Explorer paired with Maria reads it. ----
  await signInAs(page, 'John');
  await page.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);

  // The heading names the THING, not one relationship. It was "From your
  // Guide", which stopped being true the moment anybody in the church could
  // publish (migration 0042).
  // The reader's side sits in the Church room.
  await openRoom(page, /Church/i);

  ok(await page.getByText(/Community Blogs/i).count() > 0, 'the Explorer sees Community Blogs');
  // And a board that anyone may post to is unreadable without a name on each
  // post, so check the writer is actually printed rather than only the title.
  ok(await page.getByText(/Maria Santos/i).count() > 0, 'the post says who wrote it');
  ok(await page.getByText(TITLE).count() > 0, 'the Explorer can read the published post');

  // The draft must NOT be here. This is the assertion the feature exists to pass.
  const draftLeak = await page.getByText(/Notes for Sabbath/i).count();
  ok(draftLeak === 0, 'a draft never reaches an Explorer');

  // ---- Back to the Guide: the read was counted, once. ----
  await signInAs(page, 'Maria Santos');
  await page.goto(`${BASE}/church?room=blogs`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  await page.getByText(/Your blog/i).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const counted = await page.getByText(/1 reader\b/i).count();
  ok(counted > 0, 'the Explorer who opened it is counted as one reader');

  await page.screenshot({ path: `${OUT}/blog-guide.png`, fullPage: true });
  console.log(`\nscreenshots in ${OUT}`);
  await ctx.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
