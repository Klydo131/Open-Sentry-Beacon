'use client';

// The shelf: every page in the room, before you open one.
//
// ---------------------------------------------------------------------------
// ASKED FOR, WITH A SCREENSHOT OF AFFiNE'S OWN "All docs": a list of documents
// with a preview line and a date, a star on each, grouped by when they were
// last touched, with a search over the top -- "I want the whole Affine features
// like this but with Hope Beacon brand please."
//
// WHY A LIST AND NOT THE TABS THIS REPLACED. A strip of chips is fine for three
// pages and useless for thirty: no preview, no dates, no order, nothing to
// search, and on a phone the eleventh page is off the side of the screen with
// nothing to say it exists. The library room in this app already solved the
// same problem the same way, which is exactly why it was named in the request.
//
// GROUPED BY WHEN, NOT BY NAME. It is how somebody looks for the page they were
// writing on Tuesday. Alphabetical order helps when you know what a thing is
// called, and a study room is full of pages nobody has named.
// ---------------------------------------------------------------------------

import { useMemo, useState } from 'react';

import { GROUP_ORDER, groupFor, whenWritten, type ShelfEntry } from '@/lib/study/shelf';

export type ShelfView = 'all' | 'favourites' | 'trash';

export function StudyShelf({
  entries,
  view,
  onOpen,
  onToggleFavourite,
  onTrash,
  onRestore,
  onDeleteForever,
  onAdd,
}: {
  entries: ShelfEntry[];
  view: ShelfView;
  onOpen: (id: string) => void;
  onToggleFavourite: (id: string) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onAdd: () => void;
}) {
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState('');

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries
      .filter((e) => (view === 'trash' ? e.trashed : !e.trashed))
      .filter((e) => (view === 'favourites' ? e.favorite : true))
      .filter((e) => !needle
        || e.title.toLowerCase().includes(needle)
        || e.preview.toLowerCase().includes(needle))
      .sort((a, b) => b.updated - a.updated);
  }, [entries, view, query]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, ShelfEntry[]>();
    for (const entry of shown) {
      const key = view === 'trash' ? 'In the bin' : groupFor(entry.updated);
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(entry);
    }
    const order = view === 'trash' ? ['In the bin'] : GROUP_ORDER;
    return order
      .filter((name) => byGroup.has(name))
      .map((name) => ({ name, entries: byGroup.get(name)! }));
  }, [shown, view]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
      <div className="mb-4 flex items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          placeholder="Search your pages"
          aria-label="Search your pages"
          className="min-w-0 flex-1 rounded-xl bg-white px-4 py-3 text-base ring-1 ring-black/10 placeholder:text-gray-400"
        />
        {view !== 'trash' && (
          <button
            type="button"
            onClick={onAdd}
            className="shrink-0 rounded-xl bg-navy px-4 py-3 text-base font-semibold text-white hover:opacity-90"
          >
            + New page
          </button>
        )}
      </div>

      {shown.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-black/5">
          <p className="text-lg font-semibold text-navy">
            {view === 'trash' ? 'Nothing in the bin'
              : view === 'favourites' ? 'No starred pages yet'
                : query ? 'Nothing matches that'
                  : 'Your study room is empty'}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {view === 'trash' ? 'Pages you put in the bin wait here until you empty it.'
              : view === 'favourites' ? 'Star a page and it will be here whenever you come back.'
                : query ? 'Try a different word, or look in the bin.'
                  : 'Start a page for whatever you are reading.'}
          </p>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.name} className="mb-6">
          <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-gray-500">
            {group.name} <span className="font-normal text-gray-400">· {group.entries.length}</span>
          </h2>
          <ul
            aria-label={`Pages: ${group.name}`}
            className="overflow-hidden rounded-2xl bg-white ring-1 ring-black/5"
          >
            {group.entries.map((entry) => (
              <li key={entry.id} className="border-b border-black/5 last:border-0">
                <div className="flex items-start gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => (entry.trashed ? onRestore(entry.id) : onOpen(entry.id))}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className={`truncate text-base font-semibold text-navy ${entry.named ? '' : 'italic'}`}>
                      {entry.title}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">
                      {entry.preview || 'Nothing written on this page yet.'}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">{whenWritten(entry.updated)}</p>
                  </button>

                  {!entry.trashed && (
                    <button
                      type="button"
                      onClick={() => onToggleFavourite(entry.id)}
                      aria-pressed={entry.favorite}
                      aria-label={entry.favorite
                        ? `Remove ${entry.title} from starred pages`
                        : `Star ${entry.title}`}
                      className="shrink-0 rounded-lg px-2 py-1 text-xl leading-none"
                    >
                      <span aria-hidden>{entry.favorite ? '★' : '☆'}</span>
                    </button>
                  )}
                </div>

                {/* WHAT CAN BE DONE TO A PAGE sits under it rather than behind a
                    menu, because a menu on a phone is a tap to find out there
                    were two things in it. Both are quiet; neither is the thing
                    the row is for. */}
                <div className="flex flex-wrap items-center gap-2 px-3 pb-3 text-sm">
                  {entry.trashed ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onRestore(entry.id)}
                        className="rounded-lg px-2 py-1 font-semibold text-navy ring-1 ring-navy/20 hover:bg-navy/5"
                      >
                        Put it back
                      </button>
                      {confirming === entry.id ? (
                        <>
                          <span className="text-gray-700">Delete it for good?</span>
                          <button
                            type="button"
                            onClick={() => { setConfirming(''); onDeleteForever(entry.id); }}
                            className="tap-sm rounded-xl bg-white px-4 text-sm font-bold text-red-700 ring-1 ring-red-200"
                          >
                            Yes, delete forever
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirming('')}
                            className="rounded-lg px-2 py-1 font-semibold text-navy"
                          >
                            Keep it
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirming(entry.id)}
                          className="tap-sm rounded-xl bg-white px-4 text-sm font-bold text-red-700 ring-1 ring-red-200"
                        >
                          Delete forever
                        </button>
                      )}
                    </>
                  ) : (
                    // NOT A DELETE. A page goes to the bin and waits there, so
                    // the tap that ends a month of study is one somebody can
                    // take back. The irreversible one lives in the bin, behind
                    // a question.
                    <button
                      type="button"
                      onClick={() => onTrash(entry.id)}
                      className="rounded-lg px-2 py-1 text-gray-500 underline decoration-dotted hover:text-navy"
                    >
                      Move to bin
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export default StudyShelf;
