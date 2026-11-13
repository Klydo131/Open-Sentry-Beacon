// The app's mark.
//
// An open ring that flicks inward into a speech tail: a conversation someone
// left open. That is the product in one shape — one person staying with another
// — and the circle deliberately does not close.
//
// TO USE YOUR OWN LOGO: replace RING and TAIL below with your own SVG path data,
// or replace the whole <svg> with an <img>. Then run `node scripts/gen-icons.mjs`
// so the favicon and the home-screen icons are regenerated from the same
// drawing. Colours come from lib/brand.ts.
//
// Drawn as geometry rather than shipped as an image, on purpose. A pasted PNG is
// the thing people notice: it brings its own background, its own idea of white,
// its own soft edges, and it blurs on a high-density screen. This is vector at
// every size and sits on navy or on white with no halo.
//
// The geometry was matched against the supplied artwork by rendering both side
// by side and correcting three times: the ring was too thick, the tail too
// heavy, and a round cap on the arc left a notch where the tail met it. The arc
// now ends butt-capped so the tail joins it flush, and the rounded terminus at
// the bottom right is drawn explicitly.

import { APP_SHORT_NAME, BRAND_FROM as FROM, BRAND_TO as TO } from '@/lib/brand';

export type MarkTone = 'brand' | 'mono';

const STROKE = 12.5;

// The ring, stopping short of closing at the bottom.
const RING = 'M 29.4 72.7 A 34 34 0 1 1 60.6 81.8';
// The tail: out of the ring's lower-left end, right into a rounded tip, then
// back down to a point. Filled rather than stroked so the taper is real — a
// stroked path cannot narrow, and a tail of even width reads as a stray mark.
const TAIL =
  'M 29.4 68.6 C 38 66.7 47 65.7 53.5 65.6 C 56.5 65.6 56.8 68 53.5 68.6 ' +
  'C 45.5 70.2 40.5 75.5 36.2 84 C 30.8 81.4 24.4 78.6 20.1 76.9 Z';

let seq = 0;

export function SentryBeaconMark({
  size = 34,
  tone = 'brand',
  title,
  className,
}: {
  size?: number;
  tone?: MarkTone;
  /** Given only when the mark stands alone as a link or a button. Beside the
   *  wordmark it is decorative and must stay silent for a screen reader. */
  title?: string;
  className?: string;
}) {
  // Unique per instance: two marks on one page would otherwise share a gradient
  // id, and the second would render with the first's colours.
  const id = `hb${(seq = (seq + 1) % 100000)}`;
  const from = FROM;
  const to = TO;
  const paint = tone === 'mono' ? 'currentColor' : `url(#${id})`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {tone !== 'mono' && (
        <defs>
          <linearGradient
            id={id}
            x1="12"
            y1="18"
            x2="88"
            y2="82"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor={from} />
            <stop offset="1" stopColor={to} />
          </linearGradient>
        </defs>
      )}
      <path d={RING} fill="none" stroke={paint} strokeWidth={STROKE} strokeLinecap="butt" />
      <circle cx="60.6" cy="81.8" r={STROKE / 2} fill={paint} />
      <path d={TAIL} fill={paint} />
    </svg>
  );
}

// The mark with the name beside it, which is how the brand appears nearly
// everywhere it appears at all. Keeping the two together stops them drifting:
// the old header carried its own private copy of the mark and its own hardcoded
// name, so changing the brand meant finding both.
export function SentryBeaconWordmark({
  size = 34,
  onDark = false,
  subtitle,
  nameClass = 'text-xl',
}: {
  size?: number;
  onDark?: boolean;
  subtitle?: string;
  nameClass?: string;
}) {
  return (
    <span className="flex shrink-0 items-center gap-2 sm:gap-3">
      <SentryBeaconMark size={size} />
      <span className="leading-tight">
        <span
          className={`block font-extrabold tracking-tight ${nameClass} ${
            onDark ? 'text-white' : 'text-navy'
          }`}
        >
          {APP_SHORT_NAME}
        </span>
        {subtitle && (
          <span className={`block text-xs ${onDark ? 'text-white/60' : 'text-gray-500'}`}>
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
