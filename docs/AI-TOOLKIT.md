# Presenting with Claude, Codex and Gemini

A plan for building and running the Open Sentry Beacon demo using three AI tools
together, and for getting the result into Canva and Google Slides where the
actual presenting happens.

This is not a list of prompts. It is a division of labour, because the three
tools are good at different things and the fastest way to waste an afternoon is
to ask all three for the same thing and then reconcile three answers.

---

## The short version

| Tool | What it is for here | What it must not be trusted with |
|---|---|---|
| **Claude** | The repository. Code, migrations, tests, the security proof, and any number that goes on a slide. | Being believed without the test output. Ask for the command and the result, not the conclusion. |
| **Codex** | Sitting in the editor while you rehearse. Quick edits, "what does this file do", regenerating a screenshot script. | Anything touching `supabase/migrations` or the permission rules. Those need the proof re-run. |
| **Gemini** | The room. Audience questions, rewording a slide for a 60-year-old board member, translating to Tagalog or Cebuano. | Facts about this app. It has not read the repository and will invent plausible features. |

The rule that matters: **only one tool is allowed to state a fact about the
app, and it is the one that can run the tests.**

---

## Why divide it this way

Every one of these tools will happily answer a question outside its knowledge.
Gemini will describe a feature Beacon does not have, in confident and fluent
prose, because it is answering "what would a church app do" rather than "what
does this one do". That is not a defect; it is what you asked it.

So the division is not about capability. It is about **who can check**.

Claude can open the file, run `prove-the-rules.sql`, and show you 17 lines of
PASS. Codex can read the file in front of you. Gemini can do neither, and is
therefore the wrong tool for "how does pairing work" and the right tool for
"a board member just asked whether we are storing people's confessions, help me
answer that kindly in ninety seconds".

---

## Phase 1 — Before the room (Claude)

Ask Claude for the things that must be true.

1. **Refresh the screenshots.** They go stale the moment the UI changes, and a
   screenshot of last month's app is the kind of thing an IT person spots.
2. **Re-run the proof and quote the real number.** `prove-the-rules.sql` is
   sixteen checks in the open-source example and seventeen in the private
   product. If those numbers have moved, the deck is wrong.
3. **Re-run the device suite.** `tests/e2e/mobile-devices.js` covers phone,
   tablet portrait and tablet landscape. If you are presenting from an iPad,
   this is the test that says the iPad works.
4. **Ask what changed since the last rehearsal**, and make it answer with commits
   rather than a summary.

**Ask for the command and its output.** "Is the app secure" gets you an essay.
"Run the proof and paste the output" gets you something you can show a room.

---

## Phase 2 — While you rehearse (Codex)

Codex lives in the editor, so it is the one to have open while you practise.

- "Open `lib/quest.ts` and show me the executive walk" — faster than finding it.
- "Why is this button gold" — it will read `lib/brand.ts` and tell you.
- "Change the sample church name to ours for this rehearsal" — and then change
  it back.

**Where to stop.** If a question leads into `supabase/migrations` or the
permission rules, stop and take it to Claude. Not because Codex cannot read SQL,
but because a change there needs the adversarial proof re-run against a real
database, and that is a workflow rather than an edit.

---

## Phase 3 — The room (Gemini)

Gemini is for people, not for the repository.

- **Rewrite for the audience.** "Say this without the word 'database', for
  someone who has never installed an app." It is genuinely good at this.
- **Rehearse hostile questions.** "You are a sceptical church treasurer. Ask me
  five hard questions about cost and data." Then check the answers with Claude
  before you use them.
- **Translate.** Tagalog, Cebuano, Ilocano. Have a first-language speaker read it
  before it goes on a slide.
- **Summarise afterwards.** Paste your notes, get the follow-up list.

**The guardrail.** Before any Gemini sentence about what the app *does* goes on
a slide, it gets checked against the repository. The failure mode is not a wrong
tone. It is a confident, specific, invented feature, promised to a pastor.

---

## Phase 4 — Into Canva and Google

The deck is generated as `.pptx` precisely so both accept it.

### Google Slides

1. Google Drive → **New → File upload** → the `.pptx`.
2. Right-click → **Open with → Google Slides**.
3. Check the fonts. The deck uses Cambria and Calibri because both survive the
   trip. If Slides substitutes anything, fix it once in the theme rather than
   slide by slide.
4. Speaker notes come across. They are written to be read, not projected.

### Canva

1. **Create a design → Import file** → the `.pptx`.
2. Canva rebuilds every slide as editable elements. Expect to nudge a few text
   boxes; imported decks are close but not pixel-exact.
3. The screenshots import as images. **Do not crop the demo ribbon out.** It
   says "sample data", and removing it turns an honest demo into a claim about
   a real church.
4. If you restyle, keep the navy and gold. They are the app's own colours, and a
   deck that does not match the screens looks like a deck about a different app.

### Which to use

Google Slides if you are presenting from a laptop and want the notes. Canva if
you want to restyle heavily or hand the file to somebody who does not use
Google. Both work; do not maintain two copies.

---

## What not to do with any of them

- **Do not let an AI invent a statistic.** Not attendance figures, not retention
  rates, not "churches using this app". There are none that would survive being
  questioned, and a made-up number in front of a board is the fastest way to
  lose the room permanently.
- **Do not paste real people's names or messages into any of the three.** The
  sample church is fiction on purpose, and the reserved `.example` domains
  cannot reach a real inbox.
- **Do not ask an AI to approve its own work.** "Does this look right?" is not a
  check. "Run the test and show me" is.
- **Do not present a slide no human has read aloud.** Fluent text hides awkward
  phrasing until you are saying it to forty people.

---

## The rehearsal checklist

Half an hour, once, before the real thing.

- [ ] Claude: screenshots refreshed, proof re-run, device suite green.
- [ ] Numbers on slides match what the tests printed today.
- [ ] Deck imported into Canva **or** Google Slides, and opened on the machine
      you will actually present from.
- [ ] `npm run dev` opens the app on your laptop and the front door renders.
- [ ] Demo data reset. The tutorial writes to browser storage, so a second
      rehearsal starts dirty and the numbers look wrong.
- [ ] Update reminders switched off in Settings, so no banner appears
      mid-sentence.
- [ ] One rehearsal out loud, all the way through, no stopping.

The last one is the one people skip and the only one that reliably finds the
problems.
