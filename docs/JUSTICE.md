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
| **A trial** | Only the people in that trial, and leadership who may watch it. |
| **What is said in a trial** | Only the people in that trial, and anybody watching from its gallery, whose seat is on the record. |
| **An exhibit kept for the bench** | The judge and the gallery. Not the other people called. |
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
- The church's **senior leadership** reads those and the Directors.
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

Any church leader can turn one line of the record into a case,
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

Everybody called to a trial can read what is said in it, and nobody outside it
can read any of it. Leadership may watch a hearing from the **gallery**: a seat
that is written on the record, with no voice. The judge can close the gallery,
and then nobody new may watch.

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

### The door

Trials are held in the **court room**, and its door asks again who you are
before it opens, even though you are signed in: a code from your authenticator
app for leadership, your password for anybody else called to a case. It stays
open for 30 minutes. This is so a case stays private if somebody else picks up
your phone.

### Speaking in one

Anyone summoned can add a statement while the trial is **open**. Once it is
closed, nobody can add anything, including the head judge. That is deliberate:
a record that can be added to afterwards is not a record.

Statements carry the name of whoever wrote them and the time the server
received them; nobody can choose a different time. If you cannot sign in (for
example while your account is suspended), you still have your say, in one of
two ways: tell the judge, in person or by phone, and they write it down on the
record as yours; or the judge gives you **leave to answer**.

### Leave to answer

A suspended account cannot sign in. When somebody called to a trial is
suspended, the judge, who is always one of the church's leaders, can let them
sign in to answer that trial, and nothing else:

- **Only the court room opens**, and in it only that one trial. Everything else
  in the app (messages, the library, your profile, other trials) stays closed
  exactly as a suspension closes it. The door still asks for your password.
- **It is for a time the judge chooses**: an hour, a day, three days or a week.
  It ends sooner if the judge ends it, and always when the trial is decided.
- **When it ends, the account is switched off again** at once, on every phone it
  was signed in on.
- **It is on the record**, with who gave it and until when, and the church's
  other leaders are told. Nobody is let in quietly.

Leave to answer does not lift the suspension. Only a Director lifting it from
the member's page does that.

### Exhibits

Anybody called to a trial, and the judge, can put **exhibits** before it: a
photo, a screenshot, a recording, a video, a PDF, or something written out word
for word. Each is lettered (Exhibit A, B, C) and kept exactly as it was given,
nothing changed, up to 25 MB.

Each exhibit has a **fingerprint**, a long code worked out from its contents
the moment it is chosen. Every time anybody opens it, their phone works out the
fingerprint again and compares. If even one dot of a photo had been changed,
the two would not match, the screen would say so, and the judge would be told.

The judge can keep an exhibit **for the bench only**, meaning the judge and the
gallery, when showing it to everybody would put somebody at risk. If a photo
records where it was taken, that place is shown only to the bench.

### The record

Everything that happens in a trial is written in order on its record: who was
called, who spoke, each exhibit, who opened it, who watched, the decision.
Each line is chained to the one before it, so a line that was changed or
removed afterwards would show. Anybody in the trial can ask the app to check
the record, and save a copy of it to keep.

### Escalation

A trial can be escalated when it is beyond the people currently in it. That is a
step upward to more senior leadership, not a punishment, and it is recorded with
the time it happened.

### The end of it

A trial closes with a **verdict** and a note explaining it. Both stay attached
to the trial for good, and the verdict **seals** the record: its last line's
fingerprint is kept with the decision. What was said in a trial stays on its
record even if the account of somebody who spoke is later removed.

### If an account is deleted

Deleting an account removes the person from the app: their messages, notes,
photos and everything else in it. Two things stay, because a church has to be
able to show what it did: **its safeguarding reports and its trials.**

- A report stays, with its conversation and its evidence, whether it was the
  account of the person who raised it or of the person it was about that went.
- A trial stays, with everything said and entered in it. The deletion itself is
  written on its record.
- Wherever the person's name appears in either, it is shown followed by
  **(account deleted)**, so nobody mistakes them for somebody still here.

Nothing else about them is kept: not an address, not a phone number, not a
photo. Only the name as it was, and what the record already held. Who can read
a report or a trial does not change when somebody's account goes; a report
about a leader stays with the leaders it was always for.

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

For Directors and the church's senior leadership.

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
