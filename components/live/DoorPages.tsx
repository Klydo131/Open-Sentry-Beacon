'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { NAVY, roleNoun, APP_SHORT_NAME } from '@/lib/brand';
import { homeFor, useLiveSession } from '@/lib/live/session';
import * as live from '@/lib/live/data';
import { clearBrowserSession, saveBrowserSession, supabaseAuth } from '@/lib/supabase/client';
import type { Role } from '@/lib/types';
import { SentryBeaconMark } from '@/components/SentryBeaconMark';
import { useTutorialMode } from '@/lib/tutorial';
import { InstallHomeButton } from '@/components/InstallHomeButton';
import { Button, Card } from '@/components/ui';
import { Notice, emailLooksValid, errorText } from '@/components/live/shared';
import { GENDER_OPTIONS, LIFE_STATUS_OPTIONS, optionsFor, selectedValue } from '@/lib/about-you';

// SPLIT OUT OF components/LiveCorePages.tsx, which had grown to three thousand
// lines holding nineteen components: the signed-out door, the Director's whole
// admin screen, both Guide screens, the Explorer's screen and every small piece
// they share. Nobody can hold that in their head, and a maintainer looking for
// the login form had to know it was in a file called "core pages".
//
// The old module still exists as a re-export, so nothing that imported from it
// had to change. New code should import from the file that actually holds the
// screen.

function PublicHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-4 py-8 text-center text-white" style={{ backgroundColor: NAVY }}>
      <div className="mx-auto flex max-w-md flex-col items-center">
        <Link href="/" className="text-sm text-white/60 underline">
          ← Home
        </Link>
        <SentryBeaconMark size={58} className="mt-3" />
        <h1 className="mt-3 text-3xl font-extrabold">{title}</h1>
        <p className="mt-1 text-white/70">{subtitle}</p>
      </div>
    </div>
  );
}


export function LiveHomePage() {
  const { session, profile, loading } = useLiveSession();
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
    <div className="min-h-screen text-white" style={{ backgroundColor: NAVY }}>
      <main className="mx-auto flex min-h-[100svh] max-w-lg flex-col items-center justify-center px-4 py-10 text-center">
        {/* The app is named after a light somebody far away can see. On the
            one screen that is only ever a first impression, it behaves like
            one. Scenery: aria-hidden, and the glow cannot take a tap. */}
        <span className="beacon-glow" aria-hidden>
          <SentryBeaconMark size={92} />
        </span>
        <h1 className="mt-6 text-5xl font-extrabold tracking-tight">{APP_SHORT_NAME}</h1>
        {/* THE THEME FIRST, THE MECHANISM SECOND. This door used to lead with
            "One person, walking with one person" — true, and a description of
            how the app works rather than what it is for. Somebody arriving from
            an invitation reads the top line and nothing else. */}
        <p className="mt-3 text-xl font-semibold text-white/90">
          Walking with Jesus, one step at a time.
        </p>
        <p className="mt-1 text-base text-white/60">
          And never on your own. One person, walking with one person.
        </p>

        <Button
          variant="gold"
          className="mt-9 w-full text-xl"
          disabled={loading}
          onClick={() =>
            router.push(session && profile ? homeFor(profile.role) : '/login')
          }
        >
          {session && profile ? `Continue as ${profile.full_name.split(' ')[0] || 'member'}` : 'Sign in'}
        </Button>

        <Link href="/signup" className="mt-5 font-semibold underline underline-offset-4">
          I have an invitation
        </Link>
        <p className="mt-7 max-w-sm text-sm leading-relaxed text-white/55">
          By invitation. Someone from your church brings you in, so there is
          nothing to sign up for here.
        </p>

        {/* THE WAY INTO THE TUTORIAL, AND IT HAS TO BE ON THIS SCREEN.
            "Invitation only, there is no public sign-up" is true and it is also
            a closed door to everybody who has not been invited yet — which is
            every church still deciding, and every IT person asked to evaluate
            this. They arrived here, read that sentence, and had nowhere to go.
            The tutorial existed and was compiled into this very page, and there
            was no link to it anywhere.

            Kept BELOW the real door on purpose. A member arriving with an
            invitation should never have to read past a tutorial pitch to find
            the way in — this is a real app that comes with a demonstration, not
            a demonstration wearing an app's clothes. */}
        <div className="mt-10 w-full max-w-sm rounded-2xl bg-white/10 p-5 text-center ring-1 ring-white/15">
          <p className="text-base font-bold">Not invited yet? Look around first.</p>
          <p className="mt-1.5 text-sm leading-relaxed text-white/70">
            A complete working church with sample people in it. Every feature the
            real app has, including the guided walk for your role.
          </p>
          <button
            type="button"
            onClick={() => {
              enterTutorial();
              router.push('/');
            }}
            className="tap mt-4 w-full rounded-xl bg-white/90 px-4 font-bold text-navy hover:bg-white"
          >
            🧪 Open the tutorial
          </button>
          <p className="mt-2.5 text-xs text-white/55">
            Runs entirely in this browser. No account, no database, nothing sent
            anywhere, and nothing you do there can touch a church's real data.
          </p>
        </div>

        {/* INSTALL, AT THE BOTTOM OF THE FRONT DOOR.
            It used to be a chip in the signed-in header, which meant the one
            group who most need it -- somebody who has just opened the link
            their church sent and has not signed in yet -- never saw it at all.
            It is also in Settings, for people already inside. */}
        <div className="mt-10 w-full max-w-sm">
          <InstallHomeButton />
        </div>

        <a
          href="https://github.com/Klydo131/Open-Sentry-Beacon"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-9 text-sm text-white/65 underline underline-offset-4"
        >
          Developers: view and contribute on GitHub ↗
        </a>
      </main>
    </div>
  );
}


export function LiveLoginPage() {
  const router = useRouter();
  const { session, profile, loading: sessionLoading, signOut } = useLiveSession();
  const params = useSearchParams();
  // FILLED FROM THE INVITATION. The e-mail links here as
  // /login?email=..., so the address is already in the box and the person only
  // has to copy the password across. Typing an address on a phone is where an
  // older member gives up, and it is the half of the pair they are least likely
  // to get exactly right.
  const [email, setEmail] = useState(() => (params.get('email') ?? '').trim().toLowerCase());
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => {
    switch (params.get('error')) {
      case 'credentials': return 'That email and password did not match.';
      case 'missing': return 'Enter your e-mail and password.';
      case 'profile': return 'Your account profile is not ready yet.';
      case 'unavailable': return 'Could not reach live sign-in. Please try again.';
      default: return '';
    }
  });
  const [notice, setNotice] = useState(() => (
    params.get('email')
      ? 'Your address is filled in. Copy the password from your invitation e-mail.'
      : ''
  ));
  // Set when a sign-in was refused for a reason that an unfinished account
  // would also produce. See the comment where it is set.
  const [couldBeUnfinished, setCouldBeUnfinished] = useState(false);
  // Runs the arrival-from-the-invitation sign-in exactly once. A second attempt
  // after the address bar has been cleaned would have nothing to sign in with,
  // and re-running on every render of a state change would be a login storm.
  const arrived = useRef(false);

  useEffect(() => {
    if (!sessionLoading && session && profile?.is_approved) {
      router.replace(homeFor(profile.role));
    }
  }, [sessionLoading, session, profile, router]);

  // ---------------------------------------------------------------------
  // ARRIVING FROM THE INVITATION: tapping the button signs you in.
  // ---------------------------------------------------------------------
  //
  // THE ASK: "Make sure when the new explorer clicks, they are logged in (so
  // they can have the logic to change the password, if not then they will have
  // the temporary password)" -- and then, immediately after: "Not just
  // explorers I mean, but new users (EDs, D, Gs, and Es)." So this runs for
  // every invited role, which is why it lives here on the door rather than in
  // anything role-shaped.
  //
  // WHY THE PASSWORD TRAVELS IN THE FRAGMENT AND NEVER THE QUERY STRING.
  // Everything after `#` is stripped by the browser before the request is
  // built: it is not in the address the server receives, not in an access log,
  // not in a proxy's records, and not in a Referer header sent onward to
  // anything the page later loads. A `?p=` would be in all five. It is then
  // taken out of the address bar below, before the sign-in is even attempted,
  // so it does not sit in history or survive a screenshot of the browser.
  //
  // WHAT THIS DOES NOT PRETEND TO BE. Anybody who can read that inbox can
  // already sign in -- the password is printed in the message, by design and at
  // the owner's instruction. This does not widen that; it saves the person
  // retyping something they were just shown. The answer to the underlying risk
  // is the change-password reminder, not a worse invitation.
  //
  // IT IS ALLOWED TO FAIL QUIETLY. If the password has since been changed, the
  // fragment is stale and the person is simply left at the ordinary form with
  // their address filled in -- which is exactly where they would have been if
  // this feature did not exist.
  useEffect(() => {
    if (arrived.current) return;
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash.startsWith('#p=')) return;
    arrived.current = true;

    const handed = (() => {
      try { return decodeURIComponent(hash.slice(3)); } catch { return ''; }
    })();

    // FIRST, before any await. An address bar holding a password while a
    // network call is in flight is a password on screen for as long as the
    // connection is slow, which on a phone in a church hall is the normal case.
    window.history.replaceState(null, '', window.location.pathname + window.location.search);

    // WITHOUT AN ADDRESS THERE IS NOTHING TO SIGN IN AS. Every invitation this
    // app sends carries `?email=`, so this is the malformed-link case rather
    // than the normal one -- but the notice above says "your address is filled
    // in", and leaving that standing over an empty box is how somebody decides
    // the app is broken rather than the link.
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
        if (!mine.is_approved) {
          setNotice('');
          setError(
            'Your password worked, but your account is waiting for a Director to approve it. '
            + 'Ask your church to approve you, then sign in again.',
          );
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
      if (!mine.is_approved) {
        // SAY SOMETHING. This used to be `window.location.replace('/login')`,
        // which reloaded the very page the person was already looking at and
        // told them nothing. From the other side of the screen that is
        // indistinguishable from a wrong password: you type a password you know
        // is right, the page blinks, and you are back at the form. People
        // retype it, then conclude the app is broken — and they are not wrong
        // to, because a correct password that appears to do nothing IS broken.
        setError(
          'Your password is correct, but your account is waiting for a Director to approve it. '
          + 'Ask your church to approve you, then sign in again.',
        );
        return;
      }
      window.location.replace(homeFor(mine.role));
    } catch (cause) {
      setError(errorText(cause));
      // WHY THE FAILURE IS REMEMBERED AND NOT JUST SHOWN.
      //
      // An invitation creates the account the moment it is SENT, so somebody
      // whose one-time link was spent before they reached the password step has
      // a real account with no password at all. Signing in is refused as
      // "invalid credentials", which is true and useless: they are not typing
      // the wrong password, there is no password to type.
      //
      // "Forgot your password?" was already on this screen and they do not
      // press it, because they did not forget one — they never had one, and the
      // sentence does not describe them. Twenty-three people were stuck in
      // exactly this state at once. So the offer is made HERE, in the words of
      // what actually happened, at the moment it happens.
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

  if (session && profile && !profile.is_approved) {
    return (
      <div className="min-h-screen">
        <PublicHeader title="Account awaiting approval" subtitle="Your invitation and password worked." />
        <div className="mx-auto max-w-md px-4 py-8">
          <Card className="p-6 text-center">
            <p className="text-gray-600">
              A Director or Executive Director must approve your account before you enter the app.
            </p>
            <Button
              className="mt-5"
              onClick={async () => {
                await signOut();
              }}
            >
              Sign out
            </Button>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PublicHeader title={`Sign in to ${APP_SHORT_NAME}`} subtitle="Use your live church account." />
      <div className="mx-auto max-w-md space-y-5 px-4 py-8">
        <Card className="p-5">
          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-gray-600">E-mail</span>
              <input
                type="email"
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
              <span className="text-sm font-semibold text-gray-600">Password</span>
              {/* An eye, because a password box you cannot read back is where
                  a wrong character hides — and on a phone keyboard that is most
                  of them. Standard everywhere else; it was missing here. */}
              <div className="relative mt-1">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  className="tap w-full rounded-xl bg-gray-100 px-4 pr-12 text-lg outline-none focus:ring-2 focus:ring-gold"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-lg hover:bg-black/5"
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </label>
            {error && <Notice tone="error">{error}</Notice>}
            {notice && <Notice tone="success">{notice}</Notice>}
            <Button type="submit" variant="gold" className="w-full" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {/* WHERE "TRY AN ACCOUNT" WENT.
              Three buttons used to sit here that signed you in as Maria, John
              or Pastor Ramos against THIS database, using seeded rows and a
              shared password. It was removed, and the reason is worth keeping.

              The tutorial is not part of the live app. Those buttons made it
              part of it: trying the app meant putting invented members into a
              real church's database and signing in as them. A church that had
              not run the seed got "those sample accounts are not in this
              database" — which reads as the app being broken — and a church
              that HAD run it now has fictional people in its member list and a
              shared password on three real accounts.

              Somebody who wants to look around before joining goes to the
              tutorial, which is offline, invents its people in the browser, and
              cannot reach any database at all. That is a cleaner answer to the
              same question, and it is the one on the front door. */}
          <form onSubmit={() => {}} className="hidden">
          </form>
          {/* THE SAME BUTTON, IN THE WORDS OF SOMEBODY WHO NEVER HAD A
              PASSWORD. It calls exactly what "Forgot your password?" calls;
              what changes is that it appears at the moment they are stuck and
              describes their situation instead of a different one. */}
          {couldBeUnfinished && (
            <div className="mt-4 rounded-xl bg-sky-50 p-4 ring-1 ring-sky-200">
              <p className="text-sm font-semibold text-navy">
                Never set a password yet?
              </p>
              {/* SAID HERE BECAUSE IT IS WHERE IT HAPPENS. Since 29 September
                  2026 an invitation's password stops working after seven days
                  unless it was changed (see the migration an_invitation_
                  password_runs_out), and "wrong password" is all the sign-in
                  can say. The way back is the same link as ever. */}
              <p className="mt-1 text-sm text-gray-700">
                If you were invited but never got as far as choosing one, there is
                nothing to type here yet. The password in an invitation e-mail also
                stops working seven days after it was sent. Either way, we can send
                you a link that lets you choose your own now.
              </p>
              <Button
                variant="gold"
                className="mt-3 w-full"
                disabled={busy}
                onClick={resetPassword}
              >
                {busy ? 'Sending…' : 'Send me a link to set my password'}
              </Button>
            </div>
          )}

          <button
            type="button"
            onClick={resetPassword}
            disabled={busy}
            className="mx-auto mt-4 block text-sm text-gray-500 underline"
          >
            Forgot your password?
          </button>
        </Card>

        <Card className="p-5 text-center">
          <p className="font-bold text-navy">Invited for the first time?</p>
          <p className="mt-1 text-sm text-gray-600">Open the invitation e-mail and set your password there.</p>
          <Link href="/signup" className="mt-3 inline-block font-semibold text-navy underline">
            Invitation help
          </Link>
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
      </div>
    </div>
  );
}

// The invited person's front door.
//
// This is the ONE screen where somebody who has never used Hope Beacon, was
// sent a link by their church, and has no account yet, becomes a member. Three
// separate things had to be right for that to happen and none of them were:
//
//   1. THE LINK HAD TO REDEEM. It arrived as `?code=…` and was pushed through
//      exchangeCodeForSession, which is the PKCE route and needs a verifier
//      this browser never had. Every invitation failed identically, which is
//      why it read as "it just errors" rather than as anything intermittent.
//      Invitations now arrive as `?token_hash=…&type=invite` and redeem
//      through verifyOtp, which needs nothing from the device.
//
//   2. IT HAD TO ASK WHAT THE CHURCH ACTUALLY NEEDS. This asked for a name and
//      a password. The form the client specified — the one the demo has always
//      shown — asks a little about the person and, before any of it, asks
//      permission to keep it. Showing one form in the demo and a different one
//      live is the gap that makes a demo feel like an advertisement.
//
//   3. ACCEPTING HAD TO PUT THEM IN THE APP. It ended on "one approval
//      remains" for everybody, including people whose Director had personally
//      addressed the invitation. Migration 0013 makes a matched invitation the
//      approval, so an invited person now lands on their own home screen.

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
  // Getting back in when the link is dead.
  //
  // An invitation creates the account immediately but sets no password, and the
  // link in the email works once. Somebody who opens it twice, or opens it a day
  // late, is then holding an account they cannot reach: no password to sign in
  // with, and a link that will not open again. The only screen they were given
  // said "go to sign in", which is exactly what they cannot do.
  //
  // The recovery email works for them, because it does not care whether a
  // password exists yet. It was already in the app, labelled "Forgot your
  // password?" on the sign-in screen -- wording that no one in this position
  // reads as applying to them, because they have not forgotten a password, they
  // have never had one. So it is offered here, in their own words.
  const [rescueEmail, setRescueEmail] = useState('');
  const [rescueNotice, setRescueNotice] = useState('');
  const [rescueBusy, setRescueBusy] = useState(false);
  const [churchName, setChurchName] = useState('');
  const [role, setRole] = useState<Role>('ds');
  const recovery = params.get('recovery') === '1' || params.get('type') === 'recovery';

  // SHOWING THE SIGN-UP TO A ROOM, WITHOUT AN INVITATION AND WITHOUT AN ACCOUNT.
  //
  // The join screen is the one screen nobody can demonstrate: it needs a live
  // one-time link, opening one spends it, and the account it creates is real.
  // So a church deciding whether to adopt this could be shown every screen
  // except the first one anybody actually meets.
  //
  // `?preview=ds|dm|admin|executive` renders the real form — the same password
  // rules, the same permission wording, the same optional questions, in that
  // role's words — and can create nothing. It never establishes a session, and
  // submit returns before it reaches Supabase. Both halves are checked by
  // tests/the-sign-up-can-be-shown.mjs, because "a preview that writes" is the
  // only way this could ever be worse than not having it.
  const PREVIEW_ROLES: Role[] = ['ds', 'dm', 'admin', 'executive'];
  const previewParam = params.get('preview') ?? '';
  const preview = PREVIEW_ROLES.includes(previewParam as Role) ? (previewParam as Role) : null;

  // WHOSE DEVICE IS THIS?
  //
  // Redeeming an invitation link signs this browser in as the invited person.
  // If somebody is already signed in here — a Director who copied the link to
  // check it works, a family sharing a tablet — that person was signed out and
  // replaced without a word. It read as the app logging people out at random,
  // and it also marked the invited person as arrived when they had not touched
  // anything.
  //
  // So nothing is redeemed until whoever is sitting here says the link is
  // theirs. `handover` is that answer.
  const [signedInAs, setSignedInAs] = useState('');
  const [handover, setHandover] = useState(false);

  // The optional half of the form. Everything here is the person's to give or
  // withhold, so it starts collapsed and nothing in it blocks the button.
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

  // Safari and password managers may fill a field directly, without a React
  // change event. Reading the inputs as well as state means the password the
  // person can see on screen is the one we validate and save. It also makes
  // the Show password control safe immediately after a browser suggestion.
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
      // BEFORE THE CLIENT IS EVEN ASKED FOR. A preview must not be able to
      // redeem a token, read a session, or sign anybody out, so it returns
      // above all of that rather than being filtered somewhere inside it.
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
        // `type` IS READ TWICE ON PURPOSE. The invitation link is built in the
        // email template as `?token_hash=...&type=...`, and a mail client that
        // re-encodes the ampersand as `&amp;` turns the second parameter into
        // one named `amp;type`. The link still opens, the token is still there,
        // and the only thing lost is the word that says which kind it is --
        // which silently turns a password reset into a failed invitation.
        const kind = (params.get('type') ?? params.get('amp;type')) === 'recovery'
          ? 'recovery'
          : 'invite';

        // SUPABASE REPORTS A DEAD LINK IN THE HASH, NOT THE QUERY. An expired
        // or already-used link arrives as
        // `#error=access_denied&error_code=otp_expired`, with no token at all.
        // Nothing looked for it, so the page found nothing to redeem, carried
        // on, and fell through to whatever session happened to be in the
        // browser already — presenting one person's account as another
        // person's invitation. Read it first and say so.
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
        const linkError = hashParams.get('error_description') || hashParams.get('error');
        if (linkError) {
          throw new Error(
            /expired/i.test(linkError)
              // NAME THE LIKELIEST CAUSE FIRST, BECAUSE IT IS ALSO THE ONE
              // THE READER CAN FIX WITHOUT ASKING ANYBODY.
              //
              // A church has exactly one live invitation per person: sending a
              // second replaces the first, which is correct, because a link
              // that outlived its replacement would be a way in that nobody
              // could revoke. But every invitation email is identical -- same
              // subject, same wording, same sender -- so a Director who pressed
              // Send twice leaves the invited person holding several messages
              // with no way to tell which one is alive, and the older ones fail
              // exactly like a genuinely expired link.
              //
              // The old wording, "expired or already used", sent that person
              // back to the church for a THIRD invitation, which killed the
              // second and repeated the whole loop. Saying "open the newest
              // email" first ends it, and costs nothing when the cause really
              // was age.
              ? 'This link is not the current one. If your church sent more than one '
                + 'invitation, only the newest email works -- open the most recent one '
                + 'and use its button. Otherwise this link has expired, and your church '
                + 'can send a fresh one.'
              : decodeURIComponent(linkError.replace(/\+/g, ' ')),
          );
        }

        const redeeming = Boolean(tokenHash || code);

        // ASK BEFORE SIGNING ANYBODY OUT.
        //
        // A browser that already holds a session must not keep it while a link
        // is redeemed — that is how an Explorer's invitation came to display a
        // Guide's account, and whoever was sitting there could have finished
        // somebody else's sign-up or changed their password.
        //
        // But clearing it silently is the other half of the same bug. The first
        // version did exactly that, and the person it caught was the Director:
        // they copy the join link the invitation screen hands them, open it to
        // check it works, and are signed out of their own account and into the
        // account of the person they just invited. Ask, name who is signed in,
        // and let them back out.
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
          // The normal path. Works on any device, because the token carries
          // everything needed to redeem it.
          const { error: otpError } = await client.auth.verifyOtp({ token_hash: tokenHash, type: kind });
          if (otpError) throw otpError;
        } else if (code && codeEmail) {
          // The six-digit fallback, for a mail client that mangled the link.
          // Redeemed against the address it was issued for — NOT through
          // exchangeCodeForSession, which is the mistake this whole screen was
          // built on.
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
          // NO TOKEN AND NO SESSION is a different thing from a bad token, and
          // the two used to produce the same sentence. Somebody who opened
          // /join out of curiosity was told their invitation was invalid.
          throw new Error(
            redeeming
              ? 'This invitation link is invalid or has expired. Ask your church to send a new one.'
              : 'Open the link in your invitation e-mail to finish setting up your account.',
          );
        }

        // HAND THE SESSION OVER EXPLICITLY. There are two clients in this app:
        // the auth client, which owns sign-in, and the data client, which reads
        // its token out of local storage through readBrowserSession(). They
        // agree on the storage key and today they agree on the format, so this
        // line is redundant — right up until a library upgrade changes the
        // shape the auth client writes.
        //
        // The cost of being wrong is not an error message. readBrowserSession()
        // returns null when it cannot parse what it finds, the profile read
        // then fails, and this screen concludes the person is unapproved and
        // shows them a waiting room. Silently telling an approved member they
        // are not approved is the single worst outcome this file can produce,
        // and it is one library bump away. So the session is written in the
        // exact shape the data client expects, by us, here.
        saveBrowserSession(data.session);

        // An account that already existed before the invitation receives a
        // recovery link, not a second auth-user insert. Claim its matching
        // invitation before reading the profile so it reaches the same
        // church-scoped approval queue as every other invitee.
        await live.claimMyPendingInvitation();
        const mine = await live.getMyProfile();
        if (!alive) return;
        setEmail(data.session.user.email ?? '');
        setName(mine?.full_name || String(data.session.user.user_metadata.full_name ?? ''));
        if (mine?.role) setRole(mine.role);
        // The church's own name, so the permission being asked for names who is
        // asking. "I give permission for the church" is not consent to anything.
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
    // The same words whether or not the address has an account. Saying "no
    // account here" would turn this box into a way of finding out who is a
    // member of the church.
    setRescueNotice('If that address has an account, a fresh link is on its way. It lasts one hour.');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (preview) {
      // The checks below still run for a demonstration, so a room can watch a
      // short password be refused. Nothing after them does.
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
    // The database cannot check this — a CHECK constraint may not read the
    // clock — so it is checked here, where the person can see what they typed.
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

      // updateUser can rotate the tokens, so re-publish whatever is current.
      const { data: fresh } = await client.auth.getSession();
      if (fresh.session) saveBrowserSession(fresh.session);

      // A PASSWORD CHOSEN HERE IS THE PERSON'S OWN, whichever way they came:
      // a reset e-mail or a first sign-up. So every other device signed in as
      // them is signed out, as on the Password page, and the reminder about
      // the invitation's password is cleared, which this door never did.
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

      // SIGN-UP IS FINISHED HERE, AND NOWHERE EARLIER. The account row exists
      // from the moment the invitation was sent, and the sign-in stamp is set
      // by opening the link, so both are true for somebody who has done
      // nothing. This is the first step that needed the invited person to be
      // present, so this is what the church's Invitations screen counts as
      // arriving.
      try {
        await live.finishMySignup();
      } catch {
        /* A missed stamp shows them as still waiting, which is recoverable.
           Failing the sign-up over it is not. */
      }

      const mine = await refreshProfile();
      // THREE OUTCOMES, NOT TWO. The version of this line that read
      // `if (mine?.is_approved) … else waitingRoom` collapsed "we could not
      // read your profile" into "you are not approved", which is how somebody
      // whose Director invited them personally ends up staring at a waiting
      // room. A read that failed is an error and says so.
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

  // Somebody is already signed in on this device. Nothing has been redeemed
  // and nobody has been signed out — that only happens if they choose it here.
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
            <p className="text-gray-600">A Director or Executive Director must approve your account before you enter the app.</p>
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
      {/* pb-32, not py-8: the install banner is fixed to the bottom of the
          viewport, and the join button is the last thing on this page. */}
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

              {/* The way out, and it has to be here.
                  Somebody reading this has an account already, because the
                  invitation made one. What they do not have is a password, so
                  "go to sign in" is the one thing they cannot do, and asking
                  their church for another invitation costs them a day and
                  switches off any link they still hold. This sends a fresh
                  link straight to the address it was addressed to. */}
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
              {/* Read-only, because it is the address the invitation was sent
                  to. An editable box here would let somebody redirect an
                  invitation that was not addressed to them. */}
              <label className="block">
                <span className="text-sm font-semibold text-gray-600">Email</span>
                <input
                  readOnly
                  value={email}
                  aria-describedby="join-email-why"
                  className="tap mt-1 w-full cursor-not-allowed rounded-xl bg-gray-100 px-4 text-base text-gray-500 outline-none"
                />
                <span id="join-email-why" className="mt-1 block text-xs text-gray-400">
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

              <div id="new-password-help" className="rounded-xl bg-sky-50 p-4 text-sm leading-relaxed text-slate-700 ring-1 ring-sky-100">
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
                <span className="mt-1 block text-xs text-gray-400">At least 10 characters.</span>
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
                  {/* PERMISSION. Named church, plain words, and the OBLIGATION
                      stated in the same breath as the request, because that is
                      what is actually being agreed to here.
                      This used to promise "I can withdraw this at any time from
                      Settings, and my details are removed when I do", and
                      Settings had the button behind it. Both went together in
                      the same commit: keeping the sentence after removing the
                      button would have made the app lie at the exact moment it
                      asks somebody to trust it. Unticked by default -- a box
                      that arrives already ticked is not consent, it is a
                      default nobody noticed. */}
                  <label className="flex items-start gap-3 rounded-xl bg-navy/5 p-4">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                      className="mt-1 h-5 w-5 shrink-0"
                    />
                    <span className="text-sm leading-relaxed text-gray-700">
                      I give permission for <strong>{churchName || 'my church'}</strong> to
                      keep my contact details so someone from the church can stay in touch
                      with me about my studies. I can update them whenever I need to, I
                      will keep them truthful, and my Guide and my church&rsquo;s
                      leadership can see when I change them.{' '}
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
