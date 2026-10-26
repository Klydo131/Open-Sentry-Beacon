// A new password has its own page, and every page that sets one explains
// itself when it cannot.
//
// ---------------------------------------------------------------------------
// REPORTED on 26 October 2026: "for making new password, it should be a
// separate web page, not in the log in page so that users will not be
// confused why it was used in the log in page." Until then "Forgot your
// password?" sent the e-mail straight from the sign-in page, and the link
// landed on the invitation page, which told somebody who had only forgotten a
// password "This is the address your invitation was sent to."
//
// FOUND IN THE SAME READING, each a real way to be stuck:
//   * a member with an authenticator app who reset a forgotten password was
//     refused with "AAL2 session is required to update password" and nothing
//     to do about it: the code is now asked for on the page, then the password
//     is saved;
//   * a password longer than 72 bytes is refused by the sign-in service (it
//     is stored with bcrypt), and no screen said so first;
//   * a second reset request within the minute was answered with the
//     service's own "For security purposes, you can only request this after
//     37 seconds", and the invitation page's "send me a new link" swallowed
//     that refusal and promised an e-mail that was not coming.
//
// WHAT HOLDS, each broken on purpose once to watch it go red.
//
//   node tests/a-new-password-has-its-own-page.mjs
// ---------------------------------------------------------------------------
import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const door = code('components/live/DoorPages.tsx');
const pages = code('components/live/PasswordPages.tsx');
const calls = code('lib/live/password.ts');
const login = door.slice(door.indexOf('export function LiveLoginPage'), door.indexOf('export function LiveSignupPage'));
const join = door.slice(door.indexOf('export function LiveJoinPage'));

// 1. Two pages of their own.
ok(/<LiveForgotPasswordPage \/>/.test(code('app/forgot-password/page.tsx'))
  && /<LiveNewPasswordPage \/>/.test(code('app/new-password/page.tsx')),
  '/forgot-password asks for the link and /new-password is where it opens');

// 2. The sign-in page signs in, and nothing else.
ok(!/resetPasswordForEmail|sendPasswordLink|updateUser|autoComplete="new-password"/.test(login),
  'the sign-in page sends no reset e-mail and has no new-password box');
ok(/href=\{forgotHref\(\)\}/.test(login) && /`\/forgot-password\$\{q \? `\?\$\{q\}` : ''\}`/.test(login),
  'its "Forgot your password?" opens /forgot-password, carrying the address already typed');

// 3. Every reset link lands on /new-password.
ok(/\/new-password\?token_hash=\{\{ \.TokenHash \}\}&type=recovery/.test(read('docs/email-templates/recovery.html'))
  && !/\/join\?token_hash=\{\{ \.TokenHash \}\}&type=recovery/.test(read('docs/email-templates/recovery.html')),
  'the recovery e-mail template opens /new-password');
ok(/kind === 'recovery'\s*\?\s*`\$\{cfg\.siteUrl\}\/new-password\?token_hash=/.test(code('selfhost/server/src/mail.mjs')),
  'so does the Postgres edition\'s own mailer');
ok(/redirectTo: `\$\{site\}\/new-password`/.test(code('supabase/functions/invite/index.ts'))
  && !/join\?recovery=1/.test(code('supabase/functions/invite/index.ts')),
  'and the invitation function, for an account that already existed');
ok(/redirectTo: `\$\{window\.location\.origin\}\$\{NEW_PASSWORD_PATH\}`/.test(calls),
  'and every link the app asks for itself');
// An older e-mail, or a project still on the old template, reaches /join.
const establish = join.slice(join.indexOf('const establishSession'));
const handOver = establish.indexOf('if (isResetLink(params, window.location.hash))');
ok(handOver > -1 && handOver < establish.indexOf('verifyOtp') && handOver < establish.indexOf('signOut'),
  '/join hands any reset link to /new-password before it redeems or signs anything out');
ok(!/recovery/.test(join.replace(/isResetLink|recovery template/g, '')),
  'and the invitation page has no reset mode left in it');

// 4. The new-password page itself.
ok(/verifyOtp\(\{ token_hash: tokenHash, type: 'recovery' \}\)/.test(calls),
  'it redeems the link in the browser, where a mail scanner cannot spend it');
ok(/state: 'someone-else'/.test(calls) && /if \(!handover\)/.test(calls),
  'it asks before replacing whoever is already signed in on the device');
ok(/window\.history\.replaceState\(null, '', window\.location\.pathname\)/.test(calls),
  'and takes the link out of the address bar once it is used');
ok(/code === 'insufficient_aal'/.test(pages) && /<CodeEntry[\s\S]{0,200}await enterCode\(code\)[\s\S]{0,200}await saveNewPassword\(password\)/.test(pages),
  'an account with an authenticator app is asked for its code, then the password is saved');
ok(/signOutOtherDevices\(\)/.test(calls) && /clearTemporaryPasswordReminder\(\)/.test(calls)
  && /claimMyPendingInvitation\(\)/.test(calls),
  'saving signs out every other device, clears the invitation-password reminder, and claims an invitation');
ok(/'\/forgot-password',\\n  '\/new-password'/.test(read('app/sw.js/route.ts')),
  'both pages open with no signal, like the rest of the app');

// 5. /forgot-password says the same whatever the address.
ok(/If that address has an account, a link to choose a new password is on its way/.test(pages)
  && !/user_not_found|no account|not registered/i.test(pages),
  'the answer is the same whether or not the address belongs to anybody');
ok(/catch \(cause\) \{\s*setError\(humanError\(cause\)\)/.test(pages),
  'a refusal (asking again too soon) is said in words, not promised away');
ok(/catch \(cause\) \{[\s\S]{0,300}setRescueNotice\(humanError\(cause\)\)/.test(join),
  'and the invitation page\'s "send me a new link" no longer swallows one');

// 6. The rules, run as they ship.
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-pw-'));
await build({
  entryPoints: [path.join(root, 'lib/password-rules.ts')],
  alias: { '@': root }, outfile: path.join(out, 'rules.mjs'),
  bundle: true, format: 'esm', platform: 'node', target: 'es2020', logLevel: 'silent',
});
const { passwordProblem, PASSWORD_MIN } = await import(pathToFileURL(path.join(out, 'rules.mjs')).href);
const said = (a, b = a, email = 'maria.santos@example.org') => passwordProblem(a, b, email);
ok(PASSWORD_MIN === 10 && /at least 10/.test(said('short')), 'fewer than 10 characters is refused, with the count');
ok(said('river stone morning light') === '', 'a few words only the person would put together is fine');
ok(/too long/.test(said('a'.repeat(30) + 'é'.repeat(25))), 'more than 72 bytes is refused before the service refuses it');
ok(/do not match/.test(said('river stone morning', 'river stone mornin')), 'the two must match');
ok(/e-mail/.test(said('maria.santos2026')), 'the person\'s own e-mail name is refused');
ok(/app/.test(said('hopebeacon2026')), 'so is the app\'s name');
ok(/easy to guess/.test(said('1234567890')) && /easy to guess/.test(said('0987654321'))
  && /easy to guess/.test(said('qwertyuiop')) && /easy to guess/.test(said('aaaaaaaaaaaa'))
  && /easy to guess/.test(said('password123')),
  'and so are a row of keys, one key held down, and "password"');
for (const f of ['components/LiveAccountPages.tsx', 'components/live/DoorPages.tsx', 'components/live/PasswordPages.tsx']) {
  ok(/passwordProblem\(/.test(code(f)), `${f} holds a new password to the same rules`);
}

// 7. Written down.
ok(/forgot-password/.test(read('docs/HOW-TO-USE.md')) && /new-password/.test(read('docs/EMAIL.md')),
  'How-To-Use and EMAIL.md say where a forgotten password is dealt with');

console.log(bad ? `\nRESULT: ${bad} FAILED` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
