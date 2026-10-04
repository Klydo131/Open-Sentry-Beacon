'use client';

// The Music room (4 October 2026), for every role on both halves of the app.
// The room itself is components/music/MusicRoom.tsx; this page only puts it in
// the right shell. Nothing in the room reads or writes the church's database,
// so the two halves draw exactly the same thing.

import { AppShell } from '@/components/AppShell';
import { LiveAppShell } from '@/components/LiveAppShell';
import { MusicRoom } from '@/components/music/MusicRoom';
import { useIsLive } from '@/lib/tutorial';
import { useLiveSession } from '@/lib/live/session';
import { useDemo } from '@/lib/demo/store';
import { useRoom } from '@/lib/room-theme';
import type { Role } from '@/lib/types';

const EVERYONE: Role[] = ['executive', 'admin', 'dm', 'ds'];

function LiveMusic() {
  const { profile } = useLiveSession();
  const { theme } = useRoom(profile?.id ?? null, profile?.role ?? 'ds');
  return <LiveAppShell allow={EVERYONE}><MusicRoom theme={theme} /></LiveAppShell>;
}

function DemoMusic() {
  const { currentUser } = useDemo();
  const { theme } = useRoom(currentUser?.id ?? null, currentUser?.role ?? 'ds');
  return <AppShell allow={EVERYONE}><MusicRoom theme={theme} /></AppShell>;
}

export default function MusicPage() {
  if (useIsLive()) return <LiveMusic />;
  return <DemoMusic />;
}
