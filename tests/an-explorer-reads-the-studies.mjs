// An Explorer reads the studies. Guides, Directors and Executive Directors write them.
//
// THE RULE: Explorers cannot edit the sample Lesson studies; only EDs,
// Directors and Guides can. Explorers can read every Lesson study, from the
// samples and from their Guide.
//
// THIS NARROWS AN EARLIER INSTRUCTION, DELIBERATELY. `a_study_is_yours_to_change`
// opened writing to everybody, because the ask at the time was that everybody
// should keep their own edited copy. The owner has since narrowed it, which is
// theirs to decide and is the better shape: a study is teaching material, and
// the people who teach are Guides, Directors and Executive Directors. Somebody
// being walked with is not preparing the walk.
//
// TWO COPIES OF ONE RULE, WHICH IS THE RISK THIS FILE EXISTS FOR. The database
// refuses, and the screen declines to offer a button that would be refused.
// Those are two statements of the same sentence in two languages, and two
// things to change is one thing to forget. So this checks BOTH and checks they
// agree.
//
//   node tests/an-explorer-reads-the-studies.mjs
//
// Reads the migration and the screen. Needs no database.
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

const stripSql = (s) => s.replace(/--[^\n]*/g, ' ');
const stripTs = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const dir = 'supabase/migrations';
const file = fs.readdirSync(path.join(root, dir))
  .filter((f) => f.includes('an_explorer_reads_the_studies')).sort().pop();
ok(!!file, `the migration is present (${file ?? 'MISSING'})`);
const sql = file ? stripSql(read(`${dir}/${file}`)) : '';
const ui = stripTs(read('components/LiveStudies.tsx'));

// ---------------------------------------------------------------------------
// 1. ONE SENTENCE IN THE DATABASE
// ---------------------------------------------------------------------------
//
// Six policies have to agree about who may write. Six copies of a role list is
// five chances to miss one, so they all call one function.
{
  ok(/create or replace function public\.may_write_studies/.test(sql),
     'one function answers "may this person write studies?"');
  ok(/auth_role\(\) in \('dm', 'admin', 'executive'\)/.test(sql),
     'and it names Guides, Directors and Executive Directors');
  ok(!/'ds'/.test(sql.slice(sql.indexOf('may_write_studies'), sql.indexOf('comment on function'))),
     'and does not name Explorers');

  // SECURITY DEFINER with a pinned search_path, like every other one here.
  ok(/security definer/.test(sql), 'it runs with the privileges it needs');
  ok(/set search_path to 'public'/.test(sql), 'with a pinned search_path');
  ok(/revoke all on function public\.may_write_studies/.test(sql),
     'and is not left callable by anonymous visitors');

  // EVERY WRITING VERB, ON BOTH TABLES. Missing one leaves a door open, and
  // the door nobody checks is the one that stays open.
  for (const policy of ['ls_write', 'ls_edit', 'ls_drop',
                        'lessons_write', 'lessons_edit', 'lessons_drop']) {
    const at = sql.indexOf(`create policy ${policy}`);
    ok(at !== -1, `${policy} is rewritten`);
    const body = sql.slice(at, sql.indexOf(';', at));
    ok(/may_write_studies\(\)/.test(body), `and ${policy} asks the one function`);
  }
}

// ---------------------------------------------------------------------------
// 2. READING IS UNTOUCHED
// ---------------------------------------------------------------------------
//
// Explorers still read every Lesson study. The narrowing is on the
// three writing verbs; taking reading away as well would leave an Explorer
// with an empty shelf, which is the opposite of what was asked for.
ok(!/create policy ls_read/.test(sql), 'the series read policy is left alone');
ok(!/create policy lessons_read/.test(sql), 'and so is the study read policy');
ok(!/drop policy if exists ls_read/.test(sql), 'and neither is dropped');
ok(!/drop policy if exists lessons_read/.test(sql), 'by this migration');

// ---------------------------------------------------------------------------
// 3. THE SAME SENTENCE ON THE SCREEN
// ---------------------------------------------------------------------------
{
  ok(/export function canWriteStudies/.test(ui), 'the screen has one predicate too');
  const fn = ui.slice(ui.indexOf('export function canWriteStudies'));
  const body = fn.slice(0, fn.indexOf('}') + 1);
  ok(/'dm'/.test(body) && /'admin'/.test(body) && /'executive'/.test(body),
     'naming the same three roles');
  ok(!/'ds'/.test(body), 'and not Explorers');

  // THE ROLE DECIDES, NOT THE CALLER. `canWrite` used to be a prop each screen
  // passed by hand, and the call sites had already drifted: the Guide's own
  // studies tab passed nothing, so a Guide could not start a series at all.
  ok(/const canWrite = canWriteStudies\(profile\?\.role\)/.test(ui),
     'and the screen reads it from the profile');
  ok(!/canWrite\?: boolean/.test(ui), 'rather than taking it as a prop a caller can get wrong');
  ok(/const mine = canWriteStudies\(profile\?\.role\)/.test(ui),
     'and the per-series controls ask the same question');
  ok(!/const mine = true/.test(ui), 'not the everybody-can-edit shortcut it briefly was');
}

// No call site may hand the permission in any more.
for (const f of ['components/live/AdminPage.tsx', 'app/office/page.tsx',
                 'components/live/GuidePages.tsx', 'components/live/ExplorerPage.tsx']) {
  ok(!/<LiveStudies canWrite/.test(read(f)), `${f} does not pass the permission in`);
}

// ---------------------------------------------------------------------------
// 4. THE SCREEN IS NOT THE BOUNDARY, AND SAYS SO
// ---------------------------------------------------------------------------
//
// A hidden button is a courtesy. Anybody can send a request without using the
// screen at all, and the policy is what meets that request. Saying so in the
// source is what stops the next person treating the gate as the lock.
{
  const raw = read('components/LiveStudies.tsx');
  ok(/NOT THE BOUNDARY/.test(raw) || /actually refuses/.test(raw),
     'the source says the database is what actually refuses');
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
