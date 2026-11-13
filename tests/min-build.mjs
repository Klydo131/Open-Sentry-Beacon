// The update floor, exercised without a browser or a server.
//
// Every assertion here is about not pestering somebody for no reason. The floor
// decides when the update reminder stops being polite and starts coming back
// every hour, so the rule that raises it has to be provably conservative: unset
// is off, a typo is off, and a floor set past the newest build that exists is
// clamped rather than obeyed. That last one is the whole reason this file
// exists — a floor of "2027" on a 2026 deployment would demand an update that
// cannot be downloaded, so the reminder could never be satisfied and people
// would learn to ignore it.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveMinBuildTime, isBelowFloor } from '../lib/min-build.mjs';

let bad = 0;
const ok = (cond, msg) => {
  if (!cond) bad++;
  console.log(`${cond ? 'OK ' : 'BAD'} ${msg}`);
};

const SERVER = '2026-08-06T12:00:00.000Z';
const OLD = '2026-07-01T09:30:00.000Z';
const OLDER = '2026-05-14T00:00:00.000Z';

// ---------------------------------------------------------------- the floor --

ok(resolveMinBuildTime(undefined, SERVER) === null, 'unset means no floor');
ok(resolveMinBuildTime('', SERVER) === null, 'empty string means no floor');
ok(resolveMinBuildTime('   ', SERVER) === null, 'whitespace means no floor');
ok(resolveMinBuildTime(null, SERVER) === null, 'null means no floor');
ok(resolveMinBuildTime('yesterday', SERVER) === null, 'an unparseable value means no floor');
ok(resolveMinBuildTime('2026-13-45', SERVER) === null, 'an impossible date means no floor');

ok(
  resolveMinBuildTime(OLD, SERVER) === new Date(OLD).toISOString(),
  'a floor behind the server is published as given',
);
ok(
  resolveMinBuildTime('2026-07-01 09:30:00Z', SERVER) === new Date(OLD).toISOString(),
  'a loosely written date is normalised to ISO',
);
ok(
  resolveMinBuildTime(`  ${OLD}  `, SERVER) === new Date(OLD).toISOString(),
  'surrounding whitespace is tolerated, as it is on every pasted value',
);
ok(
  resolveMinBuildTime(SERVER, SERVER) === SERVER,
  'a floor equal to the server build is allowed: everyone must be current',
);

// The one that matters.
ok(
  resolveMinBuildTime('2027-01-01T00:00:00.000Z', SERVER) === SERVER,
  'a floor past the server build is CLAMPED to the server build, never obeyed',
);
ok(
  isBelowFloor(SERVER, resolveMinBuildTime('2099-01-01T00:00:00.000Z', SERVER)) === false,
  'so the build a server is serving is never below its own floor',
);

// ------------------------------------------------------------ the comparison --

ok(isBelowFloor(OLD, null) === false, 'no floor never escalates');
ok(isBelowFloor(OLD, undefined) === false, 'a missing field never escalates');
ok(isBelowFloor(OLD, '') === false, 'an empty floor never escalates');
ok(isBelowFloor(OLD, 'nonsense') === false, 'an unreadable floor never escalates');
ok(isBelowFloor(undefined, SERVER) === false, 'a bundle with no stamp is never escalated');
ok(isBelowFloor('', SERVER) === false, 'a bundle with an empty stamp is never escalated');
ok(isBelowFloor('nonsense', SERVER) === false, 'a bundle with a bad stamp is never escalated');

ok(isBelowFloor(OLDER, OLD) === true, 'a bundle older than the floor is escalated');
ok(isBelowFloor(OLD, OLD) === false, 'a bundle exactly at the floor is fine');
ok(isBelowFloor(SERVER, OLD) === false, 'a bundle newer than the floor is fine');

// An old bundle, a newer release, and no floor: the ordinary case, and it must
// stay the ordinary case. This is the state almost every install is in for the
// minutes between a deploy and the next check, and escalating there would make
// every routine release feel like an emergency.
ok(
  isBelowFloor(OLD, resolveMinBuildTime(undefined, SERVER)) === false,
  'the default configuration escalates for nobody, ever',
);

// ----------------------------------------------- .env.example tells the truth --
//
// A setting documented under a name nothing reads is worse than an undocumented
// one: somebody sets it, redeploys, sees no effect, and has nothing to debug
// because there is no error anywhere to find. That happened here —
// `.env.example` offered HOPE_BEACON_MIN_BUILD_TIME while the code read
// BEACON_MIN_BUILD_TIME — so every variable the example offers is now checked
// against the source that is supposed to read it.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const declared = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]);

const sourceText = (function collect(dir, acc = []) {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) collect(rel, acc);
    else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) {
      acc.push(fs.readFileSync(path.join(root, rel), 'utf8'));
    }
  }
  return acc;
})('.').join('\n');

ok(declared.length > 0, `.env.example documents ${declared.length} setting(s)`);
for (const name of declared) {
  ok(
    sourceText.includes(`process.env.${name}`),
    `.env.example offers ${name}, and the code actually reads it`,
  );
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
assert.equal(bad, 0);
