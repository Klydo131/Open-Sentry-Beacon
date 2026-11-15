# Analytics for leaders and IT: what to watch, and what to record

What the Executive Director and Director dashboards show, why, and what the app
should record next. Written 15 November 2026 from research into church
reporting (Adventist and wider) and web-app practice. The dashboard itself is
`components/MissionPulse.tsx`; its arithmetic is `lib/mission-pulse.ts`, held by
`tests/the-mission-pulse-adds-up.mjs` and `tests/e2e/the-mission-pulse.js`.

## What the research says

**Lead measures before lag measures.** A mission-scorecard approach used in
Adventist divisions argues that baptism-style counts are *lag* measures: they
arrive late, and a leader cannot act on them this week. *Lead* measures (who is
waiting, who has not been contacted, which journey has stopped) are the ones a
leader can do something about. The Inter-American Division has proposed treating
each baptism as the start of a documented five-year follow-up (attendance,
pastoral contact, small-group participation), and the North American Division
frames retention as nurture, discipleship and reclamation. The world church's
strategic plan ("I Will Go") reports progress against defined KPIs every year.

**Church management systems** (Planning Center, Breeze and others) converge on a
small weekly pulse: attendance trend, newcomers, follow-up completion, group
participation, and active against engaged members. Several warn against a giant
leaderboard of individuals. Follow-up speed matters most: newcomers contacted
within a day return far more often than those contacted after a week.

**Web-app practice** adds two lenses:

- *Product health*: activation (did a new person reach the first useful step),
  time to value, and retention, with **WAU/MAU** (weekly active out of monthly
  active) as the stickiness measure for a tool people use weekly rather than
  daily. Always compare a period with the one before it.
- *System health*: Google's four golden signals (latency, traffic, errors,
  saturation) and the Core Web Vitals for what a person feels on their phone.

**Privacy.** Health agencies publishing counts suppress small cells (commonly
under 5). Inside the church app, leaders already see named lists for the people
they are responsible for, so the dashboard shows counts without names and leaves
the names on the screens that already show them. Anything published outside
the church goes through the counts-only trends view, which hides cells under 5.

## What the dashboard now shows

| Section | Kind | Measures |
| --- | --- | --- |
| **Needs attention** | Lead | Explorers waiting for a Guide (overdue after 7 days); pairing requests unanswered (overdue after 3); journeys with no step in 30 days; expired invitations; open feedback. All clear when nothing waits. |
| **In the last 7 / 30 / 90 days / 12 months** | Lag, with the period before | New Explorers, journey steps forward (a step back never counts), commissioned, meetings held, new pairings, new Guides, invitations sent and used. Each with its change and a small chart of the period. |
| **The journey, right now** | Pipeline | Active journeys at each stage, the middle number of days there, and how many are stalled. |
| **People and engagement** | Lead | Explorers and Guides; waiting for a Guide and the middle wait; new Explorers given a Guide; back this week (WAU/MAU) for Explorers and Guides. |
| **The app itself** | System (for IT) | Open feedback, invitations waiting and expired, meetings in the next 14 days, how long the numbers took to load, and whether this is the sample church or yours. |

The period is remembered on the device. Numbers count up and bars grow, both
skipped for anyone who asks for less motion. Everything is built from records
the app already keeps; no database change was needed.

## What to record next (not built yet)

Each needs a database change, which is applied to the live databases only with
the owner's approval.

1. **First contact time.** When a Guide first messages a new Explorer, so the
   dashboard can show the middle time to first contact. The research's single
   strongest lead measure.
2. **Lessons completed and Bible study attendance**, by period, as the
   discipleship counterpart to journey steps.
3. **Prayer requests answered or followed up**, as a count, never the words.
4. **Baptism and church-membership dates** for Explorers who join the church,
   so the five-year follow-up can be measured (still attending, still in a
   small group, contacted this quarter).
5. **Error rate and slow screens** from the hosting platform (errors per day,
   slowest pages, Core Web Vitals), shown beside "The app itself" for IT.
6. **Retention cohorts**: of the Explorers who joined in a month, how many are
   still active one, three and six months later.

## Sources

- Implementing a Mission Scorecard (Trans-European Division): https://ted.adventist.org/mission/wp-content/uploads/2023/12/Implementing-a-Mission-Scorecard-WagenerSmith-1.pdf
- Inter-American Division on five-year follow-up after baptism: https://interamerica.org/?p=142822
- North American Division secretary's report on nurture and retention: https://www.nadadventist.org/?p=7652
- "I Will Go" strategic plan booklet (objectives and KPIs): https://executivecommittee.adventist.org/wp-content/uploads/2019/10/IWillGo-booklet-final-digital.pdf
- Adventist Church Management System and the ASTR statistics: https://news.adventist.asia/all/adventist-membership-in-the-southern-asia-pacific-region-nears-completion-of-the-acms
- Annual Statistical Report 2021 (ASTR): https://documents.adventistarchives.org:443/Statistics/ASR/ASR2021.pdf
- Planning Center custom dashboards: https://www.planningcenter.com/blog/create-custom-dashboards
- Church attendance dashboards: https://www.quadratichq.com/use-cases/church-attendance-tracking-software-dashboard-analytics
- Product analytics dashboard (activation, retention): https://www.basedash.com/dashboard-templates/product-analytics-dashboard
- Adoption metrics in complex SaaS (WAU/MAU over DAU/MAU): https://usetandem.ai/blog/adoption-metrics-complex-saas
- The four golden signals: https://www.splunk.com/en_us/blog/learn/sre-metrics-four-golden-signals-of-monitoring
- Small-count suppression in public health: https://dph.illinois.gov/content/dam/soi/en/web/idph/resources/data-statistics/aggregate-data-suppression-policy-09242025.pdf

Two Adventist sites (ted.adventist.org, interamerica.org) could not be opened
from the build environment; their points above come from the search summaries.
