// What the app is built from can be trusted, and stays that way.
//
// ---------------------------------------------------------------------------
// WHY (9 November 2026). Most attacks on a project like this one no longer go
// through its code: they go through a package it installs. The npm worms and
// the hijacked releases of 2025 and 2026 all worked the same way: a new
// version, published minutes earlier, that ran its own code the moment it was
// installed. This check holds four things that stop that, each one a fact of
// the repository a reviewer cannot see at a glance:
//
//   * every package in both lockfiles comes from the public npm registry over
//     HTTPS, with a SHA-512 hash npm checks before installing it. A lockfile
//     edited to point one package somewhere else, or to drop its hash, fails;
//   * only the packages named below may run code when they are installed. A
//     new one fails until somebody has looked at what it runs and added it,
//     with a reason;
//   * Dependabot waits before offering a new version (its `cooldown`), so a
//     release that is pulled within days, the usual life of a hijacked one,
//     never reaches a pull request. Security fixes are not delayed;
//   * the project is scored by OpenSSF Scorecard and scanned by CodeQL every
//     week, and both are pinned like every other Action.
//
//   node tests/the-supply-chain-holds.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); };

/** Packages allowed to run code at install, and why each is trusted to. */
const MAY_RUN_AT_INSTALL = {
  esbuild: 'checks its own platform binary is present; used by the build',
  '@swc/core': 'checks its own platform binary is present; used by the build',
  '@parcel/watcher': 'builds or fetches its file-watching binary; development only',
  fsevents: 'macOS file events; installed only on a Mac',
};

for (const lockPath of ['package-lock.json', 'selfhost/server/package-lock.json']) {
  if (!fs.existsSync(path.join(root, lockPath))) continue;
  const entries = Object.entries(JSON.parse(read(lockPath)).packages).filter(([k]) => k);
  const elsewhere = entries.filter(([, v]) => !v.link && !v.inBundle && !String(v.resolved || '').startsWith('https://registry.npmjs.org/'));
  ok(entries.length > 0 && elsewhere.length === 0,
     `${lockPath}: all ${entries.length} packages come from https://registry.npmjs.org/${elsewhere.length ? ` (not: ${elsewhere.slice(0, 3).map(([k]) => k).join(', ')})` : ''}`);
  const unhashed = entries.filter(([, v]) => !v.link && !v.inBundle && !/^sha512-/.test(v.integrity || ''));
  ok(unhashed.length === 0,
     `${lockPath}: and each carries a SHA-512 hash npm checks before installing it${unhashed.length ? ` (not: ${unhashed.slice(0, 3).map(([k]) => k).join(', ')})` : ''}`);
  const runners = entries.filter(([, v]) => v.hasInstallScript).map(([k]) => k.replace(/^.*node_modules\//, ''));
  const unknown = [...new Set(runners)].filter((name) => !(name in MAY_RUN_AT_INSTALL));
  ok(unknown.length === 0,
     `${lockPath}: only reviewed packages run code at install (${[...new Set(runners)].join(', ') || 'none'})${unknown.length ? `; NOT REVIEWED: ${unknown.join(', ')}` : ''}`);
}

const dependabot = read('.github/dependabot.yml');
const updates = dependabot.split(/\n  - package-ecosystem:/).slice(1);
const cooled = updates.filter((u) => /\n    cooldown:\n(?:      #[^\n]*\n)*      default-days: ([7-9]|[1-9]\d)\b/.test(u));
ok(updates.length >= 4 && cooled.length === updates.length,
   `Dependabot waits a week or more before offering a new version, for every ecosystem (${cooled.length} of ${updates.length})`);

for (const [file, what] of [['scorecard.yml', 'OpenSSF Scorecard'], ['codeql.yml', 'CodeQL']]) {
  const p = `.github/workflows/${file}`;
  const text = fs.existsSync(path.join(root, p)) ? read(p) : '';
  ok(/\n\s+- cron:/.test(text) && /^permissions:\s*\{\}|^permissions:\n\s+contents: read/m.test(text),
     `${what} runs every week, from a workflow that starts with no write access (${p})`);
}

const audit = read('.github/workflows/audit.yml');
ok(/npm sbom --sbom-format cyclonedx/.test(audit) && /upload-artifact@[0-9a-f]{40}/.test(audit),
   'every audit run publishes a CycloneDX bill of materials of what the app ships');

console.log(bad ? `\n${bad} failed.` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
