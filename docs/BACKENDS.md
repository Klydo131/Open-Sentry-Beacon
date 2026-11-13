# Connecting a real backend

As you clone it, this app has no backend. That is the design, not a gap: it
means a church can run the whole thing, on a phone, offline, before deciding
anything.

At some point a church stops evaluating and starts using it. Then two people
need to see the same conversation on two different devices, and everything below
applies.

**The repository already contains one worked answer**, for Supabase: the schema
and every permission rule in `supabase/migrations/`, the data layer in
`lib/live/data.ts`, the screens in `components/Live*.tsx`. If that is the host
you want, [SETUP.md](./SETUP.md) is a shorter road than this document — run the
migrations and there is no code to write. This file is for building your own,
against something else, and for understanding the seams either way.

**Nothing here is required to run the demo.** If you are just trying the app,
close this file.

---

## Before you write any code

Three sentences that will save you a bad week.

1. **Anything the browser can read, every visitor can read.** There is no such
   thing as a secret in this repository. Not in `.env`, not in a component, not
   "just for now".
2. **The screens decide what to *show*. Your database decides what somebody is
   *allowed to have*.** Anybody can send a request without using your screens.
3. **Put the rule with the data.** A rule in the database applies to every route
   into it, including a screen somebody adds next year without reading this.

[SECURITY.md](./SECURITY.md) is the longer version. Read it before you connect
anything holding real names.

---

## Three seams, and you can use any of them

| Seam | Effort | What it buys you |
|---|---|---|
| **The feedback sink** (`lib/backend/feedback.ts`) | 15 minutes | Messages from your congregation reach you instead of staying on their device. |
| **The store** (`lib/demo/store.tsx`) | A real project | Accounts, multiple devices, actual church use. |
| **The real-time transport** (`lib/realtime.ts`) | An afternoon | Two people on two devices see a message land without refreshing. |

Start with the first even if you want the second. It is the same pattern at one
twentieth the size, and it works end to end, so you find out how the app fits
together before anything important depends on your answer. The third only
becomes interesting once the second exists, because syncing between devices
needs a server for the devices to sync through.

---

## Seam 1: where feedback goes

### What is there now

`lib/backend/feedback.ts` defines a **sink** — one function that takes a message
and reports whether it arrived. The default keeps messages on the device and
says so honestly in the UI.

```ts
export interface FeedbackSink {
  send(message: FeedbackMessage): Promise<FeedbackResult>;
  readonly describe: string;   // shown to the person: "where does this go?"
}
```

### Replacing it

One call, anywhere that runs once at startup:

```ts
// app/providers.tsx
'use client';
import { useEffect } from 'react';
import { setFeedbackSink } from '@/lib/backend/feedback';

setFeedbackSink({
  describe: 'sent to the church office',
  async send(message) {
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });
      return { ok: res.ok, note: res.ok ? 'Sent to the church office.' : undefined };
    } catch {
      return { ok: false };          // offline, or the server is down
    }
  },
});
```

Note the URL: `/api/feedback` on **your own** origin, not a third party's. Your
server is where the key lives. Add that route yourself — this repository ships
no route that stores anything, and `tests/no-backend.js` will tell you so on the
next run. That is the test doing its job; when you fork to build a real
deployment, edit its allow-list rather than deleting the file.

### The three rules for any sink

Each one is in the source as well, because each one has cost somebody something.

1. **Never throw.** A message a person took the trouble to write must not vanish
   because a train went into a tunnel. Return `{ ok: false }` and the app keeps
   the draft so they can try again.
2. **Never put a secret in it.** This file ships to the browser. An API key in a
   sink is an API key published to every visitor.
3. **Rate limit on your server.** Anything enforced in the browser is skipped by
   opening the network tab. If your endpoint sends email or writes rows, limit
   it server-side, and key the limit on something the caller cannot change for
   free.

### There is a worked one in this repository

`lib/backend/feedback.ts` is the interface; **`lib/live/feedback-sink.ts` is
that interface implemented against a real database**, and it is about forty
lines. It is installed in `lib/live/session.tsx` once a profile has loaded, and
read in `components/LiveFeedbackInbox.tsx`. Read those three files alongside
this section — a shipped example beats a snippet.

Two things it does that the snippet above does not, and both are worth copying:

- **It falls back to the on-device sink on every failing path.** Not signed in,
  no database configured, the request refused, the network gone: whatever
  happens, the message is kept where the person can still see it rather than
  lost to a failed request.
- **It sends what the device kept, on the next sign-in.** A message written
  offline in March is delivered the first time that person opens the app with a
  connection, without them doing anything.

One design note in it that surprised the church: feedback goes to a **table,
not an email**. A hosted mailer that sends two messages an hour for the whole
project would drop feedback on exactly the days worth hearing about. A row
arrives instantly, cannot be rate limited, and — because there is deliberately
no delete policy on it — cannot be quietly removed by the leader it is about.

### Checking it

Send a message from the app. Then:

- Turn the network off and send another. The app should say "Not sent yet" and
  keep what was typed, not lose it.
- Send the same draft twice. Your server should see the same `id` and file it
  once. That id is stable across retries on purpose.

---

## Seam 2: the store

### The one fact that matters

Every screen in this app reads and writes through a single React context in
`lib/demo/store.tsx`. **No component fetches anything.** The `Ctx` interface at
the top of that file is the complete list of what the app can do — a little over
fifty members, all of them small.

That interface is the backend contract. Satisfy it and every screen works
unchanged, because no screen knows the difference.

```ts
const { db, currentUser, sendMessage, advanceStage, createPairing } = useDemo();
```

### The shape of the work

```tsx
// app/layout.tsx — replace <DemoProvider> with your own
import { DemoContext, type Ctx } from '@/lib/demo/store';

function RealProvider({ children }: { children: React.ReactNode }) {
  const value: Ctx = useYourBackend();   // TypeScript lists what is missing
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}
```

`Ctx` and `DemoContext` are both exported for exactly this. Type your object as
`Ctx` and the compiler becomes the checklist — it names every function you have
not written yet, which is a far better plan than discovering them one screen at
a time.

### A sensible order

You do not have to build all of it before anything runs.

1. **Accounts.** `signInAs`, `signOut`, `currentUser`. Nothing else works until
   somebody is signed in.
2. **Reading.** Populate `db` from your database. Every screen renders
   read-only, and you can look at all of them.
3. **The core loop.** `sendMessage`, `advanceStage`, `createPairing`,
   `approveUser`. That is a usable app.
4. **The rest**, as each screen needs it.

Keep `DemoProvider` around while you do this. Being able to switch back to the
demo store is how you tell "my backend is wrong" apart from "the app is wrong",
and you will want that distinction more than once.

### `db` is one snapshot, and that is deliberate

The app expects `db` to hold the current state of everything it can see, and
re-renders when it changes. For a church — tens to low hundreds of people — this
is fine and keeps the whole app simple.

If you are wiring something much larger, this is the assumption to revisit
first, and the change is localised: `db` becomes several queries behind the same
interface.

### The rules your data layer now owns

Screens enforced these while there was no server. From your first real user,
they are yours, in your data rules:

| Rule | What breaks without it |
|---|---|
| A Guide reads only their own pairings | Every Guide reads every conversation in the church. |
| Private notes are readable by their author alone | The thing a Guide was promised is private, is not. |
| An Explorer never receives their own stage | A pastoral note becomes a grade shown to the person. |
| Only a Director invites and pairs | Anybody adds anybody to the church's records. |
| Nobody changes their own role | The first curious person becomes a Director. |

That last one deserves a sentence of its own. If your backend has an "update my
profile" call, it must **not** accept a role — pin it to the role already
stored. A member who can promote themselves is the entire security model gone,
and it is the single most common way an app like this is broken.

While you are there: **delete `components/RoleSwitcher.tsx`** and `setMyRole`
from the store. That is the demo's role switcher, it is safe only because there
is no server, and it must not survive the day one appears.

---

## Seam 3: real-time synchronisation

Out of the box, every open window of the app **on one device** stays in step
live. Open the Guide in one window and the Explorer in another, send a
message, and it appears in both without a refresh. That is genuinely useful —
it is the clearest way to show a two-person conversation to a room — and it is
honestly all a backendless app can do. Two different phones cannot sync through
a server that does not exist.

Swap the transport and the same code syncs across devices:

```ts
import { setRealtimeTransport } from '@/lib/realtime';

setRealtimeTransport({
  publish: (msg) => channel.send({ type: 'broadcast', event: 'db', payload: msg }),
  subscribe: (fn) => {
    const sub = channel.on('broadcast', { event: 'db' }, (p) => fn(p.payload));
    return () => sub.unsubscribe();
  },
});
```

### The mistake this seam exists to warn you about

**A change feed is a second way out of your database, and it does not inherit
the rules you wrote for queries.** On Postgres providers, row-level security for
the replication stream is a *separate switch* from row-level security for
queries. Turn on the wrong one and every listener receives every changed row,
including the private note a Guide just wrote about somebody.

Three things before you trust your transport:

1. **Subscribe per pairing, not per table.** Least privilege applies to feeds.
2. **Send changes, not the whole database.** The default transport broadcasts
   everything, which would be indefensible over a network and is fine on one
   device for one reason: every window it reaches is the same browser, already
   sharing the same storage. It crosses no boundary that was not already
   crossed. Yours does.
3. **Test it with two clients signed in as two different people.** A feed leak
   is completely invisible from the sending side.

### Attachments travel the same way

`attachMedia` puts a file on a conversation. The bytes go to IndexedDB and the
database row holds only metadata — the same split you must make in production
between object storage and a table. When you implement this against a real
backend, the row is the easy half. **The classic leak is protecting the row and
leaving the file on a public URL:** if the file is reachable by anyone holding
the link, the link *is* the permission, and anybody ever sent one keeps it
forever. Keep the bucket private and mint short-lived signed URLs after checking
the same rule the row uses. Minutes, not days.

The matching database policy is in `docs/examples/schema.sql`, sections 2b and
2c, and it has been run.

---

## Deploying

It is a standard Next.js app with no runtime configuration. Vercel, Netlify,
Cloudflare Pages, a Node server, a container — all fine.

Two things worth knowing:

**Content-Security-Policy.** `next.config.mjs` allows this origin and nothing
else. When you add a backend on another origin, add it to `connect-src` — and
only there. Widening `default-src` instead is the usual shortcut, and it gives
away every other directive at the same time.

**Updates.** `app/version.json/route.ts` reports the build id and
`components/VersionWatch.tsx` polls it, so an open app notices a new deployment
within about thirty seconds and offers a one-tap restart. This works on any host
that serves the app; there is nothing platform-specific in it, and nobody is
ever asked to uninstall and reinstall. See [UPDATES.md](./UPDATES.md).

---

## When you are done

Run the suite:

```bash
npm test
```

`tests/no-backend.js` will now fail, because you have added a backend. **That is
the correct result** — it is not a check to delete, it is a check to update. Edit
its allow-lists to describe what your fork is allowed to have, so it goes on
catching the thing it exists for: a dependency, a route or an analytics SDK that
nobody meant to add.

Everything else in `npm test` should stay green. If `tests/no-secrets.js` goes
red, stop and read it before doing anything else — that one is telling you a
credential is about to be published.
