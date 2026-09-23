'use client';

// The Study Room as a room you walk into, and walk back out of.
//
// ---------------------------------------------------------------------------
// ASKED FOR, IN THESE WORDS: "If I click the study room I want to see this with
// the brand of Hope beacon, if I want to exit the study room, then I will go
// back to Hope Beacon web page, simple as that."
//
// So it takes the screen. Not a card on a page with the app's rails either side
// of it, competing for a 360px phone with a header, a left rail and a right
// rail: the workspace fills the window, and one clearly marked way out puts
// somebody back in the app.
//
// WHY AN OVERLAY RATHER THAN A DIFFERENT SHELL. The screen still has to be
// behind the same gate as every other live screen -- signed in, an Explorer,
// the same redirect when they are not -- and that gate lives in LiveAppShell
// along with the chrome. Rendering over the top keeps one authorisation path
// for the whole app rather than a second one written for this room, which is
// the kind of duplicate that ends with a screen nobody remembered to protect.
//
// AND THE BRAND IS THE POINT, not a coat of paint. AFFiNE's own app is charcoal
// and violet; this is the same shape in the navy, gold and parchment the rest
// of Hope Beacon is written in, so walking in does not feel like leaving.
// ---------------------------------------------------------------------------

import { useEffect } from 'react';

import '@/components/study/study-shell.css';

import { APP_NAME } from '@/lib/brand';
import type { ShelfView } from '@/components/study/StudyShelf';
import {
  CalendarGlyph, ChevronLeftGlyph, DocGlyph, GridGlyph, PlusGlyph, StarGlyph, TrashGlyph,
} from '@/components/Glyph';

/**
 * The four places, in one list so the sidebar and the phone's segmented control
 * can never disagree about what they are called or in what order they come.
 */
export const PLACES: Array<{ id: ShelfView; label: string; Icon: typeof DocGlyph }> = [
  { id: 'all', label: 'All pages', Icon: DocGlyph },
  { id: 'favourites', label: 'Starred', Icon: StarGlyph },
  // A DAY AT A TIME, which is the shape most of what happens in a church
  // already has: a morning devotion, a sermon on Sabbath, what somebody
  // prayed about on Tuesday. Nobody names those pages and nobody should have
  // to, so the journal names them by the day they belong to.
  { id: 'journal', label: 'Journal', Icon: CalendarGlyph },
  { id: 'trash', label: 'Bin', Icon: TrashGlyph },
];

export function StudyWorkspaceShell({
  view,
  onView,
  counts,
  onExit,
  onHome,
  showingPage,
  pageTitle,
  action,
  children,
}: {
  view: ShelfView;
  onView: (v: ShelfView) => void;
  counts: { all: number; favourites: number; journal: number; trash: number };
  /** Out of the room and back into the rest of the app. */
  onExit: () => void;
  /** Back to the shelf from an open page. */
  onHome: () => void;
  showingPage: boolean;
  pageTitle: string;
  /**
   * The shelf's one main thing to do -- New page, or Today's page in the
   * journal -- drawn in the bar on a phone, where there is no room for it
   * beside the large title. Wider screens show it beside the title instead.
   */
  action?: { label: string; onClick: () => void };
  children: React.ReactNode;
}) {
  // A ROOM THAT TAKES THE SCREEN MUST NOT LEAVE THE PAGE BEHIND IT SCROLLING.
  // Without this a phone scrolls the app underneath while somebody is writing,
  // and closing the room drops them somewhere they never went.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const countOf = (id: ShelfView) => (
    id === 'all' ? counts.all
      : id === 'favourites' ? counts.favourites
        : id === 'journal' ? counts.journal
          : counts.trash
  );

  return (
    <div
      // ABOVE EVERYTHING, INCLUDING THE WALKTHROUGH'S OWN BANNER. At z-50 the
      // tutorial strip painted over the top of this room and took the way out
      // with it: the "Hope Beacon" button was behind it, which is the one
      // control somebody must always be able to reach. A room that takes the
      // screen has to actually take it.
      className="sr fixed inset-0 z-[100]"
    >
      {/* THE WAY OUT IS THE FIRST THING ON THE SCREEN, and it says where it
          goes. "Close" would leave somebody guessing what closing means when
          the room is the whole window. Drawn as Apple draws a back button --
          a chevron and the name of the place it returns to, in the tint
          colour, with no box around it. */}
      <header className="sr-bar">
        <div className="sr-bar-row">
          <div className="flex min-w-0 shrink-0 justify-start">
            <button type="button" onClick={onExit} className="sr-bar-btn tap-sm">
              <ChevronLeftGlyph size={22} />
              <span className="truncate">{APP_NAME}</span>
            </button>
          </div>

          {/* NOTHING IN THE MIDDLE ON A PHONE. At 360px a centred title leaves
              each side about 118px, and the way out needs 143 -- it came out
              as "Hope Bea...", on the one control that must always read
              clearly. On a page the name is already the first thing in the
              body, in full, and on the shelf the large title says where you
              are. So the bar's own title is for wide screens only, and on the
              shelf the sidebar says it instead. */}
          <p className="sr-bar-title hidden md:block">
            {showingPage ? pageTitle : ''}
          </p>

          <div className="flex min-w-0 shrink-0 justify-end">
            {showingPage ? (
              <button type="button" onClick={onHome} className="sr-bar-btn tap-sm">
                <GridGlyph size={19} className="mr-1" />
                All pages
              </button>
            ) : action ? (
              // WRAPPED, because `.sr-bar-btn` sets its own display and a class
              // in this room's stylesheet outranks Tailwind's `md:hidden` by
              // arriving later -- which put this button on the desktop too,
              // beside the one next to the large title.
              <span className="md:hidden">
                <button type="button" onClick={action.onClick} className="sr-bar-btn tap-sm font-semibold">
                  <PlusGlyph size={20} className="mr-0.5" />
                  {action.label}
                </button>
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="absolute inset-0 flex">
        {/* THE SIDEBAR IS A SIDEBAR ONLY WHERE THERE IS ROOM FOR ONE, as on an
            iPad. Below 768px the same four places are a segmented control
            under the title instead: one row, nothing to discover. */}
        {!showingPage && (
          <nav
            aria-label="Places in your study room"
            className="sr-side hidden w-64 shrink-0 overflow-y-auto px-3 pb-6 md:block"
            style={{ paddingTop: 'calc(var(--sr-bar-h) + 20px)' }}
          >
            <p className="px-2 pb-3 text-[22px] font-bold tracking-tight">Study Room</p>
            <ul className="space-y-0.5">
              {PLACES.map(({ id, label, Icon }) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onView(id)}
                    aria-current={view === id ? 'true' : undefined}
                    className="sr-side-item tap-sm"
                  >
                    <Icon size={20} />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    <span className="text-[15px] tabular-nums opacity-60">{countOf(id)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="relative min-w-0 flex-1">
          {/* THE PAGE SCROLLS UNDER THE BAR, which is what makes the bar a
              material rather than a stripe. A SPACER the bar's height, safe
              area included, so nothing starts hidden -- and a spacer rather
              than padding on purpose: the insert bar is sticky inside this
              box, and whether a sticky element measures from a scroll box's
              padding edge or its outer edge is exactly the kind of thing
              engines have disagreed on. With no padding there is nothing to
              disagree about, and the insert bar's offset can simply be the
              bar's height. */}
          <div data-study-scroll className="absolute inset-0 overflow-y-auto overscroll-contain">
            <div aria-hidden style={{ height: 'var(--sr-bar-h)' }} />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default StudyWorkspaceShell;
