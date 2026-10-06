// Puts this device's look on <html> before the first frame
// (lib/look-before-paint.ts says why). Rendered in <head> by app/layout.tsx,
// so it runs before <body> exists, and nothing is drawn before that.

import { LOOK_BEFORE_PAINT } from '@/lib/look-before-paint';

export function LookBeforePaint() {
  return <script dangerouslySetInnerHTML={{ __html: LOOK_BEFORE_PAINT }} />;
}
