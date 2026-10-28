'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NAVY, APP_SHORT_NAME } from '@/lib/brand';
import { Button, Card } from '@/components/ui';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { useIsLive } from '@/lib/tutorial';
import { LiveSignupPage } from '@/components/live/DoorPages';

// Sign-up — for people who have an invitation but not a working email link.
//
// Beacon has no public registration, and this page does not add any: it takes
// an invitation code and forwards to /join, which is where the invitation is
// actually validated and redeemed. Everything that matters (is the code real,
// is it still pending, does it belong to the signed-in email) is checked in the
// database, not here.
//
// It exists because the email link is fragile in practice — forwarded mail,
// a link opened on the wrong device, a copy-paste that lost the tail. Without
// this page those people have no way in but to ask for a new invitation.
export default function SignupPage() {
  const live = useIsLive();
  return live ? <LiveSignupPage /> : <DemoSignupPage />;
}

function DemoSignupPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  // People paste whatever they have: the bare token, or the whole URL. Take
  // either — refusing a pasted link would be pedantry, not security.
  const tokenFrom = (raw: string): string => {
    const s = raw.trim();
    if (!s) return '';
    const match = s.match(/[?&]token=([^&\s]+)/);
    if (match) return decodeURIComponent(match[1]);
    return s.replace(/\s+/g, '');
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const token = tokenFrom(code);
    if (!token) {
      setError('Please enter the invitation code from your email.');
      return;
    }
    router.push(`/join?token=${encodeURIComponent(token)}`);
  };

  return (
    <div className="min-h-screen">
      <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
        <div className="mx-auto flex max-w-md flex-col items-center">
          <Link href="/" className="text-sm text-white/50 underline">
            ← Home
          </Link>
          <SentryBeaconMark size={56} className="rise rise-1 mt-3" />
          <h1 className="rise rise-2 mt-3 text-3xl font-extrabold">Join {APP_SHORT_NAME}</h1>
          <p className="rise rise-3 mt-1 text-white/70">
            Your church invites you. Beacon has no public sign-up.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-6 px-4 py-8">
        <Card className="p-5">
          <h2 className="mb-1 text-xl font-bold text-navy">
            The easiest way in
          </h2>
          <p className="text-gray-600">
            Open the invitation email your church sent and tap the button in it.
            That signs you in and brings you straight to the sign-up form.
          </p>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-xl font-bold text-navy">
            Have an invitation code?
          </h2>
          <p className="mb-4 text-sm text-gray-500">
            If someone gave you a code or a link, paste it here.
          </p>
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-gray-500">
                Invitation code or link
              </span>
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setError('');
                }}
                placeholder="Paste it here"
                className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
              />
            </label>
            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-red-700 ring-1 ring-red-200">
                {error}
              </p>
            )}
            <Button type="submit" variant="gold" disabled={!code.trim()}>
              Continue →
            </Button>
          </form>
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-xl font-bold text-navy">
            No invitation yet?
          </h2>
          <p className="text-gray-600">
            Ask someone at your church to send you one, a Director or the Guide
            you’ve been talking with. They enter your email and Beacon does
            the rest.
          </p>
        </Card>

        <p className="text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link href="/login" className="font-semibold text-navy underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
