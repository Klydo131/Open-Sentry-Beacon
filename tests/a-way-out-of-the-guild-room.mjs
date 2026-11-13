// The one room where somebody can be hurt by a stranger and say nothing.
//
// The Guild board lets a Guide or an Explorer put a thousand characters in
// front of a group. Checked against the live database on the day it shipped:
//
//   * a Director could not read the board at all;
//   * no one but the author could remove anything from it;
//   * there was no way for a member to say a post was wrong.
//
// Explorers are in these guilds and some Explorers are minors — this app has a
// guardian-consent table and a badge for exactly that reason. Every other place
// in Beacon where one person can be hurt by another carries the same three
// things: a way to report it, somebody whose job it is to look, and a record
// that outlives the person it describes.
//
// THE ROOM IS STILL NOT SURVEILLED, and that is the design, not an oversight.
// Leadership sees a post when, and only when, somebody reports it. This file
// holds both halves of that: the way out has to exist, and the board must not
// quietly open to leadership either.
//
// WHY THE RULES ARE ON THE SOURCE. The screen needs a database session the
// sandbox has no way to hold, and the failure is not a crash: it is a room
// that looks fine and has no door.

import { readFileSync } from 'node:fs';

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, '');

const sql = readFileSync('supabase/migrations/20260831060000_a_way_out_of_the_guild_room.sql', 'utf8');
const board = strip(readFileSync('components/LiveGuildActivity.tsx', 'utf8'));
const queue = strip(readFileSync('components/LiveSafeguarding.tsx', 'utf8'));
const dialog = strip(readFileSync('components/ReportDialog.tsx', 'utf8'));
const data = strip(readFileSync('lib/live/data.ts', 'utf8'));

// ---------------------------------------------------------------------------
// 1. A member can say a post is wrong, from the board itself.
// ---------------------------------------------------------------------------
{
  ok(/Report this post/.test(board),
     'the guild board carries a report control');
  ok(/entry\.is_mine \?/.test(board) && /Delete my post/.test(board),
     'and it is the alternative to Delete on somebody else’s post, not an extra button on your own');
  ok(/<ReportDialog/.test(board) && /hiddenSubject/.test(board),
     'it opens the same dialog the conversation uses, told that the author is hidden');
  ok(/live\s*\n?\s*\.reportGuildPost\(|live\.reportGuildPost\(/.test(board),
     'and it files a real report');
}

// ---------------------------------------------------------------------------
// 2. Reporting never tells the reporter who wrote it.
// ---------------------------------------------------------------------------
// The board deliberately shows "A Guide" and "A fellow Explorer". A report
// control that asked for a subject would hand back the identity the room was
// built to withhold.
{
  const start = data.indexOf('export async function reportGuildPost');
  ok(start > -1, 'reportGuildPost exists');
  const body = data.slice(start, data.indexOf('\n}', start));
  ok(!/subject/i.test(body),
     'reportGuildPost takes no subject: the browser sends a post id and nothing else');
  ok(/p_post: postId/.test(body), 'it sends the post id');

  ok(/select \* into v_author from public\.profiles where id = v_post\.author_id/.test(sql),
     'the author is resolved inside the database');
  ok(/returning id into v_id/.test(sql) && !/return v_post\.author_id/.test(sql),
     'and the function returns the report, never the author');

  ok(/hiddenSubject \? 'Whoever wrote it is not told'/.test(dialog),
     'the dialog says whoever wrote it is not told, rather than naming a post');
}

// ---------------------------------------------------------------------------
// 3. What was written survives the post being deleted.
// ---------------------------------------------------------------------------
// The obvious move for somebody who has just been reported is to delete the
// post. Without the copy, a Director opens a report about nothing.
{
  ok(/add column if not exists guild_post_body text/.test(sql),
     'a report keeps a copy of the post');
  ok(/guild_post_id\s+uuid references public\.guild_activity_posts\(id\) on delete set null/.test(sql),
     'and the link to a deleted post is nulled rather than taking the report with it');
  ok(/v_post\.id, v_post\.body\)/.test(sql),
     'the copy is taken at the moment it is reported');
  ok(/guild_post_body/.test(queue) && /<blockquote/.test(queue),
     'and the Director reads it in their queue');
}

// ---------------------------------------------------------------------------
// 4. Leadership can take one post down, and it is written down.
// ---------------------------------------------------------------------------
{
  ok(/if not public\.leads_church\(v_post\.church_id\) then/.test(sql),
     'only leadership of that church may remove a post');
  ok(/'guild_post_removed'/.test(sql),
     'the removal is an event type in the audit ledger');

  // BEFORE the delete: a failure between the two must not lose the record.
  const fn = sql.slice(sql.indexOf('function private.remove_guild_post'));
  ok(fn.indexOf('insert into public.security_audit_events') < fn.indexOf('delete from public.guild_activity_posts'),
     'the ledger row is written before the post is deleted, not after');

  // The ledger carries no message content anywhere else and must not start here.
  const insert = fn.slice(fn.indexOf('insert into public.security_audit_events'), fn.indexOf('delete from'));
  ok(!/v_post\.body/.test(insert),
     'and the ledger does not repeat what the post said');

  ok(/variant="danger"[\s\S]{0,200}Delete the post/.test(queue),
     'the take-down is a danger button in the Director’s queue');
}

// ---------------------------------------------------------------------------
// 5. The room is still not surveilled.
// ---------------------------------------------------------------------------
// This is the half that a later change is most likely to break: it is much
// easier to hand leadership the whole board than to keep the narrow door.
{
  ok(!/leads_church|is_admin|is_executive/.test(
       sql.slice(sql.indexOf('function private.report_guild_post'),
                 sql.indexOf('function private.remove_guild_post'))),
     'reporting is authorised by guild membership, not by rank');
  const listing = readFileSync('supabase/migrations/20260830120000_security_audit_and_guild_activity.sql', 'utf8');
  ok(/if not private\.active_guild_member\(p_guild\) then/.test(listing),
     'reading the board is still guild membership only');
  ok(!/list_guild_activity/.test(queue) && !/list_guild_activity/.test(sql),
     'and nothing in the safeguarding path opens the whole board to leadership');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
