# The Music room: what was looked at, and what was built

Asked for on 4 October 2026:

> Can we create another room for music for music lovers and choir, Put the main
> Audio tools to it, take out the audio tools from the library ... I want a
> tuner, a piece scanner, and beat maker (where you can track the beat like a
> conductor). Research all of this, make sure to see open source to use if
> possible and make your own in Hope Beacon, make sure the features are Stable
> to use too, less bugs, organized, easy to understand for developers, and it's
> safe and not exploitable.

This file records what open-source work was considered for each tool, what was
used, what was written here instead, and why. It is for the next developer, so
they know which doors were already tried.

## The rules every choice had to meet

These come from the app as it already was, not from the Music room:

- **The security policy stays as it is.** `next.config.mjs` allows scripts only
  from this site and does not allow WebAssembly to be compiled
  (`wasm-unsafe-eval`) or code to be evaluated (`unsafe-eval`). Anything that
  needs either is out unless the owner decides the policy should change.
- **The camera stays off.** `Permissions-Policy` says `camera=()`. The
  microphone is allowed for this site only (`microphone=(self)`), which the
  voice messages already needed.
- **Nothing is sent anywhere.** The room never talks to the church's database or
  any other server. Everything is worked out on the phone.
- **Every dependency is pinned, MIT or similar, runs nothing on install, and is
  locked by hash.** `tests/dependency-licences.mjs` and
  `tests/the-music-room.mjs` hold this.

## What was used

| Tool | Open-source used | Licence | Why |
|---|---|---|---|
| Tuner, finding the pitch | **pitchy 4.1.0** (with fft.js 4.0.4) | MIT | Implements the McLeod pitch method, which is accurate on a held voice and fast enough for every frame. Small, plain JavaScript, no WebAssembly, no install script. |
| Opening a music PDF (6 October 2026) | **pdf.js 6.4.299** (`pdfjs-dist`, Mozilla) | Apache-2.0 | The PDF reader inside Firefox. It reads the file in a worker and hands back every character and line it draws; nothing else does that safely in a browser. No WebAssembly once told so, no code built from strings in version 6, no install script. Downloaded only by somebody who opens a PDF (see below). |

pdf.js lists one optional package, `@napi-rs/canvas` (MIT, about 34 MB, no
install script), which it loads only when it runs under Node. npm installs it
on developers' machines and in CI; it is never part of the app a phone
downloads. Everything else below was written for this project, in
`lib/music/`, with no dependencies.

## What was considered and not used

"Measured here" means it was installed or read in this repository on
4 October 2026. "From its documentation" means it was not installed, and the
reason comes from what the project says about itself.

| For | Project | Licence | Why not | Measured here? |
|---|---|---|---|---|
| Showing a score | OpenSheetMusicDisplay | BSD-3 | Installing it brought 82 packages, including an optional one (`gl`) with a native install script; about 1.3 MB of code; and code paths that use `eval`/`new Function`, which the security policy forbids. | Measured here |
| Showing a score | Verovio | LGPL-3.0 | C++ compiled to WebAssembly, so it needs `wasm-unsafe-eval` in the security policy. | From its documentation |
| Showing a score | VexFlow | MIT | Draws notation, but does not read MusicXML on its own; reading and laying out a score on top of it is the large part of the work. | From its documentation |
| Pitch | aubio | GPL-3.0 | A C library; in a browser it means WebAssembly. | From its documentation |
| Pitch | CREPE (and ml5.js's pitch detection) | MIT | A trained model that has to be downloaded and run, which is far more than a tuner needs and is a network fetch the room otherwise never makes. | From its documentation |
| Metronome | Tone.js | MIT | A whole audio framework for one job the browser's own audio clock already does well. | From its documentation |
| Page scanner | jscanify | MIT | Built on OpenCV.js, which is WebAssembly of several megabytes. | From its documentation |
| Notes from a photo (OMR) | Audiveris | AGPL-3.0 | A Java desktop and server program; it cannot run on a phone, so a photo would have to be sent to a server. | From its documentation |
| Notes from a photo (OMR) | oemer | MIT | A Python deep-learning program; the same problem as Audiveris. | From its documentation |
| Notes from a PDF | Audiveris on a server, or a hosted reading service | AGPL-3.0 / paid | The PDF would leave the phone. Offered to the owner on 6 October 2026 with reading on the phone; the owner chose the phone. | From their documentation |

## What was written here, and how it stays safe

| File | What it does | What keeps it safe |
|---|---|---|
| `lib/music/notes.ts` | Frequency to note name and cents, concert pitch 400–480 Hz | Pure arithmetic; refuses anything that is not a real frequency |
| `lib/music/tuner.ts` | Opens the microphone, measures, smooths, lets go | Asks only after Start; sound only, no video; never connected to the speaker or recorded; every track stopped on Stop, on leaving, and when the phone locks or switches app |
| `lib/music/beat.ts` | Tempo, tap tempo, the baton patterns for 2, 3, 4 and 6 | Pure arithmetic; tempo clamped to 30–240 |
| `lib/music/audio.ts`, `metronome.ts` | Clicks scheduled on the audio clock ("A tale of two clocks", web.dev) | Audio opened on a tap, closed on Stop; silent when the page is hidden |
| `lib/music/musicxml.ts`, `score-file.ts` | Reads a MusicXML score into parts and notes | Refuses any file that declares its own entities (the "billion laughs" attack); limits on elements, notes, parts and length; the browser's own XML parser, which fetches nothing; names and lyrics shown as text, never as markup |
| `lib/music/zip.ts` | Opens a compressed score (.mxl) | At most 200 entries; encrypted and Zip64 refused; stops inflating the moment output passes the size the entry declared or 12 MB, whatever the archive claims (zip bombs) |
| `lib/music/page-scan.ts`, `components/music/PageScanner.tsx` | Straightens a photo of a page and makes it black on white | The photo picker, not the camera; the photo is shrunk, used and dropped; only the clean page is kept, drawn fresh from pixels, so nothing the camera wrote into the photo survives; a picture claiming more than 220 million pixels is refused |
| `lib/music/pieces.ts` | Keeps pages and scores on the phone (IndexedDB `beacon-music`) | Apart from My Files; 12 MB a piece, 500 pieces; a kept score is checked again every time it is opened |
| `lib/music/score-player.ts` | Plays the parts, one louder, one silent, any tempo | Same audio clock as the metronome; silent when the page is hidden |
| `lib/music/pdf-ink.ts` | A PDF's music characters, words, lines and shapes, with where each sits | pdf.js in its worker, under the site's security policy; no WebAssembly; no fonts put into the page; nothing fetched; 12 MB, 60 pages and 60,000 marks a page at most; a password or a broken file is refused in words |
| `lib/music/pdf-score.ts` | From that ink to parts and notes, rhythm, ties, words, loud and soft, tempo | Pure geometry on numbers; limits on notes and marks; words shown as text, never markup |
| `lib/music/pdf-read.ts` | Loads pdf.js only when a PDF is opened | Its worker is a file of this site; a failed download can be tried again |

## Fast and light, by the owner's rule

"I dont want the app to be bloated, I want the app to be fast and stable"
(4 October 2026). So:

- **Opening Music costs what opening any room costs.** Only the Listen folder
  is in the page. The Tuner (and pitchy with it), the Conductor and Pieces (the
  score and zip readers and the scanner) are fetched once the room has opened,
  while the phone is idle, and kept by the service worker, so every folder
  still opens with no signal. `/music` itself is kept for offline use with the
  other rooms.
- **Nothing in the room is in any other page.** My Files lost the player and the
  playlists, and nothing of the Music room was added to the shared code every
  page loads.
- **The tuner works out the pitch about thirty times a second** rather than on
  every screen frame, and tells the screen at most twenty times a second.
- **The scanner reads the photo as grey once** and makes no array per pixel:
  straightening a 2000 by 1500 photo went from 119 ms to 83 ms on the machine
  that measured it (a phone is slower; the order is the same).
- **A score of thousands of notes is drawn once.** Play, the playhead and the
  start beat do not redraw a single note; only choosing your part or a line's
  volume does. The playhead moves without React at all.

`tests/the-music-room.mjs` runs the arithmetic, reads a test piece written for
the purpose (`tests/fixtures/music/four-parts.musicxml`, CC0), throws hostile
scores and archives at the readers, and reads the code for the promises in the
table above. `tests/e2e/the-music-room.js` walks the room in a browser, with a
440 Hz tone played into a fake microphone on Chromium.

## Reading music PDFs (6 October 2026)

Asked for on 6 October 2026: Pieces should "scan the pieces (specially PDF)"
so that "it accurately detects the notes, speed of the notes, speed of the
piece, what the pieces conveys ... the choir singers and conductors understand
how the piece works already". The owner was told plainly that no reader of
printed music is perfect, and chose **Read music PDFs on phone**.

**How it reads.** A PDF that a notation program exports (MuseScore, Dorico and
others that use a SMuFL music font) is not a picture. Every notehead, clef,
rest and sharp is a character of the music font at an exact place, and every
staff line, stem, barline and beam is drawn as a line or a filled shape.
`lib/music/pdf-ink.ts` asks pdf.js for exactly those; `lib/music/pdf-score.ts`
finds the staves and systems, reads each staff against its own lines, clef and
key, joins chords by their stems, counts beams and flags, dots and ties, splits
two voices on one staff by their stems, lines the bars up across the system,
and puts the words under the notes they sit under. The result is the same kind
of score a MusicXML file gives, so it plays, is explained, and can be
conducted like one.

**How well, measured.** Bach's four-part chorales from the music21 corpus
(their MusicXML is the known answer) were engraved with MuseScore 3.2.3 and
read back. The corpus is kept out of this repository because of its terms;
the measurement was made, not shipped.

Exactly right means the right pitch, at the right time, for the right length.

| Set | First full reading | Now |
|---|---|---|
| 60 chorales the reader was built on | about 10% (an early version) | 100% (60 of 60 pieces) |
| 80 more, used next | 93.95% | 99.72% (79 of 80; the last one's PDF itself is missing notes that MuseScore did not print) |
| 80 kept back, read once to measure | **99.78% of 19,381 notes; 78 of 80 pieces perfect** | 100%, after giving each staff its own key signature |

The line that counts is the last: notes the reader had never seen, before any
change was made for them. In the app's checks, `tests/fixtures/music/` holds
two pieces written for the purpose (CC0) with their MuseScore PDFs, and each
PDF must read exactly as its MusicXML does.

**What it does not read, and says so.** A scan or a photo saved as a PDF has
no music characters, and is told so. The fonts of programs that do not use
SMuFL (older Sibelius and Finale) are not known yet. Tuplets, repeats (it plays
straight through, as the MusicXML reader does), lyrics beyond the first verse
and notes that cross between staves are not read. Grace notes are left out on
purpose: they take no time of their own. Every PDF score says it was read from
the print and should be checked against the page, and says how many bars did
not add up, if any.

**What it costs.** Nothing for anybody who never opens a PDF. Opening one
downloads the reader (9 KB compressed), pdf.js (148 KB) and its worker
(379 KB), once; the service worker keeps them for offline use after that. The
PDF itself is kept on the phone as it is, and read again each time it opens,
so a better reader later improves every kept piece.

## What is not done, and why

- **The score is shown as notes on a strip, not as printed music.** Printed
  notation needs one of the engraving projects above, and each failed the rules
  at the top. The strip shows what a singer learning a part needs: where the
  line goes up and down, how long each note is, and where the music has got to.
  The printed page is what the scanner is for.
- **Turning a photo, or a scanned PDF, into notes that play** (optical music
  recognition) is not built. Every working approach either sends the picture
  to a server (Audiveris, oemer) or runs a model on the phone that needs the
  security policy to allow WebAssembly. The owner decided on 4 October 2026 to
  leave it out: scanned pages stay pictures to read. On 6 October 2026 the
  owner chose the narrower thing that can be done on the phone: PDFs exported
  by notation programs are read note by note (above).
- **Safari's microphone** has not been tested with a real voice. The browser
  walks can feed a tone into Chromium's microphone; WebKit offers no such thing,
  so on Safari the walk checks only that Start either listens or says why it
  cannot.
