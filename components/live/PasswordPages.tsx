'use client';

// The two pages for a forgotten password, each with one job:
//
//   /forgot-password  type your address and we e-mail you a link
//   /new-password     the link opens here; choose a new password
//
// The sign-in page only links to the first. Reported on 26 October 2026:
// "for making new password, it should be a separate web page, not in the log
// in page so that users will not be confused why it was used in the log in
// page." The rules and the calls are in lib/live/password.ts.

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { APP_SHORT_NAME } from '@/lib/brand';
import { homeFor } from '@/lib/live/session';
import * as live from '@/lib/live/data';
import { enterCode } from '@/lib/live/two-step';
import { humanError } from '@/lib/live/errors';
import {
  PASSWORD_MIN, passwordProblem, redeemPasswordLink, saveNewPassword, sendPasswordLink,
} from '@/lib/live/password';
import { Button, Card } from '@/components/ui';
import { Notice, emailLooksValid } from '@/components/live/shared';
import { PublicHeader } from '@/components/live/DoorPages';
import { CodeEntry } from '@/components/live/TwoStep';
import { usePhrases } from '@/lib/i18n';
import { DOOR_WORDS } from '@/lib/words/door';

const field = 'tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold';

// ------------------------------------------------------- forgot password ----

export function LiveForgotPasswordPage() {
  const params = useSearchParams();
  const say = usePhrases(DOOR_WORDS);
  // ?first=1: an invited person who never chose a password. The same link,
  // in words that fit somebody who has not forgotten anything.
  const first = params.get('first') === '1';
  const [email, setEmail] = useState(() => (params.get('email') ?? '').trim().toLowerCase());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const address = email.trim().toLowerCase();
    if (!emailLooksValid(address)) {
      setError('That e-mail address does not look right. Check it and try again.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await sendPasswordLink(address);
      setSentTo(address);
    } catch (cause) {
      setError(humanError(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <PublicHeader
        title={first ? say('Set your password') : say('Forgot your password?')}
        subtitle={say('We will e-mail you a link to choose a new one.')}
      />
      <div className="mx-auto max-w-md space-y-5 px-4 pb-32 pt-8">
        <Card className="p-5" data-panel="forgot-password">
          {sentTo ? (
            <div role="status" data-forgot-sent>
              <p className="text-lg font-bold text-navy">{say('Check your e-mail')}</p>
              {/* The same words whether or not the address has an account, so
                  this page cannot tell anybody who belongs to the church. */}
              <p className="mt-2 text-gray-700">
                {say('If that address has an account, a link to choose a new password is on its way. It works for one hour, and only the newest one works.')}
              </p>
              <p className="mt-3 text-sm text-gray-600">
                {say('Nothing after a few minutes? Look in Spam and Promotions, then ask again.')}
              </p>
              <button
                type="button"
                onClick={() => setSentTo('')}
                className="mt-4 text-sm font-semibold text-navy underline"
              >
                {say('Send it again, or to another address')}
              </button>
            </div>
          ) : (
            <form onSubmit={send} className="space-y-4" noValidate>
              {first && (
                <p className="text-gray-700">
                  {say('If you were invited but never got as far as choosing one, there is nothing to type here yet. The password in an invitation e-mail also stops working three days after it was sent. Either way, we can send you a link that lets you choose your own now.')}
                </p>
              )}
              <label className="block">
                <span className="text-sm font-semibold text-gray-600">{say('E-mail')}</span>
                <input
                  type="email"
                  // Addresses read left to right in every language.
                  dir="ltr"
                  inputMode="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => { setEmail(event.target.value); setError(''); }}
                  className={field}
                  required
                />
              </label>
              {error && <Notice tone="error">{say(error)}</Notice>}
              <Button type="submit" variant="gold" className="w-full" disabled={busy}>
                {busy ? say('Sending…') : say('E-mail me a link')}
              </Button>
            </form>
          )}
        </Card>
        <p className="text-center text-sm text-gray-600">
          <Link href={`/login${email ? `?email=${encodeURIComponent(email.trim().toLowerCase())}` : ''}`} className="font-semibold text-navy underline">
            {say('Back to sign in')}
          </Link>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------- new password ----

type Stage =
  | { at: 'checking' }
  | { at: 'someone-else'; email: string }
  | { at: 'dead'; reason: string }
  | { at: 'choose'; email: string }
  | { at: 'code'; email: string }
  | { at: 'done'; home: string | null };

export function LiveNewPasswordPage() {
  const params = useSearchParams();
  const router = useRouter();
  const say = usePhrases(DOOR_WORDS);
  const [stage, setStage] = useState<Stage>({ at: 'checking' });
  const [handover, setHandover] = useState(false);
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Safari and password managers can fill a box without a React change event,
  // so the boxes themselves are read before checking and saving.
  const first = useRef<HTMLInputElement>(null);
  const second = useRef<HTMLInputElement>(null);
  // The link is redeemed once: React may run an effect twice.
  const tried = useRef('');

  useEffect(() => {
    const key = `${handover}`;
    if (tried.current === key) return;
    tried.current = key;
    let alive = true;
    void (async () => {
      try {
        const r = await redeemPasswordLink(new URLSearchParams(window.location.search), window.location.hash, handover);
        if (!alive) return;
        if (r.state === 'signed-in') { router.replace('/password'); return; }
        if (r.state === 'ready') setStage({ at: 'choose', email: r.email });
        else if (r.state === 'someone-else') setStage({ at: 'someone-else', email: r.email });
        else if (r.state === 'no-link') setStage({ at: 'dead', reason: 'This page opens from the link in a password e-mail. Ask for one below.' });
        else setStage({ at: 'dead', reason: r.reason });
      } catch (cause) {
        if (alive) setStage({ at: 'dead', reason: humanError(cause, 'This link has run out or has already been used. Ask for a new one.') });
      }
    })();
    return () => { alive = false; };
    // The address is read once, from the page as it opened.
  }, [handover, router]);

  const email = stage.at === 'choose' || stage.at === 'code' ? stage.email : '';

  const read = () => {
    const chosen = first.current?.value ?? password;
    const confirmation = second.current?.value ?? again;
    if (chosen !== password) setPassword(chosen);
    if (confirmation !== again) setAgain(confirmation);
    return { chosen, confirmation };
  };

  const finish = async () => {
    const me = await live.getMyProfile().catch(() => null);
    setStage({ at: 'done', home: me?.is_approved ? homeFor(me.role) : null });
  };

  const save = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const { chosen, confirmation } = read();
    const problem = passwordProblem(chosen, confirmation, email);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError('');
    try {
      await saveNewPassword(chosen);
      await finish();
    } catch (cause) {
      // An account with an authenticator app needs its code before the
      // password can change. Ask for it here, then save again.
      if ((cause as { code?: string })?.code === 'insufficient_aal' || /AAL2/i.test(String((cause as Error)?.message))) {
        setStage({ at: 'code', email });
        return;
      }
      setError(humanError(cause));
    } finally {
      setBusy(false);
    }
  };

  if (stage.at === 'checking') {
    return (
      <div className="min-h-screen">
        <PublicHeader title={say('Choose a new password')} subtitle={say('Checking your link…')} />
      </div>
    );
  }

  if (stage.at === 'someone-else') {
    return (
      <div className="min-h-screen">
        <PublicHeader title={say('Whose link is this?')} subtitle={say('Someone is already signed in on this device.')} />
        <div className="mx-auto max-w-md px-4 pb-32 pt-8">
          <Card className="p-5">
            <p className="text-gray-700">
              {say('This device is signed in as {email}. Opening this link here signs them out and changes the password of the account the link was sent to.', { email: stage.email })}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="gold" onClick={() => router.replace('/')}>{say('Go back, this is not my link')}</Button>
              <Button variant="ghost" onClick={() => { setStage({ at: 'checking' }); setHandover(true); }}>
                {say('It is mine, carry on')}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  if (stage.at === 'dead') {
    return (
      <div className="min-h-screen">
        <PublicHeader title={say('Choose a new password')} subtitle={say('This link cannot be used.')} />
        <div className="mx-auto max-w-md px-4 pb-32 pt-8">
          <Card className="p-5" data-panel="new-password-dead">
            <Notice tone="error">{say(stage.reason)}</Notice>
            <p className="mt-3 text-sm text-gray-600">
              {say('Each link works once, for one hour, and only the newest one works.')}
            </p>
            <Link
              href="/forgot-password"
              className="tap mt-4 inline-flex w-full items-center justify-center rounded-xl bg-gold px-4 font-bold text-navy"
            >
              {say('E-mail me a new link')}
            </Link>
            <p className="mt-4 text-center text-sm">
              <Link href="/login" className="font-semibold text-navy underline">{say('Back to sign in')}</Link>
            </p>
          </Card>
        </div>
      </div>
    );
  }

  if (stage.at === 'code') {
    return (
      <div className="min-h-screen">
        <PublicHeader title={say('Enter your code')} subtitle={say('One more step before your new password is saved.')} />
        <div className="mx-auto max-w-md px-4 pb-32 pt-8">
          <Card className="p-5" data-panel="new-password-code">
            <p className="mb-4 text-gray-700">
              {say('Your account uses two-step sign-in. Type the six-digit code your authenticator app shows for this app, and your new password is saved straight after.')}
            </p>
            <CodeEntry
              id="new-password-code"
              action="Save my new password"
              onCode={async (code) => {
                // A wrong code stays here, and CodeEntry says so.
                await enterCode(code);
                try {
                  await saveNewPassword(password);
                  await finish();
                } catch (cause) {
                  // Anything else about the password itself is fixed where it was typed.
                  setStage({ at: 'choose', email });
                  setError(humanError(cause));
                }
              }}
            />
          </Card>
        </div>
      </div>
    );
  }

  if (stage.at === 'done') {
    return (
      <div className="min-h-screen">
        <PublicHeader title={say('Your password is changed')} subtitle={say('Use it the next time you sign in.')} />
        <div className="mx-auto max-w-md px-4 pb-32 pt-8">
          <Card className="p-6 text-center" data-panel="new-password-done">
            <p className="text-gray-700">
              {say('Every other phone or computer signed in to your account has been signed out.')}
            </p>
            {stage.home ? (
              <Button variant="gold" className="mt-5 w-full" onClick={() => window.location.replace(stage.home!)}>
                {say('Continue to {app}', { app: APP_SHORT_NAME })}
              </Button>
            ) : (
              <>
                <p className="mt-3 text-gray-600">
                  {say('A church leader must approve your account before you enter the app.')}
                </p>
                <Link href="/login" className="mt-4 inline-block font-semibold text-navy underline">{say('Go to sign in')}</Link>
              </>
            )}
          </Card>
        </div>
      </div>
    );
  }

  // Choosing it.
  const hint = password || again ? passwordProblem(password, again, email) : '';
  return (
    <div className="min-h-screen">
      <PublicHeader title={say('Choose a new password')} subtitle={say('Choose a password only you know.')} />
      <div className="mx-auto max-w-md px-4 pb-32 pt-8">
        <Card className="p-5" data-panel="new-password">
          <form onSubmit={save} className="space-y-4" noValidate>
            <p className="text-sm text-gray-600">
              {say('For the account {email}.', { email })}
            </p>
            {/* A password manager saves the new password against this address. */}
            <input type="email" autoComplete="username" value={email} readOnly hidden />
            <label className="block">
              <span className="text-sm font-semibold text-gray-600">{say('New password')}</span>
              <input
                ref={first}
                id="new-password"
                name="new-password"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                minLength={PASSWORD_MIN}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                onInput={(e) => setPassword(e.currentTarget.value)}
                aria-describedby="new-password-rules"
                className={field}
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-gray-600">{say('Type it again')}</span>
              <input
                ref={second}
                id="confirm-password"
                name="confirm-password"
                type={show ? 'text' : 'password'}
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={again}
                onChange={(e) => { setAgain(e.target.value); setError(''); }}
                onInput={(e) => setAgain(e.currentTarget.value)}
                className={field}
                required
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={show}
                onChange={(e) => { read(); setShow(e.target.checked); }}
                className="h-4 w-4"
              />
              {say('Show what I am typing')}
            </label>
            <p id="new-password-rules" className="text-xs text-gray-500">
              {say('At least 10 characters. A few words only you would put together is easy to remember and hard to guess.')}
            </p>
            {!error && hint && password.length > 0 && (
              <p className="text-sm font-semibold text-amber-800" data-new-password-hint>{say(hint)}</p>
            )}
            {error && <Notice tone="error">{say(error)}</Notice>}
            <Button type="submit" variant="gold" className="w-full" disabled={busy}>
              {busy ? say('Saving…') : say('Save new password')}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
