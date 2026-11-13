// The box you type in is on the screen.
//
// THE BUG, photographed on an Android phone. A Guide opened the conversation
// with their Explorer and the screen ended mid-sentence, on the line about
// photo sizes. The composer and the Send button were below the glass. Dragging
// did not bring them up, because the thread fills nearly the whole screen and
// `overscroll-contain` stops a drag inside it from scrolling the page -- which
// is correct, and left nowhere on the screen to pull.
//
// WHY THIS EXISTS ALONGSIDE tests/live-conversation-mobile.mjs. That file used
// to assert that certain class names appeared in the source, and it passed
// every day this was broken, because class names are not geometry. Worse, one
// of the things it checked for never reached the DOM at all. Only a rectangle
// can answer this question, so this measures one.
//
// WHAT IT DOES AND DOES NOT PROVE. The live conversation renders only behind a
// Supabase session and the browser fixtures deliberately have no live
// credentials, so this cannot open the real screen. It signs in to the sample
// app -- for the REAL header, whose measured height is the number that made the
// arithmetic fail -- and then builds a card with the three attributes the fix
// keys off. So it proves the rules in globals.css hold against a real header at
// real phone sizes. It does not prove the live screen renders those attributes;
// live-conversation-mobile.mjs holds that half.
//
//   npm run build && node scripts/run-next.mjs start -p 4399
//   node tests/e2e/conversation-fits-the-glass.js 4399

const { chromium, launchOptions } = require('./_playwright');
const PORT = process.argv[2] || '4399';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// Portrait first, because that is how a phone is held in a pew. The landscape
// pass is there because a short viewport is the case a height cap gets wrong.
// THE SMALL ONES ARE THE POINT. Four sizes ran here for weeks while the screen
// was broken on eight of the sixteen real sizes this was later swept against,
// because the four included only one small phone and one landscape. A phone
// held sideways is the tightest case there is -- 412px of height, less a header
// -- and it is how people read one-handed. 360x640 is still one of the most
// common Android sizes in the world.
const SCREENS = [
  ['a small phone, upright', 360, 640],
  ['iPhone SE, upright', 375, 667],
  ['a common Android, upright', 412, 915],
  ['iPad mini, upright', 744, 1133],
  ['a phone on its side', 915, 412],
];

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const pick = page.getByText(/Pastor Ramos/i).first();
  if (await pick.count()) await pick.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it|Agree|OK/i });
  if (await consent.count()) await consent.first().click().catch(() => {});
  await page.waitForTimeout(900);
}

/**
 * Build the card and measure it.
 *
 * The heights of the three fixed parts are taken from the real component: the
 * heading is an icon on two lines of text, the note is two lines of small
 * print, and the composer is a control row with the home-indicator padding
 * under it. A long thread, because a short one was never the failing case.
 */
async function measure(page) {
  return page.evaluate(() => {
    document.querySelectorAll('[data-live-conversation]').forEach((n) => n.remove());

    const card = document.createElement('div');
    card.setAttribute('data-live-conversation', '');
    card.className = 'rounded-2xl bg-white shadow-sm ring-1 ring-black/5 overflow-hidden';

    const head = document.createElement('div');
    head.style.height = '74px';
    head.textContent = 'Private conversation';

    const thread = document.createElement('div');
    thread.setAttribute('data-live-thread', '');
    thread.className = 'overflow-y-auto overscroll-contain';
    for (let i = 0; i < 40; i += 1) {
      const line = document.createElement('p');
      line.style.margin = '10px 0';
      line.textContent = `A message that is long enough to wrap on a phone, number ${i}.`;
      thread.append(line);
    }

    const note = document.createElement('p');
    note.style.margin = '0';
    note.textContent = 'Photos are made smaller before they are sent, and the location your '
      + 'camera recorded is removed. Up to 10 MB each. For anything larger, share a link.';

    const composer = document.createElement('form');
    composer.setAttribute('data-live-composer', '');
    composer.style.height = '64px';
    composer.textContent = 'Send';

    card.append(head, thread, note, composer);
    (document.querySelector('main') || document.body).append(card);

    // Bring it up the way a person would: the card is what they are looking at.
    //
    // `instant`, because globals.css sets `scroll-behavior: smooth` on the
    // page. The first version of this measured straight after asking, read the
    // rectangle from BEFORE the scroll, and reported the card 1800px down a
    // 667px screen. The code was right and the test was wrong.
    card.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
}

async function read(page) {
  return page.evaluate(() => {
    const card = document.querySelector('[data-live-conversation]');
    const thread = card.querySelector('[data-live-thread]');
    const composer = card.querySelector('[data-live-composer]');
    const note = composer.previousElementSibling;

    const c = composer.getBoundingClientRect();
    const t = thread.getBoundingClientRect();
    const n = note.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    const header = getComputedStyle(document.documentElement)
      .getPropertyValue('--app-header').trim();
    return {
      composerTop: Math.round(c.top),
      composerBottom: Math.round(c.bottom),
      noteBottom: Math.round(n.bottom),
      cardBottom: Math.round(box.bottom),
      cardTop: Math.round(box.top),
      threadHeight: Math.round(t.height),
      threadScrolls: thread.scrollHeight > thread.clientHeight + 1,
      vh: window.innerHeight,
      header,
    };
  });
}

(async () => {
  const browser = await chromium.launch(launchOptions);

  for (const [label, w, h] of SCREENS) {
    const context = await browser.newContext({
      viewport: { width: w, height: h },
      hasTouch: true,
      isMobile: w < 700,
    });
    const page = await context.newPage();
    await signIn(page);

    await measure(page);
    await page.waitForTimeout(400);
    const m = await read(page);

    // The header is the number the old arithmetic did not know. If it is
    // missing the cap falls back to the whole viewport and the rest of this
    // proves nothing, so it is checked rather than assumed.
    ok(/^\d+px$/.test(m.header) && parseInt(m.header, 10) > 0,
      `${label}: the app header publishes a real height (${m.header || 'MISSING'})`);

    // THE ONE THAT MATTERS. Everything else in this file is here to make this
    // line mean something.
    ok(m.composerBottom <= m.vh,
      `${label}: the box you type in is on the screen (bottom ${m.composerBottom} of ${m.vh})`);
    ok(m.composerTop >= 0,
      `${label}: and not pushed off the top either (top ${m.composerTop})`);

    // The sentence that was cut in half in the photograph.
    ok(m.noteBottom <= m.vh,
      `${label}: the photo note is not cut mid-sentence (bottom ${m.noteBottom} of ${m.vh})`);

    ok(m.cardBottom <= m.vh,
      `${label}: the whole card fits (bottom ${m.cardBottom} of ${m.vh})`);

    // THE ASSERTION THIS FILE WAS MISSING, AND THE REASON IT SHIPPED A BUG IT
    // WAS WRITTEN TO CATCH. The card is `overflow-hidden`. Its fixed children
    // cannot shrink. So when the cap is smaller than the heading, note and
    // composer together, the composer overflows the card and is CLIPPED -- and
    // every assertion above still passes, because two of them measure the card
    // (which dutifully shrank) and one measures a rectangle the browser still
    // reports at full size even while an ancestor is hiding it.
    //
    // On WebKit at 915x412 the card ended at 161 and the composer at 315. A
    // hundred and fifty-four pixels of the only control that sends a message,
    // invisible, with the suite green on that very screen.
    //
    // Being inside the viewport is not the same as being visible. This asks the
    // second question.
    ok(m.composerBottom <= m.cardBottom + 1,
      `${label}: and is inside the card, not clipped out of it `
      + `(composer ${m.composerBottom}, card ends ${m.cardBottom})`);

    // The thread must be the part that gave way, and it must still scroll --
    // a cap that hid the messages instead of the composer is not a fix.
    ok(m.threadScrolls,
      `${label}: the thread still scrolls its own history`);
    ok(m.threadHeight > 60,
      `${label}: and is still worth reading (${m.threadHeight}px)`);

    await context.close();
  }

  await browser.close();
  console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})();
