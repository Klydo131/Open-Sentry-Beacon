# Lessons already learned

Every rule in this guide was paid for by somebody. This chapter collects the
lessons by subject, so a reviewer knows what to look for and a newcomer does not
pay for the same one twice. Each says what happened, the rule now, and what
holds it. *For an AI tool continuing this*, two chapters on, lists the
invariants and the working-practice mistakes; this chapter is the technical
half.

None of these describes how to attack anything. A security lesson here says what
was wrong and what changed, never how to do it again.

## Phones and browsers

| What happened | The rule now | Held by |
| --- | --- | --- |
| A strip appeared down the right of every screen on iPhones: Chromium and WebKit draw `overflow-x: clip` differently. Every Chromium walk passed. | Anything touching layout runs on WebKit (`safari.yml`) before it is offered. | `tests/e2e/no-sideways-scroll.js`, on both engines |
| The message box jumped when the keyboard opened, because `vh` is not the screen a phone has. | `dvh` for anything measured against the screen, with a `vh` line under it for old browsers; `env(safe-area-inset-bottom)` on anything pinned to the bottom. | Invariant 10 in the AI chapter |
| WebKit refused to store a `Blob` in IndexedDB, with an empty error, and the Music room's pieces would not save on an iPhone. | Store `{ bytes: ArrayBuffer, mime }`, never a `Blob`. | `lib/localMedia.ts`, `lib/music/pieces.ts`, and a walk that emulates the refusal |
| A control drawn with a symbol character was a blank box on Android, whose font lacks the block. | Controls are inline SVG in `components/Glyph.tsx`; emoji are fine. | A check that refuses the characters |
| A panel 90 per cent of the "viewport" tall was taller than the screen on a phone held upright. | Every panel is measured against the screen the phone actually has, in one component. | `tests/e2e/panels-fit-portrait.js` |
| The app worked offline only along the exact path somebody had walked online, because only `/` was cached. | Every room is in the service worker's `SHELL`, cached at install. | `app/sw.js/route.ts` |
| A walk on WebKit failed because the walk moved on just as the app checked for an update, and WebKit reported the cancelled request as an error. | `pageErrors()` forgives exactly that, and nothing else. | `tests/a-walk-forgives-only-what-it-cut-short.mjs` |

## Sign-in and email

| What happened | The rule now | Held by |
| --- | --- | --- |
| Invitation links were spent before people opened them: a confirmation link that spends its token on a plain visit is used up by the first mail scanner that previews it. | The invitation carries a password; templates never use a link that spends on a visit. | `docs/EMAIL.md`, the invite function's own comments |
| Everybody was signed out an hour after signing in, because nothing traded the refresh token for a new one. | A session lasts until somebody signs out; coming back re-checks it. | Session checks in the gate |
| Two copies of the app renewed the same session at once; the loser threw the good session away. | A refused renewal looks again before giving up. | Session checks in the gate |
| A second invitation to the same address silently switched off the first, and people used the old email. | Say so on the screen and in the guide: use the newest email. Never mint a second link after sending one. | Invariant 3 in the AI chapter |
| Somebody who already had an account got a recovery link instead of an invitation, which did not carry their church and role, so they existed with no church. | Fixed on 29 August 2026, and everybody already stuck was repaired when the fix was applied. | The invite function |

## The database

| What happened | The rule now | Held by |
| --- | --- | --- |
| "Permission denied for table" was chased for a day as a policy bug. It was a request with nobody signed in: row-level security returns no rows, it does not raise. | Read that error as a grant or session problem first. | `AGENTS.md` section 3 |
| A rule meant to let a recipient mark a message read also let them change its words. Nobody appears to have used it. | Marking read changes nothing else; a conversation is now the one thing in the app that only its author can change. | The conversation's policies in `supabase/migrations/` |
| A new migration numbered `00NN_` sorted before every timestamped one, and would have run before the tables it needed on a fresh database. | Timestamps only; digits, an underscore, then the name. | `tests/a-church-can-install-it-either-way.mjs`, `fresh-install.yml` |
| A comment claimed the realtime feed would apply the read rule to a deletion. It did not, and a taken-back reaction would have been announced to every church. | Check how a platform behaves before writing it down; a reaction is taken back by emptying the row. | Invariant 14 in the AI chapter |
| A report could point at a post its author then deleted, leaving a Director with a report about nothing. | Copy the reported content into the report at the moment it is made; reports have no delete policy. | `AGENTS.md` section 2 |
| `select('*')` let a column reach a browser that had no business holding it. | Name the columns; the return type has no field for what was not asked for. | Invariant 7 in the AI chapter |

## Checks and the gate

| What happened | The rule now | Held by |
| --- | --- | --- |
| A check matched its own comment and passed for weeks. | Strip comments before searching code. | The quality chapter |
| A check walked files with a Unix `find` that returned nothing on Windows, and printed `ok`. | Walk the tree in Node; normalise paths. | `verify.yml` on three systems |
| A script that crashed before printing anything looked exactly like a pass to somebody grepping for `FAIL`. | Read the exit code, not the words. | `scripts/verify.mjs` |
| A walk failed on a slow runner because a folder loaded on demand was not there yet, and a tap-tempo walk compared against an ideal tempo the runner could not keep. | Wait for what a person waits for; compare against what really happened. | `tests/e2e/the-music-room.js` |

## Documents and PDFs

| What happened | The rule now | Held by |
| --- | --- | --- |
| Every screenshot vanished from the first PDF guides: the link pattern matched `![alt](src)` before the picture pattern could. | Pictures before links. | `docs/handbook/build-pdf.js`, and the builder for these guides |
| Every cross-reference in a PDF was dead once the file left its folder. | Links to documents are rewritten to GitHub, or kept inside the book when the chapter is in it. | Both PDF builders |
| Every document said the app was on a free plan. It was not, and the wrong figure was informing decisions. | Numbers about cost or usage are measured on the day, and dated. | `docs/WHAT-IT-COSTS.md` |
| A stale local copy of the repository produced a commit count four times too large, and it reached a decision. | Fetch before quoting any number about a remote. | The AI chapter |

## Two agents, one repository

| What happened | The rule now | Held by |
| --- | --- | --- |
| Two agents each added release notes at the top of the same list; git's conflict block split an entry in the middle, and a naive "keep both" dropped its closing brackets. | Merge by hand: keep both, in the order they landed, and run the typecheck and the gate on the union before pushing. | `AGENTS.md` section 7 |
| `Card` in `components/ui.tsx` passes on only two `data-` attributes, so a walk's hook added to a card silently did not exist. | Put a walk's hook on an element that keeps it, or use one the component passes on. | The walks that rely on `data-panel` |
| One agent's pushes moved `main` under the other's branch. | Each agent names its lane (the files it will and will not touch) in a handoff, and merges are fast-forward only, never forced. | `AGENTS.md` section 7 |

## The one lesson under all of them

**Say which happened: done, or blocked.** A constraint hit is not a design
decision, and the reasoning for a fallback belongs in a different sentence from
the reason there had to be one. Pushed is not deployed, and deployed is not
observed. A screen nobody has seen rendered is a screen nobody has seen
rendered. Every lesson in this chapter was cheaper to learn because somebody
wrote down plainly what had and had not been checked.
