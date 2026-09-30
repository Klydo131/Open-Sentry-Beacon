// Every walk, walked. One per participant, in a real browser, at phone width.
//
// The tutorial used to be one array of missionary steps, so there was one thing
// to test. There are now five walks, and the failure this suite exists to catch
// is the boring one: a step that points at a `data-quest` anchor nobody ever
// added, so the person is told "tap the highlighted button" with no highlight
// anywhere. That is not hypothetical — it is written down in Quest.tsx as
// something that already happened, and it happened again while this suite was
// being written: `<Button>` took a fixed prop list and dropped `data-quest` on
// the floor, so five anchors across three walks did not exist in the DOM.
//
// The rule tests/e2e/tutorial-tut2.js was written for still holds: **no step may
// be skipped and still counted.** If an anchor never appears, the track fails.
//
// The other half of the job is not lying in the other direction. An earlier
// version of this file read the panel a fixed 900ms after each click and
// reported three separate failures that were not real — the spotlight is placed
// after a navigation, after a scroll, and after a fallback chain walks back a
// hop, and reading it mid-move catches it with no ring, or with the ring over an
// element whose anchor has not mounted yet. So every reading here waits for a
// state that can actually be judged, and only then judges it.
//
// 412px, because that is the phone these church directors will be holding.
const { chromium, launchOptions } = require('./_playwright');

const PORT = process.argv[2] || '4001';
const BASE = `http://localhost:${PORT}`;
const OUT =
  process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(
    require('node:path').join(require('node:os').tmpdir(), 'beacon-e2e-'),
  );

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// Four walks, not five. The church board card was removed from the picker: board
// members have no account in this app, so an option that opened with "you have
// no account here" was offering itself to somebody it then turned away. What the
// board is shown now lives inside the Admin and Executive accounts.
const TRACKS = (process.env.QUEST_ONLY || 'executive,admin,dm,ds').split(',');
const DEBUG = !!process.env.QUEST_DEBUG;
// The screen shape is the variable that matters here. Every tutorial bug found
// so far has been a geometry bug — a band reserved on the wrong side, a ring
// drawn past the right edge — and those appear or vanish with the width and the
// height, not with the logic. QUEST_VIEWPORT runs this same proven walk at any
// shape; tutorial-every-screen.js drives it across the real ones.
const [QVW, QVH] = (process.env.QUEST_VIEWPORT || '412x820').split('x').map(Number);
const QUEST_VIEWPORT = { width: QVW || 412, height: QVH || 820 };


// What the panel is showing, and whether the thing it points at is real.
const readPanel = (page) =>
  page
    .evaluate(() => {
      const panel = document.querySelector('[aria-label="Beacon tutorial"]');
      if (!panel) return { none: true };

      // Read the panel's own text, and mind the pin.
      //
      // Two readers got this wrong before this one. The first non-empty <p> is
      // the breadcrumb on some steps and the title on others. And the location
      // pin renders on its own line, so "does not start with 📍" skipped the pin
      // and returned the BREADCRUMB as the title — which made three consecutive
      // steps under one breadcrumb look like a tutorial stuck on one step.
      //
      // The order is fixed: ✦ header, 📍, breadcrumb, title, hint.
      const lines = panel.innerText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const pin = lines.indexOf('📍');
      const chrome = (l) => !l || l.length < 2 || /^✦/.test(l) || /^(←|→|▴|▾|×)$/.test(l);
      const title =
        pin >= 0
          ? lines.slice(pin + 2).find((l) => !chrome(l)) || ''
          : lines.slice(1).find((l) => !chrome(l)) || '';

      const ring = [...document.querySelectorAll('div')].find((d) =>
        (d.style.boxShadow || '').includes('9999px'),
      );
      const buttons = [...panel.querySelectorAll('button')].map((b) =>
        (b.textContent || '').trim(),
      );

      let onScreen = false;
      let overlapsPanel = false;
      let targetQuest = null;
      if (ring) {
        const rr = ring.getBoundingClientRect();
        const el = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2);
        const q = el && el.closest('[data-quest]');
        targetQuest = q ? q.getAttribute('data-quest') : null;
        const pnl = panel.getBoundingClientRect();
        onScreen = rr.bottom > 0 && rr.top < window.innerHeight && rr.width > 0;
        overlapsPanel =
          rr.left < pnl.right && rr.right > pnl.left && rr.top < pnl.bottom && rr.bottom > pnl.top;
      }

      return {
        title,
        progress: (panel.textContent.match(/\d\/\d/) || [''])[0],
        hasRing: !!ring,
        onScreen,
        overlapsPanel,
        targetQuest,
        hasFinish: buttons.some((b) => /Finish/i.test(b)),
        routeBtn: buttons.find((b) => /^Go |^Take me there/i.test(b)) || null,
      };
    })
    .catch(() => ({ none: true }));

// Wait until the panel is in a state worth judging, and require it to hold
// still for one more poll before believing it.
//
// The stillness is the important part. The panel's text advances to the next
// step before the spotlight is re-placed, so for a few hundred milliseconds the
// title says "Let someone in" while the ring is still around the tab from the
// previous step. Acting on that reading pressed the previous control a second
// time, which invalidated the placement, and the run then sat looking at
// nothing for ten seconds and called the step broken. It was not.
async function settle(page, ms = 12_000) {
  const deadline = Date.now() + ms;
  let last = { none: true };
  let prev = null;
  while (Date.now() < deadline) {
    const st = await readPanel(page);
    last = st;
    if (!st.none) {
      if (st.hasFinish) return st;
      const decidable =
        (st.hasRing && st.targetQuest && st.onScreen) || (st.routeBtn && !st.hasRing);
      const fingerprint = `${st.title}|${st.targetQuest}|${st.routeBtn}`;
      if (decidable && prev === fingerprint) return st;
      prev = decidable ? fingerprint : null;
    }
    await page.waitForTimeout(400);
  }
  return last;
}

// Do whatever this step asks for, on the real control.
//
// An anchor is not always a button. `chat-send` is the whole composer — a form
// wrapping an input and a Send button — because the instruction is "type in the
// highlighted box and send", and ringing only the button pointed at half of it.
// Others are buttons that stay disabled until a select or a textarea beside
// them is filled in.
//
// So this is deliberately generic: find the nearest thing around the anchor that
// holds form controls, fill whatever is empty, then press the anchor if it is a
// button or the enabled button inside it if it is not. A per-target version of
// this looked for a textarea, found none (the chat box is an <input>), typed
// nothing, and left Send inert — which reads exactly like a broken tutorial
// when the tutorial was fine.
//
// Every locator call is bounded and guarded. Unbounded ones turned a page that
// had simply moved on into a 30-second hang and then an uncaught rejection that
// killed the whole run mid-track.
async function act(page, target) {
  // THE ONE A PERSON CAN SEE. Since the bottom bar, the church link is in the
  // desktop header (hidden below 1280px) and in the Menu; `.first()` alone
  // picked the hidden one and pressed nothing. A person taps what is on screen.
  const el = page.locator(`[data-quest="${target}"]:visible`).first();
  try {
    await el.waitFor({ state: 'attached', timeout: 5000 });
  } catch {
    return false;
  }

  // Only prepare input when the control actually needs it.
  //
  // Filling unconditionally was a mistake with side effects: for a tab button
  // the nearest ancestor holding form controls is most of the page, so pressing
  // a tab also typed into the invite form and set every untouched dropdown.
  // An enabled button is just a button — press it.
  let needsInput = true;
  try {
    const tagName = await el.evaluate((n) => n.tagName.toLowerCase(), undefined, {
      timeout: 5000,
    });
    needsInput = tagName !== 'button' || !(await el.isEnabled({ timeout: 2000 }));
  } catch {
    return false;
  }

  try {
    const scope = el
      .locator('xpath=ancestor-or-self::*[.//select or .//textarea or .//input][1]')
      .first();
    if (needsInput && (await scope.count())) {
      const selects = scope.locator('select');
      for (let i = 0; i < (await selects.count()); i++) {
        const one = selects.nth(i);
        if ((await one.inputValue().catch(() => 'x')) === '') {
          if ((await one.locator('option').count()) > 1) {
            await one.selectOption({ index: 1 }, { timeout: 4000 }).catch(() => {});
          }
        }
      }
      const boxes = scope.locator('textarea, input:not([type]), input[type="text"]');
      for (let i = 0; i < (await boxes.count()); i++) {
        const one = boxes.nth(i);
        if (!(await one.inputValue().catch(() => 'x'))) {
          await one
            .fill('Thank you, a note from the tutorial.', { timeout: 4000 })
            .catch(() => {});
        }
      }
    }
  } catch {
    // A control that vanished mid-fill is the page moving on, not a failure.
  }

  try {
    const tag = await el.evaluate((n) => n.tagName.toLowerCase(), undefined, { timeout: 5000 });
    const inner = el.locator('button:not([disabled])').last();
    const press = tag === 'button' ? el : (await inner.count()) ? inner : el;
    await press.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
    await press.click({ timeout: 5000 }).catch(() => {});
  } catch {
    return false;
  }
  return true;
}

async function walk(browser, track) {
  const ctx = await browser.newContext({
    viewport: QUEST_VIEWPORT,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  console.log(`\n──────── ${track} ────────`);

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const chip = page.locator(`[data-quest-track="${track}"]`).first();
  if ((await chip.count()) === 0) {
    ok(false, `${track}: the front door offers this walk`);
    await ctx.close();
    return;
  }
  ok(true, `${track}: the front door offers this walk`);
  await chip.click();
  await page.waitForTimeout(2000);

  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(700);
  }

  const seen = [];
  let finished = false;
  let stuck = null;
  // Several iterations can legitimately pass without the step changing: three
  // of the missionary's steps sit behind a fallback chain that walks back a hop
  // at a time. Standing still is only a failure when it keeps happening.
  let still = 0;

  for (let i = 0; i < 30 && !finished && !stuck; i++) {
    const st = await settle(page);
    if (DEBUG) {
      console.log(
        `   [${i}] ${page.url().replace(BASE, '')} ${st.progress} "${st.title}" ` +
          `ring=${st.hasRing} target=${st.targetQuest} onScreen=${st.onScreen} ` +
          `overlap=${st.overlapsPanel} route=${JSON.stringify(st.routeBtn)} finish=${st.hasFinish}`,
      );
    }

    if (st.none) {
      stuck = 'the tutorial panel is not on screen';
      break;
    }
    if (st.hasFinish) {
      finished = true;
      break;
    }
    if (!st.title) {
      stuck = 'a step with no title';
      break;
    }

    const mark = `${st.progress}|${st.title}`;
    if (seen.length && seen[seen.length - 1] === mark) {
      still += 1;
      if (still > 5) {
        stuck = `stuck on "${st.title}" at ${st.progress}`;
        break;
      }
    } else {
      still = 0;
      seen.push(mark);
    }

    // A step that names another screen offers a button to get there. Take it,
    // then let the navigation land before looking again — re-reading too early
    // found the button still there, pressed it again, and restarted the
    // placement every time.
    if (st.routeBtn && !st.hasRing) {
      // Matched by the text inside the panel, not by accessible name.
      //
      // The button reads "Go to Admin→" but the arrow is decorative, so its
      // accessible name is "Go to Admin" and a regex built from the visible
      // text matched nothing. getByRole then resolved to an empty locator, the
      // click threw, the catch swallowed it, and the walk pressed a button that
      // was never there — six times, before giving up and blaming the step.
      await page
        .locator('[aria-label="Beacon tutorial"] button', { hasText: /Go to|Take me there/i })
        .first()
        .click({ timeout: 5000 })
        .catch(() => {});
      await page.waitForTimeout(2200);
      continue;
    }

    if (!st.hasRing || !st.targetQuest) {
      // The panel collapses to a single line after you act on a step, and a
      // collapsed panel renders neither Back nor Finish. On the closing card —
      // which has nothing to point at by design — that reads identically to a
      // broken step. Open it, the way a person would, before believing that.
      const toggle = page
        .locator('[aria-label="Beacon tutorial"] button')
        .filter({ hasText: /^[▴▾]$/ })
        .first();
      if (await toggle.count()) {
        await toggle.click().catch(() => {});
        await page.waitForTimeout(700);
        const opened = await readPanel(page);
        if (opened.hasFinish) {
          finished = true;
          break;
        }
        if (opened.hasRing && opened.targetQuest) continue;
      }
      stuck = `"${st.title}" points at nothing`;
      break;
    }
    if (!st.onScreen) {
      stuck = `"${st.title}" highlights something off screen`;
      break;
    }
    if (st.overlapsPanel) {
      // Give the panel one chance to finish moving. Quest.tsx scrolls the target
      // into a clear band rather than detecting overlap and correcting it, so a
      // reading taken mid-scroll is not evidence of anything.
      await page.waitForTimeout(900);
      const again = await readPanel(page);
      if (again.overlapsPanel) {
        stuck = `"${st.title}" is buried under the tutorial panel`;
        break;
      }
    }

    if (!(await act(page, st.targetQuest))) {
      stuck = `"${st.title}" points at [data-quest="${st.targetQuest}"], which is not in the DOM`;
      break;
    }
  }

  console.log(`   steps: ${seen.map((m) => m.split('|')[1]).join(' → ') || '(none)'}`);
  ok(seen.length > 0, `${track}: the walk has steps`);
  ok(finished, `${track}: every step completes and the walk finishes${stuck ? ` (${stuck})` : ''}`);

  // The seeker must never be shown a stage name, tutorial included — but that
  // rule belongs to tests/e2e/seeker-no-stage.js, which knows the difference
  // between the stage "Call" and the words "video call". A sweep for the six
  // words from here reported a leak that was not one.

  await page.screenshot({ path: `${OUT}/quest-${track}.png` }).catch(() => {});
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  for (const track of TRACKS) {
    await walk(browser, track);
  }

  // Finishing one walk must not mark another done. Same profile, two tracks.
  console.log('\n──────── progress is per walk ────────');
  const ctx = await browser.newContext({
    viewport: QUEST_VIEWPORT,
    serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    localStorage.setItem('beacon-quest-v1-dm', JSON.stringify({ completed: ['open', 'message'] }));
  });
  await page.locator('[data-quest-track="admin"]').first().click();
  await page.waitForTimeout(2500);
  const progress = (await readPanel(page)).progress;
  ok(
    progress === '' || progress.startsWith('0'),
    `the admin walk starts at zero with missionary progress on the same device (got "${progress}")`,
  );
  await ctx.close();

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  await browser.close();
  process.exit(bad === 0 ? 0 : 1);
})();
