// A study is marked read by the person who read it, and their leaders can see how far they have got.
//
// THE ASK.
//
// THE WORD THAT DECIDED THE DESIGN IS "really". A bar is worth having only if
// its number is evidence, and there were two easy ways to build one that is
// not:
//
//   ONE. MARK IT READ WHEN IT APPEARS. `SeriesBody` renders every lesson of an
//   open series expanded at once, so opening a six-lesson series would record
//   six lessons read on a single tap. A Director would then be looking at a
//   measurement of a tap, presented as a measurement of reading.
//
//   TWO. LET A LEADER TICK IT OFF. The moment somebody other than the reader
//   can write a read, the bar stops answering "did they read it" and starts
//   answering "does someone say they did". The database refuses this, not just
//   the screen, because the screen is not where the refusal has to hold.
//
// So this file checks BOTH halves the way the study-permissions test does: the
// policy that actually refuses, and the screen that does not offer what would
// be refused. Two statements of one sentence in two languages is two things to
// change and one thing to forget.
//
//   node tests/the-reading-is-recorded.mjs
//
// Reads the migrations and the screens. Needs no database.
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

// These files explain at length the bugs they exist to prevent. A check that
// cannot tell an explanation from the thing it explains fails on its own
// documentation.
const stripSql = (s) => s.replace(/--[^\n]*/g, ' ');
const stripTs = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

const dir = 'supabase/migrations';
const find = (slug) => fs.readdirSync(path.join(root, dir))
  .filter((f) => f.includes(slug)).sort().pop();

const file = find('the_reading_is_recorded');
ok(!!file, `the migration is present (${file ?? 'MISSING'})`);
const sql = file ? stripSql(read(`${dir}/${file}`)) : '';

const bar = stripTs(read('components/live/ReadingProgress.tsx'));
const studies = stripTs(read('components/LiveStudies.tsx'));
const card = stripTs(read('components/live/MemberProfile.tsx'));
const data = stripTs(read('lib/live/data.ts'));

// ---------------------------------------------------------------------------
// 1. THE ROW, AND WHAT IT IS ALLOWED TO BE
// ---------------------------------------------------------------------------
{
  ok(/create table if not exists public\.lesson_reads/.test(sql), 'there is a table for a read');
  ok(/primary key \(lesson_id, user_id\)/.test(sql),
     'one row per person per lesson, so reading the same study twice is still one read');
  ok(/references public\.lessons\s*\(id\) on delete cascade/.test(sql),
     'a deleted study takes its reads with it');
  ok(/references public\.profiles\s*\(id\) on delete cascade/.test(sql),
     'and so does a deleted member, which is what leaving the church has to mean');
  ok(/alter table public\.lesson_reads enable row level security/.test(sql),
     'the table is not readable just because somebody has a key');
}

// ---------------------------------------------------------------------------
// 2. ONLY THE READER MAY RECORD A READ
// ---------------------------------------------------------------------------
//
// This is the whole feature. If it fails, the bar is decoration.
{
  const at = sql.indexOf('create policy lr_write');
  ok(at !== -1, 'there is a policy for writing a read');
  const body = sql.slice(at, sql.indexOf(';', at));
  ok(/with check \(user_id = \(select auth\.uid\(\)\)\)/.test(body),
     'and it insists the row is about the person writing it');

  // A `using` clause on an INSERT policy is not merely redundant, it is a sign
  // somebody has reached for the read rule by mistake.
  ok(!/using/.test(body), 'the insert rule is a check, not a using clause');

  // NOBODY MAY EDIT A READ INTO EXISTENCE EITHER. An update policy would let a
  // leader move a row from their own account onto somebody else's.
  ok(!/create policy .*on public\.lesson_reads\s*\n?\s*for update/.test(sql),
     'and no update policy exists at all');

  // Un-marking is the reader's own, so a wrong tap can be put back.
  const dropAt = sql.indexOf('create policy lr_drop');
  ok(dropAt !== -1, 'a read can be taken back');
  ok(/user_id = \(select auth\.uid\(\)\)/.test(sql.slice(dropAt, sql.indexOf(';', dropAt))),
     'by the person it belongs to, and no one else');

  ok(!/grant .*update.* on public\.lesson_reads/.test(sql),
     'and update is never granted on the table');
  ok(/grant select, insert, delete on public\.lesson_reads to authenticated/.test(sql),
     'exactly the three verbs the feature uses are granted');
}

// ---------------------------------------------------------------------------
// 3. WHO MAY LOOK
// ---------------------------------------------------------------------------
{
  ok(/create or replace function public\.may_see_reading/.test(sql),
     'one function answers "may I see this person’s reading?"');
  const fnAt = sql.indexOf('may_see_reading(member uuid)');
  const fn = sql.slice(fnAt, sql.indexOf('$$;', fnAt));
  ok(/member = \(select auth\.uid\(\)\)/.test(fn), 'the member themselves');
  ok(/public\.is_paired_with\(member\)/.test(fn), 'the Guide walking with them');
  ok(/public\.manages_church\(p\.church_id\)/.test(fn),
     'and the Directors and Executive Directors of their church');

  // THE READER'S CHURCH, NOT THE LESSON'S. The sample studies are seeded
  // material no local church authored; scoping by the lesson's church would
  // have hidden exactly the sample progress that was asked for.
  ok(/from public\.profiles p/.test(fn),
     'the church is taken from the member, not from the lesson');

  ok(/security definer/.test(sql), 'it runs with the privileges it needs');
  ok(/set search_path to 'public'/.test(sql), 'with a pinned search_path');
  ok(/revoke all on function public\.may_see_reading\(uuid\) from public, anon/.test(sql),
     'and is not left callable by anonymous visitors');

  const readAt = sql.indexOf('create policy lr_read');
  ok(readAt !== -1 && /public\.may_see_reading\(user_id\)/.test(sql.slice(readAt, sql.indexOf(';', readAt))),
     'and the read policy asks it rather than repeating the rule');
}

// Every policy names its role. A missing TO clause hands the rule to the
// signed-out role as well.
for (const p of ['lr_read', 'lr_write', 'lr_drop']) {
  const at = sql.indexOf(`create policy ${p}`);
  ok(at !== -1 && /to authenticated/.test(sql.slice(at, sql.indexOf(';', at))),
     `${p} is granted to authenticated and no one else`);
}

// ---------------------------------------------------------------------------
// 4. THE BAR NEVER INVENTS A NUMBER
// ---------------------------------------------------------------------------
//
// `BeaconLoader` carries this rule in its header for the indeterminate case.
// This bar has real numerators, and has to keep them real.
{
  ok(/export function percentRead/.test(bar), 'the percentage is computed in one place');
  const fn = bar.slice(bar.indexOf('export function percentRead'));
  ok(/if \(total <= 0\) return 0/.test(fn.slice(0, 200)),
     'and nothing out of nothing is not a percentage, so it is refused rather than divided');

  ok(/aria-label=\{`\$\{done\} of \$\{total\} studies read/.test(bar),
     'a screen reader hears the two numbers, not a bare proportion');
  // Backtick-delimited on purpose: the aria-label contains the same words, and
  // matching that instead would let the VISIBLE figures disappear unnoticed.
  ok(/`\$\{done\} of \$\{total\}`/.test(bar), 'and the figures are written out beside the bar');
  ok(/data-reading-bar=/.test(bar), 'the bar is addressable, so a test can scope to one of them');

  // The denominator only counts lessons that still exist, or deleting a study
  // somebody had read would push the bar past its own end.
  ok(/alive\.has\(id\)/.test(bar), 'a deleted study stops counting towards a read total');
  ok(/reading\.total === 0/.test(bar), 'and an empty shelf draws no bar at all');
}

// ---------------------------------------------------------------------------
// 5. THE SCREENS AGREE WITH THE DATABASE
// ---------------------------------------------------------------------------
{
  // The reader's own screen is the ONLY one with a control.
  ok(/Mark as read/.test(studies), 'the studies screen offers to mark a study read');
  ok(/live\.markLessonRead\(/.test(studies), 'and really records it');
  ok(/live\.unmarkLessonRead\(/.test(studies), 'and can take it back');
  ok(/aria-pressed=\{reads\.has\(lesson\.id\)\}/.test(studies),
     'and the control says whether it is on, for somebody not looking at the colour');

  // NOT ON RENDER. The bug this whole design avoids.
  ok(!/useEffect\([^)]*markLessonRead/.test(studies),
     'nothing marks a study read merely because it appeared on screen');

  // The leaders' screens READ it and cannot write it.
  ok(/<MemberReading memberId=\{person\.id\}/.test(card),
     'the member card shows how far somebody has got');
  ok(/person\.role === 'ds'/.test(card),
     'for Explorers, rather than turning every colleague’s card into a scoreboard');
  ok(!/markLessonRead/.test(card),
     'and the card has no way to record a read on somebody else’s behalf');

  const guide = stripTs(read('components/live/GuidePages.tsx'));
  ok(/<MemberReading memberId=\{pairing\.ds_id\}/.test(guide),
     'the Guide sees it for the person they walk with');
  ok(!/markLessonRead/.test(guide), 'and cannot record one for them either');
}

// ---------------------------------------------------------------------------
// 6. THE DATA LAYER WRITES ONLY YOUR OWN
// ---------------------------------------------------------------------------
{
  const at = data.indexOf('export async function markLessonRead');
  ok(at !== -1, 'there is one place that records a read');
  const fn = data.slice(at, data.indexOf('\nexport ', at + 1));
  ok(/const me_id = await uid\(\)/.test(fn),
     'it takes the person from the verified session, never from an argument');
  ok(/user_id: me_id/.test(fn), 'and writes that');
  ok(!/user_id: userId/.test(fn), 'there is no parameter a caller could use to write somebody else');
  ok(/error\.code !== '23505'/.test(fn),
     'and marking the same study twice is not an error worth showing anybody');
}

// ---------------------------------------------------------------------------
// 7. THE BAR MOVES WHILE SOMEBODY IS WATCHING IT
// ---------------------------------------------------------------------------
//
// A Director opening a member's card while that member reads should see the
// number change. That needs the table in BOTH the realtime publication and the
// set the screens watch; either one alone is silence.
{
  const hook = read('lib/live/keep-up.ts');
  ok(/KEEP_UP_STUDIES = \['lesson_series', 'lessons', 'lesson_files', 'lesson_reads'\]/.test(hook),
     'the studies screens watch the reads table');

  const pub = find('the_screen_keeps_up');
  ok(!!pub && /lesson_reads/.test(read(`${dir}/${pub}`)),
     `and the newest publication migration publishes it (${pub ?? 'MISSING'})`);
  ok(/useKeepUp\(KEEP_UP_STUDIES/.test(bar), 'and the bar itself keeps up');
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
