import type { MetadataRoute } from 'next';
import { INDEXABLE } from '@/lib/site-visibility';

// One of the three places search visibility is decided — the other two are the
// `robots` metadata in app/layout.tsx and the X-Robots-Tag header in
// next.config.mjs. All three now read the same switch, so they cannot disagree
// with each other. See lib/site-visibility.ts for why the default is "no" and
// which deployment should say yes.
export default function robots(): MetadataRoute.Robots {
  return INDEXABLE
    ? { rules: [{ userAgent: '*', allow: '/' }] }
    : { rules: [{ userAgent: '*', disallow: '/' }] };
}
