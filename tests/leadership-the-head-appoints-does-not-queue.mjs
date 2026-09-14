// Leadership the Head Executive Director appoints does not sit in a queue.
//
// ---------------------------------------------------------------------------
// ASKED FOR: "Once the head of Executive Director invites there's no need of
// approval for ED and Directors."
//
// AND THE INCONSISTENCY THE AUDIT FOUND UNDERNEATH IT. handle_new_user already
// arrived approved for an Explorer and for an Executive Director, and not for a
// Director. Walked through the live trigger for each role inside a transaction
// that rolled back:
//
//   executive -> approved       admin -> NOT approved
//   ds        -> approved       dm    -> NOT approved
//
// The most privileged role in a church already skipped the queue while the one
// below it waited. Nobody chose that; two rules drifted apart.
//
// WHAT THIS FILE HOLDS. The rule grants privilege, so the shape of it matters
// more than the fact of it:
//
//   1. A Director invited BY THE HEAD arrives approved.
//   2. It is tied to is_head_executive -- not to "an executive", which would
//      let any Executive Director appoint Directors unchecked, and not to "an
//      invitation exists", which would let anybody holding a link in.
//   3. A GUIDE still waits. The request named ED and Directors; widening it to
//      every invited role would be a different decision made quietly.
//
// The database is the only place this can be enforced, since the profile row is
// written by a trigger on auth.users before any application code sees it.
//
//   node tests/leadership-the-head-appoints-does-not-queue.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const stripSql = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const dir = path.join(root, 'supabase', 'migrations');
const sql = stripSql(
  fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => read(`supabase/migrations/${f}`)).join('\n'),
);

// The last definition wins, since migrations replace. Matched on CREATE rather
// than on any mention -- a GRANT line names a function just as well, which is
// how a sibling check once read a grant and called it a missing body.
const defs = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.handle_new_user\(/g)];
const at = defs.length ? defs[defs.length - 1].index : -1;
ok(at !== -1, 'handle_new_user is defined');
const body = at === -1 ? '' : sql.slice(at, sql.indexOf('$function$;', at) + 11);

// The auto-approval decision, isolated from the rest of the function.
const rule = /v_auto\s*:=([\s\S]*?);/.exec(body);
ok(!!rule, 'the auto-approval rule is where it is expected to be');
const decision = rule ? rule[1] : '';

ok(/'admin'::public\.user_role/.test(decision),
   'a Director can arrive approved');
ok(/is_head_executive/.test(decision),
   'but only on the Head Executive Director\'s invitation');
ok(/invited_by/.test(decision),
   'read from who issued the invitation, not from who is signing in');

// The two that must NOT have been widened by accident.
ok(!/'dm'::public\.user_role/.test(decision),
   'a Guide still waits for a Director to approve them');
ok(/v_invite\.id is not null/.test(decision),
   'and nobody arrives approved without an invitation at all');

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
