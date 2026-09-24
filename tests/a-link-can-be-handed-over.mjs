// A Director can get the join link instead of emailing it.
//
// WHY THIS EXISTS. An emailed invitation carries a one-time token, and the
// address it points at spends that token on any fetch. A mail scanner, a
// corporate filter or a phone drawing a preview opens it first, and the invited
// person is told their link expired on their very first tap. The templates now
// avoid that, but templates are pasted into a dashboard by hand, and a church
// on a demo deadline needs a route that depends on nothing being pasted
// anywhere. Nothing is emailed on this route, so there is nothing to intercept.
//
// THE RULE IT MUST NOT BREAK. auth.users holds ONE token slot per purpose.
// Minting a second token overwrites the first, so a link minted AFTER a message
// has gone kills the link inside that message. Every invitation, every person.
// This route obeys that by sending nothing at all: one mint, one token, and the
// Director is told plainly that no email went.
//
//   node tests/a-link-can-be-handed-over.mjs
//
// Reads the source. Needs no database and sends nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// ---- The function ----
const fn = stripComments(read('supabase/functions/invite/index.ts'));

ok(/deliver\?: string/.test(fn), 'the function accepts a delivery choice');
ok(/const handOver = body\.deliver === 'link'/.test(fn), 'and reads it as an explicit request');

// The branch has to come BEFORE both mailers, not filter them afterwards.
const handAt = fn.indexOf('if (handOver)');
const brevoAt = fn.indexOf('} else if (brevoKey');
const inviteMailAt = fn.indexOf('inviteUserByEmail');
ok(handAt > -1 && brevoAt > handAt, 'it is decided before the Brevo path is entered');
ok(handAt > -1 && inviteMailAt > handAt, 'and before Supabase Auth is asked to send anything');
ok(/} else if \(brevoKey(?: && brevoSender)?\)/.test(fn),
   'the mailers are the OTHER branches, so no message can leave on this route');

// ---- The one-token rule, now satisfied by having no tokens ----
//
// This section used to count mint sites and check each was guarded, because
// auth.users holds ONE token slot per purpose and a second mint overwrites the
// first. That rule shaped the whole function and broke it repeatedly.
//
// The invitation carries a PASSWORD now. The account is created with one before
// anything is sent, and what the Director hands over is an address, a password,
// and a link to the ordinary sign-in page. There is no slot to race.
const mints = (fn.match(/auth\.admin\.generateLink/g) || []).length;
ok(mints === 0, `nothing mints a one-time token any more (found ${mints})`);
ok(/firstPassword\(\)/.test(fn), 'the account is given a password instead');
ok(/\/login\?email=/.test(fn), 'and the link handed over is the ordinary sign-in page');

// AND THE REPLY CARRIES THE CREDENTIALS, which used to be forbidden. Returning
// a link once meant minting a token and killing the emailed one; returning a
// sign-in address is returning a fact.
const emailReply = fn.slice(fn.lastIndexOf("delivery: 'email'"));
ok(/tempPassword/.test(emailReply), 'a successful send returns the password, so a Director can read it out');
ok(!/token_hash|hashed_token/.test(emailReply), 'and never a one-time token');

// ---- The way in ----
const data = stripComments(read('lib/live/data.ts'));
const invite = data.slice(data.indexOf('export async function inviteMember'));
ok(/deliver\?: 'email' \| 'link'/.test(invite.slice(0, 900)), 'the client can ask for it');
ok(/deliver,/.test(invite.slice(0, 1600)), 'and passes it through to the function');

// ---- The screen ----
const screen = read('components/LiveChurchPages.tsx');
ok(/resend\(i, 'link'\)/.test(screen), 'a Director has a control that asks for the link');
ok(/Get a link to send myself/.test(screen), 'named for what it does, not for how it works');
// THE PANEL MUST NOT WARN ABOUT THINGS THAT ARE NO LONGER TRUE. It used to say
// the link worked once and that opening it would sign the Director out and
// start somebody else's sign-up on their device. Both were true of a one-time
// token and are false of a password, and a caution that turns out not to apply
// teaches somebody to distrust the screen.
ok(!/only works\s*\n?\s*once/.test(screen) && !/works, and can be used once/.test(screen),
   'the panel no longer claims the link works only once');
ok(!/Do not open it yourself/.test(screen),
   'and no longer warns against opening something that is now harmless to open');
ok(/Nothing here expires/.test(screen), 'and says plainly that nothing expires');
ok(/handLink\.pass/.test(screen), 'and shows the password, which is what has to be passed on');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
