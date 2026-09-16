// Nobody answers a report about themselves, and nobody joins somebody else's.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. "any Directors can pick up a Guide and Explorer's report,
// but if a Director misbehave it will be put on trial with EDs and Head ED ...
// only one can chat such case, it wont be a group chat but a one on one chat."
//
// THE HAZARD THIS GUARDS, WHICH PREDATED THE REQUEST. `reports_read` in
// migration 0021 admitted every approved admin and executive of the church with
// no exclusion for the person the report was ABOUT, and `report_person`
// notified all of them. So a Director could already read a report filed against
// them. Add "any Director can pick up a report" on top and it becomes a trap:
// the reported Director claims the case about themselves and is the only other
// person in a private thread with the member who spoke up.
//
// SO THE RULES ARE IN THE DATABASE AND THIS CHECKS THE DATABASE. A screen can
// hide a button; only a policy can refuse a query. What is asserted here is the
// migration, plus the one thing the screen must not do, which is invent its own
// idea of who may speak.
//
// WHAT THIS CANNOT DO. It reads SQL; it does not run it. The rules were also
// exercised against the live database with an RLS probe that rolled itself
// back, and all ten cases behaved: a Director could not see the case about
// themselves, could see and claim a member's case, could not claim their own; a
// second Executive could see that the Director's case existed but could not
// read or join the one-to-one thread; the member could read and reply to their
// own. That run is evidence for a moment in time. This file is what keeps it
// true.
//
//   node tests/a-report-is-answered-by-one-person.mjs
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

const dir = path.join(root, 'supabase/migrations');
const file = fs.readdirSync(dir).find((f) => f.includes('a_report_is_answered_by_one_person'));
ok(!!file, 'the migration is present');
const sql = file ? read(`supabase/migrations/${file}`) : '';

/** The body of one CREATE FUNCTION, so a rule is read where it is written. */
function body(name) {
  const at = sql.indexOf(`function ${name}(`);
  if (at < 0) return '';
  const start = sql.indexOf('$$', at);
  const end = sql.indexOf('$$;', start + 2);
  return start < 0 || end < 0 ? '' : sql.slice(start, end);
}

// ---------------------------------------------------------------------------
// 1. NEVER YOUR OWN CASE
// ---------------------------------------------------------------------------
{
  const handle = body('private.may_handle_report');
  ok(handle.length > 0, 'may_handle_report is defined');

  // The comparison itself, not the presence of a promising word. A check that
  // confirms a name exists somewhere is the mistake this repository has had to
  // correct more than once.
  ok(/if me\.id = r\.subject_id then return false; end if;/.test(handle),
     'the subject of a report can never handle it, whatever their rank');

  ok(/me\.role not in \('admin', 'executive'\)/.test(handle),
     'and only leadership can handle one at all');

  ok(/me\.church_id is distinct from r\.church_id/.test(handle),
     'and only within their own church');
}

// ---------------------------------------------------------------------------
// 2. A CASE ABOUT LEADERSHIP IS FOR EXECUTIVE DIRECTORS
// ---------------------------------------------------------------------------
//
// The owner's rule, one step earlier than the trial: "if a Director misbehave
// it will be put on trial with EDs and Head ED". discipline_check already
// refused to let a Director discipline a Director, so the trial half was right
// and the report half was not.
{
  const handle = body('private.may_handle_report');
  ok(/subject\.role in \('admin', 'executive'\) and me\.role <> 'executive'[\s\S]{0,60}return false/.test(handle),
     'a report about a Director or an Executive goes to Executive Directors only');
}

// ---------------------------------------------------------------------------
// 3. THE CONVERSATION IS BETWEEN EXACTLY TWO PEOPLE
// ---------------------------------------------------------------------------
{
  const inReport = body('private.in_report');
  ok(/auth\.uid\(\)\) in \(r\.reporter_id, r\.claimed_by\)/.test(inReport),
     'only the member who raised it and the one who picked it up are in it');

  // THE PREDICATE, NOT THE WHOLE HEADER. This pinned the policy text character
  // for character and then refused the very next commit, because naming the
  // role -- `for select TO AUTHENTICATED using (...)`, which makes the policy
  // STRICTER -- no longer matched. That is the third exact-expression pin in
  // this repository to block its own intention, and the first one I wrote
  // myself after correcting two others the same day. What matters is which
  // test guards the thread, so that is what is asserted; anything narrowing
  // the policy further is allowed through.
  const messagesPolicy =
    /create policy report_messages_read on public\.report_messages([\s\S]{0,120}?)using \(([^)]*\)?[^)]*)\)/.exec(sql);
  ok(!!messagesPolicy, 'the messages policy exists');
  ok(messagesPolicy ? /private\.in_report\(report_id\)/.test(messagesPolicy[2]) : false,
     'and the messages policy is that test, not a leadership test');
  ok(messagesPolicy ? !/may_handle_report/.test(messagesPolicy[2]) : false,
     'so leadership at large cannot read somebody else\'s conversation');

  const say = body('public.say_in_report');
  ok(/if not private\.in_report\(p_report\) then\s*\n\s*raise exception/.test(say),
     'speaking is refused to anybody else');
  ok(/if r\.claimed_by is null then\s*\n\s*raise exception/.test(say),
     'and nobody can speak into a case no one has picked up');

  const claim = body('public.claim_report');
  ok(/if r\.claimed_by is not null and r\.claimed_by <> me\.id then\s*\n\s*raise exception/.test(claim),
     'a case already picked up cannot be taken by a second person');
  ok(/if not private\.may_handle_report\(p_report\) then/.test(claim),
     'and picking up goes through the same test as reading');
}

// ---------------------------------------------------------------------------
// 4. THE MEMBER WHO RAISED IT CAN FOLLOW IT
// ---------------------------------------------------------------------------
//
// They could not, before: reports_read was leadership-only, so somebody filed a
// report into silence with no way to see that anybody had picked it up. That
// was survivable when a report was a one-way flag and is not, once the whole
// point is a conversation.
{
  ok(/reporter_id = \(select auth\.uid\(\)\)\s*\n\s*or private\.may_handle_report\(id\)/.test(sql),
     'the reporter can read their own report');
}

// ---------------------------------------------------------------------------
// 5. NOTHING IS EDITED OR DELETED, AND SUSPENSION DOES NOT SILENCE ANYBODY
// ---------------------------------------------------------------------------
{
  ok(!/create policy report_messages_(update|delete)/.test(sql),
     'a message in a safeguarding case cannot be edited or taken back');

  // The same rule the trial room already follows. Somebody suspended pending an
  // outcome keeps their side of it; taking away the answer is not a punishment,
  // it is a way to lose the truth.
  const say = body('public.say_in_report');
  ok(!/suspended_at/.test(say),
     'a suspended member can still answer, as in the trial room');
}

// ---------------------------------------------------------------------------
// 6. THE SCREEN DOES NOT INVENT ITS OWN RULE
// ---------------------------------------------------------------------------
{
  const ui = read('components/LiveAdminReports.tsx')
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

  ok(/r\.can_handle/.test(ui),
     'the screen offers Pick this up only where the database says it may');

  // It must not decide eligibility from a role string of its own. The database
  // knows about the subject and the church; a component reading `role` here
  // would be a second, weaker copy of rule 2.
  ok(!/role === 'admin'|role === 'executive'/.test(ui),
     'and it does not re-derive who may handle a report from a role name');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
