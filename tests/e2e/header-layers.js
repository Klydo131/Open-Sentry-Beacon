// Anything in the header that opens a panel must actually open it.
//
// This exists because "Try an account" stopped working and the failure was
// invisible from every angle a normal test looks from. The button was present,
// visible, and enabled. Clicking it toggled React state, and `aria-expanded`
// went from false to true. The panel entered the DOM, and Playwright's
// `isVisible()` returned true for it. Every ordinary assertion passed.
//
// It was still, from a person's point of view, a button that did nothing.
//
// The header's feature icons live in a horizontally scrolling strip, and a strip
// is `overflow-x: auto` — which makes it a CLIPPING BOX. An absolutely
// positioned panel inside it is clipped to the strip's 44 pixels of height, so
// on a desktop the open panel was a sliver behind the header. On a phone it was
// fine, because below `sm` the panel is `position: fixed` and escapes the
// overflow, which is why the bug read as intermittent and device-specific when
// it was neither.
//
// So this suite asserts the only thing that actually matters: after opening,
// is the middle of the panel the thing you would hit if you tapped there? That
// is `elementFromPoint`, and it is the question `isVisible()` does not ask.
//
// It runs at both widths deliberately. A regression that only affects desktop is
// exactly what happened, and a phone-only suite would have shipped it again.
const { chromium, launchOptions } = require('./_playwright');

const PORT = process.argv[2] || '4001';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function signIn(page, name) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await sleep(1000);
  const who = page.getByText(new RegExp(name, 'i')).first();
  if ((await who.count()) === 0) return false;
  await who.click();
  await sleep(1800);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await sleep(600);
  }
  return true;
}

/**
 * Open a header control and report whether its panel is genuinely reachable.
 * `marker` is text that appears inside the panel and nowhere else.
 */
async function openAndProbe(page, buttonName, marker) {
  const btn = page.getByRole('button', { name: buttonName }).first();
  if ((await btn.count()) === 0) return { present: false };
  await btn.click();
  await sleep(600);

  return page.evaluate((markerText) => {
    const el = [...document.querySelectorAll('p,span,h1,h2,h3')].find((n) =>
      (n.textContent || '').includes(markerText),
    );
    if (!el) return { present: true, inDom: false };
    const panel = el.closest('div');
    const r = panel.getBoundingClientRect();

    // Every ancestor that can clip, and the strip is the one that bit.
    const clippers = [];
    let n = panel.parentElement;
    while (n && n !== document.body) {
      const cs = getComputedStyle(n);
      if (/(auto|scroll|hidden)/.test(cs.overflowX + cs.overflowY)) {
        const nr = n.getBoundingClientRect();
        clippers.push({ overflow: `${cs.overflowX}/${cs.overflowY}`, h: Math.round(nr.height) });
      }
      n = n.parentElement;
    }

    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return {
      present: true,
      inDom: true,
      w: Math.round(r.width),
      h: Math.round(r.height),
      onScreen: r.width > 40 && r.height > 40 && r.bottom > 0 && r.top < innerHeight,
      reachable: !!(hit && panel.contains(hit)),
      // A clipper SHORTER than the panel is the exact failure: the panel is
      // taller than the box it is being drawn inside.
      clippedBy: clippers.filter((c) => c.h < r.height).length,
    };
  }, marker);
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  for (const [w, h, label] of [
    [1280, 800, 'desktop'],
    [412, 900, 'phone'],
  ]) {
    const ctx = await browser.newContext({
      viewport: { width: w, height: h },
      serviceWorkers: 'block',
    });
    const page = await ctx.newPage();

    ok(await signIn(page, 'Maria Santos'), `${label}: a missionary can sign in`);

    const r = await openAndProbe(page, /Try any account/i, 'Demo only');
    // The account switcher is demo-only by design: a deployment with a real
    // backend must never let anybody change their own role, so by then it should
    // have been deleted. Absent is therefore a correct state rather than a
    // failure — this reports it and moves on, which is what lets the same suite
    // run unchanged against a fork that has removed it.
    if (!r.present) {
      console.log(`--  ${label}: no account switcher here (correct once a backend is connected)`);
    } else {
      ok(r.inDom, `${label}: clicking it puts the panel in the page`);
      if (r.inDom) {
        ok(r.onScreen, `${label}: the panel has real size on screen (${r.w}x${r.h})`);
        // THE assertion. Everything above passed while the feature was broken.
        ok(
          r.reachable,
          r.reachable
            ? `${label}: the middle of the panel is the panel — you can actually tap it`
            : `${label}: the panel is on screen but something else is at its centre — clipped or covered`,
        );
        ok(
          r.clippedBy === 0,
          r.clippedBy === 0
            ? `${label}: no ancestor clips it`
            : `${label}: ${r.clippedBy} scrolling/hidden ancestor(s) shorter than the panel`,
        );
      }
    }

    // The account switcher is not the only layer in that header. A regression
    // here would be the same defect wearing a different hat.
    const bell = page.getByRole('button', { name: /notification/i }).first();
    if (await bell.count()) {
      await bell.click();
      await sleep(600);
      const probe = await page.evaluate(() => {
        const panel = document.querySelector('[role="dialog"], [data-panel="notifications"]');
        if (!panel) return null;
        const r = panel.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        // What was measured and what was found there, so a failure on a
        // browser nobody here can open says more than "no".
        const name = (n) => (n ? `${n.tagName.toLowerCase()}${n.getAttribute('aria-label') ? `[${n.getAttribute('aria-label')}]` : ''}.${String(n.className || '').split(/\s+/).slice(0, 4).join('.')}` : 'nothing');
        return {
          reachable: !!(hit && panel.contains(hit)),
          seen: `measured ${name(panel)} at ${[r.left, r.top, r.width, r.height].map(Math.round).join(',')}; `
            + `${document.querySelectorAll('[role="dialog"]').length} dialog(s) open; at its middle: ${name(hit)}`,
        };
      });
      if (probe !== null) {
        ok(probe.reachable, `${label}: the notification panel is reachable too`);
        if (!probe.reachable) console.log(`    ${probe.seen}`);
      }
    }

    await ctx.close();
  }

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  await browser.close();
  process.exit(bad === 0 ? 0 : 1);
})();
