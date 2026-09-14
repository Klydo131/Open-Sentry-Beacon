// Re-send cannot rebuild somebody a leader removed.
//
// ---------------------------------------------------------------------------
// REPORTED FROM THE SCREEN: "I can still see the e-mails that I sent here that
// should have been disappeared because they where part of the system before and
// now they are deleted. If the e-mail is part of the system of the app, the
// re-send should be gone please."
//
// WHY IT IS NOT COSMETIC. Sending an invitation CREATES the account --
// supabase/functions/invite: "the account is created here, with a password
// already on it". So Re-send on a row whose person has been deleted does not
// resend a message. It rebuilds their account. If they were removed for a
// safeguarding reason, a button labelled as a retry silently readmits somebody
// a leader decided to remove, from a row that said "never sent" -- that is,
// from a row claiming nothing had ever happened.
//
// On the reported screen 78 of 81 rows were in this state and NONE was
// genuinely unsent. The bulk button offered to send all of them at once.
//
// THE SIGNAL, AND THE TWO WRONG ANSWERS BEFORE IT. redeemed_at alone must never
// mean "they joined": it is stamped when the account row is created, which is
// the moment Send is pressed, and reading it that way filed people under
// Accepted who had never opened their email. Paired with the ABSENCE of an
// account it is exact, because it separates two states that look identical on
// screen -- an account that was never made, and one that was made and deleted.
//
//   node tests/re-send-cannot-rebuild-a-removed-account.mjs
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

const page = strip(read('components/LiveChurchPages.tsx'));

// 1. The distinction has to exist at all. Without redeemed_at reaching the
// browser the screen cannot tell a deleted account from one never created --
// the column was on the table for months and simply was not returned.
ok(/redeemed_at/.test(strip(read('lib/live/data.ts'))),
   'the browser is told when an invitation was spent');
ok(/church_invitations/.test(
     fs.readdirSync(path.join(root, 'supabase', 'migrations'))
       .filter((f) => /an_invitation_to_somebody_who_was_removed/.test(f))
       .map((f) => read(`supabase/migrations/${f}`)).join('\n')),
   'and the database returns it');

// 2. Both send paths are built from a list that excludes them. Checked as one
// rule rather than two, because the per-row button was fixed first and the bulk
// button -- which offered all 78 at once -- would have been the worse miss.
const removedPredicate = /redeemed_at\s*!==\s*null\s*&&\s*!\s*\w+\.has_account/;
ok(removedPredicate.test(page),
   'a removed account is recognised by a spent invitation with no account left');

for (const list of ['unfinished', 'waiting']) {
  const m = new RegExp(`const ${list} = \\(invites \\?\\? \\[\\]\\)\\.filter\\(([^;]+);`).exec(page);
  ok(!!m && /isRemoved/.test(m[1]),
     `${list} leaves out anybody whose account was removed`);
}

// 3. redeemed_at must not have quietly become the joined test again. This is
// the regression the file already suffered twice.
ok(/const joined = \(invites \?\? \[\]\)\.filter\(\(i\) => i\.joined_at\)/.test(page),
   'joined is still decided by joined_at, not by redeemed_at');

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
