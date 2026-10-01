// Every package this app is built from is under a licence we can ship, and
// its notice ships with the app.
//
// ---------------------------------------------------------------------------
// Asked for on 1 October 2026: "Make sure we don't have any issues with our
// open source project when it comes to other companies." The licence audit of
// that day found no incompatible licence -- and nothing that would have stopped
// one arriving with the next `npm install`, and no third-party notice anywhere
// in the built app. This holds both:
//
//   1. AN ALLOWLIST, not a blocklist. Each installed production package's
//      licence must be one this project has looked at and can ship under
//      AGPL-3.0-only. A new kind of licence fails here until a person reads it
//      and adds it, with a reason.
//   2. THE NOTICES. scripts/third-party-notices.mjs lists every one of those
//      packages with its licence text, runs at every build and dev server, and
//      Settings links what it writes.
//
//   node tests/dependency-licences.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { productionPackages, noticesText } from '../scripts/third-party-notices.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

/**
 * Licences that may reach a browser, each read and found compatible with
 * AGPL-3.0-only. Permissive ones ask for their notice to travel with the code,
 * which the notices file does; MPL-2.0 is per-file copyleft, satisfied by
 * naming where its source is (the notices file does that too).
 */
const ALLOWED = new Set([
  'MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Zlib',
  'CC0-1.0', 'Unlicense', 'BlueOak-1.0.0', 'MPL-2.0',
]);

/** Allowed for one named reason each, because they never reach a browser. */
const SERVER_OR_BUILD_ONLY = [
  // libvips, the image library under next/image's optimiser: runs on the
  // server, is never sent to anybody, and is dynamically linked as LGPL asks.
  { name: /^@img\/sharp-(libvips-|wasm32)/, licence: 'LGPL-3.0-or-later' },
  // Browser-support DATA read while building; not code, and not in the app.
  { name: /^caniuse-lite$/, licence: 'CC-BY-4.0' },
];

/** Whether an SPDX expression is allowed for this package. OR needs one side; AND needs every part. */
function allowed(pkg) {
  const expr = pkg.licence.replace(/\s*\(read from its licence file\)$/, '').replace(/[()]/g, ' ').trim();
  const ok1 = (id) => ALLOWED.has(id)
    || SERVER_OR_BUILD_ONLY.some((x) => x.name.test(pkg.name) && x.licence === id);
  return expr.split(/\s+OR\s+/).some((alt) => alt.split(/\s+AND\s+/).map((s) => s.trim()).every(ok1));
}

const packages = productionPackages(root);
ok(packages.length > 500, `the installed production packages were found (${packages.length})`);
const refused = packages.filter((p) => !allowed(p));
ok(refused.length === 0, refused.length
  ? `licences nobody has checked yet -- read them, then add them above with a reason:\n      ${refused.map((p) => `${p.id}: ${p.licence}`).join('\n      ')}`
  : 'every one is under a licence this project has read and can ship');
ok(!packages.some((p) => p.licence === 'not declared'), 'and none leaves its licence unsaid');

// The allowlist itself refuses what it should.
const probe = (licence, name = 'probe') => allowed({ name, licence });
ok(!probe('GPL-2.0-only') && !probe('SSPL-1.0') && !probe('UNLICENSED') && !probe('BUSL-1.1') && !probe('CC-BY-NC-4.0'),
   'GPL-2.0-only, SSPL, UNLICENSED, BUSL and non-commercial licences are refused');
ok(probe('(MPL-2.0 OR Apache-2.0)') && !probe('MIT AND SSPL-1.0') && probe('MIT OR SSPL-1.0'),
   'a choice needs one allowed side; a combination needs every part allowed');
ok(!probe('LGPL-3.0-or-later', 'some-browser-library'), 'LGPL is allowed only for the server-side image library');

// The notices.
{
  const text = noticesText(packages, 'https://example.org/source');
  const missing = packages.filter((p) => !text.includes(`\n${p.id}\nLicence: `));
  ok(missing.length === 0, missing.length ? `left out of the notices: ${missing.map((p) => p.id).join(', ')}` : 'the notices name every package');
  ok(/AGPL-3\.0-only/.test(text) && text.includes('https://example.org/source'), 'and say what this app is under and where its source is');
  const noFile = packages.filter((p) => p.texts.length === 0);
  ok(noFile.length === 0 || /STANDARD LICENCE TEXTS[\s\S]*MIT, the standard text/.test(text),
     `a package with no licence file of its own gets the standard text (${noFile.length} such)`);

  // The script itself, end to end, into a scratch file.
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'notices-')), 'n.txt');
  execFileSync(process.execPath, ['scripts/third-party-notices.mjs', out], { cwd: root, stdio: 'pipe' });
  const written = fs.readFileSync(out, 'utf8');
  ok(written.includes(`Its source: ${/export const SOURCE_URL = '([^']+)'/.exec(read('lib/brand.ts'))[1]}`),
     'run as a script, it writes the file with this app\'s own source address');
}

// The wiring.
{
  const pkg = JSON.parse(read('package.json'));
  ok(/node scripts\/third-party-notices\.mjs/.test(pkg.scripts.prebuild ?? '')
     && /node scripts\/third-party-notices\.mjs/.test(pkg.scripts.predev ?? ''),
     'it is written at every build and every dev server');
  ok(/^\/public\/third-party-notices\.txt$/m.test(read('.gitignore')), 'and never committed, so it is always what was built');
  ok(/href="\/third-party-notices\.txt"/.test(read('components/SourceCard.tsx')), 'Settings links it');
  ok(/import \{[^}]*SOURCE_URL[^}]*\} from '@\/lib\/brand'/.test(read('components/SourceCard.tsx'))
     && /href=\{SOURCE_URL\}/.test(read('components/live/DoorPages.tsx'))
     && !/https:\/\/github\.com\/Klydo131/.test(read('components/SourceCard.tsx') + read('components/live/DoorPages.tsx')),
     'and the source address is set in one place, lib/brand.ts');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
