// The install invitation gets out of the way of a conversation.
//
// WHY THIS EXISTS, AND WHY IT RUNS ON CHROMIUM. The conversation was unusable on
// short screens in Safari and nowhere else, and the reason it was nowhere else
// is the reason it went unnoticed for weeks: `isIos()` is false in headless
// Chromium, so the install bar there is a title and a button. On WebKit it
// renders the Add to Home Screen steps and grows to its ceiling of half the
// viewport. The conversation's cap subtracts whatever the bar is tall, so on a
// 667px screen it was left ~223px for a card whose heading, photo note and
// composer alone want ~292 -- the messages were squeezed to nothing and the box
// you type in was clipped out of a card that is `overflow-hidden`.
//
// The full WebKit CI log said it exactly:
//
//     BAD iPhone SE, upright:   and is still worth reading (0px)
//     BAD a phone on its side:  and is still worth reading (0px)
//
// A suite that only measures what Chromium happens to render cannot see any of
// that. So this builds the tall bar ITSELF -- a fixed element carrying the same
// `data-install-prompt="bar"` attribute and the same ResizeObserver that
// InstallPrompt.tsx uses to publish its height -- and then opens a conversation
// over it. That makes the failure reproducible on any engine, because the bug
// was arithmetic and not an engine quirk.
//
// WHAT IT PROVES. That the rule in globals.css takes the invitation off the
// screen when a conversation is on it, AND that `--install-bar` falls to 0 as a
// consequence, which is the half that actually widens the conversation's cap. A
// test that only asserted `display: none` would pass while the cap stayed
// narrow.
//
//   npm run build && node scripts/run-next.mjs start -p 4399
//   node tests/e2e/the-install-invitation-stands-down.js 4399

const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4399';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// The two short screens WebKit failed on, and nothing else: this is about the
// arithmetic of a small screen, not about coverage.
const SCREENS = [
  ['iPhone SE, upright', 375, 667],
  ['a phone on its side', 915, 412],
];

async function build(page) {
  return page.evaluate(() => {
    document.querySelectorAll('[data-install-prompt="bar"], [data-live-conversation]')
      .forEach((n) => n.remove());

    // The install invitation, as InstallPrompt.tsx renders and measures it.
    const bar = document.createElement('div');
    bar.setAttribute('data-install-prompt', 'bar');
    bar.style.cssText =
      'position:fixed;inset-inline:0;bottom:0;z-index:66;padding:12px;background:#fff';
    const inner = document.createElement('div');
    inner.style.cssText = 'max-height:50dvh;overflow-y:auto;background:#fff';
    for (let i = 0; i < 24; i += 1) {
      const p = document.createElement('p');
      p.style.margin = '8px 0';
      p.textContent = `Tap Share, then Add to Home Screen. Step line ${i}.`;
      inner.append(p);
    }
    bar.append(inner);
    document.body.append(bar);

    // The same publish-on-resize InstallPrompt uses. A hidden element measures
    // zero, which is the whole mechanism this test is here to confirm.
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty('--install-bar', `${Math.ceil(bar.getBoundingClientRect().height)}px`);
    publish();
    new ResizeObserver(publish).observe(bar);

    // AND THE REASON THIS KEEPS REPUBLISHING.
    //
    // WHAT THE WEBKIT LOGS SHOW, which is not in dispute. In three consecutive
    // runs exactly ONE of the two screens read this property back as an empty
    // string, and which screen it was moved between runs -- landscape in two,
    // upright in the third. When it lands it lands correctly (358px at 375x667,
    // 230px at 915x412: 50dvh plus the 12px padding, both times). And the very
    // next assertion on the same screen passes reading `0px`, so the property
    // is there again moments later. That is a race, not a screen size, and not
    // a Safari layout behaviour. I had reported it to the owner as a real
    // iPhone finding. It is not one.
    //
    // WHAT CLEARS IT IS NOT ESTABLISHED. InstallPrompt.tsx mounts on this page
    // and its publishing effect carries no dependency array, so it re-runs on
    // every render and ends at `removeProperty('--install-bar')` whenever its
    // own bar is absent -- which would explain it exactly. I could not prove
    // that: driving /login on Chromium under an iPhone user agent and watching
    // the root's style attribute for 1.5s showed no clear at all. WebKit cannot
    // be run in the sandbox this was written in, so the engine where it happens
    // was never reached. The mechanism above is a candidate, not a finding.
    //
    // WHAT THIS DOES ABOUT IT is not cause-dependent. A fixture standing in for
    // the bar should be the authority on the bar's published height for as long
    // as the walk is looking, whoever else writes to that property. So it
    // restates its own measurement for a second and a half. That cannot mask a
    // real failure of the thing under test: `publish` measures the element, so
    // once a conversation hides the bar this writes 0px, which is precisely
    // what the give-it-back assertion below is there to catch.
    const until = Date.now() + 1500;
    const again = setInterval(() => {
      if (Date.now() > until) { clearInterval(again); return; }
      publish();
    }, 50);
  });
}

const readVar = (page) =>
  page.evaluate(() => getComputedStyle(document.documentElement)
    .getPropertyValue('--install-bar').trim());

async function openConversation(page) {
  return page.evaluate(() => {
    const card = document.createElement('div');
    card.setAttribute('data-live-conversation', '');
    card.className = 'rounded-2xl bg-white overflow-hidden';

    const head = document.createElement('div');
    head.style.height = '74px';

    const thread = document.createElement('div');
    thread.setAttribute('data-live-thread', '');
    thread.className = 'overflow-y-auto overscroll-contain';
    for (let i = 0; i < 40; i += 1) {
      const p = document.createElement('p');
      p.style.margin = '10px 0';
      p.textContent = `A message long enough to wrap on a phone, number ${i}.`;
      thread.append(p);
    }

    const composer = document.createElement('form');
    composer.setAttribute('data-live-composer', '');
    composer.style.height = '64px';

    card.append(head, thread, composer);
    (document.querySelector('main') || document.body).append(card);
    card.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  for (const [label, w, h] of SCREENS) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true });
    const page = await context.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });

    await build(page);
    // Waiting for the number rather than sleeping past it. A fixed 300ms landed
    // on the wrong side of whatever clears it about once per WebKit run.
    await page.waitForFunction(
      () => getComputedStyle(document.documentElement)
        .getPropertyValue('--install-bar').trim() !== '',
      null,
      { timeout: 4000 },
    ).catch(() => {});

    const before = await readVar(page);
    ok(parseInt(before, 10) > 200,
      `${label}: the invitation really is tall to begin with (${before})`);

    await openConversation(page);
    await page.waitForTimeout(400);

    const shown = await page.evaluate(() => {
      const el = document.querySelector('[data-install-prompt="bar"]');
      return el ? getComputedStyle(el).display : 'absent';
    });
    ok(shown === 'none',
      `${label}: with a conversation open the invitation stands down (display: ${shown})`);

    // THE HALF THAT ACTUALLY WIDENS THE CAP. Hiding the bar is worth nothing if
    // the height it published stays behind, because the conversation subtracts
    // that number and not the element.
    const after = await readVar(page);
    ok(parseInt(after, 10) === 0,
      `${label}: and the height it reserved is given back (${before} to ${after})`);

    const m = await page.evaluate(() => {
      const card = document.querySelector('[data-live-conversation]');
      const thread = card.querySelector('[data-live-thread]');
      const composer = card.querySelector('[data-live-composer]');
      return {
        thread: Math.round(thread.getBoundingClientRect().height),
        cardBottom: Math.round(card.getBoundingClientRect().bottom),
        composerBottom: Math.round(composer.getBoundingClientRect().bottom),
        vh: window.innerHeight,
      };
    });

    ok(m.thread > 60, `${label}: so the messages are worth reading (${m.thread}px)`);
    ok(m.composerBottom <= m.cardBottom + 1,
      `${label}: and the box you type in is inside the card, not clipped `
      + `(composer ${m.composerBottom}, card ends ${m.cardBottom})`);
    ok(m.cardBottom <= m.vh, `${label}: the whole card is on the glass (${m.cardBottom} of ${m.vh})`);

    await context.close();
  }

  await browser.close();
  console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})();
