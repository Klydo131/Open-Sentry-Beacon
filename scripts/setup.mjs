// `npm run setup` — connect this app to your own database, without editing code.
//
// WHY THIS EXISTS. Everything needed to run a real Hope Beacon already ships in
// this repository: the whole schema, the security rules, the sign-in gateway.
// The only thing standing between a fresh clone and a working church app was
// two settings, and the instructions for them lived in a document that asked a
// non-programmer to create a file with a leading dot, in the right folder, with
// two exact variable names spelled correctly and no trailing spaces.
//
// That is not a setup step, it is a spelling test, and it is the one that was
// failing people. This script asks two questions and writes the file.
//
// It never touches the network and never sends anything anywhere. It reads two
// values you paste, checks their SHAPE only, and writes them to `.env.local`,
// which .gitignore already refuses to commit.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env.local');

const BOLD = '\u001b[1m';
const DIM = '\u001b[2m';
const GREEN = '\u001b[32m';
const YELLOW = '\u001b[33m';
const RED = '\u001b[31m';
const OFF = '\u001b[0m';

const say = (s = '') => console.log(s);
const heading = (s) => say(`\n${BOLD}${s}${OFF}`);
const hint = (s) => say(`${DIM}${s}${OFF}`);

/**
 * Does this look like a project URL?
 *
 * Shape only — whether it is YOUR project is not something this script can know
 * and should not pretend to. The one thing worth refusing is `http:`, because a
 * password typed into a page that posts over plain HTTP is readable by every
 * machine between the phone and the server.
 */
function checkUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) return 'Nothing was entered.';
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return 'That is not a web address. It should start with https:// and have no spaces.';
  }
  if (parsed.protocol !== 'https:') {
    return 'It must start with https:// — a password sent over plain http can be read in transit.';
  }
  if (trimmed !== parsed.origin) {
    return `Use just the address itself, with no path after it: ${parsed.origin}`;
  }
  return null;
}

/**
 * Does this look like the key that is safe to publish?
 *
 * SUPABASE ISSUES TWO DIFFERENT KEY FORMATS AND THIS HAS TO KNOW BOTH.
 *
 *   legacy   eyJhbGci….eyJyb2xl….sig    a JWT; the role is inside it
 *            anon = safe, service_role = catastrophic
 *   current  sb_publishable_…  /  sb_secret_…
 *            new projects are given these, and the role is in the prefix
 *
 * The first version of this only understood the JWT shape, and it got BOTH
 * modern keys wrong in the same way: three dot-separated parts or nothing. A
 * new project's publishable key — perfectly valid, the app works with it — was
 * rejected as a typo, so anybody who created a Supabase project recently could
 * not get through setup at all.
 *
 * The dangerous half of that is worse and is the reason this was rewritten.
 * `sb_secret_…` bypasses every security rule in the database exactly as
 * `service_role` does, and it was being answered with "that does not look like
 * the key" — a message that says try again, not a message that says stop. The
 * one mistake this function exists to catch was the one it failed to name, and
 * somebody told they had a typo will go back, decide the tool is confused, and
 * write the key into .env.local by hand.
 *
 * Refusing an unfamiliar format outright would be wrong in the other direction:
 * key formats change, and a setup script that rejects tomorrow's key is a
 * setup script nobody can use. So an unrecognised shape is allowed through,
 * while anything that positively identifies itself as privileged is stopped.
 */
function checkKey(value) {
  const trimmed = value.trim();
  if (!trimmed) return 'Nothing was entered.';
  if (/\s/.test(trimmed)) return 'That has a space or line break in it. Copy the whole key again.';

  const STOP = (what) =>
    `STOP. That is the ${what}, which bypasses every security rule in your ` +
    'database. It must never be given to a browser. Go back and copy the ' +
    'PUBLIC key instead — the one meant to be published.';

  // Current format. The role is stated in the prefix, so no decoding needed.
  if (/^sb_secret_/i.test(trimmed)) return STOP('secret key');
  if (/^sb_publishable_/i.test(trimmed)) return null;

  const parts = trimmed.split('.');
  if (parts.length !== 3) {
    return (
      'That does not look like either kind of key. It is either a long string ' +
      'with two dots in it, or one starting sb_publishable_.'
    );
  }

  // Legacy format. Read the claims without verifying anything — this is a typo
  // check, not authentication. If it does not decode, let it through: an
  // unfamiliar key format is not evidence of a wrong key.
  let claims;
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const role = String(claims?.role ?? '');
  if (role && role !== 'anon') return STOP(`key for the role "${role}"`);
  return null;
}

async function ask(rl, question, check) {
  for (;;) {
    const answer = await rl.question(`${question}\n> `);
    const problem = check(answer);
    if (!problem) return answer.trim();
    say(`${RED}${problem}${OFF}\n`);
  }
}

async function main() {
  say(`${BOLD}Hope Beacon — connect your own database${OFF}`);
  hint('Two questions. Nothing is sent anywhere; this only writes a file on this computer.');

  if (fs.existsSync(envPath)) {
    say(`\n${YELLOW}.env.local already exists.${OFF}`);
    const rl0 = readline.createInterface({ input: stdin, output: stdout });
    const go = await rl0.question('Replace it? Type yes to continue: ');
    rl0.close();
    if (go.trim().toLowerCase() !== 'yes') {
      say('\nLeft alone. Nothing was changed.');
      return;
    }
  }

  heading('Where to find these');
  say('  1. Open your project at the database provider you chose.');
  say('  2. Go to Settings, then API.');
  say('  3. Leave that page open — both answers are on it.');

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    heading('1 of 2 — Project URL');
    hint('On that page it is labelled "Project URL". It starts with https://');
    const url = await ask(rl, 'Paste it here:', checkUrl);

    heading('2 of 2 — Public key');
    hint('The key marked public, publishable, or "anon" — the one meant to be shared.');
    hint('NOT the secret one beside it. That one bypasses every rule in your database.');
    const key = await ask(rl, 'Paste it here:', checkKey);

    const body = [
      '# Written by `npm run setup`. Safe to edit by hand.',
      '#',
      '# Neither value here is a secret. The key below is meant to reach every',
      '# visitor\'s browser — what protects your congregation is the security rules',
      '# in the database, not the secrecy of this string.',
      '#',
      '# This file is never committed: .gitignore refuses every .env variant.',
      '',
      `NEXT_PUBLIC_SUPABASE_URL=${url}`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${key}`,
      '',
    ].join('\n');

    fs.writeFileSync(envPath, body, { mode: 0o600 });

    say(`\n${GREEN}Saved to .env.local${OFF}`);

    heading('What happens now');
    say('  Run `npm run dev` and open the app. The front door changes from a list');
    say('  of sample people to a real e-mail and password sign-in.');
    say('');
    say('  If you have not created the tables yet, sign-in will fail — open /setup');
    say('  in the running app and it will tell you exactly which step is missing.');
    say('');
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  say(`\n${RED}Setup stopped: ${error?.message ?? error}${OFF}`);
  process.exitCode = 1;
});
