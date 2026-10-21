// Email a leader the code that opens the court room's door, where the project
// has chosen email (COURT_DOOR_METHOD = email in public.app_settings; see
// supabase/migrations/20261021100000_the_court_room_door_by_email.sql).
//
// Holds the service role key, so it must never run in a browser. The code is
// made by the database for the caller's own sign-in session, sent from here
// through Brevo, and never returned to the browser: proving it is the
// browser's job (court_email_code_prove), which is the point.
//
// Needs BREVO_API_KEY and BREVO_SENDER, under Edge Functions → Secrets or in
// public.app_settings, the same two the invitations use (docs/EMAIL.md).

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

// Which browser origins may read the reply, as in ../invite.
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
    'Vary': 'Origin',
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** One setting: the environment first, then public.app_settings (service role only). */
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

/** The sign-in session a token belongs to. The token is checked by getUser first. */
function sessionOf(token: string): string {
  try {
    const part = token.split('.')[1] ?? '';
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { session_id?: unknown };
    return typeof claims.session_id === 'string' ? claims.session_id : '';
  } catch {
    return '';
  }
}

/** k•••@example.org: enough to recognise, not enough to copy. */
function masked(email: string): string {
  const [name, domain] = email.split('@');
  if (!name || !domain) return 'your email';
  return `${name.slice(0, 1)}•••@${domain}`;
}

const html = (code: string, site: string) => `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#1f2a44">
  <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px">
    <p style="margin:0 0 12px;font-size:16px">Your code for the court room:</p>
    <p style="margin:0 0 16px;font-size:34px;font-weight:bold;letter-spacing:8px">${code.slice(0, 3)} ${code.slice(3)}</p>
    <p style="margin:0 0 12px;font-size:14px;line-height:1.5">Type it on the court room's door within ten minutes. It works once, and only on the phone or computer that asked for it.</p>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#5b6475">If you did not ask for it, somebody may know your password: change it in ${site ? `<a href="${site}/settings?room=account">Settings</a>` : 'Settings'}, and tell your church's Director.</p>
  </div>
</body></html>`;

const text = (code: string) =>
  `Your code for the court room: ${code}\n\n`
  + 'Type it on the court room\'s door within ten minutes. It works once, and only on the phone or computer that asked for it.\n\n'
  + 'If you did not ask for it, somebody may know your password: change it in Settings, and tell your church\'s Director.\n';

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Function is not configured.' }, 500);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in first.' }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: caller, error: whoErr } = await admin.auth.getUser(token);
  const email = caller?.user?.email ?? '';
  if (whoErr || !caller?.user || !email) return json({ error: 'Sign in first.' }, 401);

  // This function reads with the service role key, so the database's own
  // refusal of a suspended account does not reach it: it asks for itself.
  const { data: me } = await admin
    .from('profiles')
    .select('id, role, is_approved, suspended_at')
    .eq('id', caller.user.id)
    .maybeSingle();
  if (!me || !me.is_approved) return json({ error: 'Your account is not approved yet.' }, 403);
  if (me.suspended_at) return json({ error: 'This account is suspended.' }, 403);

  const session = sessionOf(token);
  if (!/^[0-9a-f-]{36}$/i.test(session)) {
    return json({ error: 'This sign-in cannot be sent a code. Sign out, sign in again, and ask again.' }, 400);
  }

  // Everything about who may have a code, and how often, is the database's
  // decision, and the code it makes is for this session only.
  const { data: code, error: codeErr } = await admin.rpc('court_email_code_issue', {
    p_user: caller.user.id,
    p_session: session,
  });
  if (codeErr || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    const said = String(codeErr?.message ?? '');
    const busy = /moment ago|Five codes/.test(said);
    return json({ error: said || 'Could not make a code. Please try again.' }, busy ? 429 : 403);
  }

  const brevoKey = await setting(admin, 'BREVO_API_KEY');
  const sender = brevoKey ? await setting(admin, 'BREVO_SENDER') : '';
  if (!brevoKey || !sender) {
    console.log(JSON.stringify({ at: 'door-code', warn: 'BREVO_API_KEY or BREVO_SENDER is not set; no code was sent' }));
    return json({
      error: 'This project cannot send email codes yet. Whoever looks after it needs to add BREVO_API_KEY and BREVO_SENDER (docs/EMAIL.md).',
    }, 503);
  }
  const senderName = (await setting(admin, 'BREVO_SENDER_NAME')) || 'Hope Beacon';
  const site = (await setting(admin, 'SITE_URL')).replace(/\/+$/, '');
  // Only for a test server standing in for Brevo; unset, it is Brevo itself.
  const endpoint = (Deno.env.get('BREVO_API_URL') || '').trim() || 'https://api.brevo.com/v3/smtp/email';

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'api-key': brevoKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { email: sender, name: senderName },
        to: [{ email }],
        subject: `Your court room code: ${code}`,
        htmlContent: html(code, site),
        textContent: text(code),
      }),
    });
    if (!res.ok) {
      // Brevo's own words stay in the log; the person is told what to do.
      console.log(JSON.stringify({ at: 'door-code', status: res.status, brevo: (await res.text()).slice(0, 300) }));
      return json({ error: 'The email service refused to send the code. Try again in a minute; if it keeps happening, tell whoever looks after the project.' }, 502);
    }
  } catch (err) {
    console.log(JSON.stringify({ at: 'door-code', error: String((err as Error)?.message ?? err) }));
    return json({ error: 'Could not reach the email service. Try again in a minute.' }, 502);
  }

  return json({ ok: true, sent_to: masked(email) });
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const res = await handle(req);
  for (const [key, value] of Object.entries(cors)) res.headers.set(key, value);
  return res;
});
