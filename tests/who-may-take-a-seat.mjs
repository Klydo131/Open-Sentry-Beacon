// Nobody hears their own case, and no Director hears a Director's.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. "Any Director, ED, and Head can join the trial room" -- and
// then, asked back and answered in the owner's own words: "yes do that, except
// trials about themselves or fellow Directors".
//
// HALF OF IT WAS ALREADY TRUE, WHICH IS WHY IT NEEDED A CHECK RATHER THAN A
// FEATURE. `in_trial` has always had a branch admitting any approved Director
// or Executive of the church, so leadership could already read every trial.
// What it never had was either exclusion:
//
//   * A Director could sit on the case about THEMSELVES. They are also the
//     accused, and that access is right and must stay -- somebody has to be
//     able to answer what is said about them. Holding both chairs is the fault.
//
//   * A Director could sit on a case about a FELLOW Director, while
//     `discipline_check` already refused to let them suspend or remove one. The
//     power was withheld and the seat was not, so a Director could hear the
//     case and only the verdict was out of reach.
//
// A rule that lives only in a screen is a rule until somebody writes a second
// screen. This asserts the database.
//
//   node tests/who-may-take-a-seat.mjs
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
const file = fs.readdirSync(dir).find((f) => f.includes('who_may_take_a_seat'));
ok(!!file, 'the migration is present');
const sql = file ? read(`supabase/migrations/${file}`) : '';

/**
 * One function's body, with SQL comments removed.
 *
 * The comments go because an assertion that requires two statements to be
 * adjacent breaks the moment somebody explains the first one -- which is
 * exactly what happened to the join_trial check here, on a guard that was
 * present and correct with a three-line note above the raise. Matching code
 * against prose is the mistake this repository keeps making in both
 * directions.
 */
function body(name) {
  const at = sql.indexOf(`function ${name}(`);
  if (at < 0) return '';
  const start = sql.indexOf('$$', at);
  if (start < 0) return '';
  return sql.slice(start, sql.indexOf('$$;', start + 2))
    .replace(/--[^\n]*/g, '');
}

// ---------------------------------------------------------------------------
// 1. THE TWO EXCLUSIONS
// ---------------------------------------------------------------------------
{
  const sit = body('private.may_sit_on_trial');
  ok(sit.length > 0, 'may_sit_on_trial is defined');

  ok(/if me\.id = t\.subject_id then return false; end if;/.test(sit),
     'nobody sits on the bench for a case about themselves');

  ok(/accused\.role in \('admin', 'executive'\) and me\.role <> 'executive'[\s\S]{0,60}return false/.test(sit),
     'and no Director hears a case about a Director or an Executive');

  ok(/me\.role not in \('admin', 'executive'\)/.test(sit),
     'a seat is leadership-only to begin with');
}

// ---------------------------------------------------------------------------
// 2. THE ACCUSED KEEPS THEIR OWN CASE
// ---------------------------------------------------------------------------
//
// THE ONE THIS IS MOST LIKELY TO BREAK BY ACCIDENT. Excluding the subject from
// the bench must not exclude them from the room: `in_trial` is what the read
// and speak policies use, and if the parties branch were ever folded into the
// seat rule, a suspended member would lose the ability to answer what is said
// about them. That is the thing this whole area exists to prevent.
{
  const inTrial = body('public.in_trial');
  ok(/from public\.trial_parties tp[\s\S]{0,140}tp\.person_id = \(select auth\.uid\(\)\)/.test(inTrial),
     'being a party to a case still admits you to it');
  ok(/or private\.may_sit_on_trial\(p_trial\)/.test(inTrial),
     'and the bench is a separate test joined to it, not a replacement for it');
}

// ---------------------------------------------------------------------------
// 3. SITTING DOWN IS ON THE RECORD
// ---------------------------------------------------------------------------
//
// Who was in the room when a member was judged is exactly what a church needs
// to answer afterwards, and a policy leaves no trace of it.
{
  const join = body('public.join_trial');
  ok(/if not private\.may_sit_on_trial\(p_trial\) then\s*\n\s*raise exception/.test(join),
     'taking a seat goes through the same test as seeing the case');
  ok(/insert into public\.trial_parties[\s\S]{0,120}'bench'/.test(join),
     'and writes a row, so the case says who heard it');
  ok(/check \(part in \('accused', 'reporter', 'witness', 'bench'\)\)/.test(sql),
     'the bench is a recognised part, kept like any other');
}

// ---------------------------------------------------------------------------
// 4. THE SCREEN DOES NOT RE-DERIVE ANY OF IT
// ---------------------------------------------------------------------------
{
  const ui = read('components/LiveHallOfJustice.tsx')
    .replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

  ok(/trialsIMaySitOn/.test(ui),
     'the hall lists only what the database says may be heard');

  // It may check its own role to decide whether to render at all. What it must
  // not do is work out WHICH cases from a role name, because the rule depends
  // on the accused and the church as well.
  ok(!/accused_role\s*===|t\.accused_role\s*===/.test(ui),
     'and never decides which cases from the accused\'s role itself');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
