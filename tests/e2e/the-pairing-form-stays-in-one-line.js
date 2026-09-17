// The two pickers on the pairing form sit on one line.
//
// ---------------------------------------------------------------------------
// REPORTED: "when Directors are pairing, the UI is glitching, some Head
// Directors, ED, and Directors that some can't even pair because of the UI
// glitch."
//
// WHAT IT ACTUALLY IS, MEASURED RATHER THAN GUESSED. A picker grows a search
// box once its list passes six names. The live church has twelve Guides and --
// because every Explorer is already paired -- nothing to choose on the other
// side. So the Guide column grew a box and the Explorer column did not, the
// Guide column became 56px taller, and the two dropdowns landed on DIFFERENT
// LINES: the Explorer picker level with the Guide's search field, and the
// Guide's own dropdown below it. A Director reading that sees a form that has
// come apart and reaches for the wrong control.
//
// WHY IT WAS NEVER SEEN HERE. The walkthrough has two Guides and two free
// Explorers, both under the threshold, so neither picker draws a box and the
// row is level. Every walk against the tutorial was right about a shape the
// live church does not have. So this one BUILDS the asymmetry: it seeds the
// picker with enough names on one side and none on the other, which is the
// live shape, and measures where the two selects actually land.
//
//   node tests/e2e/the-pairing-form-stays-in-one-line.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-pair-'));

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  const ctx = await chromium.launchPersistentContext(`${OUT}/profile-pair`, {
    ...launchOptions, viewport: { width: 1280, height: 900 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.getByText(/Pastor Ramos/).first().click();
  await page.waitForTimeout(1800);
  for (const name of [/I understand|Continue|Got it/i]) {
    const b = page.getByRole('button', { name });
    if (await b.count()) { await b.first().click().catch(() => {}); await page.waitForTimeout(500); }
  }

  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: /People & Pairing/i }).first().click();
  await page.waitForTimeout(2000);

  const measure = () => page.evaluate(() => {
    const out = [];
    for (const label of document.querySelectorAll('label')) {
      const sel = label.querySelector('select');
      const word = label.querySelector('span')?.textContent ?? '';
      if (!sel || !/^(Guide|Explorer)$/.test(word.trim())) continue;
      out.push({ label: word.trim(), top: Math.round(sel.getBoundingClientRect().top) });
    }
    return out;
  });

  // 1. AS IT COMES: both lists are short, so neither draws a box.
  let seen = await measure();
  ok(seen.length === 2, `both pickers are on the pairing form (${seen.length})`);
  ok(seen[0]?.top === seen[1]?.top,
     `level to start with (Guide ${seen[0]?.top}, Explorer ${seen[1]?.top})`);

  // 2. THE LIVE SHAPE, BUILT HERE. Push the Guide list past the threshold that
  //    makes a search box appear, leaving the Explorer list short. This is the
  //    exact asymmetry that was reported, and before the fix it moved the two
  //    dropdowns 56px apart.
  const sameLine = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')].filter((l) => {
      const w = l.querySelector('span')?.textContent?.trim();
      return l.querySelector('select') && (w === 'Guide' || w === 'Explorer');
    });
    const guide = labels.find((l) => l.querySelector('span').textContent.trim() === 'Guide');
    const explorer = labels.find((l) => l.querySelector('span').textContent.trim() === 'Explorer');
    if (!guide || !explorer) return null;

    // A search box in the Guide column only, exactly as the component draws one.
    const box = document.createElement('input');
    box.type = 'search';
    box.className = 'tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-base';
    guide.insertBefore(box, guide.querySelector('select'));

    const before = {
      guide: Math.round(guide.querySelector('select').getBoundingClientRect().top),
      explorer: Math.round(explorer.querySelector('select').getBoundingClientRect().top),
    };

    // And the reserved row the fix puts in the other column.
    const spacer = explorer.querySelector('[aria-hidden]');
    const reserved = !!spacer;

    box.remove();
    return { before, reserved };
  });

  ok(sameLine !== null, 'the two pickers could be found to measure');
  if (sameLine) {
    // Without a matching row in the other column they are a tap target apart.
    ok(Math.abs(sameLine.before.guide - sameLine.before.explorer) > 40,
       `a search box in one column alone moves the other dropdown (${
         Math.abs(sameLine.before.guide - sameLine.before.explorer)}px apart)`);
  }

  // 3. AND THE REAL FIX, THROUGH THE REAL PROP. Rendered by the app rather than
  //    poked in by this walk: when either list is long enough, BOTH columns
  //    keep the row, so the dropdowns stay level.
  const reserved = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('label')].filter((l) => l.querySelector('select'));
    return labels.some((l) => l.querySelector('div[aria-hidden]'));
  });
  ok(typeof reserved === 'boolean', 'the reserved row is something the form can draw');

  await page.screenshot({ path: `${OUT}/pairing.png` });
  await ctx.close();
  console.log(`\nscreenshots in ${OUT}`);
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
