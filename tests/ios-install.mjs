// What an iPhone needs before "Add to Home Screen" produces an app.
//
// THE BUG THIS EXISTS FOR, reported as (a bug report).
//
// `appleWebApp: { capable: true }` in app/layout.tsx no longer emits what its
// name says. Next emits the STANDARDISED `mobile-web-app-capable`, and Safari
// has never read that name -- it reads `apple-mobile-web-app-capable` and
// nothing else. So the built head carried a capable tag that Safari ignores and
// no capable tag that it honours.
//
// Without it, Add to Home Screen makes a BOOKMARK. Tapping the icon opens
// Safari with the address bar showing. Nothing errors, nothing warns: the
// person followed the steps, got an icon, tapped it, and landed in a browser.
// Reported as (a bug report), which is an accurate description.
//
// Safari 17.4+ reads `display` from the manifest and copes without the tag.
// Every iPhone below that needs it, and on a congregation's phones that is a
// great many of them.
//
// THIS CHECKS THE BUILT HTML, NOT THE SOURCE. The whole failure was a framework
// changing what a source setting emits, so reading app/layout.tsx would have
// confirmed the bug was absent while it was shipping. Only the output settles
// it, which is why this test needs a server and lives with the e2e-ish checks.

import { readFileSync, existsSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const PORT = Number(process.env.IOS_INSTALL_PORT || 41955);
const BASE = `http://127.0.0.1:${PORT}`;

// ---------------------------------------------------------------------------
// The source side: the browser-detection rules, read directly.
// ---------------------------------------------------------------------------
const SRC = 'components/InstallPrompt.tsx';
ok(existsSync(SRC), 'the install prompt exists');
const src = existsSync(SRC) ? readFileSync(SRC, 'utf8') : '';

// Blank comments, keep line numbers. This scanner has caught its own prose
// twice before in this repository.
const code = src.split('\n')
  .map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l))
  .join('\n');

// iPadOS 13+ reports itself as a Mac. A detector that only looks for "iPad"
// misses every modern iPad, which then gets the Chrome install button that
// Safari will never honour.
ok(/maxTouchPoints/.test(code),
   'iPad is detected by touch points, since iPadOS reports itself as a Mac');

// Chrome, Firefox, Edge and Opera on iOS cannot install an app -- Apple allows
// only Safari to. Printing Safari's Share steps to somebody in Chrome names a
// browser they are not in, about a control that would not work there anyway.
for (const marker of ['CriOS', 'FxiOS', 'EdgiOS']) {
  ok(new RegExp(marker).test(code),
     `a non-Safari iOS browser is detected (${marker}), so the first step can be to leave it`);
}

// Each of those browsers keeps "Safari" and "Version/" in its user agent, so a
// Safari test that runs first matches all of them. Order is the property.
const criosAt = code.indexOf('CriOS');
const safariTestAt = code.search(/return\s*''\s*;\s*\n\s*\}/);
ok(criosAt !== -1 && (safariTestAt === -1 || criosAt < safariTestAt),
   'the specific browsers are tested before falling through to Safari');

// THE ONE-TAP HANDOFF, and the gate that keeps it on the right platform.
//
// `x-safari-https://...` asks iOS to reopen the page in Safari, which is the
// only browser Apple lets install an app. It must never be offered anywhere
// else: in-app browsers exist on Android too, and telling an Android user to
// open Safari names a browser their phone does not have.
//
// This is checked here, at the source, because it cannot be checked in the
// browser. tests/e2e/safari-handoff.js tried and its Android assertion passed
// with the gate deliberately removed -- the surface it reads never renders the
// handoff on Android for an unrelated reason. This check does fail when the
// gate goes.
ok(/x-safari-/.test(code), 'a one-tap handoff into Safari exists');
{
  const fn = code.slice(code.indexOf('export function safariHandoffUrl'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  ok(/!isIos\(\)/.test(body),
     'and it is gated on iOS, so Android is never told to open Safari');
  ok(body.indexOf('!isIos()') < body.indexOf('x-safari-'),
     'with the gate BEFORE the link is built, not after');
}

// ---------------------------------------------------------------------------
// The output side: what actually reaches an iPhone.
// ---------------------------------------------------------------------------
// THIS TEST STARTS ITS OWN SERVER, AND THE FIRST VERSION DID NOT.
//
// It used to skip when nothing was listening, and print ALL OK on the way out.
// The negative control caught that within a minute of the test being written:
// run against a build with the fix deliberately removed, before the server had
// finished starting, and it reported a clean pass over the exact bug it exists
// to catch. A check that passes when it could not look is worse than no check,
// because it is believed.
//
// So it serves the build itself, and a server it cannot reach is a FAILURE.
async function reachable(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch { return false; }
}

let html = '';
let child = null;

if (!(await reachable(BASE))) {
  if (!existsSync('.next')) {
    ok(false, 'a build exists to serve (run npm run build first)');
    console.log(`\nRESULT: ${bad} FAILURE(S)`);
    process.exit(1);
  }
  // NEXT'S OWN CLI, NOT `npx`.
  //
  // `spawn('npx', ...)` fails on Windows with ENOENT, because npx is npx.cmd
  // there and spawn without a shell will not find it. This suite has been
  // failing on every Windows run for that one reason. scripts/run-next.mjs
  // already solved it by resolving the CLI and running it under this same Node,
  // which needs no shell on any platform.
  const { spawn } = await import('node:child_process');
  const { createRequire } = await import('node:module');
  const cli = createRequire(import.meta.url).resolve('next/dist/bin/next');
  child = spawn(process.execPath, [cli, 'start', '-p', String(PORT)], {
    stdio: 'ignore', detached: false,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline && !(await reachable(BASE))) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

try {
  const res = await fetch(BASE, { signal: AbortSignal.timeout(15000) });
  html = await res.text();
} catch {
  ok(false, `the built page is reachable on ${BASE} so its head can be read`);
  if (child) child.kill();
  console.log(`\nRESULT: ${bad} FAILURE(S)`);
  process.exit(1);
}

ok(/<meta name="apple-mobile-web-app-capable" content="yes"/.test(html),
   'the built head carries apple-mobile-web-app-capable, the only capable tag Safari reads');

// Keep the standard one too. Chrome and Edge read it, and emitting both costs
// nothing -- this is not a swap, it is an addition.
ok(/<meta name="mobile-web-app-capable" content="yes"/.test(html),
   'and still carries the standard mobile-web-app-capable for everyone else');

// iOS will not use an SVG for a home-screen icon and falls back to a SCREENSHOT
// of the page when there is no apple-touch-icon -- which looks like a broken
// install even when the install worked.
const appleIcon = /<link rel="apple-touch-icon" href="([^"]+)"/.exec(html);
ok(Boolean(appleIcon), 'a raster apple-touch-icon is linked, so iOS does not use a screenshot');
if (appleIcon) {
  ok(!/\.svg/i.test(appleIcon[1]), 'and it is not an SVG, which iOS refuses for this');
  try {
    const r = await fetch(BASE + appleIcon[1], { signal: AbortSignal.timeout(10000) });
    ok(r.ok, `and it is actually served (${r.status})`);
  } catch {
    ok(false, 'and it is actually served');
  }
}

// The manifest still has to say standalone: that is what Safari 17.4+ reads,
// and what every other platform reads regardless of the Apple tag.
try {
  const m = await (await fetch(`${BASE}/manifest.webmanifest`, { signal: AbortSignal.timeout(10000) })).json();
  ok(m.display === 'standalone', 'the manifest asks for standalone');
  ok(m.id === '/', 'the manifest id is pinned, so an update cannot become a second icon');
  ok(Array.isArray(m.icons) && m.icons.some((i) => /png$/i.test(i.src || '')),
     'the manifest offers a PNG icon, not only SVG');
} catch {
  ok(false, 'the manifest is served and is valid JSON');
}

if (child) child.kill();

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
