'use client';

// Admin Reports, in a room of its own.
//
// Until 27 October 2026 this address was the court room. Asked for that day:
// "Admin reports will just be admin reports by now, not a court room." So it is
// the list of reports and one conversation about each
// (components/LiveAdminReports.tsx), the same list Settings shows under Admin
// Reports, at an address that can be linked to and come back to.
//
// EVERY ROLE HAS IT. A Guide or an Explorer who raised a report, or who has
// been brought into the conversation about one, reaches it here as much as a
// Director does; narrowing the route to leadership would turn their link into
// a refusal.

import { AppShell } from '@/components/AppShell';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LiveAdminReports } from '@/components/LiveAdminReports';
import { useLiveSession } from '@/lib/live/session';
import { useIsLive } from '@/lib/tutorial';
import { Card } from '@/components/ui';
import type { Role } from '@/lib/types';

const ALL: Role[] = ['executive', 'admin', 'dm', 'ds'];

function Heading({ role }: { role?: Role }) {
  const leads = role === 'admin' || role === 'executive';
  return (
    <div>
      <h1 className="text-3xl font-extrabold text-room">Admin Reports</h1>
      <p className="mt-1 text-room-soft">
        {leads
          ? 'Reports from your church, and a conversation about each one.'
          : 'Anything you have reported, and any conversation a Director has asked you into.'}
      </p>
    </div>
  );
}

function Live() {
  const { profile } = useLiveSession();
  if (!profile) return null;
  return (
    <div className="space-y-5">
      <Heading role={profile.role} />
      <LiveAdminReports me={profile.id} />
    </div>
  );
}

/**
 * The tutorial has no reports of its own: a report is about a real person, and
 * the sample people have none. It says plainly what the room is for instead.
 */
function Demo() {
  return (
    <div className="space-y-5">
      <Heading />
      <Card className="p-6 text-center">
        <p className="text-lg font-bold text-navy">Nothing to show in the tutorial</p>
        <p className="mt-1 text-sm text-gray-500">
          A report is about a real person, so there is none among the sample
          people. On the live app, anything you report appears here, and you
          can talk about it with the Director who picks it up.
        </p>
      </Card>
    </div>
  );
}

export default function CasesPage() {
  if (useIsLive()) {
    return <LiveAppShell allow={ALL}><Live /></LiveAppShell>;
  }
  return <AppShell allow={ALL}><Demo /></AppShell>;
}
