'use client';

// The study room: a workspace of pages, and the editor for one of them.
//
// ---------------------------------------------------------------------------
// THE ROOM IS LIGHT AND THE EDITOR IS HEAVY, and keeping those two facts apart
// is the shape of this file. The full AFFiNE feature set -- the canvas, the
// databases, the embeds, the code highlighter's WebAssembly -- is over a
// megabyte gzipped. The list of pages needs none of it.
//
// So nothing here imports the drawing half at the top. `lib/study/effects.ts`
// and `lib/study/view-extensions.ts` are fetched with `await import(...)` at
// the moment somebody opens a page, which is the moment they have asked for an
// editor. Opening the room itself pays for the schema and this screen, and the
// page list appears while the editor is still arriving.
//
// AND THE WHOLE THING IS STILL BEHIND ONE ROUTE. components/study/StudyRoom.tsx
// is the only importer and uses next/dynamic with ssr:false. Importing this
// anywhere else silently puts the editor on every screen in the app, and
// tests/the-study-room-is-paid-for-on-arrival.mjs is there to stop that.
//
// WHY IT LOOKS LIKE PLUMBING. BlockSuite gives you the pieces of an editor
// rather than an editor: there is no drop-in component at this version, because
// @blocksuite/presets stopped at 0.19.5 while @blocksuite/affine is at 0.22.4.
// What follows is the minimum assembly, taken from their own playground: the
// block registrations, a store manager, a view manager, a standard scope, and
// Lit rendering the result into a plain div.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from 'react';
import { BlockStdScope, TextSelection } from '@blocksuite/affine/std';
import { render } from 'lit';
import type { DocMeta, Store } from '@blocksuite/store';
import type { BlobSource, DocSource } from '@blocksuite/sync';

import { StudyWorkspace } from '@/lib/study/workspace';
import { giveTheGuideOnce } from '@/lib/study/getting-started';
import { studyStoreManager } from '@/lib/study/extensions';
import {
  dayInWords, dayKey, journalFor, previewFrom, readShelf, tagsAcross,
  type ShelfEntry, type ShelfMeta,
} from '@/lib/study/shelf';
import type { Troubled } from '@/lib/study/doc-source';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { humanError } from '@/lib/live/errors';
import { StudyShelf, type ShelfView } from '@/components/study/StudyShelf';
import { StudyInsertBar, type InsertKind } from '@/components/study/StudyInsertBar';
import { StudyTags } from '@/components/study/StudyTags';
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

export function StudyRoomEditor({ makeSource, makeBlobs, demo = false, onExit }: {
  makeSource: () => DocSource;
  /** Where pictures and files are kept. Left out, they stay in the tab. */
  makeBlobs?: () => BlobSource;
  demo?: boolean;
  onExit: () => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const workspace = useRef<StudyWorkspace | null>(null);
  const synced = useRef(false);
  // Held so the insert bar can put a block where the caret is.
  const editing = useRef<{ std: BlockStdScope; store: Store } | null>(null);

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
  const [tag, setTag] = useState('');
  // PAGE OR WHITEBOARD, the switch beside the title in AFFiNE's own app. Two
  // ways of looking at ONE page rather than two kinds of page: the same blocks,
  // laid out in a column or placed on a canvas.
  const [mode, setMode] = useState<'page' | 'edgeless'>('page');
  // THE EDITOR IS ON ITS WAY. Only true while the chunk is being fetched, and
  // it is the difference between a blank rectangle and a page that says it is
  // coming -- which is what a blank rectangle was reported as, three times.
  const [drawing, setDrawing] = useState(false);
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
        const room = new StudyWorkspace({
          id: WORKSPACE,
          docSource: source,
          blobSource: makeBlobs?.(),
        });
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

        // THE GETTING STARTED PAGE, ONCE PER ROOM AND NEVER AGAIN. The rule
        // lives in lib/study/getting-started.ts rather than here, because it
        // cannot be checked from a browser: the only room a walk can reach is
        // the walkthrough's, which forgets its pages on reload, so deleting the
        // guide and reloading correctly gets it back and proves nothing.
        giveTheGuideOnce(room, arrived);

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
  }, [makeSource, makeBlobs, attempt, refresh]);

  // -------------------------------------------------------------------------
  // SHOWING ONE PAGE. Runs again whenever the open page changes, and only this
  // part runs: the room, its sync engine and every other page stay as they are.
  // -------------------------------------------------------------------------
  useEffect(() => {
    const room = workspace.current;
    if (!ready || !openPage || !room) return;
    let cancelled = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let letGo: (() => void) | undefined;
    setDrawing(true);

    (async () => {
    try {
      // THE EDITOR IS FETCHED HERE, not at the top of the file, and this line
      // is the whole reason the room opens quickly. Everything AFFiNE can draw
      // arrives now, because now is when somebody asked to write.
      const [, { studyViewManager }] = await Promise.all([
        import('@/lib/study/effects'),
        import('@/lib/study/view-extensions'),
      ]);
      if (cancelled || !host.current) return;

      const doc = room.getDoc(openPage) ?? room.createDoc(openPage);
      doc.load();
      const store = doc.getStore();

      if (!store.root && synced.current) {
        const rootId = store.addBlock('affine:page', {});
        store.addBlock('affine:surface', {}, rootId);
        const noteId = store.addBlock('affine:note', {}, rootId);
        store.addBlock('affine:paragraph', {}, noteId);
      }

      if (!store.root) {
        setStalled(true);
        return;
      }

      // A WHITEBOARD NEEDS A CANVAS TO DRAW ON, and every page written before
      // today was written by a version of this room that had no canvas in it.
      // Without this, switching to the whiteboard on an older page renders
      // nothing at all and says nothing about why.
      if (store.getBlocksByFlavour('affine:surface').length === 0) {
        try { store.addBlock('affine:surface', {}, store.root.id); } catch { /* read-only */ }
      }

      const std = new BlockStdScope({ store, extensions: studyViewManager().get(mode) });
      editing.current = { std, store };
      render(std.render(), host.current);
      setDrawing(false);

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

      letGo = () => {
        doc.spaceDoc.off('update', onEdit);
        // Leaving a page brings the shelf up to date at once rather than a
        // second later, so the list somebody lands on is already right.
        summarise();
      };
    } catch (cause) {
      if (!cancelled) setError(humanError(cause, 'That page could not be opened.'));
    }
    })();

    // THE CLEANUP IS SYNCHRONOUS THOUGH THE WORK IS NOT, which is the one thing
    // an async effect gets wrong. React takes the function this returns now, so
    // it cannot be the one the await produces later: `letGo` is filled in when
    // the editor is up, and leaving before that simply has nothing to undo.
    return () => {
      cancelled = true;
      clearTimeout(settle);
      letGo?.();
    };
  }, [ready, openPage, mode]);

  // -------------------------------------------------------------------------
  // KEEPING PAGES
  // -------------------------------------------------------------------------
  /**
   * Put a block on the page, where the caret is.
   *
   * WHAT THE SLASH MENU DOES, WITHOUT NEEDING A `/` KEY. A phone's on-screen
   * keyboard sends composition events rather than keydowns, so the character
   * arrives and BlockSuite's menu never hears the keystroke that opens it.
   * This does the same job from a button: work out which block the caret is in,
   * and add the new one immediately after it.
   */
  const insert = useCallback((kind: InsertKind) => {
    const current = editing.current;
    if (!current) return;
    const { std, store } = current;

    const recipes: Record<InsertKind, { flavour: string; props: Record<string, unknown> }> = {
      h1: { flavour: 'affine:paragraph', props: { type: 'h1' } },
      h2: { flavour: 'affine:paragraph', props: { type: 'h2' } },
      h3: { flavour: 'affine:paragraph', props: { type: 'h3' } },
      quote: { flavour: 'affine:paragraph', props: { type: 'quote' } },
      bulleted: { flavour: 'affine:list', props: { type: 'bulleted' } },
      numbered: { flavour: 'affine:list', props: { type: 'numbered' } },
      todo: { flavour: 'affine:list', props: { type: 'todo' } },
      divider: { flavour: 'affine:divider', props: {} },
      table: { flavour: 'affine:table', props: {} },
      callout: { flavour: 'affine:callout', props: {} },
    };

    try {
      const recipe = recipes[kind];
      const selected = std.selection.find(TextSelection);
      const focused = selected ? store.getBlock(selected.from.blockId) : null;
      const parent = focused
        ? store.getParent(focused.model)
        : store.getBlocksByFlavour('affine:note')[0]?.model ?? null;
      if (!parent) return;

      // AFTER THE BLOCK SOMEBODY IS IN, not at the end of the page. Appending
      // to the bottom is the behaviour that makes a person scroll to find what
      // they just added, on the screen with the least room to scroll.
      const index = focused
        ? parent.children.findIndex((child) => child.id === focused.model.id) + 1
        : undefined;

      const id = store.addBlock(recipe.flavour, recipe.props, parent, index);

      // AND THE CARET GOES INTO IT. A divider has nowhere to type, so the caret
      // stays where it was rather than disappearing into a line.
      if (recipe.flavour !== 'affine:divider') {
        requestAnimationFrame(() => {
          std.selection.setGroup('note', [
            std.selection.create(TextSelection, {
              from: { blockId: id, index: 0, length: 0 },
              to: null,
            }),
          ]);
        });
      }
    } catch (cause) {
      setError(humanError(cause, 'That could not be added to the page.'));
    }
  }, []);

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
    // EVERY PAGE OPENS AS A PAGE. Carrying the whiteboard over from the last
    // one means somebody who tried the canvas once meets it again on a page
    // they only wanted to read.
    setMode('page');
    setOpenPage(id);
  }, []);

  /**
   * Today's page in the journal, made if today has not been written in yet.
   *
   * IT FINDS BEFORE IT MAKES, and that is the whole feature. A Today button
   * that started a fresh page every time it was pressed would give somebody
   * four pages for one morning and no way to tell which one had the thing they
   * wrote first. The day is matched on `journalDate` rather than on the title,
   * so renaming today's page to "Prayer meeting" keeps it as today's page.
   */
  const openToday = useCallback(() => {
    const room = workspace.current;
    if (!room) return;
    const key = dayKey();
    const already = journalFor(readShelf(room.meta), key);
    if (already) { open(already.id); return; }
    try {
      const made = room.createDoc();
      room.meta.setDocMeta(made.id, {
        title: dayInWords(key),
        journalDate: key,
      } as Partial<DocMeta>);
      refresh();
      setTitleDraft(dayInWords(key));
      setOpenPage(made.id);
    } catch (cause) {
      setError(humanError(cause, "Today's page could not be started."));
    }
  }, [open, refresh]);

  const current = entries.find((e) => e.id === openPage);
  const knownTags = tagsAcross(entries).map((t) => t.tag);
  const counts = {
    all: entries.filter((e) => !e.trashed).length,
    favourites: entries.filter((e) => e.favorite && !e.trashed).length,
    journal: entries.filter((e) => e.journalDate && !e.trashed).length,
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
            tag={tag}
            onTag={setTag}
            onOpen={open}
            onAdd={addPage}
            onToday={openToday}
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
        {/* THE SAME SWITCH AFFiNE PUTS BESIDE THE TITLE. Page is the document;
            whiteboard is the same page on an infinite canvas, with shapes,
            connectors, a pen and mindmaps. Nothing is copied between them
            because there is nothing to copy: it is one page. */}
        <div role="group" aria-label="How to look at this page" className="mb-3 flex gap-2">
          {([['page', 'Page'], ['edgeless', 'Whiteboard']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${
                mode === id ? 'bg-navy text-white ring-navy' : 'bg-white text-navy ring-black/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'page' && (
          <>
            <StudyTags
              tags={current?.tags ?? []}
              known={knownTags}
              onChange={(next) => setMeta(openPage, { tags: next })}
            />
            <StudyInsertBar onInsert={insert} />
          </>
        )}
        {drawing && (
          <div className="grid place-items-center py-12">
            <BeaconSpinner inline label="Opening this page" />
          </div>
        )}
        <div
          ref={host}
          // THE CANVAS HAS TO BE GIVEN A HEIGHT. A page viewport grows with its
          // writing; an edgeless one is a window onto something with no size of
          // its own, so with `height: auto` it renders as a nought-pixel strip
          // and looks exactly like a feature that does not work.
          // `dvh` AS WELL AS `vh`, because a phone's `vh` is measured against a
          // window that includes the browser's own bars: the canvas would run
          // under the address bar and the bottom of it would never be reachable.
          className={mode === 'edgeless'
            ? 'affine-edgeless-viewport h-[70vh] [height:70dvh] overflow-hidden rounded-2xl ring-1 ring-black/10'
            : 'affine-page-viewport'}
        />
      </div>
    );
  };

  return (
    <StudyWorkspaceShell
      view={view}
      // MOVING SOMEWHERE ELSE DROPS THE TAG. A filter left on across a change
      // of place is how somebody lands in the Bin, sees nothing, and concludes
      // the app lost their pages.
      onView={(next) => { setView(next); setTag(''); }}
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
