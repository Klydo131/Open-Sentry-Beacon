# Presenting Hope Beacon

One file, four jobs:

1. **Your own briefing.** Every concept is explained twice — in plain words, then
   in full technical detail — so that whoever asks, you have the right answer at
   the right depth.
2. **Three audience tracks.** Church directors, IT people, and enthusiasts want
   different things. Each track says what to show, what to skip, and in what
   order.
3. **A demo script.** Literal click paths, so nothing is improvised on stage.
4. **A machine-readable source.** If you hand this file to an AI and ask it to
   build a presentation, everything it needs is here. See
   [For an AI reading this](#for-an-ai-reading-this-file) at the end.

> **On numbers.** This document deliberately contains almost no statistics. See
> [Evidence](#evidence-and-a-warning-about-numbers) — the short version is that a
> figure you cannot defend when a director challenges it will cost you more than
> it gains, and the argument for this app does not need one.

---

## Contents

- [Part A — The facts](#part-a--the-facts)
- [Part B — Every concept, twice](#part-b--every-concept-twice)
- [Part C — The three audiences](#part-c--the-three-audiences)
- [Part D — The demo script](#part-d--the-demo-script)
- [Part E — Questions you will actually get](#part-e--questions-you-will-actually-get)
- [Evidence](#evidence-and-a-warning-about-numbers)
- [For an AI reading this file](#for-an-ai-reading-this-file)

---

## Part A — The facts

Everything here is checked against the code. Nothing is aspirational.

| | |
|---|---|
| **What it is** | A web app that helps a church walk with one person at a time, from first contact to the point where they start walking with somebody else. |
| **Licence** | AGPL-3.0. Free. Fork it, rename it, sell services around it — improvements to a hosted version stay open. |
| **Runs on** | Any modern phone or computer. Installs from the browser — no app store. Developed and CI-tested on Linux, Windows and macOS. |
| **Needs to run** | Nothing. No sign-up, no database, no keys, no configuration. |
| **Works offline** | Yes, fully, after the first load. |
| **Attachments** | Images, audio, video and documents on a conversation. Bytes stay on the device, in IndexedDB, never in the saved database. |
| **Live sync** | Every open window on ONE device stays in step with no refresh. Across devices needs a backend; the transport is a seam you swap. |
| **Roles** | Explorer, Guide, Director, Executive Director. |
| **Journey stages** | Create → Connect → Care → Call → Cultivate → Commission (six). |
| **Sample people** | 10, all invented, at email domains that can never reach a real inbox. |
| **Guided walks** | 4 — one per role. Executive 3 steps, Director 5, Guide 5, Explorer 3. |
| **Built with** | Next.js, React, TypeScript. Three runtime dependencies. |
| **Tests** | 30 checks including 18 real-browser walks, two at phone size. All passing. |

**The one thing to be clear about in every room:** as it ships there is **no
server and no database**. Everything lives in the browser on your own device.
That is why it is safe to hand to anyone, and it is also the thing a church
changes when it wants two people to share the same information.

---

## Part B — Every concept, twice

Read both levels of each. In the room, use whichever the question deserves.

### 1. Pairing — the heart of the whole thing

**Plain words.** A church notices someone exploring faith. Instead of putting
their name on a list, one person from the church is assigned to walk with them —
one to one. That relationship is the unit the whole app is built around.
Everything else — the messages, the lessons, the stages — hangs off it.

**In detail.** A pairing is a record joining two people: a Guide and an
Explorer, plus a stage and a track. It is created one of two ways:

- A Director pairs two people directly.
- **The recommendation chain**, which is the designed path. A Guide
  recommends somebody by name and email. That recommendation goes to a Director,
  who invites them. When that person accepts the invitation, **the pairing is
  created in the same operation that creates their account** — with the
  Guide who recommended them, at stage `connect`.

That last detail is the one worth defending. There is never a moment when a new
Explorer exists with nobody attached to them, because attachment happens in the
same step as creation rather than as a follow-up task somebody has to remember.

**Why a Guide cannot invite directly.** They recommend; the Director decides.
That keeps one person accountable for who enters the church's records. In this
build the rule is enforced by the screens; in a real deployment you enforce it in
the database, because anybody can send a request without using your screens.

### 2. How an app works with no backend

**Plain words.** Normally an app keeps your information on a computer somewhere
else, and asks for it every time you open a screen. This one keeps everything on
your own device. Nothing is sent anywhere. That is why it works with no signal,
and why there is nothing to break into.

**In detail.** Every screen reads and writes one React context —
`lib/demo/store.tsx` — which persists to `localStorage` and normalises on load,
so a save written by an older version still opens in a newer one. No component
fetches. The `Ctx` interface at the top of that file is the complete list of what
the application can do, which makes it the backend contract: anything satisfying
it can replace the store, and no screen notices.

The trade-off, stated plainly: one device, one person. Clear the browser and it
is gone. That is correct for evaluating, training, and demonstrating. It is not a
multi-user system, and it does not pretend to be.

### 3. How email works

**Plain words.** In this version, nothing is actually emailed. Every message the
app *would* send — an invitation, a welcome, a notification — appears in a **Mail**
screen instead, worded exactly as it would arrive. You can read it and click the
links. It is a rehearsal of the real thing with no mail server anywhere.

**In detail.** `lib/demo/store.tsx` builds a `DemoEmail` for each event and stores
it in `db.emails`; `app/mail/page.tsx` renders the mailbox, open to every role on
purpose — a Director reads what the app sends and acts on recommendations, a
Guide writes them, an Explorer sees the welcome they were sent. The simulation
is only useful if everyone can stand in it.

**When you connect a backend**, you replace that with a real provider. The
invitation flow is the one to get right: a single-use token, an expiry, and a link
that only works for the address it was sent to. Anything that sends email must be
rate limited **on your server**, keyed on something the caller cannot change for
free.

### 4. Desktop and phone

**Plain words.** The same app, and it adapts. On a phone you can add it to your
home screen and it opens like any other app — full screen, its own icon, no
browser bar. On a computer you can install it the same way. It updates itself;
nobody ever has to uninstall and reinstall.

**In detail.** It is a Progressive Web App: a web manifest makes it installable,
and a service worker caches the shell so every route works offline, not only the
screens you happened to visit. Updates do not rely on the service worker's own
mechanism, which is the part that fails in practice — the app fetches
`/version.json` with `cache: 'no-store'` a few seconds after launch, on every
return to the foreground, and every fifteen minutes, and compares the build id
against the one compiled into its own bundle. Different means stale, and it offers
a one-tap restart. Measured at about 28 seconds from deploy to prompt.

The manifest pins `id` to `/` so a rename relabels the installed app instead of
creating a second one beside it.

### 5. Making your own Beacon

**Plain words.** Copy the project, change the words, and it is yours. The roles,
the six stages, the sample people and the lessons are ordinary files. Nothing is
locked. There is no licence to buy and nobody to ask.

**In detail.** Fork, then:

- `lib/brand.ts` — the app's name and colours. One edit renames it everywhere;
  a test fails if a name gets hardcoded somewhere a rename would miss.
- `lib/types.ts` — every shape in the app, in one file. Roles live here.
- `lib/demo/seed.ts` — the sample people. **This is also the schema**, because
  the normaliser derives the expected shape from it.
- `lib/quest.ts` — the four guided walks.

Then `npm run icons` regenerates the favicon and home-screen icons from the same
drawing, so the brand cannot drift.

### 6. Deploying it

**Plain words.** It is a normal website. Put it anywhere that hosts websites —
most have a free tier that covers a church comfortably. Nothing to configure.

**In detail.** Standard Next.js. Vercel, Netlify, Cloudflare, a container or your
own Node server all work; there is nothing platform-specific in it. The build
identity is read from whichever host you use — Vercel, Netlify, Cloudflare Pages,
GitHub Actions, GitLab CI, Heroku or Render — with a `BUILD_ID` override, so
redeploying the same code never tells an installed copy it is out of date.

What belongs to whoever deploys it: HTTPS, browser security headers, the domain,
and the decision about whether it should be public at all. It ships `noindex` by
default across three places — the meta tag, `robots.ts`, and the `X-Robots-Tag`
header — because a shared deep link that gets indexed is the cheapest possible
leak. Change all three or none.

### 7. Connecting your own database

**Plain words.** The day two people need to see the same thing on two phones, you
add a database. You choose which one — we do not pick for you. The app is built so
that this is a swap underneath, not a rebuild.

**In detail.** `docs/BUILD-YOUR-OWN.md` is the full walkthrough. The shape:

- `Ctx` and `DemoContext` are exported. Implement `Ctx` against your database,
  provide it in place of `DemoProvider`, and every screen keeps working.
- Type your object as `Ctx` and the compiler lists what you still owe.
- Start with the feedback sink in `lib/backend/feedback.ts` — the same pattern at
  one twentieth the size, working end to end in about fifteen minutes.

**The rule that matters more than the code:** your screens decide what to *show*;
your database decides what somebody is *allowed to have*. Put the permission rules
with the data. Anybody can send a request without using your screens.

Five rules your data layer inherits: a Guide reads only their own pairings;
private notes are readable by their author alone; an Explorer never receives their own
stage; only a Director invites and pairs; and nobody can change their own role.

### 8. Attachments and live sync

**Plain words.** You can attach a photo, a voice note, a video or a document to a
conversation, and both people in that conversation see it. Nobody else does, not
even a Director. And if you have the app open in two windows, a message sent in one
appears in the other straight away, with no refresh.

**The honest limit, say it before anybody tests it.** Live sync works between
windows on *one device*. Two different phones cannot sync through a server that
does not exist. Add a backend and the same code syncs across devices, because the
transport is a seam you replace, not a thing baked in.

**In detail.**

- Attaching goes through `attachMedia(pairingId, file)`. It returns immediately
  and writes the bytes in the background — the same optimistic rule as every
  other write. If the disk refuses, the row is removed again, so you never see an
  attachment whose file is not there.
- **The bytes are never in the database row.** They go to IndexedDB; the row holds
  metadata and an id. That is not a preference: this database is serialised into
  localStorage on every write, and localStorage holds about 5 MB. One phone photo
  inlined would break saving for everything else.
- Who may see an attachment follows the **pairing**, never the file. The screens
  call `mediaFor(pairingId)` and never filter the collection themselves, because
  the rule belongs in one place — and in a real deployment that place is a
  database policy.
- Live sync is `lib/realtime.ts`. The default transport is a `BroadcastChannel`;
  `setRealtimeTransport()` swaps it for your provider.

**The two mistakes to know about, because both are silent.**

1. **A private row pointing at a public file.** Row rules govern rows, not
   objects. If the file is reachable by anyone holding the link, the link *is*
   the permission, and anybody ever sent one keeps it forever. Private bucket,
   short-lived signed URLs, minutes not days.
2. **A change feed is a second way out of the database** and does not inherit the
   rules you wrote for queries. On Postgres providers, row-level security for the
   replication stream is a separate switch. Subscribe per pairing, and test it
   with two clients signed in as two different people — a feed leak is invisible
   from the sending side.

Both have matching policies in `docs/examples/schema.sql`, sections 2b and 2c,
and that file has been run.

---

## Part C — The three audiences

### Track 1 — Church directors

**They are deciding whether this is worth their church's attention.** They do not
want architecture. They want to know whether it solves a problem they recognise.

**Open with the problem, not the app.** Say it roughly like this, and watch for
recognition:

> Someone comes forward on a Sabbath. A name goes on a card. The card goes in a
> folder, or into somebody's pocket. Six weeks later, nobody in this room can tell
> me what happened to that person — not because anybody stopped caring, but
> because the follow-up lived in one person's memory.

That is the whole case, and it needs no statistic. Every director in the room has
lived it.

**Then the answer in one line:** Beacon replaces the card with a named person and
a visible next step.

**What to show, in this order:**

1. **One person, walking with one person.** The pairing. Not a database of
   contacts — a relationship with somebody accountable for it.
2. **The six stages**, and the fact that the last one turns around: Commission is
   where the person being walked with begins walking with somebody else. The
   model is designed to multiply, not to accumulate.
3. **Their own screen.** Run the Executive Director walk — three steps, about a
   minute. They see the church in numbers and the journey chart.
4. **What they will never see.** This is the trust moment. Leaders get counts;
   Guides get the relationship. There is no screen anywhere that shows a
   pastor somebody's private conversation. Say it plainly: *"I cannot read
   Maria's messages, and neither can you, and that is deliberate."*
5. **Cost.** It is free and open source. No licence, no per-seat fee, no vendor.

**What to skip entirely:** the store, the backend seam, TypeScript, tests, the
repository.

**The one thing they most need to hear:** an Explorer never sees their own stage. A
stage is a note the church keeps to organise its work, not a grade shown to a
person about themselves. Directors immediately understand why that matters
pastorally, and it demonstrates the app was designed by people thinking about
dignity rather than data.

### Track 2 — IT people

Mixed room: some professionals, some not. **Pitch to the middle and offer depth on
request.** The professionals will ask; the others will be glad you did not assume.

**Lead with the thing that is unusual:** this app has no backend, and that is a
design decision rather than an unfinished state. Then explain what that buys —
runs anywhere, nothing to breach, evaluate the whole thing before committing —
and what it costs: one device, one person.

**Cover, in this order:**

1. **Architecture in one sentence.** Next.js front end; every screen reads one
   store; the store is the only thing that touches persistence.
2. **The seam.** `Ctx` is the backend contract, exported so you can implement it.
   Show the interface. This is the part professionals will judge you on, and it
   holds up: no screen fetches, so replacing the store replaces everything.
3. **Run it themselves, live.** `git clone`, `npm install`, `npm run dev`. It
   works in under two minutes with nothing to configure. Do this on screen — it is
   more persuasive than any slide.
4. **Connecting a database.** Walk `docs/BUILD-YOUR-OWN.md`. Emphasise that the
   schema and permission rules in `docs/examples/` **have been run against a real
   PostgreSQL 16 database** and attacked from a second account — fourteen checks,
   all passing. Mention that running them the first time found five defects,
   including one that silently broke this app's most important promise: an
   Explorer could read their own journey stage straight out of the database, even
   though every screen hid it. Engineers trust a project more when it admits
   that, not less.
5. **Contributing.** `CONTRIBUTING.md`. The bar is "will the next person
   understand why it is like that". Comments explain *why*. Guardrails are tests,
   not agreements. New tests must fail first.
6. **Maintaining it.** CI runs typecheck, tests and a build on every push with
   read-only permissions and no secrets, so a fork has working CI on the first
   click of Fork.

**Have ready if asked:**

- Three runtime dependencies. Deliberately small so one person can audit it.
- The image optimiser is off — a security decision as much as a cost one.
- CSP allows this origin and nothing else; add your backend to `connect-src` only.
- The demo role switcher and `setMyRole` must be **deleted** before real users.

### Track 3 — Enthusiasts

**Casual. No slides if you can avoid it. Hand them your phone.**

The whole pitch is three sentences:

> A church meets someone who wants to know more. Normally what happens next
> depends on a card in a folder and somebody's memory. This gives the church one
> place for that, and gives each person involved exactly the part of it they need.

Then: **"Here, have a look."** Let them tap. Point out three things as they go:

1. **Pick who you are** — and the app becomes a different app. Same information,
   four completely different views.
2. **It works with no signal.** Turn on flight mode while they hold it. Nothing
   breaks. That single moment does more than any explanation.
3. **It is free, and it is yours.** Anyone can take it and make their own.

If they ask how it works: *"Everything is stored on the phone itself, not on a
company's server. That is why it works with no signal, and why there is nothing
to leak."* Stop there unless they push.

---

## Part D — The demo script

Do these steps in order. They build.

### Before you start — every time

1. Open **Sign in** → press **Reset demo data**. The tutorial and demo write to
   browser storage; if you have rehearsed, the state is dirty and the numbers
   will look wrong.
2. **Do not push to `main` during your presentation window.** There is no update
   banner to switch off any more — the app takes a new build by itself as soon
   as the screen has been quiet for twenty seconds, which during a demo is most
   of the time. It will not interrupt you mid-sentence and it will not lose
   anything you have typed, but the page can reload while you are talking. The
   only reliable way to stop that is to ship nothing while you are on stage.
3. If you installed it to the home screen, install from the real address, never a
   preview link — a preview is a different origin and becomes a second app that
   can never update.

### The five-minute version

| # | Do this | Say this |
|---|---|---|
| 1 | Open the front door | "This is what a member of your church sees." |
| 2 | Scroll down | "And this is what you can do before deciding anything." |
| 3 | **Who are you in your church?** → Executive Director | "Three steps. It teaches you your own job, not somebody else's." |
| 4 | Complete the walk | Let the arrows do the talking. Do not narrate every step. |
| 5 | Header → **Try any account** → a Guide | "Same church. Same information. Completely different app." |
| 6 | Open an Explorer → **Talk** | "This conversation is private to these two people. I cannot read it. Nor can the pastor." |

Step 5 is the moment that lands. Everything before it is setup.

### The full version — add these

| # | Do this | Shows |
|---|---|---|
| 7 | Guide → **Recommend someone** — name and email | A Guide recommends; they cannot invite |
| 8 | Switch to Director → **Mail** | The recommendation arrived. "This is the email that would have been sent." |
| 9 | Director → invite them | The chain: recommend → decide → invite |
| 10 | Show the pairing appears at **Connect** | "Paired the moment they accept. Nobody has to remember." |
| 11 | Director → **Analytics** | Counts and trends. No names. |
| 12 | Flight mode on, keep clicking | Works offline. This surprises people. |
| 13 | Settings → **App version** | Updates itself; nobody uninstalls anything. |

### For an IT room, add

| # | Do this | Shows |
|---|---|---|
| 14 | Terminal: `git clone`, `npm install`, `npm run dev` | Two minutes, nothing to configure. Verified from a clean clone on 2026-08-12; `tests/dev-server.mjs` keeps it that way |
| 15 | Open `lib/demo/store.tsx`, show `Ctx` | The backend contract |
| 16 | Open `docs/examples/schema.sql` | Tables and permission rules, already run |
| 17 | Run `prove-the-rules.sql` | Sixteen attacks from a second account, all refused |
| 18 | `npm test` | Every static check (178 on 4 October 2026); `npm run verify:all` adds every browser walk (74) |

---

## Part E — Questions you will actually get

Both levels for each. Use whichever fits the asker.

**"Is our members' data safe?"**
*Simple:* In this version nothing leaves your device — there is no server to
break into. When you connect a real one, the safety of that is your church's
responsibility, and the app is built to make the right thing the easy thing.
*Full:* No network calls, no analytics, no telemetry. Tests enforce that on every
build. With a backend, authorisation must live in the database rather than the
screens, and `docs/BUILD-YOUR-OWN.md` walks through it with a schema that has been
run and attacked.

**"Can the pastor read people's messages?"**
*Both levels, same answer:* **No.** There is no screen that shows it. Leaders get
counts and trends, never conversations. If you connect a database, that boundary
becomes a rule you enforce there — it is easy to lose by accident and hard to
explain afterwards.

**"What does it cost?"**
Nothing. AGPL-3.0 licence. Hosting for a church fits comfortably in most free
tiers. Running it unmodified obliges you to nothing; if you change it and host
it for people, you offer them your changed source.
Your costs are a domain if you want one, and whoever maintains it.

**"What if the developer disappears?"**
You have the entire source code under a licence nobody can revoke. Any competent
developer can pick it up — that is exactly why the comments explain *why* rather
than *what*.

**"Does it work without internet?"**
Yes, fully, after the first load. Demonstrate it rather than answering it.

**"Do people need to download it from an app store?"**
No. They open a link and choose "Add to Home Screen". It then behaves like any
other app. No store, no review, no fee, no waiting.

**"How is this different from a spreadsheet or a WhatsApp group?"**
*Simple:* A spreadsheet tells you who exists. This tells you who is walking with
whom, where they have got to, and what happens next — and it shows each person
only their own part.
*Full:* The unit is the pairing, not the contact. Stage, materials, meetings,
notes and messages hang off the relationship, and role-based views mean the same
data serves four different jobs without anybody seeing more than they should.

**"Can we change the stages / the wording / the roles?"**
Yes. They are ordinary files. Stages and roles are one edit each.

**"Who else is using it?"**
Answer honestly: it was built for one church and has just been open-sourced. Do
not imply a user base that does not exist — an IT person will check.

**"Is it finished?"**
The app is complete and tested. What is deliberately not included is a backend,
because that is the church's own choice. Also say plainly: promoting an Explorer to
become a Guide is **not built yet**, because it needs decisions nobody has
made — what happens to the old pairing, who approves, what history carries over.

---

## Using AI tools properly

This app was built with heavy AI assistance, and you will be asked about it —
by IT people who want to know if the code can be trusted, and by directors who
have read something worrying. Answer from experience rather than from either
enthusiasm or fear. What follows is what this project actually learned.

### The one rule that matters

**AI is excellent at producing work that looks correct. It has no way of knowing
whether it is.**

That is not a criticism, it is the shape of the tool. It writes from patterns,
so its output is plausible by construction — and plausible is exactly what you
cannot tell apart from correct by reading.

### The evidence from this project

The database rules in `docs/examples/` were written by AI, reviewed carefully,
and read perfectly well. Then somebody actually ran them against a real
database. **Five defects**, including:

- The whole thing failed on the first policy — the SQL assumed one particular
  vendor's function that does not exist in plain Postgres.
- One policy recursed infinitely. The app could not list anybody at all.
- An Explorer could read their own journey stage directly from the database, even
  though every screen hid it. **The app's most important promise, broken, in
  code that had been read and approved.**
- A safety rule written to stop people promoting themselves also stopped Directors
  approving anyone — and it failed silently, so the church would have concluded
  the app was broken with nothing in any log to explain it.

None of those were visible by reading. All of them appeared within minutes of
execution. That is the entire lesson.

### How to use these tools well

| Do | Don't |
|---|---|
| Use it to draft, explain, and find things in a large codebase | Ask it whether its own output is correct — it will say yes |
| **Run everything it writes.** Execute the code, apply the schema, click the screen | Approve by reading. Reading catches typos, not logic |
| Ask it to write the test that would catch the mistake, then break the code and watch the test fail | Trust a test that has never failed. A test that cannot fail is decoration |
| Make it state what it did *not* verify | Accept confident summaries at face value |
| Give it the real files and let it check | Let it work from memory of your project |
| Ask it to explain *why*, and keep that in the code | Keep only the code and lose the reasoning |

### Three hard rules for a church

1. **Never paste real member data into an AI tool.** Not names, not prayer
   requests, not pastoral notes, not a spreadsheet export. Use the invented
   sample people. Anything you paste may be stored or reviewed, and the person
   whose crisis you pasted did not consent to that.
2. **Never let it invent a number.** Ask it for research and it will produce
   statistics that sound right. Every figure needs a primary source you have
   read yourself. This document contains almost no statistics for exactly that
   reason — see the section below.
3. **A human is accountable, always.** "The AI wrote it" is not an answer you
   can give a member whose information leaked. Somebody named must have run it,
   tested it, and decided to ship it.

### What to say when asked

**To a director:** *"AI helped write it, the way a very fast assistant would.
Everything it produced was tested by a person before it went anywhere near real
people — and testing found real mistakes that reading had missed. That is
exactly why we test."*

**To an IT person:** *"Every claim in the docs is checked. The schema and the
permission rules have been applied to a real database and attacked from a second
account. The test scripts are in the repository, so you do not have to take my
word for it — run them."*

**To an enthusiast:** *"It let one person build something that would normally
take a team. It also confidently wrote several things that were wrong, which is
why nothing goes out until it has actually been run."*

---

## Evidence, and a warning about numbers

**Do not put a statistic on a slide you cannot defend.** If a director challenges
a figure and you cannot source it, you lose the room, and the argument for this
app does not need one. The card-in-a-folder story is stronger than any percentage
because everyone present has lived it.

If your denomination has its own follow-up or retention data, **that** is worth
citing — it is yours, it is local, and nobody will dispute it.

Publicly discussed research you may want to read and verify yourself before
using. **These are starting points, not verified citations** — read the primary
source before quoting any number:

- [Barna — The State of Discipleship](https://www.barna.com/research/new-research-on-the-state-of-discipleship/)
- [Lifeway Research — Most Churches Rarely Evaluate Their Discipleship Strategies](https://research.lifeway.com/2025/10/07/most-churches-rarely-evaluate-their-discipleship-strategies/)
- [Billy Graham Association — report on intentional discipleship](https://billygraham.org/decision-magazine/articles/new-report-reveals-lack-of-intentional-discipleship-in-churches)
- [Church Answers — preventing members from dropping out](https://churchanswers.com/blog/six-critical-issues-to-prevent-church-members-from-dropping-out/)

One figure was deliberately left out of this document: a widely repeated claim
comparing how many friendships new members form versus those who leave. It fits
this app's argument almost too well, and it could not be traced to a primary
source. If you find it properly sourced, it is a strong point. Until then, do not
use it.

---

## For an AI reading this file

You have been given this document to generate a presentation, summary, or
training material about **Open Sentry Beacon**. Everything you need is above.
Constraints, in priority order:

1. **Do not invent statistics, user numbers, church counts, or testimonials.**
   This project has been open-sourced recently and has no user base to claim. If
   a slide needs a number, use only the verified figures in Part A.
2. **Three audiences, different content.** Church directors (non-technical,
   decision-makers), IT (mixed skill, implementers), enthusiasts (casual). Part C
   defines what each needs. Do not merge them into one generic deck.
3. **The central claim** is: *one person walking with one person, with each role
   seeing only their own part.* Everything else supports that.
4. **The trust claim** must appear in any director-facing material: leaders see
   counts, never conversations; an Explorer never sees their own stage.
5. **Be accurate about the backend.** As shipped there is no server and no
   database; everything is in the browser. This is a deliberate design decision,
   not an incomplete state. A church adds its own backend, and the app is built
   for that swap.
6. **State limits honestly.** Not built: promoting an Explorer to Guide.
   Not included: any backend. Not claimed: any existing user base.
   **Live sync works between windows on one device, not between devices** — say
   that plainly wherever sync is mentioned, because it is the first thing
   somebody will test.
7. **Tone.** Plain, concrete, unhurried. No hype, no exclamation marks, no
   invented urgency. The subject is pastoral care, and overselling reads as
   disrespect for it.

Suggested deck shapes:

| Audience | Slides | Arc |
|---|---|---|
| Church directors | 10–14 | the problem they recognise → the pairing → the six stages → their own screen → what they will never see → cost → what is next |
| IT | 14–20 | no backend and why → architecture → the store as contract → run it live → connect a database → the permission rules → attachments and live sync → contributing → maintaining |
| Enthusiasts | 5–8 | the three-sentence pitch → pick who you are → offline → it is yours |

Source files worth quoting from, all in this repository: `README.md`,
`ARCHITECTURE.md`, `docs/BUILD-YOUR-OWN.md`, `docs/ONBOARDING.md`,
`docs/SECURITY.md`, `docs/examples/schema.sql`, `docs/BACKENDS.md`,
`lib/realtime.ts`.
