'use client';

// The top of Home on both halves: a greeting by name, the church, and the
// places a person goes most, including the web apps in their own pocket.
// Reads no church data: each half hands it the name and the counts.

import Link from 'next/link';
import { NavIcon } from '@/components/NavLineIcon';
import { useCallback, useEffect, useState } from 'react';
import * as live from '@/lib/live/data';
import { useKeepUp, KEEP_UP_POCKET } from '@/lib/live/keep-up';
import { pocketWithStarters } from '@/lib/pocket';
import { useIsLive } from '@/lib/tutorial';
import { NAVY } from '@/lib/brand';

function greetingAt(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const ROOMS = [
  { href: '/sabbath', label: 'This Sabbath', icon: '📅' },
  { href: '/study', label: 'Study Room', icon: '📖' },
];

const pill = 'lift-hover inline-flex min-w-0 min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap sm:justify-start sm:gap-2 rounded-full bg-white/15 px-2.5 sm:px-4 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/25';

export function HomeWelcome({ name, churchName, children }: {
  /** The person's full name; the greeting uses the first word of it. */
  name?: string | null;
  churchName?: string | null;
  /** The church's counts, drawn under the greeting. */
  children?: React.ReactNode;
}) {
  const isLive = useIsLive();
  // The hour and the pocket are this device's, so they wait for the browser:
  // the server's first draw says "Welcome" and lists the rooms only.
  const [greeting, setGreeting] = useState('Welcome');
  const [apps, setApps] = useState<{ id: string; url: string; label: string }[]>([]);
  useEffect(() => { setGreeting(greetingAt(new Date().getHours())); }, []);
  const loadApps = useCallback(async () => {
    if (!isLive) { setApps(pocketWithStarters().slice(0, 4)); return; }
    try {
      setApps((await live.myPocket()).slice(0, 4));
    } catch { /* Home still opens without the pocket. */ }
  }, [isLive]);
  useEffect(() => { void loadApps(); }, [loadApps]);
  // An app saved in the pocket on another device shows here without a reload.
  useKeepUp(KEEP_UP_POCKET, loadApps);

  const first = name?.trim().split(/\s+/)[0];

  return (
    <div
      data-church-masthead
      className="overflow-hidden rounded-2xl p-5 text-white sm:p-6"
      style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #2b3d6b 100%)` }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-white/70 sm:text-sm" data-home-church>
        {churchName || 'Our church'}
      </p>
      <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl" data-home-greeting>
        {greeting}{first ? `, ${first}` : ''}
      </h1>
      {/* On a phone the billboard has to start on the first screen, so the line waits for a wider one. */}
      <p className="mt-1 hidden text-white/80 sm:block">Your church. Your community. The mission we share.</p>

      {/* No sideways scroll (13 November 2026, a screenshot of "Study Roo" cut off
          at the card's edge): two even columns on a phone, a wrapping row from
          the small-tablet width up. Every link is whole at every width. */}
      <nav aria-label="Go straight to" className="mt-2 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap" data-home-quick>
        {ROOMS.map((room) => (
          <Link key={room.href} href={room.href} className={pill}>
            <NavIcon href={room.href} emoji={room.icon} />{room.label}
          </Link>
        ))}
        {apps.map((app) => (
          <a key={app.id} href={app.url} target="_blank" rel="noopener noreferrer" className={pill} data-home-app>
            <NavIcon href="app" emoji="🧰" />{app.label}
          </a>
        ))}
      </nav>

      {children}
    </div>
  );
}
