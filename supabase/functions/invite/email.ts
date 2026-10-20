// The invitation email, composed here in a version per role, so the words live
// in git and are tested (Supabase Auth has one template for every role).
//
// The branching happens in TypeScript; the output is finished HTML. It uses
// tables and inline styles only (Outlook, and clients that drop <style>), and
// no images, which most clients block by default.

export type InviteRole = 'ds' | 'dm' | 'admin' | 'executive';

interface RoleCopy {
  /** What this person is called on screen and in the message. */
  word: string;
  /** The subject line. Distinct per role so a Gmail thread cannot collapse them. */
  subject: string;
  /** The sentence under the heading. */
  lead: string;
  /** Three things that happen next, as [bold opening, rest]. */
}

const ROLE_COPY: Record<InviteRole, RoleCopy> = {
  // Being walked with: the reassurance is that nobody else can see any of it.
  ds: {
    word: 'Explorer',
    subject: 'You are invited to Hope Beacon',
    lead:
      'Someone from the church would like to walk alongside you, at whatever '
      + 'pace suits you. Nobody else can see your journey, and nothing is '
      + 'shared beyond the person walking with you.',
  },

  // Walking with others: the number is a ceiling, not a target.
  dm: {
    word: 'Guide',
    subject: 'You have been asked to be a Guide',
    lead:
      'They would like you to walk alongside others as a Guide. You will be '
      + 'paired with people one at a time, and each conversation stays between '
      + 'you and them.',
  },

  // Overseeing more than one congregation; only an Executive Director can send this.
  executive: {
    word: 'Executive Director',
    subject: 'You have been asked to serve as an Executive Director',
    lead:
      'They would like you to serve as an Executive Director. You will oversee '
      + 'the churches you are given, and appoint the Directors who run them.',
  },

  admin: {
    word: 'Director',
    subject: 'You have been asked to help lead Hope Beacon',
    lead:
      'They would like you to help lead as a Director. You will decide who '
      + 'joins, what they can see, and who walks with whom.',
  },
};

/** One line about what happens after they sign in (install steps live in the app). */
/**
 * The two roles not approved on arrival (Guide and Director), told so, or the
 * waiting screen reads like a broken password.
 */
const WAITS: Partial<Record<InviteRole, string>> = {
  dm: 'A Director then lets you in, which can take a little while; sign in anyway and the app will tell you where you stand.',
  admin: 'A Director then lets you in, which can take a little while; sign in anyway and the app will tell you where you stand.',
};

const AFTER: Record<InviteRole, string> = {
  ds: 'A Guide from your church will say hello.',
  dm: 'You will be paired with people one at a time, at most five at once.',
  admin: 'Approvals, people and pairings are under Admin.',
  executive: 'Appointing Directors and overseeing churches are under Admin.',
};

/** Escape anything that reaches the HTML from the database. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function subjectFor(role: InviteRole): string {
  return ROLE_COPY[role].subject;
}

/**
 * What this app is and who looks after it, said in the invitation (RA 10173
 * section 16). Every sentence matches what the app enforces.
 */
export function oversightLines(churchName: string, appUrl: string): { heading: string; lines: string[] } {
  // As lib/oversight.ts: "your church" mid-sentence, "Your church" to start one.
  const church = churchName || 'your church';
  const Church = churchName || 'Your church';
  return {
    heading: 'How this app is looked after',
    lines: [
      `Hope Beacon is a private app for one-to-one discipleship and the ministry of ${church}. It is used for nothing else.`,
      `It is overseen by the church. ${Church}'s Directors and Executive Directors approve who joins, decide who walks with whom, and can see how the app is being used: who is paired with whom, where each person is on the journey, and counts and dates of meetings and messages.`,
      'What you write to the person you walk with stays between the two of you. Nobody else can read it, the church\'s leaders included, unless one of you reports a message; a reported message goes to leadership so they can keep everybody safe.',
      `${Church} keeps your information under the Data Privacy Act of 2012 (Republic Act 10173). You can ask for a copy of it, have it corrected, or have your account removed. The full privacy notice is at ${appUrl}/privacy`,
    ],
  };
}

export function roleWord(role: InviteRole): string {
  return ROLE_COPY[role].word;
}

/**
 * The finished message. `joinUrl` is the sign-in page with the address filled
 * in. Credentials come before the button, and signing in before installing.
 */
/**
 * The first name to greet somebody by, or '' when it does not look like a
 * name (a fallback like `stormwell88` reads as machine-generated).
 */
export function greetingName(fullName: string): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? '';
  if (first.length < 2 || first.length > 24) return '';
  // Letters plus the straight and curly apostrophes and the hyphen. The
  // apostrophes are typed literally, never as backslash-u escapes: deploying
  // sends this source as JSON, which would decode an escape
  // (tests/the-deployed-function-is-the-file.mjs).
  if (!/^[\p{L}][\p{L}'’-]*$/u.test(first)) return '';
  // An all-lowercase name is capitalised; MacLeod and O'Brien keep their own capitals.
  return first === first.toLowerCase()
    ? first[0].toUpperCase() + first.slice(1)
    : first;
}

export function inviteHtml(
  role: InviteRole,
  churchName: string,
  joinUrl: string,
  appUrl: string,
  signInEmail: string,
  tempPassword: string,
  fullName: string,
): string {
  const copy = ROLE_COPY[role];
  const church = esc(churchName || 'Your church');
  const url = esc(joinUrl);
  const app = esc(appUrl);
  const who = esc(signInEmail);
  const pass = esc(tempPassword);
  const afterLine = AFTER[role];
  const waitLine = WAITS[role] ?? '';
  const hello = greetingName(fullName);
  const oversight = oversightLines(churchName, appUrl);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EEF1F6;margin:0;padding:0;width:100%;">
  <tr>
    <td align="center" style="padding:28px 12px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:14px;">
        <tr><td style="padding:34px 40px 30px 40px;font-family:Helvetica,Arial,sans-serif;">

          <p style="margin:0 0 18px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:#1E2A4A;">Hope&nbsp;Beacon</p>

          <h1 style="margin:0 0 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:22px;line-height:1.3;color:#1E2A4A;font-weight:bold;">${esc(copy.subject)}</h1>

          ${hello ? `<p style="margin:0 0 12px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#22272F;">Hi ${esc(hello)},</p>` : ''}

          <p style="margin:0 0 22px 0;font-family:Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:#22272F;">
            <strong>${church}</strong> has invited you as ${esc(copy.word)}. ${esc(copy.lead)}
          </p>

          <!-- THE CREDENTIALS COME BEFORE THE BUTTON, and the order is the
               request: "That email and password must be emphasized first
               before tapping the accept or join in to the Web app." Somebody
               who taps first and reads second arrives at a sign-in box holding
               nothing, goes back to the mail, and half of them do not come
               back. -->
          <p style="margin:0 0 8px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;color:#1E2A4A;letter-spacing:0.6px;text-transform:uppercase;">Step 1 &middot; Your sign-in details</p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F4F8FF;border:2px solid #2F80ED;border-radius:10px;margin:0 0 14px 0;">
            <tr><td style="padding:16px 18px;font-family:Helvetica,Arial,sans-serif;">
              <p style="margin:0 0 3px 0;font-size:12px;font-weight:bold;color:#5B6472;letter-spacing:0.5px;text-transform:uppercase;">E-mail</p>
              <p style="margin:0 0 12px 0;font-family:'Courier New',Courier,monospace;font-size:17px;font-weight:bold;color:#1E2A4A;word-break:break-all;">${who}</p>
              <p style="margin:0 0 3px 0;font-size:12px;font-weight:bold;color:#5B6472;letter-spacing:0.5px;text-transform:uppercase;">Password</p>
              <p style="margin:0 0 8px 0;font-family:'Courier New',Courier,monospace;font-size:21px;font-weight:bold;color:#1E2A4A;letter-spacing:0.5px;word-break:break-all;">${pass}</p>
              <p style="margin:0;font-size:14px;line-height:1.5;color:#5B6472;">Three words and a number, joined by dashes. No spaces, no capitals.</p>
            </td></tr>
          </table>

          <p style="margin:0 0 22px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#7A2A20;">
            <strong>This password is temporary. Please change it.</strong> Anybody who can read this
            e-mail can use it, so it stops working after three days. Choose your own before then;
            if you miss it, tap &ldquo;Forgot your password&rdquo; when you sign in. There is a page for exactly that:
            <a href="${app}/password" style="color:#7A2A20;font-weight:bold;">${app}/password</a>
          </p>

          <p style="margin:0 0 10px 0;font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:bold;color:#1E2A4A;letter-spacing:0.6px;text-transform:uppercase;">Step 2 &middot; Open the app</p>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px 0;">
            <tr><td align="center" style="background-color:#1E2A4A;border-radius:8px;">
              <a href="${url}" style="display:inline-block;padding:13px 30px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">Sign in to Hope Beacon</a>
            </td></tr>
          </table>

          ${waitLine ? `<p style="margin:0 0 14px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#22272F;"><strong>${esc(waitLine)}</strong></p>` : ''}

          <p style="margin:0 0 6px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#22272F;">
            You can open this e-mail again, on any device. The button never expires; the password
            works for three days, or until you choose your own.
          </p>
          <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#5B6472;">
            ${esc(afterLine)} To add Hope&nbsp;Beacon to your Home Screen, open <strong>Settings</strong> inside the app.
          </p>

        </td></tr>
      </table>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr><td style="padding:18px 28px 0 28px;font-family:Helvetica,Arial,sans-serif;">
          <p style="margin:0 0 8px 0;font-size:13px;font-weight:bold;color:#1E2A4A;letter-spacing:0.6px;text-transform:uppercase;">${esc(oversight.heading)}</p>
          ${oversight.lines.map((line) => `<p style="margin:0 0 8px 0;font-size:14px;line-height:1.55;color:#3D4552;">${esc(line)}</p>`).join('\n          ')}
        </td></tr>
      </table>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
        <tr><td align="center" style="padding:18px 24px 0 24px;font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.55;color:#8892A0;">
          You received this because a leader at ${church} invited you, and an account was created for you at this address. If you were not expecting it, you can ignore this message, or ask the church to remove the account.
        </td></tr>
      </table>

    </td>
  </tr>
</table>`;
}

/**
 * The invitation as plain text. Multipart mail is less likely to land in
 * Promotions. No HTML escaping here: `&amp;` in plain text would be a bug.
 */
export function inviteText(
  role: InviteRole,
  churchName: string,
  joinUrl: string,
  appUrl: string,
  signInEmail: string,
  tempPassword: string,
  fullName: string,
): string {
  const copy = ROLE_COPY[role];
  const church = churchName || 'Your church';
  const hello = greetingName(fullName);

  // Wrapped at 72 by a function, not by hand.
  const wrap = (text: string): string => {
    const out: string[] = [];
    let line = '';
    for (const word of text.split(' ')) {
      if (line && (line.length + 1 + word.length) > 72) { out.push(line); line = word; }
      else line = line ? `${line} ${word}` : word;
    }
    if (line) out.push(line);
    return out.join('\n');
  };

  return [
    copy.subject,
    '',
    ...(hello ? [`Hi ${hello},`, ''] : []),
    wrap(`${church} has invited you as ${copy.word}. ${copy.lead}`),
    '',
    'YOUR SIGN-IN DETAILS',
    `E-mail:   ${signInEmail}`,
    `Password: ${tempPassword}`,
    'Three words and a number, joined by dashes. No spaces, no capitals.',
    '',
    wrap('This password is temporary. Please change it. Anybody who can read '
      + 'this e-mail can use it, so it stops working after three days. Choose your '
      + 'own before then; if you miss it, tap "Forgot your password" when you sign '
      + 'in. There is a page for exactly that:'),
    `${appUrl}/password`,
    '',
    'OPEN THE APP',
    joinUrl.split('#')[0],
    '',
    ...(WAITS[role] ? [wrap(WAITS[role] as string), ''] : []),
    wrap('You can open this e-mail again, on any device. The button never '
      + 'expires; the password works for three days, or until you choose your own.'),
    '',
    wrap(AFTER[role]),
    '',
    wrap('To add Hope Beacon to your Home Screen, open Settings inside the app.'),
    '',
    oversightLines(churchName, appUrl).heading.toUpperCase(),
    ...oversightLines(churchName, appUrl).lines.flatMap((line) => [wrap(line), '']),
    wrap(`You received this because a leader at ${church} invited you, and an `
      + 'account was created for you at this address. If you were not expecting '
      + 'it, you can ignore this message, or ask the church to remove the account.'),
  ].join('\n');
}

