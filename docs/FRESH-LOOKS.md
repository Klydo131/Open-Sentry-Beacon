# Beacon, Study and Focus

Maintainer handoff for the three optional looks added beside Classic.
Choose them in **Settings → General → Look**. The choice belongs to the device;
it does not change an account or a church setting.

- **Beacon** uses a bright sky, blue accents and two-column room cards.
- **Study** uses warm paper, brown accents and compact room rows on phones.
- **Focus** uses a night sky, dark panels and pale blue accents.

All three use the same authorized room groups as Classic. Desktop widths
(1280px and up) show Classic's left rail of rooms; Menu, People and My Files
are the bottom tabs of phones and tablets and are not repeated on a computer,
where every room, My Files included, is already in the rail (asked for on
4 October 2026). Phones and tablets keep the bottom tabs and the existing desk
drawer. The right desk
continues to show its real local tools; no simulated activity, appointments,
search or progress widgets were added to reproduce the reference pictures.

## Frutiger Aero, a family of five

Asked for on 4 October 2026 with four design sheets. Settings lists the family
as one row (`UI_FAMILIES` in `lib/ui-themes.ts`) that opens to show its looks,
each with its drawn picture (`public/themes/aero-*.svg`) and description:
Frutiger Eco, Dark Aero, Technozen, DORFic and Four Colors.

- `app/themes/aero.css` holds what the five share: the glass, the sheen, the
  gloss on buttons, the glows behind the page and the Menu's shape. Every rule
  starts with `:root[data-ui-theme^="aero-"]`.
- `app/themes/aero-<name>.css` holds each look's ten `--look-*` colours, its
  `--aero-*` settings (how solid the glass, how bright the sheen and gloss, the
  rim, shadow, roundness, icon tile and glows) and anything only it has: Dark
  Aero's light-on-dark notes and warnings, DORFic's and Four Colors' tiles.
- No `backdrop-filter` and no photographs: glass is a card a little
  see-through over drawn glows, so scrolling costs a phone nothing extra.
- `tests/themes-are-readable.mjs` measures each look's button labels on the
  brightest of their gloss and text on glass over every glow;
  `tests/e2e/frutiger-aero-looks.js` walks the row and all five looks.

The design sheets showed Menu, People and My Files at the top of the computer
sidebar; on the owner's word that stays on phones and tablets only. Their
"Continue", "Today", "Recent Activity" and search panels are not part of the
looks: those would be new features with real data behind them.

## Preserve Classic

`lib/ui-themes.ts` registers the looks. `app/themes/<id>.css` owns each look's
styles, and every selector starts with that look's root attribute. Styles are
screen-only; printed pages keep their existing design. Shared global styles,
Tailwind configuration and Classic's markup and classes are unchanged.

FreshMenu renders nothing unless one of the three new looks is chosen. The original MenuList rendering and Classic desktop layout remain in place.

The three decorative SVGs in `public/themes/` are original native artwork.
They have no external references, text, scripts, member details or new fonts.
Greeting text sits on an opaque panel beside the artwork. No dependency or
database change is needed.

If browser storage refuses writes, a choice remains in memory for the current
tab until reload. The component tree and the page colors use the same choice.

## Review and validation

Run `npm run verify:all` for the complete standard gate. To review these looks
on the second engine, start the production build, set `E2E_BROWSER=webkit`, and run:

```sh
node tests/e2e/fresh-looks.js 4414
node tests/e2e/the-classic-look-stays.js 4414
node tests/e2e/the-desktop-layout.js 4414
```

Repeat the fresh-look walk with `E2E_BROWSER=webkit` where that engine is
installed. Screenshots stay in ignored `.ui-check/looks`; they contain the
invented sample church only and are not public release assets.

The fresh-look walk covers phone, tablet and desktop layout, narrow widths,
the sidebar breakpoint, enlarged text, actual text contrast, authorized room
parity, chat/report readability, destructive controls, cross-tab updates,
blocked storage and restoring Classic. Primary-surface metadata also has a
small CSS fixture because the live safeguarding discussion cannot be opened
without a private signed-in account.

Before publishing, review the rendered screens and the diff. A browser engine
check is not a real-device Safari or keyboard test, and sample walks do not
prove live database permissions. Customer copy is in `lib/release-notes.ts`.

The Windows licence guard also recognizes exactly `@img/sharp-win32-x64`'s
existing Apache-2.0 AND LGPL-3.0-or-later server-side bundle. It still refuses
that licence combination for browser packages. This introduces no dependency
or native binary distribution.

WebKit verification also exposed a first-install worker claim being treated as
an update. ServiceWorker now records whether the page was controlled before
registration. Its installed callback can offer an update only to a previously
controlled page; the server version check remains independent. The executable
guard in `tests/a-first-install-stays-on-the-page.mjs` exercises both first-claim
event orders and a genuine controlled-page update. Its `--negative-control`
mode deliberately restores the race and must fail.

## The desk's colours under these looks (4 October 2026, Claude)

The colour squares on the desk now recolour Beacon, Study and Focus as well as
Classic. `lib/room-theme.ts` sets the look's own `--look-*` and `--top-bar-*`
variables on `<body>`, each at the brightness (relative luminance) of the
look's own value and in the palette's hue, so every colour a look paints for
itself keeps its contrast whatever palette is on. The first square is the
look's own colours. Two things this asks of a look:

- Name all ten `--look-*` colours in the look's `:root[data-ui-theme]` block
  as `#rrggbb`. `tests/room-colours-keep-the-look-light.mjs` checks it.
- Paint from the `--look-*` variables rather than fixed colours wherever the
  page, cards or desk are drawn. Each look now also gives `.desk-drawer` (the
  desk on a phone) its page colour; before, it stayed Classic's grey.

Settings' buttons and the "Which Beacon is this" box used inline white
backgrounds with class-coloured text, which read at 1.1:1 under Focus; they now
use `bg-white` and `bg-gray-50`, and `tests/text-and-ground-change-together.mjs`
refuses the pattern.

## Texture and small details

The optional looks show their local landscape previews above the Look choices.
Beacon uses a daylight halo and water reflections, Study uses a small paper
pattern and window light, and Focus uses moonlight and a night reflection.
These are original native SVG shapes and gradients, with no raster downloads,
filters, animation, dependencies or external assets. The greeting and room text
remain on solid surfaces, including when a desk palette recolours them.

The Home masthead follows each look's header colour. Its secondary text stays
opaque white so it clears normal-text contrast. Focus's waiting-prayer label
uses a lighter violet on both the sample and live Guide screens. The added
data attributes draw nothing themselves; Classic's component classes and Look
choices are unchanged. The fresh-looks browser walk checks the actual Guide
prayer label, Home banner text, local previews and Classic restoration.
