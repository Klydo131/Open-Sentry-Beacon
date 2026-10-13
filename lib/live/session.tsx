'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { onSignedOut, readBrowserSession } from '@/lib/supabase/client';
import * as live from '@/lib/live/data';
import { setFeedbackSink } from '@/lib/backend/feedback';
import { churchFeedbackSink, flushKeptFeedback } from '@/lib/live/feedback-sink';
import { verdictOnFailure } from '@/lib/live/session-verdict';
import { SecondStepNeeded, needsSecondStep, refreshMyFactors } from '@/lib/live/two-step';
import type { Profile, Role } from '@/lib/types';

const HOME: Record<Role, string> = {
  executive: '/admin',
  admin: '/admin',
  dm: '/dm',
  ds: '/ds',
};

export const homeFor = (role: Role) => HOME[role];

interface LiveSessionValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string;
  /** Signed in with the password, and the code from the authenticator app is still owed. */
  secondStep: boolean;
  refreshProfile: () => Promise<Profile | null>;
  signOut: () => Promise<void>;
}

const LiveSessionContext = createContext<LiveSessionValue | null>(null);

export function LiveSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [secondStep, setSecondStep] = useState(false);

  const refreshProfile = useCallback(async () => {
    const nextSession = readBrowserSession();
    if (!nextSession) {
      setSession(null);
      setProfile(null);
      setSecondStep(false);
      return null;
    }
    setSession(nextSession);
    if (needsSecondStep(nextSession)) {
      setProfile(null);
      setSecondStep(true);
      return null;
    }
    try {
      const next = await live.getMyProfile();
      setProfile(next);
      setSecondStep(false);
      return next;
    } catch (cause) {
      if (!(cause instanceof SecondStepNeeded)) throw cause;
      await refreshMyFactors().catch(() => null);
      setProfile(null);
      setSecondStep(true);
      return null;
    }
  }, []);

  useEffect(() => {
    let alive = true;

    /**
     * Load, or re-load, the signed-in person.
     *
     * `recheck` MATTERS MORE THAN ANYTHING ELSE HERE. It marks a run that was
     * not asked for by a person: coming back to the tab, the network returning,
     * another tab writing storage. A run like that is allowed to make things
     * BETTER and never worse. See the catch below.
     */
    const load = async (next: Session | null, recheck = false) => {
      if (!alive) return;
      setSession(next);
      if (!next) {
        setProfile(null);
        setError('');
        setSecondStep(false);
        setLoading(false);
        return;
      }
      // THE CODE IS STILL OWED. The session knows the account has a confirmed
      // authenticator app and its token is password-only, so the profile read
      // below would be refused anyway (lib/live/two-step.ts). Ask for the code.
      if (needsSecondStep(next)) {
        setProfile(null);
        setError('');
        setSecondStep(true);
        setLoading(false);
        return;
      }
      try {
        const mine = await live.getMyProfile();
        if (!alive) return;
        setProfile(mine);
        setSecondStep(false);
        setError(mine ? '' : 'Your account profile is not ready yet.');

        // FEEDBACK NOW HAS SOMEWHERE TO GO, and until this line it did not.
        //
        // `setFeedbackSink` was never called anywhere in the app, so every
        // message people wrote went to the default sink -- which saves to their
        // own browser and says so -- and the church never saw one of them.
        // Installed here rather than in a provider because it needs a signed-in
        // session to know which church, and this is the one place that knows a
        // session has just been established.
        setFeedbackSink(churchFeedbackSink);
        // And anything this device kept while there was nowhere to send it goes
        // now. Quiet: nobody asked for it, and a failure leaves the message
        // exactly where it already was.
        void flushKeptFeedback().catch(() => {});
      } catch (cause) {
        if (!alive) return;

        // SET UP ON ANOTHER DEVICE. This device signed in before the account
        // had a second step, so its session did not know; the database did,
        // and refused. Learn which app it is, then ask for the code.
        if (cause instanceof SecondStepNeeded) {
          await refreshMyFactors().catch(() => null);
          if (!alive) return;
          setSession(readBrowserSession());
          setProfile(null);
          setError('');
          setSecondStep(true);
          return;
        }

        // WHETHER A SESSION IS OVER IS NOT A QUESTION ABOUT THIS ERROR.
        //
        // It used to be decided by matching the message against
        // /jwt|expired|invalid|refresh token|not authenticated/, and that is
        // how people were signed out for no reason. `invalid` and `expired`
        // are ordinary words: "invalid input syntax for type uuid" is a
        // routine database complaint and it ENDED THE SESSION. So did every
        // "JWT expired" that was really just a phone whose network had not
        // come back yet, because the refresh could not leave the device and
        // the stale token was sent instead.
        //
        // There is already exactly one place that decides this, and it decides
        // it properly: lib/supabase/client.ts clears the stored session when
        // the SERVER refuses the refresh, and deliberately does not when the
        // request never got there. So the honest question is not what this
        // error says. It is whether that decision has been made.
        const verdict = verdictOnFailure({
          sessionStillStored: readBrowserSession() !== null,
          recheck,
        });
        if (verdict === 'signed-out') {
          live.signOut().catch(() => {});
          setSession(null);
          setProfile(null);
          setError('');
        } else if (verdict === 'hold') {
          // A RE-CHECK THAT FAILS CHANGES NOTHING. This is the one that was
          // reported: tab away, come back, and the wake-up read fires before
          // the radio is up. It used to answer that by throwing away a
          // perfectly good profile and drawing "Your account is not ready"
          // over a Sign out button, which from where the person is standing is
          // being logged out. Keep what we have; `online` below tries again.
        } else {
          const why = cause instanceof Error ? cause.message : '';
          setProfile(null);
          setError(why || 'Could not load your account.');
        }
      } finally {
        if (alive) setLoading(false);
      }
    };

    void load(readBrowserSession());
    const syncAcrossTabs = () => void load(readBrowserSession(), true);
    window.addEventListener('storage', syncAcrossTabs);

    // THE NETWORK COMING BACK IS THE RETRY. Without this, a failed wake-up read
    // sat there until the person tapped something, which on a screen that has
    // just told them their account is not ready is the one thing they will not
    // do.
    const backOnline = () => void load(readBrowserSession(), true);
    window.addEventListener('online', backOnline);

    // THE SESSION ENDING IN THIS TAB. `storage` fires in OTHER tabs only, so a
    // session cleared here — a refresh the server refused — was invisible to
    // this provider. The screen stayed drawn with the person's name on it
    // while every request behind it went out as nobody, and each card filled
    // with "permission denied for table pairings". Now the door is shown
    // instead, which is the honest answer and the one they can act on.
    const stopListening = onSignedOut(() => void load(readBrowserSession(), true));

    // COMING BACK TO THE APP RE-CHECKS THE SESSION.
    //
    // A phone left overnight wakes with an access token hours past its expiry.
    // The first request would refresh it anyway, so this is not what keeps
    // somebody signed in -- it is what means the first thing they tap is not
    // the thing that pays for the refresh. Only when the tab becomes visible,
    // so a backgrounded app costs nothing.
    const recheck = () => {
      if (document.visibilityState === 'visible') void load(readBrowserSession(), true);
    };
    document.addEventListener('visibilitychange', recheck);

    return () => {
      alive = false;
      window.removeEventListener('storage', syncAcrossTabs);
      window.removeEventListener('online', backOnline);
      document.removeEventListener('visibilitychange', recheck);
      stopListening();
    };
  }, []);

  const signOut = useCallback(async () => {
    await live.signOut();
    setSession(null);
    setProfile(null);
    setSecondStep(false);
  }, []);

  const value = useMemo(
    () => ({ session, profile, loading, error, secondStep, refreshProfile, signOut }),
    [session, profile, loading, error, secondStep, refreshProfile, signOut],
  );

  return <LiveSessionContext.Provider value={value}>{children}</LiveSessionContext.Provider>;
}

export function useLiveSession(): LiveSessionValue {
  const value = useContext(LiveSessionContext);
  if (!value) throw new Error('useLiveSession must be used inside <LiveSessionProvider>.');
  return value;
}
