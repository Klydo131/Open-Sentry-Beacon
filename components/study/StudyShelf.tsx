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
  CloseGlyph, DownloadGlyph, FolderGlyph, PlusGlyph, RestoreGlyph, SearchGlyph, StarGlyph,
  TagGlyph, TrashGlyph, UploadGlyph, CalendarGlyph, DocGlyph,
} from '@/components/Glyph';
import { PLACES } from '@/components/study/StudyWorkspaceShell';
import {
  GROUP_ORDER, dayInWords, foldersAcross, groupFor, hasTag, matchesCollection,
  nameForView, tagsAcross, whenWritten, type Collection, type ShelfEntry,
} from '@/lib/study/shelf';

export type ShelfView = 'all' | 'favourites' | 'journal' | 'trash';

export function StudyShelf({
  entries,
  view,
  onView,
  counts,
  walkthrough = false,
  tag,
  onTag,
  folder,
  onFolder,
  collections,
  collection,
  onCollection,
  onSaveCollection,
  onForgetCollection,
  onOpen,
  onToggleFavourite,
  onTrash,
  onRestore,
  onDeleteForever,
  onAdd,
  onToday,
  onExportVault,
  onImportVault,
  vaultBusy = '',
}: {
  entries: ShelfEntry[];
  view: ShelfView;
  /** Move to another place. On a phone the places live here, under the title. */
  onView: (v: ShelfView) => void;
  counts: { all: number; favourites: number; journal: number; trash: number };
  /** The sample side, where nothing written is kept, and says so. */
  walkthrough?: boolean;
  /** The tag the list is narrowed to, or empty for all of them. */
  tag: string;
  onTag: (tag: string) => void;
  /** The folder the list is narrowed to, or empty for all of them. */
  folder: string;
  onFolder: (folder: string) => void;
  /** Saved views, and the one being looked through. */
  collections: Collection[];
  collection: string;
  onCollection: (id: string) => void;
  onSaveCollection: (name: string) => void;
  onForgetCollection: (id: string) => void;
  onOpen: (id: string) => void;
  onToggleFavourite: (id: string) => void;
  onTrash: (id: string) => void;
  onRestore: (id: string) => void;
  onDeleteForever: (id: string) => void;
  onAdd: () => void;
  /** Open today's journal page, making it if today has not been written in. */
  onToday: () => void;
  /** Hand the whole room over as an Obsidian vault. */
  onExportVault: () => void;
  /** Take Markdown -- one file, several, or a zipped vault -- back in. */
  onImportVault: (files: FileList) => void;
  /** What the vault is doing right now, said out loud, or empty when idle. */
  vaultBusy?: string;
}) {
  const [query, setQuery] = useState('');
  const [confirming, setConfirming] = useState('');
  const [naming, setNaming] = useState('');

  // THE PAGES IN THIS PLACE, before any filter. The folder and tag chips are
  // drawn from these rather than from the whole room: an empty Journal showed
  // "Romans study 1" above the words "Your journal has not been started",
  // offering to narrow a list of nothing to a page that was not in it.
  const inPlace = useMemo(() => entries
    .filter((e) => (view === 'trash' ? e.trashed : !e.trashed))
    .filter((e) => (view === 'favourites' ? e.favorite : true))
    .filter((e) => (view === 'journal' ? Boolean(e.journalDate) : true)), [entries, view]);
  const tags = useMemo(() => tagsAcross(inPlace), [inPlace]);
  const folders = useMemo(() => foldersAcross(inPlace), [inPlace]);
  const looking = collections.find((c) => c.id === collection) ?? null;

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return inPlace
      .filter((e) => !tag || hasTag(e, tag))
      .filter((e) => !folder || e.folder.toLowerCase() === folder.toLowerCase())
      // A SAVED VIEW IS A FILTER LIKE ANY OTHER, applied in the same pass. It
      // is not a separate list to keep in step: the pages in a collection were
      // never put there, so writing a new page that matches puts it in.
      .filter((e) => !looking || matchesCollection(e, looking))
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
  }, [inPlace, view, query, tag, folder, looking]);

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

  const place = PLACES.find((p) => p.id === view) ?? PLACES[0];
  const howMany = view === 'all' ? counts.all
    : view === 'favourites' ? counts.favourites
      : view === 'journal' ? counts.journal
        : counts.trash;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-5 md:px-8 md:pt-8">
      {/* THE LARGE TITLE, as Apple opens every list. On a phone it names the
          room, because the bar above no longer has room to; on a wider screen
          the sidebar names the room and this names the place within it. */}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="sr-title">
            <span className="md:hidden">Study Room</span>
            <span className="hidden md:inline">{place.label}</span>
          </h1>
          <p className="sr-subtitle mt-1">
            {howMany === 0 ? 'Nothing here yet'
              : howMany === 1 ? '1 page' : `${howMany} pages`}
          </p>
        </div>
        {view !== 'trash' && (
          <button
            type="button"
            onClick={view === 'journal' ? onToday : onAdd}
            // BESIDE THE TITLE ON A WIDE SCREEN, IN THE BAR ON A PHONE. At 390px
            // the two did not fit on one line and "Study Room" broke in half.
            className="tap-sm hidden shrink-0 items-center gap-1.5 rounded-full bg-navy px-5 text-[17px] font-semibold text-white shadow-sm hover:bg-navy-700 md:inline-flex"
          >
            <PlusGlyph size={18} />
            {view === 'journal' ? "Today's page" : 'New page'}
          </button>
        )}
      </div>

      {walkthrough && (
        <p className="sr-note mt-4">
          This is the walkthrough, so nothing you write here is saved anywhere.
          In the real app it is kept in your church&rsquo;s own database.
        </p>
      )}

      {/* THE FOUR PLACES, ON A PHONE: a segmented control rather than a row of
          56px pills that ran off the side of the screen. Wider screens have
          the sidebar instead. Before the list in the page's order as well as
          on the screen, so the first control called Bin or Starred is always
          the place and never a star or a bin on somebody's page. */}
      <nav aria-label="Places in your study room" className="mt-5 md:hidden">
        <div className="sr-seg">
          {PLACES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => onView(id)}
              aria-current={view === id ? 'true' : undefined}
              className="tap-sm"
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <label className="sr-search mt-4">
        <SearchGlyph size={19} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          // SHORT, SO IT IS NEVER CUT OFF. "Search your pages" came out as
          // "Search your" beside the old New page button on a phone. The full
          // sentence is still what a screen reader hears.
          placeholder="Search"
          aria-label="Search your pages"
        />
      </label>

      {/* FOLDERS: THE PLACES SOMEBODY PUT THINGS. A folder is what a person
          decides; a tag is what a page is about; a collection is a question.
          All three are rows of capsules for the same reason, which is that a
          sidebar is somewhere a phone does not have. Each row scrolls sideways
          inside itself, out to the edge of a phone as Apple's do. */}
      {view !== 'trash' && folders.length > 0 && (
        <div
          role="group"
          aria-label="Folders in this room"
          className="thin-scroll -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0"
        >
          <button
            type="button"
            onClick={() => onFolder('')}
            aria-pressed={!folder}
            className="sr-chip tap-sm"
          >
            <span className="sr-chip-face">Every folder</span>
          </button>
          {folders.map((f) => {
            const on = folder.toLowerCase() === f.folder.toLowerCase();
            return (
              <button
                key={f.folder}
                type="button"
                onClick={() => onFolder(on ? '' : f.folder)}
                aria-pressed={on}
                className="sr-chip tap-sm"
              >
                <span className="sr-chip-face">
                  <FolderGlyph size={16} />
                  {f.folder}
                  <span className="sr-chip-count">{f.count}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* SAVED VIEWS. A collection is not a place and holds nothing: it is the
          question "everything tagged Romans that mentions grace", kept so
          nobody retypes it. Write a page tomorrow that matches and it is in. */}
      {view !== 'trash' && (collections.length > 0 || tag || query.trim()) && (
        <div className="mt-2">
          <div
            role="group"
            aria-label="Saved views"
            className="thin-scroll -mx-4 flex items-center gap-2 overflow-x-auto px-4 py-0.5 md:mx-0 md:px-0"
          >
            {collections.map((c) => (
              <span key={c.id} className="sr-chip-pair" data-on={collection === c.id ? 'true' : undefined}>
                <button
                  type="button"
                  onClick={() => onCollection(collection === c.id ? '' : c.id)}
                  aria-pressed={collection === c.id}
                >
                  <SearchGlyph size={15} />
                  {c.name}
                </button>
                <button
                  type="button"
                  onClick={() => onForgetCollection(c.id)}
                  aria-label={`Forget the saved view ${c.name}`}
                  title={`Forget the saved view ${c.name}`}
                >
                  <CloseGlyph size={14} />
                </button>
              </span>
            ))}

            {/* THE OFFER APPEARS WHEN THERE IS SOMETHING WORTH SAVING, and not
                before. A Save button over an unfiltered list saves "everything",
                which is the shelf. */}
            {(tag || query.trim()) && !collection && !naming && (
              <button
                type="button"
                onClick={() => setNaming(nameForView(tag ? [tag] : [], query))}
                className="sr-chip tap-sm"
              >
                <span className="sr-chip-face text-navy">
                  <PlusGlyph size={15} />
                  Save this view
                </span>
              </button>
            )}
          </div>

          {naming && (
            <div className="sr-group mt-2 p-4">
              <p className="text-[17px] font-semibold">Name this view</p>
              <p className="sr-row-meta mt-1">
                It keeps the question, not the pages. A page you write next week
                that matches it will be in here without you doing anything.
              </p>
              <label className="sr-search mt-3">
                <input
                  value={naming}
                  onChange={(e) => setNaming(e.target.value)}
                  maxLength={40}
                  aria-label="Name for this saved view"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => { onSaveCollection(naming); setNaming(''); }}
                  className="tap-sm rounded-full bg-navy px-5 text-[17px] font-semibold text-white"
                >
                  Save it
                </button>
                <button
                  type="button"
                  onClick={() => setNaming('')}
                  className="tap-sm rounded-full px-4 text-[17px] font-medium text-navy hover:bg-navy/5"
                >
                  Not now
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* THE TAGS IN THIS ROOM, AS A ROW RATHER THAN A SIDEBAR. AFFiNE puts them
          down the side, which works on a laptop and is where the sidebar
          already is on a phone: nowhere. A row reads the same at 360px as at
          1440px, and there is only one of it to keep right. */}
      {view !== 'trash' && tags.length > 0 && (
        <div
          role="group"
          aria-label="Narrow these pages to one tag"
          className="thin-scroll -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0"
        >
          <button
            type="button"
            onClick={() => onTag('')}
            aria-pressed={!tag}
            className="sr-chip tap-sm"
          >
            <span className="sr-chip-face">Every tag</span>
          </button>
          {tags.map((t) => {
            const on = tag.toLowerCase() === t.tag.toLowerCase();
            return (
              <button
                key={t.tag}
                type="button"
                onClick={() => onTag(on ? '' : t.tag)}
                aria-pressed={on}
                className="sr-chip tap-sm"
              >
                <span className="sr-chip-face">
                  <TagGlyph size={15} />
                  {t.tag}
                  <span className="sr-chip-count">{t.count}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {shown.length === 0 && (
        <div className="sr-group mt-6 px-6 py-10 text-center">
          <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-navy/5 text-navy">
            {view === 'trash' ? <TrashGlyph size={26} />
              : view === 'journal' ? <CalendarGlyph size={26} />
                : view === 'favourites' ? <StarGlyph size={26} />
                  : tag || query ? <SearchGlyph size={26} /> : <DocGlyph size={26} />}
          </span>
          <p className="text-xl font-semibold">
            {view === 'trash' ? 'Nothing in the bin'
              : view === 'journal' ? 'Your journal has not been started'
                : view === 'favourites' ? 'No starred pages yet'
                  : tag ? `No pages tagged ${tag}`
                    : query ? 'Nothing matches that'
                      : 'Your study room is empty'}
          </p>
          <p className="sr-row-meta mx-auto mt-1 max-w-sm">
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
              className="tap-sm mt-5 rounded-full bg-navy px-6 text-[17px] font-semibold text-white"
            >
              Start today&rsquo;s page
            </button>
          )}
        </div>
      )}

      {groups.map((group) => (
        <section key={group.name} className="mt-7">
          <h2 className="sr-group-head">
            {group.name} <span className="font-normal opacity-70">· {group.entries.length}</span>
          </h2>
          <ul aria-label={`Pages: ${group.name}`} className="sr-group">
            {group.entries.map((entry) => (
              <li key={entry.id}>
                <div className="flex items-start gap-1 py-2 pl-4 pr-2">
                  <div className="min-w-0 flex-1 py-1">
                    <button
                      type="button"
                      onClick={() => (entry.trashed ? onRestore(entry.id) : onOpen(entry.id))}
                      className="sr-row-open block w-full"
                    >
                      <span className={`sr-row-title block truncate ${entry.named ? '' : 'italic'}`}>
                        {entry.title}
                      </span>
                      <span className="sr-row-meta mt-0.5 line-clamp-2">
                        <time>
                          {entry.journalDate
                            ? `${dayInWords(entry.journalDate)} · ${whenWritten(entry.updated)}`
                            : whenWritten(entry.updated)}
                        </time>
                        {'  '}
                        {entry.preview || 'Nothing written on this page yet.'}
                      </span>
                    </button>

                    {/* A TAG ON A ROW IS ALSO THE WAY TO SEE THE REST OF THEM.
                        Outside the row's own button, because a button inside
                        a button is not a thing a browser will render, and a tag
                        nobody can press is decoration. */}
                    {!entry.trashed && (entry.folder || entry.tags.length > 0) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {entry.folder && (
                          <button
                            type="button"
                            onClick={() => onFolder(
                              folder.toLowerCase() === entry.folder.toLowerCase() ? '' : entry.folder,
                            )}
                            aria-label={`Show every page in ${entry.folder}`}
                            className="sr-mini sr-mini--folder"
                          >
                            <FolderGlyph size={13} />
                            {entry.folder}
                          </button>
                        )}
                        {entry.tags.map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => onTag(tag.toLowerCase() === t.toLowerCase() ? '' : t)}
                            aria-label={`Show every page tagged ${t}`}
                            className="sr-mini sr-mini--tag"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    )}

                    {entry.trashed && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onRestore(entry.id)}
                          className="tap-sm inline-flex items-center gap-1.5 rounded-full px-3 text-[15px] font-semibold text-navy ring-1 ring-navy/15 hover:bg-navy/5"
                        >
                          <RestoreGlyph size={16} />
                          Put it back
                        </button>
                        {confirming === entry.id ? (
                          <>
                            <span className="text-[15px]">Delete it for good?</span>
                            <button
                              type="button"
                              onClick={() => { setConfirming(''); onDeleteForever(entry.id); }}
                              className="tap-sm rounded-full bg-white px-4 text-[15px] font-bold text-red-700 ring-1 ring-red-200"
                            >
                              Yes, delete forever
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirming('')}
                              className="tap-sm rounded-full px-3 text-[15px] font-semibold text-navy hover:bg-navy/5"
                            >
                              Keep it
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirming(entry.id)}
                            className="tap-sm rounded-full bg-white px-4 text-[15px] font-bold text-red-700 ring-1 ring-red-200"
                          >
                            Delete forever
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* STAR AND BIN AT THE END OF THE ROW, where Apple puts what
                      can be done to an item. They were a line of their own
                      under every page, which doubled the height of the list for
                      two controls nobody came to the shelf to press. Still one
                      tap each and never behind a menu -- a menu on a phone is a
                      tap to find out there were two things in it. And the bin
                      is still not a delete: the page waits there, and the
                      irreversible step lives in the bin, behind a question. */}
                  {!entry.trashed && (
                    <div className="flex shrink-0 items-center">
                      <button
                        type="button"
                        onClick={() => onToggleFavourite(entry.id)}
                        aria-pressed={entry.favorite}
                        aria-label={entry.favorite
                          ? `Remove ${entry.title} from starred pages`
                          : `Star ${entry.title}`}
                        title={entry.favorite ? 'Starred' : 'Star this page'}
                        className="sr-icon-btn tap-sm"
                      >
                        <StarGlyph size={21} filled={entry.favorite} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onTrash(entry.id)}
                        // "Move to bin" FIRST, then the page. Walks and screen
                        // readers alike look for the words, and the name of the
                        // page after them is what tells ten of these apart.
                        aria-label={`Move to bin: ${entry.title}`}
                        title="Move to bin"
                        className="sr-icon-btn tap-sm"
                      >
                        <TrashGlyph size={20} />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* OBSIDIAN, AND WHY IT IS ON THIS SCREEN RATHER THAN IN A SETTINGS ONE.
          What somebody writes in this room is theirs -- the same argument
          components/LiveExport.tsx makes about the church's own roster. A room
          you can only read inside one website is a room somebody is renting,
          and the moment to notice you can take a copy is while you are looking
          at the pages, not three menus away. Quiet, though: at the foot of the
          list as its own small group, not two more buttons beside New page. */}
      {view !== 'trash' && (
        <section className="mt-9">
          <h2 className="sr-group-head">Your pages, anywhere</h2>
          <ul className="sr-group">
            <li>
              <button
                type="button"
                onClick={onExportVault}
                disabled={!!vaultBusy}
                className="sr-action disabled:opacity-60"
              >
                <span className="sr-action-icon"><DownloadGlyph size={17} /></span>
                <span className="min-w-0 flex-1 py-2">
                  <span className="block">Take a copy for Obsidian</span>
                  <span className="sr-row-meta block">Every page as Markdown, pictures and all</span>
                </span>
              </button>
            </li>
            <li>
              <label className="sr-action min-h-[56px] cursor-pointer">
                <span className="sr-action-icon"><UploadGlyph size={17} /></span>
                <span className="min-w-0 flex-1 py-2">
                  <span className="block">Bring in Markdown</span>
                  <span className="sr-row-meta block">One file, several, or a zipped vault</span>
                </span>
                <input
                  type="file"
                  multiple
                  accept=".md,.markdown,.zip,text/markdown,application/zip"
                  className="sr-only"
                  aria-label="Bring in Markdown or a zipped vault"
                  onChange={(e) => {
                    if (e.target.files?.length) onImportVault(e.target.files);
                    // Cleared so choosing the same file twice still counts as a
                    // change, which is the whole reason a second import appears to
                    // do nothing.
                    e.target.value = '';
                  }}
                />
              </label>
            </li>
          </ul>
          {vaultBusy && <p aria-live="polite" className="sr-subtitle mt-2 px-4">{vaultBusy}</p>}
        </section>
      )}
    </div>
  );
}

export default StudyShelf;
