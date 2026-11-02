# What it costs, and how to run your own

For whoever sets Hope Beacon up for their own local church: a developer, a
church's IT volunteer, or somebody working with an AI assistant. Four things,
in the order you meet them: **create it, budget for it, secure it, and make
it your own.**

Prices are what each service published when this was written (October 2026).
They change, so read each service's pricing page before you decide.

---

## 1. Create it

**One church, one copy.** Each church runs its own Supabase project and its
own deployment, under its own accounts. Its members' data, its bill and its
decisions stay its own, and no other church's settings or outages reach it.

| You want to | Read |
|---|---|
| Set it up with no coding, step by step | [START-HERE.md](START-HERE.md), "The simple path, for everyone else" |
| Set it up with an AI assistant doing the typing | [AI-SETUP-GUIDE.md](AI-SETUP-GUIDE.md) |
| Set it up by hand, as a developer | [START-HERE.md](START-HERE.md), "The manual path, for people who code" |
| Run it without Supabase, on your own server | [POSTGRES.md](POSTGRES.md) |
| Host it somewhere other than Vercel | [DEPLOY-ANYWHERE.md](DEPLOY-ANYWHERE.md) |

**Start from your own fork.** Fork this repository into your own GitHub
account first, and connect *your fork* to Vercel. Then the church's copy
updates when you choose, not when somebody else pushes.

---

## 2. Budget for it

### What you pay for

| Service | What it does | Free | Paid |
|---|---|---|---|
| **Supabase** | The database, sign-in and files | 500 MB database, 1 GB files, 5 GB traffic a month, 50,000 monthly users. **Pauses after 7 idle days. No backups.** | **Pro: $25 a month** per organisation: 8 GB database, 100 GB files, 250 GB traffic, 100,000 monthly users, seven days of daily backups. Each extra project on it adds about $10 a month. |
| **Vercel** | Serves the app | **Hobby: free, for non-commercial use only** | Pro: $20 a month per team member |
| **E-mail** (Brevo, or any SMTP account) | Invitations and password resets | A free tier is enough for invitations ([EMAIL.md](EMAIL.md)) | Only if a church sends far more than invitations |
| **GitHub** | The code, and the keep-alive and backup jobs | Free; Actions are unmetered on a public repository | — |
| **A domain** | Your own address | Optional: the app works on the address Vercel gives it | A year's renewal; prices vary by name |

**Add your local tax.** In the Philippines that is 12%, so Supabase Pro comes
to about **₱1,710 a month** ($25 plus 12%).

### Three budgets

1. **₱0 a month.** Supabase Free and Vercel Hobby, with this repository's two
   free jobs switched on, because they answer the free plan's two gaps:
   - `.github/workflows/keep-awake.yml` touches the database once a day, so
     it never reaches its seventh idle day;
   - `.github/workflows/backup.yml` makes a weekly encrypted backup.

   Section 3 has the setup for both. This suits a small church, as long as
   its use stays non-commercial.
2. **About ₱1,710 a month.** Supabase Pro. No pause, daily backups from
   Supabase itself, and allowances a single church is unlikely to outgrow.
3. **Add about $20 a month per person** for Vercel Pro if the use becomes
   commercial. That is Vercel's rule about what the site is for, and it
   applies however small the church is.

### The meter to watch is traffic

Text costs almost nothing; files are what move the bill. A private file is
downloaded again **every time somebody opens it**: no cache keeps it, because
each view gets a fresh signed link.

- **Photos are shrunk on the phone before sending,** to about 0.2 MB each.
  1 GB holds roughly five thousand of them.
- **Video is the expensive thing.** A minute of 1080p phone video is about
  80 MB, which is four hundred shrunk photos, and it is paid for again on
  every view. So only a blog post or an announcement may carry a clip: one
  per post, 50 MB at most, and 200 MB of files per person. Conversations take
  no video. For anything longer, share a YouTube link.
- **Read the number monthly:** Supabase, **Usage**, egress.

### Decide when to upgrade before you need to

Then the decision is made by a number, not a nervous week:

- **Supabase Pro:** when files approach 1 GB, traffic approaches 5 GB a
  month, or you would rather Supabase kept the backups than a workflow.
- **Vercel Pro:** when the use becomes commercial.
- **More Guides, not more servers:** a Guide walks with at most five
  Explorers. When the Guides are full and Explorers wait, the answer is
  people. A bigger plan does not help.

### Paying for it

The app has an optional giving room, off until a church switches it on. It
shows the month's goal and how to give, and never who gave. See
[HANDBOOK.md](HANDBOOK.md), "Keep our Hope Hub running".

---

## 3. Secure it

Each step is one sitting. Do them before the first member is invited.

1. **Keep the keys where they belong.** Only the *anon* (publishable) key
   goes in the app. The **service role key passes every security rule**: it
   lives in the server functions' settings and nowhere else, never in a file
   in the repository, and never under a `NEXT_PUBLIC_` name. `tests/no-secrets.js`
   fails the build if one is committed. Also turn on GitHub's **secret
   scanning** and **push protection** for your fork: they refuse a known key
   at `git push`, before it is public.
2. **Switch on the backup, then restore it once.**
   - In GitHub, under **Settings → Environments**, make an environment called
     `backup`. Allow `main` only, and add yourself as the required reviewer.
   - Give it two secrets:
     - `SUPABASE_DB_URL`: Supabase, **Project Settings → Database →
       Connection string**, the URI;
     - `BACKUP_PASSPHRASE`: a long passphrase, kept in a password manager
       first.
   - Run **Actions → backup → Run workflow**.
   - Decrypt what it made:
     `gpg --decrypt --output beacon.sql beacon-<date>.sql.gpg`.

   A backup nobody has restored is a rumour. The workflow's own header has
   the detail.
3. **On the free plan, switch on the keep-alive.** In **Settings → Secrets and
   variables → Actions**, add two secrets:
   - `SUPABASE_URL`: the Project URL;
   - `SUPABASE_ANON_KEY`: the anon key.

   Then **Actions → keep-awake → Run workflow** once, to see it work.
4. **Shorten how long a sign-in code lasts.** In Supabase, **Authentication**,
   set how long an e-mailed code or link stays valid to **3600 seconds** or
   less. A code that lasts longer has longer to be stolen.
5. **Meet the law before the members arrive.** This app holds sensitive
   personal information under the Philippine Data Privacy Act: a person's
   age, and their religious affiliation.
   - **Name a Data Protection Officer,** with an e-mail address that is not
     a personal one.
   - **Fill in Settings → Church → Legal details:** the legal name, the
     registered address, the officer and their e-mail. The Terms of Use and
     the Privacy Notice show these.
   - **Decide how long things are kept.**
   - **Register with the National Privacy Commission** once the church
     passes about a thousand members.

   [DATA-PROTECTION.md](DATA-PROTECTION.md) is the map a lawyer will want.
6. **Keep it current.** Apply database updates in order, and read
   [CHANGELOG.md](../CHANGELOG.md) before each one.
   [SECURITY-LAYERS.md](SECURITY-LAYERS.md) explains every layer and what
   proves it. [SECURITY.md](SECURITY.md) explains how to report a weakness
   privately, through the repository's **Security** tab.

---

## 4. Make it your own

- **The name and colours** are in `lib/brand.ts`: `APP_NAME`,
  `APP_SHORT_NAME`, and the brand colours. The browser tab, the installed
  app, link previews and e-mails all read them. "Hope Beacon" is an example.
- **Your source address** is `SOURCE_URL` in the same file. Point it at your
  fork. The app is AGPL-3.0: if you change it and run it for other people,
  its **Source** link must lead to your changed code.
- **Your church** is in the app itself. A Director sets its name and legal
  details in **Settings → Church**, and giving in **Settings → Giving**. The
  roles are the Executive Director, Directors, Guides and Explorers. People
  join only by invitation.
- **Where it is hosted.** The Privacy Notice (`app/privacy/page.tsx`) names
  the hosting region. If your Supabase project is not in Seoul, change it.
- **Your own domain.**
  1. In Vercel, open **Settings → Domains**, add the domain, and create the
     records Vercel shows you with whoever sold you the name.
  2. Then set `CANONICAL_HOST` to the domain and redeploy.
  3. **Tell the members before you move.** An installed app is tied to its
     address, so every installed copy has to be added again from the new one.
- **Changing the code safely.** [BUILD-YOUR-OWN.md](BUILD-YOUR-OWN.md) covers
  the front end and the backend. [CONTRIBUTING.md](../CONTRIBUTING.md) covers
  sending a change back. `npm run verify` must pass before anything reaches
  your church.
