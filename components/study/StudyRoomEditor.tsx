'use client';

// The study room: a workspace of pages, and the editor for one of them.
//
// ---------------------------------------------------------------------------
// THIS FILE IS THE HEAVIEST THING IN THE APPLICATION, and that number is why it
// is shaped the way it is. Measured, minified, in a browser: this chunk gzips
// to about 800 kB against roughly 540 kB for the whole of the rest of the app.
// Most people using this are on a phone on Philippine mobile data.
//
// So it is loaded by exactly one screen, on demand, and never by anybody else.
// components/study/StudyRoom.tsx is the only importer and it uses next/dynamic
// with ssr:false, which is what keeps this out of the shared bundle. Importing
// it anywhere else silently puts a megabyte on every screen in the app, and
// tests/the-study-room-is-paid-for-on-arrival.mjs is there to stop that.
//
// WHY IT LOOKS LIKE PLUMBING. BlockSuite gives you the pieces of an editor
// rather than an editor: there is no drop-in component at this version, because
// @blocksuite/presets stopped at 0.19.5 while @blocksuite/affine is at 0.22.4.
// What follows is the minimum assembly, taken from their own playground: the
// block registrations, a store manager, a view manager, a standard scope, and
// Lit rendering the result into a plain div.
//
// The import below has no bindings on purpose. It registers roughly a hundred
// custom elements as a side effect, and it is the whole reason paragraphs,
// lists and everything else exist. Deleting it leaves an editor that renders
// nothing and reports no error.
// ---------------------------------------------------------------------------

import '@blocksuite/affine/effects';

// THE EDITOR SHIPS NO COLOURS OF ITS OWN. Every BlockSuite stylesheet is
// written against `var(--affine-text-primary-color)` and about two hundred
// siblings, and nothing in the package defines them -- AFFiNE's own app does,
// in this file. Without it every one of those variables resolves to nothing and
// each rule silently falls back to whatever it inherits.
import '@toeverything/theme/style.css';
import './study-room.css';

import { useCallback, useEffect, useRef, useState } from 'react';
import { BlockStdScope, TextSelection } from '@blocksuite/affine/std';
import { render } from 'lit';
import type { DocMeta } from '@blocksuite/store';
import type { DocSource } from '@blocksuite/sync';

import { StudyWorkspace } from '@/lib/study/workspace';
import { studyStoreManager, studyViewManager } from '@/lib/study/extensions';
import { previewFrom, readShelf, type ShelfEntry, type ShelfMeta } from '@/lib/study/shelf';
import type { Troubled } from '@/lib/study/doc-source';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { humanError } from '@/lib/live/errors';
import { StudyShelf, type ShelfView } from '@/components/study/StudyShelf';
import { StudyWorkspaceShell } from '@/components/study/StudyWorkspaceShell';

/** One room per person. The id is stable so the same room reopens every time. */
const WORKSPACE = 'study-room';

/**
 * The page a room made before rooms could have more than one.
 *
 * KEPT AS A LITERAL ON PURPOSE. Every room already in the database has its
 * writing in a page with exactly this id, created back when the room was one
 * page and the id was hard-coded. Generating a fresh id for the first page of a
 * new room would be tidier and would also mean that every Explorer who already
 * has a room opens it to find their notes gone -- still stored, still safe,
 * simply not the page being shown.
 */
const FIRST_PAGE = 'page-1';

/** How long after somebody stops typing the shelf is brought up to date. */
const SETTLE_MS = 1200;

export function StudyRoomEditor({ makeSource, demo = false, onExit }: {
  makeSource: () => DocSource;
  demo?: boolean;
  onExit: () => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const workspace = useRef<StudyWorkspace | null>(null);
  const synced = useRef(false);

  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  // AN UNREACHED ROOM IS NOT AN EMPTY ONE, and telling them apart is the whole
  // point of this flag. See where it is set.
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // NOT SAVED IS NOT THE SAME AS NOT WORKING, and neither is worth hiding.
  const [trouble, setTrouble] = useState('');

  const [entries, setEntries] = useState<ShelfEntry[]>([]);
  const [openPage, setOpenPage] = useState('');
  const [view, setView] = useState<ShelfView>('all');
  const [titleDraft, setTitleDraft] = useState('');

  const refresh = useCallback(() => {
    const meta = workspace.current?.meta;
    if (meta) setEntries(readShelf(meta));
  }, []);

  // -------------------------------------------------------------------------
  // OPENING THE ROOM. Once per mount, and never again when somebody changes
  // page: the workspace holds the sync engine and every page in the room, so
  // tearing it down to look at a different page would re-download the lot.
  // -------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    setStalled(false);
    setNotice('');
    setError('');
    setTrouble('');
    setReady(false);

    (async () => {
      try {
        // BUILT HERE, NOT IN THE CALLER'S RENDER. The live source needs a
        // database client, and asking for one throws when the app is not
        // connected yet. Thrown during render that is not an error anybody
        // sees -- it is a component that renders nothing.
        //
        // A SOURCE THAT CANNOT SAVE MUST BE ABLE TO SAY SO. DocEngine swallows
        // whatever a source throws and retries quietly, which is right for a
        // dropped packet and wrong for a room that will never save again.
        const source = makeSource() as DocSource & Troubled;
        source.onTrouble = (cause) => {
          if (cancelled) return;
          setTrouble(cause === null
            ? ''
            : humanError(cause, 'Your writing is not reaching the database.'));
        };
        const room = new StudyWorkspace({ id: WORKSPACE, docSource: source });
        workspace.current = room;
        room.storeExtensions = studyStoreManager().get('store');
        room.start();

        // WAITING FOR THE DATABASE MUST NOT BE ABLE TO STOP THE ROOM OPENING.
        // This used to be a bare `await waitForSynced()`, which resolves at
        // once against the tutorial's in-memory source and can hang against the
        // live one -- and when it hung, nothing after it ever ran: no editor,
        // no error, an empty white room.
        const arrived = await Promise.race([
          room.waitForSynced().then(() => true),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8000)),
        ]);
        if (cancelled) return;
        synced.current = arrived;

        // INITIALISE AFTER THE WAIT, NEVER BEFORE IT, and this order is a bug
        // that would have cost somebody their pages. `initialize()` means "if
        // this room has no page list, give it an empty one". Run before the
        // database answers, a room that HAS pages looks like a room that has
        // none, so it writes an empty list -- and when the real list arrives,
        // two clients have set the same key concurrently and Yjs keeps one.
        // Measured: a room seeded with two stored pages came back with one.
        room.meta.initialize();

        if (room.meta.docMetas.length === 0) {
          if (!arrived) {
            setStalled(true);
            return;
          }
          room.createDoc(FIRST_PAGE);
        }

        room.slots.docListUpdated.subscribe(() => {
          if (!cancelled) refresh();
        });

        refresh();
        setReady(true);
        if (!arrived) {
          setNotice('Your saved pages are taking a while to arrive. What is here '
            + 'is yours to read, but give it a moment before you rely on new '
            + 'writing being kept.');
        }
      } catch (cause) {
        if (!cancelled) setError(humanError(cause, 'The study room could not be opened.'));
      }
    })();

    return () => {
      cancelled = true;
      const room = workspace.current;
      workspace.current = null;
      // Written work first, then teardown. forceStop loses whatever has not
      // reached the database, so it is the last resort rather than the exit.
      void room?.waitForGracefulStop().finally(() => {
        room?.forceStop();
        room?.dispose();
      });
    };
  }, [makeSource, attempt, refresh]);

  // -------------------------------------------------------------------------
  // SHOWING ONE PAGE. Runs again whenever the open page changes, and only this
  // part runs: the room, its sync engine and every other page stay as they are.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const room = workspace.current;
    if (!ready || !openPage || !room || !host.current) return;
    let cancelled = false;
    let settle: ReturnType<typeof setTimeout> | undefined;

    try {
      const doc = room.getDoc(openPage) ?? room.createDoc(openPage);
      doc.load();
      const store = doc.getStore();

      if (!store.root && synced.current) {
        const rootId = store.addBlock('affine:page', {});
        const noteId = store.addBlock('affine:note', {}, rootId);
        store.addBlock('affine:paragraph', {}, noteId);
      }

      if (!store.root) {
        setStalled(true);
        return;
      }

      const std = new BlockStdScope({ store, extensions: studyViewManager().get('page') });
      render(std.render(), host.current);

      // WHAT THE SHELF SHOWS COMES FROM HERE, and it has to, because every page
      // is a separate document that must be fetched before a word of it can be
      // read. A shelf of twenty pages would be twenty round trips before it
      // could draw one preview line. So the page writes its own summary as it
      // is edited, and the list costs nothing to draw.
      const summarise = () => {
        const text = store
          .getBlocksByFlavour(['affine:paragraph', 'affine:list'])
          .map((block) => String((block.model as { text?: unknown }).text ?? ''))
          .join(' ');
        room.meta.setDocMeta(openPage, {
          updatedDate: Date.now(),
          preview: previewFrom(text),
        } as Partial<DocMeta>);
      };

      // AFTER THEY STOP, NOT ON EVERY KEYSTROKE. The summary lives in the
      // workspace document, which syncs; writing it per character would push
      // the whole page list to the database on every letter somebody types.
      const onEdit = () => {
        clearTimeout(settle);
        settle = setTimeout(() => { if (!cancelled) summarise(); }, SETTLE_MS);
      };
      doc.spaceDoc.on('update', onEdit);

      // A PAGE WITH NOTHING IN IT HAS TO STILL LOOK LIKE A PAGE. An untouched
      // page is one empty paragraph, and BlockSuite draws its placeholder only
      // while the caret is inside the block -- so with no caret there is no
      // placeholder and no toolbar: a white rectangle, which is exactly what a
      // broken page looks like. This was reported as broken three times.
      requestAnimationFrame(() => {
        if (cancelled) return;
        const blocks = store.getBlocksByFlavour('affine:paragraph');
        const first = blocks[0];
        if (blocks.length !== 1 || !first || (first.model.text?.length ?? 0) > 0) return;
        std.selection.setGroup('note', [
          std.selection.create(TextSelection, {
            from: { blockId: first.id, index: 0, length: 0 },
            to: null,
          }),
        ]);
      });

      return () => {
        cancelled = true;
        clearTimeout(settle);
        doc.spaceDoc.off('update', onEdit);
        // Leaving a page brings the shelf up to date at once rather than a
        // second later, so the list somebody lands on is already right.
        summarise();
      };
    } catch (cause) {
      setError(humanError(cause, 'That page could not be opened.'));
      return () => { cancelled = true; clearTimeout(settle); };
    }
  }, [ready, openPage]);

  // -------------------------------------------------------------------------
  // KEEPING PAGES
  // -------------------------------------------------------------------------
  const setMeta = useCallback((id: string, props: Partial<ShelfMeta>) => {
    workspace.current?.meta.setDocMeta(id, props as Partial<DocMeta>);
    refresh();
  }, [refresh]);

  const addPage = useCallback(() => {
    const room = workspace.current;
    if (!room) return;
    try {
      const made = room.createDoc();
      refresh();
      setTitleDraft('');
      setOpenPage(made.id);
    } catch (cause) {
      setError(humanError(cause, 'A new page could not be added.'));
    }
  }, [refresh]);

  const open = useCallback((id: string) => {
    const meta = workspace.current?.meta.getDocMeta(id);
    setTitleDraft((meta?.title ?? '').trim());
    setOpenPage(id);
  }, []);

  const current = entries.find((e) => e.id === openPage);
  const counts = {
    all: entries.filter((e) => !e.trashed).length,
    favourites: entries.filter((e) => e.favorite && !e.trashed).length,
    trash: entries.filter((e) => e.trashed).length,
  };

  const shellBody = () => {
    if (error) {
      return (
        <div className="mx-auto max-w-2xl p-4">
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">{error}</p>
        </div>
      );
    }
    if (stalled) {
      return (
        <div className="mx-auto max-w-2xl p-4">
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
            <p className="font-semibold">Your study room did not answer.</p>
            <p className="mt-1">
              Nothing has been lost. Your pages are in the church&rsquo;s database and
              this device simply could not reach them just now. It is usually the
              connection.
            </p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="tap mt-3 rounded-xl bg-navy px-5 text-base font-semibold text-white"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    if (!ready) {
      return (
        <div className="grid h-full place-items-center">
          <BeaconSpinner inline label="Opening your study room" />
        </div>
      );
    }
    if (!openPage) {
      return (
        <>
          {demo && (
            <div className="mx-auto max-w-3xl px-4 pt-4">
              <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                This is the walkthrough, so nothing you write here is saved
                anywhere. In the real app it is kept in your church&rsquo;s own
                database.
              </p>
            </div>
          )}
          <StudyShelf
            entries={entries}
            view={view}
            onOpen={open}
            onAdd={addPage}
            onToggleFavourite={(id) => {
              const was = entries.find((e) => e.id === id)?.favorite ?? false;
              setMeta(id, { favorite: !was });
            }}
            onTrash={(id) => setMeta(id, { trashedAt: Date.now() })}
            onRestore={(id) => setMeta(id, { trashedAt: undefined })}
            onDeleteForever={(id) => {
              workspace.current?.removeDoc(id);
              refresh();
            }}
          />
        </>
      );
    }
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-4">
        {trouble && (
          <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
            <span className="font-semibold">Not saved yet.</span> {trouble} Keep this
            page open; it keeps trying, and what you have written is still here.
          </p>
        )}
        {notice && (
          <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
            {notice}
          </p>
        )}
        {/* THE TITLE IS PART OF THE PAGE, not a setting hidden behind a menu.
            It is the first thing in AFFiNE's own document view and the first
            thing somebody wants to write when they start a study. */}
        <input
          value={titleDraft}
          onChange={(e) => setTitleDraft(e.target.value)}
          onBlur={() => setMeta(openPage, { title: titleDraft.trim() })}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          maxLength={80}
          placeholder="Name this page"
          aria-label="Name this page"
          className="mb-2 w-full bg-transparent text-2xl font-bold text-navy outline-none placeholder:text-gray-300"
        />
        <div ref={host} className="affine-page-viewport" />
      </div>
    );
  };

  return (
    <StudyWorkspaceShell
      view={view}
      onView={setView}
      counts={counts}
      onExit={onExit}
      onHome={() => setOpenPage('')}
      showingPage={Boolean(openPage)}
      pageTitle={current?.title ?? 'Study Room'}
    >
      {shellBody()}
    </StudyWorkspaceShell>
  );
}

export default StudyRoomEditor;
