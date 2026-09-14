// A person waiting for approval is visible to somebody who can approve them.
//
// ---------------------------------------------------------------------------
// REPORTED FROM BOTH ENDS AT ONCE, which is the only reason it was findable:
// a Guide looking at "A Director or Executive Director must approve your
// account", and in the next window the Executive Director's own screen reading
// "Awaiting approval 0 - Nobody is waiting."
//
// THE MECHANISM. Sending an invitation creates the account. The CHURCH and the
// invited role are attached afterwards, by claim_my_pending_invitation(). The
// join-link flow calls it. Signing in did not -- so anybody who arrived through
// /login instead of finishing their join link kept a profile with church_id
// NULL, and every approval list is scoped by church. A church-less profile
// therefore belongs to nobody and is invisible to every Director alive. The
// person waits forever, and the only screen that could rescue them truthfully
// reports that there is nobody to rescue.
//
// WHY A CHECK AND NOT JUST THE FIX. Nothing about this is visible from either
// side. No error is raised, no row is missing, and both screens are correct
// about what they can see. The failure is in the join between them, and the
// only durable way to hold it is to assert that the claim happens on the way
// in -- on EVERY way in, not just the one that happened to be tested.
//
//   node tests/a-person-waiting-is-visible-to-somebody.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
// Comments are stripped before anything is measured. A check satisfied by the
// PROSE describing the fix is the failure this project keeps rediscovering.
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|\{\/\*[\s\S]*?\*\/\}|\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const data = strip(read('lib/live/data.ts'));

// The body of signIn, by brace matching from its declaration. Measured inside
// the function rather than anywhere in the file, because the point is that THIS
// path claims -- a call somewhere else in the module would not help it.
const signInBody = (() => {
  const m = /export async function signIn\s*\([^)]*\)[^{]*\{/.exec(data);
  if (!m) return '';
  let i = m.index + m[0].length;
  let depth = 1;
  while (i < data.length && depth > 0) {
    const ch = data[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    i += 1;
  }
  return data.slice(m.index, i);
})();

ok(signInBody.length > 0, 'signIn is where it is expected to be');

ok(/claimMyPendingInvitation\s*\(/.test(signInBody),
   'signing in claims a pending invitation, so the person lands in a church');

// The claim must be able to run for the people who need it: those not yet
// approved. A gate that skips them puts the bug straight back while leaving the
// call in place for a grep to find.
ok(/!\s*\w+\.is_approved/.test(signInBody),
   'the claim is reachable for somebody who is not approved yet');

// And the join flow must keep doing it too. This half was always right; it is
// asserted so that "fixing" the duplication by deleting the wrong one fails.
const door = strip(read('components/live/DoorPages.tsx'));
ok(/claimMyPendingInvitation\s*\(/.test(door),
   'the join link still claims it as well');

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
