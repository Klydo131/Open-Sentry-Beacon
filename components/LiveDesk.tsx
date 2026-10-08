'use client';

// What is on your desk: what is coming, and what is waiting for you.
//
// THE OLD ONE WAS ALWAYS EMPTY. The rail's desk card took a list of numbers and
// the live shell passed `[]`, hard-coded, so every signed-in person has always
// been told "Nothing waiting. A good place to be." whatever was actually
// waiting. It looked like a considered empty state and was a panel nobody had
// ever wired up.
//
// TWO HALVES, AND THE ORDER IS THE POINT.
//
//   COMING UP is a fact about the calendar. It cannot be acted on now and it is
//   the thing people forget, so it goes first and it is short.
//
//   WAITING FOR YOU is work. Every line is something somebody is waiting on,
//   it links to the screen that resolves it, and it disappears when it is done.
//
// EVERY LINE IS A LINK. A dashboard number you cannot press is a number that
// makes somebody go looking, and the looking is where things get dropped.
//
// NOTHING HERE IS PRIVILEGED. Each figure comes from a query the reader could
// already run; the desk is a shortcut to their own screens, not a new view of
// the church. A Guide's desk counts their own people, a Director's counts the
// church they lead, and the database decides which is which.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import * as live from '@/lib/live/data';
import type { Profile } from '@/lib/types';
import type { RoomTheme } from '@/lib/room-theme';
import { openBell } from '@/lib/open-bell';
import { joinLabel, joinUrl } from '@/lib/live/meeting-link';
import { useKeepUp, KEEP_UP_PEOPLE } from '@/lib/live/keep-up';

interface DeskItem {
  key: string;
  label: string;
  count: number;
  href: string;
  /** Drawn in the accent when true: somebody is waiting on a person. */
  urgent?: boolean;
  /**
   * Opens the bell panel where the person already is, instead of navigating.
   *
   * The bell lives in the header of every screen, so there is no page to send
   * anybody to. A link to `?bell=1` would have been a link to the screen they
   * are already looking at, which is exactly the "it didn't go anywhere"
   * complaint this whole pass exists to fix. A button that opens the panel is
   * the honest version.
   */
  bell?: boolean;
}

interface Coming {
  key: string;
  when: string;
  what: string;
  /** The conversation this meeting belongs to. */
  href: string;
  /**
   * The link to join, when it is an online meeting and one was given.
   *
   * ON THE DESK, not only inside the conversation. The desk is what somebody
   * looks at with two minutes to spare, and making them open the conversation
   * first to find the address is the errand this is meant to remove.
   */
  join?: string;
  /** Said when it is no longer on: called off, or declined. Then there is no join link. */
  off?: string;
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (days <= 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}

export function LiveDesk({ me, theme }: { me: Profile; theme: RoomTheme }) {
  const [items, setItems] = useState<DeskItem[]>([]);
  const [coming, setComing] = useState<Coming[]>([]);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    const leads = me.role === 'admin' || me.role === 'executive';
    const guide = me.role === 'dm';
    const next: DeskItem[] = [];

    // EVERY LOOKUP IS INDEPENDENT AND ALLOWED TO FAIL ALONE. A desk that goes
    // blank because one query was slow is worse than a desk missing one line.
    const [meetings, notes, prayers, pairs, members, reports, asks] = await Promise.all([
      live.myUpcomingMeetings(3).catch(() => []),
      live.listNotifications().catch(() => []),
      guide || leads ? live.listPrayerRequests().catch(() => []) : Promise.resolve([]),
      guide || leads ? live.listPairings().catch(() => []) : Promise.resolve([]),
      leads ? live.listMembers().catch(() => []) : Promise.resolve([]),
      leads ? live.listReports().catch(() => []) : Promise.resolve([]),
      leads ? live.listPairingRequests().catch(() => []) : Promise.resolve([]),
    ]);

    // A MEETING LINKS TO THE CONVERSATION IT IS IN. A date on a rail that
    // cannot be pressed makes somebody go looking for the person it is with,
    // and the looking is where things get dropped. A Guide lands on that
    // Explorer's page; an Explorer has one conversation, so they land on it.
    setComing(meetings.map((m) => ({
      key: m.id,
      when: whenLabel(m.starts_at),
      what: m.title?.trim() || 'A time together',
      href: guide ? `/dm/${m.pairing_id}` : '/ds',
      join: live.isStillOn(m) ? joinUrl(m.mode, m.location) ?? undefined : undefined,
      off: m.status === 'cancelled' ? 'Called off' : m.status === 'declined' ? 'Not this time' : undefined,
    })));

    const unread = notes.filter((n) => !n.read_at).length;
    if (unread > 0) {
      // The bell is in the header on every screen, so there is no page to
      // send somebody to. `?bell=1` opens it where they already are, which is
      // the honest version of "go and look at your notifications".
      next.push({ key: 'unread', label: 'Unread notifications', count: unread, href: '', bell: true });
    }

    if (guide || leads) {
      const waiting = prayers.filter((p) => p.status === 'open').length;
      if (waiting > 0) {
        next.push({
          key: 'prayer', label: 'Prayer requests waiting', count: waiting,
          // The card itself, not the top of the page it is on.
          href: guide ? '/dm#prayer' : '/admin?room=safeguarding', urgent: true,
        });
      }
    }

    if (guide) {
      const mine = pairs.filter((p) => p.status === 'active');
      next.push({ key: 'mine', label: 'People you walk with', count: mine.length, href: '/dm' });
    }

    if (leads) {
      const pending = members.filter((m) => !m.is_approved).length;
      if (pending > 0) {
        next.push({
          key: 'approvals', label: 'Waiting to be approved', count: pending,
          href: '/admin?room=approvals', urgent: true,
        });
      }

      const active = pairs.filter((p) => p.status === 'active');
      const unpaired = members.filter(
        (m) => m.role === 'ds' && m.is_approved && !active.some((p) => p.ds_id === m.id),
      ).length;
      if (unpaired > 0) {
        // THE ONE NUMBER THE WHOLE DESIGN TURNS ON. An Explorer with no Guide
        // has been invited into an app where nothing happens.
        next.push({
          key: 'unpaired', label: 'Waiting for a Guide', count: unpaired,
          href: '/admin?room=pairings', urgent: true,
        });
      }

      const open = reports.filter((r) => r.status === 'open').length;
      if (open > 0) {
        next.push({
          key: 'reports', label: 'Safeguarding reports open', count: open,
          href: '/admin?room=safeguarding', urgent: true,
        });
      }

      const pendingAsks = asks.filter((a) => a.status === 'pending').length;
      if (pendingAsks > 0) {
        next.push({
          key: 'asks', label: 'Guides asking to pair', count: pendingAsks,
          // `?room=` rather than `#`, now that the Office has subrooms: a hash
          // points at a card, and a card that is in a subroom nobody has opened
          // is not on the page to point at.
          href: '/office?room=people',
        });
      }
    }

    setItems(next);
    setReady(true);
  }, [me.role]);

  useEffect(() => {
    void load();
    // Slow on purpose. This is a rail panel, not a live feed; the bell polls
    // every minute and this only has to be right when somebody looks at it.
    const t = setInterval(() => void load(), 180_000);
    return () => clearInterval(t);
  }, [load]);

  // Three minutes is fine for a rail nobody is staring at, and far too slow for
  // the one moment somebody IS: a name approved on another screen, in front of
  // a room. The interval above stays as the floor for a dropped socket.
  useKeepUp(KEEP_UP_PEOPLE, load);

  const now = new Date();

  return (
    <div
      className="rounded-2xl p-4"
      style={{ backgroundColor: theme.panel, border: `1px solid ${theme.line}` }}
    >
      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: theme.inkSoft }}>
        On the desk
      </p>
      <p className="mt-0.5 text-sm font-bold" style={{ color: theme.ink }}>
        {now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>

      {/* COMING UP. Short by design: three at most, because a rail is not a
          calendar and a list of nine appointments is one nobody reads. */}
      {coming.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.inkSoft }}>
            Coming up
          </p>
          <div className="mt-1 space-y-1.5">
            {coming.map((c) => (
              /* SIBLINGS, NOT NESTED. An <a> inside a <Link> is an anchor
                 inside an anchor, which is invalid HTML and which browsers
                 resolve by guessing. The join link has to be its own element. */
              <div key={c.key} className="rounded-lg py-0.5">
                <Link href={c.href} className="block">
                  <p className="text-xs font-bold" style={{ color: theme.accent }}>{c.when}</p>
                  <p className="truncate text-sm underline underline-offset-2" style={{ color: theme.ink }}>
                    {c.what}
                  </p>
                  {c.off && <p className="text-xs font-semibold" style={{ color: theme.inkSoft }}>{c.off}</p>}
                </Link>
                {c.join && (
                  <a
                    href={c.join}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-meeting-join
                    className="mt-0.5 inline-block text-xs font-bold underline underline-offset-2"
                    style={{ color: theme.accent }}
                  >
                    {joinLabel(c.join)}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.inkSoft }}>
            Waiting for you
          </p>
          <div className="mt-1 space-y-1">
            {items.map((t) => {
              const inside = (
                <>
                  <span className="truncate text-sm underline underline-offset-2" style={{ color: theme.inkSoft }}>
                    {t.label}
                  </span>
                  <span
                    className="text-lg font-extrabold"
                    style={{ color: t.urgent ? theme.accent : theme.ink }}
                  >
                    {t.count}
                  </span>
                </>
              );
              const shape = 'flex w-full items-baseline justify-between gap-2 rounded-lg py-1 text-left';
              return t.bell ? (
                <button key={t.key} type="button" className={shape} onClick={openBell}>
                  {inside}
                </button>
              ) : (
                <Link key={t.key} href={t.href} className={shape}>
                  {inside}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* THE EMPTY STATE IS ONLY HONEST ONCE THE NUMBERS HAVE LOADED. Saying
          "nothing waiting" while three queries are still running is the same
          mistake as the hard-coded empty list this replaced. */}
      {ready && items.length === 0 && coming.length === 0 && (
        <p className="mt-3 text-sm" style={{ color: theme.inkSoft }}>
          Nothing waiting. A good place to be.
        </p>
      )}
      {!ready && (
        <p className="mt-3 text-sm" style={{ color: theme.inkSoft }}>
          Looking…
        </p>
      )}
    </div>
  );
}
