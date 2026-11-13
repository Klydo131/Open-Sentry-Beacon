// Trusted Types: the browser refuses to turn a string into HTML or a script
// address unless this policy says it may.
//
// ---------------------------------------------------------------------------
// WHY (9 November 2026). Most attacks on a web app that get past the server
// end the same way: a string an attacker chose is written into the page as
// HTML (`innerHTML`) or used as the address of a script, and the browser runs
// it. Trusted Types makes the browser check every such write against a
// policy. This is the page's one policy, the `default`, and it approves
// almost nothing:
//
//   * HTML: only React's own empty `<script></script>`, which it uses to make
//     a script element, and the exact text of an inline script or style the
//     server already sent in this page (React writes those again as the page
//     wakes up; Next.js's own not-found page does the same with its style).
//     Writing what is already there gives an attacker nothing.
//   * a script address: only this site's own code (`/_next/static/`) and its
//     offline helper (`/sw.js`). No other origin, no data: or blob: URL.
//   * a script from a string: never.
//
// REPORTED, NOT YET ENFORCED (next.config.mjs sends it as
// Content-Security-Policy-Report-Only). Every walk was run once with it
// enforced (9 November 2026, Chromium). Two features would be refused:
//
//   * a music score (MusicXML) is read with DOMParser (lib/music/score-file.ts),
//     a markup sink. Seen: the music room's walk could not open its score
//     ("This document requires 'TrustedHTML' assignment").
//   * the Study Room's editor parses pasted HTML and SVG the same way, so
//     pasting formatted text or a drawing would fail. Found by searching the
//     scripts the build ships; the walks paste only pictures (which passed),
//     so it was not seen on a screen.
//
// (The image resizer, pica, also starts a worker from a data: address, which
// would be refused; it already falls back to resizing without one.)
//
// Each needs a named policy of its own, created where it is used, before
// enforcement can be switched on. Until then the browser only reports, in the
// console, every write this policy would have refused: the list of what is
// left to do. Enforcing only on the sign-in pages was also weighed and
// rejected: a browser keeps one policy for the whole visit, and several ways
// out of those pages move into the app without reloading it.
//
// It must exist before any other script runs, so app/layout.tsx puts it first
// in <head>. Written for every browser: one without Trusted Types skips it.
// ---------------------------------------------------------------------------

export const TRUSTED_TYPES_POLICY = `(function () {
  try {
    var tt = window.trustedTypes;
    if (!tt || !tt.createPolicy || tt.defaultPolicy) return;
    var EMPTY_SCRIPT = '<script><' + '/script>';
    var served = function (s) {
      var all = document.querySelectorAll('script:not([src]), style');
      for (var i = 0; i < all.length; i++) if (all[i].textContent === s) return true;
      return false;
    };
    var own = function (u) {
      try {
        var x = new URL(u, location.href);
        return x.origin === location.origin
          && (x.pathname.indexOf('/_next/static/') === 0 || x.pathname === '/sw.js');
      } catch (e) { return false; }
    };
    tt.createPolicy('default', {
      createHTML: function (s) { return s === EMPTY_SCRIPT || served(s) ? s : null; },
      createScriptURL: function (s) { return own(s) ? s : null; },
      createScript: function () { return null; }
    });
  } catch (e) {}
})();`;
