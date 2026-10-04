# Notices

Third-party code and content in Open Sentry Beacon, and the terms it is used
under. Open Sentry Beacon itself is licensed under AGPL-3.0-only; see
[LICENSE](LICENSE).

**The complete list ships with the app.** Every open-source package the app is
built from, with its licence text, is written at each build by
`scripts/third-party-notices.mjs` and linked from Settings → General as "Code
from other projects". The drawing board's fonts carry theirs beside them, in
`/excalidraw/fonts/LICENSES.txt`. `tests/dependency-licences.mjs` fails the
build if a dependency arrives under a licence nobody here has read.

---

## Open Morbital — playlists and the queue player

**Upstream:** <https://github.com/Klydo131/open_morbital_official>
**Upstream licence:** GNU AGPL-3.0-or-later
**Used here under:** GNU AGPL-3.0, as part of this AGPL-3.0 work. The copyright
holder has additionally granted this project the right to use this material
under the MIT License. That grant is specific to this project and confers no
rights on third-party forks of Open Morbital.

`lib/playlists.ts` and `components/Playlists.tsx` are derived from Open
Morbital, a local-first music player by the same author as this project.

**What was actually taken.** The data model — a named, ordered list of track
ids, with shuffle and repeat over a queue — and the behaviour. The code is
written against this app's own storage rather than copied: Open Morbital is
Vite with zustand and Dexie, and this is Next.js reading the IndexedDB store
that already lives in `lib/localMedia.ts`.

---

## pitchy and fft.js — the Music room's tuner

**Upstream:** <https://github.com/ianprime0509/pitchy> (pitchy 4.1.0) and
<https://github.com/indutny/fft.js> (fft.js 4.0.4, which pitchy uses)
**Licence:** MIT, both

`lib/music/tuner.ts` finds the pitch of what the microphone hears with pitchy,
which implements the McLeod pitch method (McLeod and Wyvill, "A smarter way to
find pitch", 2005). Used as published, pinned to an exact version and locked by
hash; neither package runs anything when it is installed. Everything else in
the Music room (the score reader, the zip reader, the page scanner, the
metronome) is written for this project; `docs/MUSIC-RESEARCH.md` says what was
looked at and why it was not used.

---

## Fonts

The app itself loads no web fonts: it uses each device's own system fonts.

The drawing board (Excalidraw) draws with its own fonts, which are copied out
of the `@excalidraw/excalidraw` package and served by the app
(`scripts/excalidraw-assets.mjs`): Excalifont, Virgil, Assistant, Nunito and
Lilita One under the SIL Open Font License 1.1, Cascadia Code under Microsoft's
licence based on it, and Comic Shanns under MIT. Each one's copyright and
licence, read out of the font files themselves, is in
`/excalidraw/fonts/LICENSES.txt`.

Two are not served. Xiaolai, for its size. And Liberation Sans 1.05, whose
licence is Red Hat's agreement for the 1.x Liberation fonts (GPL-2.0 with a
font exception), not the Open Font License of later versions; the drawing
board's old "Helvetica" style uses the device's own sans-serif instead.

---

## BlockSuite — the study room's editor

`components/study/StudyRoomEditor.tsx` assembles BlockSuite's editor following
the BlockSuite project's own playground (MIT, <https://github.com/toeverything/blocksuite>).
Its theme package, `@toeverything/theme`, is under the Mozilla Public License
2.0; it is used unmodified, and its source is at
<https://github.com/toeverything/design>.

---

## Everything else

The remaining dependencies are listed in `package.json`. Almost all are
permissive (MIT, ISC, Apache-2.0, BSD and a few others), which is compatible
with the AGPL-3.0 in this direction: a permissively licensed library can be
included in a copyleft work, and each keeps its own notice. Three are not
permissive, and each is accounted for:

- `@toeverything/theme`, MPL-2.0 (above).
- `dompurify` offers MPL-2.0 or Apache-2.0; it is used under Apache-2.0.
- `@img/sharp-libvips-*`, LGPL-3.0-or-later: the image library under Next.js's
  image optimiser. It runs on the server, is never sent to anybody's browser,
  and is linked dynamically as the LGPL asks.

`caniuse-lite` (CC-BY-4.0) is browser-support data read while building; it is
not part of the app.
