// The app repairs itself when a deploy broke it, and not otherwise.
//
// ---------------------------------------------------------------------------
// components/SelfHeal.tsx exists for one failure: an installed copy holds a
// cached HTML shell, that shell asks for JavaScript by name, and a new deploy
// has deleted those files. Nothing inside the app can help, because nothing
// inside the app is running. So an inline script watches for it and throws
// away the service worker and every cache before reloading.
//
// IT IS A BIG HAMMER, AND IT USED TO SWING AT ALMOST ANYTHING. The trigger was
// any `error` event whose target's URL contained `/_next/static/`. That is not
// the same question as "did the deploy delete this file", and three things
// that are not a broken deploy matched it:
//
//   - A REQUEST CANCELLED BY NAVIGATING AWAY. Tapping a link while a chunk is
//     still downloading aborts it, and an aborted subresource raises `error`.
//     WebKit reports these where Blink mostly does not, which is why five of
//     the suites in safari.yml were being interrupted mid-navigation by the
//     repair firing underneath them.
//   - A PICTURE OR A SOUND that happens to live under /_next/static/.
//   - A CHUNK THAT FAILED BECAUSE THE PHONE LOST SIGNAL. This was the worst of
//     the three: the repair deleted every cache and reloaded, the reload could
//     not complete with no network, and the person was left on a browser error
//     page with the offline copy destroyed. Measured: caches 2 -> 0, and the
//     page at chrome-error://chromewebdata. A signal drop on Philippine mobile
//     data turned into an app that stays broken until signal returns.
//
// So the trigger now asks the server whether the file is actually gone, and
// only a real 404 counts.
//
// AND THERE WAS A SECOND DOOR, which the first fix did not close. Failures that
// arrive with no URL -- a rejected dynamic import, a bare error message -- were
// still healing on the spot, and a cancelled import rejects with a message that
// matches. Those now ask /version.json whether the server is on a different
// build than this page was made from, which is the real question underneath all
// of this. These six cases are the whole contract.
//
//   node tests/e2e/the-repair-only-fires-when-it-should.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');
const os = require('node:os'), fs = require('node:fs'), path = require('node:path');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

/** Open the app fresh, do something to it, and say whether it repaired itself. */
async function tryIt({ offline = false }, inPage, arg) {
  const ctx = await chromium.launchPersistentContext(
    fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-heal-')), { ...launchOptions });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  // Something in the cache to notice the loss of, the way the worker would.
  await page.evaluate(async () => {
    try { const c = await caches.open('probe-shell'); await c.put('/probe', new Response('shell')); } catch {}
  });
  await page.waitForTimeout(500);
  if (offline) await ctx.setOffline(true);
  await page.evaluate(inPage, arg);
  await page.waitForTimeout(4000);
  const url = page.url();
  const repaired = url.includes('fresh=') || url.startsWith('chrome-error');
  const caches_ = await page.evaluate(async () => (await caches.keys()).length).catch(() => -1);
  await ctx.close();
  return { repaired, caches: caches_, url };
}

const addScript = (src) => {
  const s = document.createElement('script');
  s.src = src;
  document.head.appendChild(s);
};

(async () => {
  // 1. THE CASE IT EXISTS FOR. A chunk the server does not have.
  {
    const r = await tryIt({}, addScript, '/_next/static/chunks/deleted-by-a-deploy.js');
    // THE REPAIR, AND NOT SOMETHING ELSE THAT RELOADS. Four things in this app
    // land on /?fresh=..., and case 6 below once went green on the auto-update
    // instead of on this. Each now says who it is.
    ok(r.repaired && /by=repair-chunk/.test(r.url),
       `a chunk the deploy really deleted sets off the repair (${r.url.split('/').pop()})`);
  }

  // 2. A CANCELLED REQUEST, which is what navigating away looks like.
  {
    const ctx = await chromium.launchPersistentContext(
      fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-heal-')), { ...launchOptions });
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    // A chunk this page really loaded, so the server still has it.
    const real = await page.evaluate(() =>
      [...document.querySelectorAll('script[src]')]
        .map((s) => s.getAttribute('src'))
        .find((s) => s && s.includes('/_next/static/')) || '');
    ok(!!real, `there is a real chunk to test against (${real || 'none found'})`);
    await page.evaluate(async (src) => {
      const s = document.createElement('script');
      s.src = src;
      document.head.appendChild(s);
      await new Promise((r) => setTimeout(r, 500));
      s.dispatchEvent(new Event('error'));
    }, real);
    await page.waitForTimeout(4000);
    const repaired = page.url().includes('fresh=');
    await ctx.close();
    ok(!repaired, 'a request cancelled on a chunk that is still there does not');
  }

  // 3. NOT EVERYTHING UNDER /_next/static/ IS THE APP.
  {
    const r = await tryIt({}, (src) => {
      const i = document.createElement('img');
      i.src = src;
      document.body.appendChild(i);
    }, '/_next/static/media/not-here.png');
    ok(!r.repaired, 'a picture that will not load is not a reason to rebuild the app');
    ok(r.caches > 0, `and the caches are still there (${r.caches})`);
  }

  // 4. THE ONE THAT MATTERS MOST ON A PHONE.
  {
    const r = await tryIt({ offline: true }, addScript, '/_next/static/chunks/whatever.js');
    ok(!r.repaired, 'a chunk failing while offline does not set it off');
    ok(r.caches > 0,
       `and the offline copy survives, which is the whole point of having one (${r.caches} caches)`);
  }

  // 5 AND 6. THE SECOND DOOR: failures that arrive with no URL to ask about.
  //
  // Narrowing the resource-error path left the two chunky(message) branches and
  // the rejection handler still calling heal() on the spot, and "Importing a
  // module script failed" is exactly what a dynamic import rejects with when
  // you navigate away mid-import. WebKit run 238 walked straight through it:
  // conversation-fits-the-glass clicked sign-in and the app reloaded underneath
  // the click. So those now ask /version.json whether the server is on a
  // different build than this page was made from.
  //
  // Both halves are tested, because either one alone can be satisfied by doing
  // nothing at all. And the probe is COUNTED, so a case that passes because the
  // check never ran is a failure here rather than a green tick.
  //
  // serviceWorkers: 'block' is not decoration. The app installs a worker, and a
  // request it serves does not pass through Playwright's routing -- which is
  // exactly why the first version of this case reported the repair as broken
  // when the repair was fine and the test was not looking at the real traffic.
  async function askedAndAnswered(serverBuild) {
    const ctx = await chromium.launchPersistentContext(
      fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-heal-')),
      { ...launchOptions, serviceWorkers: 'block' });
    const page = ctx.pages()[0] || await ctx.newPage();
    let probes = 0;
    await ctx.route(/version\.json/, (route) => {
      // ONLY the repair's own probe is answered with a made-up build. The app
      // ALSO polls this route (AutoUpdate, with ?t=), and it is built to reload
      // when the build moves -- so answering that one too made case 6 go green
      // on the wrong mechanism entirely. The probe counter is what caught it,
      // which is the only reason it is here.
      if (!route.request().url().includes('probe=')) return route.continue();
      probes += 1;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ build: serverBuild }),
      });
    });
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    const mine = await page.evaluate(() => {
      const t = [...document.scripts].map((x) => x.textContent || '')
        .find((x) => x.includes('var MINE='));
      return t ? (t.match(/var MINE="([^"]*)"/) || [])[1] : '';
    });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      Promise.reject(new Error('Importing a module script failed: /_next/static/chunks/x.js'));
    });
    await page.waitForTimeout(4500);
    const url = page.url();
    const repaired = url.includes('fresh=');
    await ctx.close();
    return { repaired, probes, mine, url };
  }

  // 5. The server is on the same build, so a reload cannot fix anything.
  {
    const mine = (await askedAndAnswered('placeholder')).mine;
    const r = await askedAndAnswered(mine);
    ok(r.probes > 0, `the repair asks before it acts (${r.probes} probe)`);
    ok(!r.repaired, 'a dynamic import cancelled by navigating away does not set it off');
  }

  // 6. The server has moved on, which is the case this whole file exists for.
  {
    const r = await askedAndAnswered('a-build-this-page-was-not-made-from');
    ok(r.probes > 0, `and it asks here too (${r.probes} probe)`);
    ok(r.repaired && /by=repair-build/.test(r.url),
       `but the same signal DOES repair when the server has moved on (${r.url.split('/').pop()})`);
  }

  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
