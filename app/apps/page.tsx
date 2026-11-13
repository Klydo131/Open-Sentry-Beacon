'use client';

// The Apps room, retired in favour of the pocket.
//
// THE ROUTE STAYS, for the same reason the Guild Room's does: links already
// point here, and a not-found page reads as a broken app rather than a room
// that was replaced. Anything a Director added is still in `church_apps`; the
// table was not dropped.

import { AppShell } from '@/components/AppShell';
import { LiveAppShell } from '@/components/LiveAppShell';
import { Card } from '@/components/ui';
import { useIsLive } from '@/lib/tutorial';
import type { Role } from '@/lib/types';

const ALL: Role[] = ['executive', 'admin', 'dm', 'ds'];

function Moved() {
  return (
    <Card className="p-6 text-center">
      <h1 className="text-2xl font-extrabold text-navy">📱 This room has moved</h1>
      <p className="mx-auto mt-2 max-w-prose text-gray-600">
        The apps you use are now in your pocket, on the right of any room, just
        above the player. Paste a web address once and it waits there for you.
      </p>
      <p className="mx-auto mt-3 max-w-prose text-sm text-gray-500">
        Your pocket is yours alone. Nobody else in the church sees what is in it.
      </p>
    </Card>
  );
}

export default function AppsPage() {
  if (useIsLive()) {
    return <LiveAppShell allow={ALL}><Moved /></LiveAppShell>;
  }
  return <AppShell allow={ALL}><Moved /></AppShell>;
}
