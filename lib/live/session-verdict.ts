// What a failed load means for somebody's session.
//
// THE BUG: people were signed out after switching tabs or closing the
// browser.
//
// Three things had to be wrong at once, and they were:
//
//   1. The question was asked of the ERROR MESSAGE. The old test was
//      /jwt|expired|invalid|refresh token|not authenticated/ against whatever
//      string came back, and `invalid` and `expired` are ordinary words. A
//      routine database complaint like "invalid input syntax for type uuid"
//      ended the session. So did every "JWT expired" that was really a phone
//      whose radio had not come back yet: the refresh could not leave the
//      device, the stale token went instead, and the server said the only
//      thing it could say.
//
//   2. A WAKE-UP READ COULD MAKE THINGS WORSE. Coming back to the tab re-reads
//      the profile. If that failed for any reason it threw away the profile
//      already loaded and drew "Your account is not ready" over a Sign out
//      button, which from where the person is standing is being logged out.
//
//   3. Nothing retried. The screen stayed like that until the person tapped
//      something, and the one thing they will not tap is a screen that has just
//      told them their account is not ready.
//
// THE FIX IS TO ASK A DIFFERENT QUESTION. Whether a session is over is already
// decided, properly, in exactly one place: lib/supabase/client.ts clears the
// stored session when the SERVER refuses the refresh, and deliberately does not
// when the request never got there. So the only thing worth knowing here is
// whether that decision has been made. The error text is not evidence.
//
// Kept out of the provider so it can be run rather than read. The failure it
// prevents needs a real token, a real hour and a flaky real network to
// reproduce, so a browser test cannot reach it; this can.

/** What the app should do when loading the signed-in person fails. */
export type SessionVerdict =
  /** The session is genuinely finished. Show the front door. */
  | 'signed-out'
  /** Keep everything as it is and wait. Nothing is known to be wrong. */
  | 'hold'
  /** Nothing to do with the session. Say what went wrong. */
  | 'report';

export interface FailureFacts {
  /**
   * Is a session still in this device's storage?
   *
   * This is the whole decision. It is false only once the refresh has been
   * REFUSED BY THE SERVER, which is the one event that ends a session.
   */
  sessionStillStored: boolean;
  /**
   * Was this load asked for by a person, or by the app noticing something?
   *
   * A run nobody asked for -- coming back to the tab, the network returning,
   * another tab writing storage -- may make things better and must never make
   * them worse.
   */
  recheck: boolean;
}

export function verdictOnFailure({ sessionStillStored, recheck }: FailureFacts): SessionVerdict {
  if (!sessionStillStored) return 'signed-out';
  if (recheck) return 'hold';
  return 'report';
}
