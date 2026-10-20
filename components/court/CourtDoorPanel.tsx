'use client';

// The court room's door.
//
// What it asks for is the database's decision (public.court_door): a code from
// the authenticator app for anybody who has one, a password for somebody
// called to a case who has none, and for a Director or an Executive Director
// without one, the way to set it up. This screen only asks for the right one
// in plain words and hands it to lib/live/court-door.ts.

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { Seal } from '@/components/court/CourtFurniture';
import { openWithCode, openWithPassword } from '@/lib/live/court-door';
import { humanError } from '@/lib/live/errors';
import type { CourtDoor } from '@/lib/live/court';

export function CourtDoorPanel({ door, onOpened }: { door: CourtDoor; onOpened: () => void | Promise<void> }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (door.needs === 'code') await openWithCode(value);
      else await openWithPassword(value);
      setValue('');
      await onOpened();
    } catch (cause) {
      setError(humanError(cause, 'That did not open the door. Try again.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ct-room">
      <div className="ct-door" data-court-door={door.needs ?? 'open'}>
        <Seal className="ct-seal" />
        <h2>The court room</h2>

        {door.needs === 'two_step' ? (
          <>
            <p>
              The court room holds the most sensitive things your church writes
              down, so a Director or an Executive Director enters it with
              two-step sign-in: a code from an authenticator app on your phone.
            </p>
            <p>It takes about two minutes to set up, once.</p>
            <Link
              href="/settings?room=account"
              className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gold px-5 font-bold text-navy"
            >
              Set up two-step sign-in
            </Link>
          </>
        ) : (
          <form onSubmit={(e) => void submit(e)}>
            <p>
              {door.needs === 'code'
                ? 'To come in, type the six-digit code your authenticator app shows now.'
                : 'To come in, type your password again. This keeps a case private if somebody else picks up your phone.'}
            </p>
            <label className="block">
              <span className="sr-only">{door.needs === 'code' ? 'Six-digit code' : 'Your password'}</span>
              {door.needs === 'code' ? (
                <input
                  data-court-code
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9 ]*"
                  maxLength={7}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="000000"
                  autoFocus
                />
              ) : (
                <input
                  data-court-password
                  type="password"
                  autoComplete="current-password"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoFocus
                />
              )}
            </label>
            <div className="mt-3">
              <Button type="submit" variant="gold" disabled={busy || !value.trim()}>
                {busy ? 'Opening' : 'Open the door'}
              </Button>
            </div>
            {error && <p className="ct-door-error" role="alert">{error}</p>}
            <p className="mt-3 text-xs">
              The door stays open for {door.minutes} minutes from your {door.needs === 'code' ? 'code' : 'password'}.
              Everything you read or add inside is written on the case&rsquo;s record.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
