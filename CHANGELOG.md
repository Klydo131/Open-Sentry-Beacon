# Changelog

What changed for developers and for whoever runs a copy, newest first: the
migrations to run, the settings to set, and the rules that changed. What members
see is written for them in `lib/release-notes.ts` and shown in the app under
**What's new**; the full history is `git log`.

Each entry starts with what a church running a copy has to do, because that is
the part that goes wrong when nobody reads past the headline.

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

### New: members can give toward keeping their hub running

A Hope Hub on Supabase's paid plan costs money every month, and that money has
to come from the church. The giving room gives a church one honest place to say
so, without the app ever handling a payment:

- **Every member** sees, on Home under Notices, the month's goal, how much
  has come in, what it is for, and how to give: the church's own GCash number,
  bank account or QR code. Never a gift, never a giver.
- **Directors** set it up and name the treasurers (Settings, **Giving**).
- **Treasurers** record each gift as it arrives in the church's own account,
  and only they see the list. A gift has no giver field at all.

For developers: `public.hub_giving`, `public.hub_treasurers` and
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
