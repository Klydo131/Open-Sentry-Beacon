'use client';

import { useDemo } from '@/lib/demo/store';
import { hasAgreedToCurrent } from '@/lib/legal';
import { AgreementNotice } from './AgreementNotice';
import { ConsentNotice } from './ConsentNotice';

// Shows the privacy notice to a Digital Seeker who hasn't accepted it yet.
// Only seekers see it — they're the people whose faith journey the notice is
// about. Staff roles (admin, DM) are not interrupted.
//
// And, for everybody, the Terms of Use and Privacy Notice now in force
// (lib/legal.ts): anybody who has not agreed to these versions is asked
// before the app opens, as the live app asks (components/live/ConsentStep.tsx).
export function ConsentHost() {
  const { currentUser } = useDemo();
  if (!currentUser) return null;
  if (currentUser.role === 'ds' && !currentUser.consent_at) return <ConsentNotice />;
  if (!hasAgreedToCurrent(currentUser)) return <AgreementNotice />;
  return null;
}
