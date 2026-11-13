// A safeguarding report can carry the thing being reported.
//
// WHAT WAS MISSING. A report held a reason and a paragraph of text. The thing
// being reported is very often a picture, a screenshot of a conversation, a
// voice note or a document — and the person holding it on their phone was asked
// to describe it in words, and a Director then decided on that description
// alone.
//
// THE AUTHORISATION IS THE POINT, and it is narrower than anything else in this
// bucket. Lesson handouts and avatars are readable across a church because they
// are meant to be; evidence is not. It matches `reports_read` exactly — the
// Directors and Executive Directors of that church — which means, deliberately,
// that it is kept from the person who raised the report too. There is no (a bug report) view anywhere in this app; attaching must not create one.
//
// AND THERE IS NO DELETE, for the row or the object. `reports` has no delete
// policy on purpose: a record somebody can remove is not a record.
//
//   node tests/a-report-can-carry-evidence.mjs
//
// Reads the source and the migration; needs no database and no network.
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

const dir = 'supabase/migrations';
const file = fs.readdirSync(path.join(root, dir))
  .filter((f) => f.includes('report_can_carry_evidence')).sort().pop();
ok(!!file, `the migration is present (${file ?? 'MISSING'})`);
const sql = file ? read(`${dir}/${file}`) : '';

// ---- The table, and who may read it ----
ok(/create table if not exists public\.report_files/.test(sql), 'report_files exists');
ok(/alter table public\.report_files enable row level security/.test(sql), 'with RLS on');
ok(/create policy report_files_read/.test(sql), 'and a read policy');
// The same rule as reports_read: leadership of that church, and nobody else.
ok(/report_files_read[\s\S]{0,600}role in \('admin', 'executive'\)/.test(sql),
   'readable only by a Director or Executive Director');
ok(/report_files_read[\s\S]{0,600}me\.church_id = report_files\.church_id/.test(sql),
   'and only in their own church');

// NOT the reporter. This is the check that would quietly rot into a
// "my reports" view if somebody added a convenience later.
ok(!/report_files_read[\s\S]{0,600}added_by = \(select auth\.uid\(\)\)/.test(sql),
   'and NOT by the person who raised it, matching reports_read');

// ---- Evidence is never deletable ----
ok(!/on public\.report_files[\s\S]{0,200}for delete/i.test(sql),
   'nothing grants DELETE on the evidence rows');
ok(!/create policy report_evidence_drop/.test(sql),
   'and nothing grants DELETE on the stored objects');

// ---- Attaching goes through a checked function, not a policy ----
ok(/function private\.attach_report_evidence/.test(sql), 'attaching is a definer function');
ok(/reporter_id is distinct from v_me[\s\S]{0,600}42501/.test(sql),
   'which refuses a report that is not yours');
ok(/status is distinct from 'open'/.test(sql),
   'and refuses one that has already been decided');
// Without this a reporter could attach a row pointing at somebody else's
// object and read it back through a Director's screen.
ok(/p_path not like 'reports\/' \|\| v_me::text/.test(sql),
   'and refuses a path outside the caller’s own folder');
ok(/revoke all on function public\.attach_report_evidence[\s\S]{0,120}from public, anon/.test(sql),
   'and is not reachable by a signed-out visitor');

// ---- Storage ----
ok(/create policy report_evidence_write[\s\S]{0,400}foldername\(name\)\)\[2\] = \(select auth\.uid\(\)\)::text/.test(sql),
   'somebody can only upload into their own folder');
ok(/create policy report_evidence_read[\s\S]{0,400}manages_church/.test(sql),
   'and only leadership can read the objects back');

// ---- The app ----
const data = read('lib/live/data.ts');
const dialog = read('components/ReportDialog.tsx');
const board = read('components/LiveSafeguarding.tsx');

ok(/export async function attachReportEvidence/.test(data), 'the app can attach evidence');
ok(/reports\/\$\{me_id\}\//.test(data), 'and uploads into the caller’s own folder');
ok(/export async function listReportFiles/.test(data), 'and a Director can list it');
ok(/createSignedUrl/.test(data), 'opened through a signed link rather than a stored address');

ok(/Attach anything that shows what happened/.test(dialog), 'the report form offers it');
ok(/\(optional\)/.test(dialog), 'and says it is optional');
ok(/evidence\)/.test(dialog), 'and hands the files to the caller');

ok(/live\.listReportFiles\(/.test(board), 'the Directors’ queue loads the evidence');
ok(/live\.reportFileUrl\(/.test(board), 'and opens each piece through a signed link');
ok(/Evidence attached/.test(board), 'and says how much there is');

// THE REPORT MUST SURVIVE A FAILED UPLOAD. A safeguarding report lost because a
// photo did not upload is the worst trade in this whole feature.
ok(/catch \{ \/\* the report stands \*\/ \}/.test(data),
   'a file that fails to upload does not take the report with it');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
