-- Where the invitation mailer looks when the project has no Edge Function
-- secrets set.
--
-- WHY THIS EXISTS. Edge Function secrets are the right home for an API key and
-- remain the recommended way to configure this. But setting them requires
-- dashboard access, and an installation whose secrets are simply not set has no
-- symptom a Director can see: the function returns 200, reports that it handed
-- back a link instead, and unless somebody reads that response the invitations
-- just stop arriving. That is exactly how a whole day was lost here — a day of
-- pressing Invite and being told each time that the mail had gone.
--
-- So the mailer reads its settings from the environment FIRST and falls back to
-- this table. A church that can run one SQL statement can now send email even
-- if nobody can get into the Edge Functions screen.
--
-- SECURITY. This holds a live credential, so it is locked to the service role
-- and nothing else:
--
--   * RLS is ON and there are NO POLICIES, so every ordinary caller is refused
--     by default. The service role bypasses RLS and is the only thing that can
--     read it — and the only thing holding that key is the invite function.
--
--   * Every grant is revoked from PUBLIC, anon and authenticated. Revoking from
--     anon alone would do nothing: rights are granted to PUBLIC in this
--     database, and removing one member of a group does not remove what the
--     group holds. That mistake is what migration 0010 exists to correct, and
--     it is deliberately not repeated here.
--
-- A key in a database row is not as good as a key in a secret store, and this
-- file is not arguing otherwise. It is much better than a church silently
-- sending no invitations at all, and which trade to make is the owner's call.
--
-- To use environment secrets instead — the recommended path — set BREVO_API_KEY,
-- MAIL_FROM and SITE_URL under Edge Functions → Secrets. The environment always
-- wins, so nothing here has to be removed first.

create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is
  'Service-role-only configuration. Never expose this table to any client. '
  'Read by supabase/functions/invite when the matching env secret is unset.';

alter table public.app_settings enable row level security;

-- No policies are created on purpose. With RLS enabled and no policy, every
-- request from anon or authenticated returns nothing at all.
drop policy if exists app_settings_none on public.app_settings;

revoke all on public.app_settings from public;
revoke all on public.app_settings from anon;
revoke all on public.app_settings from authenticated;
