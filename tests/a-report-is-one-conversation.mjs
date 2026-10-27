// A report is one conversation, and nobody answers a report about themselves.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Asked for on 27 October 2026, when the court room closed:
// "Admins can see reports, see the problems and reports and be transparent to
// both Guide and Explorer users by chatting them as Admins." One shared
// conversation per report, and, asked when the person a report is about should
// join it: "Admin brings them in", after reading it.
//
// It replaces a-report-is-answered-by-one-person.mjs, whose two rules it keeps
// word for word because they did not change: nobody handles a report about
// themselves, and a report about a Director or an Executive Director is for
// Executive Directors. What changed is who is in the conversation, and three
// older gaps closed at the same time (evidence, and a report rewritten through
// the data API).
//
// IT READS SQL; IT DOES NOT RUN IT. supabase/tests/a-report-is-one-conversation.sql
// runs the same rules as invented people in a database built from nothing, and
// scripts/fresh-install.sh runs that on every push. This file keeps the rules
// where they are written from drifting while nobody is looking, and checks the
// one thing the database cannot: what the screens promise.
//
//   node tests/a-report-is-one-conversation.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripSql, stripTs } from './_strip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const dir = 'supabase/migrations';
const files = fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.sql'))
  .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
const migrations = files.map((f) => ({ f, sql: stripSql(read(`${dir}/${f}`)) }));

const SHARED = '20261027130000_a_report_is_one_conversation.sql';
const shared = migrations.find((m) => m.f === SHARED)?.sql ?? '';
ok(shared.length > 0, 'the migration that makes a report one conversation is present');

/** The body of the LAST definition of a function, where the rule now lives. */
function latest(name) {
  for (let i = migrations.length - 1; i >= 0; i--) {
    const { sql } = migrations[i];
    const at = sql.search(new RegExp(`function ${name.replace('.', '\\.')}\\(`));
    if (at < 0) continue;
    // Whatever quotes the body: $$ or a tagged $function$.
    const tag = /\bas\s+(\$[a-z_]*\$)/i.exec(sql.slice(at));
    if (!tag) continue;
    const start = at + tag.index + tag[0].length;
    const end = sql.indexOf(tag[1], start);
    if (end >= 0) return sql.slice(start, end);
  }
  return '';
}

// ---------------------------------------------------------------------------
// 1. NEVER YOUR OWN CASE, AND LEADERSHIP'S CASES ARE FOR EXECUTIVE DIRECTORS
// ---------------------------------------------------------------------------
{
  const handle = latest('private.may_handle_report');
  ok(handle.length > 0, 'may_handle_report is defined');
  ok(/if me\.id = r\.subject_id then return false; end if;/.test(handle),
     'the subject of a report can never handle it, whatever their rank');
  ok(/me\.role not in \('admin', 'executive'\)/.test(handle),
     'only leadership handles one at all');
  ok(/me\.church_id is distinct from r\.church_id/.test(handle),
     'and only within their own church');
  ok(/subject[^\n]*\bin \('admin', 'executive'\) and me\.role <> 'executive'[\s\S]{0,60}return false/.test(handle),
     'a report about a Director or an Executive goes to Executive Directors only');
}

// ---------------------------------------------------------------------------
// 2. WHO IS IN THE CONVERSATION
// ---------------------------------------------------------------------------
{
  const inReport = latest('private.in_report');
  ok(/\(select auth\.uid\(\)\) = r\.reporter_id/.test(inReport),
     'the person who raised it is in it');
  ok(/\(select auth\.uid\(\)\) = r\.subject_id and r\.subject_joined_at is not null/.test(inReport),
     'the person it is about only once they have been brought in');
  ok(/private\.may_handle_report\(r\.id\)/.test(inReport),
     'and every Admin who may handle it reads it, which is the transparency asked for');

  const all = migrations.map((m) => m.sql).join('\n');
  const policy = /create policy report_messages_read on public\.report_messages[\s\S]{0,120}?using \(([^;]*)\);/.exec(all);
  ok(policy ? /private\.in_report\(report_id\)/.test(policy[1]) : false,
     'the messages policy, which the live socket follows, is that same test');
}

// ---------------------------------------------------------------------------
// 3. WHO WRITES, AND WHO BRINGS SOMEBODY IN
// ---------------------------------------------------------------------------
{
  const say = latest('public.say_in_report');
  ok(/me\.id = r\.reporter_id\s*or \(me\.id = r\.subject_id and r\.subject_joined_at is not null\)\s*or me\.id = r\.claimed_by/.test(say),
     'the writers are the one who raised it, the one brought in, and the Director holding it');
  ok(/if r\.claimed_by is null then\s*\n\s*raise exception/.test(say),
     'nobody writes into a report nobody has picked up');
  ok(!/suspended_at/.test(say),
     'and suspension does not silence anybody already in it');

  const bring = latest('public.bring_subject_into_report');
  ok(bring.length > 0, 'bringing somebody in is a function of its own');
  ok(/r\.claimed_by is distinct from me\.id or not private\.may_handle_report\(p_report\)/.test(bring),
     'only the Director holding it, and only while they still may handle it');
  ok(/if not r\.subject_may_join then\s*\n\s*raise exception/.test(bring),
     'never for a report filed under the old promise');
  ok(/if r\.subject_joined_at is not null then\s*\n\s*raise exception/.test(bring),
     'and once');
  const told = [...bring.matchAll(/values \(([^;]*?)\);/g)].map((m) => m[1]).join('\n');
  ok(/r\.subject_id/.test(told) && /r\.reporter_id/.test(told) && !/name/.test(told),
     'both sides are told, and the message names nobody, since it can show on a lock screen');

  const claim = latest('public.claim_report');
  ok(/if r\.claimed_by is not null and r\.claimed_by <> me\.id then\s*\n\s*raise exception/.test(claim),
     'a report already picked up cannot be taken by a second Director');
  ok(!/privately/.test(claim), 'and nobody is promised a private conversation any more');
}

// ---------------------------------------------------------------------------
// 4. A PROMISE MADE IS KEPT
// ---------------------------------------------------------------------------
//
// Every report filed before 20261027130000 was filed under "they are not told".
// The column is added false, so those rows say false, and only then does the
// default turn true for reports filed under the new form.
{
  const add = shared.indexOf('add column if not exists subject_may_join boolean not null default false');
  const flip = shared.indexOf('alter column subject_may_join set default true');
  ok(add >= 0 && flip > add, 'existing reports stay closed to the person they are about; new ones may open');
  ok(/check \(subject_joined_at is null or subject_may_join\)/.test(shared),
     'and no row can say it was opened when it may not be');
}

// ---------------------------------------------------------------------------
// 5. EVIDENCE FOLLOWS THE REPORT, AND A REPORT IS NOT REWRITTEN
// ---------------------------------------------------------------------------
{
  ok(/create policy report_files_read on public\.report_files\s*for select to authenticated using \(\s*private\.may_handle_report\(report_id\)\s*and /.test(shared),
     'an evidence row opens to whoever may handle its report, not every leader');
  ok(/create policy report_evidence_read on storage\.objects[\s\S]{0,200}private\.may_read_report_file\(name\)/.test(shared)
     && /private\.may_handle_report\(f\.report_id\)/.test(latest('private.may_read_report_file')),
     'and so does the stored file');
  ok(/drop policy if exists reports_decide on public\.reports;/.test(shared)
     && /revoke insert, update, delete on public\.reports from authenticated;/.test(shared),
     'nobody signed in writes to the reports table directly; every change is a checked function');
  const later = migrations.filter((m) => m.f > SHARED).map((m) => m.sql).join('\n');
  ok(!/create policy reports_decide/.test(later) && !/grant[^;]*\b(update|insert|delete)\b[^;]*on public\.reports\b/i.test(later),
     'and nothing since opens it again');
  ok(!/create policy report_messages_(update|delete)/.test(migrations.map((m) => m.sql).join('\n')),
     'a message in a report cannot be edited or taken back');
}

// ---------------------------------------------------------------------------
// 6. WHAT THE SCREENS SAY
// ---------------------------------------------------------------------------
{
  const ui = stripTs(read('components/LiveAdminReports.tsx'));
  ok(/r\.can_handle/.test(ui), 'the list offers Pick this up only where the database says it may');
  ok(!/role === 'admin'|role === 'executive'/.test(ui),
     'and does not work out who may handle a report from a role name of its own');
  ok(/live\.bringSubjectIntoReport\(r\.id\)/.test(ui) && /data-bring-in-ask/.test(ui)
     && /will be able to read this report and everything already said/.test(ui),
     'bringing somebody in says exactly what it does before it does it');
  ok(/In this conversation: \{whoIsIn\(report\)\}/.test(ui),
     'and every conversation says who is in it');

  // The form is where the promise is made, so it has to be the new one.
  const dialog = stripTs(read('components/ReportDialog.tsx'));
  ok(!/nothing they could notice/.test(dialog) && !/and will not be/.test(dialog),
     'the report form no longer promises the person will never be told');
  ok(/bring them into the conversation/.test(dialog) && /you will be told/.test(dialog),
     'it says a Director may bring them in, and that the person reporting is told if so');

  // AND NOTHING ELSE STILL MAKES THE OLD PROMISE. The Directors' banner said
  // "has not been told and will not be" after the rule changed, and only a
  // screenshot caught it. Every screen that talks about who is told is read.
  const promises = ['components/LiveSafeguarding.tsx', 'components/LiveMyData.tsx', 'app/admin/page.tsx',
    'app/policy/page.tsx', 'app/privacy/page.tsx', 'lib/faq.ts', 'lib/live/my-data.ts']
    .filter((f) => /never told|told, and will not be|not been told\s+and will not be|is never told|nothing they could notice\. You do not/.test(stripTs(read(f))));
  ok(promises.length === 0, `no screen still promises the person reported is never told (${promises.join(', ') || 'none'})`);
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
