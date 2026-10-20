// The Postgres edition keeps up with the app.
//
// Asked for on 20 October 2026: "For database, some will not use Supabase for
// it is not cheap, so create an alternative that focuses more on Postgres."
// The edition (selfhost/, docs/POSTGRES.md) runs the SAME migrations and the
// SAME functions as a Supabase project. Its real proof runs in CI on an actual
// Postgres (.github/workflows/fresh-install.yml); this file is the part that
// can be read without a database, so a change that would quietly break the
// edition fails here first, on every computer:
//
//   1. every migration can be installed by it (no extension it lacks),
//   2. every function's imports are ones it provides, at the versions pinned,
//   3. everything it starts is pinned, so "the same setup" stays the same,
//   4. the database proof keeps running in CI, and hides nothing it should not,
//   5. every setting the server reads is in the settings template.
//
//   node tests/the-postgres-edition-installs.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const { prepare } = await import(pathToFileURL(path.join(root, 'selfhost/server/src/prepare.mjs')).href);
const { PROVIDES } = await import(pathToFileURL(path.join(root, 'selfhost/server/src/functions-loader.mjs')).href);

// 1. --------------------------------------------------------- migrations ----
{
  const dir = path.join(root, 'supabase/migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const refused = [];
  let standIns = 0;
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    try {
      const ran = prepare(sql);
      standIns += (ran.match(/provided by selfhost\/sql\/platform\.sql/g) || []).length;
    } catch (err) {
      refused.push(`${f}: ${err.message}`);
    }
  }
  ok(files.length > 100 && refused.length === 0,
    refused.length ? `migrations the edition cannot install: ${refused.join('; ')}` : `all ${files.length} migrations can be installed on plain Postgres`);
  ok(standIns === 2, `exactly the two lines that switch on pg_cron and pg_net are stood in for (${standIns})`);
  let caught = false;
  try { prepare('create extension if not exists postgis;'); } catch { caught = true; }
  ok(caught, 'and an extension the edition does not provide stops the install with its name');
  const platform = read('selfhost/sql/platform.sql');
  for (const name of ['cron.schedule', 'cron.unschedule', 'net.http_post', 'vault.create_secret', 'vault.decrypted_secrets',
    'auth.uid', 'auth.jwt', 'auth.sessions', 'auth.mfa_factors', 'auth.refresh_tokens', 'storage.foldername', 'storage.objects']) {
    ok(platform.includes(name), `platform.sql provides ${name}, which the migrations use`);
  }
}

// 2. ---------------------------------------------------------- functions ----
{
  const pkg = JSON.parse(read('selfhost/server/package.json'));
  const deps = pkg.dependencies || {};
  ok(Object.values(deps).every((v) => /^\d+\.\d+\.\d+$/.test(v)), 'the server pins every package to one exact version');
  const imports = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (p.endsWith('.ts')) for (const m of fs.readFileSync(p, 'utf8').matchAll(/from\s+'((?:jsr|npm|https?):[^']+)'/g)) imports.add(m[1]);
    }
  };
  walk(path.join(root, 'supabase/functions'));
  ok(imports.size > 0, `the functions' outside imports were found (${imports.size})`);
  for (const spec of imports) {
    const target = PROVIDES[spec];
    ok(Boolean(target), `${spec} is provided by the edition`);
    const pinned = /^npm:(.+)@(\d+\.\d+\.\d+)$/.exec(spec);
    if (pinned && target) ok(deps[target] === pinned[2], `${spec}: the server installs exactly ${pinned[2]} (has ${deps[target]})`);
    if (target && !pinned) ok(Boolean(deps[target]), `${spec}: the server installs ${target}`);
  }
}

// 3. ------------------------------------------------------------- pinned ----
{
  const compose = read('selfhost/docker-compose.yml');
  const images = [...compose.matchAll(/^\s+image:\s*(\S+)/gm)].map((m) => m[1]);
  ok(images.length >= 3, `the compose file names its images (${images.length})`);
  for (const image of images) ok(/@sha256:[0-9a-f]{64}$/.test(image), `${image.split('@')[0]} is pinned by digest`);
  for (const file of ['selfhost/server/Dockerfile', 'selfhost/app.Dockerfile']) {
    const froms = [...read(file).matchAll(/^FROM\s+(\S+)/gm)].map((m) => m[1]);
    ok(froms.length > 0 && froms.every((f) => /@sha256:[0-9a-f]{64}$/.test(f)), `${file} starts from images pinned by digest`);
  }
  ok(!compose.includes('5432:5432'), 'the compose file never publishes the database to the network');
}

// 4. ---------------------------------------------------------- the proof ----
{
  const wf = read('.github/workflows/fresh-install.yml');
  ok(/scripts\/fresh-install\.sh --plain/.test(wf), 'CI installs every migration on plain Postgres');
  ok(/grep -v '\^extension '/.test(wf) && /plain\.out/.test(wf), 'and requires its fingerprint to match Supabase\'s on every line but the extensions');
  ok(/node test\/the-edition-holds\.mjs/.test(wf), 'and drives sign-in, files, live data and functions with supabase-js');
  ok(/postgres:17@sha256:[0-9a-f]{64}/.test(wf), 'on a Postgres pinned by digest');
  const fp = read('supabase/tests/fingerprint.sql');
  const hidden = [...fp.matchAll(/and not \(kind = '(trigger|event_trigger)' and key like '([^']+)'\)/g)].map((m) => m[2]);
  ok(hidden.length === 2 && hidden.every((k) => /beacon_platform/.test(k)),
    'the fingerprint sets aside only the edition\'s own objects, named beacon_platform');
}

// 5. ----------------------------------------------------------- settings ----
{
  const example = read('selfhost/.env.example');
  const listed = new Set([...example.matchAll(/^([A-Z_]+)=/gm)].map((m) => m[1]));
  // Set by the compose file itself, or only for development and CI.
  const internal = new Set(['DATABASE_URL', 'POSTGREST_URL', 'PORT', 'HOST', 'DATA_DIR', 'RUN_JOBS', 'MIGRATE_ON_START',
    'DB_POOL', 'BEACON_REPO_ROOT', 'PASSWORD_MIN_LENGTH', 'MAILER_AUTOCONFIRM', 'SMTP_URL', 'JWT_EXPIRY']);
  const src = read('selfhost/server/src/config.mjs') + read('selfhost/server/src/main.mjs') + read('selfhost/server/src/migrate.mjs');
  const used = new Set([...src.matchAll(/env\.([A-Z][A-Z0-9_]+)/g)].map((m) => m[1]));
  const missing = [...used].filter((k) => !listed.has(k) && !internal.has(k));
  ok(used.size > 10 && missing.length === 0, missing.length ? `settings the template does not mention: ${missing.join(', ')}` : `every setting the server reads is in selfhost/.env.example (${used.size})`);
  ok(/^ENABLE_SIGNUP=false$/m.test(example), 'the template keeps signing yourself up closed');
}

process.exit(bad === 0 ? 0 : 1);
