# Setting up Open Sentry Beacon for the demo

Written as a handover. Everything below is either **done**, **yours to click**,
or **a task another agent can pick up**. Nothing assumes you remember a
conversation.

---

## The single most important decision

**Demo from sample-data mode unless the live path is fully working an hour
before you present.**

Clone, `npm run dev`, and the whole app works — library, lessons, prayer,
journey, tutorial — with no database, no sign-up and no network. It cannot fail
on stage. The live backend below is real and worth having, but a demo whose
climax is "and now the email arrives" is a demo that can be ruined by a spam
filter you do not control.

Keep the sample-data build deployed as your fallback **even if live works**.

---

## What is already done

| | State |
|---|---|
| Vocabulary (Director / Guide / Explorer / Executive Director) | done, everywhere, with a test that fails if it regresses |
| Library, lessons, lesson series, study shelf | done — byte-identical to the private repo |
| Prayer, meetings, materials, tutorial, analytics | done, in sample-data mode |
| Core database schema + RLS | done, applied, twelve attacks proved refused |
| Live data layer (`lib/live/data.ts`) | done |
| Invitations schema + redemption | done, applied, proved |
| `supabase/functions/invite/` | written and ready to deploy |
| Live sign-in, invitations, approval, pairing and conversation | done |
| Live lessons, prayer, meetings and materials | later; use the separate sample deployment |

---

## Yours to click (about 20 minutes)

### 1. Supabase — SMTP

Project → **Settings → Authentication → SMTP Settings**.

Turn on a custom SMTP server. Any provider works; the app is deliberately not
coupled to one — see [EMAIL.md](EMAIL.md) for how to choose, and for the three
things that actually decide whether mail arrives. Suggested here in order of how
fast you can be sending:

- **Brevo** — verify one sender address, ~15 minutes, 300/day free.
- **Resend** — its shared sender `onboarding@resend.dev` delivers **only to the
  address that owns the Resend account**. The API accepts everything else and
  returns success, and nothing arrives. Fine for a smoke test, useless for
  inviting anybody. Reaching real people needs a verified domain.
- **Postmark** — the best deliverability of the three, but account approval is
  manual and will probably not land before tomorrow.

Without custom SMTP, Supabase's built-in sender still works but is rate-limited
to a handful of emails an hour. **For a demo that is genuinely enough** — you
will send two or three invitations on stage.

### 2. Supabase — redirect URLs

**Settings → Authentication → URL Configuration.** Add both:

```
http://localhost:3000/join
https://<your-vercel-domain>/join
```

An invitation link that lands anywhere else shows the home page and no form,
which looks exactly like a broken invitation.

### 3. Supabase — raise the password minimum

**Settings → Authentication → Password.** Set the minimum to **10**. The app
enforces 10; if the dashboard says 6, a member typing 8 characters is rejected
with a message the dashboard setting does not explain.

### 4. Vercel

New project → import `klydo131/open-sentry-beacon` → add two environment
variables:

```
NEXT_PUBLIC_SUPABASE_URL       = https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = <Settings -> API -> anon public>
```

Leave both **unset** to deploy the sample-data fallback instead. That is the
whole switch — see `lib/mode.ts`.

> **Use your own Supabase project, always.** This guide used to name the
> maintainers' project as a demo to evaluate against. That project is now a
> real church's, with real members in it, so it is no longer named here or
> anywhere in this repository. Create your own (free) and use its ref wherever
> this guide shows `<your-project-ref>`. Everything in `supabase/migrations/`
> runs on a fresh project in one pass -- proven on 23 September 2026 by applying
> all of it to an empty Supabase database and comparing the result with the
> live one, object for object -- so standing up your own is a five-minute job,
> and what you get is the same app.

> The anon key is not a secret. It ships to every browser by design. What
> protects the data is row level security, which is why the attack suite in
> `supabase/migrations/0001_core_schema.sql` matters more than the key does.
> The **service_role** key is the opposite: it must only ever live in Supabase
> function secrets, never in Vercel's `NEXT_PUBLIC_*`, never in this repo.

### 5. Deploy the invite function

```bash
supabase functions deploy invite --project-ref <your-project-ref>
supabase secrets set SITE_URL=https://<your-vercel-domain> --project-ref <your-project-ref>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 6. Make yourself the first Executive Director

There is no public sign-up, so the first account is a chicken-and-egg problem.
Create the first Auth user in Supabase, then run this once in the SQL editor:

```sql
insert into public.churches (name) values ('Your Church') returning id;
-- take that id:
update public.profiles
set role = 'executive', is_approved = true, is_head_executive = true,
    church_id = '<the id>'
where id = '<your auth user id>';
insert into public.church_executives (church_id, executive_id)
values ('<the id>', '<your auth user id>');
```

From then on every other account arrives by invitation.

---

## What is already connected in live mode

Work in this order. Each is independently shippable.

### A. Core live screens

`IS_LIVE` now selects a dedicated email/password gateway, invitation join,
Director approval and pairing, Guide roster/conversation, and Explorer
conversation. Tutorial controls and sample personas do not render in live mode.

**Do not** add a `setMyRole()` to the live layer. The demo store has one; it is
a toy there and a privilege escalation here.

### B. Invitation button

```ts
const { data, error } = await supabase().functions.invoke('invite', {
  body: { email, role, full_name, recommended_by },
});
```

The Director screen calls this function and shows its useful server response.

### C. Remaining future work

**None of this is future work any more.** Lessons, meetings, prayer, the library
and the audit log are all in `supabase/migrations/` in this repository, along
with everything built since. Run every file in that directory in order; there is
nothing left to copy from anywhere else.

The rule that outlives this section: copy the **policies**, not just the tables.
A table without its policy is a table the Data API will hand to anybody who
asks.

---

## Rules that must not be broken

These are not style preferences. Each one is load-bearing, and each has already
been broken once.

1. **RLS stays on, on every table.** The anon key is public; the policies are
   the only thing between it and the data.
2. **`service_role` never leaves the server.** Not in the repo, not in
   `NEXT_PUBLIC_*`, not in a browser file.
3. **Nothing trusts client metadata for a privilege.** `signUp()` lets the
   caller set arbitrary `data`. Role, church and approval come from the
   `invites` table — see the long comment in `0002_invitations.sql`.
4. **An Explorer is never handed their own journey stage.** `getMyPairing()`
   selects columns rather than `*` for exactly this reason.
5. **A conversation is readable by two people.** No Director branch, no
   executive branch, no audit exception. Adding one changes what this app is.
6. **Cross-table policy references go through a `SECURITY DEFINER` helper.** A
   direct subquery between `profiles` and `pairings` causes infinite recursion
   and every affected read fails — this already happened; see `church_of()` and
   `is_paired_with()`.

---

## Verifying, without spending CI minutes

This repo is public, so GitHub Actions are free here. Locally:

```bash
npm run verify:all        # everything
node tests/no-backend.js  # no keys committed, still runs with no config
node tests/brand-consistency.mjs   # retired vocabulary has not crept back
```

Re-run the attack suite at the top of
`supabase/migrations/0001_core_schema.sql` after **any** policy change. It is
the cheapest test in the project and the only one that checks the promise the
README makes.

---

## If the demo goes wrong

Unset the two Vercel environment variables and redeploy. The app falls back to
sample data and everything works. That is the whole recovery plan, and it is why
the mode switch asks "do I have keys?" rather than reading a flag somebody has
to remember to change.
