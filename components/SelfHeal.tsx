'use client';

import { useEffect } from 'react';

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
  function chunky(m){return /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|module script failed/i.test(m||'');}
  function heal(){
    try{ if(sessionStorage.getItem(K)) return; sessionStorage.setItem(K,'1'); }catch(e){ return; }
    var went=false;
    var go=function(){ if(went) return; went=true; location.replace('/?fresh='+Date.now()); };
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
          .then(function(r){ if(!r.ok) heal(); })
          .catch(function(){ /* the network, not the deploy */ });
      }catch(e){ /* no fetch here: leave it alone rather than guess */ }
    },1500);
  }
  window.addEventListener('error',function(e){
    var t=e&&e.target;
    // A picture or a sound failing is not a broken app. Only the two things a
    // deploy can delete out from under a running page count.
    var tag=(t&&t.tagName||'').toLowerCase();
    if(tag!=='script'&&tag!=='link') { if(chunky(e&&e.message)&&navigator.onLine) heal(); return; }
    var src=(t&&(t.src||t.href))||'';
    if(src&&src.indexOf('/_next/static/')>-1){ ifReallyGone(src); return; }
    if(chunky(e&&e.message)&&navigator.onLine) heal();
  },true);
  window.addEventListener('unhandledrejection',function(e){
    var r=e&&e.reason;
    // Webpack raises this after its own retries, so there is no URL left to
    // ask about -- but healing while offline would delete the cache that is
    // keeping the app usable, which is the worst possible moment for it.
    if(chunky((r&&(r.message||r.name))||String(r||''))&&navigator.onLine) heal();
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
