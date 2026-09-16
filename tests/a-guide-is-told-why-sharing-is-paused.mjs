// A Guide who cannot share is told why, and the reason cannot drift from the rule.
//
// ---------------------------------------------------------------------------
// FOUND BY PROBING THE LIVE DATABASE. A Guide sharing a resource with their own
// Explorer was refused. The rule was right -- an open case pauses sharing for
// that pairing -- but the Guide saw a bare row-level-security violation, which
// humanError renders as "you do not have permission, ask your Director". They
// DO have permission, it is paused rather than withheld, and this church has no
// Directors to ask.
//
// THE DEFECT THIS CHECK IS REALLY ABOUT is not the missing sentence, which any
// assertion could pin. It is that a rule and its explanation are two statements
// of one thing, and two statements of one thing drift. The day a tenth
// condition is added to the rule, an explanation listing nine would start
// saying "nothing is wrong" to somebody being refused -- worse than silence,
// because it is confidently wrong.
//
// So the fix is structural: pairing_can_share_library is DEFINED AS
// why_library_sharing_is_paused(...) is null. This file's job is to keep it
// that way, which is why the load-bearing assertion is about the shape of the
// permission function rather than about any particular sentence.
//
//   node tests/a-guide-is-told-why-sharing-is-paused.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// Comments blanked, length preserved, so prose about a rule is never read as
// the rule. Over-stripping can only ever cause a false FAIL, never a false pass.
const stripSql = (src) =>
  src.replace(/\/\*[\s\S]*?\*\/|--[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '));

const dir = path.join(root, 'supabase/migrations');
const file = fs.readdirSync(dir).find((f) => f.includes('why_sharing_is_paused'));
ok(!!file, 'the migration is present');
const sql = file ? stripSql(read(`supabase/migrations/${file}`)) : '';

// ---------------------------------------------------------------------------
// 1. THE ONE THAT MATTERS: one rule, not two that agree today
// ---------------------------------------------------------------------------
{
  // Matched on the SHAPE, not on exact text. A pin on the literal body would
  // refuse the next person who reformats it -- and this project has now shipped
  // six checks that failed the commit making their own rule stronger.
  const derived = new RegExp(
    'create or replace function public\\.pairing_can_share_library[\\s\\S]{0,400}?'
    + 'why_library_sharing_is_paused\\s*\\(\\s*p_pairing\\s*\\)\\s*is null',
  );
  ok(derived.test(sql),
     'the permission is DERIVED from the explanation, so the two cannot disagree');

  // And the conditions live in exactly one of them. If the permission function
  // regrows a body of its own, the derivation above is decoration.
  const body = (sql.match(
    /create or replace function public\.pairing_can_share_library[\s\S]*?\$\$([\s\S]*?)\$\$/,
  ) ?? [])[1] ?? '';
  ok(body.length > 0 && !/\b(is_approved|suspended_at|church_id|library_blocked|trials)\b/.test(body),
     'and the permission function holds no conditions of its own');
}

// ---------------------------------------------------------------------------
// 2. EVERY CONDITION THE OLD RULE HAD, THE EXPLANATION STILL HAS
// ---------------------------------------------------------------------------
//
// The rewrite moved nine conditions from one function into another. A condition
// dropped in the move is a permission silently widened, which is the exact
// shape of the in_trial mistake: a predicate changed for a reading reason that
// turned out to govern a writing one too.
{
  const why = (sql.match(
    /create or replace function public\.why_library_sharing_is_paused[\s\S]*?\$\$([\s\S]*?)\$\$/,
  ) ?? [])[1] ?? '';

  const CONDITIONS = [
    [/status\s*<>\s*'active'/,                        'the pairing must be active'],
    [/auth\.uid\(\)/,                                 'the asker must be in the pairing'],
    [/is_approved/,                                   'both people must be approved'],
    [/suspended_at\s+is\s+not\s+null/,                'neither may be suspended'],
    [/church_id\s+is\s+distinct\s+from/,              'both must be in one church'],
    [/library_blocked/,                               'neither may be blocked from the library'],
    [/pairing_library_permissions/,                   'sharing may be switched off for the pair'],
    [/trials[\s\S]{0,120}status\s*=\s*'open'/,        'an open case pauses sharing'],
  ];
  for (const [re, name] of CONDITIONS) {
    ok(re.test(why), `the explanation still checks: ${name}`);
  }

  // THE NULL TRAP, which the old INNER JOIN handled silently and this cannot.
  // If a pairing points at somebody who is gone, every comparison below is
  // against NULL, every `if` is neither true nor false, and the function falls
  // through to "allowed" -- turning a refusal into a permission.
  ok(/guide\.id is null or explorer\.id is null/.test(why),
     'a pairing missing a person is refused, not allowed by falling through');
}

// ---------------------------------------------------------------------------
// 3. THE REASON DOES NOT LEAK WHAT A REFUSAL IS NOT ALLOWED TO CONFIRM
// ---------------------------------------------------------------------------
//
// join_trial gives one message for every refusal on purpose, because naming
// whose case it is confirms the shape of a case to somebody outside it. This
// function must not become the way around that.
{
  const trialBranch = (sql.match(/trials[\s\S]{0,400}?return\s+('[\s\S]*?');/) ?? [])[1] ?? '';
  ok(trialBranch.length > 0, 'the open-case branch returns a sentence');
  ok(!/\b(guide|explorer|subject|about you|about them|your Explorer)\b/i.test(trialBranch),
     'and it names nobody, so it cannot be used to discover whose case it is');

  // A pairing that does not exist and one that is not yours must be
  // indistinguishable, or the question becomes a way to enumerate pairings.
  //
  // MEASURED AS ONE BRANCH, NOT AS TWO NEARBY STRINGS. The first version of
  // this looked for "pair.id is null" within 200 characters of the not-yours
  // sentence -- and passed when the guard was deliberately split into two ifs
  // answering differently, because the second return was still inside the
  // window. The window was wide enough to span the very split it forbade. What
  // makes the two indistinguishable is that ONE condition covers both, so that
  // is what gets measured: everything between the null test and the first
  // return has to include the ownership test, joined by `or`.
  const firstGuard = (sql.match(/pair\.id is null([\s\S]*?)return\s+'[^']*';/) ?? [])[1] ?? '';
  ok(/\bor\b/.test(firstGuard) && /auth\.uid\(\)/.test(firstGuard),
     'a pairing that does not exist answers the same as one that is not yours');
}

// ---------------------------------------------------------------------------
// 4. AND THE SCREEN ASKS, INSTEAD OF PRINTING THE POLICY VIOLATION
// ---------------------------------------------------------------------------
{
  const data = read('lib/live/data.ts');
  const fn = data.slice(data.indexOf('export async function shareMaterial'));
  const body = fn.slice(0, fn.indexOf('\n}\n') + 2);

  ok(/why_library_sharing_is_paused/.test(body),
     'shareMaterial asks the database why when the rules refuse');
  ok(/row-level security/i.test(body),
     'and it asks only when the refusal was the rules, not any failure at all');
  // Ordering: the duplicate case has its own sentence and must be answered
  // before the generic path, or "already shared" becomes "paused".
  ok(body.indexOf('23505') < body.indexOf('why_library_sharing_is_paused'),
     'the already-shared case is still answered first');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
