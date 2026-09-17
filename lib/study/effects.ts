// Everything the editor has to have loaded before it can draw anything.
//
// ---------------------------------------------------------------------------
// THREE SIDE EFFECTS AND NO EXPORTS, which is why it is a file of its own: it
// is imported with `await import(...)` when somebody opens a page, so that
// opening the ROOM does not pay for it. See lib/study/view-extensions.ts.
//
// The first import has no bindings on purpose. It registers roughly a hundred
// custom elements as a side effect, and it is the whole reason paragraphs,
// lists, tables, databases and the canvas exist. Without it the editor renders
// nothing and reports no error.
//
// THE EDITOR SHIPS NO COLOURS OF ITS OWN. Every BlockSuite stylesheet is written
// against `var(--affine-text-primary-color)` and about two hundred siblings, and
// nothing in the package defines them -- AFFiNE's own app does, in the theme
// package. Without it every one of those variables resolves to nothing and each
// rule silently falls back to whatever it inherits.
// ---------------------------------------------------------------------------

import '@blocksuite/affine/effects';
import '@toeverything/theme/style.css';
import '@/components/study/study-room.css';
