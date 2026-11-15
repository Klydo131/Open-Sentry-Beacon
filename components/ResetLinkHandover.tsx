// Sends a password-reset link that landed on the wrong page to /new-password
// (lib/reset-link-handover.ts says why). Rendered in <head> by app/layout.tsx.

import { RESET_LINK_HANDOVER } from '@/lib/reset-link-handover';

export function ResetLinkHandover() {
  return <script dangerouslySetInnerHTML={{ __html: RESET_LINK_HANDOVER }} />;
}
