// An account belongs to one church, and only that church may re-invite it.
//
// ---------------------------------------------------------------------------
// The invite function sets a fresh password on an account that already
// exists, so a re-send can be handed over. That is right inside the church the
// account belongs to, and must never happen from any other church, whether or
// not the person has signed in yet. This holds the refusal in place, ahead of
// anything the function writes.
//
//   node tests/an-account-belongs-to-one-church.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTs } from './_strip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fn = stripTs(fs.readFileSync(path.join(root, 'supabase/functions/invite/index.ts'), 'utf8'));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const refuse = fn.search(/if \(existing && existing\.church_id && existing\.church_id !== church\) \{\s*return json\([^;]*409\)/);
ok(refuse > -1, 'an account in another church is refused with 409');

// Not nested under the "has signed in" check: it must hold for somebody who
// has never signed in too.
const joinedBlock = fn.indexOf('if (existing && existing.completed_at) {');
let depth = 0, end = -1;
for (let i = fn.indexOf('{', joinedBlock); i < fn.length; i += 1) {
  if (fn[i] === '{') depth += 1;
  else if (fn[i] === '}') { depth -= 1; if (depth === 0) { end = i; break; } }
}
ok(joinedBlock > -1 && end > -1 && refuse > end,
  'and the refusal does not depend on whether they have signed in');

const firstWrite = Math.min(
  ...[".from('invites')\n      .insert(", 'updateUserById(', 'createUser(']
    .map((s) => fn.indexOf(s)).filter((i) => i > -1),
);
ok(refuse > -1 && refuse < firstWrite,
  'and it comes before the function writes an invitation or touches a password');

const msg = fn.slice(refuse, refuse + 200);
ok(!/full_name|church_id\}/.test(msg), 'the refusal does not say which church, or whose account');

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
