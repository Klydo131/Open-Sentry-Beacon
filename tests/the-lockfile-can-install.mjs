// package.json and package-lock.json agree, so `npm ci` can start.
//
// THIS IS tests/workflows.mjs ONE LEVEL DOWN, and it is here because the same
// class of failure got through a second time. That check exists because a
// workflow file was rejected by GitHub and never executed while the Actions tab
// stayed green. This one exists because a workflow that DID execute died on its
// first step, and the step that runs the gate was skipped.
//
// What happened: a commit added `esbuild` to package.json's devDependencies and
// did not update package-lock.json. `npm install` does not care -- it fixes the
// lock as it goes, which is why every local run kept passing. `npm ci` refuses,
// by design: its whole promise is that it installs the lock exactly, so a lock
// that disagrees with the manifest is an error rather than something to repair.
// Both CI workflows that build this project start with `npm ci`.
//
// So for five days, on every push, all three runners failed at Install and
// reported `Verify` as SKIPPED -- and `npm run verify` said 130 checks passed
// on the machine that made the change. "The gate is green" and "the gate has
// not run anywhere but this laptop" were comfortably true at the same time,
// which is the sentence tests/workflows.mjs already has in it.
//
// WHAT THIS DOES NOT DO. It is not `npm ci`. It does not resolve the tree, walk
// peer dependencies, or check that every transitive edge in the lock is
// satisfiable -- npm found several of those too, once it got past this. Doing
// that honestly means running the real thing, and the real thing needs the
// network, which the static gate deliberately does not have. What it catches is
// the failure that actually shipped: a package named in one file and not the
// other. That is the whole of the first thing `npm ci` checks, and it is the
// one a person editing package.json by hand can cause.
//
//   node tests/the-lockfile-can-install.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lockPath = path.join(root, 'package-lock.json');

ok(fs.existsSync(lockPath), 'package-lock.json exists');
if (!fs.existsSync(lockPath)) {
  console.log('\nRESULT: 1 FAILURE(S)');
  process.exit(1);
}
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));

// `packages` arrived in lockfileVersion 2. Below that there is no root entry to
// compare against and npm would be reading a format it no longer writes.
ok(lock.lockfileVersion >= 2, `lockfile format v${lock.lockfileVersion} has a packages map`);
ok(lock.name === pkg.name, `lock is for ${pkg.name}`);

const rootEntry = lock.packages?.[''] ?? {};

// The two manifests, compared field by field. npm compares the RANGE, not the
// installed version: a lock recording "^0.28.0" against a package.json asking
// for "^0.28.2" is out of sync even when the version on disk satisfies both,
// because the lock no longer records what was asked for.
for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  const declared = pkg[field] ?? {};
  const locked = rootEntry[field] ?? {};

  for (const [name, range] of Object.entries(declared)) {
    ok(name in locked, `${field}: ${name} is in the lock`);
    if (name in locked) {
      ok(
        locked[name] === range,
        `${field}: ${name} range agrees (package.json ${range}, lock ${locked[name]})`,
      );
    }
    // A name in both manifests still has to have something to install. This is
    // what makes the check about `npm ci` rather than about tidiness.
    ok(
      `node_modules/${name}` in (lock.packages ?? {}),
      `${field}: ${name} has an entry to install from`,
    );
  }

  // The other direction. A dependency removed from package.json and left in the
  // lock is the same disagreement wearing the other hat, and npm rejects it the
  // same way.
  for (const name of Object.keys(locked)) {
    ok(name in declared, `${field}: ${name} is in the lock and still wanted`);
  }
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
