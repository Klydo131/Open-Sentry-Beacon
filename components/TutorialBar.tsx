'use client';

// The permanent "you are in the tutorial" bar, and the way out of it.
//
// TWO SEPARATE FAILURES MADE THIS NECESSARY, both found by the owner opening
// the app rather than by any check:
//
//   1. THERE WAS NO WAY BACK. Pressing "Open the tutorial" took you to the
//      tutorial's front door, which has no app shell around it — the mode
//      switch lives in the header you only get AFTER choosing somebody to be.
//      So the front door of the tutorial was a room with no exit, and the only
//      way back to the real sign-up was editing the address bar.
//
//   2. IT LOOKED IDENTICAL TO THE LIVE APP. Same navy, same mark, same title,
//      same gold button. Somebody who pressed the button and landed here
//      concluded nothing had happened.
//
// A timed notice was already in the layout (DemoRibbon) and could not fix
// either: it appears on a schedule, it can be missed, and it deliberately hides
// while the guided walk is running — which is exactly when somebody is most
// deeply inside sample data. What was missing is something that is simply
// always there.
//
// Fixed rather than sticky, with matching body padding injected alongside it,
// because the screens underneath build their own layouts and several of them
// start with a full-height hero. A sticky element inside that flow scrolls
// away; a fixed one does not.

import { useRouter } from 'next/navigation';
import { TUTORIAL_PURPLE } from '@/lib/brand';
import { useTutorialMode } from '@/lib/tutorial';

export const TUTORIAL_BAR_HEIGHT = 46;

export function TutorialBar() {
  const { tutorial, hasDatabase, leaveTutorial } = useTutorialMode();
  const router = useRouter();

  if (!tutorial) return null;

  return (
    <>
      {/* Everything on the page moves down by exactly the bar's height, and
          the app's own sticky header is told where the top of the page now is.
          Doing both here keeps the concern in one file: no other screen has to
          know this bar exists, and when the visitor leaves the tutorial the
          rule leaves with it.

          THE PADDING ALONE WAS NOT ENOUGH, and this is the bug the tutorial
          suite had been reporting for weeks. `body { padding-top }` moves the
          document, but the app header is `position: sticky; top: 0`, and a
          sticky element pins itself to the VIEWPORT, not to the padded body.
          So the moment anybody scrolled, the header slid up underneath this
          bar — which is z-60 against the header's z-20, and takes pointer
          events — and the top 46px of the header stopped being clickable.

          What lived in that strip: the profile button. The tutorial's last
          step asks the visitor to tap it, the tap landed on this bar instead,
          and the walk could never finish. It read as "the spotlight points at
          nothing", which is why it looked like a tutorial bug rather than a
          layout one. Every user on a phone had the same dead button; only the
          tutorial was arranged to notice. */}
      <style>{`
        :root { --beacon-chrome-top: ${TUTORIAL_BAR_HEIGHT}px; }
        body { padding-top: ${TUTORIAL_BAR_HEIGHT}px; }
      `}</style>

      <div
        className="fixed inset-x-0 top-0 z-[60] flex items-center justify-between gap-3 px-3 text-white shadow-lg sm:px-4"
        style={{ height: TUTORIAL_BAR_HEIGHT, backgroundColor: TUTORIAL_PURPLE }}
        role="status"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="text-base">🧪</span>
          <span className="shrink-0 rounded-md bg-white/20 px-2 py-0.5 text-[11px] font-extrabold tracking-wider">
            TUTORIAL
          </span>
          {/* The explanation is the first thing to go on a narrow phone; the
              word TUTORIAL and the way out are what must survive. */}
          <span className="hidden truncate text-sm text-white/85 sm:inline">
            Sample people, invented in this browser. Nothing here is real.
          </span>
        </div>

        {hasDatabase ? (
          <button
            type="button"
            onClick={() => {
              leaveTutorial();
              router.push('/');
            }}
            className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-[#4C3575] hover:bg-white/90"
          >
            Leave the tutorial →
          </button>
        ) : (
          // A copy with no database configured has nowhere to go, and a button
          // that promised otherwise would be the worst kind: the kind that
          // looks like it worked.
          <span className="shrink-0 text-[11px] text-white/70">
            No database connected
          </span>
        )}
      </div>
    </>
  );
}
