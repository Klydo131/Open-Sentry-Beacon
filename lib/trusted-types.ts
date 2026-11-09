// Trusted Types: the browser refuses to turn a string into HTML or a script
// address unless this policy says it may.
//
// ---------------------------------------------------------------------------
// WHY (9 November 2026). Most attacks on a web app that get past the server
// end the same way: a string an attacker chose is written into the page as
// HTML (`innerHTML`) or used as the address of a script, and the browser runs
// it. The content security policy (next.config.mjs) now says
// `require-trusted-types-for 'script'`, so every such write in the browser is
// refused unless a Trusted Types policy approves it. This is the one policy,
// the `default`, and it approves almost nothing:
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
// It is measured, not guessed: with the header enforced, a walk of every
// room, the Study Room's editor and its whiteboard included, met only those
// kinds of write, and then every walk in tests/e2e ran with it enforced
// (9 November 2026). Anything else the browser now refuses, and the console
// says what was refused, where.
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
