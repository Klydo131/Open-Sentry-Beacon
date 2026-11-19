// The November 2026 security releases stay applied, and the app stays free of
// Java and PHP.
//
// ---------------------------------------------------------------------------
// WHY. Between 3 and 19 November 2026 Next.js (15.5.29), Node.js (22.23.5),
// Caddy (2.11.9), PHP and Java all published security fixes, and attacks on
// Java and PHP applications were in the news. Asked for on 19 November 2026:
// no church should be exploited through this app. Everything was checked that
// day (docs/SECURITY.md, "November 2026: the second round of releases"); this
// holds it, so a revert or an old lockfile cannot quietly undo it.
//
// THE EXAMPLES are small programs in nine languages a church may copy
// (examples/README.md). They are not part of the app, but they are published
// from here, so their pinned versions are held too.
//
//   node tests/the-november-2026-patches-hold.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`); if (!cond) bad++; };

/** a >= b, for plain x.y.z versions. */
const atLeast = (a, b) => {
  const pa = String(a ?? '0').split(/[.-]/).map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== pb[i]) return (pa[i] || 0) > pb[i];
  return true;
};

const lock = JSON.parse(read('package-lock.json')).packages;
const copies = (name) => Object.entries(lock)
  .filter(([k]) => k === `node_modules/${name}` || k.endsWith(`/node_modules/${name}`))
  .map(([, v]) => v.version);
const allAtLeast = (name, min) => { const f = copies(name); return f.length > 0 && f.every((v) => atLeast(v, min)); };

// THE APP.
ok(allAtLeast('next', '15.5.29'), `Next.js is 15.5.29 or later (${copies('next').join(', ')}): the seven fixes of 3 November`);
const rsc = ['react-server-dom-webpack', 'react-server-dom-turbopack', 'react-server-dom-parcel'].flatMap(copies);
ok(rsc.every((v) => atLeast(v, '19.0.9')), `no separate React server-components package older than 19.0.9 (${rsc.join(', ') || 'none installed; Next.js carries its own'})`);

// THE POSTGRES EDITION.
const NODE_22_23_5 = 'node:22.23.5-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee';
ok(['selfhost/app.Dockerfile', 'selfhost/server/Dockerfile'].every((f) => {
  const froms = [...read(f).matchAll(/^FROM\s+(\S+)/gm)].map((m) => m[1]);
  return froms.length > 0 && froms.every((x) => x === NODE_22_23_5);
}), 'every self-hosted image is built on Node 22.23.5, pinned by digest (the fixes of 11 November)');
const caddy = /caddy:(\d+\.\d+\.\d+)@sha256:[0-9a-f]{64}/.exec(read('selfhost/docker-compose.yml'))?.[1];
ok(atLeast(caddy, '2.11.9'), `Caddy is 2.11.9 or later, pinned by digest (${caddy}): the fixes of 5 November`);
ok(/22\.23\.5 or newer/.test(read('README.md')), 'the README asks for Node 22.23.5 or newer');

// NO JAVA OR PHP IN THE APP. Anything in examples/ is a sample a church runs itself.
const found = [];
const walk = (dir) => {
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    if (['node_modules', '.git', '.next', 'examples', 'target'].includes(e.name)) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel);
    else if (/\.(php|java|jar|jsp|war)$/i.test(e.name) || ['pom.xml', 'composer.json', 'build.gradle'].includes(e.name)) found.push(rel);
  }
};
walk('.');
ok(found.length === 0, `no Java or PHP anywhere in the app (${found.join(', ') || 'none'})`);

// THE EXAMPLES.
const jackson = /<artifactId>jackson-databind<\/artifactId>\s*<version>([\d.]+)<\/version>/.exec(read('examples/java/pom.xml'))?.[1];
ok(atLeast(jackson, '2.22.4'), `the Java example's Jackson is 2.22.4 or later (${jackson}): thirteen advisories against 2.18.2`);
const py = read('examples/server-python/requirements.txt');
const pin = (name) => new RegExp(`^${name}(?:\\[[^\\]]+\\])?==([\\d.]+)$`, 'm').exec(py)?.[1];
ok(atLeast(pin('starlette'), '1.10.0'), `the Python server pins Starlette 1.10.0 or later (${pin('starlette')}): seven advisories below it`);
ok(atLeast(pin('fastapi'), '0.162.5'), `and FastAPI 0.162.5 or later (${pin('fastapi')}), which allows it`);
const tp = /^tokio-postgres = "([\d.]+)"/m.exec(read('examples/server-rust/Cargo.toml'))?.[1];
ok(atLeast(tp, '0.7.18'), `the Rust server asks for tokio-postgres 0.7.18 or later (${tp}): a malformed reply crashed it`);
const php = ['examples/php/walk.php', 'examples/server-php/index.php'].map(read).join('\n') + read('examples/README.md');
ok(!/PHP 8\.1\+/.test(php) && /PHP 8\.2\+/.test(php), 'the PHP examples ask for PHP 8.2 or later; 8.1 receives no fixes');
ok(/Keep the language itself patched/.test(read('examples/README.md')), 'the examples say that the language running them must be kept current');

console.log(bad ? `\nRESULT: ${bad} FAILED` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
