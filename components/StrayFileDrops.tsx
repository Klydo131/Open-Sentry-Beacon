'use client';

// A file dropped where nothing takes files is ignored, not opened.
//
// A browser's own answer to a file let go over a page that did not ask for it
// is to OPEN THE FILE: the tab leaves the app and shows the PDF or the picture
// instead. Whatever was being typed goes with it. Found on 28 September 2026,
// when a study being edited took files only on a small box at its foot, and a
// handout dropped a few pixels away from that box took the Guide out of the
// app and their edit with it.
//
// Every place that takes files marks the drop as handled (FileDrop, DropArea,
// the Resources card, the bulk-invite list), and this listens on the window,
// after all of them, so it only ever sees a drop nobody took. It then does the
// one thing the browser would not: nothing. While a file is dragged over such a
// place the pointer says "not here" rather than inviting a drop.
//
// Text and links being dragged are left entirely alone: only files are guarded.

import { useEffect } from 'react';

const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

export function StrayFileDrops() {
  useEffect(() => {
    const over = (e: DragEvent) => {
      if (!carriesFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
    };
    const drop = (e: DragEvent) => {
      if (!carriesFiles(e) || e.defaultPrevented) return;
      e.preventDefault();
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);
  return null;
}
