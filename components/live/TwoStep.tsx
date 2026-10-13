'use client';

// Two-step sign-in, on screen: the code at sign-in, and setting it up in Settings.
//
// The work is in lib/live/two-step.ts and the lock is in the database
// (20261013140000_a_second_step_once_set_up_is_required). These are the three
// places a person meets it:
//
//   * CodeEntry: six digits, the one box both other places use.
//   * TwoStepGate: stands in front of the whole signed-in app while the code is
//     owed (components/LiveAppShell.tsx), the way the consent step does.
//   * TwoStepCard: Settings, Password. Set it up, see that it is on, turn it off.
//
// WORDS A PERSON ALREADY KNOWS. "Authenticator app" is what the app stores call
// these apps, and "code" is what the apps themselves show. Nothing here says
// TOTP, factor or assurance level.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NAVY } from '@/lib/brand';
import { useLiveSession } from '@/lib/live/session';
import {
  beginSecondStep,
  cleanCode,
  confirmedFactors,
  enterCode,
  finishSecondStep,
  groupedSecret,
  refreshMyFactors,
  turnOffSecondStep,
  type NewSecondStep,
} from '@/lib/live/two-step';
import { humanError } from '@/lib/live/errors';
import { copyText } from '@/lib/share';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { Button, Card } from '@/components/ui';
import { usePhrases } from '@/lib/i18n';
import { TWO_STEP_WORDS } from '@/lib/words/two-step';

const failed = (cause: unknown) => humanError(cause, 'Something went wrong. Please try again.');

/** Six digits from the authenticator app, and the button that sends them. */
export function CodeEntry({
  id,
  label = 'Code from your authenticator app',
  action = 'Continue',
  onCode,
}: {
  id: string;
  label?: string;
  action?: string;
  onCode: (code: string) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  // Kept in English and put into the reader's language where it is drawn, so
  // the sign-in service's refusals (lib/live/two-step.ts) are translated too.
  const [error, setError] = useState('');
  const box = useRef<HTMLInputElement>(null);
  const say = usePhrases(TWO_STEP_WORDS);

  useEffect(() => { box.current?.focus(); }, []);

  const ready = cleanCode(code) !== null && !busy;

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const digits = cleanCode(code);
    if (!digits) { setError('Type the six digits your authenticator app shows.'); return; }
    setBusy(true);
    setError('');
    try {
      await onCode(digits);
    } catch (cause) {
      setError(failed(cause));
      // A wrong code is retyped, not edited: clear it and keep the focus.
      setCode('');
      box.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={send} className="text-left">
      <label htmlFor={id} className="block text-sm font-semibold text-navy">{say(label)}</label>
      {/* one-time-code lets a phone offer the code from its own authenticator. */}
      <input
        id={id}
        ref={box}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/[^\d\s]/g, '').slice(0, 7))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        placeholder="123 456"
        aria-describedby={error ? `${id}-error` : undefined}
        className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-center text-2xl font-bold tracking-[0.3em] text-navy outline-none focus:ring-2 focus:ring-gold"
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
          {say(error)}
        </p>
      )}
      <Button type="submit" className="mt-4 w-full" disabled={!ready}>
        {busy ? say('Checking…') : say(action)}
      </Button>
    </form>
  );
}

/** What somebody who has lost their phone can do. Said in the same words everywhere. */
function LostPhone() {
  const say = usePhrases(TWO_STEP_WORDS);
  return (
    <p className="mt-4 text-sm leading-relaxed text-gray-500">
      {say('Lost the phone with your authenticator app? Ask your church’s Director to contact whoever looks after the app. They can remove two-step sign-in from your account so you can sign in with your password and set it up again.')}
    </p>
  );
}

/** The sign-in page's second half: the code, after a right password. */
export function TwoStepSignInCard({
  onCode,
  onCancel,
}: {
  onCode: (code: string) => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const say = usePhrases(TWO_STEP_WORDS);
  return (
    <Card className="p-5">
      <p className="text-gray-600">
        {say('Your password is right. Your account also uses two-step sign-in: open your authenticator app and type the six-digit code it shows for this app.')}
      </p>
      <div className="mt-4">
        <CodeEntry id="sign-in-code" onCode={onCode} />
      </div>
      <LostPhone />
      <button
        type="button"
        onClick={() => void onCancel()}
        className="tap-sm mt-4 rounded-full px-4 text-sm font-bold text-navy ring-1 ring-navy/20"
      >
        {say('Use a different account')}
      </button>
    </Card>
  );
}

/** In front of the whole signed-in app while the code is owed. */
export function TwoStepGate() {
  const { session, refreshProfile, signOut } = useLiveSession();
  const router = useRouter();
  const say = usePhrases(TWO_STEP_WORDS);

  return (
    <div className="grid min-h-screen place-items-center px-4" style={{ backgroundColor: NAVY }}>
      <Card className="w-full max-w-md p-6 text-center">
        <SentryBeaconMark size={56} className="mx-auto" />
        <h1 className="mt-4 text-2xl font-extrabold text-navy">{say('Enter your code')}</h1>
        <p className="mt-2 text-gray-600">
          {say('Your account uses two-step sign-in. Open your authenticator app and type the six-digit code it shows for this app.')}
        </p>
        {session?.user.email && (
          <p className="mt-2 text-sm text-gray-500">{say('Signing in as {email}', { email: session.user.email })}</p>
        )}
        <div className="mt-5">
          <CodeEntry
            id="two-step-gate-code"
            onCode={async (code) => {
              await enterCode(code);
              await refreshProfile();
            }}
          />
        </div>
        <LostPhone />
        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.replace('/login');
          }}
          className="tap-sm mt-4 rounded-full px-4 text-sm font-bold text-navy ring-1 ring-navy/20"
        >
          {say('Sign out')}
        </button>
      </Card>
    </div>
  );
}

/** Settings, Password: set two-step sign-in up, see it is on, or turn it off. */
export function TwoStepCard() {
  const { session, profile, refreshProfile } = useLiveSession();
  const [on, setOn] = useState<string | null>(() => confirmedFactors(session)[0]?.id ?? null);
  const [setup, setSetup] = useState<NewSecondStep | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [confirmOff, setConfirmOff] = useState(false);
  const [copied, setCopied] = useState(false);

  // The stored session can be older than a change made on another device, so
  // ask once when the card opens. Quiet on failure: the session's own answer
  // stands until it can be checked.
  const recheck = useCallback(async () => {
    const fresh = await refreshMyFactors().catch(() => null);
    if (fresh) setOn(confirmedFactors(fresh)[0]?.id ?? null);
  }, []);
  useEffect(() => { void recheck(); }, [recheck]);

  const leads = profile?.role === 'admin' || profile?.role === 'executive';

  const start = async () => {
    setBusy(true); setError(''); setDone('');
    try {
      setSetup(await beginSecondStep());
    } catch (cause) {
      setError(failed(cause));
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    if (!on) return;
    setBusy(true); setError(''); setDone('');
    try {
      await turnOffSecondStep(on);
      setOn(null);
      setConfirmOff(false);
      setDone('Two-step sign-in is off. Your password alone signs you in again.');
      await refreshProfile().catch(() => null);
    } catch (cause) {
      setError(failed(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5" id="two-step">
      <h2 className="text-xl font-bold text-navy">Two-step sign-in</h2>

      {on && !setup && (
        <>
          <p className="mt-2 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold leading-relaxed text-green-800 ring-1 ring-green-200">
            On. Each new sign-in asks for your password and then a code from your
            authenticator app.
          </p>
          <LostPhone />
          <div className="mt-4 border-t border-black/5 pt-4">
            {!confirmOff ? (
              <button
                type="button"
                onClick={() => setConfirmOff(true)}
                className="tap-sm rounded-full bg-white px-4 text-sm font-bold text-navy ring-1 ring-navy/20"
              >
                Turn off two-step sign-in
              </button>
            ) : (
              <div>
                <p className="text-sm font-semibold text-navy">
                  Turn it off? Your password alone will sign you in again.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={turnOff}
                    className="tap-sm rounded-full bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {busy ? 'Turning off…' : 'Yes, turn it off'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmOff(false)}
                    className="tap-sm rounded-full bg-white px-4 text-sm font-bold text-navy ring-1 ring-navy/20"
                  >
                    Keep it on
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {!on && !setup && (
        <>
          <p className="mt-1 text-sm leading-relaxed text-gray-600">
            Add a second step after your password: a six-digit code from an
            authenticator app on your phone. Somebody who learns your password still
            cannot sign in as you.
          </p>
          {leads && (
            <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold leading-relaxed text-amber-900 ring-1 ring-amber-200">
              Recommended for you. As a leader you can see your church&rsquo;s list of
              members, so your account is worth protecting with more than a password.
            </p>
          )}
          <div className="mt-4">
            <Button onClick={start} disabled={busy}>
              {busy ? 'Starting…' : 'Set it up'}
            </Button>
          </div>
        </>
      )}

      {setup && (
        <ol className="mt-3 grid gap-4 text-sm leading-relaxed text-gray-700">
          <li>
            <p className="font-semibold text-navy">1. Get an authenticator app</p>
            <p className="mt-1">
              Any one will do: Google Authenticator, Microsoft Authenticator, or the
              password manager you already use. Install it from your phone&rsquo;s app store.
            </p>
          </li>
          <li>
            <p className="font-semibold text-navy">2. Add this account to it</p>
            <p className="mt-1">In the app, choose to add an account and scan this picture.</p>
            {/* A data: address: shown by <img>, which runs nothing, and fetched from nowhere. */}
            <img
              src={setup.qr}
              alt="Picture code for your authenticator app"
              width={180}
              height={180}
              className="mt-3 rounded-xl bg-white p-2 ring-1 ring-black/10"
            />
            <p className="mt-3">Setting it up on this same phone? Type this key into the app instead:</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <code className="rounded-lg bg-gray-100 px-3 py-2 font-mono text-sm font-bold tracking-wider text-navy">
                {groupedSecret(setup.secret)}
              </code>
              <button
                type="button"
                onClick={async () => {
                  // lib/share.ts guards the clipboard; the key stays on screen to type.
                  if (await copyText(setup.secret)) setCopied(true);
                }}
                className="tap-sm rounded-full bg-white px-3 text-xs font-bold text-navy ring-1 ring-navy/20"
              >
                {copied ? 'Copied' : 'Copy key'}
              </button>
            </div>
          </li>
          <li>
            <p className="font-semibold text-navy">3. Type the code it shows</p>
            <div className="mt-2">
              <CodeEntry
                id="two-step-setup-code"
                label="Code from your authenticator app"
                action="Turn it on"
                onCode={async (code) => {
                  await finishSecondStep(setup.factorId, code);
                  setOn(setup.factorId);
                  setSetup(null);
                  setDone('Two-step sign-in is on. Next time you sign in, have your phone with you.');
                  await refreshProfile().catch(() => null);
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => { setSetup(null); setCopied(false); }}
              className="tap-sm mt-3 rounded-full px-4 text-sm font-bold text-navy ring-1 ring-navy/20"
            >
              Cancel
            </button>
          </li>
        </ol>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
          {error}
        </p>
      )}
      {done && (
        <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          {done}
        </p>
      )}
    </Card>
  );
}
