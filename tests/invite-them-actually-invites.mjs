// "Invite them" actually invites them.
//
// ---------------------------------------------------------------------------
// REPORTED IN THREE MESSAGES, each one a consequence of the last:
//
//   "does it automatically send a letter? How come there was no confirm in my
//    mailbox as a Head ED?"          -- nothing had been sent, so there was
//                                       nothing to confirm.
//   "How can I invite if I no longer see the e-mail when I click ok on the
//    recommendation?"                -- the click had ALSO hidden the address.
//   "Can we just make this automatic if I click invite them?"
//
// decideRecommendation() wrote a status column and stopped. The row read
// INVITED, the Guide who put the name forward saw INVITED, and no invitation,
// no account and no email existed anywhere.
//
// WORSE THAN A NO-OP. The panel draws only `status = 'pending'`, so one click
// sent nothing, removed the person from every screen, and destroyed the only
// place their address was shown -- leaving no way to invite them by hand
// either. Checked live at the time: the only invitation for that address had
// been created sixteen days before and had expired two days earlier.
//
// THE ORDER IS THE FIX, not merely the call. Sending first and writing the
// status only on success means a refusal -- the hourly email allowance is the
// common one -- leaves the row pending and retryable. Writing the status first
// and then sending would strand the person behind a label saying they had been
// dealt with, which is exactly the bug, just with an extra step.
//
//   node tests/invite-them-actually-invites.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const data = strip(read('lib/live/data.ts'));

// The body of decideRecommendation, by brace matching.
const body = (() => {
  const m = /export async function decideRecommendation\(/.exec(data);
  if (!m) return '';
  let i = data.indexOf('{', m.index);
  let depth = 1;
  i += 1;
  while (i < data.length && depth > 0) {
    const ch = data[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  return data.slice(m.index, i);
})();

ok(body.length > 0, 'decideRecommendation is where it is expected to be');
ok(/inviteMember\s*\(/.test(body),
   'deciding "invited" actually sends the invitation');

// THE ORDER. Measured by position, because a call that happens after the write
// is the same bug with an extra step.
const sendAt = body.indexOf('inviteMember');
const writeAt = body.indexOf(".from('recommendations')");
ok(sendAt !== -1 && writeAt !== -1 && sendAt < writeAt,
   'and sends BEFORE writing the status, so a refusal leaves it retryable');

// The database floor, for a browser that has not been reloaded.
const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');
ok(/invited_means_invited/.test(migrations),
   'and the database refuses the claim on its own, for stale browsers');

// The address must survive a decision, however it goes.
const card = strip(read('components/LiveMinistry.tsx'));
ok(/Copy address/.test(card),
   'the address can be taken, not only read');
ok(/const decided = rows\?\.filter\(\(r\) => r\.status !== 'pending'\)/.test(card),
   'and a decided recommendation is kept rather than erased');

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
