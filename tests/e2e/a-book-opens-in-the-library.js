// An EPUB opens in My Files, reads like a book, and a hostile one does nothing.
//
// Asked for on 15 November 2026: a book on the device could not be read in the
// app. This puts a three-chapter EPUB on the device (named .epub with no type,
// as some browsers report it), opens it with Read and checks the words and the
// picture are drawn, pages turn by button, key and a tap at the edge, the
// contents jump to a section and land on its page, a link inside the book
// follows and an outside one does nothing, Scroll swaps pages for one long
// chapter, a look and a size change the page, and the place is remembered. At
// a phone, a pad and a computer's width. Then the books that must NOT work: one
// full of scripts, handlers, remote pictures, forms and frames (nothing may run
// or be fetched), a 40 MB zip bomb in a small file, and a file that is no book.
//
//   npm run build && node scripts/run-next.mjs start -p 4394
//   node tests/e2e/a-book-opens-in-the-library.js 4394

const { chromium, launchOptions, isCancelledPrefetch } = require('./_playwright');
const fixture = require('./_epub-fixture');
const PORT = process.argv[2] || '4394';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

async function start(browser, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => { if (!isCancelledPrefetch(e.message)) errors.push(e.message); });
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const maria = page.getByText(/Maria Santos/i).first();
  if (await maria.count()) await maria.click();
  await page.waitForTimeout(1200);
  await page.goto(`${BASE}/library?room=mine`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  return { context, page, errors, requests };
}

async function addBook(page, name, buffer) {
  await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType: '', buffer });
  const card = page.locator('[data-panel="device-file"]', { hasText: name });
  await card.first().waitFor({ timeout: 15000 });
  return card.first();
}

const frameEval = (page, fn, arg) => page.evaluate(([src, a]) => {
  const f = document.querySelector('[data-epub-frame]');
  if (!f || !f.contentDocument) return null;
  // eslint-disable-next-line no-new-func
  return new Function('doc', 'win', 'frame', 'arg', `return (${src})(doc, win, frame, arg)`)(f.contentDocument, f.contentWindow, f, a);
}, [fn.toString(), arg]);

const showing = (page, words) => page.waitForFunction((w) => {
  const f = document.querySelector('[data-epub-frame]');
  return f && f.style.opacity === '1' && f.contentDocument && f.contentDocument.body.textContent.includes(w);
}, words, { timeout: 15000 });
const place = (page) => page.locator('[data-epub-place]').innerText();
const ready = (page) => page.waitForFunction(() => {
  const f = document.querySelector('[data-epub-frame]');
  return f && f.style.opacity === '1' && f.contentDocument && f.contentDocument.body.textContent.length > 10;
}, null, { timeout: 15000 });

async function walk(browser, viewport) {
  const tag = `${viewport.width}px`;
  const { context, page, errors } = await start(browser, viewport);
  const card = await addBook(page, 'sample.epub', fixture.sample());
  const read = card.getByRole('button', { name: /^Read$/ });
  ok((await read.count()) === 1, `${tag}: an EPUB on the device offers Read (found by its name; the browser gave no type)`);
  await read.click();
  const reader = page.locator('[data-epub-reader]');
  await reader.waitFor({ timeout: 15000 });
  await ready(page);
  ok(/Sample Book/.test(await reader.innerText()), `${tag}: the book's own title is shown`);
  ok(await frameEval(page, (d) => d.body.textContent.includes('First paragraph 1.')), `${tag}: the first chapter's words are drawn`);
  ok(await frameEval(page, (d) => { const i = d.querySelector('img'); return !!i && i.src.startsWith('data:image/png') && i.naturalWidth > 0; }), `${tag}: its picture is read out of the book and drawn`);
  const first = await place(page);
  const total = Number(/of (\d+)/.exec(first)?.[1] ?? 0);
  ok(/page 1 of \d+/.test(first) && total > 1, `${tag}: Book opens on page 1 of ${total}`);

  const next = page.locator('[data-epub-bar]').getByRole('button', { name: 'Next' });
  await next.click();
  await page.waitForTimeout(300);
  ok(/page 2 of/.test(await place(page)), `${tag}: Next turns the page`);
  ok(await frameEval(page, (d, w) => Math.abs(d.documentElement.scrollLeft - w.innerWidth) < 2), `${tag}: and the page lands exactly one screen along`);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  ok(/page 3 of/.test(await place(page)), `${tag}: the right arrow key turns it too`);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(250);
  ok(/page 2 of/.test(await place(page)), `${tag}: and the left arrow turns back`);
  const frameBox = await page.locator('[data-epub-frame]').boundingBox();
  await page.mouse.click(frameBox.x + frameBox.width * 0.93, frameBox.y + frameBox.height * 0.5);
  await page.waitForTimeout(300);
  ok(/page 3 of/.test(await place(page)), `${tag}: a tap at the right edge turns the page`);
  await page.mouse.click(frameBox.x + frameBox.width * 0.06, frameBox.y + frameBox.height * 0.5);
  await page.waitForTimeout(300);
  ok(/page 2 of/.test(await place(page)), `${tag}: a tap at the left edge turns it back`);

  // The bar and the frame fit the screen.
  const bar = await page.locator('[data-epub-bar]').boundingBox();
  ok(!!bar && bar.y + bar.height <= viewport.height + 1, `${tag}: the page buttons stay on screen`);
  ok(!(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)), `${tag}: the page behind does not scroll sideways`);

  // Contents jump to a section and land on its own page.
  await reader.locator('[data-epub-contents]').click();
  const panel = reader.locator('[data-epub-contents-panel]');
  ok((await panel.locator('nav').getByRole('button').count()) === 4, `${tag}: Contents lists the book's own list (3 chapters and a section)`);
  await panel.getByRole('button', { name: 'Section 2.1' }).click();
  await showing(page, 'Deeper paragraph 1.');
  await page.waitForTimeout(400);
  const landed = await frameEval(page, (d, w) => { const r = d.getElementById('sec').getBoundingClientRect(); return r.left >= 0 && r.left < w.innerWidth; });
  ok(landed === true, `${tag}: a section in the contents is brought onto the page that holds it`);
  ok(/Chapter Two|Section 2.1/.test(await place(page)), `${tag}: and the bar says where you are (${(await place(page)).split('·')[0].trim()})`);

  // Links: one inside the book follows, one outside the book does nothing.
  await reader.locator('[data-epub-contents]').click();
  await panel.getByRole('button', { name: 'Chapter One' }).click();
  await showing(page, 'First paragraph 1.');
  const links = await frameEval(page, (d) => ({
    inside: d.querySelectorAll('a[data-to]').length,
    anyHref: d.querySelectorAll('[href]').length,
    outsideText: d.body.textContent.includes('an outside link'),
  }));
  ok(links.inside === 1 && links.anyHref === 0 && links.outsideText, `${tag}: a link inside the book is kept; the outside one is only words, with no address left`);
  await frameEval(page, (d) => d.querySelector('a[data-to]').scrollIntoView());
  await page.waitForTimeout(200);
  const urlBefore = page.url();
  await frameEval(page, (d) => d.querySelector('a[data-to]').click());
  await showing(page, 'Second paragraph 1.');
  await page.waitForTimeout(400);
  ok(page.url() === urlBefore, `${tag}: following a link never leaves the app`);
  ok(await frameEval(page, (d) => d.body.textContent.includes('Second paragraph 1.')), `${tag}: the link inside the book opens the chapter it points to`);

  // A look and a size.
  await reader.locator('[data-epub-look]').click();
  const pagesNow = Number(/of (\d+)/.exec(await place(page))?.[1]);
  await reader.getByRole('button', { name: 'Larger text' }).click();
  await reader.getByRole('button', { name: 'Larger text' }).click();
  await page.waitForTimeout(400);
  const pagesBigger = Number(/of (\d+)/.exec(await place(page))?.[1]);
  ok(pagesBigger > pagesNow, `${tag}: larger text makes more pages (${pagesNow} to ${pagesBigger})`);
  await reader.getByRole('button', { name: /Night/ }).click();
  await page.waitForTimeout(300);
  ok(await frameEval(page, (d, w) => w.getComputedStyle(d.documentElement).backgroundColor === 'rgb(20, 24, 31)'), `${tag}: Night changes the page's colours`);
  await reader.getByRole('button', { name: /Paper/ }).click();
  await reader.locator('[data-epub-look]').click();

  // Scroll swaps pages for one long chapter.
  await reader.locator('[data-epub-mode]').click();
  await page.waitForTimeout(500);
  ok(await frameEval(page, (d) => d.documentElement.getAttribute('data-mode') === 'scroll' && d.documentElement.scrollHeight > d.documentElement.clientHeight), `${tag}: Scroll shows the chapter as one long page`);
  ok(/part 2 of 3/.test(await place(page)), `${tag}: and the bar counts parts`);
  await page.locator('[data-epub-bar]').getByRole('button', { name: 'Next part' }).click();
  await showing(page, 'THE END MARKER');
  await page.waitForTimeout(300);
  ok(await frameEval(page, (d) => d.body.textContent.includes('THE END MARKER')), `${tag}: Next part opens the next chapter`);
  ok(await page.locator('[data-epub-bar]').getByRole('button', { name: 'Next part' }).isDisabled(), `${tag}: the last part has no Next`);
  await reader.locator('[data-epub-mode]').click();
  await page.waitForTimeout(400);

  // The place is remembered.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok((await reader.count()) === 0, `${tag}: Escape closes the reader`);
  await card.getByRole('button', { name: /^Read$/ }).click();
  await showing(page, 'THE END MARKER');
  ok(/Chapter Three/.test(await place(page)), `${tag}: opening the book again returns to where it was left (${(await place(page)).split('·')[0].trim()})`);
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('hb-epub-prefs')).mode === 'book'), `${tag}: the look you chose is remembered for next time`);
  await page.keyboard.press('Escape');

  ok(errors.length === 0, `${tag}: no script errors${errors.length ? `: ${errors[0]}` : ''}`);
  await context.close();
}

async function hostile(browser) {
  const viewport = { width: 390, height: 844 };
  const { context, page, errors, requests } = await start(browser, viewport);
  const card = await addBook(page, 'hostile.epub', fixture.hostile());
  await card.getByRole('button', { name: /^Read$/ }).click();
  await page.locator('[data-epub-reader]').waitFor({ timeout: 15000 });
  await ready(page);
  await page.waitForTimeout(1500);
  const seen = await frameEval(page, (d, w) => ({
    words: d.body.textContent,
    banned: d.body.querySelectorAll('script,iframe,object,embed,form,input,button,link,style,svg,base,meta').length,
    handlers: Array.from(d.body.querySelectorAll('*')).filter((e) => Array.from(e.attributes).some((a) => /^on/i.test(a.name) || a.name === 'style')).length,
    hrefs: d.body.querySelectorAll('[href],[src^="http"],[srcset]').length,
    images: Array.from(d.images).map((i) => i.src.slice(0, 15)),
    pwnedInFrame: w.__pwned,
    csp: d.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,
  }));
  ok(/VISIBLE WORDS/.test(seen.words) && /KEPT TEXT/.test(seen.words), 'hostile: the book\'s own words are still readable');
  ok(seen.banned === 0, `hostile: no script, frame, object, form, style, link or svg survives the chapter (${seen.banned} found)`);
  ok(seen.handlers === 0, `hostile: no event handler or style attribute survives (${seen.handlers} found)`);
  ok(seen.hrefs === 0, `hostile: no address of any kind survives (${seen.hrefs} found)`);
  ok(seen.images.length === 1 && seen.images[0].startsWith('data:image/png'), `hostile: the remote picture is gone and the book's own picture stays (${seen.images.join(', ')})`);
  ok(seen.pwnedInFrame === undefined && (await page.evaluate(() => window.__pwned)) === undefined, 'hostile: no script ran, in the chapter or in the app');
  ok(/default-src 'none'/.test(seen.csp ?? ''), 'hostile: the chapter carries a policy that loads nothing');
  const sandbox = await page.locator('[data-epub-frame]').getAttribute('sandbox');
  ok(sandbox === 'allow-same-origin', `hostile: the frame is sandboxed with no scripts (${sandbox})`);
  ok(requests.filter((u) => u.includes('example.invalid')).length === 0, 'hostile: nothing was requested from any outside address');

  // What a sandbox must refuse, tried from inside: a script placed in the frame by force does not run.
  const forced = await frameEval(page, (d, w) => {
    const s = d.createElement('script'); s.textContent = 'window.__forced = 1'; d.body.appendChild(s);
    const i = d.createElement('img'); i.src = 'x'; i.setAttribute('onerror', 'window.__forced = 2'); d.body.appendChild(i);
    return true;
  });
  await page.waitForTimeout(500);
  ok(forced && (await frameEval(page, (d, w) => w.__forced)) === undefined, 'hostile: even a script forced into the frame by hand does not run (the sandbox)');
  ok(errors.length === 0, `hostile: no script errors${errors.length ? `: ${errors[0]}` : ''}`);
  await context.close();
}

async function broken(browser, name, buffer, words) {
  const { context, page } = await start(browser, { width: 390, height: 844 });
  const card = await addBook(page, name, buffer);
  const started = Date.now();
  await card.getByRole('button', { name: /^Read$/ }).click();
  const alert = page.locator('[data-epub-reader] [role="alert"]');
  await alert.waitFor({ timeout: 20000 });
  const said = await alert.innerText();
  ok(words.test(said), `${name}: refused in plain words ("${said.slice(0, 70)}") in ${Date.now() - started} ms`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  ok((await page.locator('[data-epub-reader]').count()) === 0, `${name}: the app is still alive and the reader closes`);
  await context.close();
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  for (const viewport of [{ width: 390, height: 844 }, { width: 820, height: 1180 }, { width: 1366, height: 900 }]) await walk(browser, viewport);
  await hostile(browser);
  await broken(browser, 'bomb.epub', fixture.bomb(), /too large/);
  await broken(browser, 'notabook.epub', Buffer.from('this is not a zip file at all, only some words'), /not a book/);
  await browser.close();
  console.log(bad === 0 ? '\nA book opens in the library.' : `\n${bad} failed.`);
  process.exit(bad === 0 ? 0 : 1);
})();
