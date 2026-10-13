# Going live: from a trial to real members

**For the person who will run Hope Beacon for real people, and the developers
who support them.** [START-HERE.md](START-HERE.md) sets the app up. This page is
what to check, fix and prove before the first real member is invited, so that
the first day with real people is not also the day the problems are found.

Every item below was learned on Hope Beacon's own first service: a trial run in
which church leaders used the app with test information for eight weeks. Each
problem was found there, by checking, before any real member joined. None of it
needs to be found again.

---

## The rule that matters most: start clean

**Real members go into a new, empty project. Nothing is copied from a trial.**

| Moves to production | Does not move |
| --- | --- |
| The code (Vercel builds it from `main`) | Accounts and profiles |
| The database structure (built from `supabase/migrations/`) | Conversations, prayers, notes, journeys |
| | Files and pictures |
| | Records and logs |
| | Keys, passwords and secrets: make new ones |

Cleaning a trial project by hand leaves things behind: files whose records are
gone, accounts nobody can tell apart from real ones, keys that many people have
handled. A new project has none of them. People from the trial who stay
involved join production by a new invitation, like everybody else. Keep the
trial project, untouched, until production has run safely for a couple of
weeks, then delete it on a date your Data Protection Officer agrees.

**Never run `supabase/seed/02_demo_congregation.sql` on production.** It loads
sample people. Sample people belong in a separate test project.

---

## Ten steps, each with its proof

A step is done when its proof has been **seen**, not when the command finished.
Write each proof down: the date, who did it, and what was seen.

| # | Step | Where it is explained | Proof |
| --- | --- | --- | --- |
| 1 | Two named custodians, each with their own login and two-step sign-in on GitHub, Supabase, Vercel and Brevo. Keys go in a password manager, never in chat, e-mail or the repository. | This page | Both can sign in to every console |
| 2 | A **new** Supabase project. A paid plan for real members: the free plan keeps no backups and pauses after a week without visits. Record its region. | [START-HERE.md](START-HERE.md) Part 3, Step 2 | The project is running; its region is written down |
| 3 | Build the tables with `npx supabase db push`, then run `supabase/tests/fingerprint.sql` in the SQL editor. | START-HERE Part 3, Step 3 and Step 8 | "Remote database is up to date"; the fingerprint is saved |
| 4 | Function secrets; deploy `invite`, `places` and `erase`; add the two Vault entries the nightly jobs read (`notify_service_key`, `notify_function_url`). | START-HERE Part 3, Steps 5 to 7b, and Step 6 item 5 | An invitation to a second address of your own arrives from your church's name and opens your app |
| 5 | Vercel: the two `NEXT_PUBLIC_` values **before** the first build. The publishable key only. | START-HERE Part 4 | The address opens on a phone using mobile data |
| 6 | Supabase Authentication: Site URL and Redirect URLs; sign-in e-mail through your provider; e-mail code expiry 3600 seconds or less; minimum password length 10; Multi-Factor, authenticator app (TOTP) enabled, which two-step sign-in in the app needs. | START-HERE Part 4, step 7; [DEMO-SETUP.md](DEMO-SETUP.md) steps 1 to 3 | The Security Advisor shows no warnings |
| 7 | GitHub: protect `main` (pull requests only, checks must pass); turn on dependency alerts and private vulnerability reporting; create the `backup` environment with its two secrets. On a paid plan, turn the keep-awake workflow off. | `.github/workflows/backup.yml`, its opening notes | A backup run started by hand finishes green |
| 8 | The first Executive Director: sign up in the app, then run `supabase/seed/01_make_me_the_first_director.sql`. | START-HERE Part 3, Step 4 | They land on the leader screens |
| 9 | Restore the backup into a separate, empty project, and time it. | `.github/workflows/backup.yml`, "TO RESTORE" | It restored; the time is written down |
| 10 | Run `supabase/tests/ready-for-real-members.sql` (below), and fix every NOT YET. | This page | Every line READY, or an INFO line that is understood |

---

## The readiness check

`supabase/tests/ready-for-real-members.sql` asks, at once, every question the
trial had to answer by hand. Paste it into the SQL editor of the production
project and run it. It only reads: it counts rows and reads the **names** of
scheduled jobs and Vault entries, never a member's details and never a
secret's value, so its output can go straight into your go-live record.

| It checks | Why, from the trial |
| --- | --- |
| Row-level security on every table | The rules that keep each person to their own information |
| The three scheduled jobs exist | A 30-day promise was kept only when somebody happened to share a link |
| The Vault entries the nightly jobs read | The trial's Vault was empty, so the nightly file removal could never have run |
| No files of deleted records waiting | Deleted records had left their files behind |
| No shared-link entries older than 30 days | The privacy notice promises 30 days |
| No sample addresses (`example.test` and the like) | Test and real accounts could not be told apart |
| No expired invitation password still active | Invitation passwords last three days |
| An approved Executive Director exists | Somebody has to hold the first seat |
| Accounts without consent on record (a count) | Consent was asked at one of the two ways in |
| Leaders using two-step sign-in (a count) | No leader on the trial used a second step, and the app had nowhere to set one up |
| The newest database change applied | Features were finished in the code but missing on the live database |

---

## What the trial taught, in one table

| What happened | Why | What now prevents it |
| --- | --- | --- |
| Consent was recorded for almost nobody | It was asked on the sign-up page, and most people came in through an invitation password | A consent step in front of the whole app for anybody without a record |
| The backup never ran, and nobody knew | Its two secrets were never added, and nobody read the failed runs | Step 7 and step 9: a backup counts only once it has been restored |
| A nightly job failed every night | Its address setting was incomplete, and on a paid plan it was not needed | Every scheduled job has an owner and a reason, or is switched off |
| Features were in the code but not on the live database | Code goes live on merge; a database change is applied by hand, later | A feature is called live only after its change is applied and checked |
| The fresh-install test failed for six days | The test database gave more power than a real project does | A failing check is reproduced and fixed the same day |
| Files outlived their records | The database cannot delete stored files | The erase list, the `erase` function and its Vault entries, from day one |
| A leader could act above their rank | Actions were checked for leadership, not for rank | Every leader action is tested at the edge of its authority |
| Leaders' message-history tool never worked, and needed no report | It looked for a column that does not exist, and asked only for leadership | It now needs a safeguarding report, and each reading is recorded |
| No leader used a second step at sign-in | The app had nowhere to set one up | Two-step sign-in in Settings, and a database that refuses a password alone once it is on |
| Documents promised what the service did not do | They were written from plans, not from the live service | Every statement about the live service says when and how it was checked |

---

## Still being built

- **Requiring two-step sign-in for leaders.** Since 13 October 2026 anybody can
  turn it on in Settings, Password, and it is recommended to leaders on that
  page. Making it required for Directors and Executive Directors is a decision
  for your church; the readiness check counts who has it.
- **Safari.** A few automated screen walks fail only in Safari. Test on a real
  iPhone before your first members join.

---

## Working with AI tools on your copy

Read [AI-LIMITS.md](AI-LIMITS.md): what an AI tool can do here, what it cannot
know, and what it must never do, whoever is driving it.
