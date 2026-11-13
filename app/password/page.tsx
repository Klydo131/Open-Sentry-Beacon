'use client';

/**
 * /password -- one address for the one task.
 *
 * REPORTED: (a bug report)
 *
 * LIVE ONLY, AND THAT IS NOT AN OVERSIGHT. The tutorial half of the app has no
 * accounts and no passwords -- its people are sample data in browser storage --
 * so there is nothing here for it to change. A demo visitor is sent to their
 * own settings rather than shown a form that could not do anything.
 */

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LiveAppShell } from '@/components/LiveAppShell';
import { LivePasswordPage } from '@/components/LiveAccountPages';
import { useIsLive } from '@/lib/tutorial';
import { BeaconSpinner } from '@/components/BeaconLoader';
import type { Role } from '@/lib/types';

// Executives included. Every one of these lists once omitted 'executive', and
// the shell then bounced a church director to the login screen on their own
// settings and their own profile. A new route is exactly where that returns.
const ALL: Role[] = ['executive', 'admin', 'dm', 'ds'];

export default function PasswordPage() {
  const live = useIsLive();
  const router = useRouter();

  useEffect(() => {
    if (!live) router.replace('/settings');
  }, [live, router]);

  if (!live) return <BeaconSpinner inline label="Opening settings" />;

  return (
    <LiveAppShell allow={ALL}>
      <LivePasswordPage />
    </LiveAppShell>
  );
}
