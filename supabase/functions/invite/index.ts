// Send an invitation.
//
// Holds the service_role key — the one key that bypasses every row level
// security policy — so it can never run in a browser.
//
// THE INVITATION CARRIES A PASSWORD, NOT A ONE-TIME LINK, and that is the whole
// design now. The account is created with a password before the message leaves;
// the message shows the address and that password above the button; nothing in
// this file mints a token. See ./password.ts for why the password is shaped the
// way it is, and note that Supabase's own mailer CANNOT carry it -- its
// template is fixed and has no field for credentials -- so a church that wants
// the fast path connects Brevo. The note below is about that mailer and is kept
// because the rate limit it describes still governs the fallback.
//
// THE EMAIL GOES THROUGH SUPABASE ITSELF when no Brevo key is set.
// An earlier version posted the message to an external provider (Brevo) and
// treated Supabase's own mailer as a fallback. That cost a day: the key, the
// sender and the site URL were all correct and loaded, and every single call
// was refused anyway because the provider's IP allow-list was switched on and
// Edge Functions have no fixed address to add to it. Invitations stopped
// because of a setting in a third party's dashboard that nobody could see from
// inside this app.
//
// Supabase's mailer cannot fail that way. It is sent by Supabase, from inside
// Supabase, with no third-party account, no API key to store, no sender address
// to verify and no allow-list to fall foul of. A fresh clone of this project
// sends working invitations with nothing configured at all.
//
// WHAT IT COSTS, said plainly, and the number is measured rather than guessed.
// TWO MESSAGES AN HOUR, for the whole project — the auth log for this church
// shows at most two successes in any hour and `over_email_send_rate_limit` on
// everything after, including invitations the Director believed had gone. There
// is also a separate one-per-address-per-minute limit. The template is the
// project's own Auth template rather than the church's words.
//
// That is enough for a church adding people one at a time and nowhere near
// enough for a launch weekend, and it CANNOT be raised while the built-in
// mailer is in use. A church inviting more than two people an hour connects its
// own provider over SMTP, which needs no change here at all: see docs/EMAIL.md.
// Until it does, every response from this function carries a join link the
// Director can send by hand, which is the reason that link exists.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { inviteHtml, inviteText, subjectFor, type InviteRole } from './email.ts';
import { firstPassword } from './password.ts';

// WHO MAY CALL THIS FROM A BROWSER.
//
// This is the one function in the project that holds the service_role key, so
// it is the one place a wildcard costs something. It was
// `Access-Control-Allow-Origin: *`, which let any site on the internet call it
// from a visitor's browser and READ THE REPLY. That reply contains a working
// join link and, on some paths, whether an address is already a member.
//
// Authorisation was never the wildcard's job and still is not: the function
// verifies the caller's token and refuses anybody who is not leadership, and
// the token lives in localStorage rather than a cookie, so a browser never
// attaches it to a cross-site request on its own. This is defence in depth, not
// the only lock. But an origin allowlist costs one environment variable, and
// "any site may read our replies" is not a sentence to leave in a project that
// holds a congregation's data.
//
// BEACON_ALLOWED_ORIGINS is a comma-separated list. Unset, it falls back to the
// wildcard so an existing deployment does not break the day this ships -- a
// security change that takes invitations down is a security change that gets
// reverted. Set it, and only those origins are answered.
const ALLOWED = (Deno.env.get('BEACON_ALLOWED_ORIGINS') || '')
  .split(',').map((o) => o.trim()).filter(Boolean);

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allow = ALLOWED.length === 0
    ? '*'
    : ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    // Caches and proxies must not hand one origin's response to another.
    'Vary': 'Origin',
  };
}

// No CORS headers here on purpose. The wrapper at the bottom of this file puts
// them on every response on the way out, so there is exactly one place that
// decides who may read a reply. A helper that set them too would be a second
// answer to the same question, and the two would drift.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/**
 * Read one setting: the environment first, then public.app_settings.
 *
 * app_settings has RLS on with no policies and every grant revoked from PUBLIC,
 * so the service role this function holds is the only thing that can read it.
 */
async function setting(admin: SupabaseClient, name: string): Promise<string> {
  const fromEnv = (Deno.env.get(name) || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const { data } = await admin
      .from('app_settings').select('value').eq('key', name).maybeSingle();
    return String(data?.value ?? '').trim();
  } catch {
    return '';
  }
}

const safeOrigin = (value: string | null) => {
  try {
    const url = new URL(value ?? '');
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : '';
  } catch {
    return '';
  }
};

// The handler answers; the wrapper below decides who is allowed to read the
// answer. Applying the headers in ONE place is the point: there are nineteen
// `return json(...)` paths in here, and a per-call-site rule is a rule that one
// of them eventually forgets.
async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Function is not configured.' }, 500);

  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in first.' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: caller, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !caller.user) return json({ error: 'Sign in first.' }, 401);

  const { data: me } = await admin
    .from('profiles')
    .select('id, role, church_id, is_approved, suspended_at')
    .eq('id', caller.user.id)
    .maybeSingle();

  if (!me || !me.is_approved) return json({ error: 'Your account is not approved yet.' }, 403);
  // A SUSPENDED DIRECTOR INVITES NOBODY. This function holds the service role
  // key and reads the caller's profile with it, so none of the database's own
  // refusals of a suspended account apply here: not the check the data API runs
  // before every request, not the row rules. An access token issued before the
  // suspension stays valid until it lapses, and "approved" never meant "not
  // suspended" -- so without this line a suspended Director could go on
  // bringing people into the church for up to an hour.
  if (me.suspended_at) return json({ error: 'This account is suspended.' }, 403);
  if (me.role !== 'admin' && me.role !== 'executive') {
    return json({ error: 'Only a Director may send an invitation.' }, 403);
  }
  if (!me.church_id) return json({ error: 'Your account is not in a church yet.' }, 400);

  let body: { email?: string; role?: string; full_name?: string; recommended_by?: string; deliver?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Send JSON.' }, 400);
  }

  const email = (body.email ?? '').trim().toLowerCase();
  const role = body.role ?? 'ds';
  const fullName = (body.full_name ?? '').trim();
  // HAND IT OVER INSTEAD OF EMAILING IT, ASKED FOR EXPLICITLY.
  //
  // A church whose email cannot be trusted still has to get people in. This
  // mode sends nothing, mints one token, and hands the Director the link to
  // pass on through whatever their congregation actually uses.
  //
  // It does not weaken the one-token rule below, it obeys it. The rule is that
  // exactly one token may exist for a person at a time, and the bug it exists
  // for was minting a SECOND one after a message carrying the first had already
  // gone. Here no message goes, so this is the first and only mint. What it
  // does replace is any link sent EARLIER, which is true of every invitation
  // and is why the screen asking for it says so.
  const handOver = body.deliver === 'link';

  if (!email || !email.includes('@')) return json({ error: 'That is not an email address.' }, 400);
  if (!['executive', 'admin', 'dm', 'ds'].includes(role)) return json({ error: 'Unknown role.' }, 400);
  // AN EXECUTIVE BENCH CAN ONLY BE APPOINTED BY THE BENCH. Same shape as the
  // Director guard below: the role being asked for is checked against who is
  // asking, in the one place holding the key that could bypass it.
  if (role === 'executive' && me.role !== 'executive') {
    return json({ error: 'Only an Executive Director can invite another Executive Director.' }, 403);
  }
  if (role === 'admin' && me.role !== 'executive') {
    return json({ error: 'Only an Executive Director may invite a Director.' }, 403);
  }

  const church = me.church_id;

  let recommendedBy: string | null = null;
  if (body.recommended_by) {
    if (role !== 'ds') {
      return json({ error: 'Only an Explorer invitation may name a Guide.' }, 400);
    }
    const { data: guide } = await admin
      .from('profiles')
      .select('id')
      .eq('id', body.recommended_by)
      .eq('church_id', church)
      .eq('role', 'dm')
      .eq('is_approved', true)
      .maybeSingle();
    if (!guide) return json({ error: 'Choose an approved Guide from this church.' }, 400);
    recommendedBy = guide.id;
  }

  // ALREADY IN THIS CHURCH? THEN THERE IS NOTHING TO INVITE THEM TO.
  //
  // Nothing checked this, so inviting somebody who was already a member created
  // a perfectly valid invitation for them. The Executive Director's own address
  // ended up with an open invitation as a Guide sitting in the Invitations
  // list — their account was untouched and still executive, but the screen
  // said otherwise, and there was no way to tell which was true.
  //
  // The role-change worry that first justified this check turned out not to be
  // real, and the note is kept rather than deleted because it explains why the
  // check is allowed to be lenient below: handle_new_user fires only on INSERT
  // into auth.users, so an invitation aimed at an address that already has an
  // account can never re-apply a role to it. Checked against the deployed
  // trigger body, not assumed.
  //
  // Addresses live in auth.users, which only the service role can read — which
  // is why this check belongs in this function and could not have been a policy.
  {
    // member_by_email is SECURITY DEFINER and granted to service_role ONLY.
    // It answers "is this address registered?", which is an enumeration oracle
    // in any browser's hands, so it is never exposed to one.
    const { data: found } = await admin.rpc('member_by_email', { p_email: email });
    const existing = Array.isArray(found) ? found[0] : found;

    // AN ACCOUNT IS NOT THE SAME AS HAVING JOINED, and refusing on the first
    // blocks exactly the person who most needs re-inviting.
    //
    // Every invitation creates the auth account up front, so an address whose
    // first invitation never arrived HAS an account and cannot sign in with it.
    // Refusing that as "already a member" strands them for good: the check
    // blocks the new invitation, and they have no password. Having opened a
    // link is no better a test — the Director opens it themselves to see that
    // it works. completed_at is stamped by the sign-up form, once, after a
    // password has been chosen, which is the first step that needs the invited
    // person to be there.
    if (existing && existing.completed_at) {
      const ROLE_NAME: Record<string, string> = {
        executive: 'an Executive Director',
        admin: 'a Director',
        dm: 'a Guide',
        ds: 'an Explorer',
      };
      const who = ROLE_NAME[String(existing.role)] ?? 'a member';
      if (existing.church_id === church) {
        return json({
          error:
            `${email} is already ${who} in this church`
            + `${existing.full_name ? ` (${existing.full_name})` : ''}. `
            + 'To change what they can do, use their entry in the member list rather than a new invitation.',
        }, 409);
      }
      // A different church's member. Say nothing about which, or the refusal
      // becomes a way to discover where an address is already registered.
      return json({ error: `${email} already has a Hope Beacon account.` }, 409);
    }
  }

  // ONE INVITATION PER ADDRESS, REFRESHED — NOT A SECOND ROW, NOT A REFUSAL.
  //
  // This was an insert that leaned on a unique index to detect a repeat, and
  // both halves were broken by the same misunderstanding of redeemed_at.
  //
  //   * The index is `unique (church_id, lower(email)) where redeemed_at is
  //     null`, and redeemed_at is stamped when the account row is created,
  //     which is the moment the first invitation is SENT. So the index stopped
  //     applying immediately and a second invitation to the same person quietly
  //     inserted a SECOND ROW.
  //   * The recovery path underneath it looked up the existing invitation with
  //     the same `redeemed_at is null` filter, found nothing for the same
  //     reason, and returned "that person already has an open invitation"
  //     without sending anything at all. Pressing Re-send did nothing and
  //     reported success.
  //
  // Looking the invitation up first is both simpler and correct: if there is
  // one, refresh it and send again; if there is not, make one. The Director
  // pressing Re-send now always causes a message, which is the entire point of
  // the button. Migration 0020 makes the index unconditional so a duplicate
  // cannot appear even if this logic is changed again.
  const { data: priorRows } = await admin
    .from('invites')
    .select('id')
    .eq('church_id', church)
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(1);
  const prior = priorRows?.[0];

  let inviteId = prior?.id as string | undefined;
  const resent = Boolean(prior);

  if (prior) {
    // The role and the name may have been corrected since. Push the expiry out
    // as well, or a Re-send would hand over a link that is already dead.
    await admin
      .from('invites')
      .update({
        role,
        full_name: fullName || null,
        invited_by: me.id,
        recommended_by: recommendedBy,
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq('id', prior.id);
  } else {
    const { data: invite, error: inviteErr } = await admin
      .from('invites')
      .insert({
        church_id: church,
        email,
        role,
        full_name: fullName || null,
        invited_by: me.id,
        recommended_by: recommendedBy,
      })
      .select('id')
      .single();
    if (inviteErr) return json({ error: inviteErr.message }, 400);
    inviteId = invite.id;
  }

  const site = safeOrigin(await setting(admin, 'SITE_URL')) || safeOrigin(req.headers.get('Origin'));
  if (!site) {
    if (!resent) await admin.from('invites').delete().eq('id', inviteId);
    return json({ error: 'Cannot work out this app’s address. Set SITE_URL.' }, 400);
  }

  // ---------------------------------------------------------------------
  // THE ACCOUNT IS READY BEFORE THE MESSAGE LEAVES.
  // ---------------------------------------------------------------------
  //
  // The invitation used to carry a one-time link and nothing else, and a
  // one-time link is fragile in ways nobody invited to a church app should have
  // to understand. It expires. It is SPENT BY THE FIRST THING THAT OPENS IT,
  // which on many mail systems is a scanner and not a person. It works once, so
  // a second tap fails. Twenty-three people were once stuck at the same moment,
  // each holding an account with no password and a link already used.
  //
  // So the account is created here, with a password already on it, and the
  // message carries that password. Nothing to expire, nothing to spend, and it
  // survives being forwarded, re-opened, or tapped twice. It can also be read
  // aloud to somebody helping an older member get set up, which is how this
  // actually happens in a congregation.
  //
  // ORDER MATTERS AND IS NOT INTERCHANGEABLE. `handle_new_user` fires on INSERT
  // into auth.users and reads public.invites BY EMAIL to find the role, the
  // church and the recommended Guide. Create the account before the invitation
  // row exists and the person arrives with no church and no role. The row is
  // written above; the account is created here, after it, deliberately.
  //
  // NOBODY'S WORKING PASSWORD IS EVER OVERWRITTEN. An address that has finished
  // signing up is refused far above this point, so `updateUserById` is only
  // ever reached for an account that was created by an earlier invitation and
  // never used. Resending to that person replaces a password they never had.
  // A PASSWORD THE PROJECT MIGHT REFUSE, AND WHAT TO DO ABOUT IT.
  //
  // This project has Supabase's "prevent use of leaked passwords" turned on,
  // which rejects any password found in the HaveIBeenPwned corpus. A generated
  // password is a real word plus digits -- `harbor4821` -- which is exactly the
  // shape those lists are full of, so a draw landing in the corpus is unlikely
  // per invitation and close to inevitable across a launch of two dozen.
  //
  // THE FAILURE IT WOULD CAUSE IS THE WORST KIND: not an error anybody could
  // act on, but one person out of twenty-five who never receives an invitation,
  // while the Director sees nothing wrong. So a refusal is not reported, it is
  // retried with a fresh draw. Three attempts, because a fourth would be
  // telling us something other than bad luck.
  //
  // WHETHER THE ADMIN API APPLIES THE CHECK AT ALL IS UNVERIFIED. The
  // documentation does not say, and this sandbox cannot reach the API to find
  // out. That is the reason for the retry rather than an argument against it:
  // if the check never fires, this loop runs once and costs nothing.
  let tempPassword = firstPassword();
  let passwordError = '';
  {
    const { data: found } = await admin.rpc('member_by_email', { p_email: email });
    const existing = Array.isArray(found) ? found[0] : found;
    let personId = existing?.id ? String(existing.id) : '';

    /** A refusal about the password itself, rather than about the account. */
    const refusedThePassword = (why: string) =>
      /weak|leak|pwned|compromis|breach/i.test(why);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) tempPassword = firstPassword();
      passwordError = '';

      if (personId) {
        const { error } = await admin.auth.admin.updateUserById(personId, {
          password: tempPassword,
          // An invitation is the church vouching for the address. Making them
          // confirm it as well is a second hurdle for no extra safety, and it is
          // the hurdle the one-time link already failed at.
          email_confirm: true,
        });
        if (error) passwordError = String(error.message ?? error);
      } else {
        const { data: made, error } = await admin.auth.admin.createUser({
          email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: { full_name: fullName },
        });
        if (error) passwordError = String(error.message ?? error);
        // KEEP THE ID EVEN IF A LATER ATTEMPT IS NEEDED. Without this, a second
        // pass would try to CREATE the account again and be refused as already
        // registered, turning a recoverable draw into a dead invitation.
        if (made?.user?.id) personId = made.user.id;
      }

      if (!passwordError) break;
      if (!refusedThePassword(passwordError)) break;
      console.log(JSON.stringify({ at: 'invite', warn: 'password refused', attempt }));
    }

    // MARK IT TEMPORARY, so the app can ask them to change it. Done after the
    // account exists, because handle_new_user builds the profile row as part of
    // that insert and there is nothing to update before it.
    //
    // A FAILURE HERE IS NOT A FAILED INVITATION. The password is set and the
    // person can get in; all that is lost is a reminder card. Refusing the
    // whole invitation over a missing nudge would be the wrong trade.
    if (!passwordError && personId) {
      const { error: flagErr } = await admin
        .from('profiles')
        .update({ password_is_temporary: true })
        .eq('id', personId);
      if (flagErr) console.log(JSON.stringify({ at: 'invite', warn: 'flag', why: flagErr.message }));
    }
  }

  // A MESSAGE WITH NO PASSWORD IN IT IS WORSE THAN NO MESSAGE. If the account
  // could not be given one, stop here rather than sending an invitation whose
  // credentials box is empty or wrong. The invitation row survives, so the
  // Director can simply press send again.
  if (passwordError) {
    return json({
      error: `Could not set up the account for that address: ${passwordError}`,
    }, 400);
  }

  // WHO SENDS THE INVITATION, AND WHY IT IS A SETTING RATHER THAN A REWRITE.
  //
  // Supabase Auth has ONE email template per kind and one mailer, so an
  // invitation designed for a congregation and a password reset are forced to
  // share a look and a set of variables. A church that wants to write its own
  // welcome, with its own words and its own design, cannot do it there.
  //
  // So: if BREVO_API_KEY is present, the invitation is composed and posted by
  // this function, and the church designs it in Brevo. If it is absent,
  // Supabase Auth sends it exactly as before. Password resets are untouched by
  // this choice and continue to go through Supabase Auth over SMTP, which is
  // what a reset should be -- it belongs to the auth system, not the church.
  //
  // THE ONE-TOKEN RULE NO LONGER APPLIES, AND THE HISTORY IS WORTH KEEPING.
  //
  // auth.users has ONE confirmation_token slot and ONE recovery_token slot. Any
  // second mint for the same purpose overwrites the first, so a token already
  // sitting in somebody's inbox died the moment anything minted another. That
  // rule governed the whole shape of this function and broke it repeatedly.
  //
  // This function no longer mints tokens at all. The account is given a
  // password above and the message carries it, so there is no slot to race and
  // nothing to overwrite. The comment below the send, and this one, are kept so
  // the next person understands why the code is not arranged around a rule that
  // used to matter enormously.
  const brevoKey = await setting(admin, 'BREVO_API_KEY');
  // THE SENDER IS THE CHURCH'S, NEVER A DEFAULT IN THIS FILE. This fell back to
  // one particular church's address, which put that church's domain in every
  // fork of a public repository and made every other church's Brevo refuse the
  // mail, because Brevo only sends from an address that account has verified.
  // No sender set means Brevo is not ready, so Supabase's own mailer is used,
  // exactly as when no Brevo key is set, and the log says why.
  const brevoSender = brevoKey ? await setting(admin, 'BREVO_SENDER') : '';
  if (brevoKey && !brevoSender) {
    console.log(JSON.stringify({ at: 'invite', warn: 'BREVO_API_KEY is set but BREVO_SENDER is not; using the Supabase mailer' }));
  }

  let via = '';
  let sendError = '';
  let waitSeconds = 0;
  let joinUrl = '';

  if (handOver) {
    // Nothing is sent. The address is built by the same fallback below that
    // every other unsent invitation uses, so there is one place in this
    // function that decides the shape of the link and one to get wrong.
    sendError = 'No email was sent. You asked to pass the details on yourself.';
  } else if (brevoKey && brevoSender) {
    // NO TOKEN IS MINTED ANY MORE, and that is the point of this change.
    //
    // This used to call generateLink and put a one-time token in the message.
    // The account now has a password before this line is reached, so the
    // address in the email is the ordinary sign-in page with the person's own
    // address already filled in. It cannot expire, cannot be spent by a mail
    // scanner opening it, and works on the tenth tap as well as the first.
    const kind = 'password';
    {
      joinUrl = `${site}/login?email=${encodeURIComponent(email)}#p=${encodeURIComponent(tempPassword)}`;

      const { data: churchRow } = await admin
        .from('churches').select('name').eq('id', church).maybeSingle();
      const churchName = String(churchRow?.name ?? '').trim();

      // A TEMPLATE PER ROLE, IF THE CHURCH WANTS ONE, AND OTHERWISE NONE AT ALL.
      //
      // The owner asked for three different invitations -- an Explorer being
      // walked with, a Guide walking with five others, a Director approving
      // people -- and Supabase Auth cannot do that: it has ONE invite template
      // with no branch to hang a role on. Brevo can, two ways.
      //
      // The way that needs no dashboard work is the default: email.ts composes
      // the message, so the words live in git, change through review, and are
      // rendered by a test across all three roles rather than by remembering to
      // click Preview.
      //
      // A church that would rather design in Brevo's editor sets one id per
      // role. BREVO_INVITE_TEMPLATE_ID stays honoured as the id for every role,
      // so an existing single-template setup keeps working untouched.
      const ROLE_TEMPLATE_SETTING: Record<string, string> = {
        ds: 'BREVO_INVITE_TEMPLATE_ID_DS',
        dm: 'BREVO_INVITE_TEMPLATE_ID_DM',
        admin: 'BREVO_INVITE_TEMPLATE_ID_ADMIN',
        executive: 'BREVO_INVITE_TEMPLATE_ID_EXECUTIVE',
      };
      const templateId =
        Number(await setting(admin, ROLE_TEMPLATE_SETTING[role] ?? '')) ||
        Number(await setting(admin, 'BREVO_INVITE_TEMPLATE_ID')) || 0;

      const senderEmail = brevoSender;
      const senderName = (await setting(admin, 'BREVO_SENDER_NAME')) || 'Hope Beacon';

      const asRole = role as InviteRole;
      const ROLE_WORD: Record<string, string> = {
        admin: 'Director', executive: 'Executive Director', dm: 'Guide', ds: 'Explorer',
      };

      const payload: Record<string, unknown> = {
        sender: { email: senderEmail, name: senderName },
        to: [fullName ? { email, name: fullName } : { email }],
      };

      if (templateId) {
        payload.templateId = templateId;
        // Brevo merges these into whatever the church designed. Names are
        // SHOUTED because that is Brevo's own convention for template params
        // and a lowercase one is easy to mistype into silence.
        payload.params = {
          JOIN_URL: joinUrl,
          FULL_NAME: fullName,
          CHURCH_NAME: churchName,
          ROLE: ROLE_WORD[role] ?? 'member',
          // A church designing its own template needs these or its invitation
          // is the only one that cannot tell people how to sign in.
          SIGN_IN_EMAIL: email,
          TEMP_PASSWORD: tempPassword,
        };
      } else {
        // SUBJECTS DIFFER PER ROLE, and that is not decoration. Gmail threads by
        // subject and collapses a later message in a thread behind "Show quoted
        // text" when it resembles an earlier one -- which is how two
        // invitations to one person came to read as one invitation and one
        // blank message. Three roles, three subjects, no collapsing.
        payload.subject = subjectFor(asRole);
        payload.htmlContent = inviteHtml(asRole, churchName, joinUrl, site, email, tempPassword, fullName);
        // BOTH PARTS, AND THE TEXT ONE IS NOT DECORATION. A message carrying
        // only HTML is one of the signals Gmail weighs between Primary and
        // Promotions -- correspondence is normally multipart, bulk mail very
        // often is not. The first invitation to reach a real inbox landed in
        // Promotions, and this is the strongest lever we hold on that. It is
        // also what a mail client with styling switched off, a watch, and a
        // screen reader all get.
        payload.textContent = inviteText(asRole, churchName, joinUrl, site, email, tempPassword, fullName);
      }

      try {
        const res = await fetch('https://api.brevo.com/v3/smtp/email', {
          method: 'POST',
          headers: {
            'api-key': brevoKey,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          via = `brevo:${kind}`;
        } else {
          // Brevo's own words, kept. The classifier below turns the two we can
          // act on into instructions and leaves the rest alone.
          sendError = `Brevo refused this (${res.status}): ${(await res.text()).slice(0, 300)}`;
        }
      } catch (err) {
        sendError = `Could not reach Brevo: ${String((err as Error)?.message ?? err)}`;
      }
    }
  } else {
    // SUPABASE AUTH SENDS IT. Two shapes, because the person either has an
    // account or does not.
    //
    //   inviteUserByEmail      creates the account AND sends "you have been invited"
    //   resetPasswordForEmail  sends "set a password" to an account that exists
    //
    // A resend almost always lands on the second: the first invitation created
    // the account, so inviting again is refused as already registered. Both
    // mails land on /join, which finishes the sign-up either way.
    // AND THIS PATH CANNOT CARRY THE PASSWORD, which is the reason to prefer
    // Brevo now rather than merely a nicer-looking reason. Supabase Auth sends
    // its own fixed template; there is no field in it for the credentials this
    // function just created, so the recipient gets a link and no password.
    //
    // The account already exists by the time we get here -- this function made
    // it a moment ago -- so inviteUserByEmail is refused as already registered
    // every time and the recovery mail is what actually goes. The first call is
    // kept because a project with its own SMTP may still answer it, and because
    // its refusal is how we learn which of the two shapes applies.
    joinUrl = `${site}/login?email=${encodeURIComponent(email)}#p=${encodeURIComponent(tempPassword)}`;

    const { error: inviteMailErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo: `${site}/join`,
    });

    if (!inviteMailErr) {
      via = 'invite';
    } else if (/already|registered|exists/i.test(String(inviteMailErr.message ?? ''))) {
      const { error: resetErr } = await admin.auth.resetPasswordForEmail(email, {
        redirectTo: `${site}/join?recovery=1`,
      });
      if (!resetErr) via = 'recovery';
      else sendError = String(resetErr.message ?? '');
    } else {
      sendError = String(inviteMailErr.message ?? '');
    }

    // Told either way, because a Director who does not know this will assume
    // the person received what the screen shows them.
    if (!sendError) {
      sendError = 'Sent, but this project has no Brevo key, so the message came '
        + 'from Supabase and could NOT include the password below. Pass the '
        + 'e-mail and password on yourself.';
    }
  }

  // WHY THE SEND FAILED, IN WORDS A DIRECTOR CAN ACT ON.
  //
  // Four different refusals arrive here, and three of them used to be shown as
  // raw provider text — which reads as "the app is broken" for causes that are
  // nothing of the sort.
  //
  //   "after N seconds"            one message per ADDRESS per minute.
  //   "email rate limit exceeded"  the whole PROJECT's hourly quota is spent.
  //   "525 Unauthorized IP"        the provider's IP blocking is switched on.
  //   anything else SMTP-shaped    the provider refused; pass on what it said.
  //
  // The second one is the wall this church kept hitting. With no provider
  // connected, Supabase's built-in mailer allows two messages an hour for the
  // entire project — measured, not guessed: the auth log shows at most two
  // successes in any hour and a 429 on everything after. So a Director inviting
  // a third person gets a refusal that has nothing to do with the address they
  // typed, and the old message showed them the raw provider text and left them
  // to work that out.
  //
  // Connecting SMTP raises that ceiling but does not remove it, and the refusal
  // arriving here looks identical at either height. The note on the branch
  // itself explains why the message no longer names a mailer or a number.
  if (sendError) {
    const cooldown = /after (\d+) seconds/i.exec(sendError);
    if (cooldown) {
      waitSeconds = Number(cooldown[1]);
      sendError =
        'Nearly there. One message per address per minute, and one has just gone out. '
        + `Wait ${cooldown[1]} seconds and press Send once. The link below works meanwhile.`;
    } else if (/525|unauthorized ip/i.test(sendError)) {
      // The one failure a church cannot diagnose from inside this app, because
      // the cause is a toggle in somebody else's dashboard. Brevo answers an
      // SMTP connection from an address it does not recognise with
      // `525 5.7.1 Unauthorized IP address`, and it applies that list to SMTP
      // as well as to API keys — the fact that cost a day here.
      //
      // Adding an address does not fix it. The connection is made by the mail
      // service, not by the Director's computer, and its address changes. The
      // list has to be switched off, not added to.
      sendError =
        'Your email provider refused the connection because it does not '
        + 'recognise the address it came from. That is IP blocking, and it has '
        + 'to be turned OFF rather than added to. The connection is made by '
        + 'your mail service, not by this computer, and its address changes. '
        + 'In Brevo: Settings → Security → Authorized IPs → Deactivate '
        + 'blocking. The link below works meanwhile.';
    } else if (/email rate limit|over_email_send_rate/i.test(sendError)) {
      // DO NOT NAME THE MAILER OR THE NUMBER HERE.
      //
      // This message used to say "Supabase's built-in mailer sends two messages
      // an hour". That was true of this project and false of any church that had
      // connected its own provider, which is exactly the group most likely to be
      // sending in volume and so most likely to read it. A Director on Brevo
      // hitting their raised ceiling was told to go and connect a provider they
      // had already connected.
      //
      // GoTrue reports the refusal identically either way and never says which
      // mailer or which ceiling, so the honest message describes the symptom and
      // names BOTH remedies. Whoever reads it knows which of the two situations
      // they are in. This function does not, and must not pretend to.
      sendError =
        'This church has used up its email allowance for the hour. Nothing is '
        + 'broken and nothing was lost: the account exists and the link below '
        + 'works, so send that to this person now, and the next hour starts '
        + 'fresh. If no email provider is connected yet, the allowance is two '
        + 'messages an hour for the whole project, and connecting one is what '
        + 'lifts it. If a provider is already connected, raise the ceiling under '
        + 'Authentication and then Rate Limits. Either way, docs/EMAIL.md has '
        + 'the steps.';
    } else if (/smtp|relay|starttls|authentication failed/i.test(sendError)) {
      // Custom SMTP is configured and the provider said no. Which provider and
      // why is theirs to say, so their words are kept — but the two things a
      // Director can actually go and check are named.
      sendError =
        `Your email provider refused to send this: ${sendError} `
        + 'The usual causes are an SMTP key that has been regenerated, or a '
        + 'sender address the provider has not verified. The link below works '
        + 'meanwhile.';
    }
  }

  // THE FALLBACK ADDRESS. NOTHING IS MINTED HERE ANY MORE, AND THE HISTORY OF
  // WHY THAT MATTERED IS KEPT BECAUSE IT BROKE EVERY INVITATION THIS APP SENT.
  //
  // This block used to run on every call, under the heading "a link to pass on
  // by hand, ALWAYS". Here is what that actually did.
  //
  // auth.users has ONE confirmation_token column and ONE recovery_token column.
  // A one-time token is not remembered alongside others; it is a single slot.
  // inviteUserByEmail mints a token, writes it to that slot, and emails it.
  // resetPasswordForEmail does the same for recovery. generateLink then minted a
  // SECOND token for the same purpose and overwrote the slot -- so the token
  // sitting in the recipient's inbox was dead before they opened the message.
  // (Past tense throughout: no token is minted anywhere in this file now.)
  // Clicking it returns error_code=otp_expired, and /join reports "this
  // invitation link has expired or has already been used", correctly. Every
  // invitation. Every person. Every time.
  //
  // And the link it destroyed the working token to produce was then thrown
  // away: both screens read `link` only when `delivery === 'link'`. On the
  // success path nothing ever displayed it. The call had no beneficiary at all.
  //
  // The worry behind "always" was real. Supabase builds the emailed link from
  // the project's Site URL, and a project left on its defaults mails everybody
  // a link to http://localhost:3000 while reporting success. But the answer to
  // "the emailed link might be wrong" can never be "make certain the emailed
  // link is wrong". That failure is diagnosed by checking Site URL once, not by
  // breaking every send forever.
  //
  // When the mail did NOT go there is no token in anybody's inbox to protect,
  // so minting one here costs nothing and is the only way that person gets in.
  // That is why the fallback keeps working exactly as before.
  // NOTHING IS MINTED HERE ANY MORE. This block used to generate a one-time
  // token so a Director could pass on a working link when the mail failed. The
  // account has a password now, so the thing to hand over is the address and
  // that password -- both already in the reply below. A token minted here would
  // be a SECOND credential for the same account, and the whole reason this
  // function was rewritten is that one-time tokens are the fragile part.
  if (!joinUrl) joinUrl = `${site}/login?email=${encodeURIComponent(email)}#p=${encodeURIComponent(tempPassword)}`;

  console.log(JSON.stringify({
    at: 'invite',
    delivery: sendError ? 'link' : 'email',
    via,
    resent,
    reason: sendError,
    wait_seconds: waitSeconds,
    have_site_url: Boolean(site),
  }));

  if (sendError) {
    // The account and the link are real even though the mail did not go, so the
    // invitation row STAYS and the Director is handed the link. Deleting it here
    // would throw away a working invitation over a bad minute.
    return json({
      ok: true,
      invite_id: inviteId,
      delivery: 'link',
      resent,
      link: joinUrl,
      signInEmail: email,
      tempPassword,
      mailNote: sendError,
      waitSeconds: waitSeconds || undefined,
    });
  }

  // THE LINK AND THE PASSWORD COME BACK EVEN ON SUCCESS, and that used to be
  // forbidden for a good reason that no longer applies. While the invitation
  // carried a one-time token, replying with a link meant MINTING A SECOND ONE
  // and killing the token already in the person's inbox. There is no token now.
  // The address is the ordinary sign-in page and the password is the one that
  // was emailed -- the same two facts, not a new credential -- so a Director
  // whose member says "nothing arrived" can read them out over the phone
  // instead of sending another invitation.
  return json({
    ok: true,
    invite_id: inviteId,
    delivery: 'email',
    via,
    resent,
    link: joinUrl,
    signInEmail: email,
    tempPassword,
  });
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  // The preflight is the one the browser actually consults before it will let
  // a page read the reply, so it has to carry the real decision -- not the
  // fallback the old static constant handed back to everybody.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const res = await handle(req);
  for (const [key, value] of Object.entries(cors)) res.headers.set(key, value);
  return res;
});
