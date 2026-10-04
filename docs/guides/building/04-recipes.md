# Recipes

The changes people make most often, each as a list of steps with the files to
touch and the proof to show. Each recipe assumes you have read *Proving it
works*; each ends at the same place: `npm run verify` passes, every new check
has been seen to fail, and the change is shown to the owner before it reaches
`main`.

> **IMPORTANT** · Every recipe touches both halves
>
> The sample half (`AppShell`, `lib/demo/`) and the live half (`LiveAppShell`,
> `lib/live/`) are one product. A recipe that only names one of them is
> unfinished. Where a feature needs nothing from the database, both halves
> draw the same component, which is the easiest way to keep them together.

## Add a room

A room is a place in everybody's Menu. Add one only when the work does not
belong in a folder of an existing room: a screen with more than about four
panels is a scroll, and a new room is a new thing for every member to learn.

1. **Decide who has it.** Add an entry to `railGroupsFor` in
   `components/RoomRails.tsx`, such as
   `const notes = { href: '/notes', label: 'Notes', icon: '📝' }`, and put it in
   the role lists that need it, with a comment saying who asked for it and why.
   The Menu, the computer's sidebar and both halves now list it.
2. **Make its address.** Create `app/notes/page.tsx`. Ask `useIsLive()` and wrap
   the room in `LiveAppShell allow={[...]}` or `AppShell allow={[...]}`, with the
   same roles as step 1. Somebody outside the list is sent to their own home.
3. **Give it folders**, if it has more than one job: a `rooms` list and
   `useRoom(rooms, 'beacon:notes-room')`. The first folder is what the room is
   for, because it opens there when nothing is remembered.
4. **Put the work in `lib/`**: anything that is not drawing goes in
   `lib/notes/`, with no React, so a check can run it.
5. **Keep it light.** Load any heavy folder with `next/dynamic`, as the Music
   room does, so opening the room costs what opening any room costs.
6. **Make it work offline**: add `'/notes'` to `SHELL` in `app/sw.js/route.ts`.
7. **Give it a glyph** in `components/FreshMenu.tsx` and `components/Glyph.tsx`,
   and a line saying what it is for.
8. **If people can reach each other in it**, it needs the three things in
   `AGENTS.md` section 2 *before it ships*: a way to report harm on the same
   screen, somebody whose job it is to look, and a record that outlives the
   person it describes.
9. **Prove it.** A static check that the room is in the right role lists and
   its promises hold (`tests/the-music-room.mjs` is the model); a walk that
   opens it as each role on a phone and a computer; add both to
   `scripts/verify.mjs`. Update `tests/e2e/playlists.mjs` or any walk that
   counts Menu rows.
10. **Tell people.** A release note, a section in `docs/HANDBOOK.md` and
    `docs/HOW-TO-USE.md`, a row in the room tables of the guides, and new
    screenshots.

## Add a folder to a room

1. Add `{ id: 'notes', label: '📝 Notes' }` to the room's `rooms` list, in both
   halves (the sample page in `app/<room>/page.tsx` and the live page in
   `components/Live*.tsx` or `components/live/`).
2. Draw its panel when `room === 'notes'`. **A panel lives in exactly one
   folder.**
3. If an old link points at a card by `#anchor`, map the anchor to the folder in
   the third argument of `useRoom`, so the link still lands.
4. `tests/rooms-and-subrooms.mjs` checks every link that names a folder; run it.
   `tests/e2e/office-subrooms.js` shows how a walk opens folders through the
   drop-down (`[data-subroom-toggle]`, then the option by its role).

## Add a look

The rule, from `AGENTS.md`: **a new look never changes Classic.**

1. Register it in `lib/ui-themes.ts`, after Classic, with a name and a line that
   says what it is like.
2. Put every style in `app/themes/<id>.css`, every rule starting
   `:root[data-ui-theme="<id>"]`, and import the file in `app/layout.tsx`.
3. If it needs something Classic does not draw, give it a component that renders
   nothing unless that look is chosen (`useChosenLook` in
   `components/UiTheme.tsx`).
4. **Never** edit `globals.css`, `tailwind.config.ts` or a component's own
   classes to make a look work. Restyle shared things through their `data-`
   hooks (`data-app-header`, `data-avatar`, and the others listed in
   `AGENTS.md`).
5. Prove it: `tests/the-classic-look-stays.mjs` and its walk must still pass;
   `tests/themes-are-readable.mjs` must pass for the new look; the desk colours
   must work in it (`tests/room-colours-keep-the-look-light.mjs`).
6. Add it to the looks gallery: the list in `scripts/complete-guide-shots.mjs`.

## Change the database

1. **A new file, never an edit.** Name it with a timestamp and words:
   `supabase/migrations/20261005120000_a_note_belongs_to_its_writer.sql`.
   Digits, an underscore, then the name, or `supabase db push` skips it.
2. **Enable row-level security on every new table, and write each policy as a
   sentence**: who may read, who may write, and nothing for a signed-out
   visitor. Grant to `authenticated`, never to `anon`.
3. **Anything privileged** is a `security definer` function in the `private`
   schema that checks who is asking and raises `42501` when it should not
   proceed, behind a thin `public` wrapper.
4. **Name the columns** in `lib/live/data.ts`; never `select('*')`. The column
   list is the access control.
5. **Dry-run it** against a real database inside `begin; … rollback;`, and test
   the policies as each role in turn.
6. **Let the app work without it.** A church may update the code before the
   database. The feature must step aside quietly on a database that has not had
   the migration, as the conversation's replies and reactions do.
7. **Prove it.** A SQL test in `supabase/tests/`; `fresh-install.yml` runs every
   migration from nothing on each push; the matching change in the sample store
   (`lib/demo/store.tsx`) and its seed.
8. **Never apply it to a live church's database without the owner's go**, and
   then verify it read-only afterwards.

## Add a check, or a walk

*Proving it works* has the full pattern. In short: name the file as the
sentence it holds; open with why it exists; add it to `scripts/verify.mjs` with
a comment; break the thing it guards and watch it fail; put it back.

## Add a dependency

Think twice: a few dozen lines of your own, with a check, usually beat a
package and everything it brings with it.

1. Pin the exact version in `package.json`, and commit the lockfile.
2. Check it runs **nothing on install**, uses **no `eval`** and **no
   WebAssembly** (the security policy refuses both), and fetches nothing at run
   time.
3. Read its licence. `tests/dependency-licences.mjs` fails on any licence this
   project has not reviewed for shipping under AGPL-3.0-only.
4. `npm run build` regenerates the third-party notices
   (`scripts/third-party-notices.mjs`); add a line to `NOTICES.md` if it is
   something people will see.
5. Write down what else was considered and why this one won, as
   `docs/MUSIC-RESEARCH.md` does for pitchy.

## Write a release note

Members read these in **Settings**, **What's new**.

1. Add an entry **at the top** of `RELEASE_NOTES` in `lib/release-notes.ts`:
   an `id` of the date and a few words (`2026-10-05-notes-room`), never reused;
   the `date`; a `title` in plain words; and `items`, each one sentence a member
   would understand.
2. Never reorder or remove another entry. Two people adding notes on the same
   day keep both, in the order they landed.

## Refresh the screenshots and the guides

1. `npm run build`, then `node scripts/run-next.mjs start -p 4321`.
2. The handbook's pictures: `node scripts/walkthrough-shots.mjs`. The complete
   guides' atlas: `node scripts/complete-guide-shots.mjs 4321` (or its three
   parts, `phone`, `computer` and `extras`, side by side).
3. **Look at every picture before using it.** Sample people only; no tutorial
   bubble over the thing it is meant to show; nothing cut off.
4. The handbook PDFs: `node docs/handbook/build-pdf.js`. These two guides:
   `node docs/guides/build-reference.mjs`, then `node docs/guides/build-guides.mjs`.
5. Search the text of every PDF for anything that must never be in a public
   file before sharing it.

## Hand a change to the owner

Whatever the recipe, the last step is the same, and it is in `AGENTS.md`
section 0.2:

1. Say which commits would reach `main`, and what each changes, in plain words.
2. Say what passed, and **what was not verified**: screens nobody has seen on a
   real phone, Safari if it did not run, the live database if a migration has
   not been applied.
3. Wait for the owner's go.
4. After pushing, report **pushed, build not observed** until somebody has
   seen the deployed site.
