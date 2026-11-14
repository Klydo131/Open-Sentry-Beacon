// The licence is MIT, said the same way everywhere.
//
//   node tests/the-licence-is-mit.mjs
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

const licence = read('LICENSE');
ok(/^MIT License\n/.test(licence) && /Permission is hereby granted, free of charge/.test(licence), 'LICENSE is the MIT License');
ok(/^Copyright \(c\) 2026 Open Sentry Beacon contributors$/m.test(licence), 'with a copyright line that names no person');
ok(!/GNU|Affero|AGPL/.test(licence), 'and nothing of the AGPL left in it');

for (const p of ['package.json', 'selfhost/server/package.json']) {
  ok(JSON.parse(read(p)).license === 'MIT', `${p} says MIT`);
}
for (const p of ['package-lock.json', 'selfhost/server/package-lock.json']) {
  ok(JSON.parse(read(p)).packages[''].license === 'MIT', `${p} says MIT`);
}

// Nothing that describes THIS project may still say AGPL. Other projects'
// licences, and the rule that copyleft is refused, are about something else.
const ours = [
  'README.md', 'CONTRIBUTING.md', 'AGENTS.md', 'NOTICES.md', '.github/pull_request_template.md',
  'components/SourceCard.tsx', 'lib/brand.ts', 'lib/faq.ts', 'scripts/third-party-notices.mjs',
  'docs/START-HERE.md', 'docs/SECURITY.md', 'docs/PRESENTING.md', 'docs/WHAT-IT-COSTS.md',
  'docs/guides/building/00-about.md', 'docs/guides/using/00-about.md', 'docs/guides/using/04-faq.md',
  'examples/openapi.yaml', 'docs/HANDBOOK.md',
];
const claim = /(licen[sc]ed|free software|open source|AGPL-3\.0-only)[^.\n]{0,40}(AGPL|Affero)|Affero General Public License,|\bAGPL-3\.0-only\)/i;
for (const p of ours) {
  const text = read(p).replace(/GNU AGPL-3\.0-or-later/g, '');
  ok(!claim.test(text), `${p} does not call this project AGPL`);
}
ok(!/Contributor Licence Agreement/.test(read('CONTRIBUTING.md') + read('README.md') + read('.github/pull_request_template.md')),
  'the old Contributor Licence Agreement is gone');

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
