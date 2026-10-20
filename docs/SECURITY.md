# Security

This guide is for anyone who runs their own Hope Beacon: a church's IT
volunteer, a developer, or somebody building with AI tools. It covers how to
report a problem, who is responsible for what, and how to secure your own copy,
with samples you can adapt.

---

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private
[Security Advisories](https://github.com/Klydo131/Open-Sentry-Beacon/security/advisories/new)
on this repository, which is visible only to maintainers until a fix is
published.

Include what an attacker can do, stated as an outcome ("any visitor can read
X"), the smallest steps that reproduce it, and the commit you tested. You will
get an acknowledgement within **7 days**. There is no bounty programme.

Please do not publish exploit code, proofs of concept or scans of anybody's
deployment, and do not test against a church's live site. Test against your own
copy.

---

## Who is responsible for what

Hope Beacon is free software, provided **as is**, without warranty (AGPL-3.0,
sections 15 and 16). Responsibility follows control:

| Who | Responsible for |
|---|---|
| **The church or developer who deploys a copy** (the operator) | Everything about that deployment: the database and its rules, keys and secrets, hosting and its settings, who is given access, backups, updates, and the personal data of its members. The operator is the controller of that data under the law that applies to it, for example the Philippine Data Privacy Act (RA 10173) or the GDPR. |
| **Contributors** | That a change they submit passes the checks (`npm run verify`) and contains no secret and no real person's details. |
| **Whoever runs an AI tool** | What that tool does with the access it is given. |
| **The maintainers of this repository** | The code in `main` and its checks, and fixing vulnerabilities reported in that code. Not any deployment, its data or its settings. |

If you run a copy, read the rest of this guide before you invite real people.

---

## What this app is, in security terms

**As shipped, there is nothing to breach.** No backend, no accounts, no network
calls, no analytics. Every screen runs from a store in the browser, and the
sample church is fiction. That is why you can hand it to anybody to try.

Three tests hold that promise:

| Check | What it refuses |
|---|---|
| `tests/no-backend.js` | A database dependency, an API route that stores data, any analytics or error-reporting SDK, any call to an external server. |
| `tests/no-secrets.js` | A credential of recognisable shape in any tracked file, a real `.env`, anything secret exposed under a browser-visible prefix, sample data at a domain that could reach a real inbox. |
| `tests/security-invariants.mjs` | Weakened security headers, a URL guard that stops blocking `javascript:`, CI that could be hijacked by a pull request. |

Run them with `npm test`.

---

## Securing your own Hope Beacon

The day you connect a real database, **you own the security of what you
connected.** The practices below apply to any backend. The samples use Supabase
(PostgreSQL) and Next.js, because the app does; rename the tables and columns to
match your own.

### 1. Put authorisation in the database

The screens decide what to *show*. They cannot decide what somebody is
*allowed to have*, because anybody can send a request without using your
screens at all. Put the rule next to the data, where every route into it must
pass.

```sql
-- A table only its author can read or change.
alter table public.notes enable row level security;

create policy "authors read their own notes"
  on public.notes for select to authenticated
  using (author_id = auth.uid());

create policy "authors add their own notes"
  on public.notes for insert to authenticated
  with check (author_id = auth.uid());
```

- Turn on row-level security for **every** table. A table with it on and no
  policy is closed to the browser, which is the safe default.
- Test with two real accounts: sign in as one and try to read the other's
  rows. A rule is not finished until you have watched it refuse.
- Decide what leaders can see. Hope Beacon shows leaders counts, not
  conversations; if you connect a backend, that boundary is yours to keep in
  your rules.

### 2. Nobody raises their own privileges

A person may edit their name and photo. They must never be able to change their
own role, approval or church, whatever the screen sends.

```sql
create or replace function public.keep_privileges_unchanged()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated')
     and (new.role is distinct from old.role
          or new.approved is distinct from old.approved
          or new.church_id is distinct from old.church_id) then
    raise exception 'only an administrator can change this'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger keep_privileges_unchanged
  before update on public.profiles
  for each row execute function public.keep_privileges_unchanged();
```

On the app's side, send a fixed list of fields when somebody saves their
profile, never the whole object.

**Suggested, not required: a seat above your administrators.** Hope Beacon has
one role above Director (`executive` in the database). Only that seat can
appoint, suspend or remove a Director, and it reviews what Directors do in the
security audit. This separates duties: an administrator who goes wrong can be
stopped by somebody they cannot remove. The setup script gives the seat to the
first account, because something has to appoint the first Director. Whether
anybody else holds it is your church's decision; churches that use it usually
give it to their most senior leaders.

The seat does not need to be advertised. Screens and documents that members
read call it "church leader", and your privacy notice should still say that
church leaders can see how the app is used, so that everything members are told
stays true.

### 3. Functions that run with more rights

A `security definer` function runs as its owner, so it can read past the
caller's rules. Write each one to answer only about the caller, and close the
two common holes: an unpinned `search_path`, and the default grant to everyone.

```sql
create or replace function public.my_church_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select church_id from public.profiles where id = auth.uid()
$$;

revoke execute on function public.my_church_id() from public, anon;
grant execute on function public.my_church_id() to authenticated;
```

Write every table name in full (`public.profiles`), so a pinned, empty
`search_path` cannot be pointed elsewhere.

### 4. Keep secrets on the server

Anything the browser can read, every visitor can read. In Next.js, any variable
whose name starts with `NEXT_PUBLIC_` is sent to the browser.

```bash
# .env.local: never committed (.gitignore already excludes it)

# Safe in the browser: the project address and the public (anon) key.
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Server only. Never give these a NEXT_PUBLIC_ prefix.
EMAIL_API_KEY=keep-this-in-your-host-or-supabase-secrets
```

- The public key is safe only because your database rules (sections 1 to 3)
  decide what it can reach.
- The service role key skips every rule. Supabase gives it to your server
  functions on its own; never copy it into a browser file, a component, an
  `.env` the browser can read, or a commit. The same goes for any other
  server key, such as your email provider's.
- Turn on GitHub secret scanning and push protection. If a key is ever
  exposed, rotate it at once; deleting the commit is not enough.

### 5. Compare secrets in constant time

When a server function checks a key, an ordinary `===` stops at the first
different character, and the time it takes can hint at how much was right.
Compare digests instead, so every wrong key takes the same time.

```ts
// Deno or any runtime with Web Crypto.
async function sameKey(a: string, b: string): Promise<boolean> {
  const hash = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [x, y] = (await Promise.all([hash(a), hash(b)])).map((d) => new Uint8Array(d));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
if (!SERVICE_KEY || !(await sameKey(bearer, SERVICE_KEY))) {
  return new Response('Forbidden', { status: 403 });
}
```

### 6. Check and limit on the server

Anything enforced in the browser can be skipped by opening the network tab.
Validate input where it lands, and limit anything that sends mail, writes rows
or costs money.

```sql
-- The database refuses what the screen should never have sent.
alter table public.posts
  add constraint posts_title_length check (char_length(title) between 1 and 200);
```

```sql
-- A simple per-person limit: at most max_hits of one action per window.
create schema if not exists private;
create table if not exists private.request_log (
  caller uuid not null,
  action text not null,
  at timestamptz not null default now()
);
create index if not exists request_log_recent on private.request_log (caller, action, at);
revoke all on schema private from public, anon, authenticated;

create or replace function public.allow_request(what text, max_hits int, per interval)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare recent int;
begin
  select count(*) into recent from private.request_log
   where caller = auth.uid() and action = what and at > now() - per;
  if recent >= max_hits then
    return false;
  end if;
  insert into private.request_log (caller, action) values (auth.uid(), what);
  return true;
end;
$$;

revoke execute on function public.allow_request(text, int, interval) from public, anon;
grant execute on function public.allow_request(text, int, interval) to authenticated;
```

A server function then asks `allow_request('invite', 5, interval '1 minute')`
before it does the work. Key a limit on something the caller cannot change for
free (their account, not a header they send), and clear old rows on a schedule.

### 7. Show people's words as text, never as code

React escapes text by default; keep it that way.

- Do not use `dangerouslySetInnerHTML` for anything a person typed. If you must
  show HTML, clean it first with a maintained sanitiser such as DOMPurify.
- Allow only safe link types. A `javascript:` link runs code when tapped.

```ts
export function safeHref(raw: string): string | null {
  try {
    const url = new URL(raw);
    return ['https:', 'mailto:', 'tel:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}
```

### 8. Send security headers

Headers tell the browser what your pages may load and who may frame them. In
Next.js they go in `next.config.js`:

```js
const supabase = 'https://<ref>.supabase.co';

const securityHeaders = [
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(self)' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      `connect-src 'self' ${supabase} ${supabase.replace('https', 'wss')}`,
      `img-src 'self' data: blob: ${supabase}`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

module.exports = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};
```

- Next.js needs its start-up scripts allowed by `script-src`. A policy with a
  per-request nonce is the strongest; the Next.js documentation on Content
  Security Policy shows how. Test any change in a real browser.
- Check what your host actually sends: `curl -I https://your-site`.

### 9. Files people upload

Keep uploads in a **private** bucket, open them through signed addresses that
expire, and give each folder an owner.

```sql
create policy "people upload into their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'private-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "people open their own files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'private-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- Set a size limit and a list of allowed file types on the bucket. Refuse SVG,
  which can carry script.
- Cap what one account can store. Hope Beacon allows each file up to 10 MB, and
  each person up to 300 files or 200 MB in their Resources and handouts; that
  bounds what one stolen password can cost the church.
- Remove the location a phone camera writes into a photo before it is sent.
- A suspended account should neither upload nor open anything.

### 10. Sign-in and sessions

- **Invitation only.** Turn off public sign-up, and create accounts from a
  server function that checks the inviter's role.
- **Temporary passwords expire.** Hope Beacon's invitation password works for
  three days; after that the database replaces it and signs out every device
  that used it.
- **Sign out everywhere.** Choosing a new password signs out every other
  device, and the Password page has **Sign out everywhere else**.
- **An ended session is refused at once.** Check on the server, on every
  request, that the session is still on record, so a signed-out phone cannot
  keep reading.
- **Two-step sign-in for leaders.** Anybody can add an authenticator app in
  Settings, Password, **Two-step sign-in**; recommend it to everybody who can
  see the member list, and make the database require the second step once it
  is set up.

**A lost phone with two-step sign-in.** Confirm who is asking first, in person
or on a phone number you already have: removing the second step is exactly what
somebody who stole the password would ask for. Then, in the SQL editor:

```sql
delete from auth.mfa_factors
where user_id = (select id from auth.users where email = 'their address');
```

They sign in with their password and can set it up again.

### 11. Your repository, CI and dependencies

- **Updates.** Turn on Dependabot alerts and security updates, and check in a
  configuration so update pull requests arrive on their own:

  ```yaml
  # .github/dependabot.yml
  version: 2
  updates:
    - package-ecosystem: npm
      directory: /
      schedule:
        interval: weekly
    - package-ecosystem: github-actions
      directory: /
      schedule:
        interval: weekly
  ```

  Run `npm audit --omit=dev` before a release, and read what an update changes
  before you merge it.
- **Workflows.** Give each workflow the least it needs, pin every action to a
  full commit, and never run a pull request's code with your secrets
  (`pull_request_target` with a checkout of that code does exactly that).

  ```yaml
  permissions:
    contents: read

  jobs:
    verify:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@<full-40-character-commit> # v4
        - run: npm ci && npm run verify
  ```

- **Secrets in CI.** Keep a secret that can read your database in a GitHub
  environment limited to `main`, with yourself as a required reviewer, not as
  a repository secret every branch can read.
- **Review.** Protect `main` and require review from code owners for database
  rules, workflows and server routes.

### 12. Working with AI tools

- Give an AI tool a development database, never your live one's keys.
- Set its connection to your database and hosting to **ask every time** before
  it runs SQL, applies a migration or deploys.
- Treat what the tool reads (issues, web pages, files, comments) as data, not
  instructions. `AGENTS.md` section 0.3 says why.
- Read every change before you merge it, and never let a tool switch off or
  loosen a check to make it pass.
- In this repository, `.claude/agents/security-reviewer.md` and the `/audit`
  skill review a change for security before it is merged.

### 13. Settings that live outside the code

Some protections are switches in Supabase and GitHub, which no file in this
repository can turn on. Check them once when you set up, and again after
anybody new is given access.

| Where | Set it to | Why |
|---|---|---|
| Supabase → Authentication → "Allow new users to sign up" | **Off** | The app is invitation-only, and invitations are made through the service role, so nothing breaks. Left on, the public key alone can create accounts. |
| Supabase → Authentication → email code expiry | **Under an hour** | A sign-in code that lasts longer is longer to steal. |
| Supabase → Authentication → Multi-Factor → authenticator app (TOTP) | **Enabled** (the default) | Two-step sign-in in the app uses it. Switched off, nobody can set it up. |
| GitHub → Settings → Environments → `backup` | Allow `main` only, you as **required reviewer**, `SUPABASE_DB_URL` and `BACKUP_PASSPHRASE` as its secrets | The database address can read everything. As a repository secret, any workflow on any branch can read it, so anybody who can push, or an AI tool working with that access, could copy it out. `.github/workflows/backup.yml` explains. |
| GitHub → Settings → Code security | **Private vulnerability reporting, secret scanning and push protection on** | The "report a vulnerability" link above depends on the first; the others stop a key from being pushed by mistake. |
| GitHub → Settings → Branches (or Rules) for `main` | **Require review from Code Owners** | Then a pull request that touches the files in `.github/CODEOWNERS` (database rules, workflows, server routes, the AI brief) waits for your review. |
| Any AI tool's connection to your database or hosting | **Ask every time** for running SQL, applying migrations and deploying | The prompt is what stands between an AI session and your live data. `AGENTS.md` section 0.3 says why an AI tool must not act on instructions it merely read. |

### 14. Before you invite real people

Run these on your own project, signed in to its SQL editor.

```sql
-- Every public table has row-level security on. Expect no rows.
select tablename from pg_tables
where schemaname = 'public' and not rowsecurity;

-- Every security definer function pins its search_path. Expect no rows.
select p.proname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (
    select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'
  );
```

- [ ] Public sign-up is off, and two test accounts cannot read each other's data.
- [ ] No secret appears in the browser: search the built site for your service
      role key's first characters.
- [ ] `curl -I` on your site shows the security headers.
- [ ] Backups run, and you have restored one to a scratch project at least once.
- [ ] Leaders have two-step sign-in on.
- [ ] Your privacy notice at `/privacy` names your church as the controller,
      with a contact and how long data is kept.
- [ ] Dependabot alerts are on, and somebody is named to read them.

---

## Making Hope Beacon safer together

Improvements to the code's security are welcome as pull requests: a stricter
rule, a new check, a clearer sample in this guide.

- A **vulnerability** goes through a private advisory (above), never a public
  issue or pull request that describes it before a fix is out.
- Every pull request runs `npm run verify`. A change to database rules,
  workflows or server routes waits for a code owner's review.
- A new protection should come with a check that fails when the protection is
  removed. Break it on purpose once, and watch it fail, before you trust it.

---

## Search engines

**Your deployment is invisible to search by default, and a church should leave
it that way.** A church Beacon holds real people's names and conversations, and
a shared deep link that gets indexed is the cheapest possible leak — nobody has
to break anything, they only have to search.

Three signals say so together: a `<meta name="robots">` tag on every page,
`/robots.txt`, and the `X-Robots-Tag` response header. All three read one
variable, so they cannot end up disagreeing with each other:

```
BEACON_PUBLIC_SITE=1   # opt IN to being findable. Unset, the default, means no.
```

Set it only on a deployment with no real people in it — a public demo or a
showcase, where being unfindable is the bug. Do not set it on a church's Beacon.

What this is not: `robots` directives are a request. The large search engines
honour them and anything that does not care ignores them. They keep your app out
of Google; they are not access control. If a page must not be read by a
stranger, it needs a sign-in, not a header.

---

## Sample data

The sample church is fiction and must stay fiction. Names use reserved domains
(`.example`, `.test`) that can never resolve to a real inbox, and a test enforces
it. **Never commit real people's details**, not even briefly, not even in a
branch — a public repository is indexed within minutes and git remembers.

---

## Supported versions

`main` is the only supported version. Fixes land there; there are no backports.
