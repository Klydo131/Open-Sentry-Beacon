const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4001';
const PHASE = process.argv[3] || 'install';
const BASE = `http://localhost:${PORT}`;
// Screenshots and browser profiles go somewhere writable that is not the
// repo. Overridable so CI can collect them as artifacts.
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-e2e-'));
let bad=0; const ok=(c,m)=>{if(!c)bad++;console.log(`${c?'OK ':'BAD'} ${m}`);};

(async()=>{
  const ctx=await chromium.launchPersistentContext(`${OUT}/profile-update`,{
    ...launchOptions, viewport:{width:412,height:820}});
  const page=ctx.pages()[0]||await ctx.newPage();

  await page.goto(`${BASE}/login`,{waitUntil:'networkidle'});
  await page.waitForTimeout(1200);
  const maria=page.getByText(/Maria Santos/i).first();
  if(await maria.count()) await maria.click();
  await page.waitForTimeout(1500);
  const c=page.getByRole('button',{name:/I understand|Continue|Got it/i});
  if(await c.count()){await c.first().click().catch(()=>{});await page.waitForTimeout(700);}

  const sw = await page.evaluate(async()=>{
    if(!('serviceWorker' in navigator)) return 'unsupported';
    const r = await navigator.serviceWorker.ready;
    return r.active ? 'active' : 'none';
  });
  console.log(`service worker: ${sw}`);

  if (PHASE === 'install') {
    await page.waitForTimeout(4000);
    // Prove the version panel exists and shows a real build.
    await page.goto(`${BASE}/settings`,{waitUntil:'networkidle'});
    await page.waitForTimeout(1600);
    const card = await page.getByText(/App version/i).count();
    ok(card>0, 'Settings has an "App version" panel');
    const label = await page.evaluate(()=>{
      const el=[...document.querySelectorAll('h2')].find(e=>/App version/i.test(e.textContent||''));
      return el?.parentElement?.innerText || '';
    });
    console.log('--- version panel ---\n' + label);
    ok(/latest version|new version|Updates run/i.test(label||''), 'panel states whether you are up to date');
    ok(/\w{3} \d{1,2}, \d{4}|\d{1,2} \w{3} \d{4}/.test(label||''), 'panel shows a build date');
    const force = await page.getByRole('button',{name:/Force a fresh copy/i}).count();
    ok(force>0, 'has a "Force a fresh copy" escape hatch');
    // "Check for updates" stays: "did it work?" is a fair question and this is
    // the screen somebody comes to to ask it. "Restart to update" must NOT —
    // it is the decision the owner asked to take off people, and a profile
    // holding a pending worker is exactly when it would reappear.
    const check = await page.getByRole('button',{name:/Check for updates/i}).count();
    ok(check>0, 'offers "Check for updates" so you can ask where you stand');
    const restart = await page.getByRole('button',{name:/Restart to update/i}).count();
    ok(restart===0, 'and never asks you to restart it yourself');
    await page.evaluate(()=>document.querySelector('h2')?.scrollIntoView());
    await page.getByText(/App version/i).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    await page.screenshot({path:`${OUT}/upd-version-panel.png`});
    console.log('\n>>> installed. Now rebuild + restart the server, then run PHASE=update');
  } else {
    // A new build is live. The app should notice and offer a restart.
    await page.goto(`${BASE}/dm`,{waitUntil:'networkidle'});
    await page.waitForTimeout(2000);
    // reg.update() runs on focus; nudge it the same way a real user would.
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    // THE APP APPLIES IT ITSELF. There is no banner and no button any more, so
    // what is proved here is that the page RELOADS onto the new build without
    // anybody touching anything.
    //
    // The old version of this block waited for the words "Update ready" and then
    // clicked Restart. That tested a decision we no longer ask people to make.
    let reloaded=false;
    const before = await page.evaluate(()=>document.body.innerText.slice(0,0)+performance.timeOrigin);
    for(let i=0;i<25;i++){
      await page.waitForTimeout(1500);
      const now = await page.evaluate(()=>performance.timeOrigin).catch(()=>before);
      if(now!==before){reloaded=true;break;}
      await page.evaluate(()=>window.dispatchEvent(new Event('focus'))).catch(()=>{});
    }
    ok(reloaded,'the app applies a new build by itself, with no prompt and no tap');

    // And nothing asked. If either of these ever appears again, the thing the
    // owner asked to remove has come back.
    ok((await page.getByText(/Update ready/i).count())===0,'no update banner is shown');
    ok((await page.getByRole('button',{name:/Restart to update/i}).count())===0,
       'no "Restart to update" button is offered');
  }
  console.log(bad===0?'\nRESULT: ALL OK':`\nRESULT: ${bad} FAILURE(S)`);
  await ctx.close(); process.exit(bad===0?0:1);
})();
