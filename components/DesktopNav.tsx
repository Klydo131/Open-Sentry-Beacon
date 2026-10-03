'use client';

// THE ROOMS, DOWN THE LEFT SIDE OF A COMPUTER SCREEN.
//
// Asked for on 3 October 2026, with a screenshot of a Guide's home on a wide
// screen: "This UI is not desktop friendly, can we make the desktop have it's
// own UI too". It began as a look of its own, Desktop, and the same day the
// owner made it Classic's: "this is the classic. I dont want the UI classic
// with the outdated version where the UI is still mobile in desktop". So it is
// drawn under every look, and shown from 1280px up, the width the desk already
// moves beside the page at; below that, `hidden`, a phone and a pad keep the
// bar along the bottom.
//
// THE SAME ROOMS AS THE MENU, FROM THE SAME LIST. railGroupsFor() is what the
// Menu draws for each role on both halves; drawing it again here means a room
// added to the Menu arrives in the sidebar without anybody remembering to.
// What it replaces on a computer, the bar along the bottom, is hidden by
// app/desktop-layout.css, which also turns the header into the top bar.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDemoRooms } from '@/components/AppShell';
import { railGroupsFor, type RailGroup } from '@/components/RoomRails';
import { useDemo } from '@/lib/demo/store';
import { useLiveSession } from '@/lib/live/session';
import { useIsLive } from '@/lib/tutorial';
import { APP_SHORT_NAME } from '@/lib/brand';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';

export function DesktopNav() {
  const live = useIsLive();
  return live ? <LiveRooms /> : <SampleRooms />;
}

function LiveRooms() {
  const { profile } = useLiveSession();
  if (!profile) return null;
  const leadsChurch = profile.role === 'admin' || profile.role === 'executive';
  return <Rooms groups={railGroupsFor(profile.role, {}, { mail: leadsChurch })} />;
}

function SampleRooms() {
  const { currentUser } = useDemo();
  const { groups } = useDemoRooms();
  if (!currentUser) return null;
  return <Rooms groups={groups} />;
}

/** Lit when this is the room, or a page inside it (one Explorer's page is /dm/<pairing>). */
function isHere(path: string, href: string): boolean {
  const clean = (path.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
  return clean === href || clean.startsWith(`${href}/`);
}

function Rooms({ groups }: { groups: RailGroup[] }) {
  const path = usePathname() || '/';
  // The logo goes where Home does, which is each role's own first room.
  const home = groups[0]?.links[0]?.href ?? '/church';
  return (
    <aside
      data-desktop-nav
      aria-label="Rooms"
      className="no-print fixed bottom-0 left-0 z-40 hidden w-60 flex-col overflow-y-auto bg-navy pb-[env(safe-area-inset-bottom,0px)] text-white xl:flex"
      // Below the sample church's purple strip when it is there, which says
      // its own height (components/TutorialBar.tsx); at the top otherwise.
      style={{ top: 'var(--beacon-chrome-top, 0px)' }}
    >
      {/* THE LOGO ROW IS THE TOP BAR'S HEIGHT (--desktop-top-bar, in
          app/desktop-layout.css), so the sidebar and the bar across the page
          share one line. Who you are is on the right of that bar, as on every
          computer app, so it is not repeated here. */}
      <Link
        href={home}
        aria-label={`${APP_SHORT_NAME} home`}
        className="flex shrink-0 items-center gap-3 border-b border-white/10 px-5"
        style={{ height: 'var(--desktop-top-bar, 4rem)' }}
      >
        <SentryBeaconMark size={32} />
        <span className="text-lg font-extrabold leading-tight">{APP_SHORT_NAME}</span>
      </Link>
      <nav aria-label="Rooms" className="flex-1 space-y-5 px-3 pb-6 pt-4">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-white/60">{group.title}</p>
            <ul className="space-y-0.5">
              {group.links.map((link) => {
                const here = isHere(path, link.href);
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={here ? 'page' : undefined}
                      title={link.beta ? `${link.label} (still being built)` : link.label}
                      className={`flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-[15px] ${
                        here ? 'bg-white/15 font-bold' : 'text-white/85 hover:bg-white/10'
                      }`}
                    >
                      <span aria-hidden className="w-6 text-center">{link.icon}</span>
                      <span className="min-w-0 flex-1 truncate">{link.label}</span>
                      {link.beta && <span className="rounded-full bg-gold/90 px-2 text-[11px] font-bold text-navy">Beta</span>}
                      {!!link.badge && (
                        <span className="rounded-full bg-white px-2 text-xs font-bold text-navy tabular-nums">{link.badge}</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
