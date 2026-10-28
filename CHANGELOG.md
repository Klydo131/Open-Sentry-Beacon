# Changelog

What changed for developers and for whoever runs a copy, newest first: the
migrations to run, the settings to set, and the rules that changed. What members
see is written for them in `lib/release-notes.ts` and shown in the app under
**What's new**; the full history is `git log`.

Each entry starts with what a church running a copy has to do, because that is
the part that goes wrong when nobody reads past the headline.

---

## 28 October 2026: the whiteboard works like the ones people know

### If you run a copy, do this

Nothing: no migration and no setting. Rebuild the site.

### What changed

- **Why:** the owner circled the room's own bar across the top of the board
  ("This is not the solution for replacing the '3 dots'") and asked for the
  ⋯ back on a selected thing, as in every whiteboard, and for the Study Room
  to feel like Notion, Obsidian and Notes.
- **The cause of the missing ⋯:** AFFiNE's bar for a selected thing
  (`affine-toolbar-widget`) asks the doc mode service whether the editor is a
  page or a whiteboard. AFFiNE's default answers "no mode", which it reads as
  "page", so on every selection the bar reset itself and stayed shut. The
  room drew its own bar instead of finding that.
  `lib/study/view-extensions.ts` now gives each editor a doc mode service that
  says its real mode (`studyViewExtensions(mode)`), as AFFiNE's app does.
- **The board now:**
  - AFFiNE's tools along the bottom, in Simple too;
  - AFFiNE's bar over a selected thing, with colour, Lock and ⋮: Frame,
    Group, Bring to Front / Forward, Send Backward / to Back, Copy,
    Duplicate, Create linked doc, Delete;
  - from the room (`components/study/StudyBoardTools.tsx`): Undo and Redo
    in the top-left corner, for touch screens; a right-click or a long press
    on a thing opens AFFiNE's ⋮ menu; on empty board, Undo, Redo, Select
    everything and Show everything.
  - The room's own bar of pictures and words is gone, and with it the room's
    colour, copy, ordering and delete code in `lib/study/board-actions.ts`.
- **The page's writing is locked on the board.** AFFiNE's Delete removes the
  page's writing with its card (tried: the page came back empty). The room
  locks that card when the board opens, outside the undo history, so it
  cannot be moved or deleted until somebody chooses Unlock.
- **Fixed on the way: Undo could take a new page apart.** The undo history
  (started 27 October) was running when a new page's skeleton was made, so
  pressing Undo enough times removed the page's writing, its canvas and its
  root ("Cannot read properties of undefined (reading 'children')"). The
  skeleton, and the canvas added to older pages, are now made outside the
  history.
- **A long press opens its menu when the finger lifts**, not at 600 ms:
  opened while the finger was down, the lift reached AFFiNE as a tap and shut
  the menu.
- **Proved:** `tests/e2e/the-whiteboard-says-what-you-can-do.js`, rewritten,
  24 checks. It covers, at desktop and phone size:
  - the bar floating at the shape and the ⋮ choices;
  - Duplicate, Delete and Undo;
  - right-click and long press;
  - Lock;
  - the locked page writing, and Undo all the way back.

  Each of the three fixes was undone on purpose and its check went red:
  - without the doc mode service, no bar;
  - without the lock, an unlocked card;
  - without the history-free skeleton, the page's writing gone and the
    'children' error.

  Every other Study Room walk passes (12).

## 27 October 2026: a photo is checked on the server too, and remade in Rust

### If you run a copy, do this

1. **Run the new migration**, `20261027170000_a_photo_is_checked_on_the_server.sql`.
   On its own it changes nothing.
2. **To switch the check on**: deploy the function
   (`npx supabase functions deploy photo-check`) and give the database its
   address (`docs/START-HERE.md`, Step 6b). The Postgres edition does both by
   itself when it starts.

### What changed

- **Why:** the app takes a photo's location out in the browser, and a modified
  app or a direct call to the file store skipped that. The privacy page's
  promise now holds for those too.
- **How:** a trigger on `storage.objects` queues one request to `photo-check`
  when a JPEG, PNG or WebP arrives in `pairing-media` or `post-media`, or is
  replaced with new bytes. Report evidence (`reports/`) is left as raised. The
  function reads the file with the browser's own reader
  (`supabase/functions/_shared/photo-location.ts`, a byte-for-byte copy of
  `lib/live/photo-location.ts` that a test keeps the same).
  - A JPEG that says where it was taken is **remade from its pixels in
    Rust**: `tools/photo-remake`, compiled to WebAssembly and carried as text
    in `supabase/functions/_shared/photo-remake-wasm.ts` with its SHA-256.
    The photo is shrunk to the browser's 1600 pixels, turned the way the camera
    was held and encoded again at quality 82. No metadata survives, and no
    bytes hidden after the end of the picture. If the remaker cannot read it,
    the EXIF, XMP and IPTC blocks are cut out instead, the picture untouched.
  - **Measured** in Node 22 on a 2.1 GHz Xeon (Deno runs WebAssembly on the
    same engine): a 12-megapixel photo takes 0.5 s of CPU time and 63 MB of
    WebAssembly memory, against a Supabase function's 2 s and 256 MB.
  - A PNG or WebP loses its metadata chunks.
  - A located JPEG it cannot read is removed.
  - The cleaned file is checked once more and comes back clean, so the
    check does not loop.
- **Limits, said plainly:**
  - the check runs a moment after the file arrives;
  - HEIC is not covered;
  - nothing happens until the address is set.
- **Proved:**
  - `supabase/tests/a-photo-is-checked-on-the-server.sql`: 8 checks on both
    editions of when the database asks. It was seen red when evidence was not
    skipped.
  - `tests/a-photo-is-checked-on-the-server.mjs`: 27 checks running the
    function itself against a stand-in file store, with photos built byte by
    byte. It was seen red when JPEGs were not cleaned.
  - End to end on the Postgres edition: an invented member uploaded a located
    profile picture straight to the file store, and within seconds the stored
    file and what they read back were clean.
  - `tests/a-photo-is-remade-in-rust.mjs`: 13 checks on the committed
    WebAssembly. A real photo comes back upright and clean. Hidden trailing
    bytes do not survive. It imports nothing. Its checksum holds: one changed
    character fails it. The Rust's own tests: `cargo test` in
    `tools/photo-remake`, 5 checks.
  - Not yet run on a hosted Supabase project.

## 27 October 2026: trends, in counts that name nobody

### If you run a copy, do this

1. **Run the new migration**, `20261027160000_trends_in_counts_only.sql`. It
   adds a `trends` schema, the view `trends.weekly` and a role,
   `beacon_trends`, that can read only that view and cannot sign in.
2. **Only if you want the trends:** give the role a password and run
   `tools/trends/trends.py` on your own computer (`tools/trends/README.md`).
   Nothing else changes until you do.

### What changed

- **`trends.weekly`**: for each church and each week (Monday, UTC), the people
  who joined, pairs started, pairs who talked, messages, lessons finished and
  read, prayer requests, meetings, and reports raised and closed. Every week is
  listed, so a quiet week reads 0. **Any number from 1 to 4 is null** and shows
  as "fewer than 5", because in a small church a small number can name
  somebody. The view carries no name, message or person's id. It is a security
  barrier, so a reader's own conditions cannot run before the counting.
- **`beacon_trends`** reads the view and nothing else. It is not one of the
  roles the data API switches to, and `trends` is not a schema the API
  publishes. It is made without a login.
- **`tools/trends/`**: a Python program (psycopg 3.3.6, matplotlib 3.11.2) that
  writes a CSV, a summary (ranges where a week is hidden; a trend that
  describes the past and is not a forecast) and charts. It runs on your
  computer because Supabase cannot run Python in the database or its
  functions. `--demo` tries it with invented numbers.
- **Proved** by `supabase/tests/trends-are-counts-only.sql` on every fresh
  install: 17 checks with invented people. Two breaks were each seen to fail
  it: giving the role a table, and letting 3 and 4 show.
  `tests/trends-are-counts-only.mjs` (17 checks) holds the parts a database
  cannot see: no password in any file, nothing the program writes kept in
  git.

## 27 October 2026: one rule per action, and the links the screens use indexed

### If you run a copy, do this

1. **Run the new migration**, `20261027150000_one_rule_per_action.sql`
   (`npx supabase db push`, or the edition's installer). The site needs no
   rebuild first: nothing the app calls changes.

### What changed

- **One rule per action.** Supabase's advisor warned that `profiles` had three
  read rules and two change rules for signed-in people, and `profile_changes`
  three read rules. Postgres runs every one of them for every row. Each set is
  now one rule whose condition is the old ones joined by OR, which is exactly
  how Postgres combined them, so nobody can see or change anything they could
  not before. That was checked person by person on the Postgres edition: 67
  invented people, the same profiles and changes visible and the same profiles
  changeable before and after, and a deliberately broken version showed 16
  people seeing differently. The person's own row is the first arm of the
  profile read rule, which keeps "insert and read it back" working.
- **New rule:** `supabase/tests/fresh-install-holds.sql` (check 9) refuses a
  second permissive rule for the same table, role and action in `public` or
  `private`. Write a new condition as another OR arm. Storage is left out on
  purpose: each file rule names its own bucket.
- **Nine indexes** on the links Admin Reports' three lists use (who raised a
  report, who it is about, who holds it), on a reply's link to the message it
  answers, and on the columns Postgres scans when an account is deleted.
- **"Open a case" is now "Raise a report"** on the leaders' library record. It
  always raised an ordinary report. The function keeps its name
  (`open_case_from_activity`) so older copies of the app keep working; two of
  its messages now say "report".

---

## 27 October 2026: Admin Reports is reports and a conversation; the court room is closed

### If you run a copy, do this

1. **Let the site rebuild first, then run the two new migrations**
   (`npx supabase db push`, or the edition's installer):
   `20261027120000_the_court_room_is_closed.sql` and
   `20261027130000_a_report_is_one_conversation.sql`. In that order of steps
   nothing breaks: the new site works on the old database (without the new
   conversation rules until they arrive), while the old site's court screens
   would fail on the new database.
2. **If your copy held court cases, they are kept.** The first migration drops
   the court room's tables only when they are empty. Otherwise it moves them,
   data and all, into a schema called `court_archive` that no app role can
   reach, and leaves exhibit files in their bucket with no rule that opens
   them. What to keep is your church's decision.
3. **Delete the `door-code` function** if you deployed it
   (`npx supabase functions delete door-code`). Keep `BREVO_API_KEY` and
   `BREVO_SENDER`; the invitations use them.
4. **Delete the empty `court-exhibits` bucket** in the dashboard (**Storage**).
   Supabase refuses a bucket delete made in SQL, so the migration leaves it, empty
   and with no rule that lets anybody in, and says so in a notice.
5. **Postgres edition:** rebuild the images; the migrations run on start.
6. Run `supabase/tests/ready-for-real-members.sql`: line 5 now reads READY
   when nothing of the court room is left running.

### Why

Asked for: "Admin reports will just be admin reports by now, not a court room.
I think it will complicate more things if we do online court rooms in this
application. It will be just faster if Admins can see reports, see the problems
and reports and be transparent to both Guide and Explorer users by chatting them
as Admins, no more trial online." Asked how, the owner chose one shared
conversation per report, and that the person a report is about joins only when
the Director holding it brings them in, having read it.

### What changed

- **The court room is gone**: trials, the door and its e-mail codes, exhibits,
  leave to answer and its every-minute sweep, the judge draw, the live room and
  the Church Board's ruling. Its code is in git history, last at `82cf18f`.
- **What leaned on it was rewritten, not left broken**: the check before every
  request refuses a suspended account everything again; library sharing no
  longer pauses for an open case (a Director can still switch it off for a
  pair); the church overview drops "Cases open".
- **One conversation per report** (`components/LiveAdminReports.tsx`, at
  Settings, Admin Reports and at `/cases`): the person who raised it and the
  Director holding it write; every leader who may handle it reads; the person
  it is about reads and answers only once brought in, and then reads all of it.
  Both sides are told, with no name in the notification.
- **The report form's promise changed** to match: the person is not told when
  it is sent; a Director reads it first and may bring them in; the person
  reporting is told if so; evidence is never shown to them. **A report filed
  before this migration can never be opened to the person it is about**: it was
  filed under "they are not told", and `subject_may_join` is false on every
  existing row.
- **Suspend or remove** (`components/LiveSuspendOrRemove.tsx`) is what is left
  of the trial room, under Admin, Safeguarding.

### Two older gaps, closed on the way

- **Evidence opened to every leader of the church**, including the Director a
  report was about, and every Director on a report meant for Executive
  Directors only. `report_files_read` and the stored-file rule now follow the
  report's own two rules.
- **Any leader who could handle a report could rewrite it** through the data
  API, every column, including what the person reporting wrote. Nothing in the
  app wrote to the table; the update rule is dropped and insert, update and
  delete are revoked. Every change goes through a checked function.

### Proof

- `supabase/tests/a-report-is-one-conversation.sql`: 88 checks as invented
  people, including every report check that lived in the court room's
  `leave-to-answer-holds.sql`; each new protection was broken on purpose and
  went red.
- `tests/a-report-is-one-conversation.mjs` (replacing
  `a-report-is-answered-by-one-person.mjs`) and
  `tests/a-report-is-reachable-by-whoever-is-in-it.mjs`.
- `supabase/tests/fresh-install-holds.sql` now checks nothing of the court room
  is left.

---

## 27 October 2026: a simpler Study Room, and a whiteboard that says what you can do

### If you run a copy, do this

1. **Let the site rebuild.** Nothing in the database changes for this entry.

### What was reported

With two photographs: "if I right click on it there are no option for me to
delete objects, options to modify, or edit it", and, of a page, "I will get
bombarded with so many options ... the 'no folder' and 'add tag' boxes is not
helping the user to understand it's uses." The room has to work for "a 5 year
old, a professional, and a 75 year old" without them discovering anything.

AFFiNE's own bar for a selected thing (`affine-toolbar-widget`) is in the room
but draws nothing here, and its canvas has no right-click menu, so the only
ways to delete were the Delete key and the eraser, and nothing said either.

### The whiteboard

- **One bar at the top of the board, in words.** Nothing selected: Select, Pen,
  Shape, Sticky note, Words, Arrow, Eraser, then Undo, Redo and Show all.
  Something selected: what it is ("This shape:") and what can be done to it:
  Write on it, Colour, Copy, To front, To back, Delete, Done.
- **The same choices on a right-click, and on a long press with a finger.** A
  right-click on empty board offers Undo, Redo, Select everything and Show
  everything.
- **A delete says so, with Undo beside it**, for six seconds.
- **The page's own writing cannot be deleted from the board.** It is the same
  writing as the page (one AFFiNE note shown in both), so deleting it on the
  board would take the writing off the page too. The Delete key and the eraser
  are AFFiNE's own and are not changed.
- **Every page can be a whiteboard, in Simple too**, with one bar: AFFiNE's own
  bar of pictures along the bottom is shown only in Advanced, so Simple never
  offers the same tools twice. On a narrow board in Advanced, AFFiNE's zoom
  control steps aside (it ran into that bar on a phone); two fingers zoom.
- **The More cards say all of what they make**, on as many lines as it takes,
  instead of "Somethin..." cut off after one line.
- The bar's buttons do not take the keyboard from the canvas, so AFFiNE's own
  keys (S, P, Delete, Ctrl+Z) still answer after a click on the bar.
- Code: `components/study/StudyBoardTools.tsx` draws; every action is AFFiNE's
  own, named in `lib/study/board-actions.ts`, which loads only with the
  whiteboard. Proof: `tests/e2e/the-whiteboard-says-what-you-can-do.js`.

### Undo did nothing in the Study Room, and now works

Found while testing the whiteboard's own Undo. The room loaded each page's doc
but never its store (`store.load()`), and that call is where BlockSuite tells
the store's extensions they are live. So the undo history never listened to
itself, `canUndo` stayed false, and AFFiNE runs Ctrl+Z only when `canUndo` is
true. Ctrl+Z did nothing on any page or board, since the room was built. No
walk pressed it. `components/study/StudyRoomEditor.tsx` now starts the store's
undo history itself (`store.history.loaded()`), and
`tests/e2e/the-affine-features-actually-work.js` presses Ctrl+Z on a page and
on a board (both checks failed on the old build first).

Not `store.load()`, which was tried first: it also announces "root added", and
AFFiNE's page block answers that by copying its own (empty) title over the
page's name, so a page could lose its name just by being opened.
`tests/e2e/the-room-goes-in-and-out-of-obsidian.js` caught it.

### The page

- **The insert bar has four things**, each a picture and a word: Heading, List,
  To-do, Quote. **More** opens everything else as cards that show what each one
  makes, including a picture from the phone and today's date.
- **Folder and tags are behind one button, File this page**, which says where
  the page is filed ("Not filed yet", "In Romans study · 2 tags") and, when
  pressed, what a folder and a tag are for, with an example each.
- Code: `components/study/StudyInsertBar.tsx`, `components/study/StudyFiling.tsx`.
  Guide: `docs/STUDY-ROOM.md`.

---

## 27 October 2026: a forgotten password has its own pages, and security in layers

### If you run a copy, do this

1. **Let the site rebuild.** Nothing in the database changes for this entry.
2. **Re-paste the recovery e-mail template**: `docs/email-templates/recovery.html`
   into Supabase, **Authentication → Email Templates → Reset Password**. Its
   button now opens `/new-password`. Until you do, the old link still works:
   `/join` hands any reset link to the new page.
3. **Add `https://your-address/new-password` to Redirect URLs** (Supabase,
   Authentication, URL Configuration), unless you already allow
   `https://your-address/**`.
4. **Redeploy the `invite` function** when convenient
   (`npx supabase functions deploy invite`): for an account that already
   existed, its link now opens `/new-password` directly.
5. **In Supabase, Authentication:** turn on **Prevent use of leaked passwords**
   (Pro plan) and set the **minimum password length to 10**, to match the app.
6. **Postgres edition:** rebuild the images as usual; its mailer now sends
   password links to `/new-password`.

### A forgotten password has its own pages

Asked for: "for making new password, it should be a separate web page, not in
the log in page so that users will not be confused why it was used in the log
in page." Until now **Forgot your password?** sent the e-mail straight from the
sign-in page, and the link opened the *invitation* page, which told somebody
who had only forgotten a password "This is the address your invitation was
sent to."

- `/forgot-password`: type your address, get a link. The answer is the same
  whether or not the address has an account.
- `/new-password`: the link opens here. It names the account, asks for the new
  password twice, and says it is done. It asks before replacing whoever is
  already signed in on the device, takes the link out of the address bar, and
  signs out every other device afterwards.
- The sign-in page only links to them, carrying the address already typed.
- Code: `components/live/PasswordPages.tsx`, `lib/live/password.ts`, and the
  rules in `lib/password-rules.ts`. Proof: `tests/a-new-password-has-its-own-page.mjs`.

### What a person could do that ended in an error, and now does not

Found by reading every screen that sets a password, then walking each one in a
browser against the Postgres edition:

- **A member with an authenticator app who reset a forgotten password** was
  refused with "AAL2 session is required to update password" and could go no
  further. The page now asks for the code, then saves the password.
- **A password over 72 bytes** (bcrypt's limit) was refused by the service
  with no warning; every screen now says so first.
- **The old password typed again** read "New password should be different from
  the old password." It now says that in plain words.
- **Asking for a second link within the minute** printed "For security
  purposes, you can only request this after 60 seconds", and the invitation
  page's "send me a new link" swallowed that refusal and promised an e-mail
  that was not coming. Both now say how long to wait.
- **A project with Supabase's "secure password change" on**: Settings,
  Password now e-mails the confirmation code and asks for it, instead of
  failing with "Password update requires reauthentication".
- Every refusal from the sign-in service is translated by its `code` in
  `lib/live/errors.ts` (`humanError`), with the wording as a fallback.
- One set of rules for every page that sets a password: at least 10
  characters, at most 72 bytes, not the e-mail address, not the app's name,
  not a row of the keyboard.

### Security, in layers

[docs/SECURITY-LAYERS.md](docs/SECURITY-LAYERS.md) puts the app's security in
eight layers, each with what it stops, where it lives, the check that proves
it, how to keep it current, and how to make it stronger in your own copy; then
a routine (weekly, monthly, quarterly, yearly), a procedure for when an
advisory lands, and the questions to answer when adding a table, a function, a
page, a dependency or an optional feature. `tests/the-security-layers-hold.mjs`
fails the build if the map names a file that does not exist or a check that
does not run. New with it:

- **An advisory gate.** `scripts/audit-gate.mjs` runs every week and on every
  lockfile change (`.github/workflows/audit.yml`). It fails on any advisory of
  moderate severity or worse that is not in `security/accepted-advisories.json`
  with a reason and a review date at most six months away, and on any
  acceptance past its date. It installs nothing.
- **Dependabot** now watches the Postgres edition's server packages and its
  Docker image too.
- **The edge**: `object-src 'none'`, `Cross-Origin-Opener-Policy: same-origin`
  and `X-Permitted-Cross-Domain-Policies: none`.
- **`/.well-known/security.txt`** (RFC 9116) says where to report a problem. A
  church running its own copy adds its own `Contact:` line first.

---

## 26 October 2026: the October security releases, tables opened by name, and giving

### If you run a copy, do this

1. **Update, then run the new migrations**, the same way as every update
   (`npx supabase db push`, [START-HERE.md](docs/START-HERE.md) Part 3, Step 3; the
   Postgres edition installs them itself when it starts):
   - `20261026120000_a_hub_is_kept_running_by_gifts.sql`, the giving room.
   - `20261026180000_every_table_says_who_may_reach_it.sql`, every table's
     access granted by name. **A Supabase project created on or after 30
     October 2026 needs this one**, or every screen answers "permission
     denied". On an older project it changes nothing a member can do, and
     takes away four table privileges nobody signed in should have had.
   - `20261026200000_giving_is_a_choice.sql`, which keeps giving switched off
     until you choose it (below).
2. **Let the site rebuild** (a push to `main`, or Sync fork on GitHub). The
   rebuild carries React 19.0.9 and the other patched packages below. On
   Vercel, a deployment made after 21 October 2026 also runs on Vercel's
   patched Node.
3. **Postgres edition only:** rebuild the images, `docker compose --profile app
   --profile https up -d --build` ([POSTGRES.md](docs/POSTGRES.md),
   "Updates"). They are now built on Node 22.23.4, pinned by digest.
4. **In Supabase, Authentication:** set the email code and link lifetime to one
   hour or less. The security advisor reports it as `auth_otp_long_expiry`.

### What was patched

In the week of 14 to 21 October 2026 Node.js, Next.js, React and PHP all shipped
emergency security releases. The full table, with what each fix was for, is in
[SECURITY.md, "October 2026"](docs/SECURITY.md#october-2026-what-was-patched-and-what-was-not).
In short:

- **Already safe:** Next.js 15.5.28 and sharp 0.35.5, which carry the fix for
  remote code execution through the image optimiser.
- **Updated:** React and React DOM 19.0.0 to 19.0.9; DOMPurify to 3.4.17 in
  every copy in the tree; fast-uri, postcss-selector-parser and vite through
  `overrides` in `package.json`; nodemailer to 10.1.7 in the Postgres edition;
  the edition's Docker images to Node 22.23.4; CI to the newest Node 22
  (`check-latest: true`) wherever it asks for 22.
- **Not affected:** PHP's "PHP2Shell" flaws (there is no PHP in this project),
  and the keyv, cacheable, @subql/common and tensorlake package compromises
  (none is in the dependency tree).
- **Known and accepted:** zod and KaTeX inside the Study Room's editor
  (`@blocksuite/*` 0.22.4). Their fixes need an editor release that does not
  exist yet. `npm audit` reports them as 70 high and 6 low findings from those
  two causes; SECURITY.md says why they run only in the reader's own browser.
- **Coming:** Next.js 15 reached the end of its support on 21 October 2026.
  15.5.28 has every fix so far; moving to Next.js 16 is planned work, not part
  of this update.

`tests/the-october-2026-patches-hold.mjs` fails the build if any of these
versions goes backwards, through a revert, a rebase or an old lockfile.

### A new rule for developers: open every new table by name

From 30 October 2026 Supabase creates every new table **closed** to the data
API. Hope Beacon's tables had always been opened by the old default and never by
name, which is why a church creating its project after that date would have got
an app that refused everything. Now:

- A migration that creates a table in `public` grants it to `authenticated`
  **by name**, with only the privileges the app uses, or closes it by name:

  ```sql
  create table public.my_things ( ... );
  alter table public.my_things enable row level security;
  grant select, insert, update, delete on public.my_things to authenticated;
  -- or, for a table reached only through functions:
  revoke all on public.my_things from authenticated, anon;
  ```

- Never `grant all` to `authenticated` or `anon`, and never hand out
  `truncate`, `trigger`, `references` or `maintain`.
- `tests/every-table-says-who-may-reach-it.mjs` fails the build for a table left
  to a default, and the fresh install in CI (`scripts/fresh-install.sh`) now
  builds with Supabase's new default, so a missing grant shows up as a failed
  install, not as a church's bug report.

The rule is also in [AGENTS.md](AGENTS.md) and
[CONTRIBUTING.md](CONTRIBUTING.md), and the pull request template asks about it.

### Taking a dependency update after the npm worms

The Shai-Hulud and CHAINDROP worms spread through freshly published releases of
well-known packages. Before taking an update: check who published it and when
(`npm view <pkg>@<version> time maintainers`), prefer a release that has been
out a few days unless it is the security fix you came for, install with
`npm install --ignore-scripts`, and read the `package-lock.json` diff. An update
that adds packages you did not ask for is a question to answer before you
commit it. This update changed six versions in `package-lock.json` and added
no package.

### New, and optional: members can give toward keeping their hub running

A Hope Hub on Supabase's paid plan costs money every month, and that money has
to come from the church. The giving room gives a church one honest place to say
so, without the app ever handling a payment.

**It is off until a project switches it on**, so a church that pays another way,
or a developer building their own Hope Beacon, never sees it. To switch it on,
run the third migration below, then in the SQL editor:

```sql
insert into public.app_settings (key, value) values ('HUB_GIVING', 'on')
on conflict (key) do update set value = excluded.value, updated_at = now();
```

Delete the row to switch it off; what was set up and recorded is kept. With
it on:

- **Every member** sees, on Home under Notices, the month's goal, how much
  has come in, what it is for, and how to give: the church's own GCash number,
  bank account or QR code. Never a gift, never a giver.
- **Directors** set it up and name the treasurers (Settings, **Giving**).
- **Treasurers** record each gift as it arrives in the church's own account,
  and only they see the list. A gift has no giver field at all.

For developers: the switch is `private.hub_giving_on()`. While it is off,
`private.hub_my_church()` answers nobody, so every giving function refuses, and
`hub_giving_card()` returns `{"enabled": false}`, which the screens treat as no
giving at all. The sample church shows no giving card, because it is the app
as it comes. `public.hub_giving`, `public.hub_treasurers` and
`public.hub_gifts` are locked tables (row-level security on, no policies,
every privilege revoked), reached only through the `hub_*` functions in
`20261026120000_a_hub_is_kept_running_by_gifts.sql`, which decide who may do
what. The month is counted in Asia/Manila time. Screens:
`components/live/HubGiving.tsx`, calls: `lib/live/giving.ts`, proof:
`supabase/tests/a-hub-is-kept-running-by-gifts.sql`. For a church:
[HANDBOOK.md](docs/HANDBOOK.md), "Keep our Hope Hub running", and
[HOW-TO-USE.md](docs/HOW-TO-USE.md), "Giving toward the app".

---

## 21 October 2026: the court room's door can take a code sent by email

Some leaders could not get an authenticator app to work, which left the court
room shut. A project can now choose a code sent by email instead. It is a
choice each church makes; without it nothing changes.

### If you want it

1. Run `20261021100000_the_court_room_door_by_email.sql` (the next
   `npx supabase db push` does).
2. Deploy the function: `npx supabase functions deploy door-code`.
3. Make sure `BREVO_API_KEY` and `BREVO_SENDER` are set, as Edge Function
   secrets or in `app_settings`: the same two the invitations use
   ([EMAIL.md](docs/EMAIL.md)). Without them the door says it cannot send a
   code, and makes none.
4. Switch it on with the one `app_settings` row in
   [COURT-ROOM.md, "Choosing email for the door"](docs/COURT-ROOM.md#choosing-email-for-the-door).
   Delete the row to go back to authenticator apps.

**What email gives up:** whoever can read a leader's email can also reset their
password from it, so the door is then as safe as each leader's email account.
COURT-ROOM.md says when that is the right trade.

For developers: a code is made only for the leader's own live sign-in session,
stored as a salted hash, good for ten minutes and five tries, and used once.
The pass ends when that session does. The function refuses a suspended
account. Proofs: `supabase/tests/the-court-room-door-by-email.sql` and
`tests/the-court-room-door-by-email.mjs`.

---

## Before 21 October 2026

See `git log`, and the release notes in `lib/release-notes.ts`.
