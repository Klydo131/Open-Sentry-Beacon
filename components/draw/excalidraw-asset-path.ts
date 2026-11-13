// Where the drawing board's fonts are, and nowhere else. Imported FIRST by
// DrawingBoard.tsx, before Excalidraw itself, and that order is the point.
//
// Excalidraw works out every font's address from window.EXCALIDRAW_ASSET_PATH
// and falls back to esm.sh when that is unset. scripts/excalidraw-assets.mjs
// copies the fonts into public/excalidraw/, so the path is set to them here.
//
// AND THE FALLBACK IS TAKEN OFF. Even with the path set, Excalidraw adds esm.sh
// as a second source on every font. The Content-Security-Policy refuses it, so
// nothing is fetched from there -- but a browser checks every source a font
// names the moment the font is made, and each check is a "Refused to load the
// font" in the console: about 230 of them every time the board opened (found on
// 28 September 2026 by tests/e2e/a-study-can-have-a-drawing.js, which listens
// for any request that leaves the app). So a font made while the board is
// loaded has its esm.sh sources removed before the browser sees them, as long
// as a source of our own is left. Nothing else about any font changes.

const FOREIGN = /^\s*url\(\s*["']?https:\/\/esm\.sh\//i;

/** A font's `src` list without the esm.sh entries, unless that would empty it. */
export function withoutForeignFonts(source: string): string {
  const parts = source.split(/,\s*(?=url\()/);
  const ours = parts.filter((p) => !FOREIGN.test(p));
  return ours.length ? ours.join(', ') : source;
}

if (typeof window !== 'undefined') {
  const w = window as unknown as {
    EXCALIDRAW_ASSET_PATH?: string;
    FontFace: typeof FontFace;
    __beaconFontsGuarded?: boolean;
  };
  w.EXCALIDRAW_ASSET_PATH = '/excalidraw/';
  if (!w.__beaconFontsGuarded && typeof w.FontFace === 'function') {
    w.__beaconFontsGuarded = true;
    // A Proxy rather than a subclass: what comes back is the browser's own
    // FontFace, so document.fonts and `instanceof` see nothing different.
    w.FontFace = new Proxy(w.FontFace, {
      construct(Native, [family, source, descriptors]) {
        return new Native(family, typeof source === 'string' ? withoutForeignFonts(source) : source, descriptors);
      },
    });
  }
}
