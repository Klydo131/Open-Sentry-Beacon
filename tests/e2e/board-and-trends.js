// The church board has no account, and the analytics now show change over time.
//
// Two changes the owner asked for in one sentence: "take out the church member
// account since they don't have any account in this app. Let's just improve the
// analytics overtime and the Church board in each respect role in the account."
//
// They are one change really. The board card was removed from the sign-in
// picker, because an option that opens with "you have no account here" is
// offering itself to somebody it then turns away. What the board actually needs
// moved into the accounts that exist — the admin's and the executive's — as a
// panel of counts they can read out or print at a meeting.
//
// So this checks the promise on both sides: the card is gone, the panel is
// there in both accounts, the numbers change over time, and the panel still
// names nobody. That last one is the one that matters. A screen built to be read
// aloud in a church meeting is exactly where a name would do the most damage,
// and it is the sort of thing that leaks back in months later.
const { chromium, launchOptions, openByQuest } = require('./_playwright');

const PORT = process.argv[2] || '4001';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

async function signInAs(page, name) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const who = page.getByText(new RegExp(name, 'i')).first();
  if ((await who.count()) === 0) return false;
  await who.click();
  await page.waitForTimeout(1800);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
  return true;
}

async function openAnalytics(page) {
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  // Admin's rooms are a drop-down (30 September 2026): open it, then Analytics.
  if (!(await openByQuest(page, 'tab-analytics'))) return false;
  await page.waitForTimeout(500);
  // The board panel and the trend charts live in the anonymous rollup, which is
  // the correct place for them and is not the tab's default scope.
  const global = page.getByRole('button', { name: /Global/i }).first();
  if (await global.count()) {
    await global.click();
    await page.waitForTimeout(700);
  }
  return true;
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 900 },
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();

  // ------------------------------------------- 1. the card is gone entirely --
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  let text = await page.locator('body').innerText();
  const picker = /Who are you in your church/i.test(text);
  ok(picker, 'the front door still asks who you are');
  ok(
    !/Church board member/i.test(text),
    'and no longer offers a church board card to somebody with no account',
  );
  // The ones that remain, each of which is a real account. Named from the
  // brand map rather than typed out, so a rename cannot leave this asserting
  // words the app stopped using — which is exactly what happened: this line
  // said "Missionary" and "Admin" two renames after both were retired, and
  // passed the whole time because the front door had not been updated either.
  // A test and a screen agreeing on the wrong thing is not a passing test.
  // …and it happened AGAIN, to this very line. It read 'Support', a name the
  // app retired when Admin became Director. The picker offers Executive
  // Director, Director, Guide and Explorer, and has for some time. A comment
  // warning about stale role names is not a defence against stale role names.
  for (const role of ['Executive Director', 'Director', 'Guide', 'Explorer']) {
    ok(new RegExp(`\\b${role}\\b`).test(text), `${role} is still offered`);
  }

  // ---------------------------------- 2. the panel is in BOTH oversight roles --
  const everyName = await page.evaluate(() => {
    try {
      const db = JSON.parse(localStorage.getItem('beacon-demo-v1') || 'null');
      return db ? db.profiles.map((p) => p.full_name) : [];
    } catch {
      return [];
    }
  });

  for (const [who, label] of [
    ['Bishop Alonzo', 'the executive'],
    ['Pastor Ramos', 'the admin'],
  ]) {
    ok(await signInAs(page, who), `${label} can sign in`);
    ok(await openAnalytics(page), `${label} can open Analytics`);
    text = await page.locator('body').innerText();

    ok(/For the church board/i.test(text), `${label} has the board panel in their account`);
    ok(/Activity over time/i.test(text), `${label} sees activity over time`);
    ok(/People moving forward/i.test(text), `${label} sees people moving forward`);

    // The boundary, read off the panel itself rather than the whole page.
    //
    // Selected by an explicit hook, not by "the last div containing the words".
    // That guess resolved to the heading's own wrapper — the innermost div that
    // matched — so it held the title and the subtitle and nothing else, and the
    // two assertions below failed while the card on screen was perfectly
    // correct. Same lesson as data-series last round: name the element.
    const panel = page.locator('[data-panel="board"]').first();
    const panelText = await panel.innerText().catch(() => '');
    ok(panelText.length > 50, `${label}: the board panel has content to check`);
    const leaked = everyName.filter((n) => n && panelText.includes(n));
    ok(
      leaked.length === 0,
      leaked.length === 0
        ? `${label}: the board panel names nobody`
        : `${label}: the board panel names ${leaked.join(', ')}`,
    );
    ok(
      /Where the board’s approval happens|Where the board's approval happens/i.test(panelText),
      `${label}: it says where the board's own approval actually happens`,
    );
    ok(
      /Print/i.test(panelText),
      `${label}: and it can be printed for the meeting`,
    );
  }

  // --------------------------------------- 3. the chart is a chart, not a total --
  await page.screenshot({ path: `${process.env.E2E_OUT || '/tmp'}/board-panel.png`, fullPage: true });

  const chart = page.locator('[role="img"][aria-label*="over time" i]').first();
  ok((await chart.count()) > 0, 'the trend chart is described to a screen reader');
  const spoken = (await chart.getAttribute('aria-label')) || '';
  // Eight weeks, each named, so the label is a sentence somebody could act on
  // rather than "chart".
  const buckets = (spoken.match(/:/g) || []).length;
  ok(buckets >= 8, `and it names every bucket it draws (${buckets})`);
  ok(/so far/i.test(spoken), 'the week in progress is called out as unfinished');
  // A gap is a reading. The sample history deliberately contains one week with
  // nothing in it, because a chart that only ever goes up teaches a church
  // nothing — and because an empty bucket dropped rather than drawn would close
  // the gap up silently. This assertion is what keeps that week from being
  // quietly filled in by a later change to the seed.
  ok(/: 0(;|\.)/.test(spoken), 'a week with no activity is drawn, not skipped');

  // A total that only goes up cannot say this; a trend can.
  text = await page.locator('body').innerText();
  ok(
    /more than last week|fewer than last week|the same as last week|no week before this one|first this week/i.test(
      text,
    ),
    'and it says how this week compares with last week, in words',
  );

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  await ctx.close();
  await browser.close();
  process.exit(bad === 0 ? 0 : 1);
})();
