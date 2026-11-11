// The sign-up screen can be shown to a room, and can create nothing.
//
// WHY THIS EXISTS. The join screen is the one screen nobody could demonstrate:
// it needs a live one-time link, opening one spends it, and the account it
// creates is real. So a church deciding whether to adopt this could be shown
// every screen except the first one anybody actually meets.
//
// `?preview=ds|dm|admin|executive` renders the real form in that role's words.
// The whole value of it rests on one property — it must be incapable of writing
// anything — and that property is invisible on screen. A preview that quietly
// created an account would be far worse than having no preview at all, which is
// why it is checked here rather than trusted.
//
//   node tests/the-sign-up-can-be-shown.mjs
//
// Reads the source; needs no browser and no database.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'components/live/DoorPages.tsx'), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// ---- It exists, for every role a person can be invited as ----
ok(/const preview = PREVIEW_ROLES\.includes/.test(src), 'the join screen reads ?preview=');
for (const role of ['ds', 'dm', 'admin', 'executive']) {
  ok(new RegExp(`'${role}'`).test(src.slice(src.indexOf('PREVIEW_ROLES'), src.indexOf('PREVIEW_ROLES') + 120)),
     `and offers ${role}`);
}
// An unknown role must not turn the preview on: `?preview=yes` rendering a
// half-configured form is how a demo becomes a support call.
ok(/PREVIEW_ROLES\.includes\(previewParam as Role\) \? \(previewParam as Role\) : null/.test(src),
   'and anything else is not a preview at all');

// ---- It never establishes a session ----
const effect = src.slice(src.indexOf('const establishSession'), src.indexOf('const establishSession') + 900);
const guardAt = effect.indexOf('if (preview)');
const clientAt = effect.indexOf('supabaseAuth()');
ok(guardAt !== -1, 'the session effect checks for a preview');
ok(guardAt !== -1 && clientAt !== -1 && guardAt < clientAt,
   'and returns BEFORE the auth client is even asked for');

// ---- It never writes ----
const submit = src.slice(src.indexOf('const submit = async (event: React.FormEvent) => {'));
const body = submit.slice(0, submit.indexOf('\n  };'));
const previewReturn = body.indexOf('This is a preview');
const firstWrite = Math.min(
  ...['updateUser', 'signUp', 'signInWithPassword', 'finishMySignup', 'rpc(']
    .map((call) => { const at = body.indexOf(call); return at === -1 ? Number.MAX_SAFE_INTEGER : at; }),
);
ok(previewReturn !== -1, 'submit stops on a preview');
ok(previewReturn < firstWrite, 'and stops before anything that could write');

// ---- And it says so, on screen ----
ok(/Nothing here is real and\s*\n?\s*nothing can be created/.test(src)
   || /Nothing here is real/.test(src),
   'the screen says it is a preview');
ok(/This is a preview\. Nothing was created/.test(src),
   'and pressing the button says it again');

// The password rules still run, because watching a short password be refused is
// half of what a room is being shown.
ok(/if \(preview\)[\s\S]{0,400}Use at least \$\{PASSWORD_MIN\} characters/.test(src),
   'the password rules still apply in a preview');
ok(/if \(preview\)[\s\S]{0,500}Tick the permission box/.test(src),
   'and so does the permission box');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
