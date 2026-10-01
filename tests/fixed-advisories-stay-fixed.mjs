// A security advisory that was fixed stays fixed, and one that was left is
// left in writing.
//
// ---------------------------------------------------------------------------
// WHY. A lockfile can quietly go back to an older version. A merge, a
// reinstall with an old lock, or a dependency that pins lower can each undo a
// fix nobody remembers making. And an advisory left open on purpose is only
// safe while the reason is written down where the next person will look.
//
// This reads the lockfile; it does not ask the network. `npm audit --omit=dev`
// is still the real check. docs/SECURITY.md, "Known advisories in what the app
// installs", says what was found and what was done.
//
//   node tests/fixed-advisories-stay-fixed.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const lock = JSON.parse(read('package-lock.json'));
const security = read('docs/SECURITY.md');

/** Every installed copy of a package, wherever in the tree it sits. */
const copies = (name) => Object.entries(lock.packages ?? {})
  .filter(([where]) => where === `node_modules/${name}` || where.endsWith(`/node_modules/${name}`))
  .map(([where, entry]) => ({ where, version: entry.version }));

const atLeast = (version, floor) => {
  const a = version.split(/[.-]/).map(Number);
  const b = floor.split('.').map(Number);
  for (let i = 0; i < b.length; i += 1) {
    if ((a[i] ?? 0) !== b[i]) return (a[i] ?? 0) > b[i];
  }
  return true;
};

// ---- Fixed: each package, and the lowest version that has the fix ----------
const FIXED = [
  // GHSA-p98j-92pf-mc4p, fixed 1 October 2026.
  { name: 'dompurify', floor: '3.4.16' },
];

for (const { name, floor } of FIXED) {
  const found = copies(name);
  ok(found.length > 0, `${name} is installed (${found.length} cop${found.length === 1 ? 'y' : 'ies'})`);
  const old = found.filter((c) => !atLeast(c.version, floor));
  ok(old.length === 0,
     old.length ? `${name} has gone back below ${floor}: ${old.map((c) => `${c.where}@${c.version}`).join(', ')}`
                : `every copy of ${name} is ${floor} or later`);
  ok(new RegExp(`\\*\\*${name}\\*\\*[^\\n]*Fixed`).test(security),
     `docs/SECURITY.md records the ${name} fix`);
}

// ---- Left on purpose: still written down, still out of the app --------------
{
  ok(/\*\*vitest\*\*[^\n]*Left, on purpose/.test(security),
     'docs/SECURITY.md says why the vitest advisory is left, and when to revisit it');
  // The reason it is safe to leave: nothing in the app runs it.
  const used = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { walk(rel); continue; }
      if (/\.(tsx?|mjs|js)$/.test(entry.name) && /from ['"](vitest|@vitest\/[^'"]+)['"]|require\(['"]vitest/.test(read(rel))) used.push(rel);
    }
  };
  ['app', 'components', 'lib'].forEach(walk);
  ok(used.length === 0,
     used.length ? `app code imports the test runner, so the reason for leaving it no longer holds: ${used.join(', ')}`
                 : 'and no app code imports vitest, which is the reason it may stay');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
