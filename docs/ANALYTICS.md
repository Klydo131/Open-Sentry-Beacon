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

## Analysis and raw data

The **Analysis** view asks five questions of one row per journey (numbered,
never named), using Spearman's rank correlation, which suits small numbers and
a stage that is an order rather than a measure (`lib/mission-analysis.ts`):

| Question | Compares | Why |
| --- | --- | --- |
| Does waiting longer for a Guide slow the journey down? | Days waited for a Guide, steps per month | Follow-up speed is the strongest lead measure churches report. |
| Do journeys with more meetings move further? | Meetings held, stage reached | Discipleship surveys find frequency of meeting goes with growth (Lifeway; Baylor on small groups). Only where meetings are visible to leaders; otherwise it says why not. |
| Are Guides carrying too many people? | Journeys the Guide carries, steps per month | Whether load is slowing journeys. |
| Is digital or in-person moving faster? | Track, steps per month | Which way of walking with people is working here. |
| Are stages being kept up to date? | Days since the journey began, stage | A sanity check: if older journeys are not further on, stages are not being updated. |

**How it stays honest.** Nothing is worked out under 8 journeys. Each answer
gives r (−1 to +1), its strength in words (under 0.1 none, under 0.3 weak, under
0.5 moderate, otherwise strong), the number of journeys, and whether it clears
the line that chance alone could reach for that many (about 1.96/√(n−1)). With
small samples a correlation is unstable and its interval wide, so "could be
chance" is said plainly. A flat column (every journey the same) gives no answer
rather than a zero. A correlation is never presented as a cause: it is a
question worth asking a Guide.

**Raw data** shows the counts behind every chart, one row per part of the
period, and one row per journey, each with a CSV download. The CSV carries no
name or id, and any cell a spreadsheet would run as a formula is quoted.

Held by `tests/the-mission-analysis-holds.mjs` (statistics checked against
values worked by hand, and a synthetic church built with a known link, which the
analysis must find) and the browser walk.

## Warnings and automations

The **Alerts** view is a warning system: eleven rules, each with a line a leader
can change and a switch, kept on the device (`lib/pulse-alerts.ts`). Urgent:
an Explorer waiting for a Guide past 7 days; a pairing request unanswered past 3.
Warning: a journey with no step past 30 days; a Guide carrying more than 5; journey
steps down 30% or more; Explorers back this week under 40%; Guides under 50%; the
numbers taking over 3 seconds to load. Watch: new Explorers down 50% or more;
expired invitations; 5 or more pieces of open feedback. Percentage rules need a
minimum base before they fire (4 steps or arrivals, 5 active Explorers, 3 Guides),
so a quiet week in a small church does not cry wolf. The Alerts tab shows a count.

The **Automations** view does only what the app may do with the leader's own
permissions. Each is Off, Ask first (the default) or Automatic, says what it will
do before it does it, and remembers when it last ran:

| Automation | Does | Quiet period |
| --- | --- | --- |
| Follow-ups for stalled journeys | Adds a follow-up to the leader's own list per stalled journey, due in two days; never twice while one is open. | A day |
| Ask the Guides for help | Posts one counts-only message to the Guides' room when Explorers are waiting. | A week |
| Tell me on this device | Shows a notification when something urgent is found (asks permission first). | A day |
| Weekly briefing | Writes the numbers and warnings as a briefing to copy, share or email. No names. | On demand |

Automatic ones run when Analytics opens, once per quiet period. In the sample
church follow-ups go on the sample list and nothing is posted. Held by
`tests/the-pulse-warns-and-acts.mjs` and the browser walk, which proves an
automatic run happens on its own and does not repeat.

**Not yet possible without a database change:** running automations while
nobody has the app open (a scheduled job on the server), sharing rule settings
across a church's leaders, and emailing the briefing directly.

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
- Lifeway Research on small-group frequency and discipleship: https://www.baptistpress.com/resource-library/news/small-group-participation-linked-to-higher-discipleship-scores-lifeway-research-finds/
- Baylor research on small groups (frequency over length): https://baptistnews.com/article/small-groups-crucial-but-not-cure-all/
- Spearman correlation and small samples: https://metricgate.com/blogs/how-to-interpret-spearman-correlation/
- Robust confidence intervals for correlations (Behavior Research Methods, 2016): https://link.springer.com/10.3758/s13428-016-0702-8
- Dashboard design principles (summary first, detail on demand): https://www.designrush.com/agency/ui-ux-design/dashboard/trends/dashboard-design-principles
- Real-time dashboard UX (deltas, sparklines): https://shop.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/
- Small-count suppression in public health: https://dph.illinois.gov/content/dam/soi/en/web/idph/resources/data-statistics/aggregate-data-suppression-policy-09242025.pdf

Two Adventist sites (ted.adventist.org, interamerica.org) could not be opened
from the build environment; their points above come from the search summaries.
