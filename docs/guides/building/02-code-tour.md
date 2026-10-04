# A tour of the code

This chapter walks through the repository the way a new developer should meet
it: the map first, then the ten files worth reading before any others, then two
features followed from a tap on the screen to the row in the database. The
*Architecture* chapter before this one says what the shape is and why; this one
says where to put your finger.

## The map

| Folder | What lives there | Size, roughly |
| --- | --- | --- |
| `app/` | Every address in the app: one folder per room, each with a `page.tsx`. Also the service worker (`app/sw.js/route.ts`), the looks (`app/themes/*.css`), and the page skeleton (`app/layout.tsx`) | 27 pages |
| `components/` | The screens and their parts. `Live*.tsx` and `components/live/` are the live half; the rest serve the sample half or both. Feature folders: `talk/` (the conversation), `music/`, `study/`, `draw/` | about 130 files |
| `lib/` | Everything that is not drawing: data, rules, formats, storage. `lib/demo/` is the sample church, `lib/live/` the live half's data, `lib/music/` the Music room's arithmetic | about 120 files |
| `supabase/` | The database: `migrations/` (every table and every rule, in order), `functions/` (the three edge functions), `seed/`, and SQL `tests/` | 141 migrations |
| `tests/` | The gate's static checks, one file each, named as the sentence they hold true; `tests/e2e/` holds the browser walks | 178 checks, 74 walks |
| `scripts/` | The gate itself (`verify.mjs`), the Next.js launcher, build stamping, screenshots, icons | |
| `docs/` | Every guide, including this one, and the screenshots they use | |
| `public/` | Icons, the offline page, the looks' pictures, third-party notices | |

Part VIII lists every file with the comment at its top, generated from the code.

## Ten files to read first

Read these in order and you will know where nearly everything else must be.

1. **`lib/mode.ts`**: decides whether this deployment has a database, from two
   settings. *The hinge of the whole project*, in its own words.
2. **`lib/tutorial.tsx`**: `useIsLive()`, the one question every screen asks:
   draw the live version, or the sample one?
3. **`components/RoomRails.tsx`**: `railGroupsFor(role)`, the one list of rooms
   for each role. The Menu, the computer's sidebar and both halves all draw it.
4. **`components/Rooms.tsx`**: `useRoom(rooms, key)`, the folders inside a room,
   remembered per room and per device, with the drop-down that switches them.
5. **`lib/demo/store.tsx`**: the sample half's whole data layer. Its `Ctx`
   interface is the complete list of what the app can do.
6. **`lib/live/data.ts`**: the live half's whole data layer, and the only file
   that talks to the database: about 270 exported functions.
7. **`lib/supabase/client.ts`**: the connection, which returns `null` without
   keys and never throws, so the app always starts.
8. **`supabase/migrations/0001_core_schema.sql`**: the first tables and their
   row-level security. Read one policy and you can read them all.
9. **`next.config.mjs`**: the security headers, including the content security
   policy every new feature has to live within.
10. **`scripts/verify.mjs`**: the gate, and its list of every check in order.

## Following a message, from the tap to the row

An Explorer types *Thank you* and taps the arrow.

**On the screen.** The conversation is one shared view for both halves, in
`components/talk/`: `ChatView.tsx` draws the thread, `Composer.tsx` the box
and its buttons, `MessageMenu.tsx` the reactions and Reply that appear on a
tap. The view is handed a function to send with; it does not know which half
it is in.

**In the sample half.** `components/Chat.tsx` takes `sendMessage` from
`useDemo()` and calls `sendMessage(pairingId, body, replyTo)`. The store
(`lib/demo/store.tsx`) appends the message to its state, saves it to
`localStorage`, and every screen reading that state draws again.

**In the live half.** `components/live/TalkSurface.tsx` calls
`live.sendMessage(active, text, replyTo)`, which is `sendMessage` in
`lib/live/data.ts`. That inserts one row into `messages` through the Supabase
client, as the signed-in person.

**In the database.** The insert meets the `messages_send` policy. It was first
written in `0001_core_schema.sql` and has been replaced since; the current text
is always the last migration that defines it. It holds three conditions: the
sender is the person signed in, that person is in this pairing
(`public.in_pairing`), and they are not suspended. A request that skipped the
screens entirely would meet exactly the same sentence. As the trial room's
migration puts it: *a screen is not a security boundary; this is.*

**Back to the other phone.** The Guide's open conversation is told of the new
row through Supabase realtime and draws it; the walk `tests/e2e/
media-and-realtime.js` holds that. If the Guide's phone is offline, the message
is there when the conversation next loads.

**What can go wrong, and what holds it.** A pace rule in the database refuses
more than forty messages a minute from one account. A photo is shrunk and has
its location removed on the phone (`lib/live/shrink-image.ts`,
`lib/live/photo-location.ts`) before it is uploaded, and
`tests/e2e/photos-shrink-before-sending.js` holds it. The SQL test
`supabase/tests/a-conversation-can-reply-react-and-speak.sql` holds the reply,
reaction and voice rules in the database itself.

## Following a room: Music

The Music room is the newest room and the cleanest example of how a room is
put together.

1. **In the list of rooms.** `components/RoomRails.tsx` defines
   `const music = { href: '/music', label: 'Music', icon: '🎵' }` and puts it in
   all three role lists. That alone puts it in every Menu and every computer
   sidebar, in both halves.
2. **Its address.** `app/music/page.tsx` asks `useIsLive()` and wraps the same
   room in `LiveAppShell` or `AppShell`. The room needs nothing from the
   database, so the two branches draw the same component.
3. **Its folders.** `components/music/MusicRoom.tsx` calls
   `useRoom(ROOMS, 'beacon:music-room')` with Listen, Tuner, Conductor and
   Pieces. Only Listen is in the page itself; the other three are loaded with
   `next/dynamic` once the room has opened and the phone is idle, so opening
   Music costs no more than opening any room.
4. **Its work.** Everything that is not drawing is in `lib/music/`: note
   arithmetic, the tuner's microphone handling, the beat patterns, the score and
   zip readers, the scanner's geometry and the pieces store. None of it imports
   React, so the static check can run it directly.
5. **Offline.** `/music` is in the service worker's `SHELL` list in
   `app/sw.js/route.ts`, so the room opens with no signal once installed.
6. **Its proof.** `tests/the-music-room.mjs` runs the arithmetic, throws
   hostile scores and archives at the readers, and reads the code for its
   promises (the microphone is released, nothing is sent); `tests/e2e/
   the-music-room.js` walks it in a browser with a tone played into a fake
   microphone. `docs/MUSIC-RESEARCH.md` records what was considered and why.

That is the pattern for any new room: one entry in `railGroupsFor`, one route
with both shells, folders through `useRoom`, the logic in `lib/`, a place in
the offline shell, a static check, a walk, and a document.

## How a look is put together

`lib/ui-themes.ts` lists the looks. **Classic has no stylesheet**: it is what
every component already draws, so it cannot drift. Every other look is one file
in `app/themes/` whose rules all begin with
`:root[data-ui-theme="<id>"]`, imported in `app/layout.tsx`, so it reaches
only the people who chose it.
`components/LookBeforePaint.tsx` puts the chosen look on `<html>` before the
first frame. A desk colour (`lib/room-theme.ts`) recolours a look while keeping
its own light or dark. The checks: Classic gains no style, a look's rules stay
inside the look, every look stays readable, and a walk measures Classic against
the day it was named.

## Where things are kept

| Kind of data | Where | Written by |
| --- | --- | --- |
| Accounts, pairings, conversations, prayer, posts, studies, reports | Postgres, behind row-level security | `lib/live/data.ts` |
| Photos, voice messages, study handouts, resources | Supabase Storage, under the same boundary as the rows | `lib/live/data.ts`, `lib/live/storage-path.ts` |
| The Study Room's pages | Postgres, `study_docs`, readable by their owner only | `lib/study/doc-source.ts` |
| Sabbath programs, evangelistic meetings | The device first, then `office_plans`, owner-only | `lib/plan-sync.ts`, `lib/live/office-plans.ts` |
| My Files, the Music room's pieces | IndexedDB on the device; never uploaded | `lib/localMedia.ts`, `lib/music/pieces.ts` |
| Look, text size, desk colours, last folder | `localStorage` on the device | `lib/ui-themes.ts`, `lib/room-theme.ts`, `components/Rooms.tsx` |
| The whole sample church | `localStorage`, in the browser | `lib/demo/store.tsx` |

## Server-side code, and why there is so little

The pages are static and the browser does the work, with the person's own
sign-in. Three edge functions in `supabase/functions/` are the exceptions, each
because it needs something a browser must never hold:

- **`invite`** creates an account for somebody else and sends the invitation.
  It holds the service key, the one key that bypasses every row-level security
  policy, so it can never run in a browser.
- **`notify`** sends a notification to a person's devices even when the app is
  shut, which needs a push signing key.
- **`places`** suggests meeting places as somebody types. It runs on the server
  so the member's internet address never reaches the search service, the
  browser's security policy can stay closed to every other site, and only a
  signed-in, approved member can ask.

Each checks who is asking before doing anything. Each one's file opens with the
reasons in full.

## House style, in the code

- **Comments say why, not what.** The code says what. A comment at the top of
  each file explains its reason to exist and, often, what went wrong before.
  Part VIII's file list is generated from those comments.
- **Checks are named as the sentence they hold true**, such as
  `tests/a-case-is-reachable-by-whoever-is-in-it.mjs`. A failing check reads as
  the promise that broke.
- **No new dependency without a strong reason.** A few dozen lines of our own,
  with a check, usually beats a package and everything it brings.
- **Plain words on the screen.** A button says what happens; an error says what
  to do next.
