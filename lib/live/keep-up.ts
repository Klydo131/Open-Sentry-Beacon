'use client';

// Reload a screen when the tables behind it change (Supabase Realtime).
//
// Realtime applies the same row-level security as a SELECT, per subscriber,
// so events arrive only for rows the person could already read. Screens
// re-run their own load rather than patching rows, so they cannot drift from
// the real query.

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';

/** How long to wait before reloading, so a burst of writes costs one request. */
const SETTLE_MS = 250;

/**
 * Re-run `reload` whenever any of `tables` changes. Pass a module-level
 * constant, not an inline array, or the channel is rebuilt on every render.
 */
export function useKeepUp(
  tables: readonly string[],
  reload: () => void | Promise<void>,
  enabled = true,
): void {
  // The newest reload, without resubscribing when the component rebuilds it.
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

    // One channel per hook, not one per table.
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

// The sets each screen watches (module-level constants, see above).
export const KEEP_UP_CHURCH = ['announcements', 'blog_posts', 'prayer_requests'] as const;
export const KEEP_UP_NOTICES = ['announcements'] as const;
export const KEEP_UP_PRAYER = ['prayer_requests'] as const;
export const KEEP_UP_BLOG = ['blog_posts'] as const;
export const KEEP_UP_STUDIES = ['lesson_series', 'lessons', 'lesson_files', 'lesson_reads'] as const;
export const KEEP_UP_LIBRARY = ['materials', 'material_shares'] as const;
export const KEEP_UP_MEETINGS = ['meetings'] as const;
export const KEEP_UP_PEOPLE = ['profiles', 'pairings', 'pairing_requests', 'invites', 'recommendations'] as const;
export const KEEP_UP_BELL = ['notifications'] as const;
// The guild wall is pseudonymous, so its tables have no read policy and must
// never be published. guild_wall_pulse (one row per guild, no identities)
// tells members that their wall changed, and the screen re-asks
// list_guild_activity.
export const KEEP_UP_GUILD = ['guild_wall_pulse'] as const;

// Never add tables that have row-level security and no read policy (read only
// through definer functions): realtime would deliver nothing. Watch a table
// that causes them to change instead, as KEEP_UP_GUILD and
// KEEP_UP_LIBRARY_RECORD do.

/** One relationship from either end: the pairing, its files, and the other person's profile. */
export const KEEP_UP_MY_PAIRING = ['pairings', 'pairing_media', 'profiles'] as const;

/** The chat: every thread's messages and files, so counts move for other threads too. */
export const KEEP_UP_TALK = ['messages', 'pairing_media'] as const;
/**
 * Reactions, in their own set: on a database without the table, a refused
 * subscription must not take the messages' channel down with it.
 */
export const KEEP_UP_REACTIONS = ['message_reactions'] as const;

/** A Guide's follow-ups and recommendations. Private notes are never published. */
export const KEEP_UP_FOLLOW_UPS =
  ['follow_ups', 'recommendations', 'lesson_series'] as const;

/** A Director's roster: who is waiting, who is approved, who walks with whom. */
export const KEEP_UP_ROSTER =
  ['profiles', 'pairings', 'pairing_requests', 'invites', 'recommendations', 'churches'] as const;

/** The guilds and who is in them. */
export const KEEP_UP_GUILDS = ['guilds', 'guild_members', 'profiles', 'pairings'] as const;

/** Safeguarding reports, for the church's leaders only. */
export const KEEP_UP_REPORTS = ['reports', 'report_files', 'profiles'] as const;

/** The pocket, so a tile saved on one device appears on the person's others. */
export const KEEP_UP_POCKET = ['pocket_apps'] as const;

/** Admin reports: the list, and the conversation about each report. */
export const KEEP_UP_ADMIN_REPORTS =
  ['reports', 'report_messages', 'profiles'] as const;

/** Suspend or remove: who is suspended, as other leaders change it. */
export const KEEP_UP_DISCIPLINE = ['discipline_log', 'profiles'] as const;

/**
 * The security audit, by watching the tables whose triggers write it (the
 * audit table itself has no read policy). Add a new cause table here too.
 */
export const KEEP_UP_SECURITY = ['profile_changes', 'reports', 'discipline_log'] as const;

/** The Guides' room: their thread, and the requests waiting in it. */
export const KEEP_UP_GUIDE_ROOM =
  ['guide_room_messages', 'pairing_requests', 'profiles', 'pairings'] as const;

/** The feedback inbox a Director works from. */
export const KEEP_UP_FEEDBACK = ['feedback', 'feedback_review'] as const;

/**
 * The library record, by watching the tables whose triggers write it.
 * A block has no cause table, so it shows on the next open.
 */
export const KEEP_UP_LIBRARY_RECORD = ['materials', 'material_shares'] as const;

/** The activity analysis: pairings, appointments and what people added. */
export const KEEP_UP_ACTIVITY_ANALYSIS = [
  'pairings', 'meetings', 'materials', 'material_shares',
] as const;

/** Somebody's own account: their name, their photograph, their church. */
export const KEEP_UP_ACCOUNT = ['profiles', 'churches', 'profile_changes'] as const;

/** The progress report and what it is counted from. */
export const KEEP_UP_PROGRESS =
  ['pairings', 'journey_events', 'meetings', 'lesson_assignments', 'follow_ups', 'profiles'] as const;

/** A person's own Sabbath programs and meetings, across their devices. */
export const KEEP_UP_PLANS = ['office_plans'] as const;

/** The numbers. Everything they are counted from. */
export const KEEP_UP_NUMBERS =
  ['profiles', 'pairings', 'meetings', 'materials', 'prayer_requests', 'journey_events'] as const;
