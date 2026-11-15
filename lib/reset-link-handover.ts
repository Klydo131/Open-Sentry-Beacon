// A reset link that lands on the wrong page is handed to the right one.
//
// ---------------------------------------------------------------------------
// REPORTED 15 NOVEMBER 2026: a reset link opened the home page, not the page
// that chooses a new password. The link asks to land on /new-password, but
// Supabase honours that only if the exact address is on the project's allowed
// list; otherwise it falls back to the Site URL, the home page, carrying the
// same signed-in details in the address after the #. Nothing there knew what
// they were, so the person was left on the sign-in screen.
//
// THIS RUNS IN <head>, BEFORE ANY OTHER SCRIPT, because the sign-in client
// reads and clears those details as soon as it starts. By the time a page
// component could look, they would be gone. It moves a recovery link to
// /new-password, untouched, and does nothing for any other address.
// ---------------------------------------------------------------------------

export const RESET_LINK_HANDOVER = `(function(){try{var l=location;if(l.pathname==='/new-password')return;var h=l.hash.replace(/^#/,'').replace(/amp;/g,'');var s=l.search.replace(/amp;/g,'');var p=new URLSearchParams(h);var q=new URLSearchParams(s);if(p.get('type')==='recovery'||q.get('type')==='recovery'||q.get('recovery')==='1'){l.replace('/new-password'+l.search+l.hash);}}catch(e){}})();`;
