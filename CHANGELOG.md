# Changelog

What changed for developers and for whoever runs a copy, newest first: the
migrations to run, the settings to set, and the rules that changed. What members
see is written for them in `lib/release-notes.ts` and shown in the app under
**What's new**; the full history is `git log`.

Each entry starts with what a church running a copy has to do, because that is
the part that goes wrong when nobody reads past the headline.

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
