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
| `lib/music/pitch-tracker.ts` | The tuner's ear: McLeod's curve from pitchy's autocorrelation, read to half the window; overtones, vibrato and octave slips handled (see How exact the tuner is) | Pure arithmetic on the samples it is handed; keeps no sound, only the last 130 ms of numbers |
| `lib/music/sing-the-note.ts`, `components/music/SingTheNote.tsx` | Sing the note: judges each note held, names what was sung, Perfect pitch | Judges the tuner's readings only; never judges while the app plays a note; remembers the chosen notes on the phone, nothing else |
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

## How exact the tuner is (14 October 2026)

Asked for with **Sing the note**: "MAKE SURE the tuner for voice is extremely
accurate with 1 to 1 on voice to notes", then "the accuracy of notes from voice
to notes needs to be 99% accurate and fast". So the tuner's ear was measured
before anything was built on it, and the measuring stays in the gate.

**On what.** Two things, because neither is enough alone.

- **Made-up voices** (`tests/e2e/_made-up-voice.js`), built the way a voice is
  built: a buzz rich in harmonics, shaped by the mouth into a vowel. Every note
  five voice parts sing (bass E2 to soprano C6, 121 notes) on five vowels, 605
  sung notes, each from a breath, each with a scoop into the note, a vibrato,
  jitter, shimmer, breath and a phone's thin low end, and then made harder:
  wider vibratos, a breathy voice in a noisy room, a room's echo, a phone that
  hears nothing below 250 Hz, a rough voice. They are not people, and nothing
  here says they are. Sopranos raise the mouth's first resonance onto high
  notes (Joliveau, Smith and Wolfe, *Nature* 427, 2004); the made-up soprano
  does too, and the case where she does not is measured on its own.
- **Real singing marked by people**: vocadito track 1 (Bittner and others,
  Spotify, 2021; CC BY 4.0), 33 seconds of one singer, with the pitch every
  5.8 ms and every note marked by trained musicians. It is in
  `tests/fixtures/voice/` with its credit. It came from the mirdata project's
  copy on GitHub because Zenodo and Hugging Face, where the rest of the open
  singing datasets live, could not be reached from where this was measured;
  one real voice is what could be had, and it is one voice.

**What was wrong, and is fixed** (`lib/music/pitch-tracker.ts`). Each was found
by measuring, not by reading the code:

1. **A loud overtone was read as the note.** On "ee" at the top of a tenor's,
   alto's or soprano's range, one harmonic sits on a resonance of the mouth and
   can be thirty times louder than the note. The tuner now takes a repeat that
   falls between the overtone's own, and is clearly better, as the note.
2. **A chance repeat far along the window was taken for the note.** pitchy looks
   at every delay up to the whole window; past half of it there is too little
   sound to compare, and a bass's note "repeated" six periods on. The tuner now
   reads McLeod's curve itself, from pitchy's own autocorrelation, and stops at
   half the window, as the paper does.
3. **A wide vibrato flipped the letter.** A swing of 60 cents either side
   crosses into the next note five or six times a second. A move of less than a
   semitone and a half now has to move the average of the last 130 ms as well.
4. **A wrong first reading stuck for the whole note.** The first reading of a
   note can land an octave out; every right reading after it was then thrown
   away as an "octave slip", for as long as the note lasted. Six readings in a
   row that agree now move it. This was in the tuner before today.

**The numbers.** Out of 36,300 readings for each condition (the middle second
of each of the 605 sung notes): how many named a wrong note, letter or octave,
and how many gave no reading at all, before 14 October and now:

| Made-up voices | Wrong note, before | Wrong note, now | No reading, before → now |
|---|---|---|---|
| An ordinary voice | 0 | 0 | 648 → 44 |
| A vibrato of 60 cents, 6.5 a second | 4,660 | 0 | 3,162 → 519 |
| A vibrato of 80 cents, 4.8 a second | 22,304 | 0 | 3,279 → 762 |
| A breathy voice in a noisy room | 0 | 0 | 665 → 82 |
| A room's echo | 0 | 0 | 546 → 75 |
| A phone that hears nothing below 250 Hz | 240, every one an octave out | 0 | 787 → 54 |
| A rough voice (each cycle 1.5% longer or shorter) | 16 | 6, none an octave out | 2,880 → 940 |
| A soprano's A♯5 on a closed "ee", the note itself weak, in a noisy room | 0 | 34, a fifth high, on that one note | 2,076 → 1,460 |

The last row is the one thing worse than before, and it is kept in view rather
than hidden: the old tuner went silent on that note, and this one reads some
of it a fifth high. No soprano sings it that way (above C5 the mouth opens onto
the note, and with it the made-up soprano reads 0 wrong), but a reading a fifth
out is worse than none.

| Real singing (vocadito 1), the held part of each note | Before | Now |
|---|---|---|
| Moments given a reading | 98.4% | 99.5% |
| Within 50 cents of the pitch people marked | 98.2% | 99.2% |
| Read an octave out | 0 | 0 |
| Notes named within 50 cents of the annotators' marks | 96.6% and 96.8% | 98.3% and 100% |
| How far behind the voice a reading is | 74 ms | 42 ms |

"Rounds to the same note as the label" is not in this table on purpose. This
singer sings about a quarter of a semitone off A 440, so many of the marked
notes sit on the line between two notes (one is 45.49, read as 45.50); naming
the nearest note there measures the ruler, not the ear.

**Sing the note's judge** (`lib/music/sing-the-note.ts`) waits for a note to be
held for 0.6 s and judges the middle of what was sung, leaving out the scoop.
Since 15 October 2026 it grades in three, as the owner asked ("detect if I hit
a perfect note or close enough"): **Perfect** within 10 cents, **Close** within
25, **Try again** beyond, or on another note, saying what was sung. On every
one of the 121 notes sung in tune: 121 Perfect, each within 0.67 s of the
voice starting. Sung 18 cents sharp or flat: every one Close, with the way to
go. Sung 40 cents sharp, a semitone off or an octave low: every one Try again,
named for what it was. In the browser, with a made-up voice holding C4 as
Chromium's microphone: C4 tapped is Perfect, and graded again after each
breath with no second tap; D4 tapped is "You sang C4 ↑"; at a concert pitch of
A = 445 the same C4 (20 cents flat of the app's C4) is Close, "A little flat".

**The start and the end of a note.** The table above scores the middle second
of each note. Scored over the whole of each note instead, from the first sound
to the last echo (605 notes a condition), the readings shown more than a
semitone and a half from the note sung: an ordinary voice 0, a breathy voice
in a noisy room 0, a soprano who does not open her mouth onto a high note 0;
a phone that hears nothing below 250 Hz 24 (the first tenth of a second of a
man's "oo" on D♯3, read an octave up until six readings agree; before 14
October it was 248, the whole of those notes); a room's echo 54, all after the
note had stopped, in the echo, up to two and a half semitones out.

**Kept true by** `tests/the-tuner-hears-the-note-sung.mjs` (in the gate, about
a minute and a half; it sings every vowel on every note for the two conditions
that went wrong on one vowel only, after its first version, which gave each
note one vowel, missed both) and `tests/e2e/a-sung-note-is-heard-as-itself.js`
(the browser, with every look measured for contrast).

**Your voice, redrawn** (`components/music/TunerAdvanced.tsx`, 14 October
2026). The owner's phone showed the old trail: every row from C2 to G4, 31 of
them in 176 pixels, the names printed over each other, and three lines falling
from E4 to near A2 and D2 ("not aesthetically pleasing... too small to see").
That phone runs the tuner on `main`, from before the fixes above, and what made
those far-low readings is not known: no made-up voice reproduces a reading an
octave and a half low with either tuner, at any point of a note, nor do the
held notes of vocadito. The drawing
no longer depends on it: the trail shows one octave, centred on the middle of
what was sung (a median, so a stray cannot drag it) and following the newest
note; every row is 25 pixels tall on a phone with its name in 14-pixel type;
each note sung is its own line, and a line shorter than an eighth of a second
is not drawn (`trailBand`, `trailLines` in `lib/music/notes.ts`, checked in
`tests/the-music-room.mjs`; the row height is checked in the browser walk).
Whether the new tuner makes such readings on the owner's phone is not yet
known: it has not been tried there.

**Not measured**: a real phone's microphone, Safari's audio (WebKit has no
pretend microphone to sing into), more than one real singer, children's
voices, and singing in a full room. The first check on a real iPhone is still
the owner's.

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
