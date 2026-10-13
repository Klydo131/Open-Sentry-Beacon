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
| [`php`](php/walk.php) | PHP 8.1+, curl extension | `php walk.php` |
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

**How these were checked, and what has not been**, is in
[docs/IN-ANY-LANGUAGE.md](../docs/IN-ANY-LANGUAGE.md#the-examples-and-how-they-were-checked).
