# Contributing

Thank you for being here. This app exists to be forked, changed and made into
somebody else's — so if you are only using it for your own church, you owe
nothing and can stop reading. If you want to send something back, this is how.

---

## Get it running

```bash
git clone https://github.com/Klydo131/Open-Sentry-Beacon
cd Open-Sentry-Beacon
npm install
npm run dev            # http://localhost:3000
```

That is the whole setup. No `.env` to fill in, no database, no account, no seed
script. Sample people and sample activity are already there.

That is the **sample side**, which is the whole app for anybody exploring it.
There is a second half — the signed-in app, which talks to a Supabase project —
and it needs credentials nobody outside a running church has. Everything under
`lib/live/`, `components/live/` and `supabase/` belongs to that half. If you are
changing it, read [AGENTS.md](./AGENTS.md) first: it is the working brief for
the app's two halves, its product rules and how its authorisation is arranged.

Requires **Node 22 or newer** and nothing else. Some tests import TypeScript
directly and rely on Node's native type stripping, so there is no build step
between the code that ships and the code that is checked.

---

## How a change travels

Every change here, yours or your AI tool's, goes the same way. It is the
owner's rule, in their words: "test, polish, and before pushing I should be
aware".

1. **Plan it and show it.** For anything bigger than a small fix, open an issue
   (the "idea" template) or a draft pull request that says what you mean to
   change and why, before you build it. If it changes how the app behaves for
   people, the owner decides.
2. **Test it.** See below. Break your new check on purpose and watch it go red.
3. **Polish it.** Run it and look at it. For anything somebody sees, attach
   screenshots at a phone, a pad and a desktop size. If it changes a screen
   that the guides show, `npm run docs:refresh` retakes every picture and
   reprints every guide in one go; look at what changed before committing.
4. **The owner is told, and merges.** Your pull request says what changed, what
   passed, and what you could not check. Nothing reaches `main` except through a
   pull request the owner merges.

**Using an AI tool?** The same four steps, and three more lines:

- it works on a branch and opens a pull request; it never pushes to `main`;
- its pull request lists what it could **not** verify (a browser it did not
  have, a signed-in screen it could not open), in so many words;
- it reads [`AGENTS.md`](./AGENTS.md) first, whatever tool you use; section 0.2
  is this same rule.

---

## Before you open a pull request

```bash
npm test          # every check that does not need a browser (~1 min)
npm run test:all  # the above, plus the real-browser walks (~4 min)
```

`npm test` has to be green. Run `npm run test:all` too if you touched anything
somebody clicks — it drives a real browser through the guided walks and catches
the class of bug where the code is right and the button is under a banner.

If a check fails and you believe the check is wrong, say so in the pull request.
Several of these tests exist because a previous version of them was wrong; that
is a fair argument to make, and a better one than quietly deleting the file.

---

## What a good pull request looks like

**Say what breaks without it.** Not "improves the Director page" — "a Director with
more than 40 members cannot reach the invite button on a phone". One concrete
sentence about what goes wrong is worth a page of description.

**Keep it to one thing.** A fix and a refactor in one diff is two reviews
pretending to be one.

**Add a test for a fix**, and make it fail first. Break the code it covers and
watch it go red. A test that has never failed is a comment with a run time.

**Match the surrounding style.** Do not reformat files you are not changing.

---

## House style

These are not preferences. Each one exists because its absence cost somebody a
day.

### Comments explain *why*, not *what*

The code already says what it does. A comment earns its place by recording the
bug that made it necessary, or the obvious alternative and why it failed.

You will find a lot of these, some of them long. They are the most valuable
thing in the repository — this project is meant to be inherited, and the bar is
not "does it work" but "will the next person understand why it is like that".

### Guardrails are tests, not agreements

If a rule matters, there is a file in `tests/` that fails when it is broken.
`npm run verify` runs all of them — typecheck, build and every guardrail — and
CI runs the same command on Ubuntu, macOS and Windows, so a green run on Linux
alone is not a green build. `scripts/verify.mjs` is the list, each entry with a
line saying why it is there.

Four of them hold the oldest promises this project makes about itself:

| File | Refuses |
|---|---|
| `tests/no-backend.js` | A database dependency, a route that stores data, an analytics SDK, a call to an external server, or somebody else's deployment pipeline reappearing. |
| `tests/no-secrets.js` | A credential of recognisable shape in any tracked file, a real `.env`, sample data at a domain that could reach a real inbox. |
| `tests/security-invariants.mjs` | A weakened Content-Security-Policy, a URL guard that stops blocking `javascript:`, CI a pull request could hijack. |
| `tests/brand-consistency.mjs` | Icons drifting from the one drawing of the logo, or the app's name hardcoded somewhere a rename would miss. |

If your change makes one of these fail *correctly* — you are adding a backend on
purpose, say — update the test to describe the new truth. Do not delete it.

### Assert behaviour, not shape

A test that passes because it found a string somewhere on the page is worse than
no test: it reports green and covers nothing. One suite here once printed
`ALL OK` for a tutorial that was completely stuck.

### No new dependencies without a strong reason

This app ships React and Next and almost nothing else, on purpose. It has to
stay installable on a cheap phone and auditable by one person in an afternoon.
A pull request adding a dependency should say what it replaces and why the
fifteen lines it saves are worth it.

### Three product rules that outrank convenience

**An Explorer never sees their own journey stage.** A stage is a note the church
keeps to organise its work, not a label to show a human being about themselves.
`tests/e2e/seeker-no-stage.js` enforces it.

**Leaders get counts; Guides get the relationship.** There is no screen
anywhere that shows a pastor somebody's conversation, and adding one would
change what this app is. If you think it needs one, open an issue first.

**Any room where one person can hurt another has a way out of it.** Three
things, on the same screen as the harm: a way for the person harmed to report
it, somebody whose job it is to look and who is notified by name, and a record
that outlives the person it describes. `reports` has no delete policy at all,
deliberately — a safeguarding record that can be made to disappear is not a
record. A group board shipped here without any of the three, and the fix is
worth reading before you build another room like it:
`tests/a-way-out-of-the-guild-room.mjs`.

---

## Where things are

| Path | What lives there |
|---|---|
| `app/` | Routes. One folder per screen, Next.js App Router. |
| `components/` | Everything visual. No data fetching. |
| `components/live/` | The signed-in screens: door, admin, guide, explorer. |
| `lib/demo/store.tsx` | The sample store: every piece of state, every action. |
| `lib/demo/seed.ts` | The sample church. |
| `lib/live/data.ts` | Every call the signed-in app makes to the database. Nothing else talks to it. |
| `lib/live/session.tsx` | Who is signed in, and the rules for deciding they are not. |
| `lib/backend/` | The seam where a real backend plugs in. |
| `supabase/migrations/` | The database, in order. Timestamp filenames — see AGENTS.md. |
| `lib/brand.ts` | The app's name and colours. Change here, nowhere else. |
| `lib/quest.ts` | The guided walks, one per role. |
| `lib/types.ts` | Every shape in the app, in one file. |
| `app/themes/` | The looks other than Classic, one stylesheet each (see AGENTS.md). |
| `tests/`, `tests/e2e/` | Guardrails, unit checks, real-browser walks. |
| `docs/`, `scripts/refresh-docs.mjs` | The guides and manuals, and the one command that retakes their pictures and reprints them. |

[ARCHITECTURE.md](./ARCHITECTURE.md) explains how the pieces fit.
[docs/BACKENDS.md](./docs/BACKENDS.md) covers connecting a real one.

---

## Sample data

The sample church is fiction and must stay fiction. Names use reserved domains
(`.example`, `.test`) that can never resolve to a real inbox, and a test enforces
it.

**Never commit real people's details** — not briefly, not in a branch, not "to
test something". A public repository is indexed within minutes and git
remembers.

---

## Reporting a bug

Open an issue with what you expected, what happened, and the build id from
**Settings › App version**. That id usually tells us more than a description
does.

## Reporting a vulnerability

**Not** in a public issue. Use GitHub's private
[Security Advisories](https://github.com/Klydo131/Open-Sentry-Beacon/security/advisories/new).
See [docs/SECURITY.md](./docs/SECURITY.md) for what to include and what to
expect.

---

## Licence

AGPL-3.0-only. By contributing you agree your work ships under it. **You keep
your copyright** — you are not signing your work over to anybody, and you never
will be asked to.

---

## Contributor Licence Agreement

Short version: you keep your copyright, and you also let the project's
maintainer license the project — including your part of it — to somebody else on
different terms.

**Why this exists, plainly.** This app is built for churches, and some of them
will want to run it through an organisation whose legal department refuses AGPL
software outright. That refusal is a policy, not an argument, and it never
reaches a technical discussion. The way past it is for the maintainer to hand
that organisation a separate private licence for the same code while the public
repository stays AGPL for everyone else.

That only works while the maintainer can license **all** of the project. The
moment one contribution is AGPL-only and cannot be relicensed, the whole project
is AGPL-only forever — and a congregation gets turned away by a policy rather
than by anything to do with the software. This document is what stops that
happening. The public repository stays AGPL-3.0 regardless; nothing here changes
what you or anyone else receives.

**By opening a pull request you confirm all of the following.**

1. **You keep your copyright.** You are granting a licence, not transferring
   ownership. You may go on using your own contribution anywhere else, under any
   terms you like, for ever.

2. **You grant a licence to relicense.** You grant Klydo131, the project's
   copyright holder, a perpetual, worldwide, non-exclusive, royalty-free and
   irrevocable licence to reproduce, modify, publicly display, sublicense and
   distribute your contribution — both under AGPL-3.0 **and under other terms,
   including proprietary ones**.

3. **You grant a patent licence.** On the same terms, you grant every recipient
   of the project a perpetual, worldwide, non-exclusive, royalty-free and
   irrevocable licence under any patent claims you own that your contribution
   necessarily infringes. If you start patent litigation alleging the project
   infringes a patent, this grant to you ends.

4. **It is yours to give.** The contribution is your original work, or you have
   the right to submit it under these terms. If your employer has rights in what
   you write, you have their permission — this is the one that catches people
   out, and it is worth ten minutes now rather than an argument later.

5. **No warranty.** You provide the contribution as-is, with no warranty of any
   kind, to the extent the law allows.

**What this is not.** It is a click-through agreement recorded by your pull
request and the checkbox in the template, not a signed document. That is normal
for a project this size and it is honest to say it is weaker than a signed one.
For a large or unusual contribution the maintainer may ask for something firmer
before merging, and saying no to that is a perfectly reasonable answer — it just
means the contribution cannot be merged.

**It is not retroactive.** It applies to contributions made after it was added.
Every commit before it came from the copyright holder, so there is nothing
earlier to reconcile.

**Not legal advice.** If any of the above matters to you commercially, have your
own lawyer read it before you open the pull request.
