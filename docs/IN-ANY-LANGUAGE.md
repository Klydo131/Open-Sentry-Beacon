# Hope Beacon in any language

Hope Beacon is a Next.js web app on a Supabase database, but nothing it does
depends on either. A church's IT team may want a phone app in Flutter, a small
service in Rust or Go, a website in PHP, reports in Python, or the whole thing
rebuilt on tools they already run. This page is for them. It says:

- what every version must keep, whatever it is written in;
- three ways to build, from "change the look" to "rebuild everything";
- how the parts talk to each other: REST, live updates, files, GraphQL,
  webhooks, gRPC;
- the same small program in nine languages, and the same small server in three,
  each run before it was published.
- how the app's own screens are put into other languages, and the rules a
  translation keeps.

For *why* the database is shaped the way it is, table by table and rule by
rule, read [BUILD-YOUR-OWN.md](BUILD-YOUR-OWN.md) alongside this page.

| You want to | Read | Example code |
|---|---|---|
| Keep the app and change how it looks or what it says | [START-HERE.md](START-HERE.md), [Translating the screens](#translating-the-screens) | none needed |
| Write a phone app, a desktop tool or a script that talks to Hope Beacon | [Way B](#b-keep-the-database-write-your-own-app-or-server), [The calls, in order](#the-calls-in-order) | [`examples/`](../examples/) in curl, JavaScript, Python, PHP, Rust, C++, Go, Java, Dart |
| Write your own server in your own language | [Your own server: the pattern](#your-own-server-the-pattern) | [`examples/server-python`](../examples/server-python/), [`server-php`](../examples/server-php/), [`server-rust`](../examples/server-rust/), [`server-laravel`](../examples/server-laravel/) |
| See your church's weekly trends, in counts that name nobody | [`tools/trends/README.md`](../tools/trends/README.md) | [`tools/trends`](../tools/trends/) in Python |
| Rebuild everything on another database | [Way C](#c-rebuild-on-another-database) | none: you are writing it |

---

## What every version must keep

These are not features. They are why the app may hold what it holds about
people, and a church's privacy notice promises each of them. A version that
drops one is a different product, and should not carry the name.

| Promise | Where it is kept today | Proved by |
|---|---|---|
| Invitation only; a Director approves every new person | `invite` server function; `profiles.is_approved` | `tests/nobody-promotes-themselves.mjs` |
| A conversation is read by its two people and nobody else. Leaders see counts and dates, never words | Row rules on `messages` (`messages_read`) | `supabase/tests/a-conversation-can-reply-react-and-speak.sql` |
| Earlier versions of a message open to leaders only for a reported conversation, and every opening is recorded | `message_history_for_leader` | `supabase/tests/a-message-history-needs-a-report.sql` |
| Nobody raises their own role; only an Executive Director appoints Directors | `lock_privileged_profile_columns` | `supabase/tests/a-leader-stays-within-their-rank.sql` |
| Permission is asked before anything else, and recorded | `profiles.consent_at`; the consent step | `tests/data-protection.mjs` |
| A suspension, a sign-out elsewhere, and a missing two-step code stop every request at once | `refuse_suspended_requests()`, run before every request | `supabase/tests/a-second-step-is-required.sql` |
| Deleting a record deletes its files; the link record lasts 30 days | `erase` function, `cron` jobs | `supabase/tests/what-is-deleted-leaves-no-file-behind.sql` |
| A signed-out visitor sees nothing | No grants to `anon` on member tables | `tests/the-signed-out-role.mjs` |
| The keys that bypass the rules never leave the server | Only server functions hold them | `tests/security-invariants.mjs` |

**The rules live in the database, not in the app.** That one decision is what
makes every way below possible. A Flutter app, a Rust service and a PHP page
can all talk to the same database, and none of them can read a conversation
it should not, because the database refuses before any of them sees a row.

---

## Three ways to build

### A. Keep everything, change the look

Fork the repository and change the screens, the words, the colours. The rules
and the tests come with you. [START-HERE.md](START-HERE.md) is the whole path.

### B. Keep the database, write your own app or server

**The recommended way for another language.** Run the migrations in
`supabase/migrations/` on a Supabase project (or any PostgreSQL that has what
[`supabase/tests/platform-stand-in.sql`](../supabase/tests/platform-stand-in.sql)
adds). Then build whatever you like on top:

- **An app** (phone, desktop, kiosk, script) signs the person in and sends
  their token with every request. It holds only the publishable key, which is
  safe to ship. The database decides what that person may read and write.
  [`examples/`](../examples/) does this in nine languages.
- **A server** in your own language holds the database password, and runs each
  request *as the person who asked*, so the same rules still apply.
  [Your own server: the pattern](#your-own-server-the-pattern) shows the four
  lines that make that true.

### C. Rebuild on another database

MySQL, SQL Server, MongoDB, Firebase: possible, and the hardest way. None of
them runs these rules, so **every promise in the table above becomes code you
write and test yourself**, in every place that reads data. Start from
[BACKEND-MAP.md](BACKEND-MAP.md), which lists every table's rule in words, and
port the SQL tests in `supabase/tests/` before you port a single screen. A
version without them is not finished. [DEPLOY-ANYWHERE.md](DEPLOY-ANYWHERE.md#moving-off-supabase)
names the three places the app meets its backend.

---

## How the parts talk to each other

| Part | Address | Speaks | What it is for | Rules apply? |
|---|---|---|---|---|
| Sign-in | `/auth/v1/...` | REST, JSON | Password, two-step code, refresh, sign out | It is the rules' first half |
| Data | `/rest/v1/<table>`, `/rest/v1/rpc/<function>` | REST, JSON ([PostgREST](https://postgrest.org)) | Reading and writing tables; calling the database's functions | **Yes**: row rules on every table |
| Live updates | `/realtime/v1/websocket` | WebSocket (Phoenix channels) | New messages arriving without asking | **Yes**: `realtime.messages` rules |
| Files | `/storage/v1/...` | REST | Photos, voice notes, resources; private, with links that expire | **Yes**: `storage.objects` rules |
| Server functions | `/functions/v1/<name>` | REST, JSON | `invite`, `notify`, `places`, `erase` | Each checks the caller itself |
| GraphQL | `/graphql/v1` | GraphQL ([pg_graphql](https://supabase.com/docs/guides/graphql)) | An alternative to REST for the same tables | **Yes**, same row rules; not used by the app |

**REST** is the default, and every example here uses it: plain HTTP and JSON,
which every language has. **Live updates** have client libraries for JavaScript,
Dart/Flutter, Swift, Kotlin, Python and C#; a language without one can poll the
REST address instead. **GraphQL** is there if your team prefers it; it reads
through the same rules, but this project has not run it.

**Systems of your own.** A gRPC service (tonic in Rust, grpc-go, grpc-java), a
message queue, or a webhook receiver is a server like any other: follow
[the pattern](#your-own-server-the-pattern) and the database still decides.
When you send events to another system, **send ids, never message text**. The
words of a conversation must not leave the database through a side door.

---

## The calls, in order

Every example in [`examples/`](../examples/) makes these five calls and prints
the same lines. [`examples/rest/walk.sh`](../examples/rest/walk.sh) is the
version with nothing but `curl`; read it first.

| # | Call | Sends | Gets back |
|---|---|---|---|
| 1 | `POST /auth/v1/token?grant_type=password` | `{"email", "password"}` | `access_token` (an hour), `refresh_token`, `user.id` |
| 2 | `GET /rest/v1/profiles?id=eq.<user id>&select=full_name,role` | | Your own profile |
| 3 | `GET /rest/v1/pairings?select=id,journey_stage` | | The conversations **you** are in. No filter: the rules filter |
| 4 | `GET /rest/v1/messages?pairing_id=eq.<id>&select=sender_id,body&order=created_at.desc&limit=5` | | Its newest messages |
| 5 | `POST /rest/v1/messages` | `{"pairing_id", "sender_id": <you>, "body"}` | The message, with `Prefer: return=representation` |

Every request carries two headers: `apikey: <publishable key>` and
`Authorization: Bearer <access_token>` (before sign-in, the publishable key
again). [`examples/openapi.yaml`](../examples/openapi.yaml) describes the same
calls for tools that generate client code (OpenAPI Generator, NSwag,
openapi-typescript).

**What the answers mean.** `401` is "sign in again". `403` with `"code": "PT403"`
is "this account uses two-step sign-in and the code is still owed". `403` with
`42501` is the rules refusing. An empty list `[]` is the rules too: you asked for
something that is not yours, and the database showed you nothing rather than
telling you it exists.

### Staying signed in, and signing out

- **Refresh** before the hour is up: `POST /auth/v1/token?grant_type=refresh_token`
  with `{"refresh_token"}`. Each refresh token works once; keep the new one.
- **Sign out**: `POST /auth/v1/logout?scope=local` with the token. The database
  stops honouring it at once.

### Two-step sign-in

An account with an authenticator app gets a password-only token that the data
API refuses (`PT403`) until the code is given:

1. `GET /auth/v1/user` with the token: `factors` lists the account's apps; use
   the one whose `status` is `verified`.
2. `POST /auth/v1/factors/<factor id>/challenge` with `{}`: returns a challenge `id`.
3. `POST /auth/v1/factors/<factor id>/verify` with `{"challenge_id", "code"}`:
   returns a new session whose token the data API accepts.

`lib/live/two-step.ts` is the app's own version of these three calls.

---

## Your own server: the pattern

A server written in your own language holds the database password, which can
read everything. To keep every rule, **each request runs as the person who
asked**, inside one transaction:

```sql
begin;
select set_config('request.jwt.claims', '<the token''s claims, as JSON>', true);
set local role authenticated;
select public.refuse_suspended_requests();
-- your query here: the row rules decide what it returns
commit;
```

Why each line is there:

1. **Check the token first.** Ask the sign-in service (`GET /auth/v1/user`), or
   verify its signature with your project's signing keys. A server that skips
   this trusts whatever claims somebody sends. The examples ask the service;
   for speed, verify locally against your project's published keys.
2. **`set_config(..., true)`** sets the claims for this transaction only. With
   `false`, or outside a transaction, a pooled connection would carry one
   person's identity into the next person's request.
3. **`set local role authenticated`** drops the password's power for the rest
   of the transaction. Without it, the rules do not apply at all.
4. **`refuse_suspended_requests()`** is the check Supabase's data API runs
   before every request: a suspended account, an ended session, a two-step code
   still owed. Your server must call it itself.

Worked, run and tested in [Python (FastAPI)](../examples/server-python/app.py),
[plain PHP](../examples/server-php/index.php) and
[Rust (axum)](../examples/server-rust/src/main.rs), and as
[Laravel middleware](../examples/server-laravel/HopeBeaconRules.php).

---

## The examples, and how they were checked

| Language | Library | Folder | Run with |
|---|---|---|---|
| Shell | curl, jq | [`examples/rest`](../examples/rest/) | `./walk.sh` |
| JavaScript | Node 18+ `fetch`, no packages | [`examples/javascript`](../examples/javascript/) | `node walk.mjs` |
| Python | httpx 0.28 | [`examples/python`](../examples/python/) | `python walk.py` |
| PHP | curl extension, no Composer | [`examples/php`](../examples/php/) | `php walk.php` |
| Rust | ureq 2, serde_json | [`examples/rust`](../examples/rust/) | `cargo run --quiet` |
| C++17 | libcurl, nlohmann/json | [`examples/cpp`](../examples/cpp/) | `cmake -S . -B build && cmake --build build && ./build/walk` |
| Go | standard library | [`examples/go`](../examples/go/) | `go run .` |
| Java 17+ | `java.net.http`, Jackson | [`examples/java`](../examples/java/) | `mvn -q compile exec:java` |
| Dart (Flutter) | `package:http` | [`examples/dart`](../examples/dart/) | `dart run bin/walk.dart` |

Each reads `HB_URL`, `HB_KEY` (the **publishable** key), `HB_EMAIL` and
`HB_PASSWORD`. `HB_SEND='Hello'` also sends one message; without it nothing
is written.

**Checked on 13 October 2026**, against a stand-in on one computer that
answers as Supabase's sign-in and data services do and runs every request
through this repository's real database rules. All nine:

- printed the same lines for an invented Explorer;
- named an invented Guide correctly;
- refused a wrong password in the server's own words;
- sent one message only when asked;
- told an account with two-step sign-in so, instead of crashing.

The three servers were checked the same way:

- a person sees their own conversation;
- another pair's conversation comes back empty;
- no token is refused;
- a token altered to name somebody else is refused;
- a suspended account is refused;
- an account still owing its two-step code is refused.

**Not yet checked:**

- **A real Supabase project.** No example has run against one; the stand-in
  answers as Supabase documents, but it is not Supabase.
- **Flutter.** The Dart example ran on the Dart SDK, not inside a Flutter app.
- **Laravel.** The middleware is checked for PHP syntax only.
- **Continuous integration.** CI does not build these examples.

---

## Rules for people and AI tools

- **The publishable key may ship in an app. The secret key and the database
  password never do**: not in a phone app, a browser, a
  repository, a chat or a screenshot.
- **Every request made for a person carries that person's token.** Never a
  shared account, never the secret key to "make it work".
- **When the database refuses, the answer is to change who asks, not to go
  round the rules.** A refusal is the system working.
- **Invented people only** in examples, tests and screenshots
  (`@example.test` addresses). Never a real member's details.
- **Do not log message text or tokens**, in any language.
- [AI-LIMITS.md](AI-LIMITS.md) says what an AI tool may and may not do in this
  repository; it applies to your copy too.

---

## Translating the screens

### What a person sees today

Sixteen languages are offered. A person can choose one **before signing in**,
in the corner of the front door and the sign-in page, and in Settings, General,
Language afterwards; the choice stays on that device. Arabic lays the page out
right to left.

Translated so far, in all fifteen languages besides English:

| Screen | Words |
|---|---|
| The front door | [`lib/words/door.ts`](../lib/words/door.ts) |
| The sign-in page, its messages, and the forgotten-password pages | [`lib/words/door.ts`](../lib/words/door.ts) |
| The code screens of two-step sign-in | [`lib/words/two-step.ts`](../lib/words/two-step.ts) |
| The bar along the bottom, the signed-in header, the Language card | [`lib/words/frame.ts`](../lib/words/frame.ts) |
| Older shared words (Settings, the Director's tabs, analytics) | [`lib/i18n.tsx`](../lib/i18n.tsx) |

Everything else is still English, in every language. That includes the rooms
inside the app, setting two-step sign-in up, the install card, the tutorial,
and **the consent wording, on purpose** (below).

**Every translation is a draft.** They were written by an AI tool, not by
people who grew up speaking each language. Before a church relies on one, a
member who speaks it should open the app, choose the language, and read the
front door, the sign-in page, a wrong password and the code screen.

### How the words work

The English stays in the screen's own file, next to the comment that explains
it, and is the key for every translation:

```tsx
const say = usePhrases(DOOR_WORDS);
<p>{say('Forgot your password?')}</p>
<h1>{say('Sign in to {app}', { app: APP_SHORT_NAME })}</h1>
```

```ts
// lib/words/door.ts
export const DOOR_WORDS: Phrasebook = {
  es: { "Forgot your password?": "¿Olvidaste tu contraseña?", ... },
  ...
};
```

A sentence missing from a language is shown in English. Change the English and
every old translation of it stops being used, so a screen never shows a
translation of something it no longer says.

Each screen has its own list, imported only by that screen, so a language adds
weight to the pages that use it and to nothing else.

### To correct or add a translation

1. Find the sentence in `lib/words/`, under the language's code.
2. Change the words on the right. Never the English on the left.
3. Run `node tests/translations-say-only-what-english-says.mjs`.

To translate a new screen: wrap its sentences in `say(...)`, start a list in
`lib/words/`, and add it to the list at the top of that test.

To add a language: add it to `LANGUAGES` in `lib/i18n.tsx` (with `rtl: true` if
it is written right to left), then add its code to each list.

### The rules a translation keeps

`tests/translations-say-only-what-english-says.mjs` runs in the gate. A
translation must:

- **add no link, e-mail address or number** that the English does not have;
- carry no markup and no invisible or direction-changing characters;
- keep the same `{blanks}` as the English;
- keep the role words as the app names them (Director, Executive Director),
  because [`lib/brand.ts`](../lib/brand.ts) is the one place roles are named;
- translate a sentence the screen really says.

**Why this is a security rule.** The word lists are the one part of the app
most reviewers cannot read. A line of Korean or Swahili that quietly added
"send your code to this number" would be shown on the sign-in page, to the
people least able to tell. So a pull request that changes a language needs a
reviewer who reads that language, as well as the test.

**The consent wording stays in English until a native speaker and the
church's Data Protection Officer have approved the translation.** A permission
somebody cannot read is not permission, and a translation of it is a legal text,
not a string. The same test fails if the consent screen is wired to a word list.
