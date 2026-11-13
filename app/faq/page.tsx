// Questions people ask, for anybody: no sign-in needed.
//
// Linked from the front door and both sign-in screens, so somebody holding an
// invitation can find out what they are joining before they join, and from the
// privacy notice. The same answers are in Settings, Help, for people already
// inside (components/Faq.tsx draws them; lib/faq.ts holds them).
//
// A server component, so the page has a title of its own in a tab or a shared
// link; only the search box and the answers are drawn in the browser.

import type { Metadata } from 'next';
import Link from 'next/link';
import { NAVY, APP_NAME, APP_SHORT_NAME } from '@/lib/brand';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { Faq } from '@/components/Faq';

export const metadata: Metadata = {
  title: `Questions people ask · ${APP_NAME}`,
};

export default function FaqPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto flex max-w-2xl flex-col items-center">
          <SentryBeaconMark size={48} />
          <h1 className="mt-3 text-3xl font-extrabold">Questions people ask</h1>
          <p className="mt-1 text-white/75">
            What {APP_NAME} is, who can see what, and how to find your way around.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <Faq />

        <div className="flex flex-col items-center gap-3 pb-10 text-center">
          <Link href="/privacy" className="font-semibold text-navy underline underline-offset-4">
            The full privacy notice
          </Link>
          <Link href="/terms" className="font-semibold text-navy underline underline-offset-4">
            Terms of Use
          </Link>
          <Link href="/" className="font-semibold text-navy underline underline-offset-4">
            ← Back to {APP_SHORT_NAME}
          </Link>
        </div>
      </div>
    </div>
  );
}
