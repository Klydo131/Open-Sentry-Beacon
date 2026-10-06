# The complete guides

Two books, built from the documents in this repository:

- **[Using Hope Beacon](../Hope-Beacon-Complete-Guide-Using.pdf)**: every room,
  every folder and every role, in plain words, with every screen shown on a
  phone beside a computer. For the people in a church.
- **[Building Hope Beacon](../Hope-Beacon-Complete-Guide-Building.pdf)**: how it
  is made, how to run a church's own copy, and how to change it safely. Reading
  paths for beginners, developers junior to senior, IT, and AI coding agents.

## What is in this folder

| Path | What it is |
| --- | --- |
| `books.mjs` | What goes in each book, in what order, and one line for every room and folder in the picture atlas |
| `using/`, `building/` | The chapters only a book needs: introductions, an overview, a code tour, quality, recipes, lessons, a FAQ and a glossary. Every other chapter is a document from `docs/` or the repository root |
| `build-reference.mjs` | Writes the reference appendices in `building/generated/` from the code: every file's header comment, every migration, check, walk, route, command and release note |
| `build-guides.mjs` | Lays both books out and prints them to PDF, with a cover, contents with real page numbers, bookmarks and a footer |

The pictures are taken by `scripts/complete-guide-shots.mjs`, which signs in as
each sample person and photographs every room and folder their Menu offers, so a
room added later appears in the next edition without anybody listing it.

## Making a new edition

One command does all of it, for these two books and every other picture in the
repository (the README, the setup guide, the illustrated walkthrough, and the
printed HANDBOOK and HOW-TO-USE):

```bash
npm run docs:refresh                 # build, take every picture, print every PDF
npm run docs:refresh -- --no-build   # the same, with the build already in .next
```

`scripts/refresh-docs.mjs` says what it runs and where each file lands. By hand,
for these two books only:

```bash
npm run build && node scripts/run-next.mjs start -p 4321    # in one terminal
node scripts/complete-guide-shots.mjs 4321                  # every screen, for every role
node docs/guides/build-reference.mjs                         # the generated appendices
node docs/guides/build-guides.mjs                            # both PDFs
```

The screenshot script can run in three parts side by side against one server
(`phone`, `computer` and `extras` as a second argument), which is three times
faster. The PDF builder needs Playwright's Chromium, `sharp` (installed with
Next.js), and poppler's `pdftotext` and `pdfunite`.

Before sharing a new edition: look at the pictures, and search the text of both
PDFs (`pdftotext`) for anything that must never be in a public file.
