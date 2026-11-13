// Make the first account, the one nobody can invite because there is nobody
// yet to invite them.
//
//   docker compose exec server node src/first-leader.mjs you@yourchurch.org "Your Church Name"
//
// It does what docs/START-HERE.md Step 4 does on Supabase, with the same SQL
// (supabase/seed/01_make_me_the_first_director.sql, read from the repository,
// not copied): an account for that address, the church, and that account as
// the church's head. The password is printed once, here; sign in with it,
// choose your own, and set up two-step sign-in straight away.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { readConfig, REPO_ROOT } from './config.mjs';

const [email, churchName] = process.argv.slice(2);
if (!email || !churchName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node src/first-leader.mjs you@yourchurch.org "Your Church Name"');
  process.exit(2);
}

const cfg = readConfig(process.env, ['database', 'keys']);
const password = crypto.randomBytes(15).toString('base64url');
const res = await fetch(`http://127.0.0.1:${cfg.port}/auth/v1/admin/users`, {
  method: 'POST',
  headers: { apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: email.trim().toLowerCase(), password, email_confirm: true }),
}).catch(() => null);
if (!res) {
  console.error('The Beacon server is not answering on this machine. Start it first (docker compose up -d).');
  process.exit(1);
}
const made = await res.json();
if (!res.ok && made.error_code !== 'email_exists') {
  console.error(`Could not make the account: ${made.msg || res.status}`);
  process.exit(1);
}

const client = new pg.Client({ connectionString: cfg.databaseUrl });
await client.connect();
try {
  const seed = fs.readFileSync(path.join(REPO_ROOT, 'supabase/seed/01_make_me_the_first_director.sql'), 'utf8');
  const filled = seed
    .replace(`'you@yourchurch.example'`, client.escapeLiteral(email.trim().toLowerCase()))
    .replace(`'Your Church Name'`, client.escapeLiteral(churchName.trim()));
  if (filled === seed) throw new Error('The seed file has changed shape; run it by hand instead (docs/POSTGRES.md).');
  await client.query(filled);
  if (res.ok) {
    await client.query('update public.profiles set password_is_temporary = true where id = $1', [made.id]);
  }
} finally {
  await client.end();
}

console.log(`\n${email} now leads ${churchName}.`);
if (res.ok) {
  console.log(`\n  Temporary password: ${password}\n`);
  console.log('It is shown only this once. Sign in with it, choose your own password,');
  console.log('then set up two-step sign-in under Settings before inviting anybody.');
} else {
  console.log('That address already had an account, so its password is unchanged.');
}
