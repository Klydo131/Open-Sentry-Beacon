'use client';

// The study room's editor. Nothing else in the app may import this file.
//
// ---------------------------------------------------------------------------
// THIS FILE IS 3.25 MB GZIPPED, and that number is why it is shaped the way it
// is. Measured, minified, in a browser: the editor alone is roughly six times
// the entire rest of this application, which gzips to about 0.54 MB. Most
// people using this app are on a phone on Philippine mobile data.
//
// So it is loaded by exactly one screen, on demand, and never by anybody else.
// components/study/StudyRoom.tsx is the only importer and it uses next/dynamic
// with ssr:false, which is what keeps this out of the shared bundle. Importing
// it anywhere else silently puts three megabytes on every screen in the app,
// and tests/the-study-room-is-paid-for-on-arrival.mjs is there to stop that.
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

import { useEffect, useRef, useState } from 'react';
import { StoreExtensionManager, ViewExtensionManager } from '@blocksuite/affine/ext-loader';
import { getInternalStoreExtensions } from '@blocksuite/affine/extensions/store';
import { getInternalViewExtensions } from '@blocksuite/affine/extensions/view';
import { BlockStdScope } from '@blocksuite/affine/std';
import { render } from 'lit';

import { StudyWorkspace } from '@/lib/study/workspace';
import type { DocSource } from '@blocksuite/sync';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { humanError } from '@/lib/live/errors';

/** One room per person. The id is stable so the same room reopens every time. */
const WORKSPACE = 'study-room';
const FIRST_PAGE = 'page-1';

/**
 * WHERE PAGES ARE KEPT IS THE CALLER'S DECISION, and that is not indirection
 * for its own sake. The real room writes to `study_docs` as a signed-in person;
 * the tutorial has no session at all, and `db()` throws there rather than
 * returning a client. Taking the source as a prop is what lets both open the
 * same editor instead of the demo meeting the one room that errors.
 */
export function StudyRoomEditor({ makeSource }: { makeSource: () => DocSource }) {
  const host = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let workspace: StudyWorkspace | null = null;
    let cancelled = false;

    (async () => {
      try {
        // BUILT HERE, NOT IN THE CALLER'S RENDER. The live source needs a
        // database client, and asking for one throws when the app is not
        // connected yet. Thrown during render that is not an error anybody
        // sees -- it is a component that renders nothing, which is exactly how
        // this first reached somebody: a heading, a sentence, and a blank space
        // where the room should have been.
        workspace = new StudyWorkspace({ id: WORKSPACE, docSource: makeSource() });

        const storeManager = new StoreExtensionManager(getInternalStoreExtensions());
        const viewManager = new ViewExtensionManager(getInternalViewExtensions());
        workspace.storeExtensions = storeManager.get('store');

        workspace.start();
        workspace.meta.initialize();
        // Wait for what is already saved before deciding the room is empty,
        // or a returning Explorer gets a blank page and a new one written over
        // the top of everything they had.
        await workspace.waitForSynced();
        if (cancelled) return;

        const existing = workspace.getDoc(FIRST_PAGE);
        const doc = existing ?? workspace.createDoc(FIRST_PAGE);
        doc.load();
        const store = doc.getStore();

        // A page needs a root, a surface and somewhere to type before it can be
        // rendered at all. Only on a genuinely new room.
        if (!store.root) {
          const rootId = store.addBlock('affine:page', {});
          store.addBlock('affine:surface', {}, rootId);
          const noteId = store.addBlock('affine:note', {}, rootId);
          store.addBlock('affine:paragraph', {}, noteId);
        }

        if (cancelled || !host.current) return;
        const std = new BlockStdScope({ store, extensions: viewManager.get('page') });
        render(std.render(), host.current);
        setReady(true);
      } catch (cause) {
        if (!cancelled) setError(humanError(cause, 'The study room could not be opened.'));
      }
    })();

    return () => {
      cancelled = true;
      // Written work first, then teardown. forceStop loses whatever has not
      // reached the database, so it is the last resort rather than the exit.
      void workspace?.waitForGracefulStop().finally(() => {
        workspace?.forceStop();
        workspace?.dispose();
      });
    };
  }, [makeSource]);

  return (
    <div className="relative min-h-[60vh] [min-height:60dvh]">
      {error && (
        <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      )}
      {!ready && !error && (
        <div className="absolute inset-0 grid place-items-center">
          <BeaconSpinner inline label="Opening your study room" />
        </div>
      )}
      {/* The editor measures itself against this element; without the class it
          throws ViewportElementProvider and renders nothing. */}
      <div ref={host} className="affine-page-viewport" />
    </div>
  );
}

export default StudyRoomEditor;
