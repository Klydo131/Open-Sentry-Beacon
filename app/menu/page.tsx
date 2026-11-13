'use client';

// The Menu tab. Every room this person has, written out, and the way out.
//
// Opened from the bottom bar on a phone or a pad (components/TabBar.tsx). It is
// a page rather than a panel over the page for the reason a messaging app makes
// it a tab: it IS a place you go, the phone's own Back leaves it, and the bar
// stays on screen with Menu lit so you can see where you are. It works at every
// width; a desktop simply has the rail and rarely needs it.
//
// Both halves draw the same list from the same function, railGroupsFor(), so a
// room is in the Menu for exactly the people whose rail has it.

import { useRouter } from 'next/navigation';
import { AppShell, useDemoRooms } from '@/components/AppShell';
import { LiveAppShell } from '@/components/LiveAppShell';
import { MenuList } from '@/components/MenuList';
import { PowerGlyph } from '@/components/Glyph';
import { railGroupsFor } from '@/components/RoomRails';
import { useDemo } from '@/lib/demo/store';
import { useLiveSession } from '@/lib/live/session';
import { useIsLive } from '@/lib/tutorial';
import { roleLabel } from '@/lib/brand';
import type { Role } from '@/lib/types';

const ALL: Role[] = ['executive', 'admin', 'dm', 'ds'];

function Live() {
  const { profile, signOut } = useLiveSession();
  const router = useRouter();
  if (!profile) return null;
  // The same arguments the live shell gives its rail: no counts (the bell and
  // the chat bubble carry those), and Mail only for the people it is for.
  const leadsChurch = profile.role === 'admin' || profile.role === 'executive';
  const groups = railGroupsFor(profile.role, {}, { mail: leadsChurch });
  return (
    <MenuList
      name={profile.full_name || 'Member'}
      role={roleLabel(profile.role, profile.role)}
      groups={groups}
      footer={
        <li>
          <button
            type="button"
            className="menu-row text-[#b42318]"
            onClick={async () => {
              await signOut();
              router.replace('/login');
            }}
          >
            <span className="menu-icon" aria-hidden>
              <PowerGlyph size={18} />
            </span>
            <span className="flex-1">Sign out</span>
          </button>
        </li>
      }
    />
  );
}

function Demo() {
  const { currentUser, signOut } = useDemo();
  const { groups } = useDemoRooms();
  const router = useRouter();
  if (!currentUser) return null;
  return (
    <MenuList
      name={currentUser.full_name}
      role={roleLabel(currentUser.role, currentUser.role)}
      photo={currentUser.photo}
      avatar={currentUser.avatar}
      groups={groups}
      footer={
        <li>
          {/* The sample side's way out. Nothing is signed out of anywhere real:
              it goes back to the list of sample people to choose another. */}
          <button
            type="button"
            className="menu-row"
            onClick={() => {
              signOut();
              router.replace('/login');
            }}
          >
            <span className="menu-icon" aria-hidden>⇄</span>
            <span className="flex-1">Switch account</span>
          </button>
        </li>
      }
    />
  );
}

export default function MenuPage() {
  if (useIsLive()) {
    return <LiveAppShell allow={ALL}><Live /></LiveAppShell>;
  }
  return <AppShell allow={ALL}><Demo /></AppShell>;
}
