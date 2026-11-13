# Lessons from what broke

**For developers who will build on Hope Beacon.** Every lesson here is a real
failure from this codebase, told the same way:

- **What happened**, as a member saw it.
- **Why**, the mechanism underneath.
- **The rule** that stops it happening again.
- **Where it is guarded**: the file and the test that fail if the rule is broken.
- **Try it**: break the rule yourself and watch the test go red.

Read it before your first change. Each lesson is short.

> **The habit that matters most.** When you add a check, break the code on
> purpose and confirm the check fails. A test that has never been red has not
> been shown to test anything. Every guard named below was proven that way.

---

## Security and privacy

### 1. The database decides who reads, never the screen

**What happened.** A Director needed to show a Sabbath program to the church's
Guides but not to its Explorers. Hiding the post from Explorers in the app would
have looked finished.

**Why.** Anyone can call the database's API directly with their own sign-in and
skip the app entirely. A rule that lives only in a React component is a
suggestion, not a rule.

**The rule.** Who may read a row is decided in Postgres, by row-level security
and the `can_read_post` function. The app only mirrors that decision so it can
draw the right screen.

**Where it is guarded.**
- `supabase/migrations/20261113120000_a_leader_can_show_a_plan_to_the_guides.sql`
  adds the `guides` audience. Its clause names the readers explicitly (`dm`,
  `admin`, `executive`, approved and not suspended), so an Explorer (`ds`) is
  never among them.
- `tests/plans-are-shelved-and-shown.mjs` fails if `'ds'` ever appears in that
  clause.

**Try it.** Add `'ds'` to the role list in the migration and run
`node tests/plans-are-shelved-and-shown.mjs`.

### 2. Change a security function additively, and keep every old clause word for word

**What happened.** Adding the `guides` audience meant replacing `can_read_post`,
which decides every blog read in every church.

**Why.** `create or replace function` swaps the whole body. If you retype it from
memory, one dropped clause silently hides every Guide's posts from their
Explorers, and nothing errors.

**The rules.**
- Copy the current body exactly and only add to it.
- Before applying to a live database, read the live definition
  (`pg_get_functiondef`) and compare it with the repo before anything is
  replaced.
- Add a new enum value in its own transaction. Postgres will not let you use a
  value in the transaction that created it, which is why `can_read_post`
  compares the audience as `::text`.

**Where it is guarded.** `tests/plans-are-shelved-and-shown.mjs` checks that
each existing reader clause from migration 0042 is still present verbatim.

### 3. Hosting protection is not app privacy

**What happened.** Members opening the app were sent to Vercel's own login
page. They could not get in at all.

**Why.** Vercel's Deployment Protection was set to cover *all* deployments,
including the production address. It is meant for preview builds, so that
unfinished branches are not public.

**The rules.**
- Members are kept out by the app's own sign-in and by row-level security, not
  by the host.
- Search engines are kept out by three signals that must agree:
  - the `robots` metadata in `app/layout.tsx`;
  - `app/robots.ts`;
  - the `X-Robots-Tag` header in `next.config.mjs`.
- All three read `BEACON_PUBLIC_SITE`. Leave it unset for a private, invite-only
  church.

**Where it is guarded.** `tests/security-invariants.mjs` fails if the three
search signals drift apart.

---

## Data that is shared

### 4. Delete everything you shared, not only what you remember sharing

**What happened.** A leader deleted a Sabbath program, but its shared copy
stayed on Home and on This Sabbath. They could not get rid of it.

**Why.** Sharing posts a copy and the plan remembers that post's id. A copy
shared twice, or from another device, is not among the remembered ids, so
deleting by id alone left it behind.

**The rules.**
- Take down by id *and* by title.
- Give the person who shared something a direct way to take it down where they
  see it: on This Sabbath, **Take down what I shared**.
- If the take-down fails, delete nothing and say why.

**Where it is guarded.** `tests/a-deleted-plan-comes-down.mjs`.

**Try it.** In `components/SabbathProgram.tsx`, change the delete back to
`open.shared ? [] : [shareTitle(open)]` and run the test.

### 5. A thing has one home on the screen

**What happened.** Shared Sabbath programs appeared under "From the blog" on
Home, twice, next to real blog posts.

**Why.** Under the hood a shared plan *is* a blog post, because the blog is
what reaches each Explorer's phone and stays there offline. The storage
mechanism leaked into the screen.

**The rule.** Show things by what they mean to a member, not by how they are
stored. A shared plan is at most one announcement card that opens This Sabbath
(`lib/home-plans.ts`), and it is filtered out of the blog strip.

---

## Layout and the small details

### 6. An outline drawn outside the box gets cut by a scrolling row

**What happened.** Filter chips (All, SLPUM, SSD, GC) and the Home quick links
had their outlines shaved off at the top and the ends.

**Why.** Tailwind's `ring-1` is a box-shadow drawn *outside* the element. A row
with `overflow-x: auto` clips everything outside its own box.

**The rules.**
- Inside a sideways-scrolling row, draw the ring inside the element
  (`--tw-ring-inset: inset`, `app/globals.css`).
- Better still, do not make short lists scroll sideways at all. On a phone the
  Home quick links are now two even columns, so nothing is ever cut.

### 7. An animation that "fills forwards" traps everything fixed inside it

**What happened.** The Study Room slid under the tutorial bar and could not be
reached.

**Why.** An element whose animation keeps its final `transform` (fill-mode
`forwards` or `both`) becomes the containing block for every `position: fixed`
child inside it. Those children then stop being fixed to the screen.

**The rule.** Page entrances use fill-mode `backwards`, or none.

**Where it is guarded.**
- `tests/an-entrance-leaves-no-layer.mjs`.
- `tests/an-explorer-is-celebrated.mjs` checks the celebration bursts too.

### 8. Every animation can be stilled

**The rule.** Anything that moves needs `animation: none` in a
`prefers-reduced-motion: reduce` block *after* the rule that starts it. The
celebrations show their words and nothing else.

**Where it is guarded.** The verify check "every animation can be stilled"
names each rule that would still move.

### 9. A look's broad rule reaches places it was never meant for

**What happened.** In the Study Room, a white square with sharp corners sat
inside the grey rounded search box.

**Why.** The Modern look paints every `input` with a panel colour and a border,
through a selector far more specific than the Study Room's own.

**The rule.** When a component's visible box is a wrapper, not the input
itself, say so where the component lives (`components/study/study-shell.css`,
"THE BOX IS THE FIELD"). Look sheets live in `app/themes/<id>.css`, and every
rule in them starts with `:root[data-ui-theme="<id>"]`, so a look can never
leak into another look.

### 10. One radius per kind of thing

**What happened.** Corners looked inconsistent from one screen to the next.

**Why.** Cards were drawn at 16, 20 and 24px side by side, and buttons inside
them at 8px or fully round.

**The rule.** The Modern look follows the Astryx scale (`app/themes/modern.css`):

| Kind of thing | Radius |
|---|---|
| A container (cards, panels, dialogs) | 12px |
| A control (buttons, inputs) | 10px |
| A small inner thing | 6px |

There is one hairline edge for every card, and hover is a ring drawn *inside*
the card, so it follows the corner and moves nothing. Things that mean a person
or an on/off state (avatars, dots, switches) stay round.

---

## Building

### 11. The 430 kB door

**What happened.** The Office page reached 431 kB of JavaScript and the build
gate refused it.

**The rule.** A room that most visits never open is loaded when it is opened
(`next/dynamic`). The analytics rooms in `app/office/page.tsx` are the example.

**Where it is guarded.** The verify check "the door is light".

### 12. Unused exports, and the import cycle that hides one

**What happened.** A helper exported from `SabbathProgram.tsx` and imported by
`PlanShelf.tsx`, which `SabbathProgram.tsx` itself imports, was reported as
unused.

**The rule.** If two components need the same small helper and one already
imports the other, keep the helper where it is used. `scripts/unused-exports.mjs`
runs in the gate.

### 13. Never weaken a test to make a change pass

When a test pins old behaviour that has deliberately changed, update the test
to pin the *new* intent, in the same commit, and say why in the test.

**Example.** `tests/e2e/install-detection.js` used to require "about an hour"
before the install invitation returns. It now requires about a month, and says
why in the test.

---

## The gate

`npm run verify` runs the typecheck, the production build and every guardrail:
202 checks at the time of writing. CI runs the same thing on Ubuntu, macOS and
Windows. A change is not finished until it passes. A change that touches the
database is not finished until the migration has also been read back on each
live database it was applied to.

See also:
- [`AGENTS.md`](../AGENTS.md): the product rules and how two agents share a
  branch.
- [`docs/SECURITY-LAYERS.md`](./SECURITY-LAYERS.md): the security model, layer
  by layer.
- [`docs/HANDBOOK.md`](./HANDBOOK.md): how the whole app fits together.
- [`CHANGELOG.md`](../CHANGELOG.md): what each change asks of a church running a
  copy.
