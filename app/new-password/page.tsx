'use client';

/**
 * /new-password -- where the link in a password e-mail opens.
 *
 * It redeems the link, asks for the new password (and, for an account with an
 * authenticator app, its code), and says it is done. The invitation page
 * forwards any reset link here, so an older e-mail still lands in the right
 * place. The tutorial half of the app has no passwords, so a visitor there is
 * sent back to sign-in.
 */

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useIsLive } from '@/lib/tutorial';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { LiveNewPasswordPage } from '@/components/live/PasswordPages';

export default function NewPasswordPage() {
  const live = useIsLive();
  const router = useRouter();

  useEffect(() => {
    if (!live) router.replace('/login');
  }, [live, router]);

  if (!live) return <BeaconSpinner inline label="Opening sign-in" />;
  return (
    <Suspense fallback={<BeaconSpinner inline label="Opening" />}>
      <LiveNewPasswordPage />
    </Suspense>
  );
}
