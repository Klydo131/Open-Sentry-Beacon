'use client';

// Terms of Use: what you and your church can expect of each other here.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 28 October 2026: "update our UI for agreeing on 'Terms' and
// 'Privacy Policy'. I want all of those to be handled professionally so that
// we won't face any legalities in the future." The app had a privacy notice
// and a safeguarding policy, and no terms at all.
//
// WRITTEN TO BE READ, like the two pages beside it: short sentences, no clause
// numbers, the parts people need (how to report, how to leave) near the top.
// The audience is somebody invited by a person they trust, deciding whether to
// join, and often a parent reading on a child's behalf.
//
// OUR OWN WORDS, for a church in the Philippines, not adapted from any other
// service's terms. The church named is the one in the link or the reader's own
// (components/ChurchLegal.tsx), never a name written into this public source.
//
// THE VERSION IS lib/legal.ts TERMS_VERSION. Change these terms and raise it:
// everybody is asked to agree again, with what changed, before the app opens.
//
// It is not legal advice. It is a starting draft for a lawyer to correct.
// ---------------------------------------------------------------------------

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { NAVY, APP_NAME, APP_SHORT_NAME, SOURCE_URL } from '@/lib/brand';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { Card } from '@/components/ui';
import { ChurchLegalLine, useChurchLegal } from '@/components/ChurchLegal';
import { LEGAL_EFFECTIVE, TERMS_VERSION, legalComplete } from '@/lib/legal';

// Each section is a link target (/terms#leaving), so a reply to a question can
// point at the paragraph that answers it.
function Section({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} data-terms-section={id}>
      <Card className="p-5">
        <h2 id={`${id}-title`} className="text-xl font-bold text-navy">{title}</h2>
        <div className="mt-2 space-y-2 text-gray-700">{children}</div>
      </Card>
    </section>
  );
}

export default function TermsPage() {
  const { church, loading } = useChurchLegal();
  // The church in the link travels on to the Privacy Notice, read after the
  // page has loaded so the server's page and the browser's agree.
  const [churchQuery, setChurchQuery] = useState('');
  useEffect(() => {
    const named = new URLSearchParams(window.location.search).get('church');
    if (named) setChurchQuery(`?church=${encodeURIComponent(named)}`);
  }, []);
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto flex max-w-2xl flex-col items-center">
          <SentryBeaconMark size={48} />
          <h1 className="mt-3 text-3xl font-extrabold">Terms of Use</h1>
          <p className="mt-1 text-white/75">
            What you and your church can expect of each other in {APP_SHORT_NAME}.
          </p>
          <p className="mt-2 text-sm text-white/60" data-legal-version>
            In force from <span className="whitespace-nowrap">{LEGAL_EFFECTIVE}</span> ·{' '}
            <span className="whitespace-nowrap">version {TERMS_VERSION}</span>
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-5 px-4 py-8">
        <Section title="The short version" id="short">
          <p>
            Your church invites you, keeps your information safe, and is responsible for
            how this app is run for you. You keep your account to yourself, treat people
            here with care, and tell the church when something is wrong. You can leave
            whenever you want.
          </p>
        </Section>

        <Section title="Who this agreement is with" id="who">
          <p><ChurchLegalLine church={church} loading={loading} /></p>
          <p>
            {APP_NAME} is free software, made by volunteers and offered to churches as it
            is. Your church chose to run it; your agreement is with your church, and the
            church answers for how it is used.
          </p>
          {!loading && !legalComplete(church) && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" data-legal-missing>
              Your church has not yet added its legal name and its Data Protection Officer.
              These terms still apply as written.
            </p>
          )}
        </Section>

        <Section title="Who may use it" id="eligibility">
          <p>
            You join because your church invited you. There is no public sign-up.
          </p>
          <p>
            <strong>If you are under 18</strong>, your church records the written consent of
            your parent or guardian before you are walked with by a Guide, and the people
            responsible for you are told what that involves.
          </p>
        </Section>

        <Section title="Your account" id="account">
          <ul className="list-disc space-y-1 pl-5">
            <li>Keep your password to yourself, and use the second step when the app asks for it.</li>
            <li>Keep your details truthful. Your Guide and your church&rsquo;s leadership can see when they change.</li>
            <li>If you think somebody else has used your account, tell a Director straight away.</li>
          </ul>
        </Section>

        <Section title="How we treat each other" id="conduct">
          <p>
            The church&rsquo;s{' '}
            <Link href="/policy" className="font-semibold text-navy underline">safeguarding policy</Link>{' '}
            is part of these terms. In short, do not:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>threaten, harass, shame or pressure anybody;</li>
            <li>pretend to be somebody else, or mislead people about who you are;</li>
            <li>share somebody&rsquo;s private information, or what they told you, without their permission;</li>
            <li>send anything sexual, hateful or against the law, or anything meant to harm a child;</li>
            <li>try to get into parts of the app, or other people&rsquo;s accounts, that are not yours.</li>
          </ul>
          <p>
            <strong>If something is wrong, report it</strong> from the conversation it happened in.
            A Director is told by name, and the report is kept even if what it is about is deleted.
          </p>
        </Section>

        <Section title="What you write" id="content">
          <p>
            What you write stays yours. You allow your church to keep it and to show it to
            the people the app shows it to (your Guide, the people in a conversation, the
            readers of a post), so the app can do what it is for, and for no other purpose.
          </p>
          <p>
            Your Study Room pages are yours alone. When something is reported, what the
            report is about is copied into it and kept, because a safeguarding record must
            not disappear.
          </p>
        </Section>

        <Section title="Your privacy" id="privacy">
          <p>
            The{' '}
            <Link href={`/privacy${churchQuery}`} className="font-semibold text-navy underline">Privacy Notice</Link>{' '}
            explains what is kept, who can see it, for how long, and what you can ask for
            under the Data Privacy Act of 2012. It is part of these terms.
          </p>
          <p>
            Separately, your church asks your permission to keep information about you that
            the law counts as sensitive. You can correct your details whenever you need to;
            if you no longer want the church to hold them, ask for your account to be
            removed (see Leaving below).
          </p>
        </Section>

        <Section title="When things go wrong" id="limits">
          <p>
            Your church may pause or end an account that breaks these terms or puts somebody
            at risk. Where it is safe to, it will tell you why, and you can ask a Director to
            look again.
          </p>
          <p>
            The app may sometimes be unavailable, and it can make mistakes. As far as the law
            allows, neither your church nor the people who make the software are responsible
            for losses caused by the app being unavailable or by what other members write.
            Nothing here takes away rights you have under the laws of the Philippines.
          </p>
        </Section>

        <Section title="Leaving" id="leaving">
          <p>
            You can stop using the app at any time, and ask a Director or the Data Protection
            Officer to remove your account and what is in it. The Privacy Notice says what has
            to be kept, such as a safeguarding report, and for how long.
          </p>
        </Section>

        <Section title="If these terms change" id="changes">
          <p>
            The app tells you what changed and asks you to agree before you carry on. The date
            at the top of this page says which version is in force; the agreement you gave is
            recorded with its version and the time.
          </p>
        </Section>

        <Section title="The law, and questions" id="law">
          <p>
            These terms are governed by the laws of the Republic of the Philippines.
            Questions go to your church&rsquo;s Director, or to its Data Protection Officer.
          </p>
        </Section>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">This is a starting point</h2>
          <p className="mt-2 text-gray-700">
            {APP_NAME} is free software, and these terms ship with it as a draft. Any church
            running it should read them and have somebody qualified check them against the
            law where they are. They are{' '}
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">app/terms/page.tsx</code> in the{' '}
            <a href={SOURCE_URL} className="font-semibold text-navy underline" rel="noopener">source</a>.
          </p>
          <p className="mt-2 text-sm text-gray-600">It is not legal advice.</p>
        </Card>

        <div className="flex flex-col items-center gap-3 pb-10 text-center">
          <Link href={`/privacy${churchQuery}`} className="font-semibold text-navy underline underline-offset-4">
            Privacy Notice
          </Link>
          <Link href="/policy" className="font-semibold text-navy underline underline-offset-4">
            Safeguarding policy
          </Link>
          <Link href="/" className="font-semibold text-navy underline underline-offset-4">
            ← Back to {APP_SHORT_NAME}
          </Link>
        </div>
      </div>
    </div>
  );
}
