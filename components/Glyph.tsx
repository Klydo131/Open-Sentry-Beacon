// The icons a person has to press, drawn rather than typed.
//
// THE BUG, circled in a screenshot on an Android phone: the sign-out button in
// the header was an empty box. Not a wrong icon, not a missing image, a tofu
// box, which is what a font draws when it has no glyph for a character.
//
// The character was `⏻`, U+23FB POWER SYMBOL. It lives in the Miscellaneous
// Technical block, and that is the whole problem: it LOOKS like an emoji and is
// not one. Emoji get a guaranteed fallback, because every phone ships a colour
// emoji font covering the whole emoji set. A symbol from Miscellaneous
// Technical gets no such promise: it is drawn only if the text font happens to
// include it. Apple's system font does. Android's Noto Sans does not.
//
// So it rendered on the iPhone it was written on, on the Mac it was tested on,
// and on the reviewer's laptop, and it was a blank box for everybody on Android.
//
// THE SAME TRAP WAS SET IN SIX OTHER PLACES, all of them controls a person has
// to press to use the app rather than decoration: the media player's previous,
// next, play, pause and skip buttons, and the mailbox chevron. Every one is a
// character from Miscellaneous Technical or Geometric Shapes.
//
// An inline SVG has no font behind it. It draws the same on every device, at
// any size, in any colour, with no download and no fallback to hope for. For a
// control somebody must find and press, that is the only honest choice.
//
// EMOJI ARE STILL FINE and are used all over the app for decoration and for
// section markers. `🔔`, `⛪`, `📖` are covered by the emoji font on every
// platform. The rule is not "no characters"; it is "nothing from a symbol block
// that no font promises to carry".

interface GlyphProps {
  /** Matches the surrounding text size by default, like a character would. */
  size?: number;
  className?: string;
}

/** Shared: currentColor throughout, so it inherits like text. */
function Svg({ size = 20, className = '', children, label }: GlyphProps & {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Sign out. The one that was a blank box on every Android phone. */
export function PowerGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M12 3v9" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </Svg>
  );
}

export function PlayGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M7 4.5v15l12-7.5z" fill="currentColor" strokeWidth={1.5} />
    </Svg>
  );
}

export function PauseGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M9 4.5v15M15 4.5v15" strokeWidth={3} />
    </Svg>
  );
}

export function PreviousGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M18 5.5v13L8.5 12z" fill="currentColor" strokeWidth={1.5} />
      <path d="M6 5v14" strokeWidth={2.5} />
    </Svg>
  );
}

export function NextGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M6 5.5v13L15.5 12z" fill="currentColor" strokeWidth={1.5} />
      <path d="M18 5v14" strokeWidth={2.5} />
    </Svg>
  );
}

/** Skip backwards. The number of seconds is drawn inside it. */
export function BackGlyph({ seconds = 10, ...props }: GlyphProps & { seconds?: number }) {
  return (
    <Svg {...props}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4 3.5V8h4.5" />
      <text
        x="12" y="15.5" textAnchor="middle"
        fontSize="8" fontWeight="700" fill="currentColor" stroke="none"
      >
        {seconds}
      </text>
    </Svg>
  );
}

/** Skip forwards. */
export function ForwardGlyph({ seconds = 10, ...props }: GlyphProps & { seconds?: number }) {
  return (
    <Svg {...props}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M20 3.5V8h-4.5" />
      <text
        x="12" y="15.5" textAnchor="middle"
        fontSize="8" fontWeight="700" fill="currentColor" stroke="none"
      >
        {seconds}
      </text>
    </Svg>
  );
}

export function CloseGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

/** Points down when a section is open, right when it is shut. */
export function ChevronGlyph({ open = false, ...props }: GlyphProps & { open?: boolean }) {
  return (
    <Svg {...props}>
      {open ? <path d="M6 9l6 6 6-6" /> : <path d="M9 6l6 6-6 6" />}
    </Svg>
  );
}

/** A phone or browser menu button, for install instructions that name one. */
export function MenuGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  );
}

/** The other menu button: three dots in a column. */
export function KebabGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/**
 * A search field's magnifier.
 *
 * The library's search box used `⌕` U+2315, which is the same trap as the
 * power symbol above: Miscellaneous Technical, drawn by Apple's system font
 * and by nothing on Android. It is the label on the one control that makes a
 * long list usable, so it cannot be a character somebody's phone might not
 * have.
 */
export function SearchGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.2 16.2L21 21" />
    </Svg>
  );
}

/**
 * Saved, or not saved. One shape, filled or hollow.
 *
 * It was a pair of characters, `♥` and `♡`, and they are not a pair: the solid
 * one has an emoji form that Android reaches for, the hollow one does not. So
 * saving something swapped a thin outline for a fat red emoji of a different
 * size. Same path, `fill` toggled, is the same heart in both states.
 */
export function HeartGlyph({ filled = false, ...props }: GlyphProps & { filled?: boolean }) {
  return (
    <Svg {...props}>
      <path
        d="M12 20s-7-4.4-7-9.2A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.8C19 15.6 12 20 12 20z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// THE STUDY ROOM'S SET. Drawn in the same 24-unit box, the same 2-unit stroke
// and round joins as everything above, so they sit on a line of text the way
// Apple's own symbols do: a family, not a collection.
//
// They replace characters. The room's star was `★`/`☆`, its way out `←`, the
// insert bar used `☐ ❝ ▦ ◆`, and the places were emoji -- a colour picture of
// a wastebasket beside a line-art star, at four different sizes. The star pair
// had the heart's exact problem: one of the two has an emoji form and the other
// does not, so starring a page swapped a thin outline for a fat yellow emoji.
// ---------------------------------------------------------------------------

/** Starred, or not. One path, filled or hollow, like the heart. */
export function StarGlyph({ filled = false, ...props }: GlyphProps & { filled?: boolean }) {
  return (
    <Svg {...props}>
      <path
        d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"
        fill={filled ? 'currentColor' : 'none'}
      />
    </Svg>
  );
}

/** A page of writing. */
export function DocGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Svg>
  );
}

/** A day on a calendar, for the journal. */
export function CalendarGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </Svg>
  );
}

/** The bin. */
export function TrashGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </Svg>
  );
}

/** Taking something back out of the bin. */
export function RestoreGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" />
    </Svg>
  );
}

/** A folder. */
export function FolderGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </Svg>
  );
}

/** A tag. */
export function TagGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Add, or make a new one. */
export function PlusGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

/** Back, the chevron Apple puts before the name of where you came from. */
export function ChevronLeftGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Svg>
  );
}

/** Every page, as a grid of them. */
export function GridGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </Svg>
  );
}

/** A copy going out. */
export function DownloadGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </Svg>
  );
}

/** Something coming in. */
export function UploadGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M12 16V5M7 10l5-5 5 5M5 20h14" />
    </Svg>
  );
}

/** A whiteboard: a frame with a line drawn on it. */
export function BoardGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M7 14c2-3 4 1 6-2s3-1 4-2M9 21h6" />
    </Svg>
  );
}

/** Bulleted list. */
export function ListGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M10 6h10M10 12h10M10 18h10" />
      <circle cx="5" cy="6" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="5" cy="18" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Numbered list. */
export function NumberedListGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1V9M3.5 14.5a1.5 1.5 0 1 1 2.5 1L3.5 18.5H6.5" strokeWidth={1.6} />
    </Svg>
  );
}

/** A box to tick. */
export function CheckboxGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <path d="M8.5 12.2l2.4 2.4 4.6-5" />
    </Svg>
  );
}

/** A quotation. */
export function QuoteGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M5 18V6M9 9h10M9 13h10M9 17h6" />
    </Svg>
  );
}

/** A table. */
export function TableGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18M3 14.5h18M9.5 5v14M15 5v14" />
    </Svg>
  );
}

/** A line across the page. */
export function DividerGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <path d="M3 12h18" />
      <path d="M7 7h10M7 17h10" strokeOpacity={0.45} />
    </Svg>
  );
}

/** Something set apart: a note in a box. */
export function CalloutGlyph(props: GlyphProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M8 9.5h8M8 13.5h5" />
    </Svg>
  );
}
