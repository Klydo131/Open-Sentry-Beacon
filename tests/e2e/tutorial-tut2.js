const { chromium, launchOptions } = require('./_playwright');

const PORT = process.argv[2] || '3811';
const BASE = `http://localhost:${PORT}`;
// Screenshots and browser profiles go somewhere writable that is not the
// repo. Overridable so CI can collect them as artifacts.
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-e2e-'));

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const readPanel = (page) => page.evaluate(() => {
  const panel = document.querySelector('[aria-label="Beacon tutorial"]');
  if (!panel) return { none: true };
  const ps = [...panel.querySelectorAll('p')].map(p => p.textContent.trim());
  const ring = [...document.querySelectorAll('div')]
    .find(d => (d.style.boxShadow || '').includes('9999px'));
  const routeBtn = [...panel.querySelectorAll('button')]
    .find(b => /Go to My Seekers|Take me there/i.test(b.textContent || ''));
  const amber = [...panel.querySelectorAll('p')]
    .find(p => /carry on|another screen/i.test(p.textContent || ''));
  let ringInfo = null, targetQuest = null;
  if (ring) {
    const rr = ring.getBoundingClientRect();
    const el = document.elementFromPoint(rr.left + rr.width/2, rr.top + rr.height/2);
    const q = el && el.closest('[data-quest]');
    targetQuest = q ? q.getAttribute('data-quest') : null;
    ringInfo = { x: Math.round(rr.left), y: Math.round(rr.top), w: Math.round(rr.width), h: Math.round(rr.height) };
    const pnl = panel.getBoundingClientRect();
    ringInfo.overlapsPanel = rr.left < pnl.right && rr.right > pnl.left && rr.top < pnl.bottom && rr.bottom > pnl.top;
  }
  return {
    // First NON-EMPTY paragraph. The panel's leading <p> is empty on the very
    // first step (no location breadcrumb to show yet), so ps[0] came back '' and
    // the run loop's `if (!st.title) break` ended every run before it started —
    // three empty sequences that still passed the "identical route" assertion.
    title: ps.find((t) => t) || '',
    progress: (panel.textContent.match(/(\d)\/(\d)/) || [])[0] || '',
    hasRing: !!ring, ring: ringInfo, targetQuest,
    hasRouteBtn: !!routeBtn, hasAmber: !!amber,
    hasFinish: [...panel.querySelectorAll('button')].some(b => /Finish/i.test(b.textContent || '')),
    topTag: (() => {
      if (!ring) return null;
      const rr = ring.getBoundingClientRect();
      const e = document.elementFromPoint(rr.left + rr.width/2, rr.top + rr.height/2);
      return e ? e.tagName + (e.className && typeof e.className === 'string' ? '.' + e.className.split(' ')[0] : '') : 'none';
    })(),
    path: location.pathname,
  };
});

// Wait for the tutorial to hold still before judging it -- see settle() in
// tutorial-repeat.js and quest-roles.js. A reading taken mid-scroll judged the
// scroll, and the click after it pressed whatever sat under the ring.
async function settle(page, ms = 6000) {
  const until = Date.now() + ms;
  let prev = null;
  let st = await readPanel(page);
  while (Date.now() < until) {
    const decidable = st.none || st.hasFinish || !!st.targetQuest || (st.hasRouteBtn && !st.hasRing);
    const key = JSON.stringify([st.title, st.targetQuest, st.hasRouteBtn, st.hasFinish, !!st.none]);
    if (decidable && key === prev) return st;
    prev = decidable ? key : null;
    await page.waitForTimeout(300);
    st = await readPanel(page);
  }
  return st;
}

async function startTutorial(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  // The front door asks who you are before it starts anything.
  //
  // It used to be one button that signed everybody in as the sample missionary.
  // Now there is a walk per participant and the first choice is which one, so
  // this suite — which is about the MISSIONARY walk — says so explicitly rather
  // than pressing whatever button happens to mention "tutorial". Without this it
  // pressed a button that only scrolls to the chooser, started nothing, and then
  // failed against /login.
  const begin = page.locator('[data-quest-track="dm"]').first();
  if (await begin.count()) await begin.click();
  await page.waitForTimeout(2400);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) { await consent.first().click().catch(()=>{}); await page.waitForTimeout(600); }
}

// Do the step for real: click what is highlighted; type if it is the chat row.
async function actOnStep(page, st) {
  // Key on the quest target, not the panel text — see tutorial-repeat.js.
  if (st.targetQuest === 'chat-send') {
    const ta = page.getByLabel('Message').first();
    if (await ta.count()) {
      await ta.fill('Thinking of you this week.');
      await page.waitForTimeout(250);
      const send = page.getByRole('button', { name: /^send$/i }).first();
      if (await send.count()) { await send.click(); await page.waitForTimeout(1400); return true; }
    }
    return false;
  }
  const clicked = await page.evaluate(() => {
    const ring = [...document.querySelectorAll('div')]
      .find(d => (d.style.boxShadow || '').includes('9999px'));
    if (!ring) return false;
    const rr = ring.getBoundingClientRect();
    const el = document.elementFromPoint(rr.left + rr.width/2, rr.top + rr.height/2);
    if (!el || el.closest('[aria-label="Beacon tutorial"]')) return false;
    const c = el.closest('button,a,[role="tab"]') || el;
    c.click();
    return true;
  });
  await page.waitForTimeout(1600);
  return clicked;
}

(async () => {
  const b = await chromium.launch(launchOptions);

  // ---------- 1. The exact reported case ----------
  {
    const page = await b.newPage({ viewport: { width: 412, height: 790 } });
    await startTutorial(page);
    // Step 1 done, standing on the seeker LIST with no room open.
    await page.evaluate(() => localStorage.setItem('beacon-quest-v1', JSON.stringify({ completed: ['open'] })));
    await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    const st = await settle(page);
    console.log('\n=== reported case: on /dm, no seeker open, step "Send a message" ===');
    console.log('   ', JSON.stringify({ title: st.title, path: st.path, target: st.targetQuest, routeBtn: st.hasRouteBtn }));
    ok(!st.hasRouteBtn, 'no "Go to My Seekers" button while already on /dm');
    ok(st.hasRing, 'still has something to point at');
    ok(st.targetQuest === 'seeker-card', `points at the seeker card (got ${st.targetQuest})`);
    await page.screenshot({ path: `${OUT}/tut2-reported.png` });
    // And clicking it must actually enter the room.
    await actOnStep(page, st);
    ok(/^\/dm\/.+/.test(page.url().replace(BASE, '')), `clicking it opens the room (${page.url().replace(BASE,'')})`);
    await page.close();
  }

  // ---------- 2. Three identical full runs ----------
  const runs = [];
  for (let run = 1; run <= 3; run++) {
    const page = await b.newPage({ viewport: { width: 412, height: 790 } });
    await startTutorial(page);
    const seq = [];
    let repeats = 0, lastKey = '';
    for (let i = 0; i < 14; i++) {
      const st = await settle(page);
      if (st.none) break;
      if (/Tutorial complete/i.test(st.title)) { seq.push('COMPLETE'); break; }
      if (st.hasFinish) {
        seq.push('FINISH');
        await page.getByRole('button', { name: /Finish/i }).first().click();
        await page.waitForTimeout(1500);
        const gone = await page.locator('[aria-label="Beacon tutorial"]').count();
        ok(gone === 0, `run ${run} Finish closes the tutorial`);
        seq.push('COMPLETE');
        break;
      }
      const stepKey = `${st.title}@${st.targetQuest ?? (st.hasRouteBtn ? 'ROUTE' : 'NOTHING')}`;
      if (stepKey === lastKey) { repeats++; } else { repeats = 0; lastKey = stepKey; }
      if (repeats >= 2) { seq.push('STUCK:' + stepKey); break; }
      seq.push(stepKey);
      // Every step must be actionable — no dead states, ever.
      ok(st.hasRing || st.hasRouteBtn, `run ${run} step "${st.title}" is actionable`);
      if (st.hasRing) {
        ok(st.targetQuest !== null,
           `run ${run} step "${st.title}" spotlight sits on a reachable target (topmost=${st.topTag})`);
      }
      if (st.ring) ok(!st.ring.overlapsPanel, `run ${run} step "${st.title}" spotlight clear of panel`);
      if (st.hasRouteBtn) {
        // A route button is only legitimate when we are elsewhere.
        ok(!st.path.startsWith('/dm'), `run ${run} route button only shown off /dm (path ${st.path})`);
        await page.getByRole('button', { name: /Go to My Seekers|Take me there/i }).first().click();
        await page.waitForTimeout(1800);
        continue;
      }
      const acted = await actOnStep(page, st);
      if (!acted) { seq.push('STUCK'); break; }
    }
    runs.push(seq);
    console.log(`\n=== run ${run} ===`);
    seq.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
    await page.close();
  }

  const same = runs.every(r => JSON.stringify(r) === JSON.stringify(runs[0]));
  ok(same, 'all three runs follow the identical route');
  ok(!runs.some(r => r.includes('STUCK')), 'no run got stuck');
  ok(runs[0].includes('COMPLETE'), `run reaches completion (last: ${runs[0][runs[0].length-1]})`);

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  await b.close();
  process.exit(bad === 0 ? 0 : 1);
})();
