'use client';

// The drawing board: Excalidraw, full screen, for a picture that goes with a
// study.
//
// ---------------------------------------------------------------------------
// ASKED FOR on 28 September 2026: "Make sure studies feature has Excalidraw on
// it's tools please, and make sure it works."
//
// WHAT IT MAKES. A picture, saved as one PNG the study keeps like any handout:
// an Explorer taps it and sees it, on any phone. The drawing itself travels
// inside that PNG (Excalidraw's "embed scene"), so the person who drew it can
// press Change drawing and carry on with the same boxes and arrows rather than
// scribbling over a flat image. See lib/drawing-file.ts.
//
// THE ONE RULE OF THIS FILE: nothing else imports it except through
// next/dynamic. Excalidraw is about a megabyte of script. It arrives when
// somebody presses Draw, and never on a screen where nobody is drawing --
// tests/a-study-can-have-a-drawing.mjs holds that.
//
// WHAT IS SWITCHED OFF, AND WHY EACH:
// - Pictures inside the drawing (the image tool, pasting or dropping a photo).
//   A photo from a phone can say where it was taken, and a photo inside a
//   drawing never passes through the step that takes that out. A photo is
//   added as a handout instead, where it does.
// - Web embeds. The app's Content-Security-Policy refuses almost every frame,
//   so an embed would draw as a broken box.
// - Open, Save to disk, Export and the theme switch. The only way out of this
//   board is Save or Cancel, and the picture goes on the study.
// - The online library and the AI tools, which talk to Excalidraw's servers.
// - Its welcome text, which says drawings are "saved in your browser". Here
//   they are not, so it says what is true instead.
// ---------------------------------------------------------------------------

// FIRST, before Excalidraw: it reads where its fonts are the moment it loads.
import '@/components/draw/excalidraw-asset-path';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  exportToBlob,
  getSceneVersion,
  loadFromBlob,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import '@/components/draw/drawing-board.css';

import { CloseGlyph, CheckGlyph } from '@/components/Glyph';

/** The largest file a study takes, the same 10 MB as every handout. */
const MAX_BYTES = 10 * 1024 * 1024;

// The API is typed by the package but not exported under a stable name.
type Api = Parameters<NonNullable<React.ComponentProps<typeof Excalidraw>['excalidrawAPI']>>[0];
type Initial = Awaited<ReturnType<typeof loadFromBlob>>;

export function DrawingBoard({ name, title, initial, onSave, onClose }: {
  /** The file name the picture is saved under, e.g. "Drawing 1.excalidraw.png". */
  name: string;
  /** What the bar says, e.g. "Drawing for Study 2". */
  title: string;
  /** A drawing made here before, to carry on with. */
  initial?: Blob | null;
  /** Called with the finished picture. The board closes when it resolves. */
  onSave: (file: File) => void | Promise<void>;
  onClose: () => void;
}) {
  const [api, setApi] = useState<Api | null>(null);
  // The drawing read back out of an earlier picture, and whether the board can
  // open yet: at once for a new drawing, after reading for an old one.
  const [scene, setScene] = useState<Initial | null>(null);
  const [ready, setReady] = useState(!initial);
  const [hasShapes, setHasShapes] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // WHAT THE BOARD OPENED WITH, to tell a change from a look. Nothing, for a
  // new drawing; the saved shapes, for one being changed. Not "the first
  // change Excalidraw reports": it reports nothing until something is drawn,
  // so that baseline was the drawing itself and Cancel never asked.
  const startVersion = useRef(0);

  // A ROOM THAT TAKES THE SCREEN MUST NOT LEAVE THE PAGE BEHIND IT SCROLLING,
  // the same as the study room: a phone would scroll the study underneath.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  // AN EARLIER DRAWING IS READ BEFORE THE BOARD OPENS, so it opens with the
  // shapes already on it rather than blank and then jumping.
  useEffect(() => {
    if (!initial) return;
    let live = true;
    loadFromBlob(initial, null, null)
      .then((read) => {
        if (!live) return;
        startVersion.current = getSceneVersion(read.elements);
        setScene(read);
        setReady(true);
      })
      .catch(() => {
        if (!live) return;
        setError('This picture could not be opened as a drawing, so the board starts empty. Saving adds a new picture.');
        setReady(true);
      });
    return () => { live = false; };
  }, [initial]);

  const initialData = useMemo(() => {
    if (scene) {
      return {
        elements: scene.elements,
        files: scene.files,
        appState: { viewBackgroundColor: scene.appState.viewBackgroundColor ?? '#ffffff' },
        scrollToContent: true,
      };
    }
    return { appState: { viewBackgroundColor: '#ffffff' } };
  }, [scene]);

  const leave = () => {
    if (saving) return;
    if (dirty && !asking) { setAsking(true); return; }
    onClose();
  };

  const save = async () => {
    if (!api || saving) return;
    const elements = api.getSceneElements();
    if (!elements.length) { setError('Draw something first, then save it.'); return; }
    setSaving(true); setError('');
    try {
      const appState = api.getAppState();
      const blob = await exportToBlob({
        elements,
        files: api.getFiles(),
        appState: {
          ...appState,
          exportBackground: true,
          exportWithDarkMode: false,
          // THE DRAWING GOES INSIDE THE PICTURE, which is what makes it
          // possible to change it later. lib/drawing-file.ts reads it back.
          exportEmbedScene: true,
        },
        mimeType: 'image/png',
        exportPadding: 24,
        // Big enough to read on a tablet, small enough to open quickly on a
        // phone. A drawing wider than this is scaled, not cropped.
        maxWidthOrHeight: 2400,
      });
      if (blob.size > MAX_BYTES) {
        setError('This drawing is over 10 MB, which is more than a study can hold. Make it simpler and save again.');
        return;
      }
      await onSave(new File([blob], name, { type: 'image/png' }));
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : 'The drawing could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-drawing-board=""
      // ABOVE EVERYTHING, like the study room: the walkthrough's banner sits at
      // z-50 and must not cover Save.
      className="fixed inset-0 z-[100] flex flex-col bg-white"
    >
      <header
        className="flex shrink-0 items-center gap-2 border-b border-navy/10 bg-white px-3"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)', minHeight: 'calc(56px + env(safe-area-inset-top, 0px))' }}
      >
        {asking ? (
          // LEAVING A DRAWING NOBODY SAVED ASKS FIRST. One stray tap on Cancel
          // should not cost somebody twenty minutes of arrows.
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-2">
            <p className="min-w-0 flex-1 text-[15px] font-semibold text-navy">Leave without saving this drawing?</p>
            <button type="button" onClick={() => setAsking(false)} className="tap-sm rounded-full bg-navy px-4 text-sm font-bold text-white">
              Keep drawing
            </button>
            <button type="button" onClick={onClose} className="tap-sm rounded-full px-3 text-sm font-semibold text-red-700 underline">
              Leave
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={leave}
              disabled={saving}
              className="tap-sm inline-flex items-center gap-1 rounded-full px-2 text-[15px] font-semibold text-navy"
            >
              <CloseGlyph size={20} />
              Cancel
            </button>
            {/* The title on wide screens only. At phone width it came out as
                "Drawi…" between Cancel and Save; the page under it already says
                which study the drawing is for. */}
            <p className="hidden min-w-0 flex-1 truncate text-center text-[15px] font-bold text-navy sm:block">{title}</p>
            <span aria-hidden className="flex-1 sm:hidden" />
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !api || !hasShapes}
              className="tap-sm inline-flex items-center gap-1 rounded-full bg-navy px-4 text-[15px] font-bold text-white disabled:opacity-40"
            >
              <CheckGlyph size={18} />
              {saving ? 'Saving…' : 'Save drawing'}
            </button>
          </>
        )}
      </header>

      {error && (
        <p role="alert" className="shrink-0 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800">{error}</p>
      )}

      <div className="relative min-h-0 flex-1" data-drawing-canvas="">
        {ready && (
          <div className="absolute inset-0">
            <Excalidraw
              excalidrawAPI={setApi}
              initialData={initialData}
              name={name}
              theme="light"
              langCode="en"
              autoFocus
              aiEnabled={false}
              validateEmbeddable={false}
              UIOptions={{
                canvasActions: {
                  loadScene: false,
                  saveToActiveFile: false,
                  export: false,
                  saveAsImage: false,
                  toggleTheme: null,
                  changeViewBackgroundColor: true,
                  clearCanvas: true,
                },
                tools: { image: false },
              }}
              onChange={(elements) => {
                const shown = elements.filter((e) => !e.isDeleted);
                setHasShapes(shown.length > 0);
                setDirty(getSceneVersion(elements) !== startVersion.current);
              }}
            >
              <MainMenu>
                <MainMenu.DefaultItems.ClearCanvas />
                <MainMenu.DefaultItems.ChangeCanvasBackground />
                <MainMenu.DefaultItems.Help />
              </MainMenu>
              <WelcomeScreen>
                <WelcomeScreen.Hints.ToolbarHint>
                  Pick a shape, an arrow or the pencil, then draw on the page
                </WelcomeScreen.Hints.ToolbarHint>
                <WelcomeScreen.Center>
                  <WelcomeScreen.Center.Heading>
                    Draw it the way you would explain it: boxes, arrows and a few words.
                    Save drawing puts it on the study as a picture.
                  </WelcomeScreen.Center.Heading>
                </WelcomeScreen.Center>
              </WelcomeScreen>
            </Excalidraw>
          </div>
        )}
      </div>
    </div>
  );
}

export default DrawingBoard;
