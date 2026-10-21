'use client';

// The court room's door.
//
// What it asks for is the database's decision (public.court_door): a code from
// the authenticator app for anybody who has one, a password for somebody
// called to a case who has none, and for a Director or an Executive Director
// without one, the way to set it up -- or, where the project has chosen email,
// a code sent to them by email. This screen only asks for the right one in
// plain words and hands it to lib/live/court-door.ts.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui';
import { Seal } from '@/components/court/CourtFurniture';
import { openWithCode, openWithEmailCode, openWithPassword, sendDoorCode } from '@/lib/live/court-door';
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

        {door.needs === 'email' ? (
          <EmailDoor minutes={door.minutes} onOpened={onOpened} />
        ) : door.needs === 'two_step' ? (
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

/** How long before another code may be asked for (the database's own limit). */
const RESEND_SECONDS = 30;

/** The door where the project has chosen email: ask for a code, then type it. */
function EmailDoor({ minutes, onOpened }: { minutes: number; onOpened: () => void | Promise<void> }) {
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'' | 'sending' | 'opening'>('');
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  const send = async () => {
    if (busy || wait > 0) return;
    setBusy('sending');
    setError('');
    try {
      setSentTo(await sendDoorCode());
      setCode('');
      setWait(RESEND_SECONDS);
    } catch (cause) {
      setError(humanError(cause, 'Could not send the code. Try again.'));
    } finally {
      setBusy('');
    }
  };

  const open = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy('opening');
    setError('');
    try {
      await openWithEmailCode(code);
      setCode('');
      await onOpened();
    } catch (cause) {
      setError(humanError(cause, 'That did not open the door. Try again.'));
    } finally {
      setBusy('');
    }
  };

  if (!sentTo) {
    return (
      <div data-court-email-door="ask">
        <p>
          The court room holds the most sensitive things your church writes
          down, so a Director or an Executive Director enters it with a code
          sent to their email.
        </p>
        <div className="mt-3">
          <Button type="button" variant="gold" disabled={busy !== ''} onClick={() => void send()}>
            {busy === 'sending' ? 'Sending' : 'Email me a code'}
          </Button>
        </div>
        {error && <p className="ct-door-error" role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <form data-court-email-door="code" onSubmit={(e) => void open(e)}>
      <p>We sent a six-digit code to {sentTo}. Type it here within ten minutes.</p>
      <label className="block">
        <span className="sr-only">Six-digit code from the email</span>
        <input
          data-court-email-code
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, ''))}
          placeholder="000000"
          autoFocus
        />
      </label>
      <div className="mt-3">
        <Button type="submit" variant="gold" disabled={busy !== '' || code.replace(/\s+/g, '').length !== 6}>
          {busy === 'opening' ? 'Opening' : 'Open the door'}
        </Button>
      </div>
      {error && <p className="ct-door-error" role="alert">{error}</p>}
      <p className="mt-3 text-xs">Not there after a minute? Look in your spam folder, or send a new one.</p>
      <button
        type="button"
        data-court-email-resend
        disabled={busy !== '' || wait > 0}
        onClick={() => void send()}
        className="mt-2 inline-flex min-h-[44px] items-center justify-center rounded-xl px-4 text-sm font-bold underline disabled:opacity-60"
      >
        {wait > 0 ? `Send a new code (${wait}s)` : 'Send a new code'}
      </button>
      <p className="mt-2 text-xs">
        The door stays open for {minutes} minutes from your code.
        Everything you read or add inside is written on the case&rsquo;s record.
      </p>
    </form>
  );
}
