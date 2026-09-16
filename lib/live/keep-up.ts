'use client';

// The screen keeps up on its own.
//
// WHAT THIS FIXES. One table in the whole app was published for realtime —
// `messages` — so a conversation updated itself and every other screen did not.
// Post a notice, approve somebody, add a study, share a resource, propose a
// time: the person looking at that screen saw the old version until they pulled
// to refresh. In front of a room that reads as the app being broken, and there
// is no way to explain it that sounds like anything else.
//
// Migration 20260902020000 publishes the tables. This is the other half.
//
// RLS DECIDES, NOT THIS FILE. Realtime evaluates the same policies as a SELECT,
// per subscriber, so an event only arrives for a row this person could already
// have read. Nothing here filters for privacy, and nothing here could: a filter
// in the browser is a courtesy to the network, never a boundary.
//
// WHY IT RELOADS RATHER THAN PATCHING THE ROW IN PLACE. Patching means writing
// a second copy of every screen's merge logic, in the component, where a
// mistake shows up as a list that is subtly wrong and stays wrong. Re-running
// the load the screen already has is one line, cannot drift from the real
// query, and on a church-sized table costs a request nobody notices. If a
// screen ever grows too big for that, it can subscribe more precisely; none is
// close.

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';

/** How long to wait before reloading, so a burst of writes costs one request. */
const SETTLE_MS = 250;

/**
 * Re-run `reload` whenever any of `tables` changes.
 *
 * `tables` is read once per mount and must not be rebuilt on every render — pass
 * a module-level constant, not an inline array, or the effect tears the channel
 * down and builds it again on every keystroke elsewhere on the page.
 */
export function useKeepUp(
  tables: readonly string[],
  reload: () => void | Promise<void>,
  enabled = true,
): void {
  // The newest reload, without making it a dependency. A component that rebuilds
  // its loader every render would otherwise resubscribe every render.
  const latest = useRef(reload);
  latest.current = reload;

  const key = tables.join(',');

  useEffect(() => {
    if (!enabled || !key) return;
    const client = supabase();
    if (!client) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    // A burst — approving five people, a bulk invite — is one reload, not five.
    const settle = () => {
      clearTimeout(timer);
      timer = setTimeout(() => { void latest.current(); }, SETTLE_MS);
    };

    // One channel for the whole hook. A channel per table would open twenty
    // sockets on a screen that watches twenty tables.
    const channel = client.channel(`keep-up:${key}:${Math.random().toString(36).slice(2)}`);
    for (const table of key.split(',')) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, settle);
    }
    channel.subscribe();

    return () => {
      clearTimeout(timer);
      client.removeChannel(channel);
    };
  }, [key, enabled]);
}

// The sets each screen watches. Module-level constants on purpose: see the note
// on `tables` above — an inline array is a new array every render.
export const KEEP_UP_CHURCH = ['announcements', 'blog_posts', 'prayer_requests'] as const;
export const KEEP_UP_NOTICES = ['announcements'] as const;
export const KEEP_UP_PRAYER = ['prayer_requests'] as const;
export const KEEP_UP_BLOG = ['blog_posts'] as const;
export const KEEP_UP_STUDIES = ['lesson_series', 'lessons', 'lesson_files', 'lesson_reads'] as const;
export const KEEP_UP_LIBRARY = ['materials', 'material_shares'] as const;
export const KEEP_UP_MEETINGS = ['meetings'] as const;
export const KEEP_UP_PEOPLE = ['profiles', 'pairings', 'pairing_requests', 'invites', 'recommendations'] as const;
export const KEEP_UP_BELL = ['notifications'] as const;
// THE GUILD ROOM'S WALL, AND THE ONE WAY IT COULD BE MADE LIVE SAFELY.
//
// This used to be a headstone. It said the wall was a genuine dead end: the two
// tables behind it have row level security on with no read policy, so a
// subscription to them is silent, and there was "no other table that changes
// when somebody posts, so there is nothing safe to watch instead".
//
// The first half is still true and must stay true. `list_guild_activity` never
// returns `author_id`; it computes a label -- 'You', 'A Guide', 'A fellow
// Explorer' -- and exposes amens only as a count. The wall is PSEUDONYMOUS.
// Realtime delivers THE ROW, not the function's output, so a read policy on
// `guild_activity_posts` or `guild_activity_amens` would put `author_id` and
// `person_id` on the wire and let any member map every post and every amen back
// to a person. That is still the one repair that must not happen.
//
// The second half was only true because the table did not exist yet. Migration
// 20260909180000 adds `guild_wall_pulse`: ONE ROW PER GUILD saying that its wall
// changed and how many times, with no author, no body and no post id in it.
// Triggers on both tables bump it. A member of that guild may read their own
// guild's row -- the policy calls `private.active_guild_member`, the same test
// the feed applies, rather than restating it -- and nobody else may read any of
// it.
//
// So the browser hears "something changed here" and re-asks
// `list_guild_activity`, which redacts exactly as it always has. The raw row
// never leaves the database. Watch the cause, not the ledger: the same shape
// KEEP_UP_LIBRARY_RECORD already uses.
export const KEEP_UP_GUILD = ['guild_wall_pulse'] as const;

// STILL PUBLISHED AND STILL UNREACHABLE, and the list is here so the next
// person does not rediscover it the expensive way. Checked against the live
// publication rather than against the migrations:
//
//     blog_views · guild_activity_amens · guild_activity_posts
//     library_activity · library_blocks
//
// Each has RLS on and NO read policy, so realtime has nothing to evaluate and
// drops every event. They are read through SECURITY DEFINER functions instead,
// which is why the screens that use them work perfectly on load.
//
// Nothing in this file names any of them, and the Guild Room is now the worked
// example of why: it is live, and it got there by watching a signal that
// carries no identity rather than by opening the table. Do not add one of these
// to a set here expecting it to work -- and if one of them ever needs to be
// live, this is the pattern.

// ---------------------------------------------------------------------------
// THE ROOMS THAT WERE LEFT OUT.
// ---------------------------------------------------------------------------
//
// Reported as "most users complain that they need to refresh their browser to
// get the real time results". Sixteen components loaded data and subscribed to
// nothing -- including all three of the screens a person actually lives on: the
// Explorer's, the Guide's and the Director's. The hook and the publication had
// been right since 20260902020000; they were simply never called from most of
// the app, and a mechanism nobody calls is indistinguishable from one that does
// not work.
//
// Migration 20260908170000 publishes the tables these sets name.

/**
 * One relationship, as seen from either end.
 *
 * The messages themselves keep their own, narrower subscription filtered to a
 * single pairing -- a conversation is the busiest thing here and does not want
 * a whole-screen reload per keystroke elsewhere. This covers everything AROUND
 * the conversation: the pairing itself, the files sent into it, and the other
 * person's name and photograph.
 */
export const KEEP_UP_MY_PAIRING = ['pairings', 'pairing_media', 'profiles'] as const;

/**
 * The chat room: the thread on screen, and the files sent into it.
 *
 * WIDER THAN `subscribeToMessages`, ON PURPOSE. That one filters to a single
 * pairing, which is right for a page showing one conversation and wrong here in
 * two ways: the Talk surface also has to notice a message arriving in one of a
 * Guide's OTHER threads, so the list's counts move; and it never watched
 * `pairing_media` at all, so a file arriving did not reload the thread it
 * arrived in. Realtime evaluates the same policy either way, so this is more
 * traffic and not a wider disclosure.
 */
export const KEEP_UP_TALK = ['messages', 'pairing_media'] as const;

/**
 * Follow-ups and names put forward: the Guide's working list.
 *
 * `seeker_notes` is NOT here. A Guide's private notes on the person they walk
 * with are not published, by the same rule that keeps safeguarding off the
 * wire -- see the migration. The list still refreshes when a follow-up or a
 * recommendation moves, which is what a Guide is actually watching for.
 */
export const KEEP_UP_FOLLOW_UPS =
  ['follow_ups', 'recommendations', 'lesson_series'] as const;

/** A Director's roster: who is waiting, who is approved, who walks with whom. */
export const KEEP_UP_ROSTER =
  ['profiles', 'pairings', 'pairing_requests', 'invites', 'recommendations', 'churches'] as const;

/** The guilds and who is in them. */
export const KEEP_UP_GUILDS = ['guilds', 'guild_members', 'profiles', 'pairings'] as const;

/**
 * Safeguarding. A report arriving is the one thing that should never wait.
 *
 * Published by 20260909100000, on the owner's decision, after being left off
 * deliberately for a day. The read policy is an approved admin or executive of
 * that church and nothing wider, and realtime evaluates it per subscriber -- so
 * this changes when a Director finds out, never who may find out.
 */
export const KEEP_UP_REPORTS = ['reports', 'report_files', 'profiles'] as const;

/**
 * Admin Reports: the queue, and the conversation inside a case.
 *
 * `reports` moves when somebody picks a case up or hands it back, and
 * `report_messages` moves on every reply. The second one is the reason this
 * cannot be left off: a one-to-one conversation that only updates on reload is
 * not a conversation, and that is precisely what the first version of this
 * screen shipped until the deaf-room guard refused it.
 *
 * Both tables are RLS'd to the people entitled to them -- `may_handle_report`
 * for the row, `in_report` for the thread -- and realtime evaluates the policy
 * per subscriber. So this changes when somebody finds out, never who may.
 */
/**
 * The pocket, which is the whole point of putting it in the database.
 *
 * "so that I can see my apps on aNY devices" is not satisfied by a table
 * somebody has to reload to see. The read policy is `owner_id = auth.uid()` and
 * realtime evaluates it per subscriber, so a tile saved on a phone lands on
 * that person's laptop and on nobody else's screen at all.
 */
export const KEEP_UP_POCKET = ['pocket_apps'] as const;

export const KEEP_UP_ADMIN_REPORTS =
  ['reports', 'report_messages', 'profiles'] as const;

/**
 * The Cases room, where several people are in the same hearing at once.
 *
 * The one screen in this app where two people are expected to be typing into
 * the same record at the same moment, which makes a stale view worse here than
 * anywhere else. `trials_read` is `in_trial(id)`: a party to that hearing, and
 * nobody else, however the row reaches them.
 */
export const KEEP_UP_CASES =
  ['trials', 'trial_statements', 'trial_parties', 'discipline_log', 'profiles'] as const;

/**
 * The security audit, WITHOUT watching the audit table.
 *
 * `security_audit_events` has row level security on and no policy at all, so
 * nothing may read it directly -- the screen goes through a definer function.
 * Publishing it would therefore deliver events to nobody: realtime evaluates
 * the same policies, and there are none to satisfy. A subscription that is
 * silent by construction is worse than an honest reload, because it looks
 * wired.
 *
 * So this watches what CAUSES an audit entry instead. Every row in that table
 * is written by a trigger on one of these three, checked against the live
 * database rather than inferred from the migrations: a profile change, a
 * report, or a discipline entry. All three are already published, so the feed
 * re-reads at exactly the moments it would have something new to show.
 *
 * If a fourth trigger is ever added, it belongs in this list too -- that is the
 * one way this can silently fall behind, and it is why the test names the
 * three rather than merely counting them.
 */
export const KEEP_UP_SECURITY = ['profile_changes', 'reports', 'discipline_log'] as const;

// STILL NO SET FOR A GUIDE'S PRIVATE NOTES. `seeker_notes` is not published and
// nobody asked for it to be: what a Guide writes about the person they walk
// with is not something anybody else should watch arrive.

/** The Guides' room: their thread, and the requests waiting in it. */
export const KEEP_UP_GUIDE_ROOM =
  ['guide_room_messages', 'pairing_requests', 'profiles', 'pairings'] as const;

/** The feedback inbox a Director works from. */
export const KEEP_UP_FEEDBACK = ['feedback'] as const;

/** The library's record, and who has been stopped from adding to it. */
/**
 * The library's record, WITHOUT watching the record table.
 *
 * The same trap the security audit fell into, found by the advisor rather than
 * by anybody reporting it. `library_activity` and `library_blocks` have row
 * level security on and NO POLICY AT ALL: they are read through a definer
 * function, so a subscription to them is delivered to nobody and the screen
 * looks wired while staying frozen.
 *
 * Every activity row is written by a trigger on `materials` or
 * `material_shares` -- checked against the live database, not inferred -- and
 * both of those are published and readable. So the record re-reads exactly when
 * somebody adds or shares something, which is when it has a new line to show.
 *
 * A block is set through a definer function and has no cause table, so a
 * blocked person appears on the next open. That is rare enough to be the right
 * trade and is stated here rather than left as a surprise.
 */
export const KEEP_UP_LIBRARY_RECORD = ['materials', 'material_shares'] as const;

/**
 * The apps a church offers.
 *
 * Leadership adds one and every phone in the congregation should have it
 * without anybody being told to reload. The table is small and changes rarely,
 * which is exactly why a stale one is easy to miss: somebody adds the hymnal on
 * Sabbath morning and nobody sees it until they next open the app cold.
 */
export const KEEP_UP_APPS = ['church_apps'] as const;

/** Somebody's own account: their name, their photograph, their church. */
export const KEEP_UP_ACCOUNT = ['profiles', 'churches', 'profile_changes'] as const;

/** The numbers. Everything they are counted from. */
export const KEEP_UP_NUMBERS =
  ['profiles', 'pairings', 'meetings', 'materials', 'prayer_requests', 'journey_events'] as const;
