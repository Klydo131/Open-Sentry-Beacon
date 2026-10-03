// A Guide draws a picture for a lesson series, saves it, and changes it later.
//
// Asked for on 28 September 2026: "Make sure studies feature has Excalidraw on
// it's tools please, and make sure it works." This is the "make sure it works":
// a real browser, the real board, a real drag on the real canvas -- not a check
// that the button exists.
//
// It walks the sample app, because CI has no backend, and the sample app uses
// the same board (components/draw/DrawingBoard.tsx) as the live one. What it
// proves on the way:
//   - the board opens from Draw a picture, and Save waits for a drawing;
//   - a drag with the rectangle tool draws, and Save puts a picture on the form;
//   - the picture is a PNG with the drawing INSIDE it, read back out here;
//   - Change drawing reopens it with the shapes still there, and a second
//     shape is saved alongside the first;
//   - leaving with unsaved changes asks first;
//   - no request leaves the app while drawing: the fonts come from /excalidraw/,
//     and nothing is refused by the Content-Security-Policy;
//   - Simple is where the form starts, and Advanced adds the topic.
//
// Runs on WebKit in CI too (safari.yml), because a canvas is exactly the kind
// of thing engines differ on.
//
//   npm run build && node scripts/run-next.mjs start -p 4382
//   node tests/e2e/a-study-can-have-a-drawing.js 4382

const zlib = require('node:zlib');
const { chromium, launchOptions } = require('./_playwright');

const PORT = process.argv[2] || '4382';
const BASE = `http://localhost:${PORT}`;
const OUT = process.env.E2E_OUT || '';

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const SERIES = `Drawn series ${Date.now().toString(36).slice(-4)}`;

async function signInAs(page, name) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const who = page.getByText(new RegExp(name, 'i')).first();
  if ((await who.count()) === 0) return false;
  await who.click();
  await page.waitForTimeout(1800);
  const consent = page.getByRole('button', { name: /I understand|Continue|Got it/i });
  if (await consent.count()) {
    await consent.first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
  return true;
}

/** The drawing inside a PNG data: URL, read the way Excalidraw writes it. */
function sceneOf(dataUrl) {
  const bytes = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
  if (bytes.subarray(1, 4).toString() !== 'PNG') return null;
  let at = 8;
  while (at < bytes.length) {
    const len = bytes.readUInt32BE(at);
    const type = bytes.subarray(at + 4, at + 8).toString();
    const data = bytes.subarray(at + 8, at + 8 + len);
    if (type === 'tEXt') {
      const zero = data.indexOf(0);
      if (data.subarray(0, zero).toString() === 'application/vnd.excalidraw+json') {
        const outer = JSON.parse(data.subarray(zero + 1).toString('latin1'));
        const inner = outer.compressed
          ? zlib.inflateSync(Buffer.from(outer.encoded, 'binary')).toString('utf8')
          : outer.encoded;
        return JSON.parse(inner);
      }
    }
    at += 12 + len;
  }
  return null;
}

/**
 * Tap a tool on Excalidraw's own toolbar. Each tool is a hidden radio inside a
 * label, so the label is what a person taps and what this taps.
 */
async function pickTool(page, tool) {
  await page.locator(`[data-drawing-board] label:has([data-testid="toolbar-${tool}"])`).first().click();
}

/** Choose a tool on Excalidraw's own toolbar and drag across the canvas. */
async function drawWith(page, tool, from, to) {
  await pickTool(page, tool);
  const canvas = page.locator('[data-drawing-board] canvas.interactive').first();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * from[0], box.y + box.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * ((from[0] + to[0]) / 2), box.y + box.height * ((from[1] + to[1]) / 2), { steps: 4 });
  await page.mouse.move(box.x + box.width * to[0], box.y + box.height * to[1], { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);
}

const saveButton = (page) => page.locator('[data-drawing-board] button', { hasText: /Save drawing|Saving/ }).first();

/**
 * The saved series' drawing, as a data: URL. The sample database holds only
 * its id (lib/demo/drawings.ts keeps the picture in the tab), so the picture
 * is read from the series once it is open: the <img> the Guide sees.
 */
async function savedDrawing(page) {
  const row = page.locator('div.rounded-xl', { hasText: SERIES }).first();
  const img = row.locator('[data-drawing-picture] img').first();
  if (!(await img.count())) return null;
  const src = await img.getAttribute('src');
  const kept = await page.evaluate((title) => {
    for (let i = 0; i < localStorage.length; i++) {
      try {
        const db = JSON.parse(localStorage.getItem(localStorage.key(i)) || 'null');
        const found = db?.lesson_series?.find?.((s) => s.title === title);
        if (found) return found;
      } catch { /* not the database */ }
    }
    return null;
  }, SERIES);
  return { src, row: kept };
}

(async () => {
  const browser = await chromium.launch(launchOptions);
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
  // The install invitation is not what this walk is about. On WebKit it is
  // drawn (Safari never offers its own install), and at 1180 wide its card
  // sat on "+ New series" and took the click (the Safari job, 3 October 2026).
  // Where the card may sit is walked in the-install-prompt-covers-nothing.js.
  await ctx.addInitScript(() => {
    try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 3650 * 864e5)); } catch { /* fine */ }
  });
  const page = await ctx.newPage();

  // Everything the page asks for while drawing, and anything refused.
  const outside = [];
  const refused = [];
  const fonts = [];
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(BASE) && !url.startsWith('data:') && !url.startsWith('blob:')) outside.push(url);
    if (/\.woff2(\?|$)/.test(url)) fonts.push(url);
  });
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) refused.push(m.text().slice(0, 200));
  });

  ok(await signInAs(page, 'Maria Santos'), 'a Guide can sign in');
  await page.goto(`${BASE}/office?room=studies`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.getByRole('button', { name: /^\+ New series$/ }).first().click();
  await page.waitForTimeout(400);

  // ---- Simple first, Advanced when asked -------------------------------------
  const simple = page.getByRole('radio', { name: 'Simple' }).first();
  ok((await simple.getAttribute('aria-checked')) === 'true', 'the form starts on Simple');
  ok((await page.getByLabel('Topic', { exact: true }).count()) === 0, 'and Simple does not ask for a topic');
  await page.getByRole('radio', { name: 'Advanced' }).first().click();
  await page.waitForTimeout(200);
  ok((await page.getByLabel('Topic', { exact: true }).count()) === 1, 'Advanced adds the topic');
  await simple.click();
  await page.waitForTimeout(200);

  await page.getByLabel('Series name').fill(SERIES);
  await page.locator('button[aria-pressed]').first().click();

  // ---- Draw ----------------------------------------------------------------
  await page.getByRole('button', { name: 'Draw a picture' }).first().click();
  await page.locator('[data-drawing-board] canvas.interactive').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);
  ok(await saveButton(page).isDisabled(), 'the board opens, and Save waits until something is drawn');

  await drawWith(page, 'rectangle', [0.3, 0.3], [0.55, 0.6]);
  ok(!(await saveButton(page).isDisabled()), 'a drag with the rectangle tool draws, and Save is ready');

  // Words on the drawing, to make the board load its hand-lettered font.
  await pickTool(page, 'text');
  const canvas = page.locator('[data-drawing-board] canvas.interactive').first();
  const cbox = await canvas.boundingBox();
  await page.mouse.click(cbox.x + cbox.width * 0.65, cbox.y + cbox.height * 0.4);
  await page.keyboard.type('Grace');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  if (OUT) await page.screenshot({ path: `${OUT}/drawing-board.png` });

  await saveButton(page).click();
  await page.locator('[data-drawing-board]').waitFor({ state: 'detached', timeout: 15000 });
  const picture = page.locator('[data-drawing-picture] img').first();
  await picture.waitFor({ timeout: 5000 });
  ok(/^blob:/.test(await picture.getAttribute('src') || ''), 'Save closes the board and the picture is on the form');
  ok(await picture.evaluate((img) => img.complete && img.naturalWidth > 50), 'and it is a real picture, drawn');

  await page.getByRole('button', { name: /Save series/ }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: new RegExp(SERIES) }).first().click();
  await page.waitForTimeout(500);

  const saved = await savedDrawing(page);
  ok(!!saved?.row?.drawing_id && !/data:/.test(JSON.stringify(saved.row)),
    'the series is saved pointing at its drawing, and the sample database does not hold the picture');
  ok(/^data:image\/png;base64,/.test(saved?.src || ''), 'the opened series shows the drawing, as a PNG');
  const scene = saved?.src ? sceneOf(saved.src) : null;
  const kinds = (scene?.elements ?? []).filter((e) => !e.isDeleted).map((e) => e.type);
  ok(kinds.includes('rectangle') && kinds.includes('text'),
    `the drawing itself is inside the picture (${kinds.join(', ') || 'nothing'})`);

  // ---- Change it --------------------------------------------------------------
  await page.getByRole('button', { name: 'Change drawing' }).first().click();
  await page.locator('[data-drawing-board] canvas.interactive').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);
  ok(!(await saveButton(page).isDisabled()), 'Change drawing reopens it with its shapes, ready to save');

  // Opening it to look and closing it again is not a change, so it does not ask.
  await page.locator('[data-drawing-board] header button', { hasText: 'Cancel' }).first().click();
  await page.waitForTimeout(400);
  ok((await page.locator('[data-drawing-board]').count()) === 0
     && (await page.getByText('Leave without saving this drawing?').count()) === 0,
    'opening a drawing and closing it untouched does not ask');
  await page.getByRole('button', { name: 'Change drawing' }).first().click();
  await page.locator('[data-drawing-board] canvas.interactive').first().waitFor({ timeout: 20000 });
  await page.waitForTimeout(1000);

  // Right of centre: on a wide screen the style panel sits over the left of
  // the canvas once a shape tool is chosen, and a drag there draws nothing.
  await drawWith(page, 'ellipse', [0.7, 0.6], [0.88, 0.8]);

  // Leaving with a change nobody saved asks first, and "Keep drawing" keeps it.
  await page.locator('[data-drawing-board] header button', { hasText: 'Cancel' }).first().click();
  ok((await page.getByText('Leave without saving this drawing?').count()) === 1, 'leaving with unsaved changes asks first');
  await page.getByRole('button', { name: 'Keep drawing' }).click();
  await page.waitForTimeout(200);

  await saveButton(page).click();
  await page.locator('[data-drawing-board]').waitFor({ state: 'detached', timeout: 15000 });
  await page.waitForTimeout(500);
  const changed = sceneOf((await savedDrawing(page))?.src || '');
  const after = (changed?.elements ?? []).filter((e) => !e.isDeleted).map((e) => e.type);
  ok(after.includes('rectangle') && after.includes('ellipse') && after.includes('text'),
    `the changed drawing keeps the old shapes and adds the new one (${after.join(', ') || 'nothing'})`);

  // ---- Nothing left the app ---------------------------------------------------
  ok(fonts.some((f) => f.includes('/excalidraw/fonts/')), `the board's fonts come from the app itself (${fonts.length} font requests)`);
  ok(outside.length === 0, outside.length ? `something was asked of another site: ${outside[0]}` : 'nothing was asked of any other site while drawing');
  ok(refused.length === 0, refused.length ? `the security policy refused something: ${refused[0]}` : 'and the security policy refused nothing');

  if (OUT) await page.screenshot({ path: `${OUT}/drawing-on-series.png`, fullPage: false });

  await browser.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
