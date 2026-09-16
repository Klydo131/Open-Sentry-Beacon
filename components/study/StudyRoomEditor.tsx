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

// THE EDITOR SHIPS NO COLOURS OF ITS OWN. Every BlockSuite stylesheet is
// written against `var(--affine-text-primary-color)` and about two hundred
// siblings, and nothing in the package defines them -- AFFiNE's own app does,
// in this file. Without it every one of those variables resolves to nothing and
// each rule silently falls back to whatever it inherits: the placeholder came
// out as near-black body text rather than a grey hint, and the same was true of
// every border, divider and selection colour in the room.
//
// 12 kB gzipped, in the editor's own chunk, so it reaches only the one screen
// that has an editor on it. It is scoped to :root, which is safe here because
// every name in it begins with `--affine-` and this app defines none of those.
import '@toeverything/theme/style.css';
import './study-room.css';

import { useEffect, useRef, useState } from 'react';
import { BlockStdScope, TextSelection } from '@blocksuite/affine/std';
import { render } from 'lit';

import { StudyWorkspace } from '@/lib/study/workspace';
import { studyStoreManager, studyViewManager } from '@/lib/study/extensions';
import type { DocSource } from '@blocksuite/sync';
import type { Troubled } from '@/lib/study/doc-source';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { Button } from '@/components/ui';
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
  const [notice, setNotice] = useState('');
  // AN UNREACHED ROOM IS NOT AN EMPTY ONE, and telling them apart is the whole
  // point of this flag. See where it is set.
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // NOT SAVED IS NOT THE SAME AS NOT WORKING, and neither is worth hiding.
  const [trouble, setTrouble] = useState('');

  useEffect(() => {
    let workspace: StudyWorkspace | null = null;
    let cancelled = false;
    setStalled(false);
    setNotice('');
    setError('');
    setTrouble('');

    (async () => {
      try {
        // BUILT HERE, NOT IN THE CALLER'S RENDER. The live source needs a
        // database client, and asking for one throws when the app is not
        // connected yet. Thrown during render that is not an error anybody
        // sees -- it is a component that renders nothing, which is exactly how
        // this first reached somebody: a heading, a sentence, and a blank space
        // where the room should have been.
        // A SOURCE THAT CANNOT SAVE MUST BE ABLE TO SAY SO. DocEngine swallows
        // whatever a source throws and retries quietly, which is right for a
        // dropped packet and wrong for a room that will never save again: the
        // person keeps writing into a page that looks perfectly normal. The
        // live source reports upward; the tutorial's never has anything to
        // report, and does not implement this at all.
        const source = makeSource() as DocSource & Troubled;
        source.onTrouble = (cause) => {
          if (cancelled) return;
          setTrouble(cause === null
            ? ''
            : humanError(cause, 'Your writing is not reaching the database.'));
        };
        workspace = new StudyWorkspace({ id: WORKSPACE, docSource: source });

        // NOT getInternalViewExtensions(). That loads every block BlockSuite
        // has -- the whiteboard, the databases, the embeds -- and it is why the
        // chunk was 4.6 MB. See lib/study/extensions.ts for what a study room
        // is actually made of.
        const storeManager = studyStoreManager();
        const viewManager = studyViewManager();
        workspace.storeExtensions = storeManager.get('store');

        workspace.start();
        workspace.meta.initialize();

        // WAITING FOR THE DATABASE MUST NOT BE ABLE TO STOP THE ROOM OPENING,
        // and that is not a theoretical worry -- it is what reached somebody.
        //
        // This used to be a bare `await workspace.waitForSynced()`. Against the
        // in-memory source the tutorial uses, that resolves at once, which is
        // why every test passed. Against the live source it can hang, and when
        // it hangs nothing after this line ever runs: no editor, no error, an
        // empty white room. The one path nobody could test was the only path
        // that mattered.
        //
        // The wait still happens, because opening before the saved pages arrive
        // would show a returning Explorer an empty page and then write a new
        // one over the top of everything they had. But it is bounded, and the
        // room opens either way. A slow network costs somebody the first few
        // seconds of their own writing, not the room.
        const synced = await Promise.race([
          workspace.waitForSynced().then(() => true),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 8000)),
        ]);
        if (cancelled) return;

        const existing = workspace.getDoc(FIRST_PAGE);
        const doc = existing ?? workspace.createDoc(FIRST_PAGE);
        doc.load();
        const store = doc.getStore();

        // A page needs a root, a surface and somewhere to type before it can be
        // rendered at all. Only on a genuinely NEW room -- and only when the
        // database actually answered. Writing a fresh page after a sync that
        // timed out is how somebody's notes get replaced by a blank one.
        if (!store.root && synced) {
          const rootId = store.addBlock('affine:page', {});
          // No surface block: that is the infinite canvas, which this room does
          // not have and no longer carries the code for.
          const noteId = store.addBlock('affine:note', {}, rootId);
          store.addBlock('affine:paragraph', {}, noteId);
        }

        // THE ONE STATE LEFT THAT LOOKS EXACTLY LIKE BROKEN. The wait timed out
        // AND there is no page: nothing came back from the database and nothing
        // may be written, because a fresh page written now would be the one that
        // gets pushed over whatever is actually stored.
        //
        // Rendering the editor anyway puts an empty white box on the screen
        // under a notice claiming "anything you write now is kept", which is
        // not true -- there is nothing to write in and nothing being saved. An
        // honest dead end beats a convincing blank page, so say what happened,
        // say nothing is lost, and offer the only useful action.
        if (!store.root) {
          setStalled(true);
          return;
        }

        if (cancelled || !host.current) return;
        const std = new BlockStdScope({ store, extensions: viewManager.get('page') });
        render(std.render(), host.current);
        setReady(true);

        // A ROOM WITH NOTHING IN IT HAS TO STILL LOOK LIKE A ROOM, and this is
        // the third report of the study room "not working" that turned out to
        // be a working editor nobody could tell was there. An untouched page is
        // one empty paragraph. BlockSuite only draws its placeholder while the
        // caret is inside the block, so with no caret there is no placeholder,
        // no toolbar and no title: a white rectangle, which is exactly what a
        // broken page looks like.
        //
        // So put the caret in it. Only when the page is genuinely empty -- a
        // returning Explorer opens on their own words and is not interrupted,
        // and nothing is written into anybody's document to achieve this.
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
        if (!synced) {
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
      // Written work first, then teardown. forceStop loses whatever has not
      // reached the database, so it is the last resort rather than the exit.
      void workspace?.waitForGracefulStop().finally(() => {
        workspace?.forceStop();
        workspace?.dispose();
      });
    };
  }, [makeSource, attempt]);

  return (
    <div className="relative min-h-[60vh] [min-height:60dvh]">
      {trouble && !error && !stalled && (
        <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          <span className="font-semibold">Not saved yet.</span> {trouble} Keep this
          page open; it keeps trying, and what you have written is still here.
        </p>
      )}
      {notice && !error && (
        <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
          {notice}
        </p>
      )}
      {error && (
        <p className="mb-3 rounded-xl bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </p>
      )}
      {stalled && (
        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <p className="font-semibold">Your study room did not answer.</p>
          <p className="mt-1">
            Nothing has been lost. Your pages are in the church&rsquo;s database and
            this device simply could not reach them just now. It is usually the
            connection.
          </p>
          <Button className="mt-3" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      )}
      {!ready && !error && !stalled && (
        <div className="absolute inset-0 grid place-items-center">
          <BeaconSpinner inline label="Opening your study room" />
        </div>
      )}
      {/* The editor measures itself against this element; without the class it
          throws ViewportElementProvider and renders nothing. */}
      <div ref={host} className="affine-page-viewport" hidden={stalled} />
    </div>
  );
}

export default StudyRoomEditor;
