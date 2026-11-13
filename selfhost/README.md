# selfhost/

Hope Beacon on plain Postgres, with no Supabase account. **The guide is
[docs/POSTGRES.md](../docs/POSTGRES.md)**; this folder is what it uses.

| Path | What it is |
|---|---|
| `docker-compose.yml` | Postgres, PostgREST, the Beacon server, and (with profiles) the app and HTTPS |
| `.env.example` | Every setting, with what it does. `server/src/keys.mjs --write` turns it into `.env` |
| `sql/platform.sql` | What a database needs before the first migration, in place of what Supabase provides |
| `server/` | The Beacon server: sign-in, files, live data, scheduled jobs, the app's functions |
| `server/test/the-edition-holds.mjs` | Seventy checks driving the server with supabase-js, run in CI |
| `app.Dockerfile`, `Caddyfile` | The app's image, and HTTPS for both addresses |

The migrations and functions are not copied here: the server runs the ones in
`supabase/`, so the two editions cannot drift apart.
