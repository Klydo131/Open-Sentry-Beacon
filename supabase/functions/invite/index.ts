// Send an invitation. Holds the service role key, so it must never run in a
// browser.
//
// The account is created with a temporary password before the message is
// sent, and the message carries that password (see ./password.ts); no
// one-time token is minted. With BREVO_API_KEY set, this function composes and
// sends the email; otherwise Supabase's own mailer sends a password-reset
// email instead, which cannot carry the password and is limited to a few
// messages an hour (docs/EMAIL.md). Every reply includes a sign-in link and
// the password, so a Director can pass them on by hand.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { inviteHtml, inviteText, subjectFor, type InviteRole } from './email.ts';
import { firstPassword } from './password.ts';

// Which browser origins may read the reply: BEACON_ALLOWED_ORIGINS, a
// comma-separated list. Unset, any origin is answered, so existing
// deployments keep working; authorisation is the token check, not this.
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

// CORS headers are added in one place, by the wrapper at the bottom.
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

/** Whether this person has an authenticator app they have confirmed with a code. */
function hasConfirmedSecondStep(user: { factors?: { status?: string }[] }): boolean {
  return (user.factors ?? []).some((f) => f.status === 'verified');
}

/** The sign-in level a token carries: `aal2` after password and code. */
function tokenLevel(token: string): string {
  try {
    const part = token.split('.')[1] ?? '';
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { aal?: unknown };
    return typeof claims.aal === 'string' ? claims.aal : '';
  } catch {
    return '';
  }
}

// The handler answers; the wrapper below adds CORS to every response.
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
  // A suspended Director invites nobody. This function reads with the service
  // role key, so the database's own refusal of a suspended account does not apply.
  if (me.suspended_at) return json({ error: 'This account is suspended.' }, 403);
  // Once a Director has two-step sign-in, a password-only token invites nobody
  // (the database's own aal2 check does not reach the service role).
  if (hasConfirmedSecondStep(caller.user) && tokenLevel(token) !== 'aal2') {
    return json({ error: 'Finish two-step sign-in first.' }, 403);
  }
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
  // "Hand it over": send no email and return the sign-in details to pass on by hand.
  const handOver = body.deliver === 'link';

  if (!email || !email.includes('@')) return json({ error: 'That is not an email address.' }, 400);
  if (!['executive', 'admin', 'dm', 'ds'].includes(role)) return json({ error: 'Unknown role.' }, 400);
  // Only an Executive Director may invite an Executive Director.
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

  // Already in this church? Nothing to invite them to. Addresses live in
  // auth.users, which only the service role can read, so the check is here.
  {
    // member_by_email is granted to the service role only: in a browser it would
    // reveal which addresses are registered.
    const { data: found } = await admin.rpc('member_by_email', { p_email: email });
    const existing = Array.isArray(found) ? found[0] : found;

    // An account is not the same as having joined: every invitation creates the
    // account up front. Only completed_at (set when the person chooses a password)
    // means they joined, so only that refuses a new invitation.
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
      // A member of another church: do not say which, or the refusal reveals it.
      return json({ error: `${email} already has a Hope Beacon account.` }, 409);
    }
  }

  // One invitation per address: refresh an existing one and send again,
  // otherwise create one.
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
    // Refresh role, name and expiry, so a re-send is never already expired.
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

  // Create the account with a password before the email is sent. The
  // invitation row must exist first: handle_new_user reads it by email to set
  // the role, church and Guide. A finished sign-up was refused above, so this
  // never overwrites a password somebody chose.
  //
  // The project may refuse a generated password found in leaked-password lists,
  // so a refusal is retried with a fresh draw, up to three times.
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
          // The invitation vouches for the address, so no separate email confirmation.
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
        // Keep the id, so a retry updates the account instead of creating it again.
        if (made?.user?.id) personId = made.user.id;
      }

      if (!passwordError) break;
      if (!refusedThePassword(passwordError)) break;
      console.log(JSON.stringify({ at: 'invite', warn: 'password refused', attempt }));
    }

    // Mark the password temporary, so the app asks them to change it. A failure
    // here does not fail the invitation.
    if (!passwordError && personId) {
      const { error: flagErr } = await admin
        .from('profiles')
        .update({ password_is_temporary: true })
        .eq('id', personId);
      if (flagErr) console.log(JSON.stringify({ at: 'invite', warn: 'flag', why: flagErr.message }));

      // Start the temporary password's clock (it lasts three days). A failure is
      // logged, not fatal.
      const { error: clockErr } = await admin.rpc('start_temporary_password', { p_user: personId });
      if (clockErr) console.log(JSON.stringify({ at: 'invite', warn: 'clock', why: clockErr.message }));
    }
  }

  // Without a password on the account, send nothing; the row stays for a retry.
  if (passwordError) {
    return json({
      error: `Could not set up the account for that address: ${passwordError}`,
    }, 400);
  }

  // With BREVO_API_KEY set, this function composes and sends the invitation;
  // otherwise Supabase Auth sends one. Password resets always go through
  // Supabase Auth.
  const brevoKey = await setting(admin, 'BREVO_API_KEY');
  // The sender is the church's own verified address. Without one, fall back to
  // Supabase's mailer.
  const brevoSender = brevoKey ? await setting(admin, 'BREVO_SENDER') : '';
  if (brevoKey && !brevoSender) {
    console.log(JSON.stringify({ at: 'invite', warn: 'BREVO_API_KEY is set but BREVO_SENDER is not; using the Supabase mailer' }));
  }

  let via = '';
  let sendError = '';
  let waitSeconds = 0;
  let joinUrl = '';

  if (handOver) {
    // Nothing is sent; the fallback below builds the sign-in link.
    sendError = 'No email was sent. You asked to pass the details on yourself.';
  } else if (brevoKey && brevoSender) {
    // The link is the ordinary sign-in page with the address filled in.
    const kind = 'password';
    {
      joinUrl = `${site}/login?email=${encodeURIComponent(email)}#p=${encodeURIComponent(tempPassword)}`;

      const { data: churchRow } = await admin
        .from('churches').select('name').eq('id', church).maybeSingle();
      const churchName = String(churchRow?.name ?? '').trim();

      // Optional Brevo template ids per role; without them, ./email.ts composes the
      // message. BREVO_INVITE_TEMPLATE_ID applies to every role.
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
        // Brevo template params are upper case by Brevo convention.
        payload.params = {
          JOIN_URL: joinUrl,
          FULL_NAME: fullName,
          CHURCH_NAME: churchName,
          ROLE: ROLE_WORD[role] ?? 'member',
          // A church template needs these to tell people how to sign in.
          SIGN_IN_EMAIL: email,
          TEMP_PASSWORD: tempPassword,
        };
      } else {
        // A different subject per role, so Gmail does not collapse two invitations into one thread.
        payload.subject = subjectFor(asRole);
        payload.htmlContent = inviteHtml(asRole, churchName, joinUrl, site, email, tempPassword, fullName);
        // Send a plain-text part too: HTML-only mail is more likely to land in Promotions.
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
          // Keep Brevo's own words; the classifier below explains the ones a Director can act on.
          sendError = `Brevo refused this (${res.status}): ${(await res.text()).slice(0, 300)}`;
        }
      } catch (err) {
        sendError = `Could not reach Brevo: ${String((err as Error)?.message ?? err)}`;
      }
    }
  } else {
    // Supabase Auth sends it: inviteUserByEmail for a new account, otherwise a
    // password-reset email. Neither can carry the password, so prefer Brevo.
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

    // Tell the Director either way.
    if (!sendError) {
      sendError = 'Sent, but this project has no Brevo key, so the message came '
        + 'from Supabase and could NOT include the password below. Pass the '
        + 'e-mail and password on yourself.';
    }
  }

  // Turn the common refusals into words a Director can act on:
  //   "after N seconds"            one message per address per minute
  //   "email rate limit exceeded"  the project's hourly quota is used up
  //   "525 Unauthorized IP"        the provider's IP restriction is on
  //   other SMTP errors            pass on what the provider said
  if (sendError) {
    const cooldown = /after (\d+) seconds/i.exec(sendError);
    if (cooldown) {
      waitSeconds = Number(cooldown[1]);
      sendError =
        'Nearly there. One message per address per minute, and one has just gone out. '
        + `Wait ${cooldown[1]} seconds and press Send once. The link below works meanwhile.`;
    } else if (/525|unauthorized ip/i.test(sendError)) {
      // The provider's IP restriction must be switched off, not added to: the
      // mail service's address changes.
      sendError =
        'Your email provider refused the connection because it does not '
        + 'recognise the address it came from. That is IP blocking, and it has '
        + 'to be turned OFF rather than added to. The connection is made by '
        + 'your mail service, not by this computer, and its address changes. '
        + 'In Brevo: Settings → Security → Authorized IPs → Deactivate '
        + 'blocking. The link below works meanwhile.';
    } else if (/email rate limit|over_email_send_rate/i.test(sendError)) {
      // The quota differs by mailer and the error does not say which, so name both remedies.
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
      // Custom SMTP refused it: keep the provider's words and name what to check.
      sendError =
        `Your email provider refused to send this: ${sendError} `
        + 'The usual causes are an SMTP key that has been regenerated, or a '
        + 'sender address the provider has not verified. The link below works '
        + 'meanwhile.';
    }
  }

  // The sign-in link to hand over when no email went out.
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
    // The account and link are real, so the invitation row stays.
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

  // Return the link and password on success too, so a Director can read them
  // out if the email does not arrive.
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
  // The preflight must carry the real CORS decision.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const res = await handle(req);
  for (const [key, value] of Object.entries(cors)) res.headers.set(key, value);
  return res;
});
