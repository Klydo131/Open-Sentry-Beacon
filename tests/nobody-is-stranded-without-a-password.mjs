// Being invited must end in a password, or the account is a locked door.
//
// THE SHAPE OF THE PROBLEM. An invitation creates the auth account the moment
// it is SENT, not when the person arrives. So somebody whose one-time link is
// spent before they reach the password step has a real account, a real row, a
// real "has an account" tick on the Director's screen — and no password, and
// therefore no way in. Twenty-three people were in exactly that state at once:
// seven Directors, seven Guides, nine Explorers.
//
// The usual cause was the old email order. They followed the install steps
// first, the installed app opened as a fresh session with no invitation in it,
// and the link was gone by the time they came back. Reordering the email fixes
// it going forward and does nothing for anybody already stranded.
//
// TWO WAYS OUT, ONE FROM EACH SIDE, and this checks both exist:
//   the person   — offered at the moment their sign-in is refused, in words
//                  that describe never having had a password rather than
//                  having forgotten one;
//   the Director — one button for the whole backlog, rather than finding the
//                  unfinished rows by eye and pressing Re-send on each.
//
//   node tests/nobody-is-stranded-without-a-password.mjs
//
// Reads the source; needs no browser and no database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// The sign-in page, and since 26 October 2026 the forgotten-password pages it
// links to (components/live/PasswordPages.tsx, lib/live/password.ts).
const door = read('components/live/DoorPages.tsx');
const passwordPages = read('components/live/PasswordPages.tsx');
const passwordCalls = read('lib/live/password.ts');
const church = read('components/LiveChurchPages.tsx');

// ---- The person's own way out ----
ok(/couldBeUnfinished/.test(door), 'a refused sign-in is examined, not just shown');
ok(/Never set a password yet\?/.test(door),
   'and somebody who never had one is addressed in those words');
ok(/Send me a link to set my password/.test(door) && /href=\{forgotHref\('first=1'\)\}/.test(door),
   'with a button that takes them to the page that sends one, in words for somebody who never had one');
ok(/first \? say\('Set your password'\)/.test(passwordPages) && /sendPasswordLink\(address\)/.test(passwordPages),
   'and that page sends it'); 
// "Forgot your password?" was already there and is not enough: it describes a
// different person, which is exactly why the stuck ones did not press it.
ok(/Forgot your password\?/.test(door), 'the ordinary forgotten-password door is still there too');
// Cleared on a new attempt, or it lingers after a successful sign-in.
ok(/setCouldBeUnfinished\(false\)/.test(door), 'and it is cleared when they try again');

// resetPasswordForEmail is the mechanism, and it is the right one BECAUSE it
// works for an account that has never had a password.
ok(/resetPasswordForEmail/.test(passwordCalls), 'it uses the reset path, which works with no password set');
ok(/redirectTo: `\$\{window\.location\.origin\}\$\{NEW_PASSWORD_PATH\}`/.test(passwordCalls)
   && /NEW_PASSWORD_PATH = '\/new-password'/.test(passwordCalls),
   'and lands them on the page that sets one');

// ---- The Director's way out ----
ok(/resendAllUnfinished/.test(church), 'a Director can re-send to everybody unfinished');
ok(/!i\.joined_at/.test(church),
   'and "unfinished" means no password chosen, not merely "has an account"');
ok(/Send all \$\{unfinished\.length\} a fresh link/.test(church), 'the button names the number');

// ONE AT A TIME. The mailer allows one message per address per minute and has
// an hourly project ceiling; a burst has the first few succeed and the rest
// refused, and a refusal looks exactly like a broken button.
ok(/for \(let at = 0; at < queue\.length/.test(church), 'they go in sequence, not all at once');
ok(/setTimeout\(go, 1200\)/.test(church), 'with a pause between each');

// A link handed back instead of sent is a refusal wearing a success.
ok(/result\.delivery === 'link'\) failed\.push/.test(church),
   'a link handed back counts as not sent');
ok(/did not go, and need chasing by hand/.test(church),
   'and anything refused is named rather than counted');
ok(/bulkFailed\.join\(', '\)/.test(church),
   'by address, because only the Director can chase them');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
