# Chat research, 1 October 2026

The first run of the three research agents ([docs/agents/README.md](agents/README.md)),
made for the redesigned chat: replies, reactions and voice messages, one shared
conversation view for both halves of the app (`components/talk/`).

The owner's brief: *"Search for open source chats that we can use to improve it
… in design and also security. Security will always be the number one priority
… Make sure we don't have any issues with our open source project when it comes
to other companies."*

This page records what the agents found, what was done about it, and what is
left. Nothing here identifies a real member; every example is the sample
church's invented people.

## How it was done, and what could not be reached

- **Read-only.** The agents read this repository and public sources and wrote
  reports. Every change below was made afterwards, by hand, tested, and shown
  to the owner before it was pushed.
- **Not seen running.** Other projects were studied through their source, help
  pages and shipped strings, not by using them. Contrast figures are computed
  from the colours in the code; nothing was measured on a screen.
- **Blocked.** The GitHub API, Codeberg, F-Droid, zulip.com, supabase.com and
  two security blogs were refused by this environment's network policy. Raw
  files on GitHub were reachable and were used instead. Conversations (on
  Codeberg) was read only through two GitHub forks.

## What other open-source chats do, and what we may borrow

**Ideas are free; code has a licence.** This project is AGPL-3.0-only. Nothing
below was copied: every pattern was rebuilt here. The licence column says what
*could* be copied if it ever were.

| Project | Licence | Could we copy code? | Learned from it |
|---|---|---|---|
| Element Web | AGPL-3.0-only or GPL-3.0-only, or commercial | Yes, under the AGPL option | A "new messages" line; "unsent" with Resend; text size; Report in the message menu |
| FluffyChat | AGPL-3.0-or-later | Yes | "Try to send again"; offline wording; double-tap-to-react kept optional |
| Rocket.Chat | MIT, **except `ee/` folders (enterprise): never copy** | MIT parts only | Text size and a high-contrast theme |
| Mattermost | `webapp/` Apache-2.0; server AGPL; **`server/enterprise/` source-available: never copy** | `webapp/` only | "Retry" under a failed message; "N new messages" |
| Zulip | Apache-2.0 | Yes | Retry and Dismiss on a failed message; ↑ to edit, R to reply |
| Signal | AGPL-3.0-only | Compatible, but **never its name, icons, colours or look** | Message text size; voice playback speed; one-time gesture tips; `dir="auto"` |
| Conversations | GPL-3.0 | Ideas only | One switch for large text in bubbles |
| Delta Chat | GPL-3.0-or-later | Yes | Focus moves to a quoted message when its quote is tapped; reactions not announced on open |
| Tinode web | Apache-2.0 | Yes, but not its icons | "Reconnecting… Try now" |
| Chatwoot | MIT, **except `enterprise/`: never copy** | MIT parts only | "Send message again" on the failed bubble |
| chatscope chat-ui-kit-react | MIT | Yes | A slot for a warm empty conversation |
| Stream Chat React | **Proprietary** | **No** | Not used |

## What was adopted

Built in this change:

- **Reply, react and speak**, the three the owner chose. Swipe or hold to reply;
  six reactions with 🙏 first; tap to record, then Cancel or Send, never
  hold-to-talk (kinder to an older hand than Signal's or FluffyChat's
  press-and-hold).
- **Chat text follows Settings → General → Text size.** Every size in the chat is in rem
  now; it was in pixels, so the setting never reached the messages.
- **Readable small print.** The time, "Seen", file sizes and the quoted name
  rose to 13px at normal size and to WCAG AA contrast (the time was 11px at
  about 4:1; the empty-conversation line was 2.4:1; the quoted name 3.4:1).
- **44px to tap** for ⋯, the reaction pill and the voice message's position bar.
- **Tapping a quote moves the focus** to the message it quotes (Delta Chat).
- **Each message sets its own direction** (`dir="auto"`), so a message in Arabic
  reads right to left inside an English page.
- **The newest thousand messages.** The conversation asked for the oldest
  first, and the API returns at most a thousand rows, so a long conversation
  would have stopped showing anything new. Found in passing by the design
  research.

`tests/the-thread-reads-like-a-conversation.mjs` holds the sizes, contrast and
targets.

## What was refused, and why

- **Typing indicators and online status.** A product rule: nobody should feel
  watched, or watched for a reply.
- **Link previews.** Fetching a link to preview it tells that site who is
  talking and when.
- **Visible edit history.** Earlier wording is kept for safeguarding, where
  only leadership handling a report can read it, not shown to everybody.
- **Double-tap to react.** A tremor turns it into accidents.
- **Saving unsent drafts on the device.** Many older members share a tablet.
- **Anything from Stream, or from the enterprise folders above**, and any other
  company's name, logo, icons or colours.

## What is next

Each has been traced to the code it would change; none needs a new service.

| Idea | From | Size |
|---|---|---|
| A "New messages" line on opening, at the first unread | Element, Signal, Mattermost | Medium |
| "Sending…" and "Not sent — Try again" on the bubble itself | Zulip, Signal, Chatwoot | Medium; needs a client-made id so a retry cannot send twice |
| "You're offline; your message will wait here" inside the chat | Tinode, FluffyChat | Small |
| One announcement per new message for screen readers, instead of the whole thread | Signal Desktop, Delta Chat | Small to medium; must be tried on VoiceOver and TalkBack |
| One-time tips for hold and swipe | Signal | Small |
| Voice playback speed, and listening back before sending | Signal | Small / medium |
| Pinch to zoom a photo | Delta Chat, via `react-zoom-pan-pinch` (MIT) | Small to medium |
| Right-to-left layout: tails, time, quote bar and swipe mirrored | Signal, Element | Small to medium |
| A warmer empty conversation, per role | chatscope | Small |
| ↑ in an empty box edits your last message | Signal Desktop, Zulip | Small |

## Security: what was found, and what was done

The security reviewer was told security comes before everything else. Each
finding below was fixed, tested with the fix broken on purpose, or put to the
owner.

| Finding | Severity | Done |
|---|---|---|
| A file's storage path was written by the sender and used to build a request in the recipient's browser, with the recipient's sign-in; `../../auth/v1/logout` would have signed them out of every device whenever they opened the chat | High | **Fixed.** The database accepts only `<conversation>/<uuid>`; the browser refuses any unsafe path before it signs one, for every bucket (`lib/live/storage-path.ts`); a browser can no longer write a file's id or time |
| A photo, file or voice message can be removed without trace; nothing is kept for safeguarding | High | **For the owner** (below) |
| Taking a reaction back was a delete, which the realtime feed sends to every signed-in user in every church; and the migration's comment said the opposite | Medium | **Fixed.** Taking back is an update, which reaches only the two people; the comment now says what the feed does |
| No limit on how fast reactions or files could be sent | Medium | **Fixed.** Thirty reaction changes and ten files a minute; a daily size cap is for the owner |
| A small PNG or WebP kept its location data; HEIC is sent as it is | Medium | **PNG and WebP fixed** at the byte level, checked by decoding in Chromium; HEIC is for the owner |
| `react_to` said "taken back" before asking whose the message was | Low | **Fixed**: one answer for "not yours" and "no such message" |
| Cancel, or leaving, during the microphone prompt still started recording | Low | **Fixed** |
| File titles could hide a reversed name (`photo&lt;U+202E&gt;gnp.js` style) and run on | Low | **Fixed**: refused by the database, cleaned before drawing, 200 characters |
| A link to a look-alike address in another alphabet showed as the real name | Low | **Fixed**: such a host is shown as the address the browser will open |
| An ended pairing can still be written to; message text on the lock screen; a nonce-based Content-Security-Policy | Low | **For the owner** / later |

Also found while fixing these: the first draft of the title cleaner put the
invisible characters themselves into the source code, where nobody reading it
could see them. `tests/no-hidden-characters.mjs` now refuses such characters
anywhere in the repository ("Trojan Source", CVE-2021-42574).

Checked and holding: no way to inject HTML into the chat; the image viewer's
Save link cannot run script; replies and reactions cannot cross into another
conversation; `react_to` runs with a fixed search path and no dynamic SQL; the
microphone is allowed for this site only.

## Licences: what was found, and what was done

No dependency is under a licence that conflicts with AGPL-3.0-only. The gaps
were in the paperwork, and each is closed:

- **No third-party notice shipped with the app.** Now written at every build
  (`scripts/third-party-notices.mjs`) and linked from Settings → General as "Code
  from other projects". `tests/dependency-licences.mjs` fails the build if a
  dependency arrives under a licence nobody has read.
- **The drawing board's fonts were served without their licences**, and one,
  Liberation Sans 1.05, is under Red Hat's GPL-2.0-based terms. Liberation is
  no longer served; the rest carry `LICENSES.txt`, read out of the font files.
- **NOTICES.md named fonts the app does not use** and left out the ones it does,
  and an MPL-2.0 package. Corrected.
- **Four Bible verses were NIV, NKJV or ESV wording** without credit. All seven
  are now the King James Version, checked against a KJV text, and say so.
- **The source-code address was in two places.** Now one: `SOURCE_URL` in
  `lib/brand.ts`.
- **The privacy notice did not say that playing a YouTube or Facebook video
  loads that company's player.** It does now.
- **Every copy of the app gave the place search the same name.** A church can
  now set its own (`PLACES_USER_AGENT`), or its own Photon server.
- **Smaller notes:** Vercel's free tier is non-commercial (now said in
  START-HERE); the Code of Conduct's CC BY 4.0 licence is linked.

## For the owner to decide

1. **Removed files and voice messages.** Keep them for a while where only
   leadership handling a report can open them, and show "a photo was removed"
   in the thread, as a taken-back message already does?
2. **A daily size cap per conversation** for files and voice messages, and what
   size.
3. **HEIC photos** keep their location on a computer. Convert them, or refuse
   one that cannot be converted?
4. **Ended pairings.** Should they become read-only?
5. **Lock-screen previews.** Offer "name only", and make it the default for
   Explorers?
6. **A copyright line** for the project in the README and NOTICES.
7. **The sample church's name**, "Grace SDA Church", carries the denomination's
   registered name; a fork could read as an official product. Rename it to an
   invented church?
8. **"Sentry"** is a well-known software brand. A trademark search (USPTO and
   IPOPHL) is cheap. No search was run.
9. **AI-written code and copyright** is a question for a lawyer: it may affect
   how strongly the AGPL can be enforced.

## Not verified

- Safari and iOS (no WebKit here), a real phone, and the signed-in live app.
- Screen readers: the focus change and text direction were not tried with one.
- The database rules were tested on a local PostgreSQL 16 built from every
  migration, not on the live database.
