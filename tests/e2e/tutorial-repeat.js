const { chromium, launchOptions } = require('./_playwright');
// Takes the port as an argument, like every other suite here. It used to be
// hardcoded, which meant running it against a server on any other port failed
// with a connection error that reads exactly like a broken app.
const BASE = `http://localhost:${process.argv[2] || '4002'}`;
// Screenshots and browser profiles go somewhere writable that is not the
// repo. Overridable so CI can collect them as artifacts.
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-e2e-'));
let bad=0; const ok=(c,m)=>{if(!c)bad++;console.log(`${c?'OK ':'BAD'} ${m}`);};

const read = (p) => p.evaluate(() => {
  const panel=document.querySelector('[aria-label="Beacon tutorial"]');
  if(!panel) return {none:true};
  const ring=[...document.querySelectorAll('div')].find(d=>(d.style.boxShadow||'').includes('9999px'));
  let tq=null;
  if(ring){const rr=ring.getBoundingClientRect();const e=document.elementFromPoint(rr.left+rr.width/2,rr.top+rr.height/2);const q=e&&e.closest('[data-quest]');tq=q?q.getAttribute('data-quest'):null;}
  return {title:(panel.querySelector('p')?.textContent||'').trim(), tq, hasRing:!!ring,
    hasFinish:[...panel.querySelectorAll('button')].some(b=>/Finish/i.test(b.textContent||'')),
    hasRoute:[...panel.querySelectorAll('button')].some(b=>/Go to My Seekers/i.test(b.textContent||'')),
    path:location.pathname};
});

// Wait for the tutorial to hold still before reading it, the way
// quest-roles.js already does. A reading taken while the page is still scrolling
// the target into place is a reading of the scroll, not of the route, and the
// click that follows it lands on whatever happened to be under the ring. On
// WebKit, whose smooth scrolls run longer, that alone made runs differ. Six
// seconds is generous; a step that is still unsettled after it is recorded as
// what it is, and the route check below fails on it.
const settle=async(p,ms=6000)=>{
  const until=Date.now()+ms; let prev=null; let st=await read(p);
  while(Date.now()<until){
    const decidable=st.none||st.hasFinish||!!st.tq||(st.hasRoute&&!st.hasRing);
    const key=JSON.stringify([st.title,st.tq,st.hasRoute,st.hasFinish,!!st.none]);
    if(decidable&&key===prev) return st;
    prev=decidable?key:null;
    await p.waitForTimeout(300); st=await read(p);
  }
  return st;
};

(async()=>{
  // ONE persistent context: the same browser, the same demo data, three runs.
  const ctx=await chromium.launchPersistentContext(`${OUT}/profile-repeat`,{
    ...launchOptions, viewport:{width:412,height:790}});
  const page=ctx.pages()[0]||await ctx.newPage();
  const seqs=[];
  for(let run=1;run<=6;run++){
    await page.goto(`${BASE}/`,{waitUntil:'networkidle'});
    await page.waitForTimeout(700);
    // The front door asks who you are before it starts anything.
    //
    // It used to be one button that signed everybody in as the sample missionary.
    // Now there is a walk per participant and the first choice is which one, so
    // this suite — which is about the MISSIONARY walk — says so explicitly rather
    // than pressing whatever button happens to mention "tutorial". Without this it
    // pressed a button that only scrolls to the chooser, started nothing, and then
    // failed against /login.
    const begin = page.locator('[data-quest-track="dm"]').first();
    if(await begin.count()) await begin.click();
    await page.waitForTimeout(2400);
    const c=page.getByRole('button',{name:/I understand|Continue|Got it/i});
    if(await c.count()){await c.first().click().catch(()=>{});await page.waitForTimeout(600);}
    const seq=[]; let last='',rep=0;
    for(let i=0;i<12;i++){
      const st=await settle(page);
      if(st.none){seq.push('GONE');break;}
      if(st.hasFinish){seq.push('FINISH');await page.getByRole('button',{name:/Finish/i}).first().click();await page.waitForTimeout(1200);break;}
      const k=`${st.title}@${st.tq??(st.hasRoute?'ROUTE':'NOTHING')}`;
      if(k===last){rep++;}else{rep=0;last=k;}
      if(rep>=2){seq.push('STUCK:'+k);break;}
      seq.push(k);
      if(st.hasRoute&&!st.tq){await page.getByRole('button',{name:/Go to My Seekers/i}).first().click();await page.waitForTimeout(1600);continue;}
      // Key on the quest target, never on the panel's rendered text. The
      // panel gained a location breadcrumb above the title when the tutorial
      // started teaching where you are, so `title` is now the breadcrumb and
      // a /send a message/ match here silently stopped firing — the step then
      // fell through to the generic click, which pressed Send on an empty box
      // and reported the tutorial as stuck when it was not.
      if(st.tq==='chat-send'){
        const ta=page.locator('[data-quest="chat-send"] textarea').first() /* not getByLabel('Message'): the Message button matches that too (30 September 2026) */;
        if(await ta.count()){await ta.fill('hello');await page.waitForTimeout(200);
          const s=page.getByRole('button',{name:/^send$/i}).first();
          if(await s.count())await s.click();await page.waitForTimeout(1300);continue;}
      }
      const did=await page.evaluate(()=>{const r=[...document.querySelectorAll('div')].find(d=>(d.style.boxShadow||'').includes('9999px'));
        if(!r)return false;const rr=r.getBoundingClientRect();const e=document.elementFromPoint(rr.left+rr.width/2,rr.top+rr.height/2);
        if(!e||e.closest('[aria-label="Beacon tutorial"]'))return false;(e.closest('button,a,[role="tab"]')||e).click();return true;});
      if(!did){seq.push('NOCLICK');break;}
      await page.waitForTimeout(1600);
    }
    seqs.push(seq);
    console.log(`\n=== SAME-BROWSER run ${run} ===`);
    seq.forEach((s,i)=>console.log(`  ${i+1}. ${s}`));
    await page.screenshot({path:`${OUT}/repeat-${run}.png`});
  }
  const same=seqs.every(s=>JSON.stringify(s)===JSON.stringify(seqs[0]));
  ok(same,'six runs in the SAME browser follow the identical route');
  ok(!seqs.some(s=>s.some(x=>/STUCK|NOCLICK/.test(x))),'no run got stuck in the same browser');
  seqs.forEach((s,i)=>{ if(JSON.stringify(s)!==JSON.stringify(seqs[0])) console.log(`   run ${i+1} diverged: ${JSON.stringify(s)}`); });
  console.log(bad===0?'\nRESULT: ALL OK':`\nRESULT: ${bad} FAILURE(S)`);
  await ctx.close(); process.exit(bad===0?0:1);
})();
