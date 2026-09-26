'use client';

// What we do with what you tell us.
//
// WRITTEN TO BE READ, like the safeguarding policy beside it. Almost nobody
// finishes a privacy notice, which is why almost every one of them is written
// as though nobody will. This one is short sentences and no clause numbers,
// because the audience is a church member who has just been invited by
// somebody they trust and is deciding whether to sign up.
//
// TWO THINGS EVERY CHURCH RUNNING THIS MUST FILL IN before publishing it: who
// the controller is, and who the Data Protection Officer is. They are marked in
// the text and there is no way to guess them from here. The blanks are visible
// on purpose: a notice with a plausible-looking wrong name on it is worse than
// one that admits it is unfinished.
//
// WHY IT MATTERS MORE THAN IT LOOKS. Under the Philippine Data Privacy Act a
// person's age, marital status and religious affiliation are SENSITIVE personal
// information, and this app records all three by existing. That raises the
// standard from "tell people" to "get express consent, appoint a Data
// Protection Officer, and register if you pass a thousand members".
// docs/DATA-PROTECTION.md has the full map and the list of what is still
// missing.
//
// It is not legal advice. It is a starting draft for a lawyer to correct.

import Link from 'next/link';
import { NAVY, APP_NAME, APP_SHORT_NAME } from '@/lib/brand';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { Card } from '@/components/ui';

function Blank({ what }: { what: string }) {
  return (
    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-sm font-bold text-amber-900 ring-1 ring-amber-300">
      {what}
    </span>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto flex max-w-2xl flex-col items-center">
          <SentryBeaconMark size={48} />
          <h1 className="mt-3 text-3xl font-extrabold">What we do with what you tell us</h1>
          <p className="mt-1 text-white/75">
            The short version: it stays inside your church, and you can ask for it back
            or ask for it to be deleted.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-5 px-4 py-8">
        <Card className="p-5 ring-2 ring-amber-300">
          <h2 className="text-xl font-bold text-navy">Two lines are still missing</h2>
          <p className="mt-2 text-gray-700">
            The highlighted parts are the church&rsquo;s own legal identity and the name of
            its Data Protection Officer. Nobody but the church can supply them, and a
            notice carrying a plausible wrong name would be worse than one that says it
            is unfinished. Everything else below is decided and applies as written.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">Who holds your information</h2>
          <p className="mt-2 text-gray-700">
            <Blank what="[church name and address]" /> decides what is collected here and
            is responsible for it. Questions, and any request below, go to the Data
            Protection Officer at <Blank what="[name and email]" />.
          </p>
          <p className="mt-2 text-gray-700">
            If you are not satisfied with the answer, you can complain to the National
            Privacy Commission at <span className="font-semibold">privacy.gov.ph</span>,
            or, if you are in Europe, to your own data protection authority.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">What is collected</h2>
          <ul className="mt-3 space-y-2 text-gray-700">
            <li><strong>Who you are.</strong> Your name, your email address, and whatever
              you choose to add: a picture, your city, your work, what you are interested
              in, your language.</li>
            <li><strong>Your birthday.</strong> Because somebody under 18 is walked with
              differently, and their parent or guardian has to agree first.</li>
            <li><strong>What you write.</strong> Your conversation with the person walking
              with you, prayer requests, meetings you arrange, anything you post.</li>
            <li><strong>What the church records.</strong> When you were approved, and any
              safeguarding report or decision about you.</li>
          </ul>
          <p className="mt-3 rounded-xl bg-sky-50 p-3 text-sm text-slate-700 ring-1 ring-sky-100">
            <strong>Some of this is what the law calls sensitive.</strong> Your age and
            your participation in a church both are, under the Philippine Data Privacy
            Act. That is why you are asked to agree clearly rather than by carrying on,
            and why the rules below are stricter than they would be for a mailing list.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">Who can see it</h2>
          <ul className="mt-3 space-y-2 text-gray-700">
            <li><strong>Your conversation is yours and your Guide&rsquo;s.</strong> Not
              other Guides, not Directors, not the person who runs the server. The one
              exception is a safeguarding report, and the screen where you make one says
              so before you make it.</li>
            <li><strong>Your Guide</strong> sees your profile and what you write to them.</li>
            <li><strong>Your Directors</strong> see the church&rsquo;s members and its
              numbers, safeguarding reports, and a 30-day record of which links people
              shared. They do not see conversations.</li>
            <li><strong>Nobody who is not signed in sees anything at all.</strong> There
              is no public page with a member on it, and nothing here is indexed by a
              search engine.</li>
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">Where it is kept, and for how long</h2>
          <p className="mt-2 text-gray-700">
            The database and files are hosted by Supabase in <strong>Seoul, South
            Korea</strong>, so information about you leaves the Philippines. That is
            allowed, and you are being told because you should know.
            The pages are served by Vercel. Email is sent through Brevo. A weekly backup
            is encrypted before it leaves.
          </p>
          <p className="mt-2 text-gray-700">
            <strong>When you arrange to meet somebody in person</strong>, the words you type
            in the place box are sent to a place search so it can suggest where you mean.
            It is Photon, run by komoot in Germany over OpenStreetMap data. The words go
            from the church&rsquo;s server, not from your phone, and nothing else goes with
            them: not your name, not your email, not your phone&rsquo;s internet address.
            The only other thing sent is the town where you last met, rounded to about ten
            kilometres, so nearby places come first. Nothing about the search is kept.
          </p>
          <ul className="mt-3 space-y-2 text-gray-700">
            <li><strong>The record of shared links: 30 days</strong>, then deleted
              automatically.</li>
            <li><strong>Everything else: for as long as you have an account.</strong>{' '}
              When it is removed, what is in it goes at once rather than after a waiting
              period, and your photographs are deleted before the account itself.</li>
            <li><strong>Safeguarding reports and the record of a removal are kept
              permanently</strong>, including after an account is deleted. A church has
              to be able to show that it acted, and a record the person it describes can
              erase would not show anything. This is the one thing that survives a
              deletion request.</li>
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">What you can ask for</h2>
          <p className="mt-2 text-gray-700">
            Write to the Data Protection Officer above. You have the right to:
          </p>
          <ul className="mt-3 space-y-2 text-gray-700">
            <li><strong>See it.</strong> A copy of what is held about you.</li>
            <li><strong>Correct it.</strong> Anything wrong, put right.</li>
            <li><strong>Delete it.</strong> Your account and what is in it, with the
              safeguarding exception above.</li>
            <li><strong>Object, or withdraw your agreement</strong>, at any time. You do
              not have to give a reason, and nothing bad happens to you for asking.</li>
            <li><strong>Take it with you.</strong> A copy in a form you can use elsewhere.</li>
          </ul>
          <p className="mt-3 text-sm text-gray-600">
            Ask, and you will get an answer within <strong>30 days</strong>. If the
            request is complicated and will take longer, you will be told that inside
            the 30 days, along with when to expect it.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">If something goes wrong</h2>
          <p className="mt-2 text-gray-700">
            If your information is exposed in a way that could harm you, you and the
            National Privacy Commission are told within 72 hours of it being known,
            which is what the law requires.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">Photos and files</h2>
          <p className="mt-2 text-gray-700">
            A photo you send or add is made smaller first, and <strong>the location your
            camera recorded in it is removed</strong> before it is stored. That is true of a
            photo in a conversation, your profile picture, a resource and a study handout.
            The one exception: evidence attached to a safeguarding report is kept exactly
            as you send it, because changing it could make it worth less, and only the
            church&rsquo;s leadership handling the report can open it.
          </p>
          <ul className="mt-3 space-y-2 text-gray-700">
            <li><strong>A file you add to Resources</strong> is kept by the church. Until
              you send it to somebody, only you can open it; after that, so can the person
              you sent it to. Directors see that something was added or shared, not the
              file. Deleting the resource deletes the file.</li>
            <li><strong>A handout on a study</strong> can be opened by anybody who can read
              that study.</li>
            <li><strong>Each file can be up to 10 MB</strong>, and each person can keep up
              to 300 files or 200 MB of resources and handouts. Video is not kept; share a
              link to it instead.</li>
            <li><strong>Files you save under <em>On this device</em></strong> in My Files
              stay on your phone and are passed straight to the other person; they never
              reach a server.</li>
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-xl font-bold text-navy">This is a starting point</h2>
          <p className="mt-2 text-gray-700">
            {APP_NAME} is free software, and this notice ships with it as a draft.
            Any church running it should read it, fill in the blanks, and have somebody
            qualified check it against the law where they are. It is
            <code className="mx-1 rounded bg-gray-100 px-1.5 py-0.5 text-sm">app/privacy/page.tsx</code>
            in the source, and <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm">docs/DATA-PROTECTION.md</code>
            {' '}lists what is still missing.
          </p>
          <p className="mt-2 text-sm text-gray-600">
            It is not legal advice.
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
