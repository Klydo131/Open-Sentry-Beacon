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

import {
  GROUP_ORDER, dayInWords, groupFor, hasTag, tagsAcross, whenWritten, type ShelfEntry,
} from '@/lib/study/shelf';

export type ShelfView = 'all' | 'favourites' | 'journal' | 'trash';

export function StudyShelf({
  entries,
  view,
  tag,
  onTag,
  onOpen,
  onToggleFavourite,
  onTrash,
  onRestore,
  onDeleteForever,
  onAdd,
  onToday,
}: {
  entries: ShelfEntry[];
  view: ShelfView;
  /** The tag the list is narrowed to, or empty for all of them. */
  tag: string;
  onTag: (tag: string) => void;
  onOpen: (id: string) => void;
  onToggleFavourite: (id: string) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onAdd: () => void;
  /** Open today's journal page, making it if today has not been written in. */
  onToday: () => void;
}) {
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState('');

  const tags = useMemo(() => tagsAcross(entries), [entries]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries
      .filter((e) => (view === 'trash' ? e.trashed : !e.trashed))
      .filter((e) => (view === 'favourites' ? e.favorite : true))
      .filter((e) => (view === 'journal' ? Boolean(e.journalDate) : true))
      .filter((e) => !tag || hasTag(e, tag))
      // SEARCH LOOKS AT THE TAGS TOO. Somebody who tagged four pages "Romans"
      // and then types Romans into the search means those four pages, whatever
      // the words on them happen to be.
      .filter((e) => !needle
        || e.title.toLowerCase().includes(needle)
        || e.preview.toLowerCase().includes(needle)
        || e.tags.some((t) => t.toLowerCase().includes(needle)))
      // THE JOURNAL IS ORDERED BY THE DAY IT IS ABOUT, not the day it was last
      // touched. Correcting a note from last Sabbath should not move it above
      // this morning's.
      .sort((a, b) => (view === 'journal'
        ? b.journalDate.localeCompare(a.journalDate)
        : b.updated - a.updated));
  }, [entries, view, query, tag]);

  const groups = useMemo(() => {
    if (view === 'journal') return [{ name: 'Your journal', entries: shown }];
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
            onClick={view === 'journal' ? onToday : onAdd}
            className="shrink-0 rounded-xl bg-navy px-4 py-3 text-base font-semibold text-white hover:opacity-90"
          >
            {view === 'journal' ? "Today's page" : '+ New page'}
          </button>
        )}
      </div>

      {/* THE TAGS IN THIS ROOM, AS A ROW RATHER THAN A SIDEBAR. AFFiNE puts them
          down the side, which works on a laptop and is where the sidebar
          already is on a phone: nowhere. A row of chips under the search reads
          the same at 360px as at 1440px, and there is only one of it to keep
          right. */}
      {view !== 'trash' && tags.length > 0 && (
        <div
          role="group"
          aria-label="Narrow these pages to one tag"
          className="thin-scroll -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1"
        >
          <button
            type="button"
            onClick={() => onTag('')}
            aria-pressed={!tag}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ring-1 ${
              tag ? 'bg-white text-navy ring-black/10' : 'bg-navy text-white ring-navy'
            }`}
          >
            Every tag
          </button>
          {tags.map((t) => (
            <button
              key={t.tag}
              type="button"
              onClick={() => onTag(tag.toLowerCase() === t.tag.toLowerCase() ? '' : t.tag)}
              aria-pressed={tag.toLowerCase() === t.tag.toLowerCase()}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm ring-1 ${
                tag.toLowerCase() === t.tag.toLowerCase()
                  ? 'bg-navy text-white ring-navy'
                  : 'bg-white text-navy ring-black/10'
              }`}
            >
              {t.tag} <span className="opacity-60">{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-center ring-1 ring-black/5">
          <p className="text-lg font-semibold text-navy">
            {view === 'trash' ? 'Nothing in the bin'
              : view === 'journal' ? 'Your journal has not been started'
                : view === 'favourites' ? 'No starred pages yet'
                  : tag ? `No pages tagged ${tag}`
                    : query ? 'Nothing matches that'
                      : 'Your study room is empty'}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {view === 'trash' ? 'Pages you put in the bin wait here until you empty it.'
              : view === 'journal' ? 'A journal gives every day a page of its own. Today is one tap away.'
                : view === 'favourites' ? 'Star a page and it will be here whenever you come back.'
                  : tag ? 'Open a page and add that tag to it, or choose a different tag.'
                    : query ? 'Try a different word, or look in the bin.'
                      : 'Start a page for whatever you are reading.'}
          </p>
          {view === 'journal' && (
            <button
              type="button"
              onClick={onToday}
              className="tap mt-3 rounded-xl bg-navy px-5 text-base font-semibold text-white"
            >
              Start today&rsquo;s page
            </button>
          )}
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
                    <p className="mt-1 text-xs text-gray-400">
                      {entry.journalDate
                        ? `${dayInWords(entry.journalDate)} · ${whenWritten(entry.updated)}`
                        : whenWritten(entry.updated)}
                    </p>
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
                  {/* A TAG ON A ROW IS ALSO THE WAY TO SEE THE REST OF THEM.
                      It sits out here rather than inside the row's own button
                      because a button inside a button is not a thing a browser
                      will render, and a tag nobody can press is decoration. */}
                  {!entry.trashed && entry.tags.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onTag(tag.toLowerCase() === t.toLowerCase() ? '' : t)}
                      aria-label={`Show every page tagged ${t}`}
                      className="rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-navy hover:bg-gold/30"
                    >
                      {t}
                    </button>
                  ))}
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
