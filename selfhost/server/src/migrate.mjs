// Install or update Hope Beacon's database on plain Postgres.
//
//   node src/migrate.mjs           apply selfhost/sql/platform.sql, then every
//                                  migration not applied yet, in order
//   node src/migrate.mjs --check   say what would be applied, change nothing
//
// The migrations are the same files a Supabase project runs, unchanged, in the
// same byte order as scripts/fresh-install.sh. Each one is sent as a single
// request, so a file that fails changes nothing, and the next run starts at
// that file again.
//
// Two lines of the migrations are not run, because platform.sql stands in for
// what they switch on; src/prepare.mjs says which two, and refuses any other.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPool } from './db.mjs';
import { readConfig, REPO_ROOT } from './config.mjs';
import { prepare } from './prepare.mjs';

export const INTERNAL_FUNCTIONS = 'http://beacon.internal/functions/v1';
export { prepare };

export function migrationFiles(dir = path.join(REPO_ROOT, 'supabase/migrations')) {
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => (Buffer.compare(Buffer.from(a), Buffer.from(b))))
    .map((f) => ({ name: f, file: path.join(dir, f) }));
}

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

export async function migrate({ databaseUrl, check = false, log = console.log, authenticatorPassword = '', pushConfigured = false }) {
  const pool = createPool(databaseUrl, 1);
  const client = await pool.connect();
  try {
    // Two servers starting at once take turns.
    await client.query(`select pg_advisory_lock(hashtext('beacon_platform.migrate'))`);
    if (!check) {
      await client.query(fs.readFileSync(path.join(REPO_ROOT, 'selfhost/sql/platform.sql'), 'utf8'));
    }
    const applied = new Map();
    const exists = await client.query(`select to_regclass('beacon_platform.applied_migrations') as t`);
    if (exists.rows[0].t) {
      for (const r of (await client.query('select name, sha256 from beacon_platform.applied_migrations')).rows) {
        applied.set(r.name, r.sha256);
      }
    }

    let count = 0;
    for (const { name, file } of migrationFiles()) {
      const sql = fs.readFileSync(file, 'utf8');
      const sum = sha256(sql);
      if (applied.has(name)) {
        if (applied.get(name) !== sum) {
          // AGENTS.md section 4: an applied migration is never edited. Said
          // loudly and not re-run: running it again would not undo the edit.
          log(`warning: ${name} has changed since it was applied. It is not run again; add a new migration instead.`);
        }
        continue;
      }
      count += 1;
      if (check) {
        log(`would apply ${name}`);
        continue;
      }
      let text;
      try {
        text = prepare(sql);
        await client.query(text);
      } catch (err) {
        const where = err.position ? ` (character ${err.position})` : '';
        throw new Error(`The install stopped at ${name}${where}: ${err.message}`);
      }
      await client.query('insert into beacon_platform.applied_migrations (name, sha256) values ($1, $2)', [name, sum]);
      log(`applied ${name}`);
    }

    if (!check) {
      await client.query('select beacon_platform.follow_the_publication()');
      // THE VAULT. The migrations look up where to send a push or an erase
      // request, and with what key. Here both go to this server's own
      // functions, so the vault holds an address that leaves nothing on the
      // network and a placeholder, never the real key: the server puts the
      // real key on the request itself (src/jobs.mjs). The push address is
      // there only while push keys are set, so a church that has not set push
      // up queues nothing, as the migration that sends pushes intends. The
      // photo check is always on: it needs no key of its own, and a photo that
      // still says where it was taken is cleaned here as on Supabase
      // (20261027170000_a_photo_is_checked_on_the_server).
      await client.query(`
        insert into vault.secrets (name, secret, description) values
          ('erase_function_url', $1, 'This server''s own erase function (selfhost edition)'),
          ('photo_check_function_url', $2, 'This server''s own photo-check function (selfhost edition)'),
          ('notify_service_key', 'beacon-internal', 'Placeholder; the server adds the real key')
        on conflict (name) do update set secret = excluded.secret, updated_at = now()`,
        [`${INTERNAL_FUNCTIONS}/erase`, `${INTERNAL_FUNCTIONS}/photo-check`]);
      if (pushConfigured) {
        await client.query(`
          insert into vault.secrets (name, secret, description)
          values ('notify_function_url', $1, 'This server''s own notify function (selfhost edition)')
          on conflict (name) do update set secret = excluded.secret, updated_at = now()`, [`${INTERNAL_FUNCTIONS}/notify`]);
      } else {
        await client.query(`delete from vault.secrets where name = 'notify_function_url'`);
      }
      if (authenticatorPassword) {
        const { rows } = await client.query('select format($$alter role authenticator with login password %L$$, $1::text) as q', [authenticatorPassword]);
        await client.query(rows[0].q);
      }
      // PostgREST reads the schema again.
      await client.query(`notify pgrst, 'reload schema'`);
    }
    log(check ? `${count} migration(s) waiting.` : `${count} migration(s) applied. The database is up to date.`);
    return count;
  } finally {
    await client.query(`select pg_advisory_unlock(hashtext('beacon_platform.migrate'))`).catch(() => {});
    client.release();
    await pool.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const cfg = readConfig(process.env, ['database']);
    await migrate({
      databaseUrl: cfg.databaseUrl,
      check: process.argv.includes('--check'),
      authenticatorPassword: process.env.AUTHENTICATOR_PASSWORD || '',
      pushConfigured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    });
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
