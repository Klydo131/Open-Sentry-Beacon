// When a refused data request should make this device ask about its session.
//
// Since 29 September 2026 the database refuses a request whose session has
// been ended -- "Sign out everywhere else", a password chosen, an invitation's
// week running out -- with HTTP 401, instead of honouring the pass the device
// already held for up to an hour (supabase/migrations/20260929130000_an_ended_
// session_ends_at_once.sql).
//
// A 401 is not proof that the session is over, and this app never decides that
// from a request's answer (lib/supabase/client.ts, refreshBrowserSession). It
// asks the one server that knows, by spending the refresh token: refused means
// the session is over and the device shows the front door; accepted means it
// carries on with a fresh token.
//
// AT MOST ONCE A MINUTE, so a request that keeps answering 401 for any other
// reason can never become a stream of refreshes.
//
// Kept apart from client.ts, with no imports, so tests/an-ended-session-ends-
// at-once.mjs can run it rather than read it.

/** The least time between two checks set off by a refused request. */
export const RECHECK_AFTER_REFUSAL_MS = 60_000;

/** Whether this answer should make the device ask the sign-in server now. */
export function shouldRecheckSession(status: number, lastRecheckAt: number, now: number): boolean {
  return status === 401 && now - lastRecheckAt >= RECHECK_AFTER_REFUSAL_MS;
}
