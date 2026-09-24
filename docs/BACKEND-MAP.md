# The backend, on one page

Read this before changing anything in `supabase/`. It is the map the rest of the
docs assume you already have.

Everything here was read out of the **live database** on 9 September 2026, not
transcribed from the migrations. Where the two ever disagree, the database is
the truth and the migration that drifted is the bug.

---

## The one idea

**The database decides who may see what. Nothing else does.**

Not the browser, not `lib/live/data.ts`, not the screen. Every query the app
makes goes through PostgREST as the signed-in person, and row level security
returns the rows they are entitled to. A filter written in JavaScript protects
nobody: the browser can call PostgREST directly with the same public key, so
anything only the client enforces is enforced nowhere.

That is why `lib/live/data.ts` opens with four rules and why its functions look
so plain. They ask for what they want. The answer is already correct.

---

## The vocabulary

Almost every policy in the system is written from these predicates. Learn
these nine and you can read any policy in the codebase.

| Predicate | True when |
|---|---|
| `is_approved_user()` | you are signed in **and** a Director has approved you |
| `auth_role()` | your role: `ds` · `dm` · `admin` · `executive` |
| `my_church_id()` | the church you belong to |
| `can_access_church(c)` | you belong to `c`, or you oversee it |
| `manages_church(c)` | you are an admin of `c`, or an executive over it |
| `leads_church(c)` | leadership of `c`, for the discipline record |
| `in_pairing(p)` | you are one of the two people in pairing `p`, and still approved |
| `is_paired_with(x)` | you walk with `x`, either direction |
| `in_trial(t)` | you are a party to hearing `t` |

They are all `SECURITY DEFINER`, which is deliberate: a policy on `pairings`
that read `pairings` directly would re-enter its own policy and Postgres would
refuse the query outright with *"infinite recursion detected in policy"*. That
happened once, on a sibling deployment, and it took two screens down together.
Every cross-table test goes through one of these instead.

---

## Every table, and who may read it

47 tables. **Row level security is on for all 47.** No exceptions, and the
verify gate fails if a new one arrives without it.

### The people

| Table | Who may read | Live |
|---|---|---|
| `profiles` | `manages_church` — plus your own row and the people you walk with, through narrower policies | ● |
| `churches` | `can_access_church` | ● |
| `church_executives` | `can_access_church` | |
| `invites` | `manages_church` | ● |
| `recommendations` | the Guide who made it, or `manages_church` | ● |
| `profile_changes` | `is_paired_with` | ● |

### The relationship

| Table | Who may read | Live |
|---|---|---|
| `pairings` | the two people in it, or `manages_church` | ● |
| `pairing_requests` | the Guide who asked, or `leads_church` | ● |
| `messages` | `in_pairing` | ● |
| `pairing_media` | `in_pairing` | ● |
| `meetings` | `in_pairing` | ● |
| `journey_events` | the Guide, or `manages_church` | ● |
| `seeker_notes` | **the author alone** | |
| `follow_ups` | the owner alone | ● |
| `prayer_requests` | whoever wrote it; the one Explorer a Guide's request was written to, while they walk together; a Guide, for their Explorers' own requests | ● |
| `prayer_encouragements` | same as the request it belongs to | ● |

### The library and the studies

| Table | Who may read | Live |
|---|---|---|
| `materials` | yours, or `can_read_material` | ● |
| `material_shares` | `in_pairing` | ● |
| `material_hides` | yours alone | ● |
| `lesson_series` | published in your church, yours, `manages_church`, or shared to you as a Guide | ● |
| `lessons` | through the series they belong to | ● |
| `lesson_files` | through the lesson | ● |
| `lesson_reads` | `may_see_reading` | ● |
| `lesson_assignments` | `in_pairing` | ● |
| `lesson_guide_shares` | `manages_church`, or the Guide it was shared with | |

### The church's voice

| Table | Who may read | Live |
|---|---|---|
| `announcements` | your church | ● |
| `blog_posts` | yours, or `can_read_post` | ● |
| `blog_audience` | the author of the post | |
| `guide_room_messages` | `in_guide_room` | ● |
| `guilds` · `guild_members` | your church, or leadership over it | ● |
| `notifications` | yours alone | ● |

### Safeguarding

| Table | Who may read | Live |
|---|---|---|
| `reports` · `report_files` | an approved **admin or executive of that church** | ● |
| `trials` · `trial_statements` · `trial_parties` | `in_trial` — a party to that hearing, nobody else | ● |
| `discipline_log` | `leads_church` | ● |
| `feedback` | `manages_church`, or its author | ● |
| `activity_record` | `manages_church` | |

---

## The nine tables with no policy at all

`app_settings` · `blog_views` · `guild_activity_posts` · `guild_activity_amens`
· `library_activity` · `library_blocks` · `message_revisions` ·
`pairing_library_permissions` · `security_audit_events`

RLS on, zero policies, which in Postgres means **deny everything**. Nothing
reads these directly. They are reached through `SECURITY DEFINER` functions that
apply their own rule and often return *less* than the row holds — the guild feed
computes an `author_label` rather than handing over `author_id`, so it decides
how much of a writer's identity each reader sees.

`message_revisions` is the newest and shows the pattern at its plainest: it
holds what a message said before it was edited or taken back, and it is
unreadable by everybody — including the two people in that conversation.
Leadership reads it through a definer function when a report is being looked at,
and nowhere else.

**This is a deliberate pattern, and it has one sharp consequence.**

> A table with no policy can never be watched over realtime. Realtime evaluates
> the same policies as a `SELECT`, so it delivers to nobody — and the screen
> looks perfectly wired while staying frozen.

That trap has been walked into three times. `tests/every-room-keeps-up.mjs` now
refuses a `KEEP_UP_` set that names a table with no read policy, which is why
the library's record watches `materials` and `material_shares` — the two tables
whose triggers *write* its rows — instead of the record itself.

The Guild Room's wall was the last screen that still reloaded, for the same
reason: the only repair that would obviously work — a read policy on
`guild_activity_posts` — would put `author_id` on the wire and undo the very
thing the label exists to do. It is live as of `20260909180000`, and the way it
got there is the fourth option in rule 3 below.

**`guild_wall_pulse` is a cause table that was written on purpose.** One row per
guild, holding only that its wall changed and how many times: no author, no
body, no post id. Triggers on the posts and on the amens bump it, its read
policy calls `private.active_guild_member` — the feed's own membership test,
called rather than restated — and the screen re-asks `list_guild_activity`,
which redacts exactly as before. The raw row never leaves the database, and both
guild tables keep RLS on with no read policy and no browser grant.

When there is no cause table to watch, that is not always the end of it. One can
be built, provided it carries strictly less than the thing it reports on.

---

## Where the rules live

```
supabase/migrations/     the only place schema or policy changes exist
supabase/functions/      the edge functions, which hold the service key
lib/live/data.ts         every browser query, one function per thing
lib/live/keep-up.ts      which tables each screen listens to
tests/                   one file per rule, each broken on purpose before trust
scripts/verify.mjs       the gate: typecheck, build, and every test above
```

### Six rules that bite

1. **Migrations are append-only.** They have run against a live database with
   real people in it. Fixing a migration means writing the next one; editing a
   file that has already run puts the repository and the database into a
   disagreement nobody can see.

2. **A definer function must authorise its own caller.** It runs as its owner,
   so RLS does not protect it. Every one that *acts* — `suspend_member`,
   `close_trial`, `remove_member_by_leader` — checks the caller first. That
   check is the only thing standing there.

3. **A policy decides WHICH ROWS. A grant decides WHICH COLUMNS.** RLS cannot
   express "only this column", and every attempt to make it try has been a hole.
   `messages_mark` existed so the recipient could stamp `read_at`; because it
   said nothing about columns, it also let either person in a pairing silently
   rewrite the other's words. An audit for the same shape found three more:
   a Guide could rewrite their Explorer's prayer request and publish a private
   one to the whole church, and either party could rewrite the time, place and
   joining link of a meeting the other had already confirmed.

   The fix is a column privilege — `revoke update`, then
   `grant update (that_one_column)` — and the two compose cleanly. Before adding
   an UPDATE policy, ask what the app actually writes to that table, and grant
   exactly that. `tests/the-browser-writes-only-what-the-app-writes.mjs` holds
   the list and fails if a later migration hands a whole row back.

4. **Role is not church.** Two families of helper, and they are not
   interchangeable:

   | Helper | Checks |
   |---|---|
   | `is_admin()` · `is_executive()` | the caller's role. **No church.** |
   | `leads_church(c)` · `manages_church(c)` | the role **and** that church |

   Anything that takes a member id and acts on them wants the second. Both
   guardian-consent functions used the first, so a Director of one church could
   record or withdraw guardian consent for a minor in another — the two most
   safeguarding-sensitive functions in the app. Use `is_admin()` only where the
   action has no target, such as creating a church.

5. **A write that wakes every screen needs a ceiling.** Realtime turns one
   insert into one piece of work per open app: cheap for whoever writes,
   multiplied for the server. `private.hold_the_pace` is a BEFORE INSERT trigger
   on the three tables a person can write into a room — the conversation, the
   Guild wall, the Guides' room — refusing past **40 a minute per account**,
   which is two a second sustained and far above anything a person types. It is
   set to catch a script, not a member: a limit that occasionally catches a real
   person is a limit that gets removed after the first complaint. It bounds the
   machine and not the behaviour — forty unkind messages a minute is still a
   matter for the report route and a Director.

   The other half is on the client. Anything watching a table goes through
   `useKeepUp`, which settles a burst into one reload. A raw channel with no
   debounce is an amplifier, and the chat dock shipped as one for a day.

6. **Never widen a policy to make a screen convenient.** The screen is the
   cheaper thing to change. Every time this has come up the answer has been to
   watch a different table, show a different card, accept a reload — or write a
   cause table that carries no identity and watch that instead. The Guild wall
   is the worked example: it is live, and `guild_activity_posts` is no more
   readable than it was the day the room shipped.

---

## How to satisfy yourself it is true

```bash
npm run verify                       # typecheck, build, and every guardrail
node tests/every-room-keeps-up.mjs   # the realtime rules, on their own
```

And against a live database, the two questions worth asking after any change:

```sql
-- Nothing may be readable by accident.
select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;

-- Published but unreadable: in the publication, no read policy. These deliver
-- to nobody. That is fine when nothing watches them and a bug when something does.
select p.tablename from pg_publication_tables p
join pg_class c on c.relname = p.tablename
left join pg_policy pol on pol.polrelid = c.oid and pol.polcmd in ('r','*')
where p.pubname = 'supabase_realtime' and p.schemaname = 'public'
group by p.tablename having count(pol.polname) = 0;
```

**The first returns nothing, and has since the beginning. The second returns
five rows, and that is expected** — this page used to say both came back empty,
which anybody who ran the second query found out was untrue in about a second:

```
blog_views · guild_activity_amens · guild_activity_posts
library_activity · library_blocks
```

They sit in the publication and deliver to nobody, because RLS filters realtime
exactly as it filters a `SELECT`. That is harmless while no screen watches them
— nothing in `lib/live/keep-up.ts` names one — and it is why the second query is
not the question worth asking. This is:

```sql
-- A table a screen WATCHES that cannot be read is the actual fault: the screen
-- looks wired and stays frozen. Cross-check the list against KEEP_UP_ sets.
select p.tablename from pg_publication_tables p
join pg_class c on c.relname = p.tablename
left join pg_policy pol on pol.polrelid = c.oid and pol.polcmd in ('r','*')
where p.pubname = 'supabase_realtime' and p.schemaname = 'public'
group by p.tablename having count(pol.polname) = 0;
-- ...then: grep -o "'[a-z_]*'" lib/live/keep-up.ts | sort -u
```

`tests/every-room-keeps-up.mjs` does that cross-check on every run, which is the
reason to trust it rather than this paragraph.
The second returned five rows on 9 September 2026, and that is the bug this
page was written after fixing.
