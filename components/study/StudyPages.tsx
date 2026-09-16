'use client';

// The pages in a study room, and how somebody moves between them.
//
// ---------------------------------------------------------------------------
// ASKED FOR, THREE TIMES. "I need all the features of Affine, that's what I
// agree on, that's why that study room is a special room like the library."
//
// AFFiNE is a workspace of many documents. This room had exactly one, with its
// id written into the source, so an Explorer studying Romans and an Explorer
// studying Daniel had the same single sheet of paper and no way to start a
// second. That is the largest single thing the room was missing, and it is not
// a rendering feature: the workspace already held a list of pages, a way to add
// to it and a way to remove from it. Nothing had ever drawn the list.
//
// WHY A SCROLLING STRIP RATHER THAN A SIDEBAR. Most people here open this on a
// phone. A sidebar costs a third of a 360px screen or hides behind a control
// nobody presses; a strip of chips costs one row, scrolls with a thumb, and
// puts the page somebody is on at the left where the eye already is.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui';

export type StudyPage = {
  id: string;
  /** What to show. Falls back to a position, so a chip is never blank. */
  title: string;
  /** Whether the person actually named it, as opposed to "Page 3". */
  named: boolean;
};

export function StudyPages({
  pages,
  open,
  onOpen,
  onAdd,
  onRename,
  onRemove,
}: {
  pages: StudyPage[];
  open: string;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, title: string) => void;
  onRemove: (id: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  const current = pages.find((p) => p.id === open);

  // Moving to another page cancels anything half-done on the old one, so a
  // rename box never reappears attached to a page nobody is looking at.
  useEffect(() => {
    setRenaming(false);
    setConfirming(false);
  }, [open]);

  useEffect(() => {
    if (renaming) input.current?.focus();
  }, [renaming]);

  const commit = () => {
    const title = draft.trim();
    setRenaming(false);
    if (current && title !== current.title) onRename(current.id, title);
  };

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        {/* THE STRIP, AND IT IS NAVIGATION. Named, because a screen reader
            landing in this room otherwise meets a row of unexplained buttons
            between the heading and the writing; and because the app's own room
            rail already marks its active link `aria-current="page"`, so without
            a landmark there is no way to say WHICH current page is meant. */}
        <nav
          aria-label="Pages in this room"
          className="thin-scroll -mx-1 flex flex-1 gap-2 overflow-x-auto px-1 py-1"
        >
          {pages.map((page) => {
            const isOpen = page.id === open;
            return (
              <button
                key={page.id}
                type="button"
                onClick={() => onOpen(page.id)}
                aria-current={isOpen ? 'page' : undefined}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm ring-1 transition ${
                  isOpen
                    ? 'bg-navy text-white ring-navy'
                    : 'bg-white text-gray-700 ring-black/10 hover:bg-gray-50'
                } ${page.named ? '' : 'italic'}`}
              >
                {page.title}
              </button>
            );
          })}
        </nav>

        {/* THE ADD CONTROL BELONGS WITH THE CHIPS, not beside them. An
            ordinary Button is 56px tall by design, which next to a 34px chip
            made the row two heights and gave the least-used control on the
            strip the most weight on a 360px screen. Same shape as a page, a
            dashed edge so it reads as "one more" rather than as a page. */}
        <button
          type="button"
          onClick={onAdd}
          className="shrink-0 rounded-full border border-dashed border-navy/40 px-3 py-1.5 text-sm font-semibold text-navy hover:bg-navy/5"
        >
          + New page
        </button>
      </div>

      {/* WHAT CAN BE DONE TO THE PAGE YOU ARE ON, and only that page. Showing a
          rename and a delete on every chip turns a strip of pages into a strip
          of hazards on a screen where a thumb covers three of them. */}
      {current && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          {renaming ? (
            <>
              <input
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                maxLength={60}
                placeholder="What is this page about?"
                aria-label="Name this page"
                className="min-w-0 flex-1 rounded-xl px-3 py-2 ring-1 ring-black/10"
              />
              <button
                type="button"
                onClick={commit}
                className="shrink-0 rounded-xl px-3 py-2 font-semibold text-navy ring-1 ring-navy/20 hover:bg-navy/5"
              >
                Save name
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => { setDraft(current.named ? current.title : ''); setRenaming(true); }}
                className="rounded-lg px-2 py-1 text-gray-600 underline decoration-dotted hover:text-navy"
              >
                Name this page
              </button>

              {/* DISCOURAGED, NOT HIDDEN. One page is the whole of somebody's
                  study on something; the button that ends it is the small red
                  one, and it asks first. With a single page left there is
                  nothing to delete into, so it is not offered at all. */}
              {pages.length > 1 && (
                confirming ? (
                  <>
                    <span className="text-gray-700">
                      Delete {current.title} and everything written on it?
                    </span>
                    <Button variant="danger" onClick={() => onRemove(current.id)}>
                      Yes, delete this page
                    </Button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="rounded-xl px-3 py-2 font-semibold text-navy ring-1 ring-navy/20 hover:bg-navy/5"
                    >
                      Keep it
                    </button>
                  </>
                ) : (
                  <Button variant="danger" onClick={() => setConfirming(true)}>
                    Delete this page
                  </Button>
                )
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default StudyPages;
