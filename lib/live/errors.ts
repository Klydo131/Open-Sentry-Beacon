// What a person is told when something fails.
//
// THE BUG THIS EXISTS FOR, on a Guide's own screen: two red boxes reading
// "permission denied for table pairings" and "permission denied for function
// blog_feed", under their name and their reminders. Nobody outside a database
// can act on either sentence, and both were saying the same ordinary thing —
// you are signed out — in the least useful words available.
//
// This is the floor, not the fix. The reason those requests arrived as nobody
// is fixed in lib/supabase/client.ts. But a screen should never be able to
// print Postgres at somebody, whatever goes wrong upstream, so the translation
// lives here and every live screen goes through it.
//
// WRITTEN ONCE. The same ternary was copied into thirty-three components, each
// with its own fallback and none of them translating anything. Thirty-three
// copies of a decision is thirty-three places to forget it.

/** True when the message means "this request had no signed-in identity". */
const NOT_SIGNED_IN =
  /permission denied for (table|function|schema|relation|sequence)|jwt (expired|is invalid)|invalid claim|not authenticated|no api key/i;

/** True when the DATABASE allowed the identity but the rules refused the act. */
const NOT_ALLOWED = /row-level security|violates row-level security policy|insufficient privilege/i;

const OFFLINE = /failed to fetch|networkerror|network request failed|load failed/i;

/** Storage refused the file's type. The wording is Supabase's, not ours. */
const BAD_TYPE = /mime type .* is not supported/i;

/** Storage refused the file's size. */
const TOO_BIG = /maximum allowed size|payload too large|entity too large|413/i;

/**
 * The database refused a row because one like it is already there.
 *
 * THE BUG THIS EXISTS FOR, photographed off a Director's phone:
 *
 *     duplicate key value violates unique constraint "pairings_ds_id_dm_id_key"
 *
 * after trying to pair two people who had been disconnected. The constraint
 * name is the only thing Postgres offers, it is not a sentence, and a Director
 * reading it has no way to know the answer was "disconnect the other Guide
 * first". Any rule worth a real sentence gets one here; everything else at
 * least stops being SQL.
 */
const ALREADY_THERE = /duplicate key value violates unique constraint "([^"]+)"/i;

const ALREADY_THERE_SAYS: Record<string, string> = {
  pairings_one_active_guide: 'That Explorer already has a Guide. Disconnect the current one first.',
};

/**
 * What the sign-in service says, in words a member can act on.
 *
 * THE BUG THIS EXISTS FOR, 26 October 2026: every screen that sets a password
 * printed the service's own sentence. A member who had an authenticator app
 * and reset a forgotten password was told "AAL2 session is required to update
 * password"; one who typed their old password again read "New password should
 * be different from the old password." with nothing to do next; and a second
 * reset request within the minute said "For security purposes, you can only
 * request this after 37 seconds." The service gives each refusal a `code`
 * (Supabase Auth and the Postgres edition use the same ones), so the code is
 * read first and the wording only when there is no code.
 */
const AUTH_SAYS: Record<string, string> = {
  same_password: 'That is the password you already have. Choose a different one.',
  insufficient_aal:
    'Your account uses two-step sign-in, so the code from your authenticator app is needed first.',
  reauthentication_needed: 'For your safety, confirm it is you before changing your password.',
  reauthentication_not_valid: 'That confirmation code did not work. Ask for a new one and try again.',
  session_not_found: 'This page has been open too long, so it no longer knows who you are. Start again from the beginning.',
  session_expired: 'This page has been open too long, so it no longer knows who you are. Start again from the beginning.',
  otp_expired: 'This link has run out or has already been used. Ask for a new one.',
  over_email_send_rate_limit: 'An e-mail was sent a moment ago. Wait a minute before asking again, and look in Spam too.',
  over_request_rate_limit: 'Too many tries just now. Wait a few minutes, then try again.',
  email_address_invalid: 'That e-mail address does not look right. Check it and try again.',
  user_banned: 'This account is switched off. Ask your church.',
  request_timeout: 'That took too long to answer. Please try again in a moment.',
};

/** Supabase's weak-password refusals, by the reason it gives. */
const WEAK_SAYS: Record<string, string> = {
  pwned: 'That password has appeared in a list of leaked passwords, so it is easy to guess. Choose a different one.',
  length: 'That password is too short for this church’s settings. Use a longer one.',
  characters: 'This church’s settings ask for a mix of small and capital letters, numbers and symbols. Add some.',
};

function authSays(cause: unknown, raw: string): string | null {
  const c = (cause ?? {}) as { code?: unknown; reasons?: unknown };
  const code = typeof c.code === 'string' ? c.code : '';
  if (code === 'weak_password' || /^Password (should|is known)/i.test(raw)) {
    const reasons = Array.isArray(c.reasons) ? c.reasons.map(String) : [];
    if (reasons.includes('pwned') || /known to be weak|leaked|pwned/i.test(raw)) return WEAK_SAYS.pwned;
    if (/at most \d+ characters/i.test(raw)) return 'That password is too long. Keep it under 72 characters.';
    if (reasons.includes('characters') || /contain at least one character/i.test(raw)) return WEAK_SAYS.characters;
    if (reasons.includes('length') || /at least \d+ characters/i.test(raw)) return WEAK_SAYS.length;
  }
  // How long to wait, when the service says, is worth more than the code.
  const wait = /only request this after (\d+) seconds?/i.exec(raw);
  if (wait) return `An e-mail was sent a moment ago. Wait ${wait[1]} seconds before asking again, and look in Spam too.`;
  if (code && AUTH_SAYS[code]) return AUTH_SAYS[code];
  // No code: the same refusals, recognised by their words.
  if (/should be different from the old password/i.test(raw)) return AUTH_SAYS.same_password;
  if (/AAL2 (session )?(is )?required/i.test(raw)) return AUTH_SAYS.insufficient_aal;
  if (/requires reauthentication/i.test(raw)) return AUTH_SAYS.reauthentication_needed;
  if (/auth session missing|session from session_id claim/i.test(raw)) return AUTH_SAYS.session_not_found;
  if (/(link|token) (is invalid or )?has expired|has expired or is invalid/i.test(raw)) return AUTH_SAYS.otp_expired;
  if (/email rate limit/i.test(raw)) return AUTH_SAYS.over_email_send_rate_limit;
  if (/rate limit/i.test(raw)) return AUTH_SAYS.over_request_rate_limit;
  if (/user is banned/i.test(raw)) return AUTH_SAYS.user_banned;
  return null;
}

/**
 * Turn anything thrown into a sentence worth showing.
 *
 * @param cause    whatever was caught
 * @param fallback what to say when the cause carries no message of its own
 */
export function humanError(cause: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const raw = cause instanceof Error
    ? cause.message
    : typeof (cause as { message?: unknown })?.message === 'string' ? String((cause as { message: string }).message) : '';
  const auth = authSays(cause, raw);
  if (auth) return auth;
  if (!raw) return fallback;

  // Order matters: the signed-out case must be read before the rules case, or
  // "permission denied" gets reported as a rule the person has broken.
  if (NOT_SIGNED_IN.test(raw)) {
    return 'You have been signed out. Please sign in again to carry on.';
  }
  if (NOT_ALLOWED.test(raw)) {
    return 'You do not have permission to do that. If that seems wrong, ask your Director.';
  }
  if (OFFLINE.test(raw)) {
    return 'That could not reach the church. Check your connection and try again.';
  }
  if (BAD_TYPE.test(raw)) {
    return 'That kind of file cannot be attached. Photos, PDFs, Word documents, '
      + 'spreadsheets, slides, audio and plain text all work.';
  }
  if (TOO_BIG.test(raw)) {
    return 'That file is too large. The limit is 10 MB.';
  }
  const already = ALREADY_THERE.exec(raw);
  if (already) {
    return ALREADY_THERE_SAYS[already[1]] ?? 'That is already there, so it was not added again.';
  }
  return raw;
}
