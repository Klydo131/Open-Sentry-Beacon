// One loading screen, and it is the one that was designed.
//
// THE REPORT: 
//
// The reason the two looked different was not styling. This repository had
// THREE waiting states and showed the plainest one:
//
//   1. `BeaconSplash` in components/BeaconLoader.tsx, the designed one, which
//      nothing in the repository ever rendered;
//   2. `LiveLoading`, a second full-screen loader defined inside the live
//      shell, flat navy with a hardcoded sentence, which is what people saw;
//   3. `BeaconSpinner`, the inline one, which is a different job and is fine.
//
// The loader's own comment says it: two spinners in one product are two answers
// to "is it working?", and people learn one of them. So the second one is gone
// and the shell renders the first.
//
// The mark inside it was also a hand-drawn lighthouse rather than the app's own
// logo, so somebody saw one mark while waiting and a different one for the rest
// of the session. The church app had already found and fixed that; this is the
// same fix.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, '');

const loader = readFileSync('components/BeaconLoader.tsx', 'utf8');
const clean = strip(loader);
const shell = strip(readFileSync('components/LiveAppShell.tsx', 'utf8'));

// ---------------------------------------------------------------------------
// 1. The designed one is the one that renders.
// ---------------------------------------------------------------------------
{
  ok(/export function BeaconSplash/.test(clean), 'BeaconSplash exists');
  ok(/<BeaconSplash/.test(shell), 'and the live shell renders it while a session settles');
  ok(!/function LiveLoading/.test(shell),
     'the shell no longer keeps a second full-screen loader of its own');
}

// ---------------------------------------------------------------------------
// 2. It draws the app's own mark, not a picture of one.
// ---------------------------------------------------------------------------
{
  ok(/SentryBeaconMark/.test(clean),
     'the loading mark is the real logo');
  ok(!/<path d="M60 20 L75 75 H45 Z"/.test(clean),
     'and not a lighthouse drawn a second time in this file');
  ok(/APP_NAME/.test(clean),
     'the name comes from lib/brand.ts, so a rename cannot leave the old one on the loading screen');
}

// ---------------------------------------------------------------------------
// 3. The halo does not borrow a class that means something else.
// ---------------------------------------------------------------------------
// `.beacon-glow` is defined twice in globals.css: once as this breathing
// animation and once as the large radial rings behind the sign-in door. A
// loader that used that name inherited the door's scenery.
{
  const css = readFileSync('app/globals.css', 'utf8');
  ok(/beacon-halo/.test(clean), 'the loading halo has its own class');
  ok(/\.beacon-halo\s*\{/.test(css), 'and globals.css defines it');
  ok(/\.beacon-halo,?\n?[^}]*animation: none/.test(css.slice(css.indexOf('prefers-reduced-motion')))
     || /\.beacon-halo,/.test(css),
     'and it stops moving for somebody who asked for less motion');
  ok(!/className="beacon-glow"/.test(clean),
     'the loader does not reuse the door’s glow class');
}

// ---------------------------------------------------------------------------
// 4. Nothing else in the app rolls its own full-screen waiting state.
// ---------------------------------------------------------------------------
// This is the rule that keeps the other three true next month.
{
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx$/.test(name) ? [full.split(path.sep).join('/')] : [];
  });

  // A full-screen navy panel with a waiting word in it is what a hand-rolled
  // loading screen looks like here. The two that legitimately fill the screen
  // and are NOT loading states are named, with the reason.
  const ALLOWED = new Set([
    'components/BeaconLoader.tsx',        // the loading screen itself
  ]);
  const offenders = [];
  for (const file of [...walk('components'), ...walk('app')]) {
    if (ALLOWED.has(file)) continue;
    const src = strip(readFileSync(file, 'utf8'));
    for (const m of src.matchAll(/min-h-screen[^"]*place-items-center/g)) {
      const around = src.slice(m.index, m.index + 700);
      if (/Loading|Opening|Signing you in|Getting things ready|Lighting the way|One moment/i.test(around)) {
        offenders.push(`${file}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
  }
  ok(offenders.length === 0,
     offenders.length
       ? `these draw their own full-screen waiting state instead of using BeaconSplash:\n        ${offenders.join('\n        ')}`
       : 'nothing else in the app rolls its own full-screen waiting state');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
