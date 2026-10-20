// The one connection pool, and the one way to act as somebody.
//
// The server signs in to Postgres as the database owner, which may do
// anything. Every request that a person makes is therefore run inside a
// transaction that first becomes that person (`set local role` and their
// claims), so the migrations' row rules decide what they may read and change,
// exactly as they do behind PostgREST. Nothing here is checked twice in
// JavaScript and once in SQL; the SQL is the check.

import pg from 'pg';

// Dates and big numbers arrive as text, as JSON will send them anyway.
pg.types.setTypeParser(1184, (v) => v);
pg.types.setTypeParser(1114, (v) => v);
pg.types.setTypeParser(20, (v) => v);

const ROLES = new Set(['anon', 'authenticated', 'service_role']);

export function createPool(databaseUrl, max = 10) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max, application_name: 'beacon-server' });
  // A dropped connection is reported, not fatal; the pool makes a new one.
  pool.on('error', (err) => console.error(JSON.stringify({ at: 'db', error: err.message })));
  return pool;
}

/** The check PostgREST runs before every request, as the database names it. */
export async function readPreRequest(pool) {
  const { rows } = await pool.query(
    `select c from pg_roles r, unnest(r.rolconfig) c
      where r.rolname = 'authenticator' and c like 'pgrst.db_pre_request=%'`,
  );
  const name = rows[0]?.c?.split('=')[1] ?? '';
  // Only a schema-qualified function name; anything else is not used.
  return /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/.test(name) ? name : '';
}

/**
 * Run `work(client)` as the person these claims describe, in one transaction.
 * `preRequest` is the database's own before-every-request check; when it
 * refuses (a suspended account, a session that has been ended), so does this.
 */
export async function asPerson(pool, claims, work, { preRequest = '' } = {}) {
  const role = ROLES.has(claims?.role) ? claims.role : 'anon';
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`set local role ${role}`);
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims ?? { role })]);
    if (preRequest) await client.query(`select ${preRequest}()`);
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Run `work(client)` as the owner, in one transaction. */
export async function asOwner(pool, work) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await work(client);
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
