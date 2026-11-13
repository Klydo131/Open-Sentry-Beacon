'use client';

// The sample app's agreement step: the Terms of Use and Privacy Notice now in
// force, agreed to before the app opens (lib/legal.ts).
//
// The live app asks the same question in components/live/ConsentStep.tsx. In
// the sample, everybody seeded has agreed already, and somebody who joins
// agrees on the join form; this meets a person whose saved sample predates the
// current documents, or anybody when a version is raised, so the walkthrough
// shows what members will see.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useDemo } from '@/lib/demo/store';
import { NAVY } from '@/lib/brand';
import { AgreementBox } from '@/components/AgreementBox';
import { WHAT_CHANGED, agreedToEarlier } from '@/lib/legal';

export function AgreementNotice() {
  const { currentUser, agreeToCurrentTerms, signOut } = useDemo();
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const before = agreedToEarlier(currentUser);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-3 sm:items-center" data-agreement-step>
      <div className="overlay-sheet-tall w-full max-w-lg overflow-y-auto rounded-2xl solid-panel bg-white lift-3">
        <div className="p-6 text-white" style={{ backgroundColor: NAVY }}>
          <h1 className="text-2xl font-extrabold">{before ? 'We have updated our terms' : 'Before you go on'}</h1>
          <p className="text-white/75">
            {before
              ? 'Please read what changed and agree to continue.'
              : 'Please read and agree to the Terms of Use and the Privacy Notice to continue.'}
          </p>
        </div>
        <div className="space-y-4 p-6">
          {before && (
            <ul className="list-disc space-y-1 rounded-xl bg-gray-50 p-4 pl-8 text-sm text-gray-700" data-what-changed>
              {WHAT_CHANGED.map((line) => <li key={line}>{line}</li>)}
            </ul>
          )}
          <AgreementBox checked={agreed} onChange={setAgreed} />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={agreeToCurrentTerms}
              disabled={!agreed}
              className="tap w-full rounded-xl px-5 text-lg font-bold text-white disabled:opacity-50"
              style={{ backgroundColor: NAVY }}
              data-agreement-continue
            >
              I agree, continue
            </button>
            <button
              type="button"
              onClick={() => { signOut(); router.replace('/login'); }}
              className="tap w-full rounded-xl bg-gray-100 px-5 text-base font-semibold text-gray-700"
            >
              I do not agree, sign me out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
