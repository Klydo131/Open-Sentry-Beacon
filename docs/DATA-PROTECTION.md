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
| `pairing_media` + object storage | files sent in that conversation | The same two |
| `prayer_requests` | what somebody asked prayer for, an Explorer or their Guide | The Explorer and their Guide; a Guide's request only to the one Explorer it was written to |
| `guild_activity_posts` | a post on a guild board | Members of that guild, unsigned; leadership only when reported |
| `posts` | blogs, at the audience the author chose | As chosen |
| `meetings`, `notes`, `follow_ups` | arrangements and a Guide's private notes | The pair, or the Guide alone |

### What the church records about people

| Where | What | Retention |
|---|---|---|
| `reports` | safeguarding reports, their decision, and a copy of any reported guild post | **Never deleted, deliberately** |
| `discipline_log` | approval, suspension, removal, by whom | **Outlives the person it describes, deliberately** |
| `profile_changes` | a change to somebody's own details | Kept |
| `security_audit_events` | account activity, by rank | Kept |
| `library_activity` | who shared which link with whom | **30 days, then deleted** |
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
- **Photographs are stripped of location** before they are stored. A phone
  writes GPS coordinates into a picture; re-encoding drops them.
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
| 5 | **Processor terms unchecked.** Supabase, Vercel, Brevo and GitHub all hold or see personal data. The hosting region is now recorded: Seoul. | Confirm each one's data-processing terms. | Owner |
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
