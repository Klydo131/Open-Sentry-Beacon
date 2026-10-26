// The app works with no signal: opened once with a signal, then cut off, and
// every screen and every tool still opens.
//
// The owner, 16 October 2026: "How is it still and "offline" first local web
// app if all of the features are not usable offline? Can we fix that today
// and make an update?" Measured that day with the server stopped, after
// opening Home and the Church online: 10 of 27 screens opened, three showed
// "Beacon needs a fresh copy", and the Tuner, the Conductor, Pieces and Play
// all failed.
//
// THE SIGNAL IS REALLY CUT. Playwright's own offline switch does not reach a
// service worker's requests, so a walk that used only that would pass while
// the worker quietly fetched from the server; the first offline audit made
// exactly that mistake and reported 32 of 32. So this walk talks to the app
// through a relay of its own, and cutting the relay leaves nothing to answer
// but what the phone kept. (It cannot stop the shared server: other walks are
// using it.)
//
// Walked in the sample church at phone size:
//   1. Maria, a Guide, opens the app with a signal; the worker says it has
//      kept everything, and Settings says so.
//   2. The signal goes. Every screen in app/ opens: none shows "You're
//      offline", "needs a fresh copy" or an error.
//   3. A link into a folder (/music?room=tuner) opens the Tuner, and every
//      Music folder opens.
//   4. An Explorer's own page opens from her list.
//   5. The drawing board opens and draws; a music PDF is read in Pieces.
//   6. John, an Explorer, opens the study room's editor.
//
//   npm run build && node scripts/run-next.mjs start -p 4412
//   node tests/e2e/the-app-works-with-no-signal.js 4412

const http = require('node:http');
const path = require('node:path');
const { browser: engine, launchOptions, engineName, openRoom, pageErrors } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, openPage } = require('./_study');

const PORT = Number(process.argv[2] || 4412);
const HYMN_PDF = path.join(__dirname, '..', 'fixtures', 'music', 'hymn-in-g.pdf');

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// Every screen with an address of its own (tests/the-app-works-with-no-signal.mjs
// checks the worker's list against app/; this walks the same list).
const SCREENS = ['/', '/menu', '/church', '/library', '/settings', '/profile', '/ds', '/dm', '/talk', '/mail',
  '/study', '/guilds', '/cases', '/publish', '/apps', '/admin', '/office', '/sabbath', '/music', '/faq',
  '/privacy', '/policy', '/login', '/signup', '/join', '/password', '/forgot-password', '/new-password', '/setup'];
const FOLDERS = { Listen: '[data-music-listen]', Tuner: '[data-music-tuner]', Conductor: '[data-music-conductor]', Pieces: '[data-music-pieces]', Play: '[data-music-play]' };

/** A relay in front of the app, so the signal can be cut for this walk only. */
function relay(target) {
  const sockets = new Set();
  let up = true;
  const server = http.createServer((req, res) => {
    const out = http.request({ host: '127.0.0.1', port: target, method: req.method, path: req.url, headers: req.headers }, (answer) => {
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
    });
    out.on('error', () => res.destroy());
    req.pipe(out);
  });
  server.on('connection', (s) => {
    if (!up) { s.destroy(); return; }
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  return {
    start: () => new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port))),
    cut: () => { up = false; for (const s of sockets) s.destroy(); },
    stop: () => new Promise((r) => { up = false; for (const s of sockets) s.destroy(); server.close(() => r()); }),
  };
}

/** What a screen shows, and whether it is the app or a failure. */
async function look(page) {
  return page.evaluate(() => {
    const text = document.body ? document.body.innerText : '';
    return {
      at: location.pathname + location.search,
      chars: text.length,
      heading: (document.querySelector('h1, h2') || {}).innerText || '',
      failed: (/You're offline|You are offline|needs a fresh copy|Application error|Something went wrong|ChunkLoadError/i.exec(text) || [''])[0],
    };
  }).catch((e) => ({ at: '?', chars: 0, failed: String(e).slice(0, 80) }));
}

/** Ask the worker to keep everything, and wait for its count. */
function keepEverything(page) {
  return page.evaluate(() => new Promise((resolve) => {
    const done = setTimeout(() => resolve(null), 150000);
    const on = (e) => {
      if (e.data && e.data.type === 'KEPT') {
        clearTimeout(done);
        navigator.serviceWorker.removeEventListener('message', on);
        resolve(e.data);
      }
    };
    navigator.serviceWorker.addEventListener('message', on);
    navigator.serviceWorker.ready.then((r) => r.active.postMessage({ type: 'KEEP_EVERYTHING', pages: [] }));
  }));
}

(async () => {
  if (engineName !== 'chromium') {
    // Playwright cannot cut a service worker off in WebKit: its offline switch
    // and request routing reach a worker in Chromium only. Safari keeping the
    // app is therefore unproven by this walk, and the report says so.
    console.log(`SKIP the whole walk: Playwright drives service workers in Chromium only (engine: ${engineName})`);
    process.exit(0);
  }
  const line = relay(PORT);
  const port = await line.start();
  const BASE = `http://localhost:${port}`;
  const browser = await engine.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 3650 * 864e5)); } catch { /* fine */ }
  });
  const page = await context.newPage();
  const caught = pageErrors(page);
  // Every request for the app's own code that fails once the signal is cut.
  // A tool whose code is missing does not always throw where a walk can see
  // it (React catches a failed import and draws its own error), but the
  // request for the file always fails.
  let cutOff = false;
  const unanswered = new Set();
  page.on('requestfailed', (r) => {
    if (cutOff && new URL(r.url()).pathname.startsWith('/_next/static/')) unanswered.add(new URL(r.url()).pathname);
  });

  try {
    // ---- 1. With a signal, once -------------------------------------------
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await page.getByText('Maria Santos', { exact: true }).first().click();
    await page.waitForTimeout(1000);
    const consent = page.getByRole('button', { name: /I understand, continue/i });
    if (await consent.isVisible().catch(() => false)) await consent.click();
    await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
    await page.evaluate(() => navigator.serviceWorker.ready);
    const kept = await keepEverything(page);
    ok(!!kept && kept.total > 100 && kept.kept === kept.total,
       `with a signal, the worker keeps the whole app (${kept ? `${kept.kept} of ${kept.total} files` : 'no answer'})`);
    // The Explorers on her list, as the app offers them on its own.
    const people = await page.$$eval('a[href^="/dm/"]', (as) => as.map((a) => a.getAttribute('href')));
    await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    await page.goto(`${BASE}/settings?room=general`, { waitUntil: 'networkidle' });
    await page.locator('[data-kept-for-no-signal]').first().waitFor({ timeout: 10000 }).catch(() => {});
    const says = await page.locator('[data-kept-for-no-signal]').first().getAttribute('data-kept-for-no-signal').catch(() => null);
    ok(says === 'all', `Settings says every screen and tool is on this device (${says})`);

    // ---- 2. The signal goes; every screen ---------------------------------
    line.cut();
    await context.setOffline(true);
    cutOff = true;
    const failed = [];
    for (const screen of SCREENS) {
      await page.goto(`${BASE}${screen}`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const s = await look(page);
      // A screen is the app when it draws its heading and no failure. (/join
      // with no invitation is one short sentence, and correct.)
      if (s.failed || !s.heading) failed.push(`${screen} -> ${s.at} (${s.failed || `no heading, ${s.chars} characters`})`);
    }
    ok(failed.length === 0, `with no signal, all ${SCREENS.length} screens open${failed.length ? `; failed: ${failed.join('; ')}` : ''}`);

    // ---- 3. Into a folder, and every Music folder -------------------------
    await page.goto(`${BASE}/music?room=tuner`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.locator(FOLDERS.Tuner).first().waitFor({ timeout: 10000 }).catch(() => {});
    ok((await page.locator(FOLDERS.Tuner).count()) > 0, 'a link into a folder (/music?room=tuner) opens the Tuner');
    const shut = [];
    for (const [name, sel] of Object.entries(FOLDERS)) {
      await openRoom(page, name).catch(() => false);
      await page.locator(sel).first().waitFor({ timeout: 10000 }).catch(() => {});
      if (!(await page.locator(sel).count())) shut.push(name);
    }
    ok(shut.length === 0, `every Music folder opens${shut.length ? `; not: ${shut.join(', ')}` : ''}`);

    // ---- 4. An Explorer's own page ----------------------------------------
    if (people.length) {
      await page.goto(`${BASE}${people[0]}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(1500);
      const s = await look(page);
      ok(!s.failed && !!s.heading && s.at.startsWith('/dm/'), `an Explorer's own page opens from her list (${s.at}${s.failed ? `, ${s.failed}` : ''})`);
    } else {
      ok(false, "Maria's list linked to no Explorer's page, so none could be kept");
    }

    // ---- 5. The drawing board, and a music PDF ----------------------------
    await page.goto(`${BASE}/office?room=studies`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /^\+ New series$/ }).first().click().catch(() => {});
    await page.getByRole('button', { name: 'Draw a picture' }).first().click().catch(() => {});
    const board = page.locator('[data-drawing-board] canvas.interactive').first();
    const drawn = await board.waitFor({ timeout: 30000 }).then(() => true, () => false);
    if (drawn) {
      await page.locator('[data-drawing-board] label:has([data-testid="toolbar-rectangle"])').first().click();
      const box = await board.boundingBox();
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5, { steps: 4 });
      await page.mouse.up();
      await page.waitForTimeout(300);
    }
    const save = page.locator('[data-drawing-board] button', { hasText: /Save drawing/ }).first();
    ok(drawn && !(await save.isDisabled().catch(() => true)), 'the drawing board opens and draws');

    await page.goto(`${BASE}/music?room=pieces`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.locator('[data-score-input]').first().waitFor({ state: 'attached', timeout: 10000 }).catch(() => {});
    await page.locator('[data-score-input]').first().setInputFiles(HYMN_PDF).catch(() => {});
    const read = await page.locator('[data-score-note]').first().waitFor({ timeout: 30000 }).then(() => true, () => false);
    ok(read, 'a music PDF is read in Pieces');

    // ---- 6. The study room's editor, as an Explorer -----------------------
    await signInAsExplorer(page, BASE);
    await openStudyRoom(page, BASE).catch(() => {});
    await openPage(page, 0).catch(() => {});
    await page.locator('editor-host').first().waitFor({ timeout: 30000 }).catch(() => {});
    ok((await page.locator('editor-host').count()) > 0 && (await page.locator('affine-paragraph').count()) > 0,
       "John opens the study room's editor, and there is somewhere to type");

    const code = caught.list().filter((e) => /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed/i.test(e));
    ok(code.length === 0 && unanswered.size === 0,
       `no piece of the app's code was missing${code.length || unanswered.size ? ` (${[...unanswered].slice(0, 3).join(', ')}${code.length ? `; ${code[0].slice(0, 120)}` : ''})` : ''}`);
  } finally {
    await browser.close();
    await line.stop();
  }
  console.log(`\n(engine: ${engineName})`);
  console.log(bad ? `\n${bad} failed` : '\nAll OK');
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
