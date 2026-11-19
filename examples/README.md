# Examples: Hope Beacon from any language

The same small program in nine languages: sign in, say who you are, list the
conversations you are in, show the newest messages, and send one only if you
ask. Every version prints the same lines, because the same database rules
answer them all.

```
Signed in as Ezra Explorer (Explorer).
Conversations you can see: 1
Latest messages (journey stage: connect):
  Them: Welcome, Ezra. I am glad to walk with you.
  You:  Thank you. Can we meet on Saturday?
  Them: Saturday at ten works. See you then.
```

| Folder | Language and library | Run |
|---|---|---|
| [`rest`](rest/walk.sh) | curl and jq: **read this one first**, it is the whole protocol | `./walk.sh` |
| [`javascript`](javascript/walk.mjs) | Node 18+, `fetch`, no packages | `node walk.mjs` |
| [`python`](python/walk.py) | Python 3.9+, httpx | `pip install -r requirements.txt && python walk.py` |
| [`php`](php/walk.php) | PHP 8.2+, curl extension | `php walk.php` |
| [`rust`](rust/src/main.rs) | ureq, serde_json | `cargo run --quiet` |
| [`cpp`](cpp/walk.cpp) | C++17, libcurl, nlohmann/json | `cmake -S . -B build && cmake --build build && ./build/walk` |
| [`go`](go/main.go) | Go standard library | `go run .` |
| [`java`](java/src/main/java/Walk.java) | Java 17+, `java.net.http`, Jackson | `mvn -q compile exec:java` |
| [`dart`](dart/bin/walk.dart) | Dart 3, `package:http`; the same code runs in Flutter | `dart pub get && dart run bin/walk.dart` |

Each reads four settings from the environment:

| Setting | What it is |
|---|---|
| `HB_URL` | Your project's address, `https://<project>.supabase.co` |
| `HB_KEY` | The **publishable** (anon) key. Never the secret key |
| `HB_EMAIL`, `HB_PASSWORD` | A test account. Use invented people, not a member |

Add `HB_SEND='Hello'` to send one message. Without it, nothing is written.

## Your own server

| Folder | What it shows |
|---|---|
| [`server-python`](server-python/app.py) | FastAPI and psycopg |
| [`server-php`](server-php/index.php) | Plain PHP, PDO pgsql |
| [`server-rust`](server-rust/src/main.rs) | axum and tokio-postgres |
| [`server-laravel`](server-laravel/HopeBeaconRules.php) | The same pattern as Laravel middleware |

A server holds the database password, so it runs each request **as the person
who asked** and the database's rules still decide. Why each of those four
lines matters is in
[docs/IN-ANY-LANGUAGE.md](../docs/IN-ANY-LANGUAGE.md#your-own-server-the-pattern).

[`openapi.yaml`](openapi.yaml) describes the calls for code generators.

## Keep the language itself patched

An example is only as safe as what runs it. The versions pinned here were
checked against the public advisory databases on 19 November 2026, and each
was moved to one with no known advisory: Jackson 2.22.4 for Java, Starlette
1.10.0 under FastAPI 0.162.5 for Python, and tokio-postgres 0.7.18 for Rust.
The language underneath is yours to keep current:

- **PHP**: a supported branch (8.2 or later) on its newest release. October's
  critical fixes are in 8.2.35, 8.3.36, 8.4.27 and 8.5.12. A further critical
  release was announced for 19 November 2026; take it as soon as your system
  offers it. PHP 8.1 no longer receives fixes.
- **Java**: a supported JDK (17, 21 or 25) on its newest update.
- **Python, Go, Rust, Dart, Node**: a version their makers still support,
  updated when they publish a security release.

Run one of these on a server only after you have done that, and only behind
HTTPS.

**How these were checked, and what has not been**, is in
[docs/IN-ANY-LANGUAGE.md](../docs/IN-ANY-LANGUAGE.md#the-examples-and-how-they-were-checked).
