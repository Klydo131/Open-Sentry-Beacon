# How Open Sentry Beacon is built

Written for a developer who has just cloned this and wants to know where things
are before changing anything. No prior knowledge of the project is assumed.

---

## The one-sentence version

It is **two applications behind one door**: clone it and it runs entirely in the
browser with no backend, no database and no configuration; give it a database
and the same routes render a second tree that talks to that database instead.

That is not a limitation to work around. It is the design, and it is what lets a
church try the entire application before deciding anything — and what lets you
run the test suite without standing anything up.

Which one you are looking at is decided by `useIsLive()` (`lib/tutorial.tsx`),
and almost every route is shaped like this:

```tsx
if (useIsLive()) return <LiveAppShell allow={…}>…</LiveAppShell>;
return <AppShell allow={…}>…</AppShell>;
```

| | Sample side | Live side |
|---|---|---|
| State | `lib/demo/store.tsx`, seeded from `lib/demo/seed.ts` | a Postgres database |
| Data access | the store | `lib/live/data.ts`, and nothing else |
| Who is in it | a fictional church | a real one |
| Shell | `components/AppShell.tsx` | `components/LiveAppShell.tsx` |
| Screens | `components/*.tsx` | `components/Live*.tsx` |

**A change to one side is usually a bug on the other.** Somebody learns the app
on the sample side and then signs in. If a room exists in one and not the other,
they were taught a layout that does not exist. Add a room and you add it to
both; `tests/live-header-fits.mjs` fails when they disagree.

---

## Running it

```bash
npm install
npm run dev          # http://localhost:3000
```

That is the whole setup. There is no `.env` to fill in, no database to migrate,
no seed script to run. Sample people and sample activity are already there.

```bash
npm test             # every check that does not need a browser
npm run test:all     # the above, plus the end-to-end suites in a real browser
npm run build        # production build
```

Requires **Node 22 or newer**. Some tests import TypeScript directly and rely on
Node's native type stripping, so there is no build step between the code that
ships and the code that is checked.

---

## Where things are

| Path | What lives there |
|---|---|
| `app/` | Routes. One folder per screen, Next.js App Router. |
| `components/` | Everything visual. No data fetching beyond the store. |
| `components/Live*.tsx` | The live side of each screen. Same rooms, real data. |
| `lib/demo/store.tsx` | **The store.** Every piece of state, and every action. |
| `lib/demo/seed.ts` | The sample church: people, pairings, lessons, history. |
| `lib/live/data.ts` | **Every** live database call. Nothing else talks to the database. |
| `lib/live/session.tsx` | Who is signed in, and the rules for deciding they are not. |
| `lib/live/errors.ts` | `humanError()`. Where a database error becomes a sentence. |
| `lib/supabase/client.ts` | The browser's connection, or **null** when there is none. |
| `lib/backend/` | The seam where you plug in a real backend. |
| `lib/study/` | The Explorer's study room. AFFiNE's editor is MIT and its server is not, so the workspace and the place documents are kept are ours: `workspace.ts` implements BlockSuite's `Workspace` over its public pieces, `doc-source.ts` keeps pages in `study_docs`, `memory-source.ts` is the tutorial's, and forgets. |
| `lib/quest.ts` | The guided tutorial: one walk per role. |
| `lib/types.ts` | Every shape in the app, in one file. |
| `supabase/migrations/` | The schema and every permission rule, in order. |
| `supabase/functions/` | Server-side work the browser must not do — invitations. |
| `supabase/tests/` | The fresh-install proof: what a new Supabase project already has, the protections a fresh install must hold, and the fingerprint a live project is compared with. Run by `scripts/fresh-install.sh`. |
| `supabase/seed/` | Run once by hand: makes you the first Executive Director. |
| `tests/` | Guardrails and unit checks. |
| `tests/e2e/` | Real-browser suites, phone-sized by default. |

---

## The store is the whole data layer

`lib/demo/store.tsx` is a React context. It holds the entire application state
and exposes every action as a function:

```tsx
const { db, currentUser, sendMessage, advanceStage, createPairing } = useDemo();
```

Two things follow from that, and they are the most useful facts in this document.

**Nothing else touches data.** No component fetches. No screen knows where
anything is stored. If you want to know what the app can do, read the `Ctx`
interface at the top of that file — it is the complete list.

**The `Ctx` interface is therefore the backend contract.** Anything that can
satisfy those functions can be the backend. That is what makes this app
platform-agnostic: not an abstraction layer added on top, but the fact that there
is only ever one place data comes from.

State persists to `localStorage` and is normalised on load, so a save written by
an older version still opens in a newer one.

---

## The live side, once a database is connected

The sample side is one file. The live side is a database, and the two most
useful facts about it are both about where the rules live.

**The permission rules are in the database, not in the screens.** Every table
has row-level security, and each policy is a sentence in
`supabase/migrations/`. A hidden button is a convenience; the policy is the
boundary. You can send a request without using the screens at all, and that
request meets the same policy.

**`lib/live/data.ts` is the only file that talks to the database.** Same
discipline as the store on the other side: no component fetches, so the complete
list of what the live app can do is the list of exports in that one file.

**The connection returns `null` when there are no keys, and never throws.**
`lib/supabase/client.ts` is written that way on purpose: a client that threw on
a missing key would mean the app could not start without a database, which
quietly kills the promise that you can clone this and look at it. Every caller
checks for null and falls back to the sample data, and `tests/no-backend.js`
fails the build if somebody writes `process.env.X!` instead.

**The first Executive Director is granted from a database session, not from the
app.** `supabase/seed/01_make_me_the_first_director.sql` is run once, by hand,
by whoever owns the database. The highest seat in the app deliberately cannot be
handed out by anything inside the app; everybody after the first arrives by
invitation.

### Two patterns worth knowing before you add a feature

Both came out of the same question — *what happens when one person changes
something everybody shares?* — and both have a migration you can read.

**Copy on first edit** (`lesson_series`, `20260904090000_a_study_is_yours_to_change`).
The church publishes example studies. Somebody edits one, and what they get is
their own copy, with `copied_from` pointing at the original; everybody else
still sees the original. Nobody can rewrite a shared thing for sixteen other
people by correcting a typo on their own screen.

**Hide for me, or delete** (`material_hides`, `20260904110000_a_shelf_of_your_own`).
The library is one shared shelf. Remove is offered to everybody, and asks the
database which of two things it may do: delete the row (yours, or you lead the
church), or write a row saying it is off *your* shelf and leave everybody else's
alone. Who hid what is readable only by the person who hid it.

The difference between them is only that a study has something to copy and a
link does not. Reach for whichever fits the thing you are adding, rather than a
third answer.

### The invitation is server-side on purpose

`supabase/functions/invite/` runs where the browser cannot see it, because
creating an account for somebody else needs a key that must never reach a
browser. `docs/EMAIL.md` covers the mail templates, and one detail in it will
save you a day: a confirmation link that spends its token on a GET is consumed
by the first mail scanner that touches it, so the templates use a token hash the
app verifies from the client instead.

---

## Plugging in a real backend

See **[docs/BACKENDS.md](docs/BACKENDS.md)** for the full walkthrough. In short,
there are two seams and you can use either or both:

**1. The feedback sink** (`lib/backend/feedback.ts`) — smallest possible example
of the pattern, and a good first thing to try. One function, one call to swap it:

```ts
setFeedbackSink({
  describe: 'sent to our church office',
  async send(message) {
    const res = await fetch('/api/feedback', { method: 'POST', body: JSON.stringify(message) });
    return { ok: res.ok };
  },
});
```

**This repository contains a worked one.** `lib/live/feedback-sink.ts` is that
interface implemented against the live database, installed in
`lib/live/session.tsx` once a profile has loaded, and read in
`components/LiveFeedbackInbox.tsx`. Read those three files before writing your
own; they are about eighty lines between them, and they are the shortest
complete example of the pattern in the repository. Two things in it are worth
copying: it falls back to the on-device sink whenever the network or the
database refuses, so a message is never lost to a failed request, and it holds
what the device kept until the next sign-in and sends it then.

**2. The store itself** — for a real multi-device deployment. Implement the `Ctx`
interface against your database, and provide it instead of `DemoProvider`. Every
screen keeps working unchanged, because no screen knows the difference.

**Whatever you connect, its secrets belong on your server.** Anything this app
can read, every visitor can read. There is a test that fails the build if a
credential appears in the repository.

---

## Roles, and the rule that matters

Four roles: **Explorer**, **Guide**, **Director**, **Executive Director**. Each sees
a different application from the same data.

One rule is enforced by a test rather than by convention, and it should survive
any change you make: **an Explorer never sees their own journey stage.** A stage is
a note the church keeps in order to organise its work. It is not a label to show
a human being about themselves. `tests/e2e/seeker-no-stage.js` opens the Explorer's
screen and asserts that no stage name appears anywhere on it.

---

## Offline and updates

The app installs from the browser and works without a connection. Every route is
warmed when it installs, so losing signal does not restrict you to the screens
you happened to have opened.

When you deploy a new version, an open app notices within about thirty seconds
and applies it **without asking anybody anything**. There is no banner, no
button and no setting, and nobody is ever asked to uninstall and reinstall.
`app/version.json/route.ts` reports the build, `components/VersionWatch.tsx`
decides when to look, and `components/AutoUpdate.tsx` decides when a reload
costs nobody their half-typed message. The banner that used to be here came out
because it asked people to make a decision about software, which is not their
job; **[docs/UPDATES.md](docs/UPDATES.md)** has the whole story and the lever
for a release where staying on an old build is not acceptable.

---

## House style

These are not preferences. Each exists because its absence cost somebody a day.

**Comments explain *why*, not *what*.** The code already says what it does. A
comment earns its place by recording the bug that made it necessary, or the
obvious alternative and why it failed. You will find a lot of these; they are the
most valuable thing in the repository.

**Guardrails are tests, not agreements.** If a rule matters, there is a file in
`tests/` that fails when it is broken.

**Make a new test fail first.** Break the code it covers and watch it go red. A
test that has never failed is a comment with a run time.

**Assert behaviour, not shape.** A test that passes because it found a string
somewhere on the page is worse than no test — it reports green and covers
nothing.

**No new dependencies without a strong reason.** This app ships React and Next
and almost nothing else, on purpose: it has to stay installable on a cheap phone
and auditable by one person.
