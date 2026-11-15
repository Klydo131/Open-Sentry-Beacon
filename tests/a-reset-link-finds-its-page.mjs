// A password-reset link that lands on any page is handed to /new-password.
//
// Reported 15 November 2026: the link opened the home page and the person
// never reached the page that chooses a new password. The handover script in
// <head> (lib/reset-link-handover.ts) moves it on, untouched; every other
// address is left alone.
//
//   node tests/a-reset-link-finds-its-page.mjs
import { readFileSync } from 'node:fs';
import ts from 'typescript';

let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); if (!c) bad++; };

const js = ts.transpileModule(readFileSync('lib/reset-link-handover.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const mod = { exports: {} };
new Function('module', 'exports', js)(mod, mod.exports);
const SCRIPT = mod.exports.RESET_LINK_HANDOVER;

/** Run the script on an address; say where it sent the person, or null. */
function goes(pathname, search, hash) {
  let to = null;
  const location = { pathname, search, hash, replace: (u) => { to = u; } };
  new Function('location', 'URLSearchParams', SCRIPT)(location, URLSearchParams);
  return to;
}

const TOKENS = '#access_token=abc.def.ghi&expires_in=3600&refresh_token=xyz&token_type=bearer&type=recovery';
ok(goes('/', '', TOKENS) === `/new-password${TOKENS}`, 'a reset link on the home page goes to /new-password, details untouched');
ok(goes('/login', '', TOKENS) === `/new-password${TOKENS}`, 'and on the sign-in page');
ok(goes('/', '', '#access_token=a&refresh_token=b&amp;type=recovery') === '/new-password#access_token=a&refresh_token=b&amp;type=recovery', 'a mail client that wrote &amp; is still recognised');
ok(goes('/', '?token_hash=h&type=recovery', '') === '/new-password?token_hash=h&type=recovery', 'a link carrying its token in the address is handed on too');
ok(goes('/', '?recovery=1', '') === '/new-password?recovery=1', 'and the recovery marker');
ok(goes('/new-password', '', TOKENS) === null, 'a reset link already on /new-password is left alone');
ok(goes('/', '', '#access_token=a&refresh_token=b&type=invite') === null, 'an invitation link is not taken for a reset');
ok(goes('/join', '?token_hash=h&type=invite', '') === null, 'nor an invitation carried in the address');
ok(goes('/', '', '') === null && goes('/study', '?x=1', '#top') === null, 'an ordinary page is never moved');
ok(goes('/', '', '#error=access_denied&error_code=otp_expired') === null, 'a refused link stays where it is, to say so');

const layout = readFileSync('app/layout.tsx', 'utf8');
ok(/<ResetLinkHandover \/>/.test(layout) && layout.indexOf('<ResetLinkHandover />') < layout.indexOf('<body>'),
   'it is in <head>, before anything else can read the link');

console.log(bad ? `\n${bad} check(s) failed` : '\nA reset link finds its page.');
process.exit(bad ? 1 : 0);
