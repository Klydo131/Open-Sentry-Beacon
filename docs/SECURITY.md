# Security

Read this before connecting Open Sentry Beacon to anything real. It is short on
purpose, and it tries to be honest rather than reassuring.

---

## Reporting a vulnerability

**Do not open a public issue.** Use GitHub's private
[Security Advisories](https://github.com/Klydo131/Open-Sentry-Beacon/security/advisories/new)
on this repository, which is visible only to maintainers until a fix is
published.

Include what an attacker can do stated as an outcome ("any visitor can read X"),
the smallest steps that reproduce it, and the commit you tested. You will get an
acknowledgement within **7 days**. There is no bounty programme — this is a small
project maintained in spare time, and we would rather say so than imply a
response time nobody can hold to.

---

## What this app is, in security terms

**As shipped, there is nothing to breach.** No backend, no accounts, no network
calls, no analytics. Every screen runs from a store in the browser, and the
sample church is fiction. That is why you can hand it to anybody to try.

Three tests hold that promise rather than a paragraph in a README:

| Check | What it refuses |
|---|---|
| `tests/no-backend.js` | A database dependency, an API route that stores data, any analytics or error-reporting SDK, any call to an external server. |
| `tests/no-secrets.js` | A credential of recognisable shape in any tracked file, a real `.env`, anything secret exposed under a browser-visible prefix, sample data at a domain that could reach a real inbox. |
| `tests/security-invariants.mjs` | A weakened Content-Security-Policy, a URL guard that stops blocking `javascript:`, CI that could be hijacked by a pull request. |

Run them with `npm test`.

---

## The moment that changes: connecting a backend

Everything above stops being the whole picture the day you point this at a real
database. From then on **you own the security of what you connected**, and this
is the part people get wrong.

### Put authorisation in the database, not in the app

The screens in this app decide what to *show*. They cannot decide what somebody
is *allowed to have*, because anybody can send a request without using your
screens at all.

If your backend supports row-level rules, use them. A rule that lives with the
data applies to every route into it — including a screen somebody adds next year
without reading this file.

### Never put a secret in this repository

Anything the browser can read, every visitor can read. That includes any key in a
`.env` file that gets bundled, any key inside a component, and any key in a
backend adapter you write in `lib/backend/`.

Keys belong on a server you control. The browser talks to your server; your
server holds the key. `tests/no-secrets.js` fails the build if a credential
appears here, but it can only catch shapes it recognises — it is a safety net,
not permission to be careless.

### Rate limit on your server

Anything enforced in the browser can be skipped by opening the network tab. If an
endpoint you add sends email, writes rows, or costs money, limit it server-side,
key the limit on something the caller cannot change for free, and give anything
that sends messages its own separate ceiling.

### Decide what your leaders can see

This app is built so that leaders see counts and Guides see the
relationship — a pastor cannot read a Guide's conversations, because there
is no screen that shows them. If you connect a backend, that boundary is now
yours to enforce in your data rules. It is easy to lose by accident and hard to
explain afterwards.

### Place suggestions go through your server

The meet-up place box suggests places from OpenStreetMap as somebody types. The
browser never asks the map service itself: it asks `supabase/functions/places`,
which checks the caller is signed in, approved and not suspended; limits
them to the pace of a person typing; sends only the words and a town-level
point; logs nothing; and holds no master key. The Content-Security-Policy
therefore still allows the browser to talk to your backend and nothing else.
`tests/place-search.mjs` fails if any of that changes.

### Nobody promotes themselves

A signed-in person cannot change their own role, approval, church or a
guardian's consent. The database refuses it (`lock_privileged_profile_columns`,
error 42501), whatever the screen sends. The one way through is claiming an
unexpired invitation for exactly that church and role, while still unapproved.
The app never asks, either: updating your own profile sends a fixed list of
fields that has none of them. The sample app's role switcher changes a role
only in the browser's own store, so a pastor can see every screen before
adopting it; the live half never loads it. `tests/nobody-promotes-themselves.mjs`
fails if any of that changes, including a later migration that drops the
trigger.

### An invitation is a way in for a week

An invitation creates the account and e-mails a temporary password, because a
one-time link is spent by mail scanners and strands people. That password is
now **a way in for seven days and no longer** (since 29 September 2026):

- **It runs out on the server, not in the app.** When the week is up the
  database replaces it with a random password nobody knows and signs out every
  device that used it (`end_expired_temporary_passwords`, hourly via pg_cron).
  A letter found in an old inbox, a forwarded e-mail, or the Director's own
  screen is useless after that.
- **It can never touch a password somebody chose.** The database keeps the hash
  the invitation set and acts only while the account still has exactly that
  hash. A password changed by any door (the Password page, a reset e-mail, an
  admin) has a different hash and is left alone. The reminder flag is not
  trusted for this, because anybody signed in can clear it.
- **Choosing a password signs out every other device.** A new password always
  stopped the old one signing anybody in; now a phone or laptop already signed
  in with the letter is signed out too. The Password page also has **Sign out
  everywhere else**, for anybody who sees a sign-in they do not recognise.
- **An ended session is refused at once** (since 29 September 2026). Before,
  the pass a device already held kept working for up to an hour after its
  session was ended. Now the database asks, on every request, whether the
  session is still on record: the data API refuses an ended one with a 401,
  and the live socket and the file store stop at the same moment. The app hears
  the 401, asks the sign-in server once, and shows the front door. A signed-out
  visitor, the server's own requests, and a token with no session id are let
  through exactly as before.
- **A re-send cannot take over an account.** It is refused for anybody who has
  ever signed in (since 7 September 2026), so an invitation can only ever set
  the password of an account nobody has used.
- **None of it depends on the code being secret.** The table holding the clock
  has row-level security with no policies and no grants: no browser can read or
  change it. Only the invitation (the service role) starts a clock; nobody can
  run the expiry from a browser; a member can ask only when their own runs out.
  Knowing exactly how it works tells an attacker that an old letter is useless.

**Accounts invited before 29 September are not on a clock** unless the owner
starts one: on that day 40 accounts were still flagged as using their e-mailed
password, including the owner's own, and locking the owner out of their own
account is not a choice to make for them. To give every one of them seven days
(anybody who has ever asked for a reset e-mail is left out, because their flag
may be stale), run once in the SQL editor:

```sql
select public.start_temporary_password(p.id)
from public.profiles p
join auth.users u on u.id = p.id
where p.password_is_temporary and u.recovery_sent_at is null;
```

`tests/an-invitation-password-runs-out.mjs` holds all of the above. The migration
was run on the live database in a transaction that was thrown away, with two
made-up accounts, before it was applied: the letter's password stopped working
and its sessions ended; the account that had chosen its own was untouched.

### Files people upload

The live app keeps every uploaded file in **one private storage bucket**, and a
rule per folder decides who may put a file there and who may open it. Nothing in
that bucket is public: a file is opened through a signed address that expires
after an hour.

| Folder | Who may upload | Who may open |
|---|---|---|
| `<pairing>/` | Either person in that conversation | The same two |
| `avatars/<person>/` | That person | People in their church |
| `library/<person>/` (Resources) | That person, if a Guide, Explorer or leader and not stopped from sharing | That person, and whoever can read a resource pointing at the file |
| `lessons/<person>/` (study handouts) | That person, if they may write studies | Whoever can read the study |
| `reports/<person>/` (safeguarding evidence) | That person | The church's leadership |

Four rules apply across all of them:
- **Every file is at most 10 MB**, and only pictures, PDFs, office documents,
  audio and text are accepted. There is no video and no SVG, which can carry
  script.
- **Each person can keep up to 300 files or 200 MB** in their Resources and
  handouts. That bounds what one stolen password, or one script driving an
  account, can cost the church.
- **A suspended account can neither upload nor open anything.**
- **A photo loses the location its camera recorded** before it is sent. The
  exception is safeguarding evidence, which is kept exactly as sent.

These rules live in `supabase/migrations/`, and
`tests/a-resource-can-be-a-file.mjs` and `tests/what-one-person-can-upload.mjs`
fail if they are loosened.

**A folder does not say whose church it is.** The rules above find a file's
church from the person's id at the start of its folder, through
`public.uploader_church`. Until 27 September 2026 that helper could also be
called on its own, and it told any signed-in member which church any person
was in. It now answers only with a church the caller can already see into or
leads. Checked on the live database before it was applied, for every account
against every person's folder: all 1,849 pairs got the same answer from both
storage tests as before, and the 42 answers that had crossed from one church
into another became none. `tests/a-folder-does-not-say-whose-church.mjs` holds
it, including that every rule keeps using the helper only inside those two
tests.

**A drawing carries the picture and nothing else.** A drawing made on a study
(Excalidraw, since 28 September 2026) is saved as a PNG with the drawing itself
in one text chunk, so it can be reopened and changed. It goes through the same
upload and the same 10 MB limit as any handout. Every other chunk a PNG can
carry -- a camera's EXIF, where a location lives, a colour profile naming a
device, free text -- is cut out before it is sent (`lib/drawing-file.ts`), so
a photo renamed to look like a drawing still arrives with nothing but its
pixels. Photos cannot be put inside a drawing at all: a photo there would skip
the step that removes its location, so it is added as a handout instead.

**The drawing board talks to nobody else.** Excalidraw is loaded only when
somebody presses *Draw a picture*. Its fonts are copied out of the installed
package into `public/excalidraw/` at build time and served by the app itself;
its fallback to a public CDN is removed before the browser sees it, and the
Content-Security-Policy was not widened for any of it. Its AI tools, web
embeds, online library and file export are switched off.
`tests/a-study-can-have-a-drawing.mjs` holds these, and
`tests/e2e/a-study-can-have-a-drawing.js` draws in a real browser and fails if
any request leaves the app or anything is refused by the policy.

---

## What is not protected, plainly

- **An unlocked device that is signed in.** Whoever holds it sees what its owner
  sees. True of all software; worth saying because it is the most likely
  real-world exposure. *Sign out everywhere else* on the Password page ends
  every session but the one it is pressed on.
- **A temporary password during its week.** Anybody who reads the invitation
  e-mail in the first seven days can sign in with it. Choosing a password ends
  that at once.
- **Anyone with a legitimate account.** Rules restrict what a role can retrieve.
  They cannot stop somebody reading their own records and repeating them.
- **Content you choose to share.** If somebody uploads a sensitive document to
  Resources and sends it, the app will faithfully share it, and the person who
  receives it can save a copy that deleting the resource cannot take back.
- **Your hosting provider.** Whoever runs your server and database can see what
  is on it.

---

## Known advisories in what the app installs

`npm audit --omit=dev` lists what the app installs for production. What it
reports, and what was done about each, so nobody has to rediscover it:

| Reported | Reached through | What was done | Why |
|---|---|---|---|
| **dompurify** 3.4.13–3.4.15, low: an `afterSanitize` hook that removes nodes can leave event handlers armed | The page editor (BlockSuite) and the diagram tool (Mermaid, inside Excalidraw) | **Fixed 1 October 2026:** updated to 3.4.16 with `npm update dompurify`, inside the range both already allowed. | The app never calls DOMPurify or adds hooks to it, so it was not reachable here. It was a one-line, non-breaking fix anyway. |
| **vitest** / **@vitest/mocker**, moderate: a path traversal in the test runner's mock server (`npm audit` counts it 11 times, once for each BlockSuite package it passes through) | `@blocksuite/data-view` lists the test runner as a runtime dependency | **Left, on purpose.** | Nothing in the app runs vitest. BlockSuite's own code never imports it, and a production build contains no file that mentions it (checked on 1 October 2026). The only fix on offer is moving the editor back to 0.21.0, an older release, which would trade a test tool nobody runs for an editor change nobody has tested. Revisit when BlockSuite drops the dependency. |

**`npm audit fix` itself fails in this repository** with "Unable to resolve
reference $postcss". That comes from the `"postcss": "$postcss"` override in
`package.json`, which `npm install` and `npm ci` both handle and the fix
command does not. Update a single package with `npm update <name>`, then run
`npm audit --omit=dev` again to confirm.

---

## Search engines

**Your deployment is invisible to search by default, and a church should leave
it that way.** A church Beacon holds real people's names and conversations, and
a shared deep link that gets indexed is the cheapest possible leak — nobody has
to break anything, they only have to search.

Three signals say so together: a `<meta name="robots">` tag on every page,
`/robots.txt`, and the `X-Robots-Tag` response header. All three read one
variable, so they cannot end up disagreeing with each other:

```
BEACON_PUBLIC_SITE=1   # opt IN to being findable. Unset, the default, means no.
```

Set it only on a deployment with no real people in it — a public demo or a
showcase, where being unfindable is the bug. Do not set it on a church's Beacon.

What this is not: `robots` directives are a request. The large search engines
honour them and anything that does not care ignores them. They keep your app out
of Google; they are not access control. If a page must not be read by a
stranger, it needs a sign-in, not a header.

---

## Sample data

The sample church is fiction and must stay fiction. Names use reserved domains
(`.example`, `.test`) that can never resolve to a real inbox, and a test enforces
it. **Never commit real people's details**, not even briefly, not even in a
branch — a public repository is indexed within minutes and git remembers.

---

## Supported versions

`main` is the only supported version. Fixes land there; there are no backports.
