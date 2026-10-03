# Beacon, Study and Focus

Maintainer handoff for the three optional looks added beside Classic.
Choose them in **Settings → General → Look**. The choice belongs to the device;
it does not change an account or a church setting.

- **Beacon** uses a bright sky, blue accents and two-column room cards.
- **Study** uses warm paper, brown accents and compact room rows on phones.
- **Focus** uses a night sky, dark panels and pale blue accents.

All three use the same authorized room groups as Classic. Desktop widths
(1280px and up) show a left rail, including Menu, People and My Files. Phones
and tablets keep the bottom tabs and the existing desk drawer. The right desk
continues to show its real local tools; no simulated activity, appointments,
search or progress widgets were added to reproduce the reference pictures.

## Preserve Classic

`lib/ui-themes.ts` registers the looks. `app/themes/<id>.css` owns each look's
styles, and every selector starts with that look's root attribute. Styles are
screen-only; printed pages keep their existing design. Shared global styles,
Tailwind configuration and Classic's markup and classes are unchanged.

FreshMenu and FreshNav render nothing unless one of the three new looks is chosen. FreshNav adds main destinations inside the existing DesktopNav. The original MenuList rendering and Classic desktop layout remain in place.

The three decorative SVGs in `public/themes/` are original native artwork.
They have no external references, text, scripts, member details or new fonts.
Greeting text sits on an opaque panel beside the artwork. No dependency or
database change is needed.

If browser storage refuses writes, a choice remains in memory for the current
tab until reload. The component tree and the page colors use the same choice.

## Review and validation

Run `npm run verify`, then start the production build and run:

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
