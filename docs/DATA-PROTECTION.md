# Data protection: what this app holds, and what is still missing

**This is not legal advice, and it is not a compliance certificate.** It is what
an engineer can establish by reading the schema and the access rules: what
personal data Open Sentry Beacon collects, where it goes, who can see it, and how
long it stays. A lawyer or a Data Protection Officer needs that map before they
can write a privacy notice or answer a regulator, and until today it did not
exist.

The gaps at the end are real and several of them are not engineering problems.
They need a decision by whoever runs the church.

**Reviewed against:** Republic Act 10173, the Philippine Data Privacy Act of
2012, and its Implementing Rules and Regulations; and the GDPR, because a
congregation with one member in Europe is inside it.

**Last checked:** 1 September 2026, against the live schema.

---

## 1. The fact that decides everything else

**This app processes sensitive personal information.**

RA 10173 §3(l) defines sensitive personal information to include a person's
**age**, **marital status**, and **religious affiliation**. Open Sentry Beacon
records a birthday, a life status, and the whole of somebody's participation in
a church's discipleship programme. Membership of the app *is* a religious
affiliation, so every row in it is sensitive whether or not the column looks it.

That is not a technicality. It changes four things:

| Ordinary personal information | Sensitive personal information |
|---|---|
| Consent may be implied by conduct | Consent must be **express**, and evidenced |
| No registration threshold in practice | **Register with the NPC** at 1,000 data subjects |
| A DPO is good practice | A **Data Protection Officer** is expected |
| Penalties are lower | Unauthorised processing carries a **higher penalty** |

The app also holds data about **children**. There is a birthday, an `is_minor`
test, a guardian name and a guardian consent timestamp, and a badge that marks a
minor to their Guide and their Director. Consent for a minor comes from the
parent or guardian, and the app already records who gave it and when.

---

## 2. What is collected, and why

Structure read from the live database. No values were read.

### About a person

| Where | What | Why it is there |
|---|---|---|
| `profiles` | name, contact preference, language, birthday, gender, life status, city, work or industry, topics of interest, picture or icon | Identifying a member and pairing them with a Guide who suits them |
| `profiles` | role, approval, suspension and its reason | Deciding what somebody may see and do |
| `profiles` | guardian name, guardian consent time, who recorded it | Lawful basis for a member under 18 |
| `profiles` | `consent_at` | When this person agreed to the terms |
| `invites` | email address, name, role, who invited them, expiry | The only door into the app |

### What people write to each other

| Where | What | Who can read it |
|---|---|---|
| `messages` | the conversation between a Guide and an Explorer | Those two people, and a Director only inside a safeguarding report |
| `pairing_media` + object storage | files sent in that conversation, including **voice messages** (since 1 October 2026: recorded in the browser, at most two minutes, stored like any other file) | The same two |
| `message_reactions` | a reaction (one of six) to a message or file in that conversation | The same two; written only through `react_to()` |
| `materials` + object storage (`library/<person>/`) | a resource: a link, or a file somebody added (since 25 September 2026) | Whoever added it, and the people they send it to. Leadership sees a record that it was added or shared, not the file |
| `lesson_files` + object storage (`lessons/<person>/`) | a study's handouts | Anybody who can read that study |
| `prayer_requests` | what somebody asked prayer for, an Explorer or their Guide | The Explorer and their Guide; a Guide's request only to the one Explorer it was written to |
| `guild_activity_posts` | a post on a guild board | Members of that guild, unsigned; leadership only when reported |
| `posts` | blogs, at the audience the author chose | As chosen |
| `meetings`, `notes`, `follow_ups` | arrangements and a Guide's private notes | The pair, or the Guide alone |
| `office_plans` (since 2 October 2026, migration `20261002150000`) | the account's own copy of its Sabbath programs and evangelistic meetings, so they follow it to every device it signs in on: the same as the device holds, platform notes and **Team only** blocks included. A deleted one stays as a row with its content emptied, so no other device brings it back. At most 1000 rows an account | **Its owner alone**: four owner-only rules, nothing for leadership, nothing for anybody signed out. Deleted with the account |

### Kept on a person's own device first

| What | Where | Who can read it |
|---|---|---|
| A **Sabbath program** (since 2 October 2026): an order of service with the names of who leads each part, and with Advanced settings, notes for the platform and the church's own details | The browser's storage on the phone or computer where it was made, under that account's id; and the account's own copy in `office_plans` (above), where the database has it | Whoever uses that browser as that account, and that account on its other devices. It reaches anybody else only in a file, picture or calendar file the person downloads or shares, or when they press **Post it** (below) |
| The person's own **Sabbath templates** and their **Advanced settings** choice | The same browser storage, under that account's id | The same. A template keeps the parts and the names of details, never who leads them or what was written |
| **Sabbath programs shared with the person** (the most recent 20), so This Sabbath opens with no signal | The browser's storage on their own phone, under their account's id | Whoever uses that browser as that account. It is a copy of a post they could already read |
| **Evangelistic meetings** (since 2 October 2026): a series of nights with the names of who does what, and blocks the planner may mark **Team only** | The same as a Sabbath program: the browser first, and the account's own copy | The same. It reaches anybody else only in a file, picture or calendar file the person downloads or shares, or a post; a Team only block only in the team's copy of the Word file |
| **Folders** for programs and series | Part of the program or series, wherever it is kept | The same |
| **Deletion marks**: which programs and series this account deleted, and when, for a year | The browser's storage, under that account's id | Whoever uses that browser as that account. Ids and times only, no content |
| **Notes on a progress report**, per period | The browser's storage, under that account's id | Whoever uses that browser as that account. They leave only in the report's Word file or text, when the person takes it |
| **Evangelistic meetings shared with the person** (the most recent 20) | The browser's storage on their own phone, under their account's id | Whoever uses that browser as that account. It is a copy of a post they could already read |

Apart from the account's own copy in `office_plans`, none of these rows reaches
Supabase, Vercel or anybody else; the person deletes them on their device, or by
clearing the browser's site data. A deletion request reaches the account copy:
deleting a program deletes its content there, and deleting the account deletes
every row. The file's own author field names the app, not the person.
`tests/a-sabbath-program-is-a-word-file.mjs` and
`tests/evangelistic-meetings-are-yours-to-shape.mjs` fail the build if either
tool ever talks to the database or the network itself: the account copy is
reached only through what the page hands it (`lib/live/office-plans.ts`), and
`tests/the-office-follows-you.mjs` holds the table's owner-only rules.

**A calendar file** made with **Add to calendar** is made on the device and goes
wherever the person opens it. It holds what is shared only, never a platform
note or a Team only block. **The progress report** stores nothing: it is
computed in the browser from what its reader's sign-in already returns, and a
Director's version never asks for meetings, lessons or follow-ups.

**A program somebody posts** with **Post it** is a different thing: an ordinary
row in `posts` (the table above), with the sender's name, for the audience they
chose: the people they walk with, or the whole church. It is read, kept and
taken down exactly like any other post, and needed no new table. It is always
the congregation's copy: the platform notes are never in it, and the same test
proves the picture never draws them either. A posted evangelistic meeting is
the same kind of post, and never carries a block marked Team only;
`tests/evangelistic-meetings-are-yours-to-shape.mjs` proves it of the post and
the picture.

### What the church records about people

| Where | What | Retention |
|---|---|---|
| `reports` | safeguarding reports, their decision, and a copy of any reported guild post | **Never deleted, deliberately** |
| `discipline_log` | approval, suspension, removal, by whom | **Outlives the person it describes, deliberately** |
| `profile_changes` | a change to somebody's own details | Kept |
| `security_audit_events` | account activity, by rank | Kept |
| `library_activity` | who added or shared which link or file, with whom | **30 days, then deleted** |
| `notifications` | alerts sent to one person | Kept |

Two of those are deliberately permanent, and that is a decision with a legal
consequence: an erasure request cannot empty them without destroying the only
record that a church acted on a safeguarding concern. The lawful basis for
keeping them is the establishment or defence of a legal claim and the protection
of vital interests, and **that has to be written into the privacy notice rather
than assumed**.

### Where it physically is

- **Supabase**, a hosted Postgres and object store. **The region is
  `ap-northeast-2`, which is Seoul, South Korea.** A Philippine congregation's
  data therefore leaves the Philippines, which is a cross-border transfer and
  has to be disclosed. It now is, in the notice. Seoul is among the nearest
  regions Supabase offers, so this is a reasonable choice rather than an
  accident, but it is a fact members are entitled to.
- **Vercel**, which serves the pages. It sees request logs, including IP
  addresses.
- **Brevo**, which sends invitation and password email. It sees the recipient's
  address and the message.
- **GitHub**, which holds the code and the weekly encrypted backup.
- **komoot (Photon)**, since 26 September 2026: the place search behind the
  meet-up box, over OpenStreetMap data, run in Germany. It receives the words
  typed in the place box and, when there is one, a point rounded to about ten
  kilometres -- sent from the church's server, so not the member's name,
  account or internet address. Nothing is stored on the church's side.
  `supabase/functions/places/`.
- **Google (YouTube) and Meta (Facebook)**, only when a member taps Play on a
  video somebody shared from one of them. The player is not loaded until that
  tap (`components/MediaPlayer.tsx`), and YouTube is embedded in its
  privacy-enhanced mode. From the tap on, that company sees the member's
  browser play the video, as on its own site. Named in the privacy notice on
  1 October 2026, after the licence audit found it missing. These two are
  separate controllers rather than processors: the member is using their
  service, not the church's.
- **Google (Google Calendar)**, only when a Guide or a leader taps **Google
  Calendar** on a night of evangelistic meetings. That opens Google Calendar
  with the night's name, time, place and what is shared filled in, so Google
  receives them, as it would if typed there. Nothing is sent before the tap,
  and **Add to calendar** sends nothing. A separate controller, like YouTube.
  Named in the privacy notice on 2 October 2026.

Each of those is a processor, and RA 10173 §21 expects a contract with each one
holding them to the same standard. Their standard terms may already do it; **it
has not been checked**.

---

## 3. What is already right

These are properties of the running system, not intentions:

- **Nothing is public.** Every table denies the signed-out role. There is a
  check that fails the build if a new one grants anything to `anon`.
- **Authorisation is in the database**, not in the screens, so it cannot be
  bypassed with developer tools.
- **A conversation belongs to two people**, and no screen anywhere shows a third
  person a thread they are not in.
- **The smallest possible disclosure.** An Explorer can read exactly two
  profiles: their own and their Guide's. Verified against the live database.
- **Rank-limited oversight.** A Director sees Guides and Explorers; an Executive
  Director sees Directors. Neither sees further down.
- **Removal is real.** Deleting a member deletes the login as well as the
  profile, which frees their email address and leaves nothing behind that can
  sign in.
- **Consent is recorded** with a timestamp, and separately for a minor's
  guardian.
- **Photographs are stripped of location** before they are stored: in a
  conversation, a profile picture, a resource and a study handout. A phone
  writes GPS coordinates into a picture; re-encoding drops them. Every JPEG is
  checked for coordinates whatever its size (until 25 September 2026 a photo
  under 400 KB was not re-encoded, and kept them). **Not covered:** HEIC
  photos, which a browser cannot re-encode, and PNG or WebP metadata, which
  phones do not normally put coordinates in. **The one deliberate exception:**
  evidence attached to a safeguarding report is kept exactly as it was sent,
  because re-encoding evidence changes it; only leadership handling the report
  can open it, and the notice says so. See `lib/live/photo-location.ts`.
- **What one person can upload is bounded.** Each file is at most 10 MB, and
  each person can keep up to 300 files or 200 MB of resources and study
  handouts (`private.room_to_upload`, 20260925120000). Conversation photos and
  safeguarding evidence are not counted.
- **A weekly backup is encrypted** before it leaves the machine.
- **A member can download their own data**, from their Profile screen, without
  asking anybody. It is assembled in the browser from queries that person could
  already run, so no privileged path exists that could be made to hand over
  somebody else's records. Verified against the live database: the unfiltered
  read of every message returned three rows, all theirs, and none from a
  conversation they are not in.

---

## 4. What is missing

Ordered by how much it matters, not by how hard it is.

| # | Gap | What it needs | Who |
|---|---|---|---|
| 1 | **No privacy notice.** Nothing tells a member what is collected, why, who sees it, how long it is kept, or how to complain. RA 10173 §16(a) and GDPR Art. 13 both require it before collection. | `/privacy` now exists as a draft in the app. The blanks in it must be filled: who the controller is, the DPO's name and contact, the retention periods, the hosting region. | Owner, then a lawyer |
| ~~2~~ | ~~**No way for a member to get a copy of their own data.**~~ **Built, 1 September 2026.** *A copy of your information* on the Profile screen produces a JSON file with the profile, the conversation, prayer requests, meetings, posts, library shares, notifications and every change to their own details. | Nothing. See below for what it deliberately leaves out. | Done |
| 3 | **No named Data Protection Officer.** Expected where sensitive personal information is processed. | A person, an email address, and the NPC filing if the church passes 1,000 members. | Owner |
| 4 | **No breach procedure.** RA 10173 requires notification to the NPC and to affected people **within 72 hours** of knowing. There is no written procedure and no rehearsal. | One page: who decides it is a breach, who is told, in what order, and the wording. | Owner |
| 5 | **Processor terms unchecked.** Supabase, Vercel, Brevo and GitHub all hold or see personal data, and komoot sees the words typed into the meet-up place box. The hosting region is now recorded: Seoul. | Confirm each one's data-processing terms. | Owner |
| 6 | **Retention is undefined** for everything except the library record. A message from four years ago is still there because nothing deletes it, not because anybody decided it should stay. | A retention period per table, written down, then enforced. | Owner decides, engineering enforces |
| 7 | **Erasure conflicts with the safeguarding record**, and the conflict is unstated. | Write the lawful basis for the exception into the notice, and make the app say so when an account is deleted. | Owner, then engineering |
| 8 | **No record of who read what.** A Director can open a reported conversation and nothing records that they did. | An access log for the one place where a third party reads a private thread. | Engineering |

---

## 5. The two things to do first

**Fill in the privacy notice** at `/privacy` and publish it. An app that
collects a child's religious participation without telling anybody what it does
with it is the single largest exposure here, and it is a writing job rather than
an engineering one.

**Decide the retention periods.** Everything except the library record is kept
because nothing deletes it rather than because anybody chose a period, and the
privacy notice has a blank waiting for the answer.

> **What the export leaves out, and why it is defensible.** Safeguarding
> reports, a Guide's private notes, and the discipline log are not in the file.
> A report names whoever raised it, and this app promises them that the person
> they reported is never told; handing it over would break that promise and
> could put somebody at risk. Both laws allow an access request to be limited
> where answering it would identify another person who has not agreed. The file
> **names each exclusion, gives the reason, and says to write to the Data
> Protection Officer**, who can weigh a particular case. An omission somebody is
> told about is a disclosure; the same omission in silence is not.

---

## 6. What this document is not

It is not a legal opinion, it is not a Privacy Impact Assessment, and it does
not make the app compliant with anything. It is the factual half, which is the
half a lawyer cannot produce for you and cannot work without.

Anybody continuing this: keep it true. If you add a table that holds anything
about a person, add it to section 2 the same day, and say who can read it.
