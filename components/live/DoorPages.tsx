'use client';

import { oversightPoints } from '@/lib/oversight';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { NAVY, roleNoun, APP_SHORT_NAME, SOURCE_URL } from '@/lib/brand';
import { homeFor, useLiveSession } from '@/lib/live/session';
import * as live from '@/lib/live/data';
import { clearBrowserSession, saveBrowserSession, supabaseAuth } from '@/lib/supabase/client';
import type { Role } from '@/lib/types';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { useTutorialMode } from '@/lib/tutorial';
import { InstallHomeButton } from '@/components/InstallHomeButton';
import { Button, Card } from '@/components/ui';
import { Notice, emailLooksValid, errorText } from '@/components/live/shared';
import { ConsentWording } from '@/components/live/ConsentWording';
import { TwoStepSignInCard } from '@/components/live/TwoStep';
import { LanguagePick } from '@/components/LanguagePick';
import { usePhrases } from '@/lib/i18n';
import { DOOR_WORDS } from '@/lib/words/door';
import { GENDER_OPTIONS, LIFE_STATUS_OPTIONS, optionsFor, selectedValue } from '@/lib/about-you';

// The signed-out screens: the front door, sign-in and the invited person's join page.

function PublicHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const say = usePhrases(DOOR_WORDS);
  return (
    <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
      <div className="mx-auto flex max-w-md flex-col items-center">
        {/* Home at the start of the row, language at the end (mirrored in Arabic). */}
        <div className="flex w-full items-center justify-between gap-3">
          <Link href="/" className="text-sm text-white/60 underline">
            <span aria-hidden className="inline-block rtl:-scale-x-100">←</span> {say('Home')}
          </Link>
          <LanguagePick />
        </div>
        <SentryBeaconMark size={58} className="mt-3" />
        <h1 className="mt-3 text-3xl font-extrabold">{title}</h1>
        <p className="mt-1 text-white/70">{subtitle}</p>
      </div>
    </div>
  );
}


export function LiveHomePage() {
  const { session, profile, loading } = useLiveSession();
  const say = usePhrases(DOOR_WORDS);
  const { enterTutorial } = useTutorialMode();
  const router = useRouter();

  useEffect(() => {
    // Some Supabase mail templates return to the configured site root. Route
    // only authentication callbacks into the password screen; an ordinary
    // Sign in tap still goes straight to /login.
    const query = window.location.search;
    const hash = window.location.hash;
    if (/\b(code|token_hash)=/.test(query) || /\baccess_token=/.test(hash)) {
      router.replace(`/join${query}${hash}`);
    }
  }, [router]);

  return (
    <div className="relative min-h-screen text-white" style={{ backgroundColor: NAVY }}>
      {/* Language picker, in the corner (components/LanguagePick.tsx). */}
      <div className="absolute end-4 top-[max(1rem,env(safe-area-inset-top))] z-10">
        <LanguagePick />
      </div>
      <main className="mx-auto flex min-h-[100svh] max-w-lg flex-col items-center justify-center px-4 pb-10 pt-20 text-center">
        {/* Decoration: aria-hidden, and it cannot take a tap. */}
        <span className="beacon-glow" aria-hidden>
          <SentryBeaconMark size={92} />
        </span>
        <h1 className="mt-6 text-5xl font-extrabold tracking-tight">{APP_SHORT_NAME}</h1>
        <p className="mt-3 text-xl font-semibold text-white/90">
          {say('Walking with Jesus, one step at a time.')}
        </p>
        <p className="mt-1 text-base text-white/60">
          {say('And never on your own. One person, walking with one person.')}
        </p>

        <Button
          variant="gold"
          className="mt-9 w-full text-xl"
          disabled={loading}
          onClick={() =>
            router.push(session && profile ? homeFor(profile.role) : '/login')
          }
        >
          {session && profile
            ? say('Continue as {name}', { name: profile.full_name.split(' ')[0] || say('member') })
            : say('Sign in')}
        </Button>

        <Link href="/signup" className="mt-5 font-semibold underline underline-offset-4">
          {say('I have an invitation')}
        </Link>
        <p className="mt-7 max-w-sm text-sm leading-relaxed text-white/55">
          {say('By invitation. Someone from your church brings you in, so there is nothing to sign up for here.')}
        </p>
        {/* Questions, before anybody signs in (app/faq/page.tsx). */}
        <Link href="/faq" className="mt-3 text-sm font-semibold underline underline-offset-4" data-faq-link>
          {say('Questions? Read the answers')}
        </Link>

        {/* The way into the tutorial, below the real way in, so invited members never
           have to read past it. */}
        <div className="mt-10 w-full max-w-sm rounded-2xl bg-white/10 p-5 text-center ring-1 ring-white/15">
          <p className="text-base font-bold">{say('Not invited yet? Look around first.')}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70">
            {say('A complete working church with sample people in it. Every feature the real app has, including the guided walk for your role.')}
          </p>
          <button
            type="button"
            onClick={() => {
              enterTutorial();
              router.push('/');
            }}
            className="tap mt-4 w-full rounded-xl bg-white/90 px-4 font-bold text-navy hover:bg-white"
          >
            🧪 {say('Open the tutorial')}
          </button>
          <p className="mt-2.5 text-xs text-white/55">
            {say("Runs entirely in this browser. No account, no database, nothing sent anywhere, and nothing you do there can touch a church's real data.")}
          </p>
        </div>

        {/* Install, at the bottom of the front door, for people not yet signed in. */}
        {/* dir="auto": this stays English in every language, so it takes its direction
           from its own words. */}
        <div className="mt-10 w-full max-w-sm" dir="auto">
          <InstallHomeButton />
        </div>

        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-9 text-sm text-white/65 underline underline-offset-4"
        >
          {say('Developers: view and contribute on GitHub')} ↗
        </a>
      </main>
    </div>
  );
}


export function LiveLoginPage() {
  const router = useRouter();
  // Messages are kept in English in state and translated where drawn.
  const say = usePhrases(DOOR_WORDS);
  const { session, profile, loading: sessionLoading, secondStep, refreshProfile, signOut } = useLiveSession();
  const params = useSearchParams();
  // Filled from the invitation link (/login?email=...), so only the password is needed.
  const [email, setEmail] = useState(() => (params.get('email') ?? '').trim().toLowerCase());
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => {
    switch (params.get('error')) {
      case 'credentials': return 'That email and password did not match.';
      case 'missing': return 'Enter your e-mail and password.';
      case 'profile': return 'Your account profile is not ready yet.';
      case 'unavailable': return 'Could not reach live sign-in. Please try again.';
      case 'busy': return 'Too many sign-in attempts just now. Wait a few minutes, then try again.';
      case 'second-step': return 'Your account uses two-step sign-in. Sign in here to enter your code.';
      default: return '';
    }
  });
  const [notice, setNotice] = useState(() => (
    params.get('email')
      ? 'Your address is filled in. Copy the password from your invitation e-mail.'
      : ''
  ));
  // Password accepted and two-step sign-in is on: the code comes next (components/live/TwoStep.tsx).
  const [codeStep, setCodeStep] = useState(false);
  // Set when a refusal could also mean an unfinished account (see where it is set).
  const [couldBeUnfinished, setCouldBeUnfinished] = useState(false);
  // The sign-in from the invitation link runs once only.
  const arrived = useRef(false);

  useEffect(() => {
    if (!sessionLoading && session && profile?.is_approved) {
      router.replace(homeFor(profile.role));
    }
  }, [sessionLoading, session, profile, router]);

  // Arriving from the invitation: the link signs the person in. The password
  // travels in the URL fragment (#p=), which browsers never send to a server or
  // in a Referer, and it is removed from the address bar before anything else.
  // If it no longer works, the person is left at the form with their address filled in.
  useEffect(() => {
    if (arrived.current) return;
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#p=')) return;
    arrived.current = true;

    const handed = (() => {
      try { return decodeURIComponent(hash.slice(3)); } catch { return ''; }
    })();

    // Remove the password from the address bar first, before any await.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    // No valid address in the link: say so rather than leave an empty box.
    if (!handed || !emailLooksValid(email)) {
      setNotice('');
      setError('Enter the e-mail and password from your invitation to sign in.');
      return;
    }

    void (async () => {
      setBusy(true);
      setError('');
      setNotice('Signing you in…');
      try {
        const mine = await live.signIn(email, handed);
        if (mine.second_step) {
          setNotice('');
          setCodeStep(true);
          return;
        }
        if (!mine.is_approved) {
          setNotice('');
          setError('Your password is correct, but your account is waiting for a Director to approve it. Ask your church to approve you, then sign in again.');
          return;
        }
        window.location.replace(homeFor(mine.role));
      } catch {
        setNotice('');
        setError('Please type the password from your invitation e-mail below.');
      } finally {
        setBusy(false);
      }
    })();
  }, [email]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = form.get('password');
    if (!emailLooksValid(email) || typeof password !== 'string' || !password) return;
    setBusy(true);
    setError('');
    setNotice('');
    setCouldBeUnfinished(false);
    try {
      const mine = await live.signIn(email, password);
      if (mine.second_step) {
        setCodeStep(true);
        return;
      }
      if (!mine.is_approved) {
        // Say why: a correct password that seems to do nothing reads as broken.
        setError('Your password is correct, but your account is waiting for a Director to approve it. Ask your church to approve you, then sign in again.');
        return;
      }
      window.location.replace(homeFor(mine.role));
    } catch (cause) {
      setError(errorText(cause));
      // An account with no password yet is refused as "invalid credentials". Remember
      // that, so the screen can offer a fresh link in words that fit.
      setCouldBeUnfinished(/credential|password|invalid/i.test(String((cause as Error)?.message ?? '')));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!emailLooksValid(email)) {
      setError('Enter your e-mail first.');
      return;
    }
    const client = supabaseAuth();
    if (!client) return;
    setBusy(true);
    setError('');
    const { error: resetError } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/join?recovery=1`,
    });
    setBusy(false);
    if (resetError) setError(resetError.message);
    else setNotice('If that address has an account, a password-reset e-mail is on its way.');
  };

  if (codeStep || secondStep) {
    return (
      <div className="min-h-screen">
        <PublicHeader title={say('Enter your code')} subtitle={say('One more step to sign in.')} />
        <div className="mx-auto max-w-md space-y-5 px-4 py-8">
          <TwoStepSignInCard
            onCode={async (code) => {
              const mine = await live.finishSignInWithCode(code);
              if (mine.is_approved) {
                window.location.replace(homeFor(mine.role));
                return;
              }
              // Waiting for approval: the provider re-reads the profile and shows the waiting card.
              setCodeStep(false);
              await refreshProfile().catch(() => null);
            }}
            onCancel={async () => {
              await signOut();
              setCodeStep(false);
              setError('');
            }}
          />
        </div>
      </div>
    );
  }

  if (session && profile && !profile.is_approved) {
    return (
      <div className="min-h-screen">
        <PublicHeader title={say('Account awaiting approval')} subtitle={say('Your invitation and password worked.')} />
        <div className="mx-auto max-w-md px-4 py-8">
          <Card className="p-6 text-center">
            <p className="text-gray-600">
              {say('A church leader must approve your account before you enter the app.')}
            </p>
            <Button
              className="mt-5"
              onClick={async () => {
                await signOut();
              }}
            >
              {say('Sign out')}
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PublicHeader title={say('Sign in to {app}', { app: APP_SHORT_NAME })} subtitle={say('Use your live church account.')} />
      <div className="mx-auto max-w-md space-y-5 px-4 py-8">
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-gray-600">{say('E-mail')}</span>
              <input
                type="email"
                // Addresses read left to right in every language.
                dir="ltr"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError('');
                }}
                className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
                required
              />
            </label>
            <label className="block">
              <span className="text-sm font-semibold text-gray-600">{say('Password')}</span>
              {/* Show-password toggle. */}
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  className="tap w-full rounded-xl bg-gray-100 px-4 pe-12 text-lg outline-none focus:ring-2 focus:ring-gold"
                  required
                />
                {/* At the END of the box, which in Arabic is the left. */}
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? say('Hide password') : say('Show password')}
                  title={showPassword ? say('Hide password') : say('Show password')}
                  className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-lg hover:bg-black/5"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </label>
            {error && <Notice tone="error">{say(error)}</Notice>}
            {notice && <Notice tone="success">{say(notice)}</Notice>}
            <Button type="submit" variant="gold" className="w-full" disabled={busy}>
              {busy ? say('Signing in…') : say('Sign in')}
            </Button>
          </form>

          <form onSubmit={() => {}} className="hidden">
          </form>
          {/* "Never had a password?": the same reset as "Forgot your password?", in words that fit. */}
          {couldBeUnfinished && (
            // Blue, not sky: dark looks repaint blue-50 readably, but not sky-50.
            <div className="mt-4 rounded-xl bg-blue-50 p-4 ring-1 ring-blue-200">
              <p className="text-sm font-semibold text-navy">
                {say('Never set a password yet?')}
              </p>
              {/* An invitation's password stops working after three days unless changed. */}
              <p className="mt-1 text-sm text-gray-700">
                {say('If you were invited but never got as far as choosing one, there is nothing to type here yet. The password in an invitation e-mail also stops working three days after it was sent. Either way, we can send you a link that lets you choose your own now.')}
              </p>
              <Button
                variant="gold"
                className="mt-3 w-full"
                disabled={busy}
                onClick={resetPassword}
              >
                {busy ? say('Sending…') : say('Send me a link to set my password')}
              </Button>
            </div>
          )}

          <button
            type="button"
            onClick={resetPassword}
            disabled={busy}
            className="mx-auto mt-4 block text-sm text-gray-500 underline"
          >
            {say('Forgot your password?')}
          </button>
        </Card>

        <Card className="p-5 text-center">
          <p className="font-bold text-navy">{say('Invited for the first time?')}</p>
          <p className="mt-1 text-sm text-gray-600">{say('Open the invitation e-mail and set your password there.')}</p>
          <Link href="/signup" className="mt-3 inline-block font-semibold text-navy underline">
            {say('Invitation help')}
          </Link>
          <p className="mt-2">
            <Link href="/faq" className="text-sm font-semibold text-navy underline" data-faq-link>
              {say('Questions people ask')}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}



export function LiveSignupPage() {
  return (
    <div className="min-h-screen">
      <PublicHeader title={`Join ${APP_SHORT_NAME}`} subtitle="There is no public registration." />
      <div className="mx-auto max-w-md space-y-5 px-4 py-8">
        <Card className="p-6">
          <h2 className="text-xl font-bold text-navy">Open your invitation e-mail</h2>
          <p className="mt-2 text-gray-600">
            Tap its invitation button. {APP_SHORT_NAME} will verify the e-mail, ask you to set a password,
            and place your account in the role chosen by your church.
          </p>
        </Card>
        <Card className="p-6">
          <h2 className="text-xl font-bold text-navy">No e-mail yet?</h2>
          <p className="mt-2 text-gray-600">
            Ask your Director to check the address and send a new invitation. Also check Spam and Promotions.
          </p>
        </Card>
        <p className="text-center text-sm text-gray-500">
          Already set a password?{' '}
          <Link href="/login" className="font-semibold text-navy underline">Sign in</Link>
        </p>
        <p className="text-center text-sm text-gray-500">
          What am I joining?{' '}
          <Link href="/faq" className="font-semibold text-navy underline" data-faq-link>Questions people ask</Link>
        </p>
      </div>
    </div>
  );
}

// The invited person's front door: it redeems the invitation link
// (?token_hash=...&type=invite, through verifyOtp), asks a few optional
// questions and for consent, and lands the person in the app.

export function LiveJoinPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { refreshProfile } = useLiveSession();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const passwordInput = useRef<HTMLInputElement>(null);
  const confirmInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [donePending, setDonePending] = useState(false);
  const [error, setError] = useState('');
  // Getting back in when the link is dead: send a fresh reset link, offered in
  // words that fit somebody who never had a password.
  const [rescueEmail, setRescueEmail] = useState('');
  const [rescueNotice, setRescueNotice] = useState('');
  const [rescueBusy, setRescueBusy] = useState(false);
  const [churchName, setChurchName] = useState('');
  const [role, setRole] = useState<Role>('ds');
  const recovery = params.get('recovery') === '1' || params.get('type') === 'recovery';

  // `?preview=ds|dm|admin|executive` shows the real form to a room without an
  // invitation. It never creates a session and submit returns before the
  // network (tests/the-sign-up-can-be-shown.mjs).
  const PREVIEW_ROLES: Role[] = ['ds', 'dm', 'admin', 'executive'];
  const previewParam = params.get('preview') ?? '';
  const preview = PREVIEW_ROLES.includes(previewParam as Role) ? (previewParam as Role) : null;

  // If somebody else is already signed in on this device, ask before redeeming
  // the link, which would replace their session.
  const [signedInAs, setSignedInAs] = useState('');
  const [handover, setHandover] = useState(false);

  // The optional half of the form: it starts collapsed and never blocks the button.
  const [consent, setConsent] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [extra, setExtra] = useState({
    preferred_contact: '',
    birthday: '',
    gender: '',
    life_status: '',
    city_of_residence: '',
    work_industry: '',
    topics: '',
  });
  const setExtraField =
    (key: keyof typeof extra) => (event: React.ChangeEvent<HTMLInputElement>) =>
      setExtra((prev) => ({ ...prev, [key]: event.target.value }));

  // Read the inputs directly too: Safari and password managers can fill them
  // without a React change event.
  const readPasswordFields = () => {
    const chosen = passwordInput.current?.value ?? password;
    const confirmation = confirmInput.current?.value ?? confirm;
    if (chosen !== password) setPassword(chosen);
    if (confirmation !== confirm) setConfirm(confirmation);
    return { chosen, confirmation };
  };

  useEffect(() => {
    let alive = true;
    const establishSession = async () => {
      // A preview returns before any client call, so it cannot redeem or sign out.
      if (preview) {
        setRole(preview);
        setChurchName('Your church');
        setEmail('somebody@example.org');
        setReady(true);
        return;
      }
      const client = supabaseAuth();
      if (!client) return;
      try {
        const tokenHash = params.get('token_hash');
        const code = params.get('code');
        const codeEmail = params.get('email');
        // Read `type` twice: a mail client that re-encodes & as &amp; leaves `amp;type`.
        const kind = (params.get('type') ?? params.get('amp;type')) === 'recovery'
          ? 'recovery'
          : 'invite';

        // Supabase reports an expired or used link in the hash (#error=...&error_code=otp_expired).
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const linkError = hashParams.get('error_description') || hashParams.get('error');
        if (linkError) {
          throw new Error(
            /expired/i.test(linkError)
              // Name the likeliest cause first: an older copy of a re-sent invitation.
              ? 'This link is not the current one. If your church sent more than one '
                + 'invitation, only the newest email works -- open the most recent one '
                + 'and use its button. Otherwise this link has expired, and your church '
                + 'can send a fresh one.'
              : decodeURIComponent(linkError.replace(/\+/g, ' ')),
          );
        }

        const redeeming = Boolean(tokenHash || code);

        // Ask before signing the current person out (a Director testing the link, a
        // shared tablet). Name who is signed in and let them back out.
        if (redeeming && !handover) {
          const { data: current } = await client.auth.getSession();
          const who = current.session?.user?.email ?? '';
          if (who) {
            if (alive) { setSignedInAs(who); setReady(true); }
            return;
          }
        }

        if (redeeming) {
          await client.auth.signOut({ scope: 'local' }).catch(() => {});
          clearBrowserSession();
        }

        if (tokenHash) {
          // The normal path: the token holds everything needed to redeem it.
          const { error: otpError } = await client.auth.verifyOtp({ token_hash: tokenHash, type: kind });
          if (otpError) throw otpError;
        } else if (code && codeEmail) {
          // The six-digit fallback, for a mail client that mangled the link.
          const { error: otpError } = await client.auth.verifyOtp({
            email: codeEmail,
            token: code,
            type: kind,
          });
          if (otpError) throw otpError;
        } else if (code) {
          // A genuine PKCE code, from a flow this browser started itself.
          const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        } else if (window.location.hash.includes('access_token=')) {
          const hash = new URLSearchParams(window.location.hash.slice(1));
          const access_token = hash.get('access_token');
          const refresh_token = hash.get('refresh_token');
          if (access_token && refresh_token) {
            const { error: sessionError } = await client.auth.setSession({ access_token, refresh_token });
            if (sessionError) throw sessionError;
            history.replaceState(null, '', `${location.pathname}${location.search}`);
          }
        }

        const { data } = await client.auth.getSession();
        if (!data.session) {
          // No token and no session is different from a bad token; say so.
          throw new Error(
            redeeming
              ? 'This invitation link is invalid or has expired. Ask your church to send a new one.'
              : 'Open the link in your invitation e-mail to finish setting up your account.',
          );
        }

        // Write the session in the exact shape the data client reads, so a library
        // upgrade cannot leave an approved member looking unapproved.
        saveBrowserSession(data.session);

        // An account that existed before the invitation gets a reset link instead, so
        // claim its invitation before reading the profile.
        await live.claimMyPendingInvitation();
        const mine = await live.getMyProfile();
        if (!alive) return;
        setEmail(data.session.user.email ?? '');
        setName(mine?.full_name || String(data.session.user.user_metadata.full_name ?? ''));
        if (mine?.role) setRole(mine.role);
        // The church's name, so the consent names who is asking.
        try {
          const church = await live.myChurch();
          if (alive && church?.name) setChurchName(church.name);
        } catch {
          /* The name is a courtesy. Not having it must not block joining. */
        }
        await refreshProfile();
      } catch (cause) {
        if (alive) setError(errorText(cause));
      } finally {
        if (alive) setReady(true);
      }
    };
    void establishSession();
    return () => {
      alive = false;
    };
  }, [params, refreshProfile, handover]);

  const isSeeker = role === 'ds';

  const sendFreshLink = async () => {
    const address = rescueEmail.trim().toLowerCase();
    if (!emailLooksValid(address)) {
      setRescueNotice('Enter the address your invitation was sent to.');
      return;
    }
    const client = supabaseAuth();
    if (!client) return;
    setRescueBusy(true);
    await client.auth
      .resetPasswordForEmail(address, { redirectTo: `${window.location.origin}/join?recovery=1` })
      .catch(() => {});
    setRescueBusy(false);
    // The same words whether or not the address has an account, so this cannot
    // reveal who is a member.
    setRescueNotice('If that address has an account, a fresh link is on its way. It lasts one hour.');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (preview) {
      // A preview still runs these checks, so a room can watch a short password refused.
      const { chosen, confirmation } = readPasswordFields();
      if (chosen.length < 10) { setError('Use at least 10 characters.'); return; }
      if (chosen !== confirmation) { setError('The passwords do not match.'); return; }
      if (!consent) { setError('Tick the permission box to continue.'); return; }
      setError('This is a preview. Nothing was created and no account exists.');
      return;
    }
    const { chosen: chosenPassword, confirmation } = readPasswordFields();
    if (chosenPassword.length < 10) {
      setError('Use at least 10 characters.');
      return;
    }
    if (chosenPassword !== confirmation) {
      setError('The passwords do not match.');
      return;
    }
    if (!recovery && !consent) {
      setError('Tick the permission box to continue.');
      return;
    }
    // A CHECK constraint cannot read the clock, so the future-birthday check is here.
    if (extra.birthday && extra.birthday > new Date().toISOString().slice(0, 10)) {
      setError('That birthday is in the future.');
      return;
    }
    const client = supabaseAuth();
    if (!client) return;
    setBusy(true);
    setError('');
    try {
      const { error: passwordError } = await client.auth.updateUser({
        password: chosenPassword,
        data: name.trim() ? { full_name: name.trim() } : undefined,
      });
      if (passwordError) throw passwordError;

      // updateUser can rotate the tokens, so re-publish the current session.
      const { data: fresh } = await client.auth.getSession();
      if (fresh.session) saveBrowserSession(fresh.session);

      // A password chosen here is the person's own: sign out other devices and clear
      // the temporary-password reminder.
      await live.signOutOtherDevices().catch(() => undefined);
      await live.clearTemporaryPasswordReminder().catch(() => undefined);

      if (!recovery) {
        await live.updateMyProfile({
          full_name: name.trim() || undefined,
          preferred_contact: extra.preferred_contact.trim() || undefined,
          birthday: isSeeker ? extra.birthday || undefined : undefined,
          gender: isSeeker ? extra.gender.trim() || undefined : undefined,
          life_status: isSeeker ? extra.life_status.trim() || undefined : undefined,
          city_of_residence: isSeeker ? extra.city_of_residence.trim() || undefined : undefined,
          work_industry: isSeeker ? extra.work_industry.trim() || undefined : undefined,
          topics_of_interest: isSeeker
            ? extra.topics.split(',').map((t) => t.trim()).filter(Boolean)
            : undefined,
          consent_at: new Date().toISOString(),
        });
      } else if (name.trim()) {
        await live.updateMyProfile({ full_name: name.trim() });
      }

      // Sign-up counts as finished only here, once a password has been chosen.
      try {
        await live.finishMySignup();
      } catch {
        /* A missed stamp leaves them shown as waiting, which is recoverable. */
      }

      const mine = await refreshProfile();
      // Three outcomes: approved, waiting, or a profile that could not be read (an error).
      if (!mine) throw new Error('Your account was created, but we could not load it. Please sign in.');
      if (mine.is_approved) router.replace(homeFor(mine.role));
      else setDonePending(true);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  };

  if (!ready) {
    return <div className="grid min-h-screen place-items-center text-white" style={{ backgroundColor: NAVY }}>Checking your secure link…</div>;
  }

  const previewBanner = preview ? (
    <div className="mx-auto max-w-md px-4 pt-4">
      <p className="rounded-xl bg-purple-50 px-4 py-3 text-sm font-semibold text-purple-900 ring-1 ring-purple-200">
        Preview of the sign-up for {roleNoun(preview)}. Nothing here is real and
        nothing can be created. Change the role in the address:{' '}
        <code>?preview=ds</code>, <code>dm</code>, <code>admin</code> or{' '}
        <code>executive</code>.
      </p>
    </div>
  ) : null;

  // Somebody else is signed in here; nothing happens unless they choose it.
  if (signedInAs) {
    return (
      <div className="min-h-screen">
        <PublicHeader
          title="Whose invitation is this?"
          subtitle="Someone is already signed in on this device."
        />
        <div className="mx-auto max-w-md px-4 pb-32 pt-8">
          <Card className="p-5">
            <p className="text-gray-700">
              This device is signed in as <strong className="text-navy">{signedInAs}</strong>.
            </p>
            <p className="mt-3 text-gray-700">
              An invitation link sets up the account it was sent to. Opening it
              here signs <strong>{signedInAs}</strong> out and starts the invited
              person&rsquo;s sign-up on this device.
            </p>
            <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
              If you sent this invitation and only wanted to check the link
              works, go back. Send the link to the person instead. It works on
              their phone, and opening it yourself uses it up.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="gold" onClick={() => router.replace('/')}>
                Go back, this is not my link
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSignedInAs('');
                  setReady(false);
                  setHandover(true);
                }}
              >
                It is mine, sign {signedInAs} out
              </Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }
  if (donePending) {
    return (
      <div className="min-h-screen">
        <PublicHeader title="Your account is ready" subtitle="One approval remains." />
        <div className="mx-auto max-w-md px-4 py-8">
          <Card className="p-6 text-center">
            <p className="text-gray-600">A church leader must approve your account before you enter the app.</p>
            <Link href="/login" className="mt-4 inline-block font-semibold text-navy underline">Go to sign in</Link>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PublicHeader
        title={recovery ? 'Set a new password' : `You’re invited to ${APP_SHORT_NAME}`}
        subtitle={
          recovery
            ? 'Choose a password only you know.'
            : isSeeker
              ? 'Someone from your church will walk with you, at whatever pace suits you.'
              : 'Your church has already chosen your role. Confirm your details to get started.'
        }
      />
      {previewBanner}
      {/* pb-32 keeps the join button clear of the fixed install banner. */}
      <div className="mx-auto max-w-md px-4 pb-32 pt-8">
        <Card className="p-5">
          {error && !email ? (
            <>
              <Notice tone="error">{error}</Notice>
              <p className="mt-3 text-sm text-gray-500">
                Invitations work once, and only the most recent one works. Check your
                inbox for the newest message before asking for another, because a new
                invitation switches off the one you already have.
              </p>

              {/* A way back for an account that has no password yet: send a fresh link. */}
              <div className="mt-5 rounded-xl bg-navy/5 p-4">
                <p className="text-sm font-bold text-navy">Send me a new link</p>
                <p className="mt-1 text-sm text-gray-600">
                  Type the address your invitation was sent to. You do not need a
                  password, and you do not need to ask your church again.
                </p>
                <label className="mt-3 block">
                  <span className="sr-only">Your e-mail address</span>
                  <input
                    type="email"
                    // Addresses read left to right in every language.
                    dir="ltr"
                    inputMode="email"
                    autoComplete="email"
                    value={rescueEmail}
                    onChange={(e) => setRescueEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="tap w-full rounded-xl border border-gray-300 px-4 text-base outline-none focus:border-navy"
                  />
                </label>
                <Button
                  variant="gold"
                  className="mt-3 w-full"
                  disabled={rescueBusy}
                  onClick={sendFreshLink}
                >
                  {rescueBusy ? 'Sending…' : 'E-mail me a new link'}
                </Button>
                {rescueNotice && (
                  <p role="status" className="mt-3 text-sm font-semibold text-navy">{rescueNotice}</p>
                )}
              </div>

              <Link href="/login" className="mt-4 inline-block font-semibold text-navy underline">Go to sign in</Link>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {/* Read-only: the address the invitation was sent to. */}
              <label className="block">
                <span className="text-sm font-semibold text-gray-600">Email</span>
                <input
                  readOnly
                  value={email}
                  aria-describedby="join-email-why"
                  className="tap mt-1 w-full cursor-not-allowed rounded-xl bg-gray-100 px-4 text-base text-gray-500 outline-none"
                />
                <span id="join-email-why" className="mt-1 block text-xs text-gray-500">
                  This is the address your invitation was sent to.
                </span>
              </label>

              {!recovery && (
                <label className="block">
                  <span className="text-sm font-semibold text-gray-600">Your name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    autoComplete="name"
                    className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
                    required
                  />
                </label>
              )}

              <div id="new-password-help" className="rounded-xl bg-blue-50 p-4 text-sm leading-relaxed text-slate-700 ring-1 ring-blue-100">
                <p className="font-semibold text-navy">Choose a password only you know.</p>
                <p className="mt-1">
                  On iPhone, iPad, or Mac, Safari may offer a strong password. That suggestion comes from your device,
                  not {APP_SHORT_NAME}. You can use it or type a password of your own.
                </p>
                <p className="mt-1">
                  After it fills, use <strong>Show password</strong> to check it before saving. The confirmation must match.
                </p>
              </div>

              <label className="block">
                <span className="text-sm font-semibold text-gray-600">
                  {recovery ? 'New password' : 'Choose a password'}
                </span>
                <div className="relative mt-1">
                  <input
                    ref={passwordInput}
                    id="new-password"
                    name="new-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    minLength={10}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onInput={(event) => setPassword(event.currentTarget.value)}
                    aria-describedby="new-password-help"
                    className="tap w-full rounded-xl bg-gray-100 pl-4 pr-14 text-lg outline-none focus:ring-2 focus:ring-gold"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => {
                      readPasswordFields();
                      setShowPassword((v) => !v);
                    }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 grid w-14 place-items-center text-xs font-bold text-navy underline"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                <span className="mt-1 block text-xs text-gray-500">At least 10 characters.</span>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-gray-600">Confirm password</span>
                <input
                  ref={confirmInput}
                  id="confirm-password"
                  name="confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  minLength={10}
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  onInput={(event) => setConfirm(event.currentTarget.value)}
                  aria-describedby="new-password-help"
                  className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-lg outline-none focus:ring-2 focus:ring-gold"
                  required
                />
              </label>

              {!recovery && (
                <>
                  {/* Consent: names the church and what is agreed to. Unticked by default. */}
                  {/* Who looks after this app, before the box is ticked (lib/oversight.ts). */}
                  <div className="space-y-2 rounded-xl bg-gray-50 p-4" data-oversight>
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
                  <label className="flex items-start gap-3 rounded-xl bg-navy/5 p-4">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                      className="mt-1 h-5 w-5 shrink-0"
                    />
                    {/* Names everything that is kept, as specific consent for sensitive
                       information requires (RA 10173 section 13). */}
                    <span className="text-sm leading-relaxed text-gray-700">
                      <ConsentWording churchName={churchName} />{' '}
                      <span className="text-red-600">*</span>
                    </span>
                  </label>

                  {isSeeker && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowMore((v) => !v)}
                        className="text-sm font-semibold text-navy underline"
                      >
                        {showMore
                          ? 'Hide the optional questions'
                          : 'Tell your Guide a little more (optional)'}
                      </button>
                      {showMore && (
                        <div className="mt-3 grid gap-4 sm:grid-cols-2">
                          <JoinField
                            label="Preferred contact"
                            value={extra.preferred_contact}
                            onChange={setExtraField('preferred_contact')}
                            placeholder="Phone, Messenger…"
                          />
                          <JoinField
                            label="Birthday"
                            type="date"
                            value={extra.birthday}
                            onChange={setExtraField('birthday')}
                          />
                          <JoinSelect
                            label="Gender"
                            value={selectedValue(GENDER_OPTIONS, extra.gender)}
                            options={optionsFor(GENDER_OPTIONS, extra.gender)}
                            onChange={(v) => setExtra((prev) => ({ ...prev, gender: v }))}
                          />
                          <JoinSelect
                            label="Status"
                            value={selectedValue(LIFE_STATUS_OPTIONS, extra.life_status)}
                            options={optionsFor(LIFE_STATUS_OPTIONS, extra.life_status)}
                            onChange={(v) => setExtra((prev) => ({ ...prev, life_status: v }))}
                          />
                          <JoinField
                            label="City of residence"
                            value={extra.city_of_residence}
                            onChange={setExtraField('city_of_residence')}
                          />
                          <JoinField
                            label="Work / Industry"
                            value={extra.work_industry}
                            onChange={setExtraField('work_industry')}
                          />
                          <JoinField
                            label="Topics of interest"
                            value={extra.topics}
                            onChange={setExtraField('topics')}
                            placeholder="Comma-separated"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {error && <Notice tone="error">{error}</Notice>}
              <Button
                type="submit"
                variant="gold"
                className="w-full"
                disabled={busy || (!recovery && !consent)}
              >
                {busy ? 'Saving…' : recovery ? 'Save new password' : `Join ${APP_SHORT_NAME} →`}
              </Button>
              {!recovery && !consent && (
                <p className="text-xs text-gray-500">Tick the permission box above to continue.</p>
              )}
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}


/** The join form's picker. See SelectField in shared.tsx for why options are widened. */
function JoinSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-gold"
      >
        <option value="">Prefer not to say</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function JoinField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
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
        className="tap mt-1 w-full rounded-xl bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-gold"
      />
    </label>
  );
}
