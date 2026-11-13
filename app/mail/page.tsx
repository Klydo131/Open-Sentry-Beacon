'use client';

import { AppShell } from '@/components/AppShell';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LiveMailPage } from '@/components/LiveChurchPages';
import { useIsLive } from '@/lib/tutorial';
import { Mailbox } from '@/components/Mailbox';

// Mail is open to every role: an admin reads what the app sends and decides on
// recommendations; a missionary writes them; a seeker can see
// the welcome they were sent. The simulation is only useful if everyone can
// stand in it.
export default function MailPage() {
  if (useIsLive()) {
    return (
      <LiveAppShell allow={['executive', 'admin', 'dm', 'ds']}>
        <LiveMailPage />
      </LiveAppShell>
    );
  }
  return (
    <AppShell allow={['executive', 'admin', 'dm', 'ds']}>
      <div className="space-y-5">
        <div>
          <h1 className="text-3xl font-extrabold text-navy">Mail</h1>
          <p className="text-gray-500">
            What Beacon sends, and what it would send you.
          </p>
        </div>
        <Mailbox />
      </div>
    </AppShell>
  );
}
