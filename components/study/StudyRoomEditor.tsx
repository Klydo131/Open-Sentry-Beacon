'use client';

// The study room: a workspace of pages, and the editor for one of them.
//
// The page list is light and the editor (BlockSuite/AFFiNE, over a megabyte)
// is heavy, so the editor's modules are loaded with `await import(...)` only
// when a page is opened. This file is imported only by
// components/study/StudyRoom.tsx through next/dynamic (ssr: false); importing
// it anywhere else puts the editor on every screen
// (tests/the-study-room-is-paid-for-on-arrival.mjs).
//
// BlockSuite ships pieces rather than an editor at this version, so this is
// the minimum assembly from its playground: block registrations, a store
// manager, a view manager, a standard scope, and Lit rendering into a div.

import { useCallback, useEffect, useRef, useState } from 'react';
import { BlockStdScope, TextSelection } from '@blocksuite/affine/std';
import { render } from 'lit';
import { Text, type DocMeta, type Store } from '@blocksuite/store';
import type { BlobSource, DocSource } from '@blocksuite/sync';

import { StudyWorkspace, type SaveState } from '@/lib/study/workspace';
import { giveTheGuideOnce } from '@/lib/study/getting-started';
import { studyStoreManager } from '@/lib/study/extensions';
import {
  cleanFolder, dayInWords, dayKey, foldersAcross, journalFor, nameForView,
  previewFrom, readShelf, tagsAcross,
  type Collection, type ShelfEntry, type ShelfMeta,
} from '@/lib/study/shelf';
import { STUDY_ROOM, type SupabaseDocSource } from '@/lib/study/doc-source';
import { forgetWhatWasMissed, rememberToForget } from '@/lib/study/local-source';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { BoardGlyph, DocGlyph } from '@/components/Glyph';
import { humanError } from '@/lib/live/errors';
import {
  toVaultFile, parseVaultFile, vaultFilenames, zipVault, unzipVault,
  linksToTitles, folderOf, journalDateOf, safeName,
  picturesAsEmbeds, embedsAsPictures, picturesWanted, ASSET_FOLDER,
  type VaultFile,
} from '@/lib/study/obsidian';
import { markdownFromPage, markdownIntoPage, type PageAsset } from '@/lib/study/vault-io';
import { StudyShelf, type ShelfView } from '@/components/study/StudyShelf';
import { StudyInsertBar, type InsertKind } from '@/components/study/StudyInsertBar';
import { StudyFiling } from '@/components/study/StudyFiling';
import { StudyBoardTools } from '@/components/study/StudyBoardTools';
import type { BoardApi } from '@/lib/study/board-actions';
import { StudyWorkspaceShell } from '@/components/study/StudyWorkspaceShell';
import { useStudyMode } from '@/components/WritingMode';
import { Ribbon } from '@/components/study/StudyFurniture';

/** How long after somebody stops typing the shelf is brought up to date. */
const SETTLE_MS = 1200;

/** How long a page may take to arrive before the page (not the room) says so. */
const PAGE_WAIT_MS = 15_000;

/**
 * Where a room's pages and pictures are kept, in the order they are used:
 * this device's copy first, the church's database behind it
 * (components/study/StudyRoom.tsx builds this).
 */
export type StudySources = {
  docs: DocSource;
  shadows: DocSource[];
  blobs?: BlobSource;
  shadowBlobs: BlobSource[];
  /** The church's database, wherever it sits above. Null in the walkthrough. */
  remote: SupabaseDocSource | null;
  /** Whether this device keeps a copy. */
  onDevice: boolean;
};

const wait = (ms: number) => new Promise<false>((resolve) => setTimeout(() => resolve(false), ms));

export function StudyRoomEditor({ makeSources, ownerId, demo = false, onExit }: {
  makeSources: () => Promise<StudySources>;
  ownerId: string;
  demo?: boolean;
  onExit: () => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const workspace = useRef<StudyWorkspace | null>(null);
  const remote = useRef<SupabaseDocSource | null>(null);
  const onDevice = useRef(false);
  // Held so the insert bar can put a block where the caret is.
  const editing = useRef<{ std: BlockStdScope; store: Store } | null>(null);

  // TWO KINDS OF TROUBLE, KEPT APART. `fatal` is the room itself not opening,
  // and takes the screen with a way to try again. Everything else -- a block
  // that would not insert, an export that failed -- is a `hiccup`: a line
  // above the room that goes away, never in place of it. Both used to be one
  // `error` that replaced the whole room and stayed until it was reloaded.
  const [fatal, setFatal] = useState('');
  const [hiccup, setHiccup] = useState('');
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  // Set when the room could not be reached, as opposed to being empty.
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Saving trouble, shown to the person rather than hidden.
  const [trouble, setTrouble] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('saving');
  // One page that has not arrived yet: said on the page, with its own retry.
  const [pageMissing, setPageMissing] = useState(false);
  const [pageAttempt, setPageAttempt] = useState(0);
  useEffect(() => {
    if (!hiccup) return;
    const t = setTimeout(() => setHiccup(''), 9000);
    return () => clearTimeout(t);
  }, [hiccup]);

  const [entries, setEntries] = useState<ShelfEntry[]>([]);
  const [openPage, setOpenPage] = useState('');
  const [view, setView] = useState<ShelfView>('all');
  // SIMPLE OR ADVANCED (components/study/StudyModeSwitch.tsx).
  const simple = useStudyMode() === 'simple';
  const [tag, setTag] = useState('');
  const [folder, setFolder] = useState('');
  const [collection, setCollection] = useState('');
  const [collections, setCollections] = useState<Collection[]>([]);
  // Page or whiteboard: two views of the same page.
  const [mode, setMode] = useState<'page' | 'edgeless'>('page');
  // Back to Simple clears Advanced-only filters and views, so nothing stays
  // hidden with no control to undo it.
  useEffect(() => {
    if (!simple) return;
    setTag('');
    setFolder('');
    setCollection('');
    setView((v) => (v === 'favourites' || v === 'journal' ? 'all' : v));
  }, [simple]);
  // True while the editor chunk is loading, so the page says it is coming.
  const [drawing, setDrawing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  // The title textarea grows with its words; re-measured on input and on resize.
  const titleBox = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const fit = () => {
      const el = titleBox.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  });
  // WHAT THE ROOM ADDS TO A WHITEBOARD (components/study/StudyBoardTools.tsx):
  // Undo, Redo and the right-click menu, given the board's actions once a page
  // is turned into a whiteboard. Its tools and the bar over a selected thing
  // are AFFiNE's own.
  const [boardApi, setBoardApi] = useState<BoardApi | null>(null);
  const boardFrame = useRef<HTMLDivElement | null>(null);
  // THE NAME IS KEPT AS IT IS TYPED, not only when the box loses focus: a name
  // typed and then the room closed straight away used to be lost.
  const titleFor = useRef('');
  useEffect(() => {
    const page = titleFor.current;
    if (!page) return;
    const t = setTimeout(() => {
      const meta = workspace.current?.meta.getDocMeta(page) as ShelfMeta | undefined;
      if (meta && (meta.title ?? '') !== titleDraft.trim()) {
        workspace.current?.meta.setDocMeta(page, { title: titleDraft.trim() } as Partial<DocMeta>);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [titleDraft]);

  const refresh = useCallback(() => {
    const meta = workspace.current?.meta;
    if (!meta) return;
    setEntries(readShelf(meta));
    setCollections(meta.collections);
  }, []);

  // --- Opening the room: once per mount, not per page (the workspace holds
  // the sync engine and every page) ---
  useEffect(() => {
    let cancelled = false;
    let stopSaveState: (() => void) | undefined;
    setStalled(false);
    setNotice('');
    setFatal('');
    setTrouble('');
    setReady(false);

    (async () => {
      try {
        // Built here, not during render: the live sources need a database
        // client, and a throw during render would silently render nothing.
        const sources = await makeSources();
        if (cancelled) return;
        remote.current = sources.remote;
        onDevice.current = sources.onDevice;
        // The database says when it cannot be reached (DocEngine retries
        // silently). With a copy on this device that is not a loss, only a
        // delay, and the save line says so; without one it is the warning.
        if (sources.remote) {
          sources.remote.onTrouble = (cause) => {
            if (cancelled) return;
            setTrouble(cause === null ? '' : humanError(cause, 'Your writing is not reaching the database.'));
          };
        }
        const room = new StudyWorkspace({
          id: STUDY_ROOM,
          docSource: sources.docs,
          shadowSources: sources.shadows,
          blobSource: sources.blobs,
          shadowBlobs: sources.shadowBlobs,
        });
        workspace.current = room;
        room.storeExtensions = studyStoreManager().get('store');
        room.start();

        // THIS DEVICE'S COPY FIRST, which is there at once and works with no
        // signal. (Without a copy this is the database, and the race is what
        // stops a slow connection from keeping the room shut.)
        const fromFirst = await Promise.race([room.waitForMain().then(() => true), wait(8000)]);
        if (cancelled) return;

        // A DEVICE THAT HAS NEVER HELD THIS ROOM KNOWS NOTHING ABOUT IT, and an
        // empty list here is not an empty room. So it waits for the database's
        // page list before deciding, as the room always has; a device that
        // already holds the room does not wait for anything.
        const heldHere = room.meta.docMetas.length > 0 || room.meta.guided;
        const listKnown = heldHere
          || await Promise.race([room.waitForRemoteList().then(() => true), wait(12_000)]);
        if (cancelled) return;

        // Initialise after the wait: before it, a room with pages looks empty and an
        // empty page list would be written over the real one.
        room.meta.initialize();

        if (room.meta.docMetas.length === 0) {
          if (!listKnown) {
            setStalled(true);
            return;
          }
          // A NEW ID, NEVER A FIXED ONE. Every room's first page used to be
          // `page-1`, so a room emptied by "Delete forever" and then given a
          // new first page pulled the deleted page's writing straight back.
          room.createDoc();
        }

        // Add the Getting Started page once per room (lib/study/getting-started.ts).
        giveTheGuideOnce(room, listKnown);

        room.slots.docListUpdated.subscribe(() => {
          if (!cancelled) refresh();
        });
        stopSaveState = room.onSaveState(() => { if (!cancelled) setSaveState(room.saveState()); });
        setSaveState(room.saveState());

        refresh();
        setReady(true);
        if (!fromFirst) {
          setNotice('Your saved pages are taking a while to arrive. What is here '
            + 'is yours to read, but give it a moment before you rely on new '
            + 'writing being kept.');
        }
        // A page deleted while offline is deleted from the database now.
        if (sources.remote) void forgetWhatWasMissed(ownerId, sources.remote);
      } catch (cause) {
        if (!cancelled) setFatal(humanError(cause, 'The study room could not be opened.'));
      }
    })();

    return () => {
      cancelled = true;
      stopSaveState?.();
      const room = workspace.current;
      workspace.current = null;
      // Let unsaved work reach the database before tearing down.
      void room?.waitForGracefulStop().finally(() => {
        room?.forceStop();
        room?.dispose();
      });
    };
  }, [makeSources, ownerId, attempt, refresh]);

  // --- Showing one page: re-runs when the open page changes ---
  useEffect(() => {
    const room = workspace.current;
    if (!ready || !openPage || !room) return;
    let cancelled = false;
    let settle: ReturnType<typeof setTimeout> | undefined;
    let letGo: (() => void) | undefined;
    setDrawing(true);

    (async () => {
    try {
      // The editor is fetched here, when somebody opens a page.
      const [, { studyViewExtensions, whenAffineBarShows }] = await Promise.all([
        import('@/lib/study/effects'),
        import('@/lib/study/view-extensions'),
      ]);
      if (cancelled || !host.current) return;

      const doc = room.getDoc(openPage) ?? room.createDoc(openPage);
      doc.load();
      // This page jumps the queue; the others follow behind it.
      room.putFirst(openPage);
      const store = doc.getStore();
      // THE UNDO HISTORY IS STARTED. BlockSuite starts a store's extensions in
      // `store.load()`, which the room never calls (it loads the doc), so the
      // history never listened to itself, `canUndo` stayed false for good, and
      // Ctrl+Z (which AFFiNE runs only when `canUndo`) did nothing on any page
      // or board. Found 27 October 2026 by the whiteboard's own Undo
      // (tests/e2e/the-whiteboard-says-what-you-can-do.js).
      //
      // ONLY THE HISTORY, NOT `store.load()`. That was tried first, and it also
      // announces "root added", on which AFFiNE's page block copies its own
      // title into the page's record. The room keeps the name only in the
      // record, so that copied an empty title over it, and a page could lose its
      // name by being opened (tests/e2e/the-room-goes-in-and-out-of-obsidian.js
      // caught it). Starting the history twice is safe: its listeners are a set.
      store.history.loaded();

      // A PAGE THAT HAS NOT ARRIVED YET IS NOT A BLANK PAGE, AND NOT A ROOM
      // THAT FAILED. On a device that has never held the room, pages come from
      // the database one after another; a room of forty pages used to wait
      // eight seconds for all of them and then call the room unreachable when
      // somebody opened the thirtieth. Now the page waits for itself, and only
      // the page says so if it does not come.
      if (!store.root) {
        const db = remote.current;
        const answered = () => !db || db.answered.has(openPage) || room.everythingLoaded();
        if (!answered()) {
          await Promise.race([
            new Promise<void>((resolve) => {
              const check = () => { if (store.root || answered()) { stop(); resolve(); } };
              const stopAnswer = db?.whenAnswered(check);
              doc.spaceDoc.on('update', check);
              const stop = () => { stopAnswer?.(); doc.spaceDoc.off('update', check); };
            }),
            wait(PAGE_WAIT_MS),
          ]);
          if (cancelled) return;
        }
        // A NEW PAGE'S SKELETON IS NOT SOMETHING ANYBODY DID, so it is made
        // outside the undo history. Made inside it (as from 27 October 2026,
        // when the history was started above), enough presses of Undo on a new
        // page took the page itself apart: its writing, its canvas and its
        // root, and the board threw "reading 'children'". Found 28 October
        // 2026 by tests/e2e/the-whiteboard-says-what-you-can-do.js.
        if (!store.root && answered()) {
          store.withoutTransact(() => {
            const rootId = store.addBlock('affine:page', {});
            store.addBlock('affine:surface', {}, rootId);
            const noteId = store.addBlock('affine:note', {}, rootId);
            store.addBlock('affine:paragraph', {}, noteId);
          });
        }
      }

      if (!store.root) {
        setDrawing(false);
        setPageMissing(true);
        return;
      }
      setPageMissing(false);

      // Older pages have no canvas; add one so the whiteboard view works, and,
      // like a new page's skeleton, not as a step Undo would take back.
      if (store.getBlocksByFlavour('affine:surface').length === 0) {
        try { store.withoutTransact(() => { store.addBlock('affine:surface', {}, store.root!.id); }); } catch { /* read-only */ }
      }

      const std = new BlockStdScope({ store, extensions: studyViewExtensions(mode) });
      editing.current = { std, store };
      render(std.render(), host.current);
      setDrawing(false);

      // While AFFiNE's bar over a selection is open, the room's insert bar
      // steps back so the bar is never drawn underneath it
      // (lib/study/view-extensions.ts, whenAffineBarShows, says why).
      const screen = host.current.closest<HTMLElement>('.sr');
      const stopBar = whenAffineBarShows(std, (open) => {
        if (!screen) return;
        if (open) screen.dataset.affineBar = 'open';
        else delete screen.dataset.affineBar;
      });

      // The whiteboard's actions reach into AFFiNE's canvas packages, which a
      // page never needs: loaded only when the page is a whiteboard.
      if (mode === 'edgeless') {
        const { boardApi: makeBoard } = await import('@/lib/study/board-actions');
        if (!cancelled) setBoardApi(makeBoard(std));
      }

      // Each page writes its own summary for the page list, so the list never has to
      // fetch every page.
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

      // Summarise after typing stops, not per keystroke (the summary syncs).
      const onEdit = () => {
        clearTimeout(settle);
        settle = setTimeout(() => { if (!cancelled) summarise(); }, SETTLE_MS);
      };
      doc.spaceDoc.on('update', onEdit);

      // An empty page shows no placeholder until it has the caret, so place the
      // caret in it; otherwise it looks broken.
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
        stopBar();
        if (screen) delete screen.dataset.affineBar;
        setBoardApi(null);
        doc.spaceDoc.off('update', onEdit);
        // Leaving a page updates the list at once.
        summarise();
      };
    } catch (cause) {
      if (!cancelled) {
        setDrawing(false);
        setHiccup(humanError(cause, 'That page could not be opened.'));
      }
    }
    })();

    // The cleanup must be returned synchronously; `letGo` is filled in once the editor is up.
    return () => {
      cancelled = true;
      clearTimeout(settle);
      letGo?.();
    };
  }, [ready, openPage, mode, pageAttempt]);

  // --- Inserting blocks ---
  /**
   * Insert a block after the one with the caret. Phone keyboards send
   * composition events, so BlockSuite's "/" menu never opens there; this does
   * the same job from a button.
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
      // Today's date, written out, as its own line: a journal's first line.
      date: {
        flavour: 'affine:paragraph',
        props: {
          type: 'text',
          text: new Text(new Date().toLocaleDateString(undefined, {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
          })),
        },
      },
    };

    try {
      const recipe = recipes[kind];
      const selected = std.selection.find(TextSelection);
      const focused = selected ? store.getBlock(selected.from.blockId) : null;
      const parent = focused
        ? store.getParent(focused.model)
        : store.getBlocksByFlavour('affine:note')[0]?.model ?? null;
      if (!parent) return;

      // After the block being edited, not at the end of the page.
      const index = focused
        ? parent.children.findIndex((child) => child.id === focused.model.id) + 1
        : undefined;

      const id = store.addBlock(recipe.flavour, recipe.props, parent, index);

      // Then put the caret in it (a divider has nowhere to type).
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
      setHiccup(humanError(cause, 'That could not be added to the page.'));
    }
  }, []);

  /**
   * Pictures chosen from the insert bar, put on the page after the line with
   * the caret: AFFiNE's own image blocks, kept with the page's other files.
   */
  const addPictures = useCallback(async (files: File[]) => {
    const current = editing.current;
    if (!current || !files.length) return;
    const { std, store } = current;
    try {
      const selected = std.selection.find(TextSelection);
      const target = (selected ? store.getBlock(selected.from.blockId)?.model : null)
        ?? store.getBlocksByFlavour('affine:note')[0]?.model.children.at(-1)
        ?? null;
      if (!target) return;
      const { addSiblingImageBlocks } = await import('@blocksuite/affine/blocks/image');
      await addSiblingImageBlocks(std, files, target, 'after');
    } catch (cause) {
      setHiccup(humanError(cause, 'That picture could not be added to the page.'));
    }
  }, []);

  const setMeta = useCallback((id: string, props: Partial<ShelfMeta>) => {
    workspace.current?.meta.setDocMeta(id, props as Partial<DocMeta>);
    refresh();
  }, [refresh]);

  // --- Obsidian ---
  // Export: every page not in the trash becomes a Markdown file in its folder,
  // with tags in front matter. Import: Markdown files or a zipped vault become
  // pages. `vaultBusy` is the message shown; `vaultWorking` is whether a copy is
  // in flight (the message stays up after the work ends).
  const [vaultBusy, setVaultBusy] = useState('');
  const vaultWorking = useRef(false);

  const exportVault = useCallback(async () => {
    const room = workspace.current;
    if (!room || vaultWorking.current) return;
    vaultWorking.current = true;
    setVaultBusy('Getting your pages together…');
    try {
      const living = readShelf(room.meta).filter((e) => !e.trashed);
      const titleOf = new Map(living.map((e) => [e.id, e.title]));
      const paths = vaultFilenames(living);
      const files: VaultFile[] = [];
      // One picture used on several pages is one file in the vault.
      const pictures = new Map<string, Uint8Array>();

      for (const entry of living) {
        const doc = room.getDoc(entry.id);
        if (!doc) continue;
        doc.load();
        const { markdown, assets } = await markdownFromPage(doc.getStore());
        for (const asset of assets) pictures.set(asset.name, asset.bytes);
        files.push({
          path: paths.get(entry.id) ?? `${safeName(entry.title)}.md`,
          // Links are written by title, so they resolve in Obsidian.
          text: toVaultFile({
            id: entry.id,
            title: entry.title,
            tags: entry.tags,
            folder: entry.folder,
            journalDate: entry.journalDate,
            created: entry.created,
            updated: entry.updated,
            markdown: picturesAsEmbeds(linksToTitles(markdown, (id) => titleOf.get(id))),
          }),
        });
      }

      for (const [name, bytes] of pictures) {
        files.push({ path: `${ASSET_FOLDER}/${name}`, bytes });
      }

      if (!files.length) {
        setVaultBusy('');
        setHiccup('There are no pages to take a copy of yet.');
        return;
      }

      const bytes = zipVault(files);
      const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `study-room-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke later: revoking at once cancels the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      const pages = files.length - pictures.size;
      setVaultBusy(`${pages} page${pages === 1 ? '' : 's'}`
        + (pictures.size ? ` and ${pictures.size} picture${pictures.size === 1 ? '' : 's'}` : '')
        + ' saved.');
      setTimeout(() => setVaultBusy(''), 4000);
    } catch (cause) {
      setVaultBusy('');
      setHiccup(humanError(cause, 'That copy could not be made.'));
    } finally {
      vaultWorking.current = false;
    }
  }, []);

  const importVault = useCallback(async (chosen: FileList) => {
    const room = workspace.current;
    if (!room || vaultWorking.current) return;
    vaultWorking.current = true;
    setVaultBusy('Reading what you chose…');
    try {
      // A zip is unpacked; a .md is itself; anything else is ignored.
      const incoming: Array<{ path: string; text: string }> = [];
      const unreadable: string[] = [];
      // Pictures by bare filename, as notes refer to them.
      const pictures = new Map<string, Uint8Array>();
      const isPicture = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

      for (const file of Array.from(chosen)) {
        if (/\.zip$/i.test(file.name)) {
          const { files, skipped } = unzipVault(new Uint8Array(await file.arrayBuffer()));
          for (const f of files) {
            if (/\.(md|markdown)$/i.test(f.path)) incoming.push({ path: f.path, text: f.text ?? '' });
            else if (isPicture.test(f.path) && f.bytes) {
              pictures.set(f.path.split('/').pop() ?? f.path, f.bytes);
            }
          }
          unreadable.push(...skipped.filter((p) => /\.(md|markdown)$/i.test(p)));
        } else if (/\.(md|markdown)$/i.test(file.name)) {
          incoming.push({ path: file.name, text: await file.text() });
        } else if (isPicture.test(file.name)) {
          pictures.set(file.name, new Uint8Array(await file.arrayBuffer()));
        }
      }

      if (!incoming.length) {
        setVaultBusy('');
        setHiccup(unreadable.length
          ? 'That vault is compressed in a way this cannot read yet. Zipping the folder without compression will work.'
          : 'There was no Markdown in what you chose.');
        return;
      }

      let made = 0;
      for (const file of incoming) {
        const parsed = parseVaultFile(file.text);
        const name = file.path.split('/').pop() ?? file.path;
        const doc = room.createDoc();
        doc.load();
        // Only the pictures this note asks for.
        const wanted: PageAsset[] = picturesWanted(parsed.body)
          .map((name) => ({ name, bytes: pictures.get(name) }))
          .filter((p): p is PageAsset => !!p.bytes);
        await markdownIntoPage(doc.getStore(), embedsAsPictures(parsed.body), wanted);
        setMeta(doc.id, {
          title: parsed.title || name.replace(/\.(md|markdown)$/i, ''),
          tags: parsed.tags,
          folder: folderOf(file.path),
          journalDate: parsed.journalDate || journalDateOf(file.path),
        });
        made += 1;
        setVaultBusy(`Bringing in ${made} of ${incoming.length}…`);
      }

      refresh();
      setVaultBusy(`${made} page${made === 1 ? '' : 's'} brought in.`);
      setTimeout(() => setVaultBusy(''), 4000);
    } catch (cause) {
      setVaultBusy('');
      setHiccup(humanError(cause, 'Those pages could not be brought in.'));
    } finally {
      vaultWorking.current = false;
    }
  }, [refresh, setMeta]);

  const addPage = useCallback(() => {
    const room = workspace.current;
    if (!room) return;
    try {
      const made = room.createDoc();
      refresh();
      titleFor.current = made.id;
      setTitleDraft('');
      // A new page goes into the folder being viewed.
      if (folder) setMeta(made.id, { folder });
      setOpenPage(made.id);
    } catch (cause) {
      setHiccup(humanError(cause, 'A new page could not be added.'));
    }
    // `folder` and `setMeta` are dependencies, or a new page lands in a stale folder.
  }, [refresh, folder, setMeta]);

  const open = useCallback((id: string) => {
    const meta = workspace.current?.meta.getDocMeta(id) as ShelfMeta | undefined;
    titleFor.current = id;
    setTitleDraft((meta?.title ?? '').trim());
    // Every page opens as a page, never the whiteboard.
    setMode('page');
    setOpenPage(id);
  }, []);

  /** Today's journal page: found by its date if it exists, made if not. */
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
      titleFor.current = made.id;
      setTitleDraft(dayInWords(key));
      setOpenPage(made.id);
    } catch (cause) {
      setHiccup(humanError(cause, "Today's page could not be started."));
    }
  }, [open, refresh]);

  const current = entries.find((e) => e.id === openPage);
  const knownTags = tagsAcross(entries).map((t) => t.tag);
  const knownFolders = foldersAcross(entries).map((f) => f.folder);
  const counts = {
    all: entries.filter((e) => !e.trashed).length,
    favourites: entries.filter((e) => e.favorite && !e.trashed).length,
    journal: entries.filter((e) => e.journalDate && !e.trashed).length,
    trash: entries.filter((e) => e.trashed).length,
  };

  // Changing place clears every filter, so nobody lands on an empty view.
  const changePlace = (next: ShelfView) => {
    setView(next); setTag(''); setFolder(''); setCollection('');
  };

  const shellBody = () => {
    if (fatal) {
      return (
        <div className="mx-auto max-w-xl px-4 pt-10">
          <div className="sr-group px-6 py-8 text-center">
            <p className="sr-note sr-note--trouble text-left">{fatal}</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="tap-sm mt-5 rounded-full bg-navy px-6 text-[17px] font-semibold text-white"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    if (stalled) {
      return (
        <div className="mx-auto max-w-xl px-4 pt-10">
          <div className="sr-group px-6 py-8 text-center">
            <p className="text-xl font-semibold">Your study room did not answer.</p>
            <p className="sr-row-meta mt-2">
              Nothing has been lost. Your pages are in the church&rsquo;s database and
              this device simply could not reach them just now. It is usually the
              connection.
            </p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="tap-sm mt-5 rounded-full bg-navy px-6 text-[17px] font-semibold text-white"
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
          <StudyShelf
            entries={entries}
            view={view}
            onView={changePlace}
            counts={counts}
            walkthrough={demo}
            tag={tag}
            onTag={setTag}
            folder={folder}
            onFolder={setFolder}
            collections={collections}
            collection={collection}
            onCollection={setCollection}
            onSaveCollection={(name) => {
              const room = workspace.current;
              if (!room) return;
              room.meta.saveCollection({
                // A timestamp is enough of an id here.
                id: `view-${Date.now()}`,
                name: cleanFolder(name) || nameForView(tag ? [tag] : [], ''),
                tags: tag ? [tag] : [],
                words: '',
              });
              refresh();
            }}
            onForgetCollection={(id) => {
              workspace.current?.meta.removeCollection(id);
              if (collection === id) setCollection('');
              refresh();
            }}
            onOpen={open}
            onAdd={addPage}
            onToday={openToday}
            onExportVault={exportVault}
            onImportVault={importVault}
            vaultBusy={vaultBusy}
            onToggleFavourite={(id) => {
              const was = entries.find((e) => e.id === id)?.favorite ?? false;
              setMeta(id, { favorite: !was });
            }}
            onTrash={(id) => setMeta(id, { trashedAt: Date.now() })}
            onRestore={(id) => setMeta(id, { trashedAt: undefined })}
            onDeleteForever={async (id) => {
              const room = workspace.current;
              if (!room) return;
              const missed = await room.deleteForever(id);
              refresh();
              if (missed.length) {
                // Gone from the list and this device; the database is told
                // the next time the room opens with a connection.
                rememberToForget(ownerId, id);
                setHiccup('Deleted from this device. It will also be removed from your church\u2019s '
                  + 'database the next time the room opens with a connection.');
              }
            }}
          />
        </>
      );
    }
    // A reading column for a page; the whole window for the whiteboard.
    const board = mode === 'edgeless';
    return (
      <div
        className={board
          ? 'flex flex-col px-3 pb-3 pt-4 md:px-5'
          : 'mx-auto w-full max-w-[46rem] px-4 pt-6 md:px-8 md:pt-10'}
        // The window height less the bar's.
        style={board ? { height: 'calc(100% - var(--sr-bar-h))' } : undefined}
      >
        {trouble && !onDevice.current && (
          <p className="sr-note sr-note--trouble mb-4">
            <span>
              <span className="font-semibold">Not saved yet.</span> {trouble} Keep this
              page open; it keeps trying, and what you have written is still here.
            </span>
          </p>
        )}
        {notice && <p className="sr-note mb-4">{notice}</p>}

        {/* A SHEET OF PAPER for a page; the whiteboard keeps the whole window. */}
        <div className={board ? 'contents' : 'sr-paper'}>
        {!board && <Ribbon className="sr-paper-ribbon" />}
        {/* The title is part of the page and wraps; Return still means done. */}
        <textarea
          ref={titleBox}
          value={titleDraft}
          rows={1}
          onChange={(e) => setTitleDraft(e.target.value.replace(/\n/g, ' '))}
          onBlur={() => setMeta(openPage, { title: titleDraft.trim() })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); }
          }}
          maxLength={80}
          placeholder="Name this page"
          aria-label="Name this page"
          className={`sr-page-title ${board ? 'md:!text-[24px]' : ''}`}
        />
        <SaveLine state={saveState} demo={demo} onDevice={onDevice.current} />

        {/* WRITE OR WHITEBOARD: one page, two views, for everybody. It was
            Advanced only until 27 October 2026, when drawing was asked to be
            something a five-year-old can find. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div role="group" aria-label="How to look at this page" className="sr-seg sr-seg--inline">
            {([['page', 'Write', DocGlyph], ['edgeless', 'Whiteboard', BoardGlyph]] as const).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                aria-pressed={mode === id}
                className="tap-sm"
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Filing, behind one button that says what it is for
            (components/study/StudyFiling.tsx). Advanced only, as before. */}
        {!board && !simple && (
          <StudyFiling
            folder={current?.folder ?? ''}
            knownFolders={knownFolders}
            onFolder={(next) => setMeta(openPage, { folder: cleanFolder(next) || undefined })}
            tags={current?.tags ?? []}
            knownTags={knownTags}
            onTags={(next) => setMeta(openPage, { tags: next })}
          />
        )}

        {/* The insert bar sits above the writing and sticks under the navigation bar
           (see .sr-formatbar). */}
        {/* A direct child of the column: a sticky element only sticks within its parent. */}
        {!board && <StudyInsertBar onInsert={insert} onPicture={addPictures} simple={simple} />}

        {drawing && (
          <div className="grid place-items-center py-12">
            <BeaconSpinner inline label="Opening this page" />
          </div>
        )}
        {pageMissing && (
          <div className="sr-group mt-6 px-6 py-8 text-center" role="status">
            <p className="text-lg font-semibold">This page has not arrived yet.</p>
            <p className="sr-row-meta mt-2">
              It is in your church&rsquo;s database and this device has not fetched it
              yet, usually because the connection is slow. Nothing has been lost.
            </p>
            <button
              type="button"
              onClick={() => { setPageMissing(false); setPageAttempt((n) => n + 1); }}
              className="tap-sm mt-5 rounded-full bg-navy px-6 text-[17px] font-semibold text-white"
            >
              Try again
            </button>
          </div>
        )}
        {/* The board's frame holds the canvas and the room's Undo, Redo and
            menu over it (components/study/StudyBoardTools.tsx); for a page it
            is `contents`, so the page lays out exactly as before. */}
        <div
          ref={boardFrame}
          className={board ? 'relative mt-3 flex min-h-[360px] flex-1 flex-col' : 'contents'}
          data-board-frame={board ? '' : undefined}
        >
          <div
            ref={host}
            // The canvas needs a definite height (an auto height renders 0px), at least
            // 360px; `relative` anchors its absolutely positioned toolbar to the board.
            className={board
              ? 'affine-edgeless-viewport sr-board-frame relative min-h-[360px] flex-1 overflow-hidden rounded-2xl bg-white shadow-[0_0_0_0.5px_rgba(26,34,51,0.12),0_1px_3px_rgba(16,24,40,0.06)]'
              : 'affine-page-viewport min-h-[40vh] [min-height:40dvh] pb-6'}
          />
          {board && <StudyBoardTools api={boardApi} frame={boardFrame} />}
        </div>
        </div>

      </div>
    );
  };

  return (
    <StudyWorkspaceShell
      view={view}
      onView={changePlace}
      counts={counts}
      onExit={onExit}
      onHome={() => setOpenPage('')}
      showingPage={Boolean(openPage)}
      pageTitle={current?.title ?? 'Study Room'}
      action={!ready || view === 'trash' ? undefined
        : view === 'journal' ? { label: "Today's page", onClick: openToday }
          : { label: 'New page', onClick: addPage }}
    >
      {hiccup && (
        <div className="sticky top-2 z-30 mx-auto mt-2 w-full max-w-[46rem] px-4" role="alert">
          <p className="sr-note sr-note--trouble sr-hiccup">
            <span className="min-w-0 flex-1">{hiccup}</span>
            <button type="button" onClick={() => setHiccup('')} className="sr-hiccup-close tap-sm" aria-label="Dismiss this message">
              OK
            </button>
          </p>
        </div>
      )}
      {shellBody()}
    </StudyWorkspaceShell>
  );
}

/**
 * Where the writing on this page is, in a few quiet words under its title.
 *
 * ASKED FOR AS "smooth". Smooth writing is writing you never have to wonder
 * about: the line says when it is with the church, and when it is only on this
 * device and waiting for a connection, which is not a fault and is not drawn
 * as one.
 */
function SaveLine({ state, demo, onDevice }: { state: SaveState; demo: boolean; onDevice: boolean }) {
  const text = demo
    ? 'Practice room: nothing here is kept.'
    : state === 'saved' ? (onDevice ? 'Saved, on this device and with your church.' : 'Saved with your church.')
      : state === 'waiting' ? 'Kept on this device. It reaches your church when the connection is back.'
        : 'Saving\u2026';
  return (
    <p className="sr-save-line" data-save-state={demo ? 'practice' : state} aria-live="polite">
      <span aria-hidden className={`sr-save-dot sr-save-dot--${demo ? 'practice' : state}`} />
      {text}
    </p>
  );
}

export default StudyRoomEditor;
