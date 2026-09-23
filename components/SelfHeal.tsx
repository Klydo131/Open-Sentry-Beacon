'use client';

import { useEffect } from 'react';

import { BUILD_ID } from '@/lib/build-info';

// Repairs an app that cannot start.
//
// The failure this exists for is real and was seen on a real device: an
// installed copy kept an old cached HTML shell, that shell asks for JavaScript
// files by name, and a new deploy deletes the old ones. The request 404s, the
// app never boots, and all the person sees is "Application error: a client-side
// exception has occurred". Nothing inside the app can help at that point,
// because nothing inside the app is running. Settings is unreachable. The only
// escape used to be uninstalling.
//
// So this cannot be React code. It is an inline script in the HTML itself,
// running before any bundle is fetched, listening for the exact signal that a
// chunk failed to load. When it fires it throws away the service worker and
// every cache and reloads from scratch. Personal data lives in localStorage and
// IndexedDB and is never touched.
//
// It heals once per session. A second attempt would mean the fresh copy is
// broken too, and reloading forever is worse than showing the error, so at that
// point app/global-error.tsx takes over and offers the same repair as a button.
// The marker is cleared as soon as the app is proven to boot, so a device that
// breaks again later can still repair itself.

const HEAL_KEY = 'beacon-healed';

const SCRIPT = `(function(){
  var K=${JSON.stringify(HEAL_KEY)};
  var MINE=${JSON.stringify(BUILD_ID)};
  function chunky(m){return /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|module script failed/i.test(m||'');}
  // WHY sits in the address it reloads to. The app has three other ways to
  // land on /?fresh=... -- the auto-update, the Settings button and the error
  // screen -- and for a whole day of WebKit logs every one of them looked like
  // this one. A reload that does not say who asked for it cannot be attributed,
  // and a guess about which one fired went into two commit messages.
  function heal(why){
    try{ if(sessionStorage.getItem(K)) return; sessionStorage.setItem(K,'1'); }catch(e){ return; }
    var went=false;
    var go=function(){ if(went) return; went=true; location.replace('/?fresh='+Date.now()+'&by=repair-'+(why||'unknown')); };
    try{
      var jobs=[];
      if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){
        jobs.push(navigator.serviceWorker.getRegistrations().then(function(rs){
          return Promise.all(rs.map(function(r){return r.unregister();}));
        }));
      }
      if(window.caches&&caches.keys){
        jobs.push(caches.keys().then(function(ks){
          return Promise.all(ks.map(function(k){return caches.delete(k);}));
        }));
      }
      Promise.all(jobs).then(go,go);
      setTimeout(go,3000);
    }catch(e){ go(); }
  }
  // Only heal when the file really is gone from the server. An error event
  // says something went wrong near a URL; it does not say the deploy deleted
  // it, and those are the two cases this has to tell apart.
  function ifReallyGone(url){
    if(!navigator.onLine) return;
    // WAIT FIRST, AND THAT IS THE IMPORTANT HALF. If this failure is a request
    // cancelled because the page is on its way somewhere else, the document is
    // about to be replaced and this timer dies with it -- so the check never
    // runs and nothing is asked. Only a page that is still here a moment later
    // gets as far as the request below.
    setTimeout(function(){
      if(document.visibilityState==='hidden') return;
      try{
        // same-origin, no credentials: this is our own asset on our own host,
        // and asking for it as a CORS request is what made WebKit refuse it
        // with "Fetch API cannot load ... due to access control checks".
        fetch(url,{method:'HEAD',cache:'no-store',mode:'same-origin',credentials:'omit'})
          .then(function(r){ if(!r.ok) heal('chunk'); })
          .catch(function(){ /* the network, not the deploy */ });
      }catch(e){ /* no fetch here: leave it alone rather than guess */ }
    },1500);
  }

  // The same question for the failures that arrive with NO URL attached.
  //
  // WHY THIS IS HERE. Narrowing the resource-error path above left three other
  // ways in -- two chunky(message) branches and the rejection handler -- and
  // every one of them called heal() on the spot. WebKit run 238 walked straight
  // through one of them: conversation-fits-the-glass clicked sign-in, the app
  // navigated to /?fresh=..., and the walk died waiting. A dynamic import that
  // is cancelled by navigating away rejects with "Importing a module script
  // failed", which is one of the strings chunky() matches. So the fix I shipped
  // covered one door and left three open. This is the rest of it.
  //
  // WHAT IT ASKS INSTEAD. There is no URL to test here, but there is a better
  // question: has the server moved to a different build than the one this page
  // was built from? That is the actual condition this whole file exists for --
  // a stale HTML shell asking for chunks a newer deploy deleted. /version.json
  // answers it directly, and MINE is baked into this shell at build time, so an
  // old cached shell carries an old id and the comparison is exactly right.
  //
  // Same build means reloading cannot help: the file is not missing because of
  // a deploy, and the rule in this file has always been that reloading forever
  // is worse than showing the error. And the 1500ms wait does the same work it
  // does above -- a page on its way somewhere else never runs this timer.
  function ifTheBuildMoved(){
    if(!navigator.onLine) return;
    setTimeout(function(){
      if(document.visibilityState==='hidden') return;
      try{
        fetch('/version.json?probe='+Date.now(),
              {cache:'no-store',mode:'same-origin',credentials:'omit'})
          .then(function(r){ return r.ok?r.json():null; })
          .then(function(v){ if(v&&v.build&&MINE&&v.build!==MINE) heal('build'); })
          .catch(function(){ /* the network, not the deploy */ });
      }catch(e){ /* no fetch here: leave it alone rather than guess */ }
    },1500);
  }
  window.addEventListener('error',function(e){
    var t=e&&e.target;
    // A picture or a sound failing is not a broken app. Only the two things a
    // deploy can delete out from under a running page count.
    var tag=(t&&t.tagName||'').toLowerCase();
    if(tag!=='script'&&tag!=='link') { if(chunky(e&&e.message)) ifTheBuildMoved(); return; }
    var src=(t&&(t.src||t.href))||'';
    if(src&&src.indexOf('/_next/static/')>-1){ ifReallyGone(src); return; }
    if(chunky(e&&e.message)) ifTheBuildMoved();
  },true);
  window.addEventListener('unhandledrejection',function(e){
    var r=e&&e.reason;
    // Webpack raises this after its own retries, so there is no URL left to
    // ask about -- and a cancelled import lands here too. The build check is
    // the only honest way to tell those apart without one.
    if(chunky((r&&(r.message||r.name))||String(r||''))) ifTheBuildMoved();
  });
})()`;

export function SelfHeal() {
  // Reaching this line means React mounted, so whatever was broken is not
  // broken now. Clear the marker so a future failure can repair itself too.
  useEffect(() => {
    try {
      sessionStorage.removeItem(HEAL_KEY);
    } catch {
      // A browser refusing session storage is not a reason to fail.
    }
  }, []);

  return <script dangerouslySetInnerHTML={{ __html: SCRIPT }} />;
}
