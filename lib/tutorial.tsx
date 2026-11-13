'use client';

// THE TUTORIAL IS NOT PART OF THE LIVE APP. This file is what keeps that true.
//
// There are two separate things in this repository and they share nothing but
// the screens they are drawn on:
//
//   THE LIVE APP     real people, real database, invitation only. Every row it
//                    shows came from Postgres and passed a security policy.
//   THE TUTORIAL     sample people invented in the browser. No database, no
//                    account, no network. Works on a plane. Nothing typed into
//                    it is ever sent anywhere.
//
// A visitor must be able to try the second one WITHOUT touching the first —
// that is the whole point of having it. Before this file existed there was no
// way to: lib/mode.ts decides live-or-demo from whether Supabase keys are
// present at build time, so on a deployed church app IS_LIVE was permanently
// true and the tutorial, though compiled into the bundle, was unreachable. The
// front door offered "Sign in" and "I have an invitation" and nothing else, so
// somebody evaluating the app had no way in at all.
//
// The fix people usually reach for is worse: let the sample accounts sign in to
// the real database. That is not a tutorial, it is seeding a church's live
// database with invented members, and the moment the seed is not run the
// sign-in fails in a way that reads like the app is broken.
//
// So the choice is made HERE, at runtime, per visitor, and it only ever moves
// in the safe direction:
//
//   - a deployment with no database can only ever be the tutorial
//   - a deployment WITH one is live, unless this visitor asked for the tutorial
//
// Asking cannot enable a database that isn't configured, and being in the
// tutorial cannot read one that is: the demo screens talk to lib/demo/store,
// which has no network code in it at all.

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { IS_LIVE } from '@/lib/mode';

/** Remembered so the tutorial survives a reload and a link to another page. */
const KEY = 'hb-tutorial';

interface TutorialValue {
  /** True when this visitor should see the offline tutorial. */
  tutorial: boolean;
  /** True when the screens should talk to the database. */
  live: boolean;
  /** Whether this deployment has a database at all. Not a per-visitor thing. */
  hasDatabase: boolean;
  enterTutorial: () => void;
  leaveTutorial: () => void;
}

const Ctx = createContext<TutorialValue | null>(null);

export function TutorialModeProvider({ children }: { children: React.ReactNode }) {
  // Starts at "not the tutorial" so the server's HTML and the browser's first
  // render agree. Anything read out of localStorage or the address bar has to
  // wait for the effect below, because neither exists while this is rendered on
  // the server, and guessing produces a hydration mismatch.
  const [tutorial, setTutorial] = useState(false);

  useEffect(() => {
    // No database means there is nothing else this could be.
    if (!IS_LIVE) {
      setTutorial(true);
      return;
    }
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('tutorial') === '1') {
        window.localStorage.setItem(KEY, '1');
        setTutorial(true);
        return;
      }
      if (params.get('tutorial') === '0') {
        window.localStorage.removeItem(KEY);
        setTutorial(false);
        return;
      }
      setTutorial(window.localStorage.getItem(KEY) === '1');
    } catch {
      // Private browsing can refuse localStorage. Staying live is the safe
      // failure: it shows a real member their real church, which is correct,
      // rather than showing them invented people, which is not.
      setTutorial(false);
    }
  }, []);

  const enterTutorial = useCallback(() => {
    try { window.localStorage.setItem(KEY, '1'); } catch { /* not fatal */ }
    setTutorial(true);
  }, []);

  const leaveTutorial = useCallback(() => {
    try { window.localStorage.removeItem(KEY); } catch { /* not fatal */ }
    setTutorial(false);
  }, []);

  return (
    <Ctx.Provider
      value={{
        tutorial,
        live: IS_LIVE && !tutorial,
        hasDatabase: IS_LIVE,
        enterTutorial,
        leaveTutorial,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTutorialMode(): TutorialValue {
  const value = useContext(Ctx);
  // Falling back rather than throwing: this hook is called from screens that
  // also render inside tests and stories with no provider around them, and a
  // missing provider should not blank the app.
  if (!value) {
    return {
      tutorial: !IS_LIVE,
      live: IS_LIVE,
      hasDatabase: IS_LIVE,
      enterTutorial: () => {},
      leaveTutorial: () => {},
    };
  }
  return value;
}

/**
 * The one question every screen asks: do I draw the live version?
 *
 * Replaces a bare `IS_LIVE` at each of the nine places that chose between a
 * live screen and a tutorial screen. `IS_LIVE` is still the right question for
 *  — see lib/supabase/client.ts — because that
 * is about the deployment, not about who is looking.
 */
export const useIsLive = () => useTutorialMode().live;
