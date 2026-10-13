# Build your own Beacon: front end *and* backend

> **Read [SETUP.md](SETUP.md) first if you just want it working.**
>
> This document is a course in designing a backend for this app. It is not the
> instructions for running one, and for a while it was the only thing here that
> looked like either — which sent people off to build from scratch a thing that
> was already sitting in `supabase/migrations/`.
>
> The schema, the security rules and the sign-in gateway all ship in this
> repository. Setting up your own Hope Beacon is four steps and no code:
> `npm run setup`, run the migrations, restart, make yourself an administrator.
> SETUP.md walks it, and the app's own `/setup` page checks your work as you go.
>
> Come back here when you want to know *why* the backend is shaped the way it
> is, or you are porting it to a different stack.
>
> **Writing your own app or server in another programming language?**
> [IN-ANY-LANGUAGE.md](IN-ANY-LANGUAGE.md) has the same small program in nine
> languages and the same small server in three, each run before it was
> published, and how to keep every rule while you do it.

Everything else in this repository says **"there is no backend"** — meaning the
app ships with none *switched on*, and runs entirely in your browser until you
connect one. That is deliberate. But if you have read it five times and are now
wondering *"so how do I actually make this work for my real church?"*, this file
is the long answer.

It takes you from the demo you have now to a working app that two people can
sign into on two different phones and see the same thing.

**No prior backend experience is assumed.** Every term is explained the first
time it is used.

---

## Contents

| Step | What you do |
|---|---|
| [0. Understand what you have](#step-0--understand-what-you-have) | Why there is no backend, and what one would add |
| [1. Decide whether you need one](#step-1--decide-whether-you-need-one) | Honestly. Many churches do not, yet |
| [2. Learn the five words](#step-2--the-five-words-you-need) | Backend, database, table, auth, API — in plain English |
| [3. Pick your stack](#step-3--pick-your-stack) | What to use, and what each choice costs |
| [4. Build the database](#step-4--build-the-database) | The tables this app needs, with real SQL |
| [5. Add accounts](#step-5--add-accounts) | Sign-in, invitations, passwords |
| [6. Write the rules](#step-6--write-the-rules-the-most-important-step) | **The step that matters most.** Who may see what |
| [7. Wire it to the app](#step-7--wire-it-to-the-app) | The adapter, with real code |
| [8. Deploy it](#step-8--deploy-it) | Getting it on the internet |
| [9. Before you put real people in it](#step-9--before-you-put-real-people-in-it) | The checklist |
| [Common mistakes](#common-mistakes-and-how-to-avoid-them) | Every one of these has bitten somebody |

---

## Step 0 — Understand what you have

Right now, this app is **complete except for one thing**: where the data lives.

Every screen works. Messages send, lessons assign, stages advance, the analytics
draw. All of it runs against a store that lives inside your web browser.

```
  WHAT YOU HAVE NOW                    WHAT YOU ARE ADDING

  ┌──────────────────┐                 ┌──────────────────┐
  │   Your browser   │                 │   Your browser   │
  │                  │                 │                  │
  │   All screens    │                 │   All screens    │  ← unchanged
  │        ↓         │                 │        ↓         │
  │   The store      │                 │   The store      │  ← you replace
  │        ↓         │                 │        ↓         │     the inside
  │  Browser storage │                 └────────┼─────────┘     of this
  └──────────────────┘                          │
                                                ↓  over the internet
   Nothing leaves the device.          ┌──────────────────┐
   Nobody else can see it.             │   Your server    │
   Clear the browser, it is gone.      │   + database     │
                                       └──────────────────┘

                                        Two people, two phones,
                                        one shared church.
```

**The important part:** you are not rebuilding the app. You are replacing what
sits underneath it. Every screen keeps working, because no screen knows where
data comes from — they all ask the store.

---

## Step 1 — Decide whether you need one

Be honest about this, because a backend is not free. It costs money (a little),
time (a lot, the first time), and it makes you responsible for other people's
personal information.

**You do NOT need a backend if:**

- One person is using it to keep track of their own work.
- You are showing it to a board or a leadership meeting to decide something.
- You are training people on how the process works.
- You want each Guide to keep their own private notes on their own phone.

For all of those, what you have already works, needs no money, and cannot leak.

**You DO need a backend when:**

- A Guide and a Director must see the same Explorer.
- Somebody changes phones and expects their work to still be there.
- You want real invitations to arrive in real inboxes.
- Two people need to have a conversation with each other.

If you are not sure, start without one. Moving to a backend later is a known
piece of work; un-leaking somebody's personal data is not.

---

## Step 2 — The five words you need

If these are already familiar, skip to Step 3.

**Backend.** A computer somewhere else that stores your church's information and
answers requests for it. "The cloud" is somebody else's computer, and that is
genuinely all it means.

**Database.** The filing system on that computer. It holds *tables*.

**Table.** A grid, like one sheet in a spreadsheet. A `people` table has one row
per person, and columns for name, email, role. That is the whole idea.

**Authentication ("auth").** Proving who somebody is — the sign-in step. It
answers *"are you really Maria?"*

**Authorisation.** Deciding what that person is allowed to see. It answers
*"Maria is Maria, but may she read **this** conversation?"*

> These last two sound alike and get confused constantly, and mixing them up is
> the single most common way an app like this leaks. Authentication is the front
> door. Authorisation is which rooms you may enter once inside.

---

## Step 3 — Pick your stack

"Stack" just means the set of tools you choose. There is no single right answer.
Here are the realistic options for a church.

| Option | Good for | What it costs you |
|---|---|---|
| **Managed backend** (Supabase, Firebase, Appwrite, Pocketbase) | Almost every church. Database, accounts and rules in one place, with a free tier. | You learn one product's way of doing things. |
| **Your own API** (Node, Python, Go, PHP) + any database | A church that already has a developer and a server. | You write and maintain everything, including auth. |
| **A spreadsheet or low-code tool** (Airtable, NocoDB) | Very small groups, non-sensitive data only. | Weak permissions. Genuinely not suitable for pastoral notes. |

**If you have no strong opinion, use a managed backend with row-level rules.**
It is the shortest path from here to something safe, because the permission
rules live with the data instead of in your code.

The rest of this guide uses **Postgres with row-level rules** for its examples,
because that is the most common shape and the SQL translates readably to other
systems. Nothing in the app depends on that choice.

---

## Step 4 — Build the database

The app already tells you exactly what it needs. `lib/types.ts` is the complete
list of shapes, and `lib/demo/seed.ts` shows one of each filled in.

Here is the core, as tables. This is the minimum for the main features to work.

> **These have been run.** The complete working version, with the permission
> rules, is [`docs/examples/schema.sql`](examples/schema.sql) — applied to a real
> PostgreSQL 16 database and attacked from a second account by
> [`prove-the-rules.sql`](examples/prove-the-rules.sql), which passes 14 of 14.
>
> Prefer running that file to copying these blocks. Create tables in the order
> shown, because each references the ones above it. Types, defaults and
> extension names differ between Postgres hosts — check yours, and adapt this
> for your deployment rather than adopting it unread.

```sql
-- The church itself. First, because everything else points at it.
create table churches (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  created_at    timestamptz not null default now()
);

-- Every person: seekers, missionaries, admins, executives.
create table profiles (
  id            uuid primary key,          -- same id as the account
  full_name     text not null,
  email         text unique not null,
  role          text not null check (role in ('ds','dm','admin','executive')),
  is_approved   boolean not null default false,
  church_id     uuid not null references churches(id),
  created_at    timestamptz not null default now()
);

-- One missionary walking with one seeker. The heart of the whole app.
create table pairings (
  id            uuid primary key default gen_random_uuid(),
  dm_id         uuid not null references profiles(id),
  ds_id         uuid not null references profiles(id),
  stage         text not null default 'connect',
  track         text not null default 'digital',
  created_at    timestamptz not null default now(),
  unique (dm_id, ds_id)
);

-- Their conversation.
create table messages (
  id            uuid primary key default gen_random_uuid(),
  pairing_id    uuid not null references pairings(id) on delete cascade,
  sender_id     uuid not null references profiles(id),
  body          text not null,
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);

-- A missionary's private notes. Nobody else reads these. Not even the admin.
create table notes (
  id            uuid primary key default gen_random_uuid(),
  pairing_id    uuid not null references pairings(id) on delete cascade,
  author_id     uuid not null references profiles(id),
  body          text not null,
  created_at    timestamptz not null default now()
);

-- The shared library, and what has been given to whom.
create table materials (
  id            uuid primary key default gen_random_uuid(),
  church_id     uuid not null references churches(id),
  title         text not null,
  type          text not null,
  external_url  text
);

create table assignments (
  id            uuid primary key default gen_random_uuid(),
  pairing_id    uuid not null references pairings(id) on delete cascade,
  material_id   uuid not null references materials(id),
  completed_at  timestamptz
);
```

Add `churches`, `invites`, `meetings`, `prayer_requests` and
`notifications` the same way, from `lib/types.ts`. Start with the six above —
they are enough to have a working app, and you can add the rest once you have
seen the first one work end to end.

**Two things worth doing now rather than later:**

1. **Give every table a `church_id`** if you might ever host more than one
   church. Adding it afterwards means rewriting every rule you are about to
   write.
2. **Never delete a person; mark them inactive.** Deleting a row that other rows
   point at either fails or destroys history. A church needs the history.

---

## Step 5 — Add accounts

Use your backend's built-in authentication. Do not write your own — password
hashing, session handling and reset flows are solved problems where the
consequences of a subtle mistake are severe.

You need three flows:

**Sign in.** Email and password is fine. Add a "magic link" if your provider
offers one — many older members find it easier than remembering a password.

**Invitations.** Beacon is invitation-only by design, and that is worth keeping.
The flow already modelled in this app:

1. A Director creates an invite with a name, an email and a role.
2. Your server generates a random single-use token and emails a link containing
   it.
3. Opening the link lets that person set a password, and only that person.
4. The token is marked used, and it expires whether it is used or not.

**Password reset.** Your provider has one. Point the "Forgot your password?"
link on the front page at it — that link currently explains that this build has
no passwords, and it is the natural place to wire yours in.

> **Never let a person choose their own role.** If your "update my profile"
> endpoint accepts a `role` field, then anybody can make themselves a Director
> with one request. Pin it to the role already stored. This is the single most
> common way an app like this is completely broken, and it is one line to
> prevent.

---

## Step 6 — Write the rules (the most important step)

This is where a church's trust is either kept or lost.

Every screen in this app already hides things properly. **That is not
protection.** Hiding a button stops somebody clicking it; it does not stop
anybody asking your database directly, and asking your database directly is
about as hard as opening the developer tools.

So the rules have to live **with the data**, where every route into it meets
them — including a screen somebody adds next year without reading this file.

Here are Beacon's five promises, and how each is enforced.

### The five rules

| Promise | Rule |
|---|---|
| A Guide sees only their own Explorers | Rows in `pairings` are readable only when `dm_id` or `ds_id` is you |
| Conversations are private to the two people in them | `messages` readable only if you are in that pairing |
| Private notes are private to their author | `notes` readable only if `author_id` is you |
| Leaders get counts, never conversations | Executives read aggregate views, not message rows |
| Nobody changes their own role | `role` is never accepted from the client |

### What that looks like in SQL — and it has been run

**Do not copy blocks from a document.** The working schema and rules are two
runnable files:

| File | What it is |
|---|---|
| [`docs/examples/schema.sql`](examples/schema.sql) | Tables, helpers, policies, the Explorer's journey view, the app's database role |
| [`docs/examples/prove-the-rules.sql`](examples/prove-the-rules.sql) | Fourteen attacks from a second account. Every line must print `PASS` |

```bash
createdb beacon
psql -d beacon -f docs/examples/schema.sql
psql -d beacon -f docs/examples/prove-the-rules.sql
```

Applied to a real PostgreSQL 16 database; the proof passes 14 of 14 from empty.

### What running it found

This section originally carried its SQL inline, written from experience and
never executed. Running it found five defects. Each is a trap you can hit on
your own.

**1. `auth.uid()` does not exist outside Supabase.** Five statements failed at
once on `schema "auth" does not exist`, and this guide claimed to be
provider-neutral. The equivalent for plain Postgres is now in `schema.sql`.

**2. An Explorer could read their own journey stage.** The obvious policy — *you
may read a pairing you are in* — hands the Explorer the entire row, and `stage`
is a column on it. Every screen hid the value; the database gave it away.
**This is the app's most important promise and the SQL did not keep it.** Fixed
by excluding Explorers from the table and giving them a view with no `stage`
column in it at all: absent, not hidden.

**3. Fixing that broke the Explorer's messages.** The conversation policy asked
"is this person in that pairing?" with a sub-select, which runs under the
pairings policy — the one that now excludes Explorers. So an Explorer could no
longer read their own conversation. Fixed with a `SECURITY DEFINER` helper that
answers the membership question without going through the policy.

**4. The profiles policy recursed infinitely.** A sub-select against `profiles`
from inside `profiles`'s own policy. Same fix, same reason.

**5. The role-pinning trigger locked the church out of its own administration.**
Pinning `role` and `is_approved` unconditionally also stops a Director approving
a new member or promoting a Guide — the two things administration consists
of. Worse, it fails *silently*: the update succeeds and changes nothing. Fixed
by pinning only when somebody edits their **own** row.

### Prove the rules, do not assume them

Run `prove-the-rules.sql`. It signs in as an Explorer, two different Guides
and a Director, and checks fourteen things that should each be refused or allowed.

**Connect as your application's role, not as the owner.** A superuser or table
owner **bypasses RLS entirely**, so every check passes for the wrong reason.
That is the most common way somebody proves rules that do not work.

Reading a policy and believing it is not the same as watching it refuse.

## Step 7 — Wire it to the app

Now the part that surprises people with how small it is.

`lib/demo/store.tsx` is the **only** file in this entire app that touches
storage. Its `Ctx` interface is the complete list of everything the app can do.
Satisfy that interface and every screen works, unchanged, because no screen
knows the difference.

### The shape

```tsx
// lib/backend/real-store.tsx
'use client';

import { DemoContext, type Ctx } from '@/lib/demo/store';

export function RealProvider({ children }: { children: React.ReactNode }) {
  const value: Ctx = useRealBackend();   // ← you write this
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
```

Then in `app/layout.tsx`, swap `<DemoProvider>` for `<RealProvider>`. That is
the whole integration.

**Type your object as `Ctx` and the compiler becomes your checklist.** It will
list, by name, every function you have not written yet. That is a far better
plan than discovering them one broken screen at a time.

### One function, start to finish

Here is `sendMessage`, in the demo and then for real, so you can see how little
changes:

```tsx
// Before — the demo store
sendMessage: (pairingId, body) => {
  setDb((d) => ({
    ...d,
    messages: [...d.messages, { id: uid(), pairing_id: pairingId, body, /* … */ }],
  }));
},

// After — a real backend
sendMessage: async (pairingId, body) => {
  const { error } = await db
    .from('messages')
    .insert({ pairing_id: pairingId, body, sender_id: currentUser.id });

  if (error) {
    // Keep it on the device and retry. A message somebody took the trouble
    // to write must not vanish because a train went into a tunnel.
    queueForRetry({ pairingId, body });
    return;
  }
  await refresh();
},
```

Notice what did **not** change: the screen calling `sendMessage` is identical.

### A sensible order to build it

You do not have to write all of it before anything runs.

1. **Accounts** — `signInAs`, `signOut`, `currentUser`. Nothing works until
   somebody is signed in.
2. **Reading** — fill `db` from your database. Every screen renders read-only,
   and you can look at all of them.
3. **The core loop** — `sendMessage`, `advanceStage`, `createPairing`,
   `approveUser`. That is already a usable app.
4. **Everything else**, as each screen needs it.

**Keep `DemoProvider` while you do this.** Being able to switch back to the demo
is how you tell "my backend is wrong" apart from "the app is wrong", and you
will want that distinction more than once.

### The easy warm-up: feedback

If the store feels like a lot, do this first. It is the same pattern at one
twentieth the size and it works end to end in about fifteen minutes:
[docs/BACKENDS.md](./BACKENDS.md).

---

## Step 8 — Deploy it

This is a standard Next.js app with nothing platform-specific in it. Any host
that runs Next will run it: Vercel, Netlify, Cloudflare, a container, your own
server.

Three things to get right:

**Your keys live on the server, never in the app.** Anything this app can read,
every visitor can read. A "public" or "publishable" key designed to be seen by
browsers is fine. The powerful key that bypasses your rules is not — it belongs
on a server your users never touch. `tests/no-secrets.js` fails the build if a
credential appears in the repository, but it can only catch shapes it
recognises.

**Allow your backend in the security policy.** `next.config.mjs` currently
allows this origin and nothing else. Add your backend's address to
`connect-src` — and only there. Widening `default-src` instead is the usual
shortcut and it gives away every other protection at the same time.

**Serve it over HTTPS.** Not optional once real names are involved.

---

## Step 9 — Before you put real people in it

Work through this. Every line is here because skipping it has hurt somebody.

- [ ] A second Guide, signed in properly, reads **zero** rows of the
      first one's conversation. Proven with a script, not by reading a policy.
- [ ] An Explorer cannot see their own journey stage anywhere.
- [ ] An "update my profile" request containing `role: "admin"` changes nothing.
- [ ] The powerful database key appears nowhere in the app bundle. Search the
      built output for it.
- [ ] Private notes are unreadable by the Director. Test it as the Director.
- [ ] Invitations expire, are single-use, and work only for the address they
      were sent to.
- [ ] Anything that sends email is rate limited **on the server**, and keyed on
      something the caller cannot change for free.
- [ ] You have a backup, and you have restored from it once. An untested backup
      is a rumour.
- [ ] Somebody other than you knows how to reach the database in an emergency.
- [ ] You have told the church, in plain words, what is stored and who can see
      it.
- [ ] `components/RoleSwitcher.tsx` and `setMyRole` are **deleted**. They let
      anybody become a Director, and they are safe only while there is no server.
- [ ] The `DEMO · sample data` badge is removed from `app/layout.tsx`.

---

## Common mistakes, and how to avoid them

**Putting the rules in the screens.** The screens decide what to *show*. Your
database decides what somebody is *allowed to have*. Anybody can send a request
without using your screens.

**Trusting the client for identity.** Never accept "I am user X" from the
browser. Take the user from the verified session, every time.

**Shipping the powerful key.** If it is in the app, it is public. There is no
"but it is minified" — minified is not encrypted.

**Letting people set their own role.** Covered twice in this document on
purpose.

**No rate limit on anything that sends.** One script can send your church ten
thousand emails and get your sending domain blocked in an afternoon.

**Testing only as yourself.** You are usually a Director, and Directors can see
everything, so everything looks correct. Test as a *second* ordinary user.

**Deleting rows.** Mark inactive instead. A church needs its history, and other
rows point at that one.

**Going straight to production.** Build against a throwaway database with
invented people. Move to real data only when the checklist above is complete.

---

## If you get stuck

- **What the app expects**: `lib/types.ts` is every shape, in one file.
- **What the app can do**: the `Ctx` interface at the top of `lib/demo/store.tsx`.
- **How the pieces fit**: [ARCHITECTURE.md](../ARCHITECTURE.md).
- **The small warm-up**: [docs/BACKENDS.md](./BACKENDS.md).
- **What to protect**: [docs/SECURITY.md](./SECURITY.md).
- **How a church uses it**: [docs/ONBOARDING.md](./ONBOARDING.md).

And if you build something good, consider contributing the adapter back. A
working Firebase or Pocketbase adapter would save the next church weeks.
