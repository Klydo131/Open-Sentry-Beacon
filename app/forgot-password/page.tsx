'use client';

/**
 * /forgot-password -- ask for a link to choose a new password.
 *
 * Its own page, not a button on the sign-in page: reported on 26 October 2026,
 * people were confused to find a password being reset from the place they sign
 * in. The tutorial half of the app has no passwords, so a visitor there is sent
 * back to sign-in, which lets them pick a sample person.
 */

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIsLive } from '@/lib/tutorial';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { LiveForgotPasswordPage } from '@/components/live/PasswordPages';

export default function ForgotPasswordPage() {
  const live = useIsLive();
  const router = useRouter();

  useEffect(() => {
    if (!live) router.replace('/login');
  }, [live, router]);

  if (!live) return <BeaconSpinner inline label="Opening sign-in" />;
  return (
    <Suspense fallback={<BeaconSpinner inline label="Opening" />}>
      <LiveForgotPasswordPage />
    </Suspense>
  );
}
