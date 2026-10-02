# The two handbooks

Word documents, generated from the scripts here, for people who are not going to
read a repository:

| Script | Produces | For |
|---|---|---|
| `build-handbook.js` | Installation & Contribution Handbook | The IT person standing up an instance |
| `build-ai-guide.js` | Building It With an AI Assistant | Developers using Claude, Codex, Cursor or similar |
| `build-guidelines-doc.js` | The Complete Handbook, editable | A church that wants to cut it down and add their own names |

`build-guidelines-doc.js` renders `docs/HANDBOOK.md`, the same file `build-pdf.js`
prints. That is deliberate: the guidelines are written in one place, and the
editable copy and the printable copy cannot disagree with each other or with the
repository. The other two scripts hold their own content and are about setting an
instance up rather than running one.

## Why .docx and not more markdown

The repository already documents all of this, and anybody comfortable here does
not need these files. They exist for the other audience: somebody handed a
laptop and told to "look into that church app", who wants a document they can
edit, cut down, add their own hostnames to, and forward to a colleague. Markdown
is not that, and a PDF cannot be edited at all.

Keep them in step with `docs/` when the setup changes — a handbook that
describes last year's install is worse than none.

## The seven PDFs that ARE committed

Everything in `docs/handbook/pdf/` is build output and ignored. Seven PDFs in
`docs/` are committed, because they are what gets handed to somebody who will
never clone this repository:

| File | Built from | For |
|---|---|---|
| `Hope-Beacon-Handbook.pdf` | `HANDBOOK.md` | Anybody running the app day to day |
| `Hope-Beacon-How-To-Use.pdf` | `HOW-TO-USE.md` | A member: the app in pictures, nothing technical |
| `Hope-Beacon-Architecture.pdf` | `BACKEND-MAP.md` | Somebody asking how the backend is shaped |
| `Hope-Beacon-Engineering-Brief.pdf` | `BUILD-BRIEF.md` | A developer picking the work up |
| `Hope-Beacon-IT-and-AI-Guide.pdf` | four docs, combined | A church's IT volunteer |
| `Do-This-Next.pdf` | `DO-THIS-NEXT.md` | The owner, between sessions |
| `What-It-Costs.pdf` | `WHAT-IT-COSTS.md` | Whoever signs off the bill |

Rebuild them after changing the Markdown, or the committed copy starts telling
a church something the app stopped doing:

```bash
node docs/handbook/build-pdf.js HANDBOOK.md HOW-TO-USE.md DO-THIS-NEXT.md WHAT-IT-COSTS.md \
                                BACKEND-MAP.md BUILD-BRIEF.md
node docs/handbook/build-pdf.js --combine "IT and AI Guide" \
     START-HERE.md AI-SETUP-GUIDE.md EMAIL.md SECURITY.md
cp docs/handbook/pdf/Open-Sentry-Beacon-HANDBOOK.pdf      docs/Hope-Beacon-Handbook.pdf
cp docs/handbook/pdf/Open-Sentry-Beacon-HOW-TO-USE.pdf   docs/Hope-Beacon-How-To-Use.pdf
cp docs/handbook/pdf/Open-Sentry-Beacon-BACKEND-MAP.pdf   docs/Hope-Beacon-Architecture.pdf
cp docs/handbook/pdf/Open-Sentry-Beacon-BUILD-BRIEF.pdf   docs/Hope-Beacon-Engineering-Brief.pdf
cp docs/handbook/pdf/Open-Sentry-Beacon-IT-and-AI-Guide.pdf docs/Hope-Beacon-IT-and-AI-Guide.pdf
cp docs/handbook/pdf/Open-Sentry-Beacon-DO-THIS-NEXT.pdf  docs/Do-This-Next.pdf
cp docs/handbook/pdf/Open-Sentry-Beacon-WHAT-IT-COSTS.pdf docs/What-It-Costs.pdf
```

> **Checking a built PDF actually contains your change.** `pdftotext` is not
> installed here and a hand-rolled PDF text scraper reads the embedded font
> programs rather than the page text — it will happily report that a phrase is
> absent from a document that contains it, which is worse than not checking.
> Inspect the intermediate HTML instead: it is what Chrome turns into the PDF,
> and `build-pdf.js` deletes it only at the end.

## The combined PDF — the one to hand out

One file, both halves: setting it up, and using an AI assistant to do the work.
This is what a church's IT volunteer should be given.

```bash
node docs/handbook/build-pdf.js --combine "IT and AI Guide" \
  START-HERE.md AI-SETUP-GUIDE.md EMAIL.md SECURITY.md
```

Lands in `docs/handbook/pdf/`. About 31 A4 pages.

It is rendered **from the Markdown already in `docs/`**, not from a separate
source. That is the whole point: a combined document written by hand would be a
third copy to keep in step, and the copy that fell behind would be the one
printed and handed to a church. Change the Markdown; rebuild; the PDF cannot
disagree with the repository.

## Rebuilding the Word handbooks

```bash
cd docs/handbook
npm install docx
node build-handbook.js
node build-ai-guide.js
```

To preview without Word:

```bash
soffice --headless --convert-to pdf Open-Sentry-Beacon-Handbook.docx
```

The generated `.docx` files are deliberately **not** committed — they are build
output, and a binary that drifts from its source is a document nobody can trust.
