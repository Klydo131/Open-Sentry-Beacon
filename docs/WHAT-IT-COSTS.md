# What it costs, and whether video is affordable

Measured against the live systems on 1 September 2026, not estimated.

**Two things turned up while costing this, and both change the answer.**

---

## 1. This app is not on a free plan, and every document said it was

The Supabase organisation **Local Church** is on the **Pro** plan. The handbook
says "the app will run a church of a hundred on a free plan"; the pivot plan is
built around "$0/month, honestly" and lists Supabase Pro as a *future* trigger.
Both are wrong, and they have been wrong while decisions were made on them,
including the advice I gave yesterday that video "would end this church's free
plan".

There are also **two projects** on that organisation, not one:

| Project | Created | Size | Accounts | Last sign-in |
|---|---|---|---|---|
| **Open-Sentry-Beacon** | 12 Aug 2026 | 16 MB | 63 | live, today |
| Local Church App Project | 20 Jul 2026 | 14 MB | 9 | 26 Aug 2026 |

The second is the predecessor with nine accounts on it. Supabase charges per
project beyond the plan's included compute, and the API reports **$10/month**
for an additional project.

### So the bill today

| | Monthly |
|---|---|
| Supabase Pro, organisation | $25 |
| Second project, still running | $10 |
| **Total, confirmed** | **$35** |
| Vercel | **not known — see §5** |
| Brevo | $0 on the free tier |
| GitHub Actions | $0, unmetered on a public repository |

At roughly ₱58 to the dollar, **$35 is about ₱2,030 a month**, against a stated
budget of **₱2,000**.

> **You are a fraction over budget, and the whole of the overage is a project
> nobody uses.** Pausing *Local Church App Project* takes it to $25, about
> **₱1,450**, which is comfortably inside. Its data is kept while paused.
>
> I have not paused it. It holds a client's data and turning it off is not mine
> to decide.

---

## 2. What is actually being used

The church has been live for **sixteen days**.

| | Now | Pro includes | Used |
|---|---|---|---|
| Database | 16 MB | 8 GB | 0.2% |
| Files | 34 MB | 100 GB | 0.03% |
| Accounts | 63 | 100,000 monthly | negligible |

People: **63 members, 29 Guides, 26 Explorers, 24 active pairings.** Twenty-nine
Guides at five each is capacity for 145 Explorers, so the app is at about a
sixth of what its people can carry.

**Four Explorers have no Guide.** That is the only number on this page that is
about somebody being ignored rather than about money.

### The rate it is growing at

Measured over the last seven days: **15 files, 27 MB, averaging 2.14 MB each**,
and 31 messages. Every one of those files is a photograph.

| Photos, at the current rate | Per month | 100 GB reached in |
|---|---|---|
| As they were, unshrunk | ~117 MB | ~71 years |
| Shrunk, as they are since yesterday | ~21 MB | ~400 years |

**Storage is not a constraint and was never going to be.** I said yesterday that
shrinking photos was mostly a cost fix; on the Pro plan that was wrong. It is
worth keeping for two other reasons that stand on their own: it removes the GPS
coordinates a phone writes into every picture, and it cuts the traffic each
photo costs *every time somebody opens the thread*, which is the meter that
actually moves.

---

## 3. The video question, costed

A minute of phone video is roughly **80 MB** at 1080p and about half that at
720p. A photograph, after shrinking, is about **0.2 MB**. One minute of video is
therefore about **four hundred photographs**.

### Storage: not the problem

| If the church sent | Per month | 100 GB reached in |
|---|---|---|
| 1 video a week | ~350 MB | ~24 years |
| 5 videos a week | ~1.7 GB | ~5 years |

### Traffic: the meter that matters, and it still holds

Every view of a private file is a fresh download; no cache keeps them. Pro
includes **250 GB a month**.

| If the church sent | Watched by 20 people each | Share of the 250 GB |
|---|---|---|
| 1 video a week | ~6 GB/month | 3% |
| 5 videos a week | ~35 GB/month | 14% |
| 20 videos a week | ~139 GB/month | 55% |

**At this church's size, video is affordable.** That is the honest answer and it
is not the one I gave yesterday. Twenty videos a week from sixty-three people
would be unusual, and even that sits inside the plan.

### Where it stops being affordable

**Many churches on one instance**, which is the plan. Ten churches behaving like
this one, at five videos a week each, is about **350 GB a month** — past the
250 GB allowance and into per-gigabyte charges. Video is the one thing in this
app whose cost grows with *both* the number of churches and how much each one
uses it.

### Three reasons that are not about money

Costing was asked for, so these are separate and they are for the owner to
weigh, not for me:

1. **Safeguarding.** A conversation attachment has no moderation queue. A
   photograph of a minor is already a serious thing to hold; a video of one is
   a different order of risk, and this app has children in it with guardian
   consent recorded against their names.
2. **The member pays for it too.** Eighty megabytes on mobile data is a real
   cost to somebody in a congregation, and they have no way to know how big the
   thing is before it downloads. This app is built for cheap phones on
   metered connections.
3. **It may simply not play.** An iPhone records HEVC by default. Chrome on
   Android often will not play it, so an Explorer could be sent a video they
   cannot open, with nothing on screen to explain why.

### What I would do

**Allow it, with a short limit, and measure before widening it.** A 25 MB cap
takes about twenty seconds of 1080p or a minute of 720p, which is enough for
"here is the passage I meant" and not enough to be a habit. Keep the YouTube
link as the answer for anything longer. Then look at the traffic after a month
before deciding anything else.

That is a change to the bucket's allowlist, the picker, and one line of copy.
It is small. **I have not made it** — you asked for the cost first, and the
decision is yours.

---

## 4. What the money buys as churches join

The Pro plan is per organisation, not per church, and the app is already
multi-tenant. So the bill does not multiply.

| Churches on one instance | Cost each, at $25/month |
|---|---|
| 1 | ₱1,450 |
| 5 | ₱290 |
| 10 | ₱145 |

**Never one project per church.** Ten separate Pro projects is ten times $10 in
compute on top of the plan, for the same work.

---

## 5. What I cannot see, and will not guess

- **The Vercel account that serves the site.** The one this session can reach is
  `klydo131's projects`, on the free Hobby plan, and it has **no projects in
  it**. The live site is deployed from an account I have no access to. If it is
  Hobby, it is free and the totals above stand. If it is Pro, add **$20/month**
  (about ₱1,160), which would put the bill over budget again even with the old
  project paused.
- **The actual invoice.** The $25 and $10 are the published plan price and the
  figure Supabase's own API reports for an added project. The billing page is
  the only thing that can confirm what is really charged.
- **Per-gigabyte overage rates.** This sandbox cannot reach Supabase's pricing
  page. The allowances above are what matters at today's volumes; the overage
  rates matter only in the ten-church case and should be read off the pricing
  page before that decision.
- **The domain.** Yours is not pointed at anything yet, and I do not know what
  it renews at.
- **Development cost.** Your time, and the assistants. Not something I can put a
  number on.

---

## 6. The short version

- **You are on Pro, paying about $35 a month, which is roughly ₱2,030 against a
  ₱2,000 budget.** Every document in the repository said you were on a free
  plan. They have been corrected.
- **Pausing the old project takes you to about ₱1,450** and is the single
  cleanest saving available.
- **Storage will not be a problem this decade.** Traffic is the meter to watch.
- **Video is affordable at this size** and stops being affordable at about ten
  churches. If it goes in, it goes in with a short cap and gets measured.
- **Confirm the Vercel account.** It is the one number that could still put you
  over, and it has been unknown for the whole of this project.
