// The security layers hold, and the map of them stays true.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 26 October 2026: "Update our security system with better layer
// system please, update also the developers how to update and make their own
// security systems better in the most professional." docs/SECURITY-LAYERS.md
// is that map: eight layers, each with what it stops, where it lives and the
// check that proves it. A map is only worth reading while it matches the
// ground, so this reads it:
//
//   * every file it names exists;
//   * every check it names as proof is one the build or CI actually runs;
//   * the checks the app's security rests on are each placed in a layer;
//
// and holds the controls added with it: no plugins and a window of its own at
// the edge, a security.txt that has not expired, the audit gate with its
// register of accepted advisories, and Dependabot watching the Postgres
// edition. Each was broken on purpose once to watch it go red.
//
//   node tests/the-security-layers-hold.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const map = read('docs/SECURITY-LAYERS.md');

// 1. Eight layers, in order.
const layers = [...map.matchAll(/^## Layer (\d): (.+)$/gm)].map((m) => Number(m[1]));
ok(layers.join(',') === '1,2,3,4,5,6,7,8', `the map has its eight layers, in order (${layers.join(', ')})`);

// 2. Every file it names exists.
const named = [...new Set([...map.matchAll(/`([^`\s]+)`/g)].map((m) => m[1]))]
  .filter((p) => /^(\.github|\.claude|app|components|docs|lib|public|scripts|security|selfhost|supabase|tests)\//.test(p)
    || /^(package(-lock)?\.json|next\.config\.mjs|AGENTS\.md|CHANGELOG\.md)$/.test(p))
  .map((p) => p.replace(/\/$/, ''));
const missing = named.filter((p) => !exists(p));
ok(named.length > 40 && missing.length === 0,
  `every path the map names exists (${named.length} named${missing.length ? `; missing: ${missing.join(', ')}` : ''})`);

// 3. Every check named as proof is one that runs.
const verify = read('scripts/verify.mjs');
const invariants = read('tests/security-invariants.mjs');
const install = read('scripts/fresh-install.sh');
const workflows = fs.readdirSync(path.join(root, '.github/workflows')).map((f) => read(`.github/workflows/${f}`)).join('\n');
const runs = (p) => {
  if (p.startsWith('supabase/tests/')) return install.includes(p.replace('supabase/tests/', 'supabase/tests/'));
  if (p.startsWith('scripts/')) return workflows.includes(`node ${p}`) || verify.includes(p);
  return verify.includes(`'${p}'`) || invariants.includes(`'${p}'`);
};
const proofs = named.filter((p) => /^tests\/[^/]+\.(mjs|js)$|^supabase\/tests\/[^/]+\.sql$|^scripts\/audit-gate\.mjs$/.test(p));
const idle = proofs.filter((p) => !runs(p));
ok(proofs.length >= 20 && idle.length === 0,
  `every check the map names as proof is run by the build, the fresh install or CI (${proofs.length}${idle.length ? `; not run: ${idle.join(', ')}` : ''})`);

// 4. What the app's security rests on is placed in a layer.
const CORE = [
  'tests/no-secrets.js', 'tests/security-invariants.mjs', 'tests/the-protections-hold.mjs',
  'tests/every-table-says-who-may-reach-it.mjs', 'tests/nobody-promotes-themselves.mjs',
  'tests/a-suspension-is-immediate.mjs', 'tests/an-ended-session-ends-at-once.mjs',
  'tests/a-new-password-has-its-own-page.mjs', 'tests/errors-are-human.mjs',
  'tests/the-october-2026-patches-hold.mjs', 'tests/workflows.mjs',
  'supabase/tests/a-second-step-is-required.sql', 'supabase/tests/fresh-install-holds.sql',
  'scripts/audit-gate.mjs',
];
const unplaced = CORE.filter((p) => !named.includes(p));
ok(unplaced.length === 0, `every check the app's security rests on has its place in a layer${unplaced.length ? ` (not placed: ${unplaced.join(', ')})` : ''}`);

// 5. The edge: no plugins, a window of its own, no policy files.
const config = read('next.config.mjs');
ok(/"object-src 'none'"/.test(config), "object-src 'none': no <object> or <embed> can carry its own code in");
ok(/key: 'Cross-Origin-Opener-Policy', value: 'same-origin'/.test(config),
  'Cross-Origin-Opener-Policy: same-origin, so no other window reaches in through window.opener');
ok(/key: 'X-Permitted-Cross-Domain-Policies', value: 'none'/.test(config), 'and no cross-domain policy file is honoured');
ok(!/window\.open\([^)]*\)/.test(fs.readdirSync(path.join(root, 'components'), { recursive: true })
  .filter((f) => /\.tsx?$/.test(f)).map((f) => read(`components/${f}`)).join('\n')
  .replace(/window\.open\([^)]*'noopener,noreferrer'\)/g, '')),
  'and every window the app opens is opened with noopener, which that policy relies on');

// 6. security.txt says where to report, and has not run out.
const txt = read('public/.well-known/security.txt');
const expires = /^Expires: (\S+)$/m.exec(txt)?.[1];
const left = expires ? (Date.parse(expires) - Date.now()) / 86400000 : -1;
ok(/^Contact: https:\/\/\S+$/m.test(txt), 'security.txt names where to report a problem');
ok(left > 0 && left <= 366, `and its Expires date is ahead, and less than a year away (${expires}, ${Math.round(left)} days)`);
ok(!/supabase\.co|vercel\.app/.test(txt), 'and names no deployment');

// 7. The audit gate and its register.
const register = JSON.parse(read('security/accepted-advisories.json'));
const day = (s) => Date.parse(`${s}T00:00:00Z`);
const loose = register.accepted.filter((a) => !/^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/.test(a.id) || !a.why || a.why.length < 40
  || !a.accepted_on || !a.review_by || (day(a.review_by) - day(a.accepted_on)) / 86400000 > 183);
ok(register.accepted.length > 0 && loose.length === 0,
  'every accepted advisory has its id, a reason a reviewer can check, and a review date at most six months on'
  + (loose.length ? ` (not: ${loose.map((a) => a.id).join(', ')})` : ''));
const gate = read('scripts/audit-gate.mjs');
ok(/RANK\[a\.severity\] >= RANK\.moderate/.test(gate) && /a\.review_by < today/.test(gate) && /process\.exit\(2\)/.test(gate),
  'the gate fails on a new advisory of moderate or worse, on a lapsed acceptance, and never reads no answer as a pass');
const audit = read('.github/workflows/audit.yml');
ok(/run: node scripts\/audit-gate\.mjs/.test(audit) && /schedule:/.test(audit) && /package-lock\.json/.test(audit)
  && /permissions:\s*\n\s*contents: read/.test(audit) && !/npm (ci|install)/.test(audit),
  'CI runs it every week and on every lockfile change, read-only, installing nothing');

// 8. Dependabot watches the Postgres edition too.
const bot = read('.github/dependabot.yml');
ok(/package-ecosystem: npm\s*\n\s*directory: \/selfhost\/server/.test(bot)
  && /package-ecosystem: docker\s*\n\s*directory: \/selfhost\/server/.test(bot),
  "Dependabot watches the edition's server packages and its Docker image");

// 9. Developers are sent here.
ok(/SECURITY-LAYERS\.md/.test(read('docs/SECURITY.md')) && /SECURITY-LAYERS\.md/.test(read('CONTRIBUTING.md'))
  && /SECURITY-LAYERS\.md/.test(read('README.md')),
  'SECURITY.md, CONTRIBUTING.md and the README send developers to the map');

console.log(bad ? `\nRESULT: ${bad} FAILED` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
