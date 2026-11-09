// Protections that must stay in the code. Each one fails here when removed.
//
//   node tests/the-protections-hold.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*#.*$/gm, '');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

const config = read('next.config.mjs');
const headers = config.split('const securityHeaders')[1] ?? '';
ok(/Strict-Transport-Security[^}]*max-age=63072000/.test(headers) && !/includeSubDomains/.test(stripComments(headers)),
  'HSTS is two years, without includeSubDomains');
for (const [h, v] of [['X-Frame-Options', 'DENY'], ['X-Content-Type-Options', 'nosniff'], ['Referrer-Policy', 'strict-origin-when-cross-origin']]) {
  ok(new RegExp(`'${h}',\\s*value:\\s*'${v}'`).test(config), `${h} is ${v}`);
}
ok(/camera=\(\), microphone=\(self\), geolocation=\(\)/.test(config), 'Permissions-Policy has camera and location off and the microphone for this site only');
for (const feature of ['payment', 'usb', 'serial', 'hid', 'bluetooth', 'midi', 'display-capture', 'idle-detection', 'browsing-topics']) {
  ok(new RegExp(`\\b${feature}=\\(\\)`).test(headers), `Permissions-Policy turns ${feature} off: nothing here uses it, so nothing may borrow it`);
}
ok(/'Cross-Origin-Resource-Policy',\s*value:\s*'same-origin'/.test(config), "Cross-Origin-Resource-Policy: same-origin, so no other site can load this one's files into itself");

// TRUSTED TYPES (9 November 2026, lib/trusted-types.ts). Reported, not yet
// enforced: the header is on in report-only form, the policy is the first
// thing in <head>, and it allows only what was measured.
ok(/key: 'Content-Security-Policy-Report-Only', value: "require-trusted-types-for 'script'"/.test(config),
   "Trusted Types reports every write the page's policy would refuse (report-only until the music score and editor paste paths have policies of their own)");
const layout = read('app/layout.tsx');
const head = layout.split('<head>')[1]?.split('</head>')[0] ?? '';
ok(/^\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<TrustedTypesPolicy \/>/.test(head), 'and the policy is the first thing in <head>, before any other script');
const policy = read('lib/trusted-types.ts');
ok(/createPolicy\('default'/.test(policy) && /createScript: function \(\) \{ return null; \}/.test(policy),
   'the policy is the default one, and turns no string into a script');
ok(/createScriptURL: function \(s\) \{ return own\(s\) \? s : null; \}/.test(policy)
   && /x\.origin === location\.origin/.test(policy) && /'\/_next\/static\/'/.test(policy) && !/blob:|data:/.test(policy.replace(/\/\/.*$/gm, '')),
   "a script address only from this site's own code or offline helper, never blob: or data:");
ok(/s === EMPTY_SCRIPT \|\| served\(s\) \? s : null/.test(policy),
   'and HTML only as an empty script element or the exact text of a script or style already served');
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
// Each one writes a fixed script of the app's own, never anybody's words. The
// third, since 9 November 2026, is the Trusted Types policy (lib/trusted-types.ts).
ok(inlineUses.sort().join(',') === 'components/LookBeforePaint.tsx,components/SelfHeal.tsx,components/TrustedTypesPolicy.tsx',
  `dangerouslySetInnerHTML only in the three known files, each a fixed script of the app's own (${inlineUses.join(', ') || 'none'})`);

const url = read('lib/url.ts');
ok(/if \(parsed\.protocol !== 'http:' && parsed\.protocol !== 'https:'\) return null;/.test(stripComments(url)) && /if \(parsed\.username \|\| parsed\.password\) return null;/.test(stripComments(url)),
  'the URL guard allows http and https only, without user-info');

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
  'the logo route keeps its fences');

for (const f of ['erase', 'notify']) {
  const fn = stripComments(read(`supabase/functions/${f}/index.ts`));
  ok(/!\(await sameKey\(bearer, SERVICE_KEY\)\)/.test(fn) && !/bearer\s*[!=]==/.test(fn), `${f} compares its key in constant time`);
}

// The final definition of every SECURITY DEFINER function pins search_path.
const defs = new Map();
for (const f of fs.readdirSync(path.join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  const sql = read(`supabase/migrations/${f}`).replace(/--[^\n]*/g, '');
  for (const m of sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\(.*?\)\s*(.*?)\$\w*\$/gis)) {
    defs.set(m[1].toLowerCase().replace(/^public\./, ''), m[2].toLowerCase());
  }
  for (const m of sql.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?([\w.]+)/gi)) defs.delete(m[1].toLowerCase().replace(/^public\./, ''));
}
const definers = [...defs].filter(([, head]) => head.includes('security definer'));
const unpinned = definers.filter(([, head]) => !head.includes('search_path')).map(([name]) => name);
ok(definers.length > 100 && unpinned.length === 0,
  `every security definer function pins search_path (${definers.length})` + (unpinned.length ? `: ${unpinned.join(', ')}` : ''));

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
