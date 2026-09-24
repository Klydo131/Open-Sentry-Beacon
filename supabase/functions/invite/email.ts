// The invitation, composed here, in three versions.
//
// WHY THIS FILE EXISTS AT ALL.
//
// Supabase Auth has exactly ONE "Invite user" template. Everybody who joins a
// church gets the same words whether they are being asked to be walked with, to
// walk with five others, or to run the congregation. There is no branch in that
// system to hang a role on, so the moment the owner asked for three different
// invitations, the Supabase template stopped being able to do the job.
//
// The alternative was three templates in Brevo's editor and a template id per
// role, which works and is still supported below -- but it puts the words a
// congregation reads behind a dashboard nobody has version control over, and
// somebody has to build and activate three of them by hand before a single
// invitation can go out.
//
// So the default is this: the function composes the message. The copy lives in
// git, changes go through review, and the rendering is covered by a test that
// checks all three roles rather than by remembering to click Preview.
//
// NO CONDITIONALS ANYWHERE IN THE OUTPUT. An earlier Brevo template used
// `{% if %}` blocks, and Brevo's preview showed them as literal text -- which is
// expected in preview, and left no way to confirm whether the engine resolves
// them at send time or ships them to the reader verbatim. That question does
// not arise here: the branch happens in TypeScript and what leaves this file is
// finished HTML.
//
// TABLES AND INLINE STYLES. Outlook renders with Word's engine, several clients
// drop <style> blocks, and none support flexbox or grid. Anything modern would
// look right in a browser and broken in the inbox, which is the only place this
// is ever seen. No images either, including the logo: images are blocked by
// default in most clients, so it would be an empty box for most readers. The
// mark is a table cell with a border-radius, which degrades to a coloured
// square rather than to nothing.

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
  // Being walked with. The reassurance is the point: an Explorer is often the
  // most hesitant person in this list, and the thing they most need to know is
  // that nobody else can see any of it.
  ds: {
    word: 'Explorer',
    subject: 'You are invited to Hope Beacon',
    lead:
      'Someone from the church would like to walk alongside you, at whatever '
      + 'pace suits you. Nobody else can see your journey, and nothing is '
      + 'shared beyond the person walking with you.',
  },

  // Walking with others. The five is stated in the invitation because it is the
  // single most important thing about the job and the thing most likely to be
  // misunderstood as a target rather than a ceiling.
  dm: {
    word: 'Guide',
    subject: 'You have been asked to be a Guide',
    lead:
      'They would like you to walk alongside others as a Guide. You will be '
      + 'paired with people one at a time, and each conversation stays between '
      + 'you and them.',
  },

  // Running the church. Named plainly, because somebody accepting this should
  // know before they click that they are taking on approving people.
  // Overseeing more than one congregation. Only another Executive Director can
  // send this, and the message says plainly what is being handed over, because
  // somebody accepting it can appoint Directors afterwards.
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

/**
 * One line about what happens after they sign in.
 *
 * REPLACES A THREE-STEP LIST, A "USING THE APP" PANEL AND TWO SETS OF INSTALL
 * INSTRUCTIONS. Those were written for somebody being walked through their
 * first day, and they were most of the length of the message -- which is part
 * of why Gmail read the whole thing as marketing and filed it under
 * Promotions. The install steps live in the app, under Settings, where the
 * person is standing when they actually need them.
 */
/**
 * The two roles that are not let in on arrival.
 *
 * `handle_new_user` approves Explorers and Executive Directors automatically;
 * a Guide or a Director signs in with a password that works and then meets
 * "your account is not approved yet". That reads as a broken password, which is
 * the one thing this whole design exists to stop somebody believing.
 *
 * IT LIVED IN THE THREE-STEP LIST THAT THIS REWRITE DELETED, and removing it
 * was caught by the test rather than by me. Kept as its own sentence now, where
 * shortening the message cannot take it away again by accident.
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

export function roleWord(role: InviteRole): string {
  return ROLE_COPY[role].word;
}

/**
 * The finished message. `appUrl` is the ordinary public home, used for the
 * install instructions. `joinUrl` is the sign-in page with the person's own
 * address already in it -- no longer a one-time link, and nothing about it
 * expires or is spent by being opened.
 *
 * THE ORDER OF THIS PAGE IS THE PRODUCT, and both rules in it were learned the
 * hard way.
 *
 * CREDENTIALS BEFORE THE BUTTON. Somebody who taps first and reads second
 * arrives at a sign-in box holding nothing, goes back to the mail, and half of
 * them do not come back.
 *
 * SIGNING IN BEFORE INSTALLING. The original order put the install steps at the
 * top, reasoning that nobody should spend a one-time link before knowing which
 * browser to use. It reads sensibly and it was wrong: people followed the
 * install steps, the installed app opened as a fresh session with no invitation
 * in it, and some never came back to the message at all. One Guide ended up
 * with an account that had no password and a spent link, repaired by hand.
 *
 * The spending problem is gone -- there is no token now -- but the ordering
 * stays, because the second half of that failure was never about tokens. An app
 * you install before you have an account is an app that opens on a sign-in
 * screen you cannot pass.
 */
/**
 * The name to greet somebody by, or '' when there is nothing worth using.
 *
 * WHY THIS IS FUSSY ABOUT WHAT COUNTS AS A NAME. The bulk panel falls back to
 * the local part of the address when a row has no name, so what arrives here
 * can be `stormwell88` or `maria.santos`. "Hi stormwell88," is worse than no
 * greeting at all: it is the exact tell of a machine-generated message, and
 * this e-mail is already fighting to be read as correspondence rather than as
 * a mailshot. So a greeting is used only when the first word looks like
 * something a person is actually called.
 *
 * FIRST NAME ONLY, because "Hi Maria Santos," reads like a summons and nobody
 * writes that to somebody they are inviting to church.
 */
export function greetingName(fullName: string): string {
  const first = (fullName ?? '').trim().split(/\s+/)[0] ?? '';
  if (first.length < 2 || first.length > 24) return '';
  // Letters, and the two punctuation marks that live inside real names: the
  // straight apostrophe, code point 27 in hex, and the curly one, code point
  // 2019 in hex, which is what a phone keyboard actually types in O’Brien.
  // A digit, a dot or an @ means this came from an address rather than a
  // person.
  //
  // BOTH ARE WRITTEN AS THEMSELVES ABOVE, NOT AS BACKSLASH-U ESCAPES, AND THAT
  // IS DELIBERATE -- INCLUDING IN THIS COMMENT, WHICH IS WHY IT SPELLS THEM OUT
  // IN WORDS. Deploying this function sends its source inline as JSON, and a
  // JSON string decodes a backslash-u escape on the way in. So an escape
  // written here arrives at Supabase as the bare character, and the deployed
  // file stops matching this one. That is how it was found: a byte-for-byte
  // diff of the live function against this directory, run after a placeholder
  // was deployed by mistake, reported five characters of drift.
  //
  // Harmless in this one line, because both spellings are the same character
  // class. NOT harmless in general -- an escape for a full stop would land as a
  // bare dot and quietly match any character at all, turning a strict pattern
  // into a permissive one with nothing on screen to show for it.
  //
  // tests/the-deployed-function-is-the-file.mjs forbids the escape anywhere in
  // this directory for that reason, and the two apostrophes are named in words
  // above so that nobody has to tell them apart by eye.
  if (!/^[\p{L}][\p{L}'’-]*$/u.test(first)) return '';
  // A list typed in lower case should still read as a name, but MacLeod and
  // O'Brien keep the capitals they arrived with.
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
              <p style="margin:0;font-size:14px;line-height:1.5;color:#5B6472;">All small letters and numbers, ten characters, no spaces.</p>
            </td></tr>
          </table>

          <p style="margin:0 0 22px 0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#7A2A20;">
            <strong>This password is temporary. Please change it.</strong> Anybody who can read this
            e-mail can use it. There is a page for exactly that:
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
            Nothing here expires. You can open this e-mail again, on any device, whenever you are ready.
          </p>
          <p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#5B6472;">
            ${esc(afterLine)} To add Hope&nbsp;Beacon to your Home Screen, open <strong>Settings</strong> inside the app.
          </p>

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
 * The same invitation as plain text.
 *
 * WHY THIS EXISTS, AND IT IS NOT AN ACCESSIBILITY AFTERTHOUGHT. A message with
 * only an HTML part is one of the signals Gmail weighs when deciding between
 * the Primary and Promotions tabs: ordinary correspondence is multipart, bulk
 * mail very often is not. The first invitation that reached a real inbox landed
 * in Promotions, and this is the strongest lever we hold on that.
 *
 * It also happens to be the version that works in a mail client with images and
 * styling switched off, on a watch, and read aloud by a screen reader -- so it
 * is worth having twice over.
 *
 * NO ESCAPING HERE, deliberately. Escaping is an HTML concern; `&amp;` in a
 * plain-text part is a bug, not a safety measure.
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

  // WRAPPED AT 72, AND BY A FUNCTION RATHER THAN BY HAND. The first draft broke
  // its lines wherever the source happened to end, which put "open Settings" on
  // one line and "inside the app." alone on the next. Plain text is the version
  // somebody reads when everything else has failed; it should not look like it
  // was assembled carelessly.
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
    'All small letters and numbers, ten characters, no spaces.',
    '',
    wrap('This password is temporary. Please change it. Anybody who can read '
      + 'this e-mail can use it. There is a page for exactly that:'),
    `${appUrl}/password`,
    '',
    'OPEN THE APP',
    joinUrl.split('#')[0],
    '',
    ...(WAITS[role] ? [wrap(WAITS[role] as string), ''] : []),
    wrap('Nothing here expires. You can open this e-mail again, on any device, '
      + 'whenever you are ready.'),
    '',
    wrap(AFTER[role]),
    '',
    wrap('To add Hope Beacon to your Home Screen, open Settings inside the app.'),
    '',
    wrap(`You received this because a leader at ${church} invited you, and an `
      + 'account was created for you at this address. If you were not expecting '
      + 'it, you can ignore this message, or ask the church to remove the account.'),
  ].join('\n');
}

