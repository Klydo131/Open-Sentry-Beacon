// Leave to answer keeps its word, and the record outlives the account.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 20 October 2026: a suspended member may be called to the court
// room when a Director or an Executive Director allows it, with a temporary
// lift of their account for that alone; a deleted person is recorded as
// deleted, and only the court room's and Admin Reports' records remain of
// them; the system's own rules made to hold everywhere.
//
// TWO HALVES, as for the court room itself.
//   * The rules are proven as invented people, from nothing, on the Supabase
//     image and on plain Postgres, by supabase/tests/leave-to-answer-holds.sql
//     (scripts/fresh-install.sh, in CI); and through real PostgREST by
//     selfhost/server/test/the-edition-holds.mjs. This file checks both are
//     wired in, and that the newest definition of each rule still says what
//     was proven, so a later migration cannot quietly undo it.
//   * The screens: the page a suspended member lands on asks nothing the
//     database will refuse it, and the sign-in path takes them there.
//
//   node tests/leave-to-answer-keeps-its-word.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const code = (p) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const sqlCode = (text) => text.replace(/--[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const MIGRATION = 'supabase/migrations/20261020180000_leave_to_answer_and_a_record_that_outlives_the_account.sql';
const migDir = 'supabase/migrations';
const migrations = fs.readdirSync(path.join(root, migDir)).filter((f) => f.endsWith('.sql')).sort();

/** The newest definition of a function across every migration, comments removed. */
function latest(name) {
  for (const file of [...migrations].reverse()) {
    const sql = sqlCode(read(`${migDir}/${file}`));
    const at = sql.indexOf(`create or replace function ${name}(`);
    if (at < 0) continue;
    const opening = /\bas\s+(\$[a-z_]*\$)/g;
    opening.lastIndex = at;
    const hit = opening.exec(sql);
    if (!hit) return { file, body: '' };
    const start = hit.index + hit[0].length;
    return { file, body: sql.slice(start, sql.indexOf(`${hit[1]};`, start)) };
  }
  return { file: '', body: '' };
}

/** The newest `create policy <name> on <table>` across every migration. */
function latestPolicy(name, table) {
  const re = new RegExp(`create policy ${name} on ${table}[\\s\\S]*?;`, 'g');
  for (const file of [...migrations].reverse()) {
    const hits = sqlCode(read(`${migDir}/${file}`)).match(re);
    if (hits) return hits.at(-1);
  }
  return '';
}

/** The newest foreign key of that name, as its `on delete` reads. */
function latestForeignKey(constraint) {
  const re = new RegExp(`add constraint ${constraint}\\s+foreign key[^;]*?on delete (set null|cascade|restrict|no action)`, 'g');
  for (const file of [...migrations].reverse()) {
    const hits = [...sqlCode(read(`${migDir}/${file}`)).matchAll(re)];
    if (hits.length) return hits.at(-1)[1];
  }
  return '';
}

// ---------------------------------------------------------------------------
// 1. THE PROOFS ARE WIRED IN
// ---------------------------------------------------------------------------
{
  ok(exists(MIGRATION), 'the migration is present');
  const install = read('scripts/fresh-install.sh');
  ok(/-f "\$here\/supabase\/tests\/leave-to-answer-holds\.sql"/.test(install),
    'a fresh install runs the leave-to-answer proof, on the Supabase image and on plain Postgres');
  const proof = read('supabase/tests/leave-to-answer-holds.sql');
  ok(/if total < 70 then raise exception/.test(proof) && /\nrollback;\s*$/.test(proof),
    'the proof needs at least 70 checks and changes nothing it leaves behind');
  const edition = read('selfhost/server/test/the-edition-holds.mjs');
  ok(/rpc\('court_grant_leave'/.test(edition) && /profileShut\?\.code === '42501'/.test(edition),
    'and the Postgres edition proves it through PostgREST itself, where the address it checks is set');
  ok(/court-leave-runs-out/.test(read('supabase/tests/fresh-install-holds.sql'))
    && /court-leave-runs-out/.test(read('supabase/tests/ready-for-real-members.sql')),
    'a fresh install, and the go-live check, both ask that leave is ended on time');
}

// ---------------------------------------------------------------------------
// 2. WHAT LEAVE OPENS, AND ONLY THAT
// ---------------------------------------------------------------------------
{
  const pre = latest('public.refuse_suspended_requests');
  const allowed = /'\^\/rpc\/\(([a-z_|]+)\)\/\?\$'/.exec(pre.body)?.[1]?.split('|') ?? [];
  ok(allowed.length > 0 && allowed.every((n) => n.startsWith('court_')),
    `before every request, a suspended account is let through only to court room calls (${pre.file || 'not found'})`);
  for (const never of ['court_summon', 'court_record_for', 'court_gallery', 'court_grant_leave', 'court_end_leave', 'open_trial', 'close_trial', 'join_trial']) {
    ok(!allowed.includes(never), `and never to ${never}`);
  }
  ok(/current_setting\('request\.path', true\)/.test(pre.body) && /private\.court_leave_case\(\) is not null/.test(pre.body),
    'which call it is comes from the address the data API set, and only while leave lasts');
  ok(/my_session_is_live\(\)/.test(pre.body) && /my_second_step_is_done\(\)/.test(pre.body),
    'an ended session and an owed second step are still refused, leave or not');

  const place = latest('private.court_place');
  ok(/when me\.suspended_at is not null then\s+case when private\.court_leave_case\(\) = t\.id\s+and tp\.part in \('accused', 'reporter', 'witness'\)/.test(place.body),
    'a suspended account\'s place is its part in the one case it has leave to answer, and nothing else');
  const pass = latest('private.court_pass_until');
  ok(/least\(pass_end, leave_end\)/.test(pass.body), 'and its pass to the door never lasts past the leave');
  ok(/me\.suspended_at is not null then return false/.test(latest('private.may_sit_on_trial').body)
    && /me\.suspended_at is not null then return false/.test(latest('private.may_handle_report').body),
    'a suspended leader neither watches a hearing nor handles a report');

  const store = latestPolicy('a_suspended_account_sees_nothing', 'storage\\.objects');
  ok(/as restrictive for all/.test(store) && /bucket_id = 'court-exhibits' and \(select private\.court_answering\(\)\)/.test(store)
    && (store.match(/court_answering/g) ?? []).length === 2,
    'the file store opens to leave for court exhibits only, reading and writing');
  ok(/my_session_is_live\(\)/.test(latest('private.court_answering').body), 'and only on a live session');

  const grant = latest('public.court_grant_leave');
  ok(/court_place\(p_trial\), ''\) <> 'judge'/.test(grant.body), 'only the judge gives leave');
  ok(/not in \(1, 24, 72, 168\)/.test(grant.body), 'for an hour, a day, three days or a week');
  ok(/person\.suspended_at is null then/.test(grant.body) && /tp\.part in \('accused', 'reporter', 'witness'\)/.test(grant.body),
    'to somebody called to the case whose account is suspended');
  ok(/'leave_granted'/.test(grant.body) && /'A suspended member may answer a case'/.test(grant.body),
    'on the record, and the church\'s leaders are told');
  const close = latest('private.court_close_leave');
  ok(/banned_until = now\(\) \+ interval '100 years'/.test(close.body)
    && /delete from auth\.sessions\s+where user_id = l\.person_id/.test(close.body)
    && /delete from auth\.refresh_tokens where user_id = l\.person_id::text/.test(close.body),
    'ending leave switches the account off again and ends every session it holds');
  ok(/'ran_out'/.test(latest('private.court_leave_sweep').body)
    && /cron\.schedule\('court-leave-runs-out', '\* \* \* \* \*', 'select private\.court_leave_sweep\(\)'\)/.test(sqlCode(read(MIGRATION))),
    'and leave whose time has run out is ended within the minute');
  ok(/court_close_leave\(l\.id, 'case_closed'\)/.test(latest('public.court_close_hearing').body),
    'and when the hearing ends (20261020200000: a hearing ends, the Church Board rules)');
}

// ---------------------------------------------------------------------------
// 3. THE RECORD OUTLIVES THE ACCOUNT
// ---------------------------------------------------------------------------
{
  for (const fk of ['reports_reporter_id_fkey', 'reports_subject_id_fkey', 'report_messages_author_id_fkey', 'report_files_added_by_fkey']) {
    ok(latestForeignKey(fk) === 'set null', `a deleted account no longer takes ${fk.replace(/_fkey$/, '')} with it`);
  }
  const mig = sqlCode(read(MIGRATION));
  ok(/create trigger court_remembers_the_departed\s+before delete on public\.profiles/.test(mig)
    && /'account_deleted'/.test(latest('private.court_remembers_the_departed').body),
    'a deletion is written on every case the person was in');
  ok(/exception when others then\s+null;/.test(latest('private.court_remembers_the_departed').body),
    'and never stands in the way of the deletion itself');
  ok(/' \(account deleted\)'/.test(latest('private.name_kept').body), 'a deleted account is shown as deleted, by name');
  ok(/private\.name_kept\(m\.author_id, m\.author_name\)/.test(latest('public.report_thread').body)
    && !/\bjoin public\.profiles\b/.test(latest('public.report_thread').body),
    'a report\'s conversation keeps what a deleted account wrote');
}

// ---------------------------------------------------------------------------
// 4. THE SAME RULES EVERYWHERE
// ---------------------------------------------------------------------------
{
  ok(/private\.may_handle_report\(p_id\)/.test(latest('public.resolve_report').body),
    'deciding a report asks the same two rules as handling one');
  for (const filer of ['public.report_person', 'private.report_guild_post', 'private.report_prayer_request']) {
    const body = latest(filer).body;
    ok(/private\.tell_report_handlers\(v_id/.test(body) && !/insert into public\.notifications/.test(body),
      `${filer} tells only those who may handle it`);
  }
  ok(/p\.id is distinct from r\.subject_id/.test(latest('private.tell_report_handlers').body),
    'never the person it is about');
  ok(/>= 30 then/.test(latest('private.court_statement_stamp').body), 'one person cannot flood a case with statements');
  ok(/court_exhibit_room\(p_trial\)/.test(latest('public.court_exhibit_write').body)
    && /court_exhibit_room\(p_trial\)/.test(latest('public.court_exhibit_begin').body),
    'nor with exhibits');
}

// ---------------------------------------------------------------------------
// 5. THE SCREENS
// ---------------------------------------------------------------------------
{
  const route = code('app/api/auth/sign-in/route.ts');
  const leaveAt = route.indexOf("rpc('court_door')");
  ok(leaveAt > route.indexOf(".from('profiles')") && /profileError\?\.code === '42501'/.test(route)
    && /formRedirect\(request, '\/answer'/.test(route),
    'sign-in asks the court room\'s door only when the profile is refused, and sends leave to /answer');
  const data = code('lib/live/data.ts');
  const door = code('components/live/DoorPages.tsx');
  ok(/payload\?\.court_leave === true/.test(data)
    && /if \(await courtLeaveHeld\(\)\) \{\s*window\.location\.replace\('\/answer'\)/.test(door),
    'the app follows it, after a password and after a code');
  ok(/'court_leave' in mine\) \{\s*window\.location\.replace\('\/answer'\)/.test(door),
    'and the sign-in page goes there');
  ok(!/rpc\('court_door'\)/.test(data), 'the door is never asked through the reads kept for no signal');

  const room = code('components/court/AnswerRoom.tsx');
  ok(!/getMyProfile|useLiveSession|useKeepUp|LiveAppShell|AppShell/.test(room),
    'the leave page asks nothing the database refuses a suspended account: no profile, no shell, no live connection');
  ok(/<Hearing[\s\S]*?\bpoll\b/.test(room) && /setInterval\(\(\) => \{ void look\(\); \}, 60_000\)/.test(room),
    'it reads the case on a timer, and notices when the leave has ended');
  ok(/'\/answer'/.test(read('app/sw.js/route.ts')), 'and it opens with no signal, like every screen');

  const hearing = code('components/court/Hearing.tsx');
  ok(/\{c\.may_decide && \(\s*<LeaveToAnswer/.test(hearing), 'only the judge is offered leave to give');
  ok(/if \(!poll && !inSession\) return;\s*const timer = window\.setInterval\(\(\) => \{ void load\(\); \}, 20_000\)/.test(hearing),
    'a hearing on leave reads itself again on a timer, since the live connection tells it nothing');
}

// ---------------------------------------------------------------------------
// 6. WHAT PEOPLE ARE TOLD
// ---------------------------------------------------------------------------
{
  const justice = read('docs/JUSTICE.md');
  ok(/leave to answer/i.test(justice), 'the members\' guide explains leave to answer');
  ok(/account deleted/i.test(justice), 'and that a deleted account stays on the record, marked deleted');
  const faqLeave = read('lib/faq.ts').match(/id: 'leave-to-answer'[\s\S]*?\n {8}\},/)?.[0] ?? '';
  ok(/leave to answer/i.test(faqLeave) && !/Executive/.test(faqLeave),
    'the FAQ explains it, without naming an Executive Director');
  const privacy = read('app/privacy/page.tsx');
  ok(/court room/i.test(privacy) && /account deleted/i.test(privacy), 'the privacy notice says what stays after a deletion, and how it is shown');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
