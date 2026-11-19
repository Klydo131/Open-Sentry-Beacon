'use client';

// The privacy notice for members under 18.
//
// ---------------------------------------------------------------------------
// WHY IT IS ITS OWN PAGE. The National Privacy Commission's Guidelines on
// Child-Oriented Transparency (No. 2024-03, 17 December 2024) ask for a notice
// a child can follow, written for the age of the children likely to read it,
// and say that one notice for adults and children is not enough. This app
// walks with young people whose parent or guardian has agreed, so they get
// their own page. Asked for on 19 November 2026.
//
// WHO IT IS WRITTEN FOR: somebody about twelve to seventeen. Short sentences,
// everyday words, "you" and "we", and no section numbers. Every fact here is
// also in /privacy, which stays the full notice; if one of them changes, change
// both (tests/the-law-is-written-plainly.mjs checks that each promise here has
// its match there).
//
// It is not legal advice.
// ---------------------------------------------------------------------------

import Link from 'next/link';
import { NAVY, APP_SHORT_NAME } from '@/lib/brand';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { Card } from '@/components/ui';
import { ChurchLegalLine, useChurchLegal } from '@/components/ChurchLegal';
import { LEGAL_EFFECTIVE, PRIVACY_VERSION } from '@/lib/legal';

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">{title}</h2>
      <div className="mt-2 space-y-2 text-lg leading-relaxed text-gray-700">{children}</div>
    </Card>
  );
}

export default function YoungPrivacyPage() {
  const { church, loading } = useChurchLegal();
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto flex max-w-2xl flex-col items-center">
          <SentryBeaconMark size={48} />
          <h1 className="mt-3 text-3xl font-extrabold">Your information, if you are under 18</h1>
          <p className="mt-1 text-white/75">What we keep about you, who sees it, and what you can do.</p>
          <p className="mt-2 text-sm text-white/60" data-legal-version>
            In force from <span className="whitespace-nowrap">{LEGAL_EFFECTIVE}</span> ·{' '}
            <span className="whitespace-nowrap">version {PRIVACY_VERSION}</span>
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-5 px-4 py-8" data-young-notice>
        <Part title="Your parent or guardian says yes first">
          <p>
            Before a Guide walks with you, your parent or guardian has to agree. Your church
            writes down that they did, and when.
          </p>
        </Part>

        <Part title="What we keep">
          <p>
            Your name and email address. Your birthday, so we know you are under 18. What you
            write to your Guide, and anything you post.
          </p>
          <p>
            Some of this is private in a special way, because it shows that you take part in
            a church. That is why your church has to look after it more carefully than most
            information.
          </p>
        </Part>

        <Part title="Who can see it">
          <p>
            <strong>You and your Guide</strong> can read your conversation. Nobody else in the
            app can, not even the church&rsquo;s leaders.
          </p>
          <p>
            The one exception: if somebody reports a problem, the leaders who handle the
            report can read what the report is about. That is how they keep you safe.
          </p>
          <p>
            Nobody outside your church can see anything about you. Nothing about you is shown
            to the public or found by a search engine.
          </p>
        </Part>

        <Part title="What we never do">
          <p>
            We never sell your information. We never use it for ads. No computer decides
            anything about you on its own: people do.
          </p>
        </Part>

        <Part title="Where it is kept">
          <p>
            On computers run by a company called Supabase, in South Korea. Your church is still
            responsible for it there.
          </p>
          <p>
            When you send a photo, the app takes out the hidden information that says where it
            was taken.
          </p>
        </Part>

        <Part title="What you can do">
          <ul className="list-disc space-y-1 pl-5">
            <li>Ask to see what we keep about you.</li>
            <li>Ask us to fix anything that is wrong.</li>
            <li>Ask us to delete your account.</li>
            <li>Change your mind about using the app, at any time.</li>
          </ul>
          <p>
            You will not get in trouble for asking. You can ask yourself, or ask your parent,
            your guardian or another adult you trust to ask for you.
          </p>
          <p>
            <ChurchLegalLine church={church} loading={loading} />
          </p>
        </Part>

        <Part title="If something feels wrong">
          <p>
            If somebody makes you feel unsafe or uncomfortable, report it from the
            conversation where it happened, and tell an adult you trust. A leader is told
            straight away.
          </p>
          <p>
            One thing is kept even if your account is deleted: a report about keeping someone
            safe. That is so the church can always show what it did to help.
          </p>
        </Part>

        <div className="flex flex-col items-center gap-3 pb-10 text-center">
          <Link href="/privacy" className="font-semibold text-navy underline underline-offset-4" data-full-notice-link>
            The full Privacy Notice, for adults
          </Link>
          <Link href="/policy" className="font-semibold text-navy underline underline-offset-4">
            How we keep people safe
          </Link>
          <Link href="/" className="font-semibold text-navy underline underline-offset-4">
            ← Back to {APP_SHORT_NAME}
          </Link>
        </div>
      </div>
    </div>
  );
}
