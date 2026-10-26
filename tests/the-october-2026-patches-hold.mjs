// The October 2026 security releases stay applied.
//
// ---------------------------------------------------------------------------
// WHY. In the week of 14 to 21 October 2026, Next.js shipped an out-of-band
// fix for two critical remote-code-execution flaws (15.5.28: the image
// optimiser's SVG path, through sharp), React fixed its server-components
// packages (19.0.9), DOMPurify fixed sanitiser bypasses (3.4.17), Node.js fixed
// ten flaws including a Brotli decoder overflow (22.23.4 / 24.22.1), and
// nodemailer fixed address-parsing bugs (10.1.4). Asked for on 26 October
// 2026: "deep research and update our security". Every one was applied that
// day; this holds them, so a revert, a rebase or an old lockfile cannot quietly
// bring one back.
//
// Not held here, and why: zod and KaTeX inside the Study Room's editor
// (@blocksuite) have advisories whose fixes need a newer editor than exists;
// see docs/SECURITY.md, "October 2026".
//
//   node tests/the-october-2026-patches-hold.mjs
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

/** a >= b, for plain x.y.z versions. */
const atLeast = (a, b) => {
  const pa = String(a ?? '0').split(/[.-]/).map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== pb[i]) return (pa[i] || 0) > pb[i];
  }
  return true;
};

const lock = JSON.parse(read('package-lock.json')).packages;
// Every copy in the tree, not only the top one: a nested old copy is still shipped.
const copies = (name) => Object.entries(lock)
  .filter(([k]) => k === `node_modules/${name}` || k.endsWith(`/node_modules/${name}`))
  .map(([, v]) => v.version);
const allAtLeast = (name, min) => {
  const found = copies(name);
  return found.length > 0 && found.every((v) => atLeast(v, min));
};

ok(allAtLeast('next', '15.5.28'), `Next.js is 15.5.28 or later (${copies('next').join(', ')}): the image-optimiser RCE and the Server Actions DoS`);
ok(allAtLeast('sharp', '0.35.5'), `sharp is 0.35.5 or later (${copies('sharp').join(', ')}): the SVG path Next.js's fix relies on`);
ok(allAtLeast('react', '19.0.9') && allAtLeast('react-dom', '19.0.9'),
  `React and React DOM are 19.0.9 or later (${copies('react').join(', ')} / ${copies('react-dom').join(', ')}), with no older copy nested anywhere`);
ok(allAtLeast('dompurify', '3.4.17'), `DOMPurify is 3.4.17 or later in every copy (${copies('dompurify').join(', ')})`);
ok(allAtLeast('fast-uri', '3.1.9') && allAtLeast('postcss-selector-parser', '6.1.5') && allAtLeast('vite', '7.3.7'),
  'fast-uri, postcss-selector-parser and vite carry their October fixes');

const edition = JSON.parse(read('selfhost/server/package-lock.json')).packages;
ok(atLeast(edition['node_modules/nodemailer']?.version, '10.1.4'),
  `the edition's nodemailer is 10.1.4 or later (${edition['node_modules/nodemailer']?.version}): addresses parse as written`);

// Node 22.23.4, 21 October 2026, the official multi-platform image.
const NODE_22_23_4 = 'node:22-bookworm-slim@sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d';
const dockerfiles = ['selfhost/app.Dockerfile', 'selfhost/server/Dockerfile'];
ok(dockerfiles.every((f) => {
  const froms = [...read(f).matchAll(/^FROM\s+(\S+)/gm)].map((m) => m[1]);
  return froms.length > 0 && froms.every((x) => x === NODE_22_23_4);
}), 'every self-hosted image is built on Node 22.23.4, pinned by digest');

const caddy = /caddy:(\d+\.\d+\.\d+)@sha256/.exec(read('selfhost/docker-compose.yml'))?.[1];
ok(atLeast(caddy, '2.11.4'), `Caddy is 2.11.4 or later (${caddy}): the 2026 admin-API and placeholder fixes`);

const workflows = fs.readdirSync(path.join(root, '.github/workflows')).filter((f) => f.endsWith('.yml'));
const setups = workflows.flatMap((f) => [...read(`.github/workflows/${f}`).matchAll(/node-version: 22\n((?: +#[^\n]*\n)*) +check-latest: true/g)].map(() => f));
const asks = workflows.flatMap((f) => [...read(`.github/workflows/${f}`).matchAll(/node-version: 22\n/g)].map(() => f));
ok(asks.length > 0 && setups.length === asks.length, `CI fetches the newest Node 22 wherever it asks for 22 (${setups.length} of ${asks.length})`);

console.log(bad ? `\nRESULT: ${bad} FAILED` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
