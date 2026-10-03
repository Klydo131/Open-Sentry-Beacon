'use client';

// THE DESKTOP LOOK'S ROOMS, DOWN THE LEFT SIDE OF A COMPUTER SCREEN.
//
// Asked for on 3 October 2026, with a screenshot of a Guide's home on a wide
// screen: "This UI is not desktop friendly, can we make the desktop have it's
// own UI too", in the same breath as "make sure the classic UI remains the
// same". So it is a look of its own (lib/ui-themes.ts), chosen in Settings:
// Classic is untouched and stays the default.
//
// RENDERS NOTHING UNLESS THE DESKTOP LOOK IS CHOSEN. Not hidden: absent. For
// everybody on Classic the page is the same element for element, which is the
// only honest way to promise that Classic did not change. When it is chosen it
// shows from 1280px up, the width the desk already moves beside the page at;
// below that a phone and a pad are exactly Classic, bottom bar and all.
//
// THE SAME ROOMS AS THE MENU, FROM THE SAME LIST. railGroupsFor() is what the
// Menu draws for each role on both halves; drawing it again here means a room
// added to the Menu arrives in the sidebar without anybody remembering to.
// What it replaces on a computer, the bar along the bottom, is hidden by
// app/themes/desktop.css, scoped to this look.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDemoRooms } from '@/components/AppShell';
import { railGroupsFor, type RailGroup } from '@/components/RoomRails';
import { useChosenLook } from '@/components/UiTheme';
import { DESKTOP } from '@/lib/ui-themes';
import { useDemo } from '@/lib/demo/store';
import { useLiveSession } from '@/lib/live/session';
import { useIsLive } from '@/lib/tutorial';
import { APP_SHORT_NAME, roleLabel } from '@/lib/brand';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';

export function DesktopNav() {
  const look = useChosenLook();
  const live = useIsLive();
  if (look !== DESKTOP) return null;
  return live ? <LiveRooms /> : <SampleRooms />;
}

function LiveRooms() {
  const { profile } = useLiveSession();
  if (!profile) return null;
  const leadsChurch = profile.role === 'admin' || profile.role === 'executive';
  return (
    <Rooms
      name={profile.full_name || 'Member'}
      role={roleLabel(profile.role, profile.role) ?? ''}
      groups={railGroupsFor(profile.role, {}, { mail: leadsChurch })}
    />
  );
}

function SampleRooms() {
  const { currentUser } = useDemo();
  const { groups } = useDemoRooms();
  if (!currentUser) return null;
  return <Rooms name={currentUser.full_name} role={roleLabel(currentUser.role, currentUser.role) ?? ''} groups={groups} />;
}

/** Lit when this is the room, or a page inside it (one Explorer's page is /dm/<pairing>). */
function isHere(path: string, href: string): boolean {
  const clean = (path.split(/[?#]/)[0] || '/').replace(/\/+$/, '') || '/';
  return clean === href || clean.startsWith(`${href}/`);
}

function Rooms({ name, role, groups }: { name: string; role: string; groups: RailGroup[] }) {
  const path = usePathname() || '/';
  return (
    <aside
      data-desktop-nav
      aria-label="Rooms"
      className="no-print fixed bottom-0 left-0 z-40 hidden w-60 flex-col overflow-y-auto bg-navy pb-[env(safe-area-inset-bottom,0px)] text-white xl:flex"
      // Below the sample church's purple strip when it is there, which says
      // its own height (components/TutorialBar.tsx); at the top otherwise.
      style={{ top: 'var(--beacon-chrome-top, 0px)' }}
    >
      <Link href="/church" className="flex items-center gap-3 px-5 pb-4 pt-5">
        <SentryBeaconMark size={32} />
        <span className="text-lg font-extrabold leading-tight">{APP_SHORT_NAME}</span>
      </Link>
      <p className="px-5 pb-4 text-sm leading-tight">
        <span className="block font-semibold">{name}</span>
        <span className="text-white/70">{role}</span>
      </p>
      <nav aria-label="Rooms" className="flex-1 space-y-5 px-3 pb-6">
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
