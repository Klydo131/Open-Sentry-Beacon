// A security fix in a dependency stays fixed: no installed copy goes back
// below the version that has it. Reads the lockfile; `npm audit` is still the
// live check.
//
//   node tests/fixed-advisories-stay-fixed.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

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

const FIXED = [
  { name: 'dompurify', floor: '3.4.16' },
  { name: 'next', floor: '15.5.27' },
  { name: 'sharp', floor: '0.35.5' },
  { name: 'source-map-js', floor: '1.2.2' },
  { name: 'vitest', floor: '4.1.11' },
  { name: '@vitest/mocker', floor: '4.1.11' },
];

for (const { name, floor } of FIXED) {
  const found = copies(name);
  const old = found.filter((c) => !atLeast(c.version, floor));
  ok(found.length > 0 && old.length === 0,
     old.length ? `${name} has gone back below ${floor}: ${old.map((c) => `${c.where}@${c.version}`).join(', ')}`
                : `every copy of ${name} is ${floor} or later (${found.length})`);
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
