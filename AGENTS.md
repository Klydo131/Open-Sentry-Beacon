# AGENTS.md — working brief for Open Sentry Beacon

Two agents work in this repository, Claude and Codex, usually not at the same
time and never with the same context. Everything below exists because one of us
learned it the hard way and the other could not have known.

**This file is the shared map.** [`CLAUDE.md`](./CLAUDE.md) adds nothing but a
pointer back here. Human contributors should read
[`CONTRIBUTING.md`](./CONTRIBUTING.md) first; this file is the part that only
matters if you are editing the app.

---

## 0. This repository is public

It is AGPL-3.0 and anyone can read it, including everything you write in a
commit message, a test fixture or a comment.

Nothing that identifies a real member of a real church belongs in a tracked
file. No names, no email addresses, no photographs, no backend project
identifiers, no database dumps, no counts small enough to point at a person.
When a live check informs a decision, write down **what you learned**, not the
row it came from.

`tests/no-secrets.js` catches credentials of recognisable shape. It cannot catch
a name, and it is not trying to. That part is yours.

---

## 0.1 Working today first, then right: the first-day protocol

The owner's standing instruction (29 September 2026): *"we always need a quick
and reliable fix for at least a day to make it operational with optimized
systems (including tools like Caveman for optimization of token use and
Ponytail for optimization of codes and systems)."*

When something is broken, or blocking the people who use the app:

1. **Make it work today.** The first push is the smallest change that makes the
   app usable and keeps it usable for at least a day on its own: nothing
   half-migrated, nothing that needs a second push before it is safe. Switching
   a feature off cleanly beats shipping a guess.
2. **Reliable means checked, not hoped.** The same gate as always (section 5),
   the new check broken on purpose, and the way back written in the commit
   message: which commit to revert, and whether a migration or a function
   deploy has to be undone with it.
3. **Then make it right**, in its own commit, once the day is safe. The report
   says which fix was the quick one and which the proper one.
4. **Security is never the day-two part.** A quick fix that widens who can see
   or do something is not quick; it is the next incident. So is one that locks
   real people out: expiring every old invitation password at once would have
   locked out 38 active members and the owner, which is why that change
   applies to new invitations and waits for the owner for the rest.

**The two tools every agent here works with**, because they make the work
cheaper and the code smaller without changing what ships:

| Tool | What it saves | Install in Claude Code (two prompts) | How it is used here |
| --- | --- | --- | --- |
| **Caveman** | Tokens: short agent prose | `claude plugin marketplace add Klydo131/caveman` then `claude plugin install caveman@caveman` | For chat, plans and notes between agents. **Never** in code comments, docs, commit messages, report files or anything a church member reads: those stay full sentences, as this file is. Security warnings and anything irreversible are always said in full. |
| **Ponytail** | Code: the fewest lines that work | `claude plugin marketplace add Klydo131/ponytail` then `claude plugin install ponytail@ponytail` | The platform before a dependency (`<input type="date">` before a date library). A deliberately small choice is marked `// ponytail: why`, as the code already does. Never trade a safety check, a test or an accessibility rule for fewer lines. |

Both are MIT-licensed and come from the owner's own forks of
`JuliusBrussee/caveman` and `DietrichGebert/ponytail`, so a change upstream
does not arrive here unannounced. In Codex, Ponytail installs with
`codex plugin marketplace add Klydo131/ponytail` and Caveman from a clone of
`Klydo131/caveman`; the toolkit page has the steps. Install both for yourself,
never "for this project only". Neither is needed to build, test or run the app:
a contributor without them loses nothing but speed. Any other tool an agent
wants to add goes through [`docs/DEVELOPER-TOOLKIT.md`](./docs/DEVELOPER-TOOLKIT.md),
which lists what is vetted, what each one can touch, and what is deliberately
left out.

## 0.2 The owner sees it before it ships

The owner's standing instruction (30 September 2026): *"If you see something to
improve more, please help me plan and see it so we can improve this app more and
better for modern use. Just remember to test, polish, and before pushing I
should be aware. Same principle for the developers who will participate in this
open source project with their AI tools."*

It applies to every change, whoever or whatever writes it:

1. **Plan it, and show the plan.** What changes, why, what it costs, and what
   you are unsure of, before building anything larger than a fix. When there is
   a choice about how the app behaves, it is the owner's: set out the options,
   recommend one, and do not pick for them.
2. **Test it.** The gate (section 5), a new check that goes red when the thing
   it guards is broken on purpose, and, for anything somebody sees, the walks at
   phone, pad and desktop sizes.
3. **Polish it.** Look at it rendered, at the sizes it was checked at, and fix
   what looks wrong before anybody is asked to look.
4. **The owner is aware before it is pushed.** Say exactly what would reach
   `main`: the commits, what they change, what passed, and what was **not**
   verified (Safari, a real phone, the signed-in live app). Then wait for a go.
   `main` is what churches run.

Outside contributors meet step 4 through the pull request, which the owner
merges and nobody else does. An AI tool works on a branch, opens a pull request,
and never pushes to `main` itself, whoever is driving it.

---

## 1. The app is two apps behind one door

`useIsLive()` decides which. Almost every route renders one of two trees:

```tsx
if (useIsLive()) return <LiveAppShell allow={...}>…</LiveAppShell>;
return <AppShell allow={...}>…</AppShell>;
```

| | Sample side | Live side |
|---|---|---|
| State | `lib/demo/store.tsx`, seeded from `lib/demo/seed.ts` | Supabase |
| Data access | the store | `lib/live/data.ts` only |
| Who is in it | a fictional church | a real one |
| Shell | `components/AppShell.tsx` | `components/LiveAppShell.tsx` |

**A change to one side is usually a bug on the other.** Somebody learns the app
on the sample side and then signs in; if a room is in one header and not the
other, they were taught a layout that does not exist. When you add a room, add
it to `railGroupsFor` in `RoomRails`: that one list is what the Menu tab draws
(`app/menu/page.tsx`) on both sides and at every width, so there is no second
list to forget. There is no row of room icons in either header any more.
`tests/live-header-fits.mjs` fails if the Menu stops drawing that list, and it
exists because, for several weeks, three rooms were reachable only on a screen
wider than 1280px.

---

## 2. The rules that outrank whatever you were asked for

Break one of these and the app becomes a different product. If a request seems
to need one of them broken, say so and stop.

**An Explorer never sees their own journey stage.** A stage is a note the church
keeps to organise its work, not a label to show a human being about themselves.
`getMyPairing()` does not select the column and its return type has no field for
one, so reaching for it fails to compile.

**Leaders get counts; Guides get the relationship.** No screen shows anybody a
conversation they are not in. Not a Director, not an Executive Director.

**Every room where one person can hurt another has three things**, on the same
screen as the harm:

1. a way for the person harmed to report it, findable without hunting and never
   next to Send;
2. somebody whose job it is to look, who is notified by name;
3. a record that outlives the person it describes.

Apply that test to any new room where people can reach each other, *before* it
ships. The Guild board went out with none of the three: no report route, no
leadership visibility, and nobody but the author able to delete a post, in a room
that includes Explorers, some of whom are children. See `supabase/migrations/20260831060000_a_way_out_of_the_guild_room.sql`
for what it took to fix, and `tests/a-way-out-of-the-guild-room.mjs` for the
shape of the check.

**The narrow door, not the open one.** Fixing that room did *not* mean handing
leadership the whole board. A group talking honestly is what the room is for.
Leadership sees a post when, and only when, somebody reports it. Prefer the
smallest new visibility that makes the harm actionable.

**A safeguarding record must not be deletable.** `reports` has no delete policy
at all, deliberately. When a report points at something a person can remove (a
post, a message, a file) copy the content into the report at the moment it is
reported. Otherwise the obvious move is to post, get reported, delete, and leave
the Director opening a report about nothing.

**A room is a folder; a subroom is a folder inside it.** A screen with more than
about four panels on it is a scroll, and a scroll is how somebody stops finding
the tool they came for. `components/Rooms.tsx` is the mechanism and it is
already written: `useRoom` remembers the subroom per role, `?room=` in the
address beats the memory so a link can still send somebody somewhere exact, a
third argument translates an old `#card` anchor to the folder that draws that
card, and the subrooms are ONE DROP-DOWN at every size
(`components/SubroomMenu.tsx`, asked for on 30 September 2026: people did not
know to swipe the strip it replaced). Closed, it names the subroom you are in,
says "2 of 4", and shows the count waiting in the others, which is what the
strip showed at a glance; the tabs on one person's page and the sample Admin
page use the same drop-down. Admin, the Office, the Library, Settings, the
Church, a Guide's home and an Explorer's journey all use it, on both the live
and the sample side. `tests/sub-rooms-are-a-drop-down.mjs` holds it.

Two rules when you add one. **A panel lives in exactly one subroom**: one that
appears in two is in neither, as far as the person hunting for it is concerned.
And **the first subroom is what the room is for**: `useRoom` opens it when there
is nothing remembered, so a Guide's Office opens on Lesson studies and a
Director's opens on the numbers. `tests/rooms-and-subrooms.mjs` holds both,
plus the rule that every link naming a subroom names one that exists, across
every room that has them. `tests/e2e/office-subrooms.js` walks them all in a
real browser at eight device sizes, and runs on WebKit in CI.

Two things must not move into a folder of their own. **An Explorer's report
control belongs on the same screen as the conversation it is about** (since 30
September 2026 the conversation lives in the Talk bubble on both halves, so
Report is in the bubble's header, in words, never beside Send), and **a
Guide sees the church's notices above the row rather than inside a folder** —
both were asked for in those terms and both are checked.

---

## 3. Authorisation lives in the database

The browser holds an anon key and nothing else. Every rule that matters is a
policy or a `security definer` function.

- **`permission denied for table X` is a GRANT failure, not RLS.** RLS returns
  zero rows; it does not raise. That error means the request arrived
  unauthenticated: the tables and functions here are granted to `authenticated`
  and never to `anon`. Chasing it as a policy bug wastes a day.
- **The pattern for anything privileged**: the real function in the `private`
  schema, `security definer`, doing its own authorisation check and raising
  `42501` when it fails; a thin `public` wrapper; `revoke` from `public, anon`;
  `grant execute` to `authenticated`. The table itself gets RLS enabled *and*
  every grant revoked, so the function is the only way in.
- **The column list is the access control.** `select('*')` in `lib/live/data.ts`
  is how a birthday ends up in an Explorer's browser with nothing between it and
  a screen but somebody remembering not to render it. Name the columns, and let
  the return type have no field for what you did not ask for.
- **Verify a claim about permissions against the live database**, inside
  `begin; … rollback;`, by setting `request.jwt.claims` and `role` to each
  identity in turn and recording the outcome. Collect the results into a temp
  table and insert them *after* switching back, or the insert itself is denied.
  Reasoning about a policy is not the same as running it.

---

## 4. Migrations

**Name new files with a timestamp, never `00NN_`.** The early files are
`0001_`…`0049_`; everything since is `YYYYMMDDHHMMSS_`. The test sorts filenames
lexicographically, and `0050_` sorts *before* `20260829…`, so a `00NN` file
added today would run before tables it depends on and fail on a fresh database
while passing on yours.

**Digits, then an underscore, and nothing else before it.** `supabase db push`,
the one command a church is told to use, silently skips any file not named
`<digits>_name.sql` (it prints one line and carries on). `0001a_` is the only
such file and is harmless only because later migrations rewrote what it did;
`tests/a-church-can-install-it-either-way.mjs` refuses a second one, and the
fresh-install workflow builds the database with psql AND with the CLI and fails
unless the two are identical.

**The version recorded in the database never matches the filename.** Migrations
applied through the Supabase tooling are stamped with the time they were
applied. Do not read the ledger and the directory as if they line up; check for
the objects instead.

**Never edit a migration that has been applied.** Editing the file changes
nothing in the database and quietly makes a fresh environment differ from
production. Add a corrective migration that re-creates the object. (Editing one
that failed on a syntax error and never ran is fine, because nothing has it yet.)

One narrow exception, used once and written down so it stays narrow: a guard
that lets a FRESH database get past an object a new project may not have, and
changes nothing where the object exists. `0032` revoked grants on
`rls_auto_enable()`, which the Supabase dashboard creates on some projects and
not others, so a new church's install stopped there; a corrective migration
could not help, because the install died inside the earlier file. The guard
(`if to_regprocedure(...) is not null`) runs the same revoke wherever the
function exists. Anything that would make a database end up DIFFERENT is not
this exception.

**A fresh install is proven, not assumed.** `scripts/fresh-install.sh` applies
every migration in order to an empty `supabase/postgres` database, checks the
protections in `supabase/tests/fresh-install-holds.sql`, and prints
`supabase/tests/fingerprint.sql`; with `--via-cli` it does the same through
`supabase db push`. CI runs both on every push and compares them
(`.github/workflows/fresh-install.yml`). Run the same fingerprint file against
the live project: every line should match. On 23 September 2026 they did, after
`20260923190000_live_matches_the_repository`.

**Name a backfill for where it ran, not when.** A migration applied live and
committed later must sort where it actually ran relative to the files around
it. Named by its ledger time, `pocket_owner_defaults_to_the_session` sorted
before the file that creates its table.

**Dry-run every migration before applying it**: run the body inside
`begin; … rollback;` against the real database. It costs one call and catches
the ambiguous column reference that a fresh pair of eyes will not.

---

## 5. `npm run verify` is the gate

It runs typecheck, build, and every check in `tests/`, and CI runs the whole
thing on Ubuntu, macOS **and** Windows. A green local run on Linux is not a
green build.

- **A rule that cannot fail is not a rule.** Before trusting a new check, break
  the thing it guards and watch it go red. Several checks here printed `OK` while
  covering nothing: one matched its own comment, one stopped its
  regex at the `>` inside `=>` and so never saw a single button, one walked
  files with a Unix `find` that returned nothing at all on Windows.
- **Match the thing, not a list of the things that existed when you wrote it.**
  The destructive-button rule held an allowlist of eight exact labels, so the
  ninth was never checked; its label extractor allowed only letters and spaces,
  so every confirm button that names a person was invisible to it, and those are
  the ones that actually carry out the removal. Word boundaries, not equality.
- **Assert behaviour, not shape.** A check that passes because it found a string
  somewhere is worse than none: it reports green and covers nothing.
- **Portability**: no `find`, no `grep`, no bare `npx` in a test. Walk the tree
  in Node, normalise paths to forward slashes, resolve binaries through
  `createRequire`.

---

## 6. It is used on a phone, and mostly not a new one

The desktop is the exception here, not the default. These are all real bugs that
shipped:

- **`dvh`, not `vh`.** They are identical on a desktop. On a phone `vh` is the
  layout viewport with the address bar hidden, so `max-h-[90vh]` is taller than
  the screen. Keep a `vh` line underneath for old browsers.
- **`env(safe-area-inset-bottom)`** is 0 on a desktop and about 34px on a phone.
  Anything pinned to the bottom needs it.
- **No characters from a symbol block.** Emoji have a guaranteed fallback font
  on every platform; Miscellaneous Technical and Geometric Shapes do not, and
  render as a blank box on Android while looking perfect on a Mac. Controls are
  drawn in `components/Glyph.tsx` as inline SVG. `tests/glyphs-render-everywhere.mjs`
  refuses the rest.
- **The bottom bar is the navigation, at every width.** **Menu | People | My
  Files** (`components/TabBar.tsx`, `lib/tab-bar.ts`), on a phone, a pad and a
  desktop alike, and Menu lists every room. There is no left rail; the right
  rail (the person's own desk) sits beside the page from `xl`, and below `xl`
  it is a drawer behind a small tab on the right edge
  (`components/DeskDrawer.tsx`, `tests/the-desk-is-a-drawer.mjs`). The bar is
  fixed, so it publishes its height as `--tab-bar`; anything else pinned to the
  bottom uses `.safe-bottom`, which stands it on top of the bar. On /talk, the
  one screen that is a conversation, it steps aside (`data-conversation-screen`).
  `tests/the-bottom-bar.mjs` and `tests/e2e/the-rooms-fit-a-phone.js` hold it.
- **The conversation lives in the Talk bubble**, on both halves and for both
  sides of a pairing: `components/talk/Dock.tsx` is the frame (bubble, sheet,
  the one header with Report in it, the list), filled by the live database in
  `components/live/TalkDock.tsx` and by the sample store in
  `components/DemoTalkDock.tsx`. Pages about one person carry **Message**,
  which opens the bubble at them (`lib/talk-open.ts`); a Guide's page opens on
  **Appointments**. `tests/appointments-first-the-chat-in-the-bubble.mjs`.
- **Every `<button>` is 56px tall** from `globals.css`. Padding cannot make one
  smaller; only `.tap-sm` (44px) can, and the `danger` variant is the only thing
  that uses it. That is the point: the most damaging control on a screen is never
  the most inviting one.
- **Nothing may scroll sideways.** Wide content scrolls inside its own box.

---

## 7. Two agents, one branch

`main` is production. Vercel builds Production only from `main`, so a feature
branch can never produce anything but a preview.

- **Fast-forward, never force.** The other agent's commits may be sitting on top
  of yours; `git pull --ff-only`, then continue. If a shared file has moved under
  you, read what changed before re-applying your edit.
- **If the other agent's guardrail fires on your change, it is probably right.**
  The header-drift check caught a missing room in the very next commit after it
  was written. Fix the change, not the test. If the test is genuinely wrong now,
  rewrite it to describe the new truth rather than deleting it.
- **Say what you did not verify.** This sandbox cannot reach the deployed site
  and has no browser session for the live app, so a screen that needs a signed-in
  database session has not been seen rendered. Pushing is not deploying: report
  "pushed, build not observed" rather than "live", every time.
- **Commit messages are the record.** Name the problem before the mechanism, and
  include what was tried and rejected. The next agent has no memory of this
  conversation; the message is all it gets.

---

## 8. Where things are

| Path | What lives there |
|---|---|
| `app/` | Routes, one folder per room. |
| `components/` | Everything visual. |
| `components/live/` | The signed-in screens: door, admin, guide, explorer, shared. |
| `components/talk/` | The chat bubble's frame, drawn by both halves (`Dock.tsx`), and the Message and Profile buttons. `lib/talk-open.ts` opens it from anywhere. |
| `components/SubroomMenu.tsx` | The one drop-down every set of sub-rooms and tabs uses. |
| `components/DeskDrawer.tsx` | The desk: a drawer below 1280px, the column beside the page above it. |
| `components/AnchoredPanel.tsx` | A panel hanging off a button that stays on the screen: the bell, the switchers. |
| `components/live/Face.tsx` | Members' photos, signed in one request and re-signed before they expire. |
| `lib/motion.ts` | The motion scale for code, and the three things CSS cannot do alone. The rest of motion is in `app/globals.css`; the rules are in `docs/VISUAL-LANGUAGE.md`. |
| `lib/live/data.ts` | **Every** live database call. Nothing else talks to Supabase. |
| `lib/live/session.tsx` | Who is signed in, and the rules for deciding they are not. |
| `lib/live/errors.ts` | `humanError()`. The one place a database error becomes a sentence. |
| `lib/demo/` | The sample church: store and seed. |
| `lib/types.ts` | Every shape in the app. |
| `lib/brand.ts` | Name and colours. |
| `supabase/migrations/` | The database, in order. |
| `supabase/functions/` | Edge functions, currently the invitation mailer. |
| `tests/`, `tests/e2e/` | The guardrails. `scripts/verify.mjs` lists them all. |
| `.claude/agents/`, `docs/agents/` | Three read-only research agents any AI tool can run: a **security reviewer** (first, always), a design researcher and a licence auditor. `docs/agents/README.md` says how to run them with any tool. |
| `.github/workflows/` | verify (three operating systems), keep-awake, backup, two WebKit probes. |

---

## 9. Signing out is not tabbing away

One class of bug is worth naming because it has come back twice. Supabase
rotates refresh tokens: if a second browser context spends the token first, the
first context's refresh returns 400. Clearing storage on that 400 destroys a
perfectly good session, and the person is signed out for switching tabs.

The rule is in `lib/live/session-verdict.ts` and it is deliberately not a regex
over the error message. Re-read storage before concluding anything, and only
then decide between *signed out*, *hold*, and *report*.
