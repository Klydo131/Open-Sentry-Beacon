# Hope Beacon's security, in layers

**For the developers who keep Hope Beacon, and for anybody building their own
from it.** [SECURITY.md](SECURITY.md) explains each practice with samples. This
guide puts them in order: eight layers, from the packages the app is built
from to the people who run it, each saying what it stops, where it lives in
the code, which check proves it, and how to keep it current.

The rule behind the order is **defence in depth**: no layer is trusted to
hold on its own, and each one is built as though the layer outside it has
already failed. A hidden button is not what keeps a Guide out of another
Guide's conversation; the database is, and it would still be if the screen
were rewritten by somebody who had never read this. A stolen password is not
enough to read a leader's members, because the database also wants the
authenticator code. When a layer fails, the next one is the one that matters.

`tests/the-security-layers-hold.mjs` reads this file: every path named in
it must exist, and every check named as proof must be one the build runs. A
map that stops matching the code fails the build instead of quietly going out
of date.

---

## The eight layers at a glance

| | Layer | It stops | The check that proves it |
|---|---|---|---|
| 1 | **What it is built from** | A poisoned or outdated package, a hijacked build | `scripts/audit-gate.mjs`, `tests/the-october-2026-patches-hold.mjs`, `tests/workflows.mjs` |
| 2 | **The edge** | A page framed, scripted or downgraded by somebody else | `tests/the-protections-hold.mjs`, `tests/security-invariants.mjs` |
| 3 | **Who is signing in** | A guessed, stolen or reused password; a session that outlives its welcome | `tests/accounts-and-sessions.mjs`, `tests/a-new-password-has-its-own-page.mjs`, `supabase/tests/a-second-step-is-required.sql` |
| 4 | **What they may do** | A signed-in person reaching past their own place | `tests/every-table-says-who-may-reach-it.mjs`, `tests/nobody-promotes-themselves.mjs`, `supabase/tests/fresh-install-holds.sql` |
| 5 | **What is kept, and how** | A secret in the browser, a file anybody can open, data kept longer than needed | `tests/no-secrets.js`, `tests/photos-lose-their-location.mjs`, `supabase/tests/what-is-deleted-leaves-no-file-behind.sql` |
| 6 | **What a person sees** | Somebody's words run as code; a database error read out to a member | `tests/linkify.mjs`, `tests/errors-are-human.mjs`, `tests/translations-say-only-what-english-says.mjs` |
| 7 | **Knowing, and acting** | A problem nobody notices, and a problem nobody knows how to handle | `tests/a-record-that-outlives-the-people-in-it.mjs`, `tests/a-report-is-one-conversation.mjs` |
| 8 | **The people who run it** | A setting no code can change left at its default; a tool given more than it needs | `tests/the-research-agents-only-read.mjs`, `tests/data-protection.mjs` |

---

## Layer 1: what it is built from

**It stops** a package that turns malicious in a new release (the Shai-Hulud
and CHAINDROP worms of 2025 and 2026), a known flaw left in place because
nobody was told, and a build pipeline taken over through a pull request.

**Where it lives**
- `package-lock.json` and `selfhost/server/package-lock.json`: exact versions,
  installed with `npm ci`.
- `package.json` `overrides`: a patched version forced on a package nested
  inside another (DOMPurify, fast-uri, postcss-selector-parser, vite).
- `.github/dependabot.yml`: update pull requests every week for the app, the
  Postgres edition's server and its Docker image, and the CI actions.
- `security/accepted-advisories.json`: each advisory the project has chosen to
  live with, by id, with the reason and the date to look at it again.
- `.github/workflows/audit.yml`: runs `scripts/audit-gate.mjs` every week and
  on every lockfile change.
- `selfhost/app.Dockerfile` and `selfhost/server/Dockerfile`: the Node image
  pinned by digest, not by a tag that can move.
- `.github/workflows/`: every action pinned to a full commit, read-only
  tokens, never `pull_request_target`.

**What proves it**: `scripts/audit-gate.mjs` (in CI), `tests/the-october-2026-patches-hold.mjs`,
`tests/workflows.mjs`, `tests/the-lockfile-can-install.mjs`.

**Keeping it current**
- Read each Dependabot pull request before merging it: who published the new
  version and when (`npm view <pkg>@<version> time maintainers`), and what the
  lockfile diff adds. Packages nobody asked for are a question, not a detail.
- When the audit workflow fails, either update the package or add an entry to
  the register with a reason a reviewer can check. An acceptance lasts at most
  six months; the gate fails when its date passes.
- When a security release lands (see "When an advisory lands" below), add its
  version floor to a "patches hold" test so it cannot quietly go backwards.

**Stronger in your copy**: turn on GitHub's Dependabot security updates and
secret scanning with push protection; require review from code owners for
`package.json`, lockfiles and `.github/`.

---

## Layer 2: the edge

**It stops** another site framing the app to trick a click (clickjacking), a
script from anywhere but this app running in it, a first visit over plain
HTTP being answered by somebody on the same network, and another window
reaching into this one through `window.opener`.

**Where it lives**
- `next.config.mjs`: the Content-Security-Policy (`default-src 'self'`,
  `object-src 'none'`, `frame-ancestors 'none'`, `base-uri` and `form-action`
  'self'), Strict-Transport-Security for two years, `X-Frame-Options: DENY`,
  `nosniff`, a tight Referrer-Policy, a Permissions-Policy with the camera
  and location off, `Cross-Origin-Opener-Policy: same-origin`, and
  `X-Permitted-Cross-Domain-Policies: none`.
- `public/.well-known/security.txt`: where to report a problem (RFC 9116).
- The search-engine switch (`BEACON_PUBLIC_SITE`): a church's copy is not
  indexed unless it says so.

**What proves it**: `tests/the-protections-hold.mjs`, `tests/security-invariants.mjs`,
`tests/backend-csp.mjs`.

**Keeping it current**: renew the `Expires` line of `security.txt` before it
passes (the build fails once it has). When a feature needs a new origin (a
video player, a map), add exactly that origin to exactly one directive, and
say why in the comment above it.

**Stronger in your copy**: put the site behind your host's firewall rules and
bot protection; on Vercel, turn on Attack Challenge Mode during an attack.

---

## Layer 3: who is signing in

**It stops** a guessed or reused password, a stolen one, an invitation link
used by the wrong person, and a session that lives on after its owner has
been suspended or has changed their password.

**Where it lives**
- Invitation only: sign-up is closed and accounts are made by the
  invitation function (`supabase/functions/invite`).
- `lib/password-rules.ts`: one set of rules for every page that sets a
  password: at least 10 characters, at most 72 bytes, not the e-mail address,
  not the app's name, not a row of the keyboard. The sign-in service checks
  again.
- `components/live/PasswordPages.tsx`: a forgotten password on pages of its
  own, `/forgot-password` and `/new-password`. The link is redeemed in the
  browser, where a mail scanner cannot spend it; the page asks before
  replacing whoever is signed in; an account with an authenticator app gives
  its code first; every other device is signed out after.
- `lib/live/two-step.ts`: two-step sign-in with an authenticator app, which
  the database itself requires once set up
  (`supabase/tests/a-second-step-is-required.sql`).
- `app/api/auth/sign-in/route.ts`: sign-in through the server, which says
  "too many attempts" in words when the service slows it down.

**What proves it**: `tests/accounts-and-sessions.mjs`, `tests/a-new-password-has-its-own-page.mjs`,
`tests/an-ended-session-ends-at-once.mjs`, `tests/signing-out-ends-the-session.mjs`,
`tests/a-suspension-is-immediate.mjs`, `supabase/tests/a-second-step-is-required.sql`.

**Keeping it current**: the settings below, checked once a quarter, because
they live in the Supabase dashboard where no test can see them.

**Stronger in your copy** (Supabase, Authentication):
- **Prevent use of leaked passwords**: on. It refuses any password found in
  the Have I Been Pwned list, and needs the Pro plan.
- **Minimum password length**: 10, to match the app.
- **Email OTP expiration**: 3600 seconds (one hour) or less.
- **Secure password change**: optional. When it is on, Settings, Password
  e-mails a code to confirm it is really the account holder; the app handles
  this already.
- Ask every leader to turn on two-step sign-in (Settings, Password).

---

## Layer 4: what they may do

**It stops** a signed-in person reading or changing anything outside their
own place: another Guide's conversation, a member list they do not lead, a
role above their own, a giving record when they are not the treasurer.

**Where it lives**
- `supabase/migrations/`: row-level security on every table, a policy for
  each thing a person may do, and every table opened to signed-in people
  **by name**, or closed by name and reached only through functions
  (`20261026180000_every_table_says_who_may_reach_it.sql`).
- Functions that run with more rights (`security definer`) pin
  `search_path` to nothing, check who is asking before anything else, and
  are revoked from visitors.
- Nobody raises their own role: `tests/nobody-promotes-themselves.mjs`.
- Optional features are off until a project switches them on, in one
  `app_settings` row only the server can read: giving (`HUB_GIVING`). (The
  court room's email door, `COURT_DOOR_METHOD`, went with the court room on
  27 October 2026.)

**What proves it**: `tests/every-table-says-who-may-reach-it.mjs`,
`tests/nobody-promotes-themselves.mjs`, `supabase/tests/fresh-install-holds.sql`,
`supabase/tests/a-leader-stays-within-their-rank.sql`, and the fingerprint
(`supabase/tests/fingerprint.sql`), which compares a live database with a
fresh install line by line.

**Keeping it current**: every new table, function or setting answers the
questions in "Adding something new" below, in the same pull request.

**Stronger in your copy**: run `supabase/tests/fingerprint.sql` against your
live project after every update and compare it with a fresh install; read
Supabase's Security Advisor monthly.

---

## Layer 5: what is kept, and how

**It stops** a key that can read everything reaching a browser, a file
opened by somebody who was never sent it, a photo that gives away where
somebody lives, and data kept after the person has gone.

**Where it lives**
- Only the publishable key reaches the browser; the server's secret key
  lives in the server functions' environment and nowhere else
  (`tests/no-secrets.js`).
- Files are in private storage and opened through short-lived signed links.
- Photos lose their location before they leave the phone
  (`tests/photos-lose-their-location.mjs`), and one person's uploads are
  bounded (`tests/what-one-person-can-upload.mjs`).
- Deleting somebody queues every file their rows pointed at
  (`supabase/tests/what-is-deleted-leaves-no-file-behind.sql`).
- What is not needed is not kept: a gift has no giver column at all.
- Backups are encrypted with a passphrase before they leave the database
  (`.github/workflows/backup.yml`).

**What proves it**: `tests/no-secrets.js`, `tests/photos-lose-their-location.mjs`,
`tests/what-one-person-can-upload.mjs`, `tests/data-protection.mjs`.

**Keeping it current**: a new kind of upload names its types and its size
limit in the database, not only in the screen.

**Stronger in your copy**: rotate the project's secret keys whenever anybody
who held one leaves; keep the backup passphrase somewhere other than the
backups.

---

## Layer 6: what a person sees

**It stops** a message or a post being run as code in somebody else's
browser, a link that is really `javascript:`, a translation that slips in an
address of its own, and a database error being read out to a member.

**Where it lives**
- People's words are drawn as text, never as HTML. The only raw HTML the app
  writes is two of its own scripts (`components/LookBeforePaint.tsx`,
  `components/SelfHeal.tsx`), and the Study Room's editor cleans anything
  pasted into it with DOMPurify (3.4.17 or later in every copy, layer 1).
- `lib/linkify.ts` and the safe-link guard: only `http`, `https`, `mailto`
  and in-app links become links.
- `lib/live/errors.ts` (`humanError`): every error a member could see is put
  into words, including every refusal from the sign-in service.
- Translations are held to their English: no link, number or markup the
  English does not have.

**What proves it**: `tests/linkify.mjs`, `tests/errors-are-human.mjs`,
`tests/translations-say-only-what-english-says.mjs`, `tests/security-invariants.mjs`.

---

## Layer 7: knowing, and acting

**It stops** a problem going unnoticed, and a problem that is noticed but
handled badly because nobody knew what to do.

**Where it lives**
- Records that outlive the people in them: a safeguarding report and the
  conversation about it stay when an account is deleted
  (`tests/a-record-that-outlives-the-people-in-it.mjs`), and nobody rewrites a
  report through the data API: every change is a checked function, and its
  evidence opens only to whoever may handle it
  (`tests/a-report-is-one-conversation.mjs`,
  `supabase/tests/a-report-is-one-conversation.sql`).
- The weekly audit (layer 1) and Supabase's Security Advisor.
- Backups, and a restore actually tried ([DO-THIS-NEXT.md](DO-THIS-NEXT.md)).
- [EMERGENCY-DEPLOY.md](EMERGENCY-DEPLOY.md): rolling back, and a short checked fix.
- `public/.well-known/security.txt` and GitHub's private vulnerability
  reporting: how somebody outside tells you.

**When something goes wrong**, in this order:
1. **Contain.** Suspend the account involved (which ends its sessions at
   once), rotate any key that may have been seen, and roll back the deploy
   if the code is the cause ([EMERGENCY-DEPLOY.md](EMERGENCY-DEPLOY.md)).
2. **Establish what was reached, and about whom**: Supabase's Auth and
   database logs, the security audit record, the safeguarding record.
3. **Fix** with a test that fails without the fix, through the ordinary gate.
4. **Tell.** Under the Data Privacy Act, the National Privacy Commission and
   the people affected are told within 72 hours where there is a real risk of
   serious harm ([PRIVACY-MANUAL.md](PRIVACY-MANUAL.md), section VII).
5. **Write it down**: in [CHANGELOG.md](../CHANGELOG.md), with what a church
   running a copy has to do, and in SECURITY.md if a practice changed.

---

## Layer 8: the people who run it

**It stops** the protections that live outside the code being left at their
defaults, and a person or a tool holding more access than their job needs.

**Where it lives**
- [SECURITY.md](SECURITY.md), "Settings that live outside the code": the
  Supabase, GitHub and hosting switches, each with why.
- `.github/CODEOWNERS`: database rules, workflows, server routes and the
  AI brief wait for the owner's review.
- `AGENTS.md`: what an AI tool may and may not do, including never running
  SQL against a live database without being asked in that session.
- `.claude/agents/`: research agents that only read
  (`tests/the-research-agents-only-read.mjs`).

**Keeping it current**: once a year, list who has access to the GitHub
repository, the Supabase organisation and the hosting account, and remove
anybody who no longer needs it.

---

## Keeping it current: the routine

| When | What | Who |
|---|---|---|
| Every week, on its own | Dependabot pull requests; the audit workflow; CI on every push | GitHub |
| Every week | Read and merge (or close) the update pull requests | A developer |
| Every month, 15 minutes | Supabase Security Advisor; any accepted advisory near its review date; did the backup run? | The project's owner |
| Every quarter | Restore a backup into a scratch database; check the layer 3 settings | The project's owner |
| Every year | Renew `security.txt`; review who has access; rotate keys that people who left once held | The project's owner |

### When an advisory lands

What October 2026 looked like, as a procedure:

1. **Is it in our tree?** `npm ls <package>` in the app and in
   `selfhost/server`; for Node itself, the version in the Docker image and
   on the host.
2. **Can it be reached?** A flaw in a server feature the app never uses is
   still patched, but not at 2 a.m.
3. **Patch.** Update the package; for a copy nested inside another package,
   add an `overrides` entry. Install with `--ignore-scripts` and read the
   lockfile diff.
4. **Hold it.** Add its version floor to a "patches hold" test.
5. **Gate.** `npm run verify`, and the fresh install if the database moved.
6. **Write it down.** A row in SECURITY.md's table for that month, and an
   entry in CHANGELOG.md that starts with what a church running a copy has to do.
7. **Ship, and say so.** Push, let the site rebuild, and post a notice so
   developers watching the repository see it.

---

## Adding something new: the questions

Answer the ones that apply in the same pull request. Each has a check that
fails if it is skipped.

| You are adding | Answer before merging |
|---|---|
| A table | Row-level security on; granted to `authenticated` by name with only the privileges used, or closed by name; a policy for each act; proved on a fresh install. |
| A database function | Does it need more rights (`security definer`)? Then `set search_path = ''`, check who is asking first, revoke from `public` and `anon`, grant execute narrowly. |
| A page | Is it reached signed out? Does it handle every refusal through `humanError`? Is it on the offline list (`app/sw.js/route.ts`)? |
| A server function | Does it verify the token, refuse a suspended account, and compare secrets in constant time? |
| An upload | Its types and size limit in the database, private storage, location removed from photos. |
| A dependency | What it replaces, who publishes it, its install scripts, and what it adds to the lockfile. |
| A new outside service | Exactly one CSP origin, the privacy notice updated, nothing personal sent that the person did not choose to send. |
| An optional feature | Off by default, switched on by one `app_settings` row, and every function refusing while it is off (the giving room is the pattern). |
| A setting outside the code | A row in SECURITY.md's "Settings that live outside the code", with why. |
