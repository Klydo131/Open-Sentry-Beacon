// Somebody who signs in with things waiting is told.
//
// THE ASK.
//
// It did not. The bell announced things that arrived WHILE somebody was already
// looking at the app, and deliberately said nothing on the first poll — which
// IS the sign-in moment, because the bell only mounts inside the signed-in
// shell. So the case that most needs a pop-up, opening the app to find a
// safeguarding report waiting, was the one case that never produced one.
//
// The silence had a real reason and it is kept: a quiet week fired ELEVEN
// separate pop-ups at once, and a person buried like that switches alerts off
// and then hears about nothing ever again. Silence is not the fix for eleven.
// One is.
//
// This runs the real decision. A browser here cannot help: pop-ups need a
// granted permission, a service worker and a device, and what would go wrong is
// a counting mistake nobody sees until a real person is buried or ignored.

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const target = pathToFileURL(path.resolve('lib/live/announce-plan.ts')).href;
let mod;
try {
  mod = await import(target);
} catch (err) {
  const strippable = /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/.test(
    String(err && (err.code || err.message)));
  if (!strippable || process.env.ANNOUNCE_RETRY === '1') {
    console.error('BAD could not load lib/live/announce-plan.ts on ' + process.version);
    process.exit(1);
  }
  const r = spawnSync(process.execPath,
    ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)],
    { stdio: 'inherit', env: { ...process.env, ANNOUNCE_RETRY: '1' } });
  process.exit(r.status ?? 1);
}
const { planAnnouncement, AT_MOST } = mod;

const item = (n) => ({ id: `n${n}`, title: `Thing ${n}`, body: '', type: 'message' });
const many = (n) => Array.from({ length: n }, (_, i) => item(i + 1));
const ON = { arriving: true, alerts: true, allowed: true };
const OPEN = { arriving: false, alerts: true, allowed: true };

// ---------------------------------------------------------------------------
// 1. THE BUG. Signing in with things waiting says something.
// ---------------------------------------------------------------------------
ok(planAnnouncement(many(1), ON).kind !== 'none',
   'signing in with one thing waiting is announced');
ok(planAnnouncement(many(3), ON).kind !== 'none',
   'signing in with three things waiting is announced');
ok(planAnnouncement(many(11), ON).kind !== 'none',
   'signing in with eleven things waiting is announced');

// ---------------------------------------------------------------------------
// 2. AND IS NEVER BURIED. One pop-up on arrival, whatever the number.
// ---------------------------------------------------------------------------
// This is the whole reason the first poll used to be silent. Eleven pop-ups
// teaches somebody to switch alerts off, and then they hear about nothing.
for (const n of [2, 3, 5, 11, 40]) {
  const plan = planAnnouncement(many(n), ON);
  ok(plan.kind === 'summary' && plan.count === n,
     `arriving to ${n} things gives ONE pop-up saying ${n}, not ${n} pop-ups`);
}

// A single item is shown as itself: "Melo asked for prayer" beats "1 thing is
// waiting", and it lands on the right screen when tapped.
{
  const plan = planAnnouncement([item(7)], ON);
  ok(plan.kind === 'one' && plan.item.id === 'n7',
     'a single waiting item is announced as itself, not as a count');
}

// ---------------------------------------------------------------------------
// 3. Things arriving while the app is open are unchanged.
// ---------------------------------------------------------------------------
{
  const plan = planAnnouncement(many(2), OPEN);
  ok(plan.kind === 'each' && plan.items.length === 2 && plan.heldBack === 0,
     'two arriving while watching are shown one at a time');
}
{
  const plan = planAnnouncement(many(9), OPEN);
  ok(plan.kind === 'each' && plan.items.length === AT_MOST,
     `never more than ${AT_MOST} at once, even while watching`);
  ok(plan.heldBack === 9 - AT_MOST, 'and the rest are counted rather than dropped');
}

// ---------------------------------------------------------------------------
// 4. Nothing is announced when it must not be.
// ---------------------------------------------------------------------------
ok(planAnnouncement([], ON).kind === 'none', 'nothing waiting, nothing said');
ok(planAnnouncement(many(5), { ...ON, alerts: false }).kind === 'none',
   'alerts switched off means silence, arriving or not');
ok(planAnnouncement(many(5), { ...OPEN, alerts: false }).kind === 'none',
   'and the same while the app is open');
ok(planAnnouncement(many(5), { ...ON, allowed: false }).kind === 'none',
   'a browser that has not granted permission is never talked over');

// ---------------------------------------------------------------------------
// 5. The wiring the plan depends on.
// ---------------------------------------------------------------------------
{
  const bell = readFileSync('components/LiveBell.tsx', 'utf8');
  const shipped = bell.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  ok(/planAnnouncement\(/.test(shipped), 'the bell asks the planner rather than counting inline');

  // NOT NAGGING is what makes announcing on arrival safe: the announced set is
  // persisted, so the same unread items are announced once per device however
  // many times the app is opened.
  ok(/localStorage\.setItem\(\s*\n?\s*'hb-announced'/.test(shipped),
     'what has been announced is remembered on the device');
  ok(/hb-announced/.test(shipped) && /announced\.current = new Set/.test(shipped),
     'and read back, so opening the app twice does not announce twice');

  // Coming back online has to actually check.
  ok(/addEventListener\('online'/.test(shipped),
     'coming back online re-checks, rather than waiting for the next poll');
  ok(/visibilitychange/.test(shipped),
     'and so does coming back to the tab');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
