# Hope Beacon on plain Postgres

Hope Beacon normally runs on Supabase. This page is for a church that would
rather not: because the free plan pauses a quiet project, because the paid plan
is more than the church can carry, or because the church wants its members'
information on a machine it controls. The **Postgres edition** runs the same
app on any ordinary Postgres database, with no Supabase account at all.

**It is the same app.** The same screens, the same migrations, the same row
rules deciding who may see what, the same functions sending invitations. Nothing
in the app is changed to run this way; it is pointed at a different address.

| | Supabase (the usual way) | The Postgres edition |
|---|---|---|
| What you run | Nothing: Supabase runs the database and services | Postgres, PostgREST and the Beacon server, on a machine you rent or own |
| Who looks after it | Supabase | You: updates, backups, the machine itself |
| Cost | Free while small (a quiet free project is paused), then Supabase's paid plan | What the machine costs you; the software is free |
| Guide | [START-HERE.md](START-HERE.md) | This page |

If nobody at your church is comfortable looking after a server, stay on
Supabase. A database nobody backs up is a worse place for members' information
than a paid plan.

---

## What runs

```
 a member's phone ──▶  the app (Next.js)            your-church.org
        │
        └──────────▶  the Beacon server  ──▶  PostgREST  ──▶  Postgres
                      api.your-church.org      (the data API)   (everything)
```

- **Postgres 17** holds everything: members, conversations, files' records, the
  rules. Any Postgres 17 will do; the Docker setup below brings its own.
- **PostgREST** is the data API Supabase itself uses: it turns each request into
  SQL run *as that member*, so the database's row rules decide what comes back.
  It is a separate open-source project, pinned to version 16.5.
- **The Beacon server** (`selfhost/server/`) answers everything else Supabase
  would: sign-in and two-step codes, files, live updates to open screens, the
  scheduled jobs, and the app's own functions (`supabase/functions/`, run
  unchanged). It is under three thousand lines of JavaScript, comments included,
  with six dependencies, all in this repository.

The app talks to the Beacon server exactly as it talks to Supabase. That is
the whole trick, and it is why the app needs no change.

---

## Set it up on one machine (Docker)

The straightforward way: one rented Linux server (a "VPS") runs all four parts
with Docker. Each step says what you should see. If you do not see it, stop at
that step; the next one will not fix it.

**What you need:**

- A Linux server with Docker and Docker Compose installed. Ubuntu 24.04 is a
  safe choice. See "How big a machine" below.
- Two names you control, pointed at that server (an **A record** each at your
  domain's DNS): one for the app (`beacon.your-church.org`) and one for the
  server (`api.your-church.org`).
- An e-mail account that can send by SMTP (Brevo, Mailgun, Postmark, Google
  Workspace, or your web host's own), for invitations and password resets.

### Step 1: Get the code

```bash
git clone https://github.com/Klydo131/Open-Sentry-Beacon.git
cd Open-Sentry-Beacon
```

### Step 2: Make the secrets

```bash
docker run --rm -v "$PWD:/app" -w /app node:22-slim node selfhost/server/src/keys.mjs --write
```

> **Check:** it says `Wrote …/selfhost/.env`. That file now holds five secrets.
> It is readable by you only, and git ignores it. **Copy it somewhere safe
> (a password manager).** Lose `JWT_SECRET` and every member has to sign in
> again; lose `POSTGRES_PASSWORD` and you cannot reach your own data.

### Step 3: Fill in the rest

Open `selfhost/.env` and set:

| Setting | What to put |
|---|---|
| `SITE_URL` | `https://beacon.your-church.org` |
| `PUBLIC_URL` | `https://api.your-church.org` |
| `APP_DOMAIN`, `API_DOMAIN` | the same two names, without `https://` |
| `BEACON_ALLOWED_ORIGINS` | the same as `SITE_URL` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | from your e-mail provider |

Everything else can stay as it is. Each line in the file says what it does.

### Step 4: Start the database and the server

```bash
cd selfhost
docker compose up -d
docker compose ps
```

> **Check:** three services, `db`, `server` and `rest`, all `Up`, and `db` and
> `server` say `(healthy)`. The first start installs the database (every
> migration, in order) before the server says it is healthy; it takes under a
> minute. `docker compose logs server` shows
> `"147 migration(s) applied"` (or however many there are by then).

### Step 5: Start the app, with HTTPS

```bash
docker compose --profile app --profile https up -d --build
```

This builds the app with your two addresses in it, then starts Caddy, which
fetches HTTPS certificates for both names from Let's Encrypt and renews them by
itself.

> **Check:** `https://beacon.your-church.org` shows the sign-in page, with the
> padlock. If the browser warns about the certificate, the names are not
> pointing at this server yet; fix the DNS and run `docker compose restart https`.

### Step 6: Make yourself the first leader

Nobody can invite the first person, so the first account is made from the
server:

```bash
docker compose exec server node src/first-leader.mjs you@your-church.org "Your Church Name"
```

> **Check:** it prints a temporary password, **once**. Sign in with it, choose
> your own password when the app asks, and set up **two-step sign-in** under
> Settings before you invite anybody. Then invite your other leaders from the
> app, as on any other copy.

That is a working church. The rest of this page is about keeping it working.

---

## Keeping it going

### Updates

```bash
git pull
cd selfhost
docker compose --profile app --profile https up -d --build
```

The server installs any new migrations when it starts, in order, and records
each one, so this is safe to run as often as you like. A migration that fails
stops the server from starting and names the file; nothing half-applied is
left behind, and the previous version keeps your data as it was.

### Backups

Two things hold everything: the database, and the folder of uploaded files.
Back up both, and keep a copy **off this server**.

```bash
cd selfhost
# The database, as one file.
docker compose exec -T db pg_dump -U postgres -Fc postgres > beacon-$(date +%F).dump
# The uploaded files, as one archive.
docker compose exec -T server tar -czf - -C /data files > beacon-files-$(date +%F).tgz
```

Run both every night (a `cron` entry on the server is enough) and copy the
results to another place: a second provider, an external drive, a cloud bucket.
**A backup you have never restored is a hope, not a backup.** Restore one into
a scratch database once, before you need it, and look inside:

```bash
docker compose exec -T db createdb -U postgres scratch
docker compose exec -T db pg_restore -U postgres -d scratch < beacon-2026-10-20.dump
docker compose exec db psql -U postgres -d scratch -c 'select count(*) from public.profiles'
docker compose exec -T db dropdb -U postgres scratch
```

To put a backup back for real, stop `server` and `rest` first, restore into
`postgres` with `pg_restore --clean --if-exists`, unpack the files archive into
the `files` volume, and start them again.

### How big a machine

Measured on 20 October 2026, with the app open and in use: the app about 190 MB
of memory, the Beacon server about 115 MB, PostgREST about 30 MB, Postgres
about 60 MB to begin with. **1 GB of memory runs it; 2 GB is comfortable**, and
Postgres uses whatever more it is given to keep things fast.

**Building the app needs far more than running it.** Step 5, and each update,
builds the app, and the build peaked at about 3.4 GB of memory, measured twice
on 20 October 2026 (3.35 GB and 3.5 GB). So:

- **4 GB of memory** builds it with nothing else to do.
- **On a 1 or 2 GB machine, add swap before building**, or the build stops part
  way with no clear message. Four commands make a 4 GB swap file:
  `sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`.
  The build is slower on swap; running the app afterwards is not.
- Or build the image on a bigger computer and copy it across with
  `docker save` and `docker load`, so the small machine never builds at all.

Disk: the database is small (tens of MB for a church); uploaded photos and
files are what grow. Each bucket has a size limit per file (10 MB for
conversation files, 50 MB for post videos).

---

## Without Docker

Everything above can run without Docker, which suits a managed Postgres from a
hosting provider:

1. **Postgres 17**, empty. You need a user that may create roles (to make
   `anon`, `authenticated`, `service_role` and `authenticator`) and, ideally, a
   superuser for the first install: the migrations add event triggers, which
   most providers allow only to their administrative user.
2. **PostgREST 16.5** from its own releases, with the settings in
   `selfhost/docker-compose.yml` under `rest`.
3. **The Beacon server**, with Node.js 22.23.4 or newer (the October 2026
   security release; the Docker images are built on it):
   ```bash
   cd selfhost/server
   npm ci --omit=dev
   set -a; . ../.env; set +a
   DATABASE_URL=postgres://… POSTGREST_URL=http://127.0.0.1:3000 npm start
   ```
4. **The app**, built and run as anywhere else
   ([DEPLOY-ANYWHERE.md](DEPLOY-ANYWHERE.md)), with
   `NEXT_PUBLIC_SUPABASE_URL` set to the server's address and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `ANON_KEY`. The app can stay on Vercel
   while the database moves; only that address changes.

Put HTTPS in front of the server and the app, whatever you use.

---

## How it keeps members safe

Everything in [SECURITY.md](SECURITY.md) still applies, because the rules live
in the database and the database is the same. What the Beacon server adds, and
how:

- **Every request runs as the person making it.** Files, live updates and the
  data API all ask the database with that person's identity, so the row rules
  decide. The server never decides on its own who may see what.
- **Sign-in is careful about what it says.** A wrong password and an unknown
  address get the same answer, and "forgot my password" answers the same for
  everybody, so sign-in cannot be used to list a church's members.
- **Guessing is slowed down.** Passwords, e-mailed codes and two-step codes all
  have attempt limits; a six-digit code from an e-mail is gone after five wrong
  tries, and a two-step code works once only.
- **A stolen sign-in is noticed.** Staying signed in uses a token that changes
  each time it is used. If an old one is presented again later, the whole
  session ends, for whoever had the copy and the owner alike.
- **A copy of the database is not a key.** Sign-in tokens are kept only as
  hashes and authenticator-app keys encrypted, so a leaked backup does not, on
  its own, sign anybody in.
- **Files cannot run.** Uploaded files are stored under their record's id
  rather than their name, and served in a way no browser will treat as a page.
- **Signing yourself up is off.** People arrive by invitation, as the app
  intends. (`ENABLE_SIGNUP` turns it on; the app has no screen that uses it.)

**You are responsible for your copy:** the server's updates, its firewall
(only ports 80 and 443 need to be open), the secrets in `selfhost/.env`, and
the backups. If you find a security problem in the edition itself, report it
privately as [SECURITY.md](SECURITY.md) describes, not in a public issue.

---

## Differences from Supabase worth knowing

- **Live updates carry the news, not the row.** An open screen is told that
  something it shows has changed, and reads it again through the usual rules.
  The app only ever used them that way.
- **Scheduled jobs and outgoing requests** (pg_cron and pg_net on Supabase) are
  run by the Beacon server. The same four jobs run at the same times, in UTC.
- **The vault** on Supabase encrypts what is put in it. Here it does not, so
  nothing secret is put in it: the server adds its own key to its own requests.
- **No Supabase dashboard.** You look at the data with any Postgres tool
  (`psql`, pgAdmin, DBeaver), connected through an SSH tunnel, never by opening
  the database port to the internet.
- **Push notifications** to phones need the same VAPID keys as on Supabase
  ([START-HERE.md](START-HERE.md), "Push notifications to phones"), set in
  `selfhost/.env`, and the app built with `VAPID_PUBLIC_KEY` there too. With no
  keys, the database queues no push at all, exactly as a Supabase project
  without them.

---

## Moving from Supabase

**Not yet walked by this project with a real church's data.** The shape:

1. Install the edition (Steps 1 to 4) and stop the `server` and `rest`
   services, so nothing writes while you copy.
2. Copy the data with `pg_dump --data-only` from your Supabase database, for
   the schemas `public` and `private` and these tables: `auth.users`,
   `auth.identities`, `auth.mfa_factors`, `storage.buckets`, `storage.objects`.
   Restore into the edition's database. Passwords and authenticator apps keep
   working: both are stored the same way.
3. Copy the files: each row in `storage.objects` is a file in Supabase Storage,
   which the edition keeps at `data/files/<bucket>/<row id>`.
4. Start the server, rebuild the app with the new address, and test sign-in
   with a leader account before telling anybody.

If you do this, a pull request turning this section into a walked one would
help the next church.

---

## What has been checked, and what has not

Checked on every change, in CI (`.github/workflows/fresh-install.yml`):

- every migration installs on a plain Postgres 17, and the eight database test
  files pass there exactly as on Supabase;
- the result matches a Supabase database on every line of
  `supabase/tests/fingerprint.sql` except `extension`;
- seventy checks driving the Beacon server with supabase-js, the same library
  the app uses: sign-in, stolen tokens, two-step codes, recovery links, files and
  their rules, live updates reaching only the right people, the invite function
  running unchanged, the push queue, the schedule, and forged tokens refused
  (`selfhost/server/test/the-edition-holds.mjs`).

Checked once, by hand, on 20 October 2026: the app built against the edition
and signed in through its real sign-in page; and `docker compose up` starting
the database, server and data API. **Not yet checked:** building the app and
server images on an ordinary network (this project's test machine could not
reach npm from inside Docker), HTTPS with real certificates, sending through a
real SMTP account, push notifications to a real phone, managed Postgres
providers, and Safari.
