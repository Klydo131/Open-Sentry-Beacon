// The web application security guide still describes the app that exists.
//
// WHY THIS EXISTS. docs/WEB-APP-SECURITY.md tells developers, and AI tools,
// what to rely on and what not to. A guide like that does harm when it goes
// stale in either direction: it names a check that was renamed, so a developer
// trusts a protection that is gone; or it lists a gap that has since been
// closed, so nobody trusts one that is real. Neither fails anything by itself.
//
// So this holds the guide to the code, in three ways:
//   1. every file it names exists, and every local link resolves;
//   2. every PROTECTION it claims is still in the code (the headers, the pinned
//      workflows, the private buckets, the two inline scripts, the URL guard);
//   3. every GAP it admits is still a gap. When one is closed, this fails until
//      the guide says so, which is the point: closing a gap should be written
//      down, not left for somebody to find in a table that still lists it.
//
//   node tests/the-security-guide-points-at-real-things.mjs
//
// Reads the source; needs no browser and no database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const has = (p) => fs.existsSync(path.join(root, p));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*#.*$/gm, '');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

const GUIDE = 'docs/WEB-APP-SECURITY.md';
const guide = read(GUIDE);
const flat = guide.replace(/\s+/g, ' ');

// ---- 1. It points at real things ----
const NOT_YET = new Set(['.github/dependabot.yml']);
const named = new Set(
  [...guide.matchAll(/`((?:tests|docs|lib|app|components|supabase|\.github|examples|scripts)\/[A-Za-z0-9_./-]+|next\.config\.mjs)`/g)]
    .map((m) => m[1]),
);
const missing = [...named].filter((p) => !NOT_YET.has(p) && !has(p));
ok(named.size >= 30, `the guide names ${named.size} files`);
ok(missing.length === 0, 'and every one of them exists' + (missing.length ? `:\n      ${missing.join('\n      ')}` : ''));

const brokenLinks = [...guide.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)]
  .map((m) => m[1])
  .filter((l) => !/^https?:/.test(l))
  .filter((l) => !has(path.posix.normalize(path.posix.join('docs', l))));
ok(brokenLinks.length === 0, 'every local link in it resolves' + (brokenLinks.length ? `: ${brokenLinks.join(', ')}` : ''));

// ---- The guide says how it was made, and that it could not read the article ----
ok(/could not be opened/.test(flat) && /not observed/i.test(flat) && /not a summary of any one article/.test(flat),
  'it still says where it comes from, and what it could not read or observe');

// ---- 2. The protections it claims are still in the code ----
const config = read('next.config.mjs');
const headers = config.split('const securityHeaders')[1] ?? '';
ok(/Strict-Transport-Security[^}]*max-age=63072000/.test(headers) && !/includeSubDomains/.test(stripComments(headers)),
  'HSTS is two years and has no includeSubDomains, as the guide says');
for (const [h, v] of [['X-Frame-Options', 'DENY'], ['X-Content-Type-Options', 'nosniff'], ['Referrer-Policy', 'strict-origin-when-cross-origin']]) {
  ok(new RegExp(`'${h}',\\s*value:\\s*'${v}'`).test(config), `${h} is ${v}`);
}
ok(/camera=\(\), microphone=\(self\), geolocation=\(\)/.test(config), 'Permissions-Policy has camera and location off and the microphone for this site only');
// Looked for in the policy's own lines, not the whole file: next.config.mjs
// talks about `default-src 'self'` in its comments, and a comment is not a policy.
const policyLines = stripComments(config.split('const csp = [')[1]?.split('].join')[0] ?? '');
for (const d of ["default-src 'self'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"]) {
  ok(policyLines.includes(`"${d}"`) || policyLines.includes(`'${d}'`), `the content policy has ${d}`);
}

const inlineUses = [];
const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
  const rel = `${dir}/${e.name}`;
  if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(rel);
  return /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
});
for (const f of ['app', 'components', 'lib'].flatMap(walk)) {
  if (/dangerouslySetInnerHTML/.test(stripComments(read(f)))) inlineUses.push(f);
}
ok(inlineUses.sort().join(',') === 'components/LookBeforePaint.tsx,components/SelfHeal.tsx',
  `dangerouslySetInnerHTML is used in exactly the two files the guide names (${inlineUses.join(', ') || 'none'})`);

const url = read('lib/url.ts');
ok(/if \(parsed\.protocol !== 'http:' && parsed\.protocol !== 'https:'\) return null;/.test(stripComments(url)) && /if \(parsed\.username \|\| parsed\.password\) return null;/.test(stripComments(url)),
  'the URL guard allows http and https only and refuses user-info');

const flows = fs.readdirSync(path.join(root, '.github/workflows')).filter((f) => /\.ya?ml$/.test(f));
const loose = [];
for (const f of flows) {
  const src = read(`.github/workflows/${f}`);
  const code = stripComments(src);
  if (!/^permissions:/m.test(code)) loose.push(`${f}: no permissions block`);
  if (/^\s*pull_request_target\s*:|on:\s*\[?[^\n]*pull_request_target/m.test(code)) loose.push(`${f}: uses pull_request_target`);
  for (const m of code.matchAll(/uses:\s*([^\s@]+)@(\S+)/g)) {
    if (m[1].startsWith('./')) continue;
    if (!/^[0-9a-f]{40}$/.test(m[2])) loose.push(`${f}: ${m[1]}@${m[2]} is not pinned to a commit`);
  }
}
ok(loose.length === 0, `every workflow sets its permissions, pins its actions and avoids pull_request_target (${flows.length} checked)` + (loose.length ? `:\n      ${loose.join('\n      ')}` : ''));

const buckets = [...read_all('supabase/migrations').matchAll(/insert into storage\.buckets[\s\S]*?values\s*\(\s*'([^']+)',\s*'[^']+',\s*(true|false)/g)];
function read_all(dir) {
  return fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.sql')).map((f) => read(`${dir}/${f}`)).join('\n');
}
ok(buckets.length >= 2 && buckets.every((m) => m[2] === 'false'),
  `the buckets the migrations create are private (${buckets.map((m) => m[1]).join(', ')})`);

const icon = read('app/api/app-icon/route.ts');
ok(/sec-fetch-site/.test(icon) && /isPrivateAddress/.test(icon) && /MAX_REDIRECTS/.test(icon),
  'the logo route is fenced the way the guide describes (same-site only, no private addresses, hand-followed redirects)');

// ---- 3. The gaps it admits are still gaps ----
// Each is [what the guide says, what in the code makes it true, what to do when it stops being true].
const policy = config.split("const csp = [")[1]?.split('].join')[0] ?? '';
const gap = (said, truth, what) => ok(flat.includes(said) === truth,
  `${truth ? 'the guide still admits' : 'the guide no longer claims'}: ${what}`
  + (flat.includes(said) === truth ? '' : `\n      ${truth ? 'it is still true in the code, so the guide must say it' : 'it is no longer true in the code, so the guide must stop saying it'}: "${said}"`));

gap('The script policy allows inline scripts', /script-src[^`]*'unsafe-inline'/.test(policy), 'inline scripts are allowed by the content policy');
gap('The session is in the browser', /localStorage\.setItem/.test(read('lib/supabase/client.ts')), 'the session is held in local storage');
gap('Two functions compare a secret with `!==`',
  ['erase', 'notify'].every((f) => /bearer !== SERVICE_KEY/.test(read(`supabase/functions/${f}/index.ts`))),
  'erase and notify compare the service key with !==');
gap('The invite function answers any origin until you set `BEACON_ALLOWED_ORIGINS`',
  /ALLOWED\.length === 0\s*\?\s*'\*'/.test(read('supabase/functions/invite/index.ts')),
  'an unset origin list means a wildcard');
gap('No dependency-update configuration, no `npm audit` in CI',
  !has('.github/dependabot.yml') && !flows.some((f) => /npm audit/.test(stripComments(read(`.github/workflows/${f}`)))),
  'no dependency-update file and no audit step');
gap('The logo route has no rate limit and no sign-in',
  !/getUser|Authorization|\b429\b/.test(stripComments(icon)),
  'the logo route has neither sign-in nor a limit');

// ---- It is where people will look ----
for (const f of ['docs/SECURITY.md', 'AGENTS.md', 'CONTRIBUTING.md', 'README.md']) {
  ok(/WEB-APP-SECURITY\.md/.test(read(f)), `${f} points at the guide`);
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
