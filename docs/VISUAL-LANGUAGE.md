# The visual language

[`DESIGN.md`](./DESIGN.md) says how the app should behave. This says how it
should **look**, and where the pieces to build that look already exist.

The Study Room is the first screen built this way, on purpose: it is the one
room that takes the whole window, so it could change completely without a
single other screen moving. It is the reference implementation for the rest of
the app. When a room is redone, read `components/study/study-shell.css` first.

---

## The idea in one paragraph

Apple's apps are neutral surfaces with **one tint colour doing all the talking**
— Notes is yellow, Freeform is blue. Ours is **navy**. Everything else is warm
neutral: a ground, white grouped lists, hairlines instead of boxes, and the
system's own typeface. Navy appears only where something can be pressed or is
selected; gold appears only on a star and a tag. Nothing is bigger than it
needs to be, and nothing is smaller than an older person can read.

## Rules that do not bend for a look

These come from [`AGENTS.md`](../AGENTS.md) §6 and from real bugs. The Apple
vocabulary works inside them, not around them.

- **Type stays generous.** The root is 18px for older eyes. "Apple-looking" was
  never a reason to shrink anybody's reading. Body text in the room is 17–18px;
  nothing a person reads is below 13px, and nothing important below 15px.
- **Secondary text keeps AA.** Grey at 64% of the ink colour, which measures
  about 4.6:1 on white. There is no third, paler text colour, deliberately.
- **44px hit areas, at least.** A 36px capsule is drawn inside a 44px button;
  the difference is the breathing room between rows. See `.sr-chip`.
- **Icons are drawn, never typed.** `components/Glyph.tsx`, one 24-unit box and
  one 2-unit stroke for every icon, so they read as a family. `★ ☆ ← × ☐ ❝ ▦ ◆`
  and emoji-as-icons are exactly what this replaced in the Study Room.
- **The system font.** `system-ui` is SF Pro on an iPhone or a Mac, Segoe on
  Windows, Roboto on Android. No web font, nothing to download, nothing for the
  CSP to allow. The editor is pointed at the same stack.
- **`dvh`, safe areas, and nothing that scrolls sideways**, as everywhere else.

## Tokens

Scoped to `.sr` today (the Study Room's root). Promoting them to `:root` in
`app/globals.css` is the first step of an app-wide overhaul.

| Token | Value | Use |
|---|---|---|
| `--sr-bg` | `#f6f4f0` | The ground. A warm neutral, a whisper of the old parchment. |
| `--sr-surface` | `#ffffff` | Grouped lists, raised segments, chips. |
| `--sr-ink` | `#1a2233` | Text. The app's body ink, navy-leaning. |
| `--sr-ink-2` | ink at 64% | Secondary text: dates, previews, captions. |
| `--sr-sep` | ink at 12% | Hairlines, drawn at 0.5px. |
| `--sr-fill` / `--sr-fill-2` | ink at 6% / 10% | Quiet fills and hover. |
| `--sr-tint` | `#1e2a4a` | Navy. The only colour that means "press me". |
| `--sr-star` | `#b8860b` | A starred page. Deeper than brand gold so the shape clears 3:1. |
| `--sr-bar-h` | 52px + safe area | The top bar's height, used to offset everything under it. |

Type scale in the room: **34** large title · **30** page title · **22** sidebar
title · **18** row title · **17** controls and body · **15** meta and chips ·
**14** section heads and notes · **13** mini pills. Tracking tightens as size
grows (−0.022em at 34px), as SF does.

Radii: **14** grouped lists · **12** fields and segmented tracks · **10** bar
and tool buttons · **999** capsules.

## Components that exist now

All in `components/study/study-shell.css`.

| Class | What it is |
|---|---|
| `.sr-bar`, `.sr-bar-btn`, `.sr-bar-title` | Translucent top bar the page scrolls under; tint-text buttons with a chevron. |
| `.sr-title`, `.sr-subtitle` | Large title and its count line. |
| `.sr-seg` (+ `--inline`) | Segmented control: one track, one raised thumb. Places on a phone; Page / Whiteboard. |
| `.sr-search` | Filled search field with a magnifier. |
| `.sr-chip` + `.sr-chip-face`, `.sr-chip-pair` | Capsule filters; the pair holds two controls (look through / forget). |
| `.sr-group`, `.sr-group-head` | Inset grouped list with hairlines inset to the text, and its heading. |
| `.sr-row-title`, `.sr-row-meta`, `.sr-icon-btn`, `.sr-mini` | A list row, its meta line, trailing icon buttons, and small pills. |
| `.sr-action`, `.sr-action-icon` | A row that does something rather than opens something. |
| `.sr-side`, `.sr-side-item` | iPad-style sidebar, selected item filled with the tint. |
| `.sr-note` (+ `--trouble`) | Quiet notice; the trouble variant for "not saved". |
| `.sr-page-title`, `.sr-field`, `.sr-formatbar`, `.sr-tool`, `.sr-kbd` | A page's wrapping title, pill fields, the sticky insert bar and its tools. |

## Traps this found, so the overhaul does not find them again

- **The editor's stylesheets leak into the document.** BlockSuite components
  written for a shadow root put bare rules in the page: `input { flex: 1 }` and
  `.truncate { align-self: stretch }`. The second collides with Tailwind's
  utility of the same name and, because the editor's styles stay after
  somebody leaves `/study`, it reached the app's own navigation labels. Both are
  put right in `components/study/study-room.css`, and
  `tests/e2e/the-editor-stylesheet-stays-in-the-editor.js` sweeps for both. Any
  new generic class name (`.truncate`, `.hidden`, `.row`) is at risk of the same.
- **A custom class that sets `display` beats Tailwind's responsive `hidden`**,
  because this room's stylesheet loads after Tailwind's. Wrap the element, or
  do not set `display` in the class.
- **A `display: none` grid item leaves the grid**, and the next item slides
  into its column. The first top bar was a three-column grid; on a phone, with
  the title hidden, "All pages" landed in the middle.
- **A sticky element only sticks inside its parent.** Wrapped in a div as tall
  as itself, it goes nowhere.
- **Sticky offsets inside a padded scroll box** depend on how an engine treats
  that padding. The room uses a spacer instead of padding so the insert bar's
  offset is simply the bar's height, whatever the engine.
- **A bar pinned to the bottom of an iPhone is under the keyboard** exactly
  while somebody types, because the keyboard slides over the page without
  moving it. Riding above it needs the visual viewport, and a phone keyboard
  cannot be opened in the headless browser this app is tested in. That is why
  the insert bar is at the top.
- **Headless Chromium does not draw `backdrop-filter`** in screenshots, so the
  bars are more opaque than Apple's (88% and 92%): readable blurred or not.

## Where the app stands, measured on 23 September 2026

Counted across `app/` and `components/`, to say where an overhaul starts:

- 24 screens, 139 component files.
- **51 distinct colours** written as hex literals, 172 times. The tokens above
  are the replacement.
- An elevation scale (`.lift-1/2/3` in `globals.css`) used 12 times, against 45
  hand-rolled `ring-1 ring-black/5` cards.
- `rounded-xl` 494 times, `rounded-2xl` 82, `rounded-lg` 57 — three radii doing
  one job.
- `text-sm` 874 times, `text-xs` 297.
- **20 emoji used as icons** outside the Study Room.
- **No dark mode anywhere**: no `dark:` class, no `prefers-color-scheme` rule.

## Decisions to make before the rest of the app follows

These are the owner's to make, not a developer's, and each changes a lot of
screens at once:

1. **56px or 44px.** `globals.css` gives every button a 56px floor, and
   `AGENTS.md` describes 44px as the exception for the most damaging controls.
   Apple's minimum is 44, and the Study Room uses 44 for secondary controls
   (chips, bar buttons, row icons). Keep 56 as the app's floor with 44 as a
   named exception, or adopt 44 as the floor everywhere?
2. **Dark mode.** Explorers can already choose a dark room theme (Chapel,
   Lamplight) in `lib/room-theme.ts`, and the Study Room ignores it. System
   dark mode, the room themes, or both — and in one pass for the whole app, so
   no room is the only dark one.
3. **The editor's own colours.** Bullets, checkboxes and links inside a page
   are AFFiNE's blue. Tinting them navy means overriding its palette variables,
   which may also change colours a person picked for their own text. Worth
   testing before deciding.
4. **The insert bar above the keyboard.** Doable with the visual viewport, and
   only checkable on a real iPhone.

## Not verified here

Everything above was seen in headless Chromium at 360, 390, 412, 768, 1024,
1280 and 1440px. **Not** seen: Safari or any iPhone (no WebKit in this sandbox;
`safari.yml` runs the walks on WebKit after a push), the signed-in live room
(the sample Explorer shares every component, but not the database behind it),
and the blur of the translucent bars.
