// Known security advisories against this app's packages, and the ones this
// project has decided to live with, for now and for a stated reason.
//
//   node scripts/audit-gate.mjs
//
// ---------------------------------------------------------------------------
// WHY. In October 2026 `npm audit` reported 76 findings, all from two causes
// inside the Study Room's editor that had no fix yet. A number like that stops
// being read: the 77th, from something new and fixable, would sit in the same
// pile. So each accepted advisory is written down by its id in
// security/accepted-advisories.json, with why and a date to look at it again,
// and this gate fails on anything of moderate severity or worse that is not
// there, and on any acceptance whose date has passed. Asked for on 26 October
// 2026: "update our security system with better layer system". Layer 1 in
// docs/SECURITY-LAYERS.md.
//
// It reads the lockfiles only: nothing is installed and no package's install
// script runs. It needs the npm registry, so it runs in CI
// (.github/workflows/audit.yml, every week and on every change to a lockfile)
// rather than in `npm run verify`, which works with no network.
//
// EXIT 0 all clear; 1 something to act on; 2 the registry could not be asked
// (never read as a pass).
// ---------------------------------------------------------------------------
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const register = JSON.parse(fs.readFileSync(path.join(root, 'security/accepted-advisories.json'), 'utf8'));
const accepted = new Map(register.accepted.map((a) => [a.id, a]));
const RANK = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };
const today = new Date().toISOString().slice(0, 10);

let failures = 0;
const fail = (msg) => { console.log(`FAIL  ${msg}`); failures++; };

/** Every advisory npm reports for the project in `dir`: id -> { package, severity, title }. */
function advisories(dir) {
  const r = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--json'], {
    cwd: path.join(root, dir), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  let report;
  try { report = JSON.parse(r.stdout); } catch { report = null; }
  if (!report || report.error || !report.metadata) {
    console.log(`Could not ask the registry about ${dir}: ${report?.error?.summary ?? r.stderr.trim().split('\n')[0] ?? 'no answer'}`);
    process.exit(2);
  }
  const found = new Map();
  for (const v of Object.values(report.vulnerabilities ?? {})) {
    for (const via of v.via) {
      if (typeof via !== 'object' || !via.url) continue;
      const id = via.url.split('/').pop();
      found.set(id, { package: via.name, severity: via.severity, title: via.title });
    }
  }
  return found;
}

const seen = new Set();
for (const dir of ['.', 'selfhost/server']) {
  const found = advisories(dir);
  console.log(`\n${dir === '.' ? 'The app' : 'The Postgres edition'}: ${found.size} advisor${found.size === 1 ? 'y' : 'ies'}`);
  for (const [id, a] of found) {
    seen.add(id);
    const ok = accepted.get(id);
    if (ok) {
      console.log(`  accepted  ${id}  ${a.package} (${a.severity}): ${a.title}`);
    } else if (RANK[a.severity] >= RANK.moderate) {
      fail(`${id}  ${a.package} (${a.severity}): ${a.title}. Update it, or record why it is accepted in security/accepted-advisories.json.`);
    } else {
      console.log(`  noted     ${id}  ${a.package} (${a.severity}): ${a.title}`);
    }
  }
}

console.log('');
for (const a of register.accepted) {
  if (!a.why || !a.review_by) fail(`${a.id}: an acceptance needs a reason and a review_by date`);
  else if (a.review_by < today) fail(`${a.id} (${a.package}): accepted until ${a.review_by}, which has passed. Look at it again.`);
  else if (!seen.has(a.id)) console.log(`note  ${a.id} (${a.package}) is no longer reported: take it out of the register.`);
}

console.log(failures ? `\nRESULT: ${failures} to act on` : '\nRESULT: nothing new; every accepted advisory is within its review date');
process.exit(failures ? 1 : 0);
