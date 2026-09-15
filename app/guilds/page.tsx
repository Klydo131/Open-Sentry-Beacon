'use client';

// The Guild Room, archived.
//
// "Take out the Guild Room feature, archive it for now since most users dont
// like it."
//
// THE ROUTE STAYS AND SAYS SO. Deleting it would turn every link that already
// points here -- a notification somebody has not opened, a message where a
// Director wrote "see the Guild Room", a bookmark on a phone -- into a
// not-found page, which reads as the app being broken rather than as a room
// being put away. A person who arrives here should be told what happened in a
// sentence, not left guessing.
//
// NOTHING BEHIND IT WAS REMOVED. The guilds, the posts and the amens are all
// still in the database, `list_guild_activity` still redacts names exactly as
// it always has, and a reported post can still be taken down from
// safeguarding -- which matters, because a report about something said in this
// room has to outlive the room. Bringing it back is restoring the navigation
// entries named in components/LiveAppShell.tsx.

import { AppShell } from '@/components/AppShell';
import { LiveAppShell } from '@/components/LiveAppShell';
import { Card } from '@/components/ui';
import { useIsLive } from '@/lib/tutorial';
import type { Role } from '@/lib/types';

const MEMBERS: Role[] = ['dm', 'ds'];

function Archived() {
  return (
    <Card className="p-6 text-center">
      <h1 className="text-2xl font-extrabold text-navy">🧩 The Guild Room is closed</h1>
      <p className="mx-auto mt-2 max-w-prose text-gray-600">
        This room has been put away for now. Nothing posted in it has been
        deleted, and if it opens again everything will be where it was.
      </p>
      <p className="mx-auto mt-3 max-w-prose text-sm text-gray-500">
        If something happened in this room that you need to raise, you can still
        do that. Reporting it does not depend on the room being open.
      </p>
    </Card>
  );
}

export default function GuildsPage() {
  if (useIsLive()) {
    return <LiveAppShell allow={MEMBERS}><Archived /></LiveAppShell>;
  }
  return <AppShell allow={MEMBERS}><Archived /></AppShell>;
}
