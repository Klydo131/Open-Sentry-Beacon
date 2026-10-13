'use client';

// ASKED OF EVERYBODY, NOT ONLY OF THOSE WHO SIGNED UP (13 October 2026).
//
// Consent was asked for on the sign-up page and nowhere else, and a member who
// signed in with the password from their invitation never saw that page. On
// the live church that left 42 of 43 accounts with no consent on record, for
// information the Act counts as sensitive. This step stands in front of the
// whole signed-in app for anybody without a record (components/LiveAppShell.tsx)
// and asks in the same words as the sign-up (components/live/ConsentWording.tsx),
// after the same account of who looks after the app (lib/oversight.ts).
//
// THE BOX STARTS UNTICKED and the button waits for it: a box that arrives
// ticked is not consent (NPC Circular 2023-04). Saying no is a real choice with
// a real button, and it signs the person out without recording anything more.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NAVY } from '@/lib/brand';
import { oversightPoints } from '@/lib/oversight';
import { useLiveSession } from '@/lib/live/session';
import * as live from '@/lib/live/data';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { Button, Card } from '@/components/ui';
import { ConsentWording } from '@/components/live/ConsentWording';

export function ConsentStep() {
  const { refreshProfile, signOut } = useLiveSession();
  const router = useRouter();
  const [churchName, setChurchName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    // The church's own name, so the permission names who is asking. A
    // courtesy: not having it must not stop anybody answering.
    live.myChurch().then(
      (church) => { if (alive && church?.name) setChurchName(church.name); },
      () => undefined,
    );
    return () => { alive = false; };
  }, []);

  const agree = async () => {
    if (!agreed) { setError('Tick the permission box to continue.'); return; }
    setBusy(true);
    setError('');
    try {
      await live.updateMyProfile({ consent_at: new Date().toISOString() });
      await refreshProfile();
    } catch {
      setError('Your answer could not be saved. Check your connection and try again.');
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    await signOut();
    router.replace('/login');
  };

  return (
    <div className="grid min-h-screen place-items-center px-4 py-8" style={{ backgroundColor: NAVY }} data-consent-step>
      <Card className="w-full max-w-lg p-6">
        <SentryBeaconMark size={48} className="mx-auto" />
        <h1 className="mt-3 text-center text-2xl font-extrabold text-navy">Before you go on</h1>
        <p className="mt-2 text-center text-gray-600">
          Your church needs your permission to keep your information in this app.
          It has not been recorded for your account yet.
        </p>

        <div className="mt-5 space-y-2 rounded-xl bg-gray-50 p-4" data-oversight>
          <p className="text-xs font-bold uppercase tracking-wide text-gray-600">How this app is looked after</p>
          {oversightPoints(churchName).map((point) => (
            <p key={point.icon} className="flex gap-2 text-sm leading-relaxed text-gray-700">
              <span aria-hidden>{point.icon}</span>
              <span>{point.text}</span>
            </p>
          ))}
          <Link href="/privacy" className="inline-block text-sm font-semibold text-navy underline">
            Read the full privacy notice
          </Link>
        </div>

        <label className="mt-4 flex items-start gap-3 rounded-xl bg-navy/5 p-4">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(event) => { setAgreed(event.target.checked); setError(''); }}
            className="mt-1 h-5 w-5 shrink-0"
            data-consent-box
          />
          <span className="text-sm leading-relaxed text-gray-700">
            <ConsentWording churchName={churchName} />
          </span>
        </label>

        {error && <p className="mt-3 text-sm font-semibold text-red-700" role="alert">{error}</p>}

        <div className="mt-5 flex flex-col gap-2">
          <div className="flex flex-col" data-consent-agree>
            <Button onClick={agree} disabled={busy || !agreed}>
              I agree, continue
            </Button>
          </div>
          <button
            type="button"
            onClick={decline}
            disabled={busy}
            className="tap w-full rounded-xl bg-gray-100 px-5 text-base font-semibold text-gray-700"
            data-consent-decline
          >
            I do not agree, sign me out
          </button>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-gray-600">
          If you do not agree, you are signed out and nothing more is collected. You
          can ask a Director or the church&rsquo;s Data Protection Officer to remove
          your account and what is in it.
        </p>
      </Card>
    </div>
  );
}
