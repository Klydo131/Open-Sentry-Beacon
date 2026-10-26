# What it costs, how to keep it running, and where it goes next

**Open Sentry Beacon · 1 September 2026**

Every number in Part 1 was read from the live project on the day this was
written, not estimated. Where something could not be checked from here, it says
so rather than guessing.

> **Update, 26 October 2026.** The bill below left out tax. The latest
> invoice was **$38.47**: the Pro plan ($25), compute for the second project
> ($9.35), and tax of $4.12 (12% of the two). At about ₱61 to the dollar
> that is about **₱2,350 a month**.
> The plan is per organisation, and each church runs its own project, because
> one shared project would make the hubs one company's service, not each
> church's own. To meet the monthly cost, a church can now choose to ask its
> members: the giving room, optional and off until switched on, shows the
> month's goal and how to give, and never who gave ([HANDBOOK.md](HANDBOOK.md),
> "Keep our Hope Hub running").

---

## Part 1 — What it costs

### The headline

You are on the **Supabase Pro plan**, and you are using about **3%** of what
that plan gives you.

| What | Allowance on Pro | Actually used | Used |
|---|---|---|---|
| Database | 8 GB | 15.9 MB | 0.2% |
| File storage | 100 GB | 33.7 MB | 0.03% |
| Monthly active people | 100,000 | 52 | 0.05% |

The same usage measured against the **free** plan's limits:

| What | Free allowance | Actually used | Used |
|---|---|---|---|
| Database | 500 MB | 15.9 MB | **3.2%** |
| File storage | 1 GB | 33.7 MB | **3.3%** |
| Monthly active people | 50,000 | 52 | **0.1%** |

You would have to grow **thirty times** before the free plan felt tight.

### What is being paid for

| Item | Monthly | Status |
|---|---|---|
| Supabase Pro (organisation "Local Church") | ~$25 | **Confirmed** — the plan is `pro` |
| Second project, "Local Church App Project" | ~$10 | **Confirmed active.** 9 accounts, last used 26 August |
| Vercel | ? | **Could not check.** See below |
| Brevo (email) | $0 | Free tier |
| GitHub Actions | $0 | Free and unmetered on a public repository |
| Domain | ~$23/year | Not yet bought |

**Roughly $35 a month, for two databases holding 30 MB between them.**

### The Vercel question, honestly

The Vercel account these tools can reach is `klydo131's projects`, it is on the
**Hobby** plan, and it contains **zero projects**. The live site is therefore
deployed from an account this session cannot see — a different login, or the
same person under a different email.

So the hosting cost is the one line above that is genuinely unknown. If it is a
Hobby account it is $0; if it is Pro it is $20 per seat. **You are the only
person who can answer this**, and it matters, because Vercel's Hobby plan
forbids commercial use regardless of traffic.

### The two decisions worth money

**1. Pause the project nobody uses — saves about $10 a month.**

"Local Church App Project" is the predecessor. It has 9 accounts and was last
signed into on 26 August. Pausing keeps the data and stops the charge.

**2. Consider moving back to the free plan — saves about $25 a month.**

Only two things genuinely make Pro worth paying for at this size, and **both
already have free answers sitting in your own repository**:

| Reason to pay | The free answer, already built |
|---|---|
| A free project pauses after 7 idle days | `.github/workflows/keep-awake.yml` — a daily ping |
| A free project has no backups | `.github/workflows/backup.yml` — a weekly encrypted dump |

Neither is switched on yet. They need four secrets set in GitHub, listed in
`docs/DO-THIS-NEXT.md`.

> **Do not act on this one straight away.** Turn the two workflows on, watch
> them run for a fortnight, and **restore one backup into a scratch project so
> you have seen it work**. A backup nobody has restored is a rumour. Then
> downgrade, with the safety nets proven rather than assumed.

### What growth actually costs

Because everything runs on one shared instance with churches as tenants, the
cost per church **falls** as churches join.

| Churches on one instance | Cost each, at ~$35/month total |
|---|---|
| 1 | ~$35 |
| 5 | ~$7 |
| 10 | ~$3.50 |

Deploy a separate instance per church and the same growth multiplies the bill
instead. This is the single most valuable fact in this document.

### The meter that will move first

Not the database. **Egress** — the bytes people download.

Private files are fetched through fresh signed links that no cache keeps, so
every time somebody looks at the same photograph, it is paid for again. That is
why photos are shrunk before sending, why images load only when scrolled to,
and why video is deliberately kept out of the upload list. Link to YouTube
instead: free, and it protects both storage and egress.

Egress could not be read from here. It is on the Supabase dashboard under
Usage, and it is the number to watch.

---

## Part 2 — Running it as a start-up

### The bottleneck is Guides, and it always will be

Measured today:

| | Count |
|---|---|
| Approved accounts | 63 |
| Signed in within 30 days | 52 |
| Guides | 29 |
| Explorers | 26 |
| Active pairings | 24 |
| Capacity at 5 Explorers per Guide | **145** |

You are using **18%** of your people capacity, and about **3%** of your
infrastructure. Growth is not a hosting decision. It never was.

### The two numbers that matter this week

> **4 Explorers have no Guide.**
> **11 Guides are carrying nobody.**

Those two facts sit beside each other and cancel out. Four people signed up to
be walked with and are waiting, while eleven people who volunteered to walk with
someone have not been given anybody. That is not a capacity problem or a
software problem — it is fifteen minutes on the Director's pairing screen.

This is the clearest example of why the app is not the work. The app already
knows both numbers and shows them. Somebody has to look.

### The weekly rhythm — four questions, five minutes

1. **Is anybody unpaired?** Anything above zero is somebody being ignored.
2. **Is any Guide at their cap of five while Explorers wait?** That, and only
   that, is the signal you genuinely need to spend money or recruit.
3. **Any guild flagged "Needs a look"?** It outranks "Thriving" on purpose:
   twenty happy members and one person nobody walks with is not a healthy group.
4. **Anything in the trial room?** Safeguarding does not wait for a convenient
   week.

Without this rhythm the analytics are decoration.

### Keeping it alive when you are not the one running it

The code is public and AGPL-3.0, which protects the code. **It does not protect
the knowledge.** If you are hit by a bus tomorrow, what lets somebody else run
this is the written material, not the repository:

- The handbook and setup guides
- The restore procedure — **once you have actually performed a restore**
- The weekly rhythm above
- Per-church onboarding notes, so a new congregation does not need the person
  who built it

Reducing that dependency is the highest-value non-code work there is.

### The upgrade triggers, decided in advance

Write these down so the decision is made by a number and not by a nervous
feeling:

- **Supabase Pro** — when file storage approaches 1 GB or monthly egress
  approaches 5 GB. Watch egress first; it moves faster.
- **Vercel Pro** — when the project becomes commercial. This is a licensing
  trigger, not a capacity one, and it does not wait for you to grow.
- **More Guides** — when Guides sit at their cap with Explorers waiting. Not
  before, and never by raising the cap of five to paper over a shortage.

### What still needs building to run many churches

The app is already multi-tenant: churches are a table, `create_church()` is
restricted to Executive Directors, and every security rule is scoped by church.
What is missing is the human path around it:

- A way for a new church to be created and its first Executive appointed
  **without a developer**.
- Clarity on who is Head Executive when several churches share one instance.
  That account is the root of authority and cannot be removed from inside the
  app, by design.
- Per-church onboarding material.

---

## Part 3 — Making it more specialised for discipleship

### What it already does that general tools do not

Worth being clear about, because it is the actual product:

- **A Guide carries at most five Explorers**, enforced in the database rather
  than in a screen. Discipleship does not scale by giving one person forty
  names, and the software refuses to pretend otherwise.
- **The conversation is private between two people** and leaders cannot read it.
- **Guild health ranks "Needs a look" above "Thriving"**, so the group with one
  ignored member does not hide behind its averages.
- **A discipline record survives the removal of the person it describes.**
- **Safeguarding has a route that does not depend on the goodwill of the person
  being reported.**

None of that is in a group chat or a spreadsheet, and none of it is generic
church admin. That is the specialisation you already have.

### Where it is still generic, and what would sharpen it

These are suggestions grounded in what the data shows, not a wishlist. Today's
content numbers: **15 lessons, 7 library items, 10 prayer requests, 9
appointments, 1 blog post, 1 guild, 0 safeguarding reports.**

**1. The journey has stages, but nothing marks the moments.**
A discipleship walk has real thresholds — first conversation, a decision, a
baptism, beginning to guide somebody else. The app tracks lesson progress, which
is a proxy. Naming the actual milestones would make the journey chart mean
something a pastor recognises.

**2. Nobody graduates into a Guide.**
The most important event in discipleship is an Explorer becoming a Guide. That
is the multiplication the whole model rests on. There is currently no path for
it in the app: roles are assigned by a Director, and the moment goes unmarked.
With 26 Explorers and 29 Guides, this is the single highest-leverage feature you
could build.

**3. The library is a shelf, not a curriculum.**
7 items with no ordering. A Guide starting with a new Explorer has to decide
what to send from scratch. A recommended path — first month, first quarter —
would turn the library into an actual programme, and would make a new Guide
useful in their first week rather than their third month.

**4. Prayer is a list, not a rhythm.**
10 requests, and nothing closes the loop. "Answered" as a state, with the
Explorer able to say so, turns a to-do list into a record of what God did. That
is the thing people actually want to look back on.

**5. One guild for 63 people.**
The guild is the group layer, and it is barely used. Either it needs a reason to
exist — a purpose, a season, a study — or the concept should be trimmed. An
unused feature is not free; it is a thing every new Director has to understand
before they can ignore it.

**6. Nothing is written in the language people pray in.**
The app is English-only. For a Philippine church this is the most obvious gap
between "an app the church uses" and "an app that belongs to the church".

### The order I would build them

1. **Explorer becomes a Guide** — it is the multiplication the model depends on.
2. **A recommended path through the library** — makes new Guides useful sooner,
   which is the bottleneck.
3. **Answered prayer** — small, and it is the thing people re-read.
4. **Milestones on the journey** — makes the chart mean something.
5. **Language** — the largest job, and the one that decides whether this is
   *the church's* app.

Everything above is people-facing. None of it needs a bigger server, and that
will stay true for a long time.

---

## What could not be checked from here

Stated plainly, because a plan that hides its gaps is not a plan:

- **The Vercel account, plan and hosting cost.** The visible account has no
  projects in it.
- **Monthly egress**, which is the number most likely to move first.
- **Whether anything pushed is actually live.** This environment cannot reach
  the deployed site. Opening `/version.json` on a phone answers it: if the
  response contains `canonicalHosts`, today's code is deployed.
- **Whether commercial use applies**, which decides if Vercel Pro is optional or
  required.
