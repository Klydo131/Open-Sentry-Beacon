# Reports, trials and the record

**For everybody in the church, whatever your role.**

This is the part of the app nobody wants to need. It exists so that when
something goes wrong there is a way to say so that is not a rumour, and a record
afterwards that cannot quietly disappear.

Read the first two sections even if you never expect to use them. Knowing that a
thing exists is most of what makes it work.

---

## Part 1 — Reporting something

### Who can report

Anybody. You do not need a role, a Guide's permission, or a reason anybody else
would agree with.

### What happens when you do

1. You write what happened. You choose a reason and add the detail in your own
   words.
2. The report goes to the people whose job it is to handle it. It does **not**
   go to the person you are reporting, and it does not appear anywhere public.
3. Somebody claims it, so two people are not working on the same thing without
   knowing.
4. They decide, and the decision is recorded with their name on it.

### What you can see afterwards

**Your own report, always.** It stays yours to open. You can see its status,
who decided it and what the outcome was. Nobody can take that view away from
you, including the person who decided it.

You cannot see anybody else's report, and nobody who is not handling yours can
see yours.

### What the person you reported can see

Not the report. Not your name in it. If the matter goes further and becomes a
trial, they are told about the trial, because somebody answering a complaint has
to know what it is.

---

## Part 2 — Who can see what

This is enforced by the database, not by a screen hiding a button. A page that
forgot to check would still show nothing, because the rules sit underneath every
query anybody can make.

| | Who can read it |
|---|---|
| **A report** | The person who wrote it, and the leadership handling it. Nobody else. |
| **Messages on a report** | Only the people on that report. |
| **A trial** | Only the people in that trial. |
| **What is said in a trial** | Only the people in that trial. |
| **The discipline log** | Only those leading the church. |
| **The activity record** | Leadership, for the ranks below them. It holds no addresses. See Part 3. |

"Nobody else" includes Directors who are not on the case, Guides, and the person
who set the app up.

---

## Part 3 — The activity record, and what leadership cannot see

Leadership can see **that** you shared or saved something. It cannot see **what**.

### What is recorded

Three things, and only these three:

- A Guide **adding** a resource to the library.
- Anyone **sharing** a resource with the person they walk with.
- Anyone **putting a web app in their pocket**.

Each one records who did it, when, what it was called, and **a label saying what
kind of address it was**. Nothing else.

### What is not recorded, ever

- **Conversations.** Nothing you say to your Guide, your Explorer, or in a guild
  room appears here or anywhere leadership can read. That exception is
  deliberate and it is checked by the build.
- **What you read.** Opening something is not an event. Only adding, sharing and
  pocketing are.
- **The address itself.** This is the part worth understanding properly.

### The addresses are not hidden. They are not kept.

A Director does not see a link because **there is no link in the record to
see** — the column that used to hold it was deleted from the database, not
merely left out of the screen. Nobody can restore it, including whoever built
this, because it is not anywhere to restore.

What replaces it is a label the database works out as the row is written:

| The label | What it means |
|---|---|
| **Ordinary** | An ordinary web address. |
| **Needs a look** | A shortened link, an unprotected connection, a throwaway kind of address. |
| **Not good** | Adult content, gambling, a link that runs code, an address disguised as another, a file that installs something. |

Alongside it the record says **how many times that person has been to the same
place** — not which place. That is what turns a slip into a pattern without
telling anybody where somebody went.

### Where your links do still live

With you and the person you shared them with. Your Guide's resource keeps its
address in the library, visible to that Guide and the Explorer they gave it to.
Your pocket keeps your own web apps. Those are yours. The *record* of the act is
a different thing, read by a different rank, and it carries the shape rather
than the thing.

### Nothing is sent anywhere to be checked

The labels are worked out entirely inside your church's own database, by rules
about the **shape** of an address. No link a member shares is sent to any
outside company to be scored. Doing that would hand a stranger the reading
habits of the whole congregation, which is worse than the problem it solves, and
it would happen quietly.

The rules are not clever and are not meant to be. They will miss things, and
they will occasionally flag something innocent. The label means *somebody should
look*, never *this person did wrong*.

### Who reads it

- A **Director** reads it for the Guides and Explorers of a church they lead.
- An **Executive Director**, head or otherwise, reads those and the Directors.
- **Nobody reads their own row.** An account that can watch itself is not being
  watched.
- **A Guide or an Explorer cannot open this record at all.**

### What happens when something is labelled Not good

Everyone in leadership is **alerted straight away** — on their phone, if they
have notifications on. The alert names the person, what they did and the label.
It does not name the address, because nobody in leadership has been shown it.

The person it is about is **not told they are being looked at**, for the same
reason a report is not shown to the person reported.

### Opening a case from it

Any Director or Executive Director can turn one line of the record into a case,
from the row itself. It becomes an ordinary report — the same object anybody
could have raised, answered by the same people, kept for as long — carrying what
was done and how it was labelled.

**It cannot carry the address**, because leadership never had it. If the address
matters to the case, it has to come from the person, in their own words. That is
a real limit and it is the price of the rest of this page.

The record itself is kept for **30 days** and then deleted. A case is not.

---

## Part 4 — A trial

Most reports never become one. A trial is for the serious end: when a decision
needs more than one person and needs a record.

### Who is in it

- **A head judge**, who runs it.
- **The subject**, the person the matter is about.
- **The person who reported it**, put in automatically when the trial comes out
  of a report.
- **Other parties**, summoned because they have something to say.

Everybody in a trial can read the whole of it, and nobody outside it can read
any of it.

**Read that third line twice before you file a report about something serious.**
If your report becomes a trial you are in the room: you will be able to read
what the person you reported says in their answer, and they will know somebody
reported them, because a trial has to tell its subject what it is about. They
are not shown your report and they are not told your name by the app. Being a
party to the trial is a different thing from the report staying private, and
both are true at the same time.

This was checked against the live database rather than remembered: a Guide who
is in neither the report nor the trial reads nothing of either, an Explorer with
no part in it reads nothing, and the person the trial is about can read it and
answer in it.

### Speaking in one

Anyone summoned can add a statement while the trial is **open**. Once it is
closed, nobody can add anything, including the head judge. That is deliberate:
a record that can be added to afterwards is not a record.

Statements carry the name of whoever wrote them and the time they wrote it.

### Escalation

A trial can be escalated when it is beyond the people currently in it. That is a
step upward to more senior leadership, not a punishment, and it is recorded with
the time it happened.

### The end of it

A trial closes with a **verdict** and a note explaining it. Both stay attached
to the trial for good.

---

## Part 5 — The discipline log

When somebody is disciplined, removed or restored, that goes in the log.

**The log survives the person.** If an account is deleted afterwards, the entry
stays, with the name as it was at the time. This is the single most important
property in this part of the app: a church cannot lose its record of what was
decided by deleting the person it was decided about.

The log carries what was done, the reason, who did it, when, and which guilds
were involved. It is readable by those leading the church, and by nobody else.

---

## Part 6 — What this app will not do

Said plainly, because a safeguarding system that overpromises is worse than one
that is modest.

- **It is not an emergency service.** If somebody is in danger, call the
  authorities. This app is a record, not a response.
- **It does not notify the police, a conference or anybody outside the church.**
  Every message here stays inside your congregation's own database.
- **It does not judge anything by itself.** There is no scoring, no automatic
  action, nothing decided by the software. Every outcome in here has a person's
  name on it.
- **It cannot undo a deletion of a report.** Reports are not deleted by design,
  but no part of this is a backup of itself. Backups are a separate thing and
  are described in the handbook.

---

## Part 7 — If you are asked to handle one

For Directors and Executive Directors.

- **Claim it before you work on it.** That is what stops two people deciding the
  same report in two different ways.
- **Decide in the app, not in a conversation.** The outcome field is what
  somebody will read in a year. A decision made in a chat and never recorded is
  a decision the church cannot show it made.
- **Write the reason as if the person will read it**, because they may. The
  reporter can see the outcome on their own report.
- **Escalate rather than sit on it.** A report nobody has claimed is a person
  waiting without knowing whether they were heard.

---

## If something here does not match what you see

That is worth reporting on its own. A screenshot of the screen, with what you
expected, is the fastest way to get it fixed. This document describes the rules
that were read out of the live database; a screen that behaves differently is
a bug in the screen.
