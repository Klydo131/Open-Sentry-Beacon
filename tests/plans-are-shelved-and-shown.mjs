// Plans on a shelf, shown to the right people.
//
// Asked for on 13 November 2026.
//
// components/PlanShelf.tsx, the audience picker in components/SabbathProgram.tsx
// and migration 20261113120000. The database half is the one that matters: a
// 'guides' post must never reach an Explorer, whatever the app shows.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); if (!c) bad++; };
const strip = (s) => s.replace(/--[^\n]*/g, '');

// ---- the database --------------------------------------------------------
const sql = strip(read('supabase/migrations/20261113120000_a_leader_can_show_a_plan_to_the_guides.sql'));
ok(/add value if not exists 'guides';\s*commit;/.test(sql), 'the new audience is added in a transaction of its own');
const guides = sql.slice(sql.indexOf("b.audience::text = 'guides'"));
const clause = guides.slice(0, guides.indexOf('or exists (\n              select 1 from blog_audience'));
ok(/author\.role in \('admin', 'executive'\)/.test(clause), "only a leader's post opens to the Guides");
ok(/b\.church_id = public\.my_church_id\(\)/.test(clause), "and only inside the leader's own church");
ok(/me\.role in \('dm', 'admin', 'executive'\)/.test(clause) && !/'ds'/.test(clause),
   'the readers are Guides and leaders; an Explorer is never among them');
ok(/me\.is_approved/.test(clause) && /me\.suspended_at is null/.test(clause), 'approved and not suspended');
const before = strip(read('supabase/migrations/0042_anybody_may_write_and_the_church_may_read.sql'));
for (const kept of [
  "(b.audience::text = 'church' and b.church_id = public.my_church_id())",
  'public.is_paired_with(b.author_id)',
  "or (author.role in ('admin', 'executive')\n                    and b.church_id = public.my_church_id())",
  'where a.post_id = b.id and a.ds_id = (select auth.uid())',
]) {
  ok(before.includes(kept) && sql.includes(kept), `an existing reader is kept word for word: ${kept.split('\n')[0].trim().slice(0, 50)}…`);
}
ok(/revoke all on function public\.can_read_post\(uuid\) from public, anon;/.test(sql), 'nobody signed out may ask it');

// ---- the sample church follows the same rule -----------------------------
const blog = read('components/Blog.tsx');
ok(/p\.audience === 'guides'[\s\S]{0,400}\['admin', 'executive'\]\.includes\(role\(p\.author_id\)[\s\S]{0,120}\['dm', 'admin', 'executive'\]\.includes\(role\(userId\)/.test(blog),
   'the sample church reads a Guides post the same way');

// ---- who may pick what ----------------------------------------------------
const sp = read('components/SabbathProgram.tsx');
const choices = sp.slice(sp.indexOf('export function audienceChoices'), sp.indexOf('export function fitAudience'));
const lead = choices.slice(choices.indexOf('? ['), choices.indexOf(']\n    : ['));
ok(/value: 'guides'/.test(lead) && !/value: 'all'/.test(lead),
   'a Director or ED picks the Guides or the church, never "the people I walk with"');
ok(/value: 'all', label: 'My Explorers'/.test(choices) , 'a Guide picks their Explorers or the church');
for (const f of ['components/SabbathProgram.tsx', 'components/EvangelisticMeetings.tsx']) {
  const src = read(f);
  ok(/<AudiencePicker\b/.test(src) && /sharedTo: audience/.test(src) && /sharedTo: undefined/.test(src),
     `${f}: one picker, and the plan remembers who it reaches until it is taken down`);
  ok(/<PlanShelf\b/.test(src) && !/<FolderedList\b/.test(src), `${f}: plans are on the shelf`);
}
for (const f of ['lib/sabbath-program.ts', 'lib/evangelistic-meeting.ts']) {
  ok(/\['all', 'church', 'guides'\]\.includes\(r\.sharedTo/.test(read(f)), `${f}: who it reaches survives a sync, and nothing else does`);
}

// ---- the shelf ------------------------------------------------------------
const shelf = read('components/PlanShelf.tsx');
ok(/data-shelf-folder/.test(shelf) && /All plans/.test(shelf), 'folders are tiles, with a way back to All plans');
ok(/data-shelf-move/.test(shelf) && /New folder…/.test(shelf) && /Out of the folder/.test(shelf),
   'a plan moves from its row: into a folder, a new one, or out');
ok(/data-shelf-who/.test(shelf) && /audienceWord\(to\)/.test(shelf), 'every row says who can see it');

console.log(bad ? `RESULT: ${bad} FAILURE(S)` : 'RESULT: ALL OK');
process.exit(bad ? 1 : 0);
