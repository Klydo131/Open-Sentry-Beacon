// Make the secrets a new installation needs, once.
//
//   node src/keys.mjs            print them
//   node src/keys.mjs --write    write them to selfhost/.env if it does not exist yet
//
// JWT_SECRET signs every sign-in; whoever has it can be anybody. ANON_KEY is
// public (the app ships it to every browser). SERVICE_ROLE_KEY passes every
// row rule and must never leave the server. The two passwords are for the
// database itself.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { sign } from './jwt.mjs';
import { REPO_ROOT } from './config.mjs';

const TEN_YEARS = 10 * 365 * 24 * 3600;

export function makeKeys(secret = crypto.randomBytes(48).toString('base64url')) {
  const iat = Math.floor(Date.now() / 1000);
  return {
    JWT_SECRET: secret,
    ANON_KEY: sign({ role: 'anon', iss: 'beacon', iat, exp: iat + TEN_YEARS }, secret),
    SERVICE_ROLE_KEY: sign({ role: 'service_role', iss: 'beacon', iat, exp: iat + TEN_YEARS }, secret),
    POSTGRES_PASSWORD: crypto.randomBytes(24).toString('base64url'),
    AUTHENTICATOR_PASSWORD: crypto.randomBytes(24).toString('base64url'),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const keys = makeKeys();
  const lines = Object.entries(keys).map(([k, v]) => `${k}=${v}`).join('\n');
  if (process.argv.includes('--write')) {
    const target = path.join(REPO_ROOT, 'selfhost/.env');
    if (fs.existsSync(target)) {
      console.error(`${target} already exists. Nothing was changed; new keys would sign everybody out.`);
      process.exit(1);
    }
    const example = fs.readFileSync(path.join(REPO_ROOT, 'selfhost/.env.example'), 'utf8');
    let text = example;
    for (const [k, v] of Object.entries(keys)) {
      text = text.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`);
    }
    fs.writeFileSync(target, text, { mode: 0o600 });
    console.log(`Wrote ${target} (readable by you only). Fill in SITE_URL, PUBLIC_URL and the SMTP lines next.`);
  } else {
    console.log(lines);
  }
}
