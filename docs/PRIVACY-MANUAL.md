# Privacy Manual

**For a church using Hope Beacon, prepared in the structure the National Privacy
Commission's guide to creating a privacy manual uses.** The words in square
brackets are the church's to fill in; nothing else in this document should need
changing for a church running the app as it ships. Once the blanks are filled,
the church's Data Protection Officer reads it, the church's leadership adopts
it, and it is signed and dated in section IX.

**This is not legal advice.** It is written by the people who built the app, from
what the app actually does, and every statement about the system below is held
true by a test that fails the build if it stops being true (named beside it). A
lawyer or the Data Protection Officer should read it before it is filed with the
NPC or shown to an inspector.

**Sources.** Republic Act No. 10173, the Data Privacy Act of 2012 (the Act), and
its Implementing Rules and Regulations as amended (the IRR); NPC Circular 16-03
(Personal Data Breach Management); NPC Circular 2022-04 (Registration of Data
Protection Officers and Data Processing Systems); NPC Circular 2023-04
(Guidelines on Consent); NPC Circular 2023-06 (Security of Personal Data in the
Government and the Private Sector). The NPC's own website could not be opened
from the network this was written on, so its privacy manual guide was followed
through the many Philippine manuals that reproduce its structure; the church
should check this against the NPC's current guide at privacy.gov.ph.

**Companion documents:** [`DATA-PROTECTION.md`](DATA-PROTECTION.md), the full map
of what is held, where and who can read it (Annex A); the app's own privacy notice
at `/privacy`; [`SECURITY.md`](SECURITY.md).

---

## I. Background

The Act protects the fundamental human right of privacy while ensuring the free
flow of information. It applies to every person and organisation that processes
personal information in the Philippines, churches included, and it gives the
people whose information is processed (data subjects) rights the church must be
able to honour.

**Hope Beacon processes sensitive personal information.** Section 3(l) of the Act
counts a person's age, marital status and religious affiliation as sensitive.
Being a member of a church's discipleship app is itself a religious affiliation,
so everything in the app about a person is treated as sensitive, and the stricter
rules of section 13 apply: processing rests on the person's specific, informed
consent, recorded before any of it begins.

## II. Introduction

[Church name] (the church) uses Hope Beacon, a private app for one-to-one
discipleship: a Guide walks with an Explorer through studies and conversation,
and the church's Directors and Executive Directors look after the whole. The app
is used for the church's ministry and for nothing else.

This manual tells the church's members, leaders and volunteers how personal
information is collected, used, kept, shared and destroyed in the app, how it is
protected, what happens if something goes wrong, and how anybody can exercise
their rights. It applies to every person whose information is in the app.

The church commits to the principles of the Act (section 11): **transparency**
(people are told what is done, before it is done), **legitimate purpose** (used
only for discipleship and ministry), and **proportionality** (no more than is
needed, kept no longer than needed).

## III. Definition of terms

- **Personal information**: any information from which a person's identity is
  apparent or can reasonably be ascertained (Act, section 3(g)).
- **Sensitive personal information**: as in section 3(l), including age,
  religious affiliation, health, and government-issued numbers. Hope Beacon
  collects no government ID, health record or financial information.
- **Data subject**: the person the information is about: an Explorer, a Guide, a
  Director, an Executive Director, or somebody invited.
- **Personal information controller (PIC)**: the church, which decides what is
  collected and why.
- **Personal information processor (PIP)**: a company that processes information
  for the church under its instruction (section VI-D lists them).
- **Data Protection Officer (DPO)**: the person the church designates to be
  accountable for compliance (section VI-A).
- **Explorer, Guide, Director, Executive Director**: the app's four roles: the
  person being walked with, the person walking with them, the church's leader
  for its people, and the leader over Directors.
- **Personal data breach**: a breach of security leading to the accidental or
  unlawful destruction, loss, alteration, unauthorised disclosure of, or access
  to, personal data (Circular 16-03).

## IV. Scope and limitations

This manual covers every record about a person held in the church's copy of Hope
Beacon: its database, its file storage, the e-mail it sends, its backups, and the
copies the app keeps on a person's own phone or computer. It covers every
member, leader and volunteer who uses the app, and every processor the church
engages for it.

It does not cover records the church keeps outside the app (paper membership
rolls, other systems), which the church's general privacy policy should cover.

## V. Processing of personal data

### A. Collection

A person enters the app only by invitation from the church's leadership. **Before
anything about them is collected**, they are told what the app is and who looks
after it, in the same words in three places: the invitation e-mail, the sign-up
page, and the app's privacy notice (`lib/oversight.ts`; held word for word by
`tests/data-protection.mjs`):

> Hope Beacon is a private app for one-to-one discipleship and the ministry of
> [church]. It is used for nothing else. It is overseen by the church.
> [Church]'s Directors and Executive Directors approve who joins, decide who walks
> with whom, and can see how the app is being used: who is paired with whom,
> where each person is on the journey, and counts and dates of meetings and
> messages. What you write to the person you walk with stays between the two of
> you. Nobody else can read it, the church's leaders included, unless one of you
> reports a message; a reported message goes to leadership so they can keep
> everybody safe. [Church] keeps your information under the Data Privacy Act of
> 2012 (Republic Act 10173). You can ask for a copy of it, have it corrected, or
> have your account removed.

**Consent** is then asked for on the sign-up page with a box that starts unticked
(Circular 2023-04: no pre-ticked consent), naming the church and saying
specifically what it covers: "my name and contact details, what I choose to share
with my Guide, and my place on the journey. I understand this shows my connection
with the church." The time of consent is recorded on the account (`consent_at`).

**A person under 18** is walked with only after their parent or guardian agrees.
A Director records the guardian's name and the time of their consent through a
step that checks the guardian is an adult in the same church
(`record_guardian_consent`); nobody can write it by hand
(`supabase/tests/a-leader-stays-within-their-rank.sql`). The app marks a minor to
their Guide and Director.

What is collected, table by table, with who can read each part: Annex A.

### B. Use

Information is used only to: pair an Explorer with a Guide who suits them; let
the two of them talk, meet and study; let the church's leadership approve
members, look after pairings, act on safeguarding reports, and see counts and
dates of activity; and send the e-mail and notifications a member's own account
needs. It is never sold, never used for advertising, and never used for automated
decisions about a person (so the registration rule for automated processing in
Circular 2022-04 does not arise).

**Leadership measures without reading.** Directors and Executive Directors see
counts and dates, never the words of a conversation
(`tests/leadership-can-measure-without-reading.mjs`). They can change who walks
with whom, and doing so never lets them read a conversation: the database refuses
to move a pairing onto other people, and a change of Guide ends the old pairing
and starts a new, empty one (`supabase/tests/a-leader-stays-within-their-rank.sql`,
proven on every fresh install).

### C. Storage, retention and destruction

**Where.** The database and files are hosted by Supabase in [region; for the
deployment this repository describes, Seoul, South Korea]. This is a transfer
outside the Philippines, disclosed in the privacy notice. Pages are served by
Vercel; e-mail is sent by Brevo; a weekly backup is encrypted before it leaves.

**How long.**

| What | Kept | Then |
|---|---|---|
| An account and everything in it | While the person is a member | Deleted at once when the account is removed |
| Stored files (photos, voice messages, resources, handouts, pictures, a post's photos and clip) | As long as the record that points at them | Queued the moment their record is deleted, removed from storage by the nightly clean-up |
| Record of shared links | 30 days | Deleted automatically |
| Safeguarding reports and the record of a removal | Permanently, deliberately | Kept to show the church acted on a safeguarding concern: the establishment or defence of a legal claim and the protection of vital interests (Act, section 13(b), (f)) |
| Backups | [the church's backup period] | Overwritten by later backups |
| Copies on a person's own device | Until they delete them or clear the browser | Not in the church's control; the person is told so |

[The church should decide whether ended pairings' conversations are kept for the
life of the accounts, as now, or deleted after a set period, and write the
period here. Until it does, nothing is deleted on a timer except the link record.]

**How destruction works.** Deleting a record deletes it from the database at once.
A stored file cannot be removed by the database itself, so whenever a record that
points at a file is deleted, however it went, the file is written to an erase list,
and a daily job removes every listed file through the storage service, which
removes the file itself (migration `20261007150000`, function `erase`; proven by
`supabase/tests/what-is-deleted-leaves-no-file-behind.sql`). Until the job has run,
a listed file can no longer be opened by anybody, because every file's read rule
asks for its record.

### D. Access

| Who | Can see |
|---|---|
| An Explorer | Their own profile, their Guide's, their own conversation, studies shared with them, the church's posts and notices |
| A Guide | Their own profile, the Explorers they walk with and those conversations, studies, posts and notices |
| A Director | The church's members and their roles, pairings and journey stages, counts and dates of activity, safeguarding reports in their church. **Never a conversation** |
| An Executive Director | The same, for the churches they oversee, and reports about Directors |
| Anybody not signed in | Nothing at all |

Access is enforced by the database itself, not by the screens, so it cannot be
bypassed with a browser's developer tools. A leader acts only within their rank:
a Director cannot make anybody a Director or an Executive Director, cannot act on
another Director, and nobody can change their own role
(`supabase/tests/a-leader-stays-within-their-rank.sql`).

### E. Disclosure and sharing

Information is not disclosed outside the church except to the processors in
section VI-D, which hold it on the church's behalf, and to the National Privacy
Commission or a court when the law requires. A member's posts reach the audience
they chose. A safeguarding report reaches the leaders who handle it.

## VI. Security measures

### A. Organizational security measures

1. **Data Protection Officer.** The church designates [name], [position],
   reachable at [e-mail], as its DPO, and names them in the app's privacy notice.
   The DPO monitors compliance, answers data subjects, handles breaches, and is
   the church's contact with the NPC.
2. **Registration with the NPC.** Under Circular 2022-04 a PIC registers its DPO
   and data processing systems if it employs at least 250 people, processes the
   sensitive personal information of at least 1,000 people, or its processing is
   likely to pose a risk to data subjects' rights. Because everything in the app
   is sensitive, **a church with 1,000 or more people in the app must register**;
   below that, it files the sworn declaration the Circular requires instead.
   [Church's determination and date.]
3. **Privacy Impact Assessment.** The church conducts and keeps a PIA of the app
   [date], reviewed whenever a feature changes what is collected. The facts it
   needs are in Annex A.
4. **Training.** Every Director and Executive Director, and the DPO, are trained
   on this manual before they are given those roles, and again [yearly].
5. **Confidentiality.** Leaders and volunteers with access sign a confidentiality
   undertaking [Annex C].
6. **Records.** The app keeps its own record of approvals, suspensions and
   removals (`discipline_log`), of changes to a person's details
   (`profile_changes`), and of account security events.
7. **Review.** This manual is reviewed [yearly] and whenever the app changes what
   it collects.

### B. Physical security measures

The church keeps no copy of the app's data on paper or on its own machines. The
data lives with the hosting processors (VI-D), whose data centres carry their own
physical controls. A leader who downloads a report or export is responsible for
the device it is on; the app tells them so.

### C. Technical security measures

As built and tested:

- Encryption in transit (the app and its database are reached over HTTPS only,
  and the app tells browsers to remember that: `Strict-Transport-Security`) and at
  rest (by the hosting provider); the weekly backup is encrypted before it leaves.
- Authorisation in the database: row-level rules on every table; nothing at all
  for a signed-out visitor, and a check that fails the build if a table ever
  grants anything to one.
- A browser may change only the columns its sender is entitled to change
  (`20261007130000`).
- Sessions: signing out ends the session on the server; a suspended account and
  an ended session are refused at once, everywhere, including live updates and
  files.
- Invitation passwords last three days; members choose their own.
- Location is stripped from photographs before they are stored.
- Limits on how much one person can upload, and on how fast anybody can post.
- Every change goes through an automated gate of tests, and a fresh database is
  built from the repository and tested as invented people on every change.

### D. Processors

| Processor | What it does | What it sees |
|---|---|---|
| Supabase | Database, file storage, sign-in | Everything stored |
| Vercel | Serves the app's pages | Request logs, including internet addresses |
| Brevo | Sends invitation and password e-mail | Recipient address and the message |
| GitHub | Holds the code and the encrypted backup | The backup, encrypted |
| komoot (Photon) | Place search in the meet-up box | The words typed, from the church's server, no identity |

Section 21 of the Act holds the church accountable for its processors. [The
church confirms each processor's data processing terms and records the date.]
YouTube, Facebook and Google Calendar are separate controllers, reached only when
a member taps Play or opens a calendar; the privacy notice says so.

## VII. Breach and security incidents

1. **Data Breach Response Team**: the DPO, [the head Executive Director], and
   [the person who administers the app's hosting].
2. **Prevention**: the technical measures above; regular review of the app's
   security reviewer reports; least access for every leader.
3. **When a breach is suspected**: contain it first (suspend the account, end its
   sessions, rotate keys), then establish what was exposed, about whom.
4. **Notification**: where sensitive personal information, or information that
   could enable identity fraud, is reasonably believed to have been acquired by
   an unauthorised person and is likely to give rise to a real risk of serious
   harm, **the NPC and the affected people are told within 72 hours** of
   knowledge (Circular 16-03, sections 11 and 17-18). The notice says what
   happened, what information was involved, what the church has done, and how to
   reach the DPO. There is no delay where 100 or more people are affected or the
   disclosure of sensitive information will harm them.
5. **Documentation**: every incident is recorded, whether or not it is notified,
   and summarised in the church's annual security incident report to the NPC.

## VIII. Inquiries and complaints

Every person in the app may, under section 16 of the Act:

- **be informed**: the privacy notice at `/privacy`, the sign-up page and the
  invitation;
- **access** their information: *A copy of your information* on their Profile
  screen produces it at once, in a machine-readable file they can take elsewhere
  (**portability**); what it deliberately leaves out, and why, it says inside
  (`lib/live/my-data.ts`);
- **correct** it: they change their own details at any time;
- **object, or withdraw consent**, and **have their account removed** (erasure),
  by asking a Director or the DPO; removal deletes the account at once and its
  files with it (V-C), except the safeguarding record described there;
- **claim damages** and **complain to the NPC**.

Requests and complaints go to the DPO at [e-mail]. The privacy notice promises an
answer within 30 days, and, if a request will take longer, word of that within
the 30 days.

## IX. Effectivity

This manual takes effect on [date] and stays in effect until amended.

Adopted by: [name, position] ____________________   Date: __________

Data Protection Officer: [name] ____________________   Date: __________

## X. Annexes

- **Annex A**: [`DATA-PROTECTION.md`](DATA-PROTECTION.md): what is held, in which
  table, why, and who can read it.
- **Annex B**: the privacy notice, as shown in the app at `/privacy`.
- **Annex C**: [the church's confidentiality undertaking for leaders].
- **Annex D**: [the church's Privacy Impact Assessment].
- **Annex E**: [NPC registration, or the sworn declaration of non-coverage].

---

### For whoever runs the church's copy of the app: the one setup step

The nightly clean-up of deleted files (V-C) runs in the church's own Supabase
project. After the database change `20261007150000` has been applied, deploy the
function once:

```
npx supabase functions deploy erase --project-ref <your-project-ref>
```

It uses the two Vault secrets the notification sender already uses
(`notify_service_key`, `notify_function_url`); if your project has notifications
set up, nothing else is needed. If not, add `notify_service_key` (the service role
key) and `erase_function_url` (the function's address) to Vault. Until it is
deployed, deleted files wait on the list, unreadable; nothing is lost.
