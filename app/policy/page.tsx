'use client';

// How we treat each other here.
//
// WRITTEN TO BE READ, which is the whole difficulty. Every church has a
// safeguarding policy and almost nobody has read one: they are written by
// lawyers, for lawyers, to survive a complaint rather than to prevent one. A
// policy nobody finishes protects nobody.
//
// So: short sentences, no clause numbers, no "the Organisation shall", and the
// part people actually need — how to report, and what happens next — near the
// top rather than buried at the end. The audience is a church member in their
// forties who is not technical and is possibly upset.

import Link from 'next/link';
import { NAVY, APP_SHORT_NAME } from '@/lib/brand';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { Card } from '@/components/ui';

export default function PolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto flex max-w-2xl flex-col items-center">
          <SentryBeaconMark size={48} />
          <h1 className="mt-3 text-3xl font-extrabold">How we treat each other</h1>
          <p className="mt-1 text-white/75">
            {APP_SHORT_NAME} puts two people in a private conversation. This is what
            that asks of both of them.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-5 px-4 py-8">
        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">If something is wrong, report it</h2>
          <p className="mt-2 text-gray-700">
            Open the conversation, tap <strong>Report</strong>, and say what
            happened. It goes to your church&rsquo;s Directors.
          </p>
          <ul className="mt-3 space-y-2 text-gray-700">
            <li>
              <strong>The other person is not told when you report.</strong> No
              notice, no read receipt, nothing they could notice. A Director reads
              it first, and may then bring them into the conversation about it so
              it can be talked through; you are told if they do, and they never see
              the pictures or files you add.
            </li>
            <li>
              <strong>Guides and Explorers can both report.</strong> This is not
              a channel that only runs one way.
            </li>
            <li>
              <strong>You do not have to be sure.</strong> &ldquo;This felt
              wrong and I do not know why&rdquo; is a good enough reason. Working
              out whether it was is the Directors&rsquo; job, not yours.
            </li>
            <li>
              <strong>You can stop talking to someone at any time.</strong> You
              do not owe anybody a conversation, and you do not need permission
              to end one.
            </li>
          </ul>
          <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200">
            <strong>If someone is in danger right now, call your local emergency
            services first.</strong> This app is not an emergency service and
            nobody is watching it around the clock.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">What is expected of everyone</h2>
          <ul className="mt-2 space-y-2 text-gray-700">
            <li>Speak to people the way you would with someone else in the room.</li>
            <li>
              Keep it to what you are here for. This is a place for study,
              prayer and encouragement.
            </li>
            <li>
              <strong>No sexual content, of any kind, to anyone.</strong> There
              is no version of this that is a joke between friends here.
            </li>
            <li>No abuse, threats, slurs, or pressure of any kind.</li>
            <li>
              Do not ask for money, sell things, or recruit people into anything.
            </li>
            <li>
              What someone tells you in confidence stays with you. Do not
              screenshot it, forward it, or repeat it.
            </li>
            <li>
              An Explorer sets the pace. Not being ready is an answer, and it is
              not a problem to be solved.
            </li>
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">What is expected of Guides</h2>
          <p className="mt-1 text-sm text-gray-600">
            More is asked of you, because more is trusted to you.
          </p>
          <ul className="mt-2 space-y-2 text-gray-700">
            <li>
              You are here for them, not the other way round. Do not lean on the
              person you are guiding.
            </li>
            <li>
              Meeting in person: somewhere public, and tell a Director where and
              when. This protects you as much as them.
            </li>
            <li>
              With anyone under 18, or anyone vulnerable, follow your
              church&rsquo;s own safeguarding rules. This app does not replace
              them.
            </li>
            <li>
              Notes you keep are for the work, not about the person. Assume they
              will read them one day.
            </li>
            <li>
              If something is beyond you, such as grief, abuse or self-harm,
              tell a Director. That is what Directors are there for.
            </li>
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">What happens after a report</h2>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-gray-700">
            <li>Every Director of your church is notified straight away.</li>
            <li>
              A Director reads it, and can read the conversation it came from in
              place, with what came before and after, rather than as a single
              quoted line.
            </li>
            <li>
              They decide. That may be a conversation, a pause, or removing the
              person from the church&rsquo;s {APP_SHORT_NAME}. It may also be that
              there was nothing to answer. That happens, and it is not held
              against you for raising it.
            </li>
            <li>
              The report is kept either way. Reports are never deleted, so the
              record stays complete whatever was decided.
            </li>
          </ol>
          <p className="mt-3 text-sm text-gray-600">
            Your name is visible to the Directors. They need it so they can ask
            you what happened, support you, and tell a genuine concern from a
            grudge. The person you reported is not told, unless a Director brings
            them into the conversation about it.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">What Directors can and cannot see</h2>
          <ul className="mt-2 space-y-2 text-gray-700">
            <li>
              <strong>They cannot read your conversations</strong> as a matter
              of course. Messages between a Guide and an Explorer are private.
            </li>
            <li>
              <strong>A report opens that one conversation</strong> to the
              Directors, so they can judge it fairly. That is the trade, and it
              is why reporting is a deliberate act and not a button you press by
              accident.
            </li>
            <li>
              They can see who is paired with whom, who has joined, and how the
              church is doing overall.
            </li>
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">This is a starting point</h2>
          <p className="mt-2 text-gray-700">
            {APP_SHORT_NAME} is open source and this page ships with it. Your church
            should read it, change it to match your own safeguarding policy, and
            put your own contact details on it. It is
            <code className="mx-1 rounded bg-gray-100 px-1.5 py-0.5 text-sm">app/policy/page.tsx</code>
            in the source.
          </p>
          <p className="mt-2 text-sm text-gray-600">
            It is not legal advice and it does not replace your church&rsquo;s
            safeguarding policy or the law where you are.
          </p>
        </Card>

        <div className="pb-10 text-center">
          <Link href="/" className="font-semibold text-navy underline underline-offset-4">
            ← Back to {APP_SHORT_NAME}
          </Link>
        </div>
      </div>
    </div>
  );
}
