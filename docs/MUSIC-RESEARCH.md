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

That is the only new package. Everything else below was written for this
project, in `lib/music/`, with no dependencies.

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

## What is not done, and why

- **The score is shown as notes on a strip, not as printed music.** Printed
  notation needs one of the engraving projects above, and each failed the rules
  at the top. The strip shows what a singer learning a part needs: where the
  line goes up and down, how long each note is, and where the music has got to.
  The printed page is what the scanner is for.
- **Turning a photo into notes that play (optical music recognition)** is not
  built. The owner asked for it. Every working approach either sends the photo
  to a server (Audiveris, oemer) or runs a model on the phone that needs the
  security policy to allow WebAssembly. That is a decision for the owner, not a
  default, and it is written up for them separately.
- **Safari's microphone** has not been tested with a real voice. The browser
  walks can feed a tone into Chromium's microphone; WebKit offers no such thing,
  so on Safari the walk checks only that Start either listens or says why it
  cannot.
