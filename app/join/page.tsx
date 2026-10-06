'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useDemo } from '@/lib/demo/store';
import { NAVY, APP_SHORT_NAME } from '@/lib/brand';
import { Button, Card } from '@/components/ui';
import type { Invite, Role } from '@/lib/types';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { IS_LIVE } from '@/lib/mode';
import { LiveJoinPage } from '@/components/LiveCorePages';

// Where each role lands after completing the demo sign-up.
const DEMO_HOME: Record<Role, string> = {
  executive: '/admin',
  admin: '/admin',
  dm: '/dm',
  ds: '/ds',
};

// The invited seeker's sign-up. Reached only via an invite link
// (/join?token=…) created by a church admin — there is no public registration.
// The in-browser store validates and redeems the token; nothing leaves the
// device.
export default function JoinPage() {
  return (
    <Suspense fallback={<Shell><p className="text-white/70">Loading…</p></Shell>}>
      {IS_LIVE ? <LiveJoinPage /> : <Join />}
    </Suspense>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto flex max-w-md flex-col items-center">
          <SentryBeaconMark size={56} />
          <h1 className="mt-3 text-3xl font-extrabold">Welcome to {APP_SHORT_NAME}</h1>
          <div className="mt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Join() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const router = useRouter();
  const { db, inviteByToken, acceptInvite, signInAs } = useDemo();

  const invite = inviteByToken(token);
  const status: Invite['status'] | undefined = invite?.status;
  const inviteName = invite?.full_name;
  const inviteRole: Role | undefined = invite?.role;
  const isSeeker = !inviteRole || inviteRole === 'ds';

  const [f, setF] = useState({
    full_name: '',
    preferred_contact: '',
    birthday: '',
    gender: '',
    status: '',
    topics: '',
    city_of_residence: '',
    work_industry: '',
  });
  const [primed, setPrimed] = useState(false);
  const [error, setError] = useState('');
  // Permission to hold their details. Unticked by default and required to
  // continue — a box that arrives already ticked is not consent, it is a
  // default somebody failed to notice.
  const [consent, setConsent] = useState(false);
  const [showMore, setShowMore] = useState(false);

  // Prefill the name from the invite once it's known (works for both paths).
  useEffect(() => {
    if (!primed && inviteName) {
      setPrimed(true);
      setF((p) => ({ ...p, full_name: inviteName }));
    }
  }, [inviteName, primed]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((p) => ({ ...p, [k]: e.target.value }));

  if (!token || !invite || status === 'revoked') {
    return (
      <Shell>
        <p className="text-white/70">This invitation link isn’t valid.</p>
        <BackHome note="Ask your church for a new invitation." />
      </Shell>
    );
  }
  if (status === 'accepted') {
    return (
      <Shell>
        <p className="text-white/70">This invitation has already been used.</p>
        <BackHome note="If this was you, sign in from the home page." />
      </Shell>
    );
  }

  const submit = () => {
    if (!f.full_name.trim() || !consent) return;
    setError('');

    // Staff don't fill the seeker-only fields.
    const fields = {
      full_name: f.full_name,
      preferred_contact: f.preferred_contact || undefined,
      birthday: isSeeker ? f.birthday || undefined : undefined,
      gender: isSeeker ? f.gender || undefined : undefined,
      status: isSeeker ? f.status || undefined : undefined,
      topics_of_interest: isSeeker
        ? f.topics.split(',').map((t) => t.trim()).filter(Boolean)
        : [],
      city_of_residence: isSeeker ? f.city_of_residence || undefined : undefined,
      work_industry: isSeeker ? f.work_industry || undefined : undefined,
      consent_at: new Date().toISOString(),
    };

    const id = acceptInvite(token, fields);
    if (!id) {
      setError('This invitation could not be completed.');
      return;
    }
    signInAs(id);
    router.replace(DEMO_HOME[inviteRole ?? 'ds'] ?? '/ds');
  };

  return (
    <div className="min-h-screen">
      <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto flex max-w-md flex-col items-center">
          <SentryBeaconMark size={56} />
          <h1 className="mt-3 text-3xl font-extrabold">You’re invited to {APP_SHORT_NAME}</h1>
          <p className="mt-1 text-white/70">
            {isSeeker
              ? 'Your church invited you to begin a journey of faith, walking with a Guide who cares about you.'
              : 'Your church invited you to join the team. Confirm your details to get started.'}
          </p>
        </div>
      </div>

      {/* pb-32, not py-8. The install banner is position:fixed at the bottom of
          the viewport with z-55, and this page builds its own layout instead of
          using AppShell, so it never inherited the clearance every other screen
          has. The end of the form — the optional questions and the join button
          itself — sat underneath it on a phone. Caught by a browser test that
          could not click its own link. */}
      <div className="mx-auto max-w-md space-y-6 px-4 pb-32 pt-8">
        <Card className="p-5">
          <h2 className="mb-1 text-xl font-bold text-navy">
            {isSeeker ? 'Complete your sign-up' : 'Set up your account'}
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            {isSeeker
              ? 'Just a few details so your church can care for you well.'
              : 'Just confirm your details.'}
          </p>
          {/* THREE REQUIRED THINGS, THEN EVERYTHING ELSE BEHIND A LINK.
              This used to be one flat grid of eight boxes, and eight boxes is
              what a form looks like when nobody decided which of them matter.
              Somebody who was invited by a person they know should be able to
              finish in under a minute; the rest helps their Guide and can wait
              until they feel like typing it. */}
          <div className="space-y-4">
            <Field label="Your name *" value={f.full_name} onChange={set('full_name')} />

            {/* Read-only, because it is the address the invitation was sent to.
                An editable email here would let somebody redirect an
                invitation that was not addressed to them. */}
            <label className="block">
              <span className="text-sm font-semibold text-gray-500">Email *</span>
              <input
                readOnly
                value={invite.email}
                aria-describedby="email-why"
                // text-base, not text-lg: this is the one field the reader is being
                // asked to CHECK rather than fill, and at text-lg a normal
                // address ran off the end of a phone screen — "…@example.co"
                // with the rest cut off, which is worse than useless when the
                // point is to confirm it is yours.
                className="tap mt-1 w-full cursor-not-allowed rounded-xl bg-gray-100 px-4 text-base text-gray-500 outline-none"
              />
              <span id="email-why" className="mt-1 block text-xs text-gray-500">
                This is the address your invitation was sent to.
              </span>
            </label>
          </div>

          {/* PERMISSION. Named church, plain words, and the right to withdraw
              stated in the same breath as the request — a permission you
              cannot see how to take back is not much of a permission. */}
          <label className="mt-5 flex items-start gap-3 rounded-xl bg-navy/5 p-4">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-5 w-5 shrink-0"
            />
            <span className="text-sm leading-relaxed text-gray-700">
              I give permission for <strong>{db.church_name}</strong> to keep my
              contact details so someone from the church can stay in touch with
              me about my studies. I can update them whenever I need to, I will
              keep them truthful, and my Guide and my church&rsquo;s leadership
              can see when I change them.{' '}
              <span className="text-red-600">*</span>
            </span>
          </label>

          {isSeeker && (
            <div className="mt-5">
              <button
                type="button"
                onClick={() => setShowMore((v) => !v)}
                className="text-sm font-semibold text-navy underline"
              >
                {showMore ? 'Hide the optional questions' : 'Tell your Guide a little more (optional)'}
              </button>
              {showMore && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Preferred contact"
                    value={f.preferred_contact}
                    onChange={set('preferred_contact')}
                    placeholder="Phone, Messenger…"
                  />
                  <Field label="Birthday" type="date" value={f.birthday} onChange={set('birthday')} />
                  <Field label="Gender" value={f.gender} onChange={set('gender')} />
                  <Field label="Status" value={f.status} onChange={set('status')} />
                  <Field
                    label="City of residence"
                    value={f.city_of_residence}
                    onChange={set('city_of_residence')}
                  />
                  <Field
                    label="Work / Industry"
                    value={f.work_industry}
                    onChange={set('work_industry')}
                  />
                  <Field
                    label="Topics of interest"
                    value={f.topics}
                    onChange={set('topics')}
                    placeholder="Comma-separated"
                  />
                </div>
              )}
            </div>
          )}
          {error && (
            <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-200">
              {error}
            </p>
          )}
          <div className="mt-6">
            <Button
              variant="gold"
              disabled={!f.full_name.trim() || !consent}
              onClick={submit}
            >
              Join {APP_SHORT_NAME} →
            </Button>
          </div>
          {!consent && (
            <p className="mt-3 text-xs text-gray-500">
              Tick the permission box above to continue.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

function BackHome({ note }: { note: string }) {
  return (
    <div className="mt-4">
      <p className="text-sm text-white/60">{note}</p>
      <Link href="/" className="mt-2 inline-block text-sm text-white underline">
        ← Go to the home page
      </Link>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
      />
    </label>
  );
}
