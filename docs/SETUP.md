# Set up your own Hope Beacon

**Four steps. No code to write.**

This is the fast path from a clone to a working church app that real people sign
into from their own phones. The whole backend already ships in this repository —
the schema, the security rules, the sign-in gateway. Nothing here asks you to
build one.

> If you want to understand *how* a backend for this app is designed, or to
> build one on a different stack, read [BUILD-YOUR-OWN.md](BUILD-YOUR-OWN.md).
> That document is a course. This one is the instructions.

The app has a page that does all of this with you and checks your work as you
go. Start the app and open **`/setup`** — it tells you which step you are on
rather than making you guess.

---

## Before you start

You need [Node 22 LTS](https://nodejs.org) and a free account with a
Postgres host that also provides authentication. The migrations in
`supabase/migrations/` are written for Supabase; [BACKENDS.md](BACKENDS.md)
covers what changes on other hosts.

Total time: about twenty minutes, most of it waiting for a database to start.

---

## Step 1 — Create a database and connect it

Create a new project with your host. When it finishes starting, open its
**Settings → API** page and leave it open — the next command needs two values
from it.

Then, in this folder:

```bash
npm run setup
```

It asks two questions, checks your answers, and writes the settings file for
you. There is no file to create by hand and no variable name to spell.

**It will stop you if you paste the wrong key.** That settings page shows two:
one is meant to be published to every browser, the other bypasses every security
rule in your database. They look alike and sit next to each other. The setup
command reads which one you pasted and refuses the dangerous one.

---

## Step 2 — Create the tables

Open your project's SQL editor and run every file in `supabase/migrations/`,
**in filename order**. Each one builds on the last, so the order is not
optional.

| File | What it adds |
|---|---|
| `0001_core_schema.sql` | People, churches, pairings, messages, lessons — and the security rules |
| `0002_invitations.sql` | How somebody is invited and joins |
| `0003_invite_approval_gate.sql` | Nobody gets in until a Director approves them |
| `0004_live_api_permissions.sql` | What a signed-in browser is allowed to call |
| `0005_platform_function_acl.sql` | Locks the platform functions to the roles that need them |
| `20260816130240_approval_revocation_gate.sql` | Taking approval away actually removes access |

**Read the complete migration set and `docs/BACKEND-MAP.md`.** `0001` starts
the schema; later corrective migrations define the current permissions: a Guide sees their own people and nobody else's, an
Explorer sees only themselves, a Director sees their own church. It is enforced
by the database, not by the screens, which is why it holds even if somebody
calls the API directly.

---

## Publish the operator’s privacy facts

Before inviting real people, add these public values to `.env.local` and the
hosting environment:

- `NEXT_PUBLIC_BEACON_CONTROLLER`: the organisation legally responsible for the data.
- `NEXT_PUBLIC_BEACON_PRIVACY_CONTACT`: its actual privacy contact.
- `NEXT_PUBLIC_BEACON_HOSTING_DETAILS`: providers, locations and cross-border transfers.

Verify `/privacy`, define retention and breach procedures, and assess the legal
requirements in [DATA-PROTECTION.md](DATA-PROTECTION.md). A backend build refuses
blank operator facts; it cannot verify their truth or certify compliance.

## Step 3 — Restart the app

```bash
npm run dev
```

Settings are read once at startup, so a running app will not notice the file you
just wrote.

The front door changes. Instead of a list of sample people to explore as, you
get a real e-mail and password sign-in — the same screen your church members
will use.

---

## Step 4 — Make yourself the first administrator

There is no public sign-up. The app is invitation-only by design, which leaves
the very first account a chicken-and-egg problem: nobody exists to invite you.
Create it directly, once:

1. In your project, open **Authentication** and add a user with your e-mail
   address and a password.
2. In the SQL editor, find that person in `profiles` and set their role to
   `admin` and their approval flag to true.

Now sign in. From here everybody else joins by invitation, which is how it is
meant to work — you should never need to touch the database to add a person
again.

---

## Before real people go in

Do not skip this. The rules are the product.

**Try to break in as your least-privileged user.** Sign in as an Explorer and
attempt to reach what they should not: another person's conversation, the church
list, the Director screens. You should be refused every time, by the database
rather than by a missing button.

**Or prove it in SQL**, which is faster and more thorough:

```bash
# run against your database
docs/examples/prove-the-rules.sql
```

**Check `/setup` one last time.** It reports what it can actually see, so a
green result there means the app really is talking to your database — not that
it thinks it should be.

---

## When something is wrong

Open `/setup` first. It names the specific step rather than reporting a general
failure.

| What you see | What it usually means |
|---|---|
| Still showing sample people | The app has not been restarted since step 1, or the settings file was not written |
| "Cannot reach your database" | The address is wrong, the project is paused, or the browser blocked the request |
| "Connected, but the tables are missing" | Step 2 has not been run, or it stopped partway |
| Sign-in says the account is not ready | The account exists but has not been approved — step 4, second half |

---

## Taking it further

- [EMAIL.md](EMAIL.md) — sending invitations by mail, with any provider (optional)
- [BACKENDS.md](BACKENDS.md) — using a host other than the one these migrations assume
- [SECURITY.md](SECURITY.md) — what the rules guarantee, and what they do not
- [BUILD-YOUR-OWN.md](BUILD-YOUR-OWN.md) — the long course, if you want to build the backend yourself
- [CONTRIBUTING.md](../CONTRIBUTING.md) — how to work on the project itself

## Security repairs and staging checks

Apply all migrations before enabling the repaired release. The conversation
migration freezes participant identities and closes leadership previews and
revision APIs; arranging a different relationship requires a new pairing.
The study migration preserves existing content and imposes a shared budget.
Permanently deleting a page frees its document space, and deleting text compacts
the next saved snapshot. Attachments may be shared by several pages and are not
automatically removed from the database when an image block is deleted. If a room
remains full, review unreferenced attachments with the operator before removing
them; do not delete files that another page still uses.
Run the fresh-install SQL checks against a throwaway Supabase instance, then
exercise approvals, invitation claims, pairings, message/file access and study
saving with fictional roles in staging. Never use a production database for fixtures.

Notification delivery accepts only supported browser push hosts. A new browser
provider requires reviewing `supabase/functions/notify/endpoint.ts` before use.

The current braces release has no upstream security fix. `postinstall`, `predev`
and `prebuild` apply a hash-checked depth bound for GHSA-vfj7-8cjw-p6xm. The npm
advisory still appears because this is a local mitigation, not a released patched
version. Normal globs remain supported. Remove the mitigation after reviewing an
upstream fix. Do not skip lifecycle scripts without running the bound explicitly.
