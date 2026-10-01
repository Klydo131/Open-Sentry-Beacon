# Run it anywhere

Four ways to run Hope Beacon, each written as a worked example, plus what
changes when you leave Supabase. Each says what has actually been run and what
has not. That honesty is the point: a guide that claims every host is tested
sends somebody's Saturday afternoon down a path nobody walked.

| You want | Read | Accounts needed | Run by this project |
|---|---|---|---|
| To see it, today, in ten minutes | [1. On your computer, no accounts](#1-on-your-computer-no-accounts) | None | **Yes**, on every check |
| A real church on the internet | [2. Vercel and Supabase](#2-vercel-and-supabase) | GitHub, Vercel, Supabase | **Yes**, it is how this project runs |
| To develop against a real database without the cloud | [3. On your computer, with a real database](#3-on-your-computer-with-a-real-database) | None | **In part**, see the section |
| Your own server, or another host | [4. Other hosts](#4-other-hosts) | Depends on the host | **No**, written from how the app is built |

The detailed click-by-click for scenario 2 is
[START-HERE.md](START-HERE.md) Parts 3 and 4. This page does not repeat it; it
gives the shape of each scenario and the things that bite.

---

## What every scenario shares

Read this once; every section below assumes it.

- **Node.js 22 or newer** (`engines` in `package.json`). On a host this is a
  setting, not something you install.
- **Two settings decide everything.** With `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` set, the app is the live app on your
  database. With neither, it is the sample church, running entirely in the
  visitor's browser. There is no third setting. `lib/mode.ts` is the switch.
- **Both are public by design.** Anything named `NEXT_PUBLIC_` is sent to
  every visitor's browser. The publishable (anon) key is made for that, and
  the database's own rules are what protect your data. **The service_role key
  never goes anywhere with `NEXT_PUBLIC_` in its name, on any host.** It
  bypasses every rule. The only code that holds it is the invitation function,
  which runs inside Supabase.
- **They are read when the app is BUILT, not when it starts.** The browser's
  copy is baked into the files `npm run build` writes, and so is the security
  policy that lets the browser reach your database (`next.config.mjs` derives
  it from the URL). Change either value, and you must build again. A host that
  builds for you (Vercel, Netlify) does this on every deploy. A Docker image
  needs them as build arguments (see 4b).
- **The security headers travel with the app.** They are in `next.config.mjs`,
  so any host that runs Next.js serves them. There is nothing to configure per
  host, and nothing to copy into a `vercel.json` or `netlify.toml`.
- **Updates reach open screens on any host.** `/version.json` reports the
  build, and an open app offers a one-tap restart within about thirty seconds
  of a new deployment ([UPDATES.md](UPDATES.md)).
- **It cannot be a static site.** Sign-in runs on the server
  (`app/api/auth/sign-in/route.ts`), so hosts that only serve files (GitHub
  Pages, a plain bucket) cannot run it.

---

## 1. On your computer, no accounts

**The scenario.** Ana is on a church's tech team. Before anybody signs up for
anything, she wants to see what the app does, on her laptop, in ten minutes.

```bash
git clone https://github.com/Klydo131/Open-Sentry-Beacon.git
cd Open-Sentry-Beacon
npm install
npm run dev          # http://localhost:3000
```

No `.env.local`, no database. The banner says "No database connected", and the
sample church loads: invented people, invented messages, all stored in that
browser only. Ana picks a person on the sign-in page and walks the app as a
Guide, an Explorer or a Director. Nothing she does leaves her laptop.

**What it is good for:** seeing it, showing it to the church board, working on
screens, and running the checks (`npm run verify`).

**What it is not:** a place for real people's details. Each browser has its own
sample church, and clearing browser data resets it.

**Run by this project:** yes. The checks build the app and walk it this way, in
a real browser, on every change (`npm run verify:all`). The no-database start
is a rule, enforced by `tests/no-backend.js`.

---

## 2. Vercel and Supabase

**The scenario.** Grace Chapel (an invented church) is ready to use it for real:
about forty members, one Director, a few Guides. Their volunteer has a free
GitHub account, a free Vercel account and a free Supabase project, and wants
`gracechapel.example.org` to work on everybody's phone.

**The shape of it:**

```
  members' phones ──https──▶ Vercel (the app)  ──https──▶ Supabase (database, sign-in,
                                                          files, invitation e-mails)
        ▲                                                         │
        └────────────── invitation e-mail (Brevo, optional) ◀─────┘
```

**The checklist,** in order. The click-by-click is [START-HERE.md](START-HERE.md).

1. **Supabase project.** Copy the Project URL and the publishable key.
2. **The tables.** `npx supabase db push --db-url "<connection string>"`
   runs every file in `supabase/migrations/`, in order, and remembers what it
   ran.
3. **Vercel project** from the GitHub repository, Node.js 22. Add the two
   `NEXT_PUBLIC_` values **before** the first deploy (they are read at build
   time).
4. **Supabase → Authentication → URL Configuration:** Site URL
   `https://gracechapel.example.org` (the bare address, not a page), Redirect
   URLs `https://gracechapel.example.org/**`. Skip this and invitation links
   point at `localhost` while reporting success.
5. **Function secrets:** `SITE_URL=https://gracechapel.example.org`, and for
   e-mail `BREVO_API_KEY` and `BREVO_SENDER`. Then deploy the functions:
   `npx supabase functions deploy invite` (and `places` if you want meet-up
   place suggestions). A deployed function and a committed one are separate
   things; deploy from the repository so they match.
6. **First Director:** sign up in the app, then run
   `supabase/seed/01_make_me_the_first_director.sql` with that address.
7. **Optional GitHub secrets** for the scheduled jobs in `.github/workflows/`:
   `SUPABASE_URL` and `SUPABASE_ANON_KEY` for `keep-awake` (a free project is
   paused after a week of no visits), `SUPABASE_DB_URL` and
   `BACKUP_PASSPHRASE` for `backup`. The URL must be the full
   `https://<ref>.supabase.co`; a value that does not resolve fails every night.

From then on, every push to `main` is a new deployment. Vercel builds
Production from `main` only, so a change on another branch is not live until it
is merged.

**Check it like a member would:** on a phone, on mobile data with wifi off, open
the address, sign in, send a message.

**Run by this project:** yes. This is how the project's own deployment runs. The
database half is also rebuilt from nothing on every push
(`.github/workflows/fresh-install.yml`), by both routes in step 2, and the two
results must match. Pushing to `main` and watching Vercel build is not
something an automated check here can see; a person looks.

---

## 3. On your computer, with a real database

**The scenario.** Ben is a developer who wants to change how invitations work.
He needs real sign-in and real tables, but does not want to touch the church's
live database while he experiments.

There are two ways, and the first is the one this project uses.

### 3a. Your app, a second free Supabase project

Make a separate free Supabase project just for development, and run the app on
your computer against it:

```bash
npm run setup        # asks for the URL and key, writes .env.local
npx supabase db push --db-url "<the dev project's connection string>"
npm run dev
```

`npm run setup` refuses the service_role key, and refuses any address that is
not `https://`. Everything about the live scenario applies, with
`http://localhost:3000` in the Redirect URLs.

### 3b. Everything on your computer: the Supabase CLI's local stack

The Supabase command-line tool can run the whole backend in Docker on your
machine: database, sign-in, files and functions.

```bash
# Docker must be running.
npx supabase init                    # once: this repository has no supabase/config.toml
npx supabase start                   # prints the API URL and the anon key
npx supabase db push --local         # runs supabase/migrations/ into it
```

Then write `.env.local` by hand, from what `supabase start` printed:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<the anon key it printed>
```

and `npm run dev`. `npm run setup` will not accept this address, because it
refuses plain `http://` to keep passwords off the network. On this computer
there is no network to cross. The app's security policy allows plain `http://`
for exactly three hostnames (`localhost`, `127.0.0.1`, `[::1]`) and no others
(`tests/backend-csp.mjs`).

Invitation e-mails from a local stack land in its own test mailbox, at the
address `supabase start` prints, not in anybody's inbox.

**Run by this project, honestly:**
- **Run:** every migration, from an empty database of the same Postgres build
  Supabase uses, on every push (`scripts/fresh-install.sh`, both through
  `psql` and through `supabase db push`). The security policy's handling of the
  local address is checked on every run.
- **Not run:** `supabase start` itself, and the app signed in against it. The
  machine these checks run on has no Docker service. Treat 3b as expected to
  work and not yet walked, and say so in a pull request if you walk it.

---

## 4. Other hosts

Next.js runs in many places. Everything in this section follows from how the
app is built (a standard Next.js 15 server app with no host-specific code), but
**none of it has been run by this project**. If you deploy to one of these,
a pull request that moves it from "expected" to "walked" is very welcome.

What every host must give you: **Node.js 22**, **HTTPS** (installing to the home
screen and working offline both need it), and the two `NEXT_PUBLIC_` settings
**at build time**. Then do the Supabase side of scenario 2 (steps 1, 2 and
4 to 7) with your own address.

### 4a. Netlify

Import the repository; Netlify recognises Next.js and runs its own adapter. Set
`NODE_VERSION=22` and the two `NEXT_PUBLIC_` settings under Environment
variables, then deploy. Same as Vercel in every way that matters here.

### 4b. Docker, on your own server

For a church that already has a server, or wants to own the whole thing.

```dockerfile
# Dockerfile (an example; not in the repository and not run here)
FROM node:22-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Read at BUILD time: the browser's copy and the security policy come from these.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["npm", "run", "start"]
```

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key> \
  -t hope-beacon .
docker run -d -p 3000:3000 --restart unless-stopped hope-beacon
```

Put something that does HTTPS in front of port 3000: Caddy does it in two
lines and renews the certificate itself. Both values are public, so baking them
into the image is fine. Never pass the service_role key here.

### 4c. Render, Railway, Fly.io and other "Node app" hosts

Build command `npm ci && npm run build`, start command `npm run start`. These
hosts pass a `PORT`, and `next start` listens on it. Set Node 22 and the two
settings as build-time variables.

### 4d. Cloudflare

Through the OpenNext adapter for Cloudflare, which turns a Next.js app into a
Worker. It needs adapter configuration in the repository, which is not here
today. Of the four, this is the furthest from walked.

---

## Moving off Supabase

The app meets its backend at three seams: where feedback goes, the store, and
real-time delivery. The sample church already runs the whole app with no
backend at all, and the Supabase half shows one complete answer.
[BACKENDS.md](BACKENDS.md) walks each seam. The rules that must come with you,
whatever the database:

- **Authorisation in the database**, not in the app. Every table's rule is
  listed in [BACKEND-MAP.md](BACKEND-MAP.md).
- **Nobody can raise their own role.** Here the database refuses it
  (`lock_privileged_profile_columns`, see SECURITY.md "Nobody promotes
  themselves", held by `tests/nobody-promotes-themselves.mjs`). A new backend
  needs its own equivalent before anybody signs up.
- **Add the new backend's address to `connect-src` and nowhere else** in
  `next.config.mjs`. Widening `default-src` is the shortcut that gives every
  other protection away at once.

---

## When it is up

`npm run verify:all` on your copy, then the four-line check from scenario 2 on
a real phone. For a church about to use it on iPhones, also the four iPhone
checks in [PLATFORMS.md](PLATFORMS.md#the-ios-caveat-stated-properly).
