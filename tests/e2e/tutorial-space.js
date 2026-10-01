const { chromium, launchOptions, openRoom } = require('./_playwright');
// Takes the port as an argument, like every other suite. Hardcoding it meant
// running against a server on any other port failed with a connection error
// that reads exactly like a broken app.
const BASE = `http://localhost:${process.argv[2] || '4002'}`;
// Screenshots and browser profiles go somewhere writable that is not the
// repo. Overridable so CI can collect them as artifacts.
const OUT = process.env.E2E_OUT ||
  require('node:fs').mkdtempSync(require('node:path').join(require('node:os').tmpdir(), 'beacon-e2e-'));
let bad=0; const ok=(c,m)=>{if(!c)bad++;console.log(`${c?'OK ':'BAD'} ${m}`);};
const stages = (p) => p.evaluate(() => {
  const d = JSON.parse(localStorage.getItem('beacon-demo-v1') || '{}');
  return (d.pairings || []).map(x => `${x.id}:${x.journey_stage}`).sort().join(', ');
});
(async()=>{
  const ctx=await chromium.launchPersistentContext(`${OUT}/profile-space`,{
    ...launchOptions, viewport:{width:412,height:790}});
  const page=ctx.pages()[0]||await ctx.newPage();

  // Explore the demo freely: sign in and advance a seeker by hand.
  await page.goto(`${BASE}/login`,{waitUntil:'networkidle'});
  await page.waitForTimeout(1200);
  const maria=page.getByText(/Maria Santos/i).first();
  if(await maria.count()) await maria.click();
  await page.waitForTimeout(1500);
  const c=page.getByRole('button',{name:/I understand|Continue|Got it/i});
  if(await c.count()){await c.first().click().catch(()=>{});await page.waitForTimeout(600);}
  await page.goto(`${BASE}/dm/pair-grace`,{waitUntil:'networkidle'});
  await page.waitForTimeout(1500);
  await openRoom(page,/Journey/i); // the sections are a drop-down (30 September 2026)
  const adv=page.getByRole('button',{name:/Advance to/i}).first();
  if(await adv.count()){await adv.click();await page.waitForTimeout(1400);}
  const mine = await stages(page);
  console.log('my demo state   :', mine);
  // THE PRECONDITION, ASSERTED RATHER THAN ASSUMED.
  //
  // Every step above is guarded with `if (await x.count())`, so a control this
  // engine renders differently is skipped in silence and the baseline comes out
  // empty. Two restore assertions below then compare against nothing and report
  // a restore failure, which is what WebKit did for days: the real fault was
  // that the setup never ran, and the test named the wrong half of the app.
  //
  // If this line is the one that goes red, read it as "the setup did not
  // happen on this engine", not as anything about the tutorial.
  ok(mine !== '', 'the setup actually put something in my demo data to restore');

  // Run the tutorial.
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
  await page.waitForTimeout(2600);
  const during = await stages(page);
  console.log('during tutorial :', during);
  ok(during !== mine, 'tutorial runs on its own fresh copy, not my data');

  // Advance inside the tutorial, then finish.
  await page.goto(`${BASE}/dm/pair-john`,{waitUntil:'networkidle'});
  await page.waitForTimeout(1400);
  await openRoom(page,/Journey/i); // the sections are a drop-down (30 September 2026)
  const adv2=page.getByRole('button',{name:/Advance to/i}).first();
  if(await adv2.count()){await adv2.click();await page.waitForTimeout(1300);}
  const mutated = await stages(page);
  console.log('after tut change:', mutated);

  // Per-track key. Progress used to live under one key for everybody, so
  // finishing the missionary walk also marked the admin's and the seeker's
  // done. Forcing completion through the old key silently did nothing here:
  // the Finish button never appeared, the tutorial was never finished, and the
  // three restore assertions below failed for a reason that had nothing to do
  // with restoring.
  await page.evaluate(()=>localStorage.setItem('beacon-quest-v1-dm',JSON.stringify({completed:['open','message','advance','share','profile','done']})));
  await page.reload({waitUntil:'networkidle'});
  await page.waitForTimeout(1600);
  const fin=page.getByRole('button',{name:/^Done$|Finish/i}).first();
  if(await fin.count()){await fin.click();await page.waitForTimeout(1600);}

  const after = await stages(page);
  console.log('after finishing :', after);
  ok(after === mine, 'my demo data is restored exactly as I left it');
  ok(after !== mutated, 'tutorial changes did not leak into the demo');
  const snap = await page.evaluate(()=>localStorage.getItem('beacon-demo-pretutorial'));
  ok(snap === null, 'snapshot cleaned up after finishing');

  console.log(bad===0?'\nRESULT: ALL OK':`\nRESULT: ${bad} FAILURE(S)`);
  await ctx.close(); process.exit(bad===0?0:1);
})();
