'use client';

/**
 * The Explorer's own journey, drawn as movement rather than as a category.
 *
 * ---------------------------------------------------------------------------
 * THE ASK: "There must be a progressive bar that the Explorers can see too that
 * is aligned with the Journey that the Guide sees, so when the Guide progresses
 * the Explorer, the Explorer can appreciate and affirm that he/she progresses in
 * the Journey with the Guide (no labels yet for the Explorer to see, but a
 * really good animated progress bar can be good to see)."
 *
 * NO LABEL, NO NUMBER, NO TICKS, and each of those is a decision rather than an
 * omission.
 *
 *   NO NAME, because tests/e2e/seeker-no-stage.js walks every screen an
 *   Explorer can reach and fails if any of the six stage words appears. That
 *   rule predates this bar and is untouched by it.
 *
 *   NO "3 of 6", because the screen this sits on says "Your journey is a
 *   relationship, not a score" a few lines further up. A fraction is a score.
 *   It would also hand somebody the exact thing the missing label withholds.
 *
 *   NO SEGMENTS. Six ticks can be counted, and a countable bar is a category
 *   with extra steps. A continuous fill reads as "further along than last
 *   time", which is the feeling that was asked for.
 *
 * WHAT THE ANIMATION IS FOR. It fills from empty on every visit, so opening the
 * page is a small moment rather than a static fact, and it eases to a new width
 * when the Guide moves somebody while they happen to be looking. The glow marks
 * the leading edge so the eye has somewhere to land. None of it runs for anybody
 * who has asked their device for less motion.
 *
 * WHEN IT DRAWS NOTHING. No pairing, or a stage this build does not know about.
 * An Explorer with no Guide yet has no journey to show, and inventing a bar at
 * zero would be a claim about a relationship that has not started.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useState } from 'react';
import * as live from '@/lib/live/data';
import { Card } from '@/components/ui';
import { useKeepUp, KEEP_UP_PEOPLE } from '@/lib/live/keep-up';

export function JourneyBar({ guideName }: { guideName?: string }) {
  const [at, setAt] = useState<live.JourneyProgress | null>(null);
  const [shown, setShown] = useState(0);      // the width actually painted
  const [moved, setMoved] = useState(false);  // it advanced while they watched

  const load = () => {
    live.myJourneyProgress()
      .then(setAt)
      // A bar is not worth an error message on somebody's home screen. If it
      // cannot be read it simply does not draw.
      .catch(() => setAt(null));
  };
  useEffect(load, []);

  // The Guide advancing somebody is an UPDATE to a pairings row, which is
  // already one of the tables this channel watches. So the bar moves on the
  // Explorer's screen without them reloading, which is the whole point of
  // doing it live rather than on next open.
  useKeepUp(KEEP_UP_PEOPLE, load);

  // FILL FROM EMPTY, ONCE THE NUMBER IS KNOWN. Painting the final width on the
  // first frame would make the transition a no-op and the bar would simply
  // appear, which is the one thing this is not meant to do.
  useEffect(() => {
    if (!at) return;
    const target = (at.step / at.total) * 100;
    const started = shown > 0;
    const t = window.setTimeout(() => setShown(target), started ? 0 : 60);
    if (started && target > shown) {
      setMoved(true);
      const clear = window.setTimeout(() => setMoved(false), 2600);
      return () => { window.clearTimeout(t); window.clearTimeout(clear); };
    }
    return () => window.clearTimeout(t);
    // `shown` is deliberately not a dependency: this reacts to the number
    // arriving or changing, not to the width it sets in response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [at]);

  if (!at) return null;

  const first = guideName?.trim().split(/\s+/)[0];

  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-gradient-to-br from-navy to-[#2C3F6B] p-5 sm:p-6">
        <p className="text-sm font-bold uppercase tracking-[0.14em] text-gold">
          Your journey
        </p>
        {/* NOT "Walking with you" -- the card directly above this one already
            says that under the Guide's photograph. Two boxes on one screen
            opening with the same three words reads as a template rather than
            as two different things worth knowing. */}
        <p className="mt-1 text-lg font-semibold leading-snug text-white">
          {first ? `Walking it with ${first}.` : 'Walking it with your Guide.'}
        </p>

        <div
          className="relative mt-4 h-3 overflow-hidden rounded-full bg-white/15"
          role="img"
          aria-label="How far along your journey you are"
        >
          <div
            className="jb-fill relative h-3 rounded-full"
            style={{ width: `${shown}%` }}
          >
            <span aria-hidden className="jb-sheen" />
            <span aria-hidden className={`jb-cap${moved ? ' jb-cap-moved' : ''}`} />
          </div>
        </div>

        <p className="mt-3 text-sm leading-relaxed text-white/70">
          {moved
            ? 'You have moved forward. Something to be glad about.'
            : 'This fills as you and your Guide go on together.'}
        </p>
      </div>

      <style>{`
        .jb-fill {
          background: linear-gradient(90deg, #2F80ED 0%, #35B6A4 55%, #E8B84B 100%);
          transition: width 1100ms cubic-bezier(.22,.75,.28,1);
        }
        /* THE LOOP RUNS ON THE COMPOSITOR NOW, NOT THE PAINTER.
           Reported as "the animation is not that smooth, I can still and feel
           it's lagging loop". It was animating background-position, and a
           background position is a PAINT property: every frame the browser
           re-drew the gradient across the whole bar, for ever, on a phone that
           has better things to do. Sixty times a second of repainting is what
           the lag was.
           transform is the one property a browser can move without painting
           anything again -- it hands the layer to the GPU and slides it. Same
           sheen, same 4.2s, none of the work. */
        .jb-sheen {
          position: absolute; inset: 0; border-radius: 9999px;
          overflow: hidden;
        }
        .jb-sheen::after {
          content: ''; position: absolute; top: 0; bottom: 0;
          left: 0; width: 45%;
          background: linear-gradient(
            100deg, transparent, rgba(255,255,255,.5), transparent);
          transform: translate3d(-140%, 0, 0);
          animation: jb-slide 4.2s linear infinite;
          /* Promotes it to its own layer up front, so the first pass is as
             smooth as the tenth rather than stuttering while the browser
             works out that it should have. */
          will-change: transform;
        }
        .jb-cap {
          position: absolute; top: 50%; right: 0;
          width: 10px; height: 10px; margin-top: -5px; margin-right: -1px;
          border-radius: 9999px; background: #FFFFFF;
          box-shadow: 0 0 8px 2px rgba(232,184,75,.85);
        }
        .jb-cap-moved { animation: jb-pulse 900ms ease-out 2; }
        /* A HOLD AT THE END RATHER THAN A HARD RESTART. The old loop ran
           ease-in-out and then snapped back to the beginning, so it slowed in
           the middle and jumped at the seam -- which is the other half of what
           reads as lagging. Linear across, then still, then again: the pass
           itself is even and the repeat is a pause instead of a jolt. */
        @keyframes jb-slide {
          0%   { transform: translate3d(-140%, 0, 0); }
          55%  { transform: translate3d(320%, 0, 0); }
          100% { transform: translate3d(320%, 0, 0); }
        }
        /* Transform and opacity only, for the same reason: a box-shadow is
           painted, and animating one is the most expensive way to make a dot
           glow. The glow is a layer that fades instead. */
        .jb-cap::after {
          content: ''; position: absolute; inset: -6px;
          border-radius: 9999px; background: rgba(232,184,75,.55);
          opacity: 0; transform: scale(.6);
        }
        .jb-cap-moved::after { animation: jb-glow 900ms ease-out 2; }
        @keyframes jb-pulse {
          0%   { transform: scale(1); }
          50%  { transform: scale(1.5); }
          100% { transform: scale(1); }
        }
        @keyframes jb-glow {
          0%   { opacity: 0;   transform: scale(.6); }
          40%  { opacity: .85; transform: scale(1.15); }
          100% { opacity: 0;   transform: scale(1.4); }
        }
        /* Somebody who has asked their device for less motion gets the position
           and none of the movement. The bar still says the true thing. */
        @media (prefers-reduced-motion: reduce) {
          .jb-fill  { transition: none; }
          .jb-sheen::after { animation: none; opacity: 0; }
          .jb-cap-moved { animation: none; }
          .jb-cap-moved::after { animation: none; opacity: 0; }
        }
      `}</style>
    </Card>
  );
}
