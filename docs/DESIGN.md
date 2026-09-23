# How Beacon is meant to feel

*How it should look — the colours, type, and components, with the Study Room as
the reference — is in [`VISUAL-LANGUAGE.md`](./VISUAL-LANGUAGE.md).*

Four rules. They are not decoration: every one of them was written after
something went wrong, and each is enforced by a test where a test can reach it.

## 1. Organised like a building, not a feed

The app is a church with rooms in it, not a stream you scroll.

A feed shows you whatever is newest. A building keeps things where you left
them, and the second visit is faster than the first because you already know
where to walk. That is the whole difference between an app somebody uses and
an app somebody re-learns.

So: named rooms, always in the same order, and **the room you need most often
is the first one**. A Director pairs people and approves people every week;
they read the board report once a month. Pairing was the ninth section down a
single long page, which meant the most-used control in the app was the one that
took the most scrolling to reach.

**If a daily task is below the fold, the layout is wrong.**

## 2. Never make anybody guess

If a person has to work out what a control does, or where a thing went, the
design has failed. Not the person.

This is the rule that catches the worst class of bug, because guessing failures
are silent. Nobody files a report saying "I was not sure, so I stopped".

Three real ones from this project:

- The Install button rendered for Chrome and for nobody else, so every Apple
  user saw a banner made entirely of text and concluded the button was broken.
- The profile button sat underneath the tutorial bar and could not be tapped.
  It looked completely normal. Three test suites called it "the spotlight
  points at nothing" for weeks.
- "Copied" appeared whether or not the copy had worked, so the app asserted
  something false about the person's own clipboard.

The pattern in all three: **it looked fine and did nothing.** Prefer a control
that says plainly what it cannot do over one that quietly fails.

## 3. The same shape for every role

Explorer, Guide, Director, Executive Director. The rooms differ; the shape does
not. Daily work at the top, reference below, the way out in the same corner.

Somebody promoted from Guide to Director should recognise the building they are
standing in. Roles are separate tiers of authority, not separate apps.

## 4. Dynamic, which means two people, not one person and a screen

A lesson somebody reads alone is a document. A lesson a Guide and an Explorer
can both act on is discipleship, which is the point of the app.

So the bias is always toward the thing both people touch: a question the Guide
asks and the Explorer answers, a prayer request the Guide can see was made, a
message the other person watches arrive. Where a feature could be one-way or
two-way, build it two-way.

## 5. Interruptions teach or they go

A popup that only says "here is a thing" has spent somebody's attention and
given nothing back. If it interrupts, it must either **teach something** or
**offer a choice worth making**, and then get out of the way.

Rules that follow from that, all of them learned here:

- **Ask again later, not never, and not constantly.** The install prompt
  returns after an hour. It was seven days, which is how somebody who wanted
  the app never gets asked again, and it is not every page load, which is how
  an app gets deleted.
- **Always a permanent way out, one tap, visible.** "I already have it
  installed" sits directly under the button.
- **Nothing interrupts during the tutorial.** Somebody following instructions
  is the worst possible moment to put a card over the instructions.
- **A panel with nothing to say renders nothing.** A card headed "Safeguarding"
  reading "Nothing to decide" cost most of a phone screen every day to report
  that today was like every other day.

The tutorial is opt-in and resumable, and it points at real controls rather
than describing them. Reading about a button is slower than being shown it.

## 6. A quick choice, and a warning before a hard one

Most decisions should be one tap with a sensible default already chosen.
Optional fields stay optional; a form that demands the most personal answer
before it will continue is a form people abandon.

But **anything hard to undo says so first**, in words about consequences rather
than a generic "Are you sure?":

- Deleting a blog post takes its readers with it, so it is two steps.
- Removing somebody from the church ends their access immediately, so the
  confirmation names the person.
- Moving the app to a new web address orphans every installed copy, so it is a
  documented, announced decision and not a settings toggle.

The test is whether somebody could do the irreversible thing while believing it
was reversible. If they could, the warning is missing or too vague.

Speed never buys its way past policy. Consent is explicit, a minor's guardian
record is written by somebody other than the minor, and no shortcut skips
either.

## 7. Every device, including the old one

The people using this are on whatever phone they already own. Some of those are
old, some are on a poor signal, and some are iPhones running an engine that
behaves nothing like Chrome.

- **Both engines, every push.** `verify` runs Chromium on three operating
  systems; `safari` runs WebKit on macOS. Attachments were silently broken on
  every iPhone and iPad for weeks because only one of those existed.
- **Phone first.** Layout is checked at 412px and on six device profiles, and
  the page must never scroll sideways.
- **Tap targets are real.** 44px minimum, and checked, because a control that
  is technically present and physically unhittable is not present.
- **Degrade, never throw.** A missing browser feature returns a lesser answer;
  it does not take a screen down. `crypto.randomUUID` is absent over plain http
  and threw rather than degrading, so sending a photo failed outright.
- **It keeps working offline**, and says which build it is running.

---

## What this rules out

- Infinite scroll, and anything that puts a daily control below a monthly one.
- Controls whose label describes a hope rather than what pressing them does.
- A screen that behaves differently for one role for no reason a person could
  guess from the outside.
- Silent failure of any kind. If it did not work, say so where the person is
  looking.

## Where these are enforced

`tests/security-invariants.mjs` holds the placement rules it can reach: the
MINOR badge on every surface where an adult is responsible, the clipboard going
through one guarded helper that returns a boolean, no `<Linked>` inside a
button. `tests/e2e/` holds the rest, which is why a layout bug that made a
button unclickable was caught at all.

A rule with no test is a preference. Add the test.
