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

import { APP_NAME } from '@/lib/brand';
import type { ShelfView } from '@/components/study/StudyShelf';

export function StudyWorkspaceShell({
  view,
  onView,
  counts,
  onExit,
  onHome,
  showingPage,
  pageTitle,
  children,
}: {
  view: ShelfView;
  onView: (v: ShelfView) => void;
  counts: { all: number; favourites: number; trash: number };
  /** Out of the room and back into the rest of the app. */
  onExit: () => void;
  /** Back to the shelf from an open page. */
  onHome: () => void;
  showingPage: boolean;
  pageTitle: string;
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

  const places: Array<{ id: ShelfView; label: string; icon: string; count: number }> = [
    { id: 'all', label: 'All pages', icon: '📄', count: counts.all },
    { id: 'favourites', label: 'Starred', icon: '★', count: counts.favourites },
    { id: 'trash', label: 'Bin', icon: '🗑️', count: counts.trash },
  ];

  return (
    <div
      // ABOVE EVERYTHING, INCLUDING THE WALKTHROUGH'S OWN BANNER. At z-50 the
      // tutorial strip painted over the top of this room and took the way out
      // with it: the "Hope Beacon" button was behind it, which is the one
      // control somebody must always be able to reach. A room that takes the
      // screen has to actually take it.
      className="fixed inset-0 z-[100] flex flex-col bg-[#FAF7F2]"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {/* THE WAY OUT IS THE FIRST THING ON THE SCREEN, and it says where it
          goes. "Close" would leave somebody guessing what closing means when
          the room is the whole window. */}
      <header className="flex shrink-0 items-center gap-2 bg-navy px-3 py-2 text-white">
        <button
          type="button"
          onClick={onExit}
          className="tap-sm shrink-0 rounded-xl px-3 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/10"
        >
          ← {APP_NAME}
        </button>

        {/* ON A PAGE, AT 360px, THIS HAD ABOUT FORTY PIXELS and rendered the
            title as "P...". Two buttons and a name do not fit across the
            narrowest phone, and of the three the name is the one already on
            the screen: it is the first thing in the page body, in full, as an
            editable field. So it is dropped from the bar rather than shown as
            an ellipsis. The shelf has only one button and keeps its title. */}
        <div className={`min-w-0 flex-1 ${showingPage ? 'hidden sm:block' : ''}`}>
          <p className="truncate text-base font-bold">
            {showingPage ? pageTitle : '📖 Study Room'}
          </p>
        </div>
        {showingPage && <div className="flex-1 sm:hidden" aria-hidden />}

        {showingPage ? (
          <button
            type="button"
            onClick={onHome}
            className="tap-sm shrink-0 rounded-xl px-3 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/10"
          >
            All pages
          </button>
        ) : null}
      </header>

      <div className="flex min-h-0 flex-1">
        {/* THE SIDEBAR IS A SIDEBAR ONLY WHERE THERE IS ROOM FOR ONE. Below
            768px it is the strip under the header instead: the same three
            places, one row, no drawer to discover. */}
        {!showingPage && (
          <nav
            aria-label="Places in your study room"
            className="hidden w-56 shrink-0 border-r border-black/5 bg-white/60 p-3 md:block"
          >
            <ul className="space-y-1">
              {places.map((place) => (
                <li key={place.id}>
                  <button
                    type="button"
                    onClick={() => onView(place.id)}
                    aria-current={view === place.id ? 'true' : undefined}
                    className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-base ${
                      view === place.id
                        ? 'bg-navy font-semibold text-white'
                        : 'text-navy hover:bg-navy/5'
                    }`}
                  >
                    <span aria-hidden>{place.icon}</span>
                    <span className="min-w-0 flex-1 truncate">{place.label}</span>
                    <span className={view === place.id ? 'text-white/70' : 'text-gray-400'}>
                      {place.count}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!showingPage && (
            <nav
              aria-label="Places in your study room"
              className="thin-scroll flex shrink-0 gap-2 overflow-x-auto border-b border-black/5 px-3 py-2 md:hidden"
            >
              {places.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  onClick={() => onView(place.id)}
                  aria-current={view === place.id ? 'true' : undefined}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-sm ring-1 ${
                    view === place.id
                      ? 'bg-navy text-white ring-navy'
                      : 'bg-white text-navy ring-black/10'
                  }`}
                >
                  <span aria-hidden>{place.icon}</span> {place.label}
                  <span className="ml-1 opacity-60">{place.count}</span>
                </button>
              ))}
            </nav>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default StudyWorkspaceShell;
