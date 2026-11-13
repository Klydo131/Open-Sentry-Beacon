// Does `npm run dev` actually show the app?
//
// WHY THIS EXISTS. The README's first instruction to a newcomer is "try it in
// two minutes: git clone, npm install, npm run dev". On 2026-08-12 that produced
// a blank white page. HTTP 200, correct <title>, nothing rendered.
//
// The cause was the Content-Security-Policy. Next.js's dev server compiles and
// hot-reloads through `eval`, and `script-src` had no 'unsafe-eval', so React
// never started. Production was always fine — `next build` does not use eval and
// the strict policy is exactly right there.
//
// AND NOTHING CAUGHT IT, for a reason worth writing down. `npm run verify`
// builds for production and runs every end-to-end walk against `next start`.
// Thirty checks, all green, all answering "does the built app work?" — while the
// command the README leads with was broken. That is the third time in this
// project a green suite has been silent about something nobody thought to ask
// it: the seeker's stage, the mailbox link, and now the front door itself.
//
// So this test asks the narrow question the others could not: boot the DEV
// server, fetch the page, and check that something is on it.
//
//   node tests/dev-server.mjs
//
// Plain Node, no Playwright — it must run anywhere, including a machine that has
// never installed a browser.

import { spawn } from 'node:child_process';
import net from 'node:net';

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// A port nobody else is on. Asking the OS for one and releasing it immediately
// is racy in theory; in practice it beats a hard-coded port that collides with
// whatever the developer already has running.
const port = await new Promise((resolve, reject) => {
  const srv = net.createServer();
  srv.once('error', reject);
  srv.listen(0, '127.0.0.1', () => {
    const { port } = srv.address();
    srv.close(() => resolve(port));
  });
});

// shell: true on Windows, where npm is a .cmd shim and Node refuses to spawn it
// without one (the CVE-2024-27980 hardening). Same reason scripts/verify.mjs
// does it; see tests/test-portability.mjs, which enforces the rule.
const NEEDS_SHELL = process.platform === 'win32';
const dev = spawn('npm', ['run', 'dev', '--', '-p', String(port)], {
  shell: NEEDS_SHELL,
  // Its own process group, so stop() can take the whole tree down.
  // `npm run dev` spawns `next dev` as a CHILD: killing the npm wrapper
  // alone orphans the server, which keeps the port and keeps compiling.
  // Six of them were left running before this was noticed.
  detached: !NEEDS_SHELL,
  stdio: ['ignore', 'pipe', 'pipe'],
  // Its own build directory, so booting dev does not wipe the production
  // build that the end-to-end phase is about to start.
  env: { ...process.env, NODE_ENV: 'development', BEACON_DIST_DIR: '.next-dev' },
});

let log = '';
dev.stdout.on('data', (d) => (log += d));
dev.stderr.on('data', (d) => (log += d));

const stop = () => {
  // By PID, never by pattern. `pkill -f run-next` once matched the shell that
  // was running it and killed a sibling test suite mid-flight, producing nine
  // failures that looked like a regression and were not.
  //
  // The negative PID is the process GROUP: npm is only the wrapper, and the
  // `next dev` it spawns is what actually holds the port.
  try {
    if (NEEDS_SHELL) process.kill(dev.pid);
    else process.kill(-dev.pid, 'SIGTERM');
  } catch {
    /* already gone */
  }
};

// Also on the way out, however we leave — a thrown assertion or a Ctrl-C must
// not strand a server either.
process.on('exit', stop);
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});

const deadline = Date.now() + 90_000;
let ready = false;
while (Date.now() < deadline) {
  if (/Ready in|started server/i.test(log)) {
    ready = true;
    break;
  }
  if (dev.exitCode !== null) break;
  await new Promise((r) => setTimeout(r, 300));
}
ok(ready, `the dev server starts (port ${port})`);

if (ready) {
  let res, html = '';
  try {
    res = await fetch(`http://127.0.0.1:${port}/`, {
      // NINETY SECONDS, RAISED FROM THIRTY, and the reason matters more than
      // the number. `next dev` compiles on demand, and the study room's editor
      // put seventy more packages into the graph -- the first request measured
      // 29.8s against a 30s limit, which passes and then does not, at random,
      // on a slower machine or a cold cache.
      //
      // This check is not a speed check. It exists because a
      // Content-Security-Policy without 'unsafe-eval' makes the dev server
      // answer 200 with a BLANK page, which is what happened on 2026-08-12 and
      // is what the assertions below actually look for. A longer patience still
      // catches that; a tight one just makes the gate lie at random.
      signal: AbortSignal.timeout(90_000),
    });
    html = await res.text();
  } catch (e) {
    ok(false, `the dev server answers: ${e.message}`);
  }

  if (res) {
    ok(res.status === 200, `it answers 200 (got ${res.status})`);

    // The header is the direct cause, so check it directly. A dev server that
    // forbids eval is a blank page, every time.
    const csp = res.headers.get('content-security-policy') || '';
    ok(
      /script-src[^;]*'unsafe-eval'/.test(csp),
      "dev's script-src allows 'unsafe-eval', so React can boot",
    );

    // The header is the cause; the rendered DOM is the symptom. This app's
    // front door is a CLIENT component, so the server sends an almost-empty
    // shell BY DESIGN and the initial HTML cannot answer "did React start".
    //
    // The first version of this test asserted on that HTML anyway and failed on
    // a perfectly working app — a check that is right about the bug and wrong
    // about the evidence, which is how a suite teaches people to ignore it. The
    // header assertion above is the one that catches this defect on its own.
    //
    // When Playwright happens to be available, ask the real question too. It is
    // deliberately not a dependency of this project (see tests/e2e/_playwright),
    // so this is a bonus rather than a requirement.
    let browser = null;
    try {
      ({ chromium: browser } = await import('./e2e/_playwright.js').then((m) => m.default ?? m));
    } catch {
      browser = null;
    }
    if (browser) {
      let rendered = 0;
      try {
        const b = await browser.launch(
          process.env.PLAYWRIGHT_BROWSERS_PATH
            ? { executablePath: '/opt/pw-browsers/chromium' }
            : {},
        );
        const pg = await b.newPage();
        await pg.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
        await pg.waitForTimeout(2500);
        rendered = (await pg.locator('body').innerText()).trim().length;
        await b.close();
      } catch {
        rendered = -1;
      }
      if (rendered >= 0) {
        ok(rendered > 200, `React actually renders the page (${rendered} chars on screen)`);
      } else {
        console.log('--  browser check skipped (Playwright present but would not launch)');
      }
    } else {
      console.log('--  browser check skipped (Playwright not installed; header check stands)');
    }
  }
}

stop();

// Production must NOT get the relaxation. Checked from the config source rather
// than by running a second server: the conditional is the invariant.
const cfg = await import('node:fs').then((fs) =>
  fs.readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8'),
);
ok(
  /DEV\s*\?\s*" 'unsafe-eval'"/.test(cfg),
  "'unsafe-eval' is inside the DEV conditional, so production never sends it",
);
ok(
  !/"script-src[^"]*'unsafe-eval'/.test(cfg),
  "'unsafe-eval' is not in the unconditional script-src list",
);

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
