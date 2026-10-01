// A message can be changed or taken back, and the record survives both.
//
// ---------------------------------------------------------------------------
// THE FAULT THIS SHIPPED WITH, WHICH IS THE REASON FOR MOST OF THE CHECKS.
//
// `messages_mark` is an UPDATE policy that exists so the RECIPIENT can stamp
// `read_at`. RLS is ROW level: it says nothing about which columns may change,
// and nothing about being the author. Verified against the live database before
// any of this was written:
//
//     UPDATE by the other person affected 1 row(s)
//
// Either person in a pairing could silently rewrite the other's words, with no
// trace and nothing on screen. The conversation is the safeguarding record in
// this app and some Explorers are children, so that is the record itself being
// untrustworthy.
//
// The fix is a COLUMN GRANT -- the browser may write `read_at` and nothing else
// -- with editing and deleting moved into definer functions that check the
// caller is the author. This file exists so a later migration cannot hand the
// UPDATE back without somebody noticing.
//
// AND DELETING MUST NOT DESTROY. `report_guild_post` copies a post's words into
// the report because the first thing a reported person does is delete. Same
// rule here: the words move to `message_revisions`, which has RLS on and no
// policy, and the row's `body` is emptied so no browser can reach them.
//
//   node tests/a-message-can-be-changed-or-taken-back.mjs
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

const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => ({ name: f, sql: read(`supabase/migrations/${f}`) }));
const allSql = migrations.map((m) => m.sql).join('\n');
const mine = migrations.find((m) => m.name.includes('changed_or_taken_back'));

// ---------------------------------------------------------------------------
// 1. THE HOLE IS SHUT, AND STAYS SHUT
// ---------------------------------------------------------------------------
{
  ok(Boolean(mine), 'the migration is in the tree');

  ok(/revoke\s+update\s+on\s+public\.messages\s+from\s+authenticated/i.test(allSql),
     'the browser no longer holds a blanket UPDATE on messages');
  ok(/grant\s+update\s*\(\s*read_at\s*\)\s*on\s+public\.messages\s+to\s+authenticated/i.test(allSql),
     'and holds exactly one column, read_at, so read receipts still work');

  // THE REGRESSION THIS IS REALLY FOR. A later migration re-granting the whole
  // table would undo everything above and look perfectly ordinary doing it.
  //
  // ONLY MIGRATIONS AFTER THE REVOKE COUNT, and the first version of this check
  // got that wrong: 0004_live_api_permissions.sql grants
  // `select, insert, update` on messages, which is the ORIGINAL grant this
  // feature revokes. Migrations run in filename order, so a grant before the
  // revoke is history and a grant after it is the fault. A check that ignores
  // order fails on the very thing it is documenting.
  const after = migrations.filter((m) => m.name > (mine?.name ?? ''));
  const regrants = after.filter((m) =>
    /grant[^;]*\bupdate\b(?![^;]*\()[^;]*on[^;]*public\.messages[^;]*to[^;]*authenticated/i.test(m.sql));
  ok(regrants.length === 0,
     `no migration after the revoke grants a column-less UPDATE on messages back${
       regrants.length ? ` (found in: ${regrants.map((m) => m.name).join(', ')})` : ''}`);
}

// ---------------------------------------------------------------------------
// 2. ONLY THE AUTHOR, CHECKED IN THE FUNCTION
// ---------------------------------------------------------------------------
//
// A definer function runs as its owner, so RLS does not protect it. The caller
// check is the only thing standing there -- the rule AGENTS.md states and the
// one this feature would be worst to get wrong.
{
  const sql = mine?.sql ?? '';
  for (const fn of ['edit_message', 'delete_message']) {
    const body = sql.slice(sql.indexOf(`function private.${fn}`));
    const upTo = body.slice(0, body.indexOf('$$;') + 3);
    ok(/sender_id <> \(select auth\.uid\(\)\)/.test(upTo),
       `private.${fn} refuses anybody who is not the author`);
    ok(/security definer/i.test(upTo), `private.${fn} is a definer function`);
  }
}

// ---------------------------------------------------------------------------
// 3. THE WORDS SURVIVE, WHERE NO BROWSER CAN READ THEM
// ---------------------------------------------------------------------------
{
  const sql = mine?.sql ?? '';
  ok(/create table if not exists public\.message_revisions/.test(sql),
     'what was said is kept in message_revisions');
  ok(/alter table public\.message_revisions enable row level security/.test(sql),
     'which has row level security on');

  // NO POLICY ON IT, ANYWHERE. Checked across every migration, not just this
  // one, because the leak would be a later file adding a friendly-looking read.
  const opened = migrations.filter((m) =>
    /create policy[\s\S]{0,300}?on\s+public\.message_revisions/i.test(m.sql));
  ok(opened.length === 0,
     `nothing gives message_revisions a policy, so no browser can read it${
       opened.length ? ` (found in: ${opened.map((m) => m.name).join(', ')})` : ''}`);

  ok(/insert into public\.message_revisions[\s\S]{0,200}'edited'/.test(sql),
     'an edit records the previous wording before changing it');
  ok(/insert into public\.message_revisions[\s\S]{0,200}'deleted'/.test(sql),
     'a delete records the words before removing them');

  // The row must stop carrying the words. Same lesson as the Guild wall:
  // realtime and RLS are row level, so hiding a column means emptying it.
  ok(/set body = ''[\s\S]{0,80}deleted_at = now\(\)/.test(sql),
     'and the row itself is emptied, so the words leave every browser');
}

// ---------------------------------------------------------------------------
// 4. THE NOTE THE OWNER ASKED FOR
// ---------------------------------------------------------------------------
//
// "If it's deleted there must be a message or note 'user X has deleted a
// message'." A deletion that leaves a gap reads as a message never sent.
{
  // Drawn by components/talk/ChatView.tsx for both halves since 1 October 2026.
  const ui = read('components/talk/ChatView.tsx');
  ok(/deleted a message/.test(ui), 'a deleted message says so, rather than leaving a gap');
  ok(/You deleted a message/.test(ui), 'your own says You');
  ok(/deleted a message`/.test(ui) && /theirFirst/.test(ui),
     'and the other person\'s is named');

  // It must be drawn INSTEAD of the body, not beside it.
  const branch = ui.slice(ui.indexOf(') : entry.deletedAt ? ('), ui.indexOf('<Linked text={entry.body} />'));
  ok(branch.length > 0 && /deleted a message/.test(branch) && !/<Linked/.test(branch),
     'the deleted branch does not also render the body');

  ok(/entry\.kind === 'message' && entry\.editedAt && !entry\.deletedAt \? 'edited'/.test(ui),
     'an edited message says it was edited, so a quiet rewrite is not possible');

  // TAKING BACK ASKS FIRST, and says what the other person will see.
  ok(/confirm: 'Delete this message\?'/.test(ui) && /will see that a message was deleted/.test(ui),
     'deleting asks first, and says the other person will see it was deleted');
}

// ---------------------------------------------------------------------------
// 5. THE APP GOES THROUGH THE FUNCTIONS, NOT THE TABLE
// ---------------------------------------------------------------------------
{
  const data = read('lib/live/data.ts');
  ok(/rpc\('edit_message'/.test(data),   'editMessage calls the function');
  ok(/rpc\('delete_message'/.test(data), 'deleteMessage calls the function');

  // The give-away regression: going back to a direct write.
  ok(!/from\('messages'\)[\s\S]{0,120}\.delete\(\)/.test(data),
     'nothing deletes from the messages table directly');
  const updates = [...data.matchAll(/from\('messages'\)\s*\n?\s*\.update\(([^)]*)\)/g)]
    .map((m) => m[1]);
  ok(updates.every((u) => /read_at/.test(u)),
     `the only direct update to messages is the read receipt (${updates.length} found)`);

  // ONE CONVERSATION FOR BOTH SIDES NOW. On 30 September 2026 the chat left
  // the Explorer's home and the Guide's Talk tab for the bubble, so the place
  // both of them edit and take back messages is TalkSurface, which the bubble
  // (TalkDock) and /talk draw for a Guide and an Explorer alike.
  const surface = read('components/live/TalkSurface.tsx');
  ok(/onEditMessage=\{async \(id, text\) => \{ await live\.editMessage\(id, text\)/.test(surface)
     && /onDeleteMessage=\{async \(id\) => \{ await live\.deleteMessage\(id\)/.test(surface),
     'the conversation in the bubble offers both'); 
  ok(/role !== 'ds' && profile\.role !== 'dm'/.test(read('components/live/TalkDock.tsx')),
     'and it is the same conversation for the Guide and the Explorer, because a control only one side has is not a rule');
  // And nowhere else draws a conversation that could quietly lack them.
  const drawers = ['components/live/ExplorerPage.tsx', 'components/live/GuidePages.tsx']
    .filter((f) => /<Conversation\b/.test(read(f)));
  ok(drawers.length === 0, `no page draws a second conversation beside the bubble's (${drawers.join(', ') || 'none'})`);
}

// ---------------------------------------------------------------------------
// 6. THE GUIDES' ROOM, WHICH IS THE SAME FEATURE WITH DIFFERENT RULES
// ---------------------------------------------------------------------------
//
// It could already delete -- `guide_room_drop` allowed the author or church
// leadership -- but it was a REAL delete, so the words were destroyed and the
// thread just changed shape. This is the room where Guides say the hard parts
// out loud and leadership is in it, so "deleted" has to mean removed from the
// screen, not removed from existence.
{
  const mine = migrations.find((m) => m.name.includes('guides_room_can_correct'));
  ok(Boolean(mine), "the Guides' room migration is in the tree");
  const sql = mine?.sql ?? '';

  // THE HARD DELETE MUST BE GONE. While a real `delete from` is permitted,
  // every safeguard below can be bypassed by doing the thing it replaces.
  ok(/drop policy if exists guide_room_drop on public\.guide_room_messages/.test(sql),
     'the destructive delete policy is dropped, so the record cannot be erased');
  ok(/revoke update, delete on public\.guide_room_messages from authenticated/.test(sql),
     'and the browser holds neither UPDATE nor DELETE on the table');

  const readd = migrations.filter((m) => m.name > (mine?.name ?? '') &&
    /create policy[\s\S]{0,200}?on\s+public\.guide_room_messages[\s\S]{0,200}?for\s+delete/i.test(m.sql));
  ok(readd.length === 0,
     `nothing after it re-adds a delete policy${readd.length ? ` (${readd.map((m) => m.name).join(', ')})` : ''}`);

  // ONLY THE AUTHOR MAY EDIT, even though leadership may remove. Removing
  // something and putting different words in somebody's mouth are not the same
  // power, and only the first belongs to a moderator.
  const edit = sql.slice(sql.indexOf('function private.edit_guide_room_message'));
  ok(/author_id is distinct from \(select auth\.uid\(\)\)/.test(edit.slice(0, edit.indexOf('$$;') + 3)),
     'only the author may edit, even though leadership may remove');
  const del = sql.slice(sql.indexOf('function private.delete_guide_room_message'));
  ok(/leads_church\(v_msg\.church_id\)/.test(del.slice(0, del.indexOf('$$;') + 3)),
     'leadership keeps exactly the removal power it already had');

  ok(/create table if not exists public\.guide_room_revisions/.test(sql)
     && /revoke all on public\.guide_room_revisions from authenticated/.test(sql),
     'what was said is kept where no browser can read it');
  ok(/changed_by/.test(sql),
     'and the record says WHO removed it, because this room is not symmetric');
  ok(/set body = ''[\s\S]{0,80}deleted_at = now\(\)/.test(sql),
     'the row is emptied, so the words leave every browser');

  const ui = read('components/LiveGuildRoom.tsx');
  ok(/deleted a message/.test(ui) && /removed a message from/.test(ui),
     'a removal says who did it, and distinguishes withdrawing from moderating');
  ok(/Yes, delete it|Yes, remove it/.test(ui) && /Keep it/.test(ui),
     'and it asks first, which the one-tap delete it replaces never did');

  const data = read('lib/live/data.ts');
  ok(/rpc\('delete_guide_room_message'/.test(data),
     'the room deletes through the function, not the table');
  ok(!/from\('guide_room_messages'\)[\s\S]{0,120}\.delete\(\)/.test(data),
     'and nothing deletes from guide_room_messages directly any more');
}

// ---------------------------------------------------------------------------
// 7. THE GUILD WALL, WHERE THE NOTE MUST NOT NAME ANYBODY
// ---------------------------------------------------------------------------
//
// The third room, and the only pseudonymous one. Both other rooms name the
// person who deleted something; naming one here would undo the whole point of
// the wall in a single line, and it is the most tempting line to write because
// it is what the other two do.
{
  const mine = migrations.find((m) => m.name.includes('guild_wall_can_be_corrected'));
  ok(Boolean(mine), 'the Guild wall migration is in the tree');
  const sql = mine?.sql ?? '';

  // THE FEED STILL RETURNS A LABEL AND NEVER AN ID, even now that it carries
  // the deleted state. This is the assertion the whole room rests on.
  const feed = sql.slice(sql.indexOf('function private.list_guild_activity'));
  const feedBody = feed.slice(0, feed.indexOf('$$;') + 3);
  ok(/author_label text/.test(sql) || /'A fellow Explorer'/.test(feedBody),
     'the feed still computes a label');
  // ASSERTED ON THE RETURN SIGNATURE, which is the only unambiguous place.
  // The first version scanned the body for `post.author_id` not followed by
  // auth.uid, and flagged the `join ... on author.id = post.author_id` line --
  // a join condition, not a returned column. A check that cannot tell those
  // apart would have to be silenced, and a silenced check protects nothing.
  const returns = feedBody.slice(feedBody.indexOf('returns table'),
                                 feedBody.indexOf(')', feedBody.indexOf('returns table')));
  ok(!/author_id/.test(returns),
     `and author_id is not among the columns it returns (${
       returns.replace(/\s+/g, ' ').slice(14, 90)}...)`);
  ok(/removed_by_leader/.test(feedBody),
     'it says whether leadership took a post down, which is not a person');

  // NO deleted_by ON THE WIRE. The column exists on the table for the record;
  // it must not reach the browser, or the note could be built from it.
  const data = read('lib/live/data.ts');
  const type = data.slice(data.indexOf('export interface GuildActivityPost'),
                          data.indexOf('export interface GuildActivityPost') + 1400);
  ok(!/^\s*deleted_by/m.test(type),
     'GuildActivityPost carries no deleted_by, so a note cannot be built from one');

  // Only the author may edit, though leadership may take down.
  const edit = sql.slice(sql.indexOf('function private.edit_guild_post'));
  ok(/author_id <> \(select auth\.uid\(\)\)/.test(edit.slice(0, edit.indexOf('$$;') + 3)),
     'only the author may edit a post');

  // Both deletes keep the words, and neither destroys the row.
  ok(!/delete from public\.guild_activity_posts/.test(sql),
     'neither delete destroys the post any more');
  ok((sql.match(/insert into public\.guild_activity_revisions/g) || []).length >= 3,
     'edit, the author\'s delete and a leadership take-down all keep the words');
  ok(/revoke all on public\.guild_activity_revisions from authenticated/.test(sql),
     'and the kept words are unreadable from a browser');

  // A report raised AFTER a take-down must still carry the words.
  const report = sql.slice(sql.indexOf('function private.report_guild_post'));
  ok(/from public\.guild_activity_revisions/.test(report.slice(0, report.indexOf('$$;') + 3)),
     'reporting a post already taken down still captures what it said');

  const ui = read('components/LiveGuildActivity.tsx');
  ok(/removed by church leadership/.test(ui),
     'a leadership take-down says so without naming the leader');
  ok(/\$\{entry\.author_label\} deleted a post/.test(ui),
     "and somebody else's deletion uses the label, never a name");
  ok(/Yes, delete it/.test(ui) && /Keep it/.test(ui),
     'deleting your own post asks first, which the one-tap control never did');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
