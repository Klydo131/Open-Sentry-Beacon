'use client';

// Leave to answer (components/court/AnswerRoom.tsx): where a suspended member
// whom the judge let in lands after signing in, and the only screen that
// account can use. Deliberately outside the app's shell, which asks the
// database for things the account is not allowed to read.

import Link from 'next/link';
import { useIsLive } from '@/lib/tutorial';
import { AnswerRoom } from '@/components/court/AnswerRoom';
import { NAVY, APP_SHORT_NAME } from '@/lib/brand';

export default function AnswerPage() {
  const live = useIsLive();
  return (
    <div className="min-h-screen bg-[#f4ecdc]">
      <div className="px-4 py-4 text-white" style={{ backgroundColor: NAVY }}>
        <p className="mx-auto max-w-5xl font-bold">{APP_SHORT_NAME} &middot; The court room</p>
      </div>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {live ? <AnswerRoom /> : (
          <div className="rounded-2xl bg-white p-5 ring-1 ring-[#e2d6bb]">
            <h1 className="text-xl font-bold text-navy">Leave to answer</h1>
            <p className="mt-2 text-gray-700">
              In a church&rsquo;s own app, this is where a suspended member lands when the judge of their case lets
              them sign in to answer it. Only the court room opens for them. There is no case to answer in this
              sample.
            </p>
            <Link href="/" className="mt-3 inline-block font-semibold text-navy underline underline-offset-4">Home</Link>
          </div>
        )}
      </main>
    </div>
  );
}
