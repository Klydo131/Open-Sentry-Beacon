// The page's Trusted Types policy, first in <head> (lib/trusted-types.ts).

import { TRUSTED_TYPES_POLICY } from '@/lib/trusted-types';

export function TrustedTypesPolicy() {
  return <script dangerouslySetInnerHTML={{ __html: TRUSTED_TYPES_POLICY }} />;
}
