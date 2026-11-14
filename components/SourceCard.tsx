'use client';

// Where this app's source code is — offered from inside the app, on purpose.
//
// A courtesy, not an obligation: the MIT License does not require it. Most
// people who use this app never see the signed-out front page again after
// their first visit, so the link to the code lives here too.
//
// IF YOU FORK THIS AND CHANGE ANYTHING, CHANGE SOURCE_URL in lib/brand.ts to
// point at your own repository, or your congregation is told "here is the code
// you are running" and shown somebody else's.

import Link from 'next/link';
import { APP_SHORT_NAME, SOURCE_URL } from '@/lib/brand';
import { Card } from '@/components/ui';

export function SourceCard() {
  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">📖 This app is free software</h2>
      <p className="mt-1 text-sm text-gray-600">
        {APP_SHORT_NAME} is open source under the MIT License. You are welcome to
        read it, run it for your own church, and change it.
      </p>
      {/* The conduct policy sits here rather than only in the report dialog.
          Somebody deciding whether to report needs to read it BEFORE they are
          upset, and the only place they will find it then is Settings. */}
      <div className="mt-4 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-200">
        <Link href="/policy" className="font-semibold text-navy underline underline-offset-4">
          How we treat each other →
        </Link>
        <p className="mt-1 text-sm text-gray-600">
          What is expected of everyone here, how to report something that is
          wrong, and what happens next.
        </p>
      </div>
      {/* BESIDE THE CONDUCT POLICY, not buried in a footer. What is collected
          and who can see it is the other half of the same question somebody is
          asking when they open this card, and a privacy notice nobody can find
          is the same as not having one. */}
      <div className="mt-3 rounded-xl bg-gray-50 p-3 ring-1 ring-gray-200">
        <Link href="/privacy" className="font-semibold text-navy underline underline-offset-4">
          What we do with what you tell us →
        </Link>
        <p className="mt-1 text-sm text-gray-600">
          What is collected, who can see it, how long it is kept, and how to ask
          for a copy or ask for it to be deleted.
        </p>
        <Link href="/terms" className="mt-2 inline-block font-semibold text-navy underline underline-offset-4">
          Terms of Use →
        </Link>
        <p className="mt-1 text-sm text-gray-600">
          What you and your church can expect of each other here.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="tap inline-flex items-center rounded-xl bg-gray-100 px-4 font-semibold text-navy hover:bg-gray-200"
        >
          View the source code ↗
        </a>
        <a
          href={`${SOURCE_URL}/blob/main/LICENSE`}
          target="_blank"
          rel="noopener noreferrer"
          className="tap inline-flex items-center rounded-xl px-4 font-semibold text-navy underline underline-offset-4"
        >
          Read the licence ↗
        </a>
        {/* THE OTHER PEOPLE'S CODE INSIDE THIS APP, with their licences. Most of
            them ask that their notice go with every copy, and a copy is what
            every browser that opens this app receives. Written at each build
            by scripts/third-party-notices.mjs. */}
        <a
          href="/third-party-notices.txt"
          target="_blank"
          rel="noopener"
          className="tap inline-flex items-center rounded-xl px-4 font-semibold text-navy underline underline-offset-4"
          data-third-party-notices
        >
          Code from other projects ↗
        </a>
      </div>
    </Card>
  );
}
