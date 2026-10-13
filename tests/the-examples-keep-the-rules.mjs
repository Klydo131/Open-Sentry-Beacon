// The programs in examples/ are copied by people building Hope Beacon in their
// own language, so whatever they get wrong is copied with them.
//
// They have been run against the database's real rules (docs/IN-ANY-LANGUAGE.md,
// "The examples, and how they were checked"), but that run is not in CI. This
// reads them instead, for the few things that must never change:
//
//   - no secret key, real project address or real person in any of them;
//   - every client reads its key from the environment, and writes nothing
//     unless HB_SEND asks it to;
//   - every "your own server" example verifies the token with the sign-in
//     service and runs each request AS THE PERSON: the claims set for the
//     transaction only, the `authenticated` role, the app's own check before
//     every request. Remove any one of those and the server reads with the
//     database password, past every row rule;
//   - each one is listed where a developer looks for it.
//
//   node tests/the-examples-keep-the-rules.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
  const rel = `${dir}/${e.name}`;
  return e.isDirectory() ? walk(rel) : [rel];
});

const files = walk('examples');
const CODE = /\.(?:sh|mjs|js|py|php|rs|cpp|go|java|dart)$/;
const code = files.filter((f) => CODE.test(f));
ok(code.length >= 13, `examples/ holds ${code.length} programs`);

// ---- Nothing secret, nothing real ----
const problems = [];
for (const f of files) {
  const text = read(f);
  if (/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(text)) problems.push(`${f}: a token`);
  if (/sb_secret_|sbp_[A-Za-z0-9]{10,}/.test(text)) problems.push(`${f}: a secret key`);
  if (/https:\/\/[a-z]{20}\.supabase\.co/.test(text)) problems.push(`${f}: a real project's address`);
  if (/postgres(?:ql)?:\/\/[^\s'"]*:[^\s'"@]+@/.test(text)) problems.push(`${f}: a database password`);
  for (const m of text.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g)) {
    if (!/@(?:[a-z.]+\.)?example\.(?:test|com|org)$/i.test(m[0])) problems.push(`${f}: the address ${m[0]}`);
  }
  // The server key is named in the prose that says never to use it; a program
  // has no reason to mention it at all.
  if (CODE.test(f) && /service[_ ]role|SERVICE_ROLE/i.test(text)) problems.push(`${f}: names the server key`);
}
ok(problems.length === 0, 'no secret, real address or real person in any example'
  + (problems.length ? `\n      ${problems.join('\n      ')}` : ''));

// ---- The clients ----
const CLIENTS = [
  'examples/rest/walk.sh',
  'examples/javascript/walk.mjs',
  'examples/python/walk.py',
  'examples/php/walk.php',
  'examples/rust/src/main.rs',
  'examples/cpp/walk.cpp',
  'examples/go/main.go',
  'examples/java/src/main/java/Walk.java',
  'examples/dart/bin/walk.dart',
];
for (const f of CLIENTS) {
  const exists = fs.existsSync(path.join(root, f));
  ok(exists, `${f} is there`);
  if (!exists) continue;
  const text = read(f);
  ok(/HB_KEY/.test(text) && /HB_URL/.test(text), `${f}: takes its address and key from the environment`);
  ok(/HB_SEND/.test(text), `${f}: writes only when HB_SEND asks it to`);
  ok(/PT403/.test(text), `${f}: says plainly when two-step sign-in is owed`);
}

// ---- The servers: the four lines ----
const SERVERS = [
  'examples/server-python/app.py',
  'examples/server-php/index.php',
  'examples/server-rust/src/main.rs',
  'examples/server-laravel/HopeBeaconRules.php',
];
for (const f of SERVERS) {
  const exists = fs.existsSync(path.join(root, f));
  ok(exists, `${f} is there`);
  if (!exists) continue;
  const text = read(f);
  ok(/\/auth\/v1\/user/.test(text), `${f}: asks the sign-in service whether the token is genuine`);
  ok(/set_config\('request\.jwt\.claims',\s*(?:%s|\?|\$1),\s*true\)/.test(text),
    `${f}: tells the database who is asking, for this transaction only`);
  ok(/set local role authenticated/.test(text), `${f}: runs as the signed-in role, not the database owner`);
  ok(/public\.refuse_suspended_requests\(\)/.test(text), `${f}: runs the app's own check before every request`);
  const at = (re) => text.search(re);
  ok(at(/set_config\('request\.jwt\.claims'/) < at(/set local role authenticated/)
    && at(/set local role authenticated/) < at(/refuse_suspended_requests/),
    `${f}: in that order`);
}

// ---- Listed where a developer looks ----
const readme = read('examples/README.md');
const guide = read('docs/IN-ANY-LANGUAGE.md');
const folders = [...new Set(files.map((f) => f.split('/')[1]).filter((d) => fs.statSync(path.join(root, 'examples', d)).isDirectory()))];
for (const d of folders) {
  ok(readme.includes(`(${d}/`) && guide.includes(`examples/${d}`), `examples/${d} is listed in examples/README.md and docs/IN-ANY-LANGUAGE.md`);
}

const api = read('examples/openapi.yaml');
ok(/^openapi: 3\.1\./m.test(api) && /PT403/.test(api), 'examples/openapi.yaml describes the calls, refusals included');

const ignore = read('examples/.gitignore');
ok(['target/', 'build/', 'node_modules/', 'vendor/', '.venv/'].every((p) => ignore.includes(p)),
  'what a build leaves behind is never committed');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
