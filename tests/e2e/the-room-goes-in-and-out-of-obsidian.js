// A study room becomes an Obsidian vault, and a vault becomes a study room.
//
// ---------------------------------------------------------------------------
// tests/a-room-can-become-a-vault.mjs already holds the half that can be
// checked without a browser -- the filenames, the front matter, and a zip that
// Info-ZIP and Python both agree is a zip. What it cannot check is the half
// that needs a live editor: that a page's BLOCKS become Markdown through
// AFFiNE's own adapters, and that Markdown becomes blocks again.
//
// SO THIS WALK DOES THE ROUND TRIP. It writes a page, takes the copy, opens
// the downloaded zip on disk with a real `unzip`, and reads what is inside.
// Then it feeds a Markdown file back in and asks the shelf whether the page
// arrived with its title, its tag and its folder.
//
//   node tests/e2e/the-room-goes-in-and-out-of-obsidian.js [port]
// ---------------------------------------------------------------------------
const { chromium, launchOptions } = require('./_playwright');
const { signInAsExplorer, openStudyRoom, newPage, backToShelf, shelfRows } = require('./_study');
const { execFileSync } = require('node:child_process');
const os = require('node:os'), fs = require('node:fs'), path = require('node:path');

const BASE = `http://localhost:${process.argv[2] || '3100'}`;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-vault-e2e-'));
  const ctx = await chromium.launchPersistentContext(dir, {
    ...launchOptions, viewport: { width: 1280, height: 900 }, acceptDownloads: true,
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

  await signInAsExplorer(page, BASE);
  await openStudyRoom(page, BASE);

  // ---- write something worth exporting ------------------------------------
  await newPage(page);
  await page.waitForTimeout(1000);
  // THE TITLE HAS ITS OWN FIELD, and typing into the editor does not reach it.
  // The first version of this walk typed the title into the body and then
  // reported that the export had not used it -- the page really was called
  // "Page 3", and the export was right.
  await page.getByLabel('Name this page').fill('Grace abounds');
  await page.getByLabel('Name this page').blur();
  await page.waitForTimeout(600);
  await page.locator('affine-paragraph').first().click();
  await page.waitForTimeout(300);
  await page.keyboard.type('The grace of God appeared.');
  await page.waitForTimeout(800);

  // A PICTURE ON THE PAGE, because a page of writing is not the hard case.
  // Pasting is the path that works without a file dialog this sandbox cannot
  // raise; the block it produces is the same one either way.
  await page.evaluate(() => {
    const host = document.querySelector('editor-host');
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'bible.png', { type: 'image/png' }));
    const target = document.querySelector('affine-paragraph rich-text') || host;
    target.dispatchEvent(new ClipboardEvent('paste', {
      clipboardData: dt, bubbles: true, cancelable: true, composed: true,
    }));
  });
  await page.waitForTimeout(4000);
  ok(await page.locator('affine-image').count() > 0, 'a picture is on the page before the copy is taken');

  const tagBox = page.getByLabel('Add a tag to this page');
  if (await tagBox.count()) {
    await tagBox.fill('Romans');
    await page.getByRole('button', { name: /^Add the tag/i }).click();
    await page.waitForTimeout(700);
  }
  await backToShelf(page);
  await page.waitForTimeout(800);

  // ---- 1. TAKE A COPY -----------------------------------------------------
  const take = page.getByRole('button', { name: /Take a copy for Obsidian/i });
  ok(await take.count() > 0, 'the room offers to hand itself over');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }).catch(() => null),
    take.click(),
  ]);
  ok(!!download, 'pressing it produces a file');

  let listing = '';
  let body = '';
  if (download) {
    const zipPath = path.join(dir, 'vault.zip');
    await download.saveAs(zipPath);
    ok(fs.statSync(zipPath).size > 0, `the file has something in it (${fs.statSync(zipPath).size} bytes)`);

    // The oracle is a real unzip, not our own reader.
    let tested = '';
    try { tested = execFileSync('unzip', ['-t', zipPath], { encoding: 'utf8' }); } catch (e) { tested = String(e); }
    ok(/No errors detected/.test(tested), 'and a real unzip opens it without complaint');

    try { listing = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }); } catch { listing = ''; }
    ok(/\.md$/m.test(listing), `it is full of Markdown (${listing.trim().split('\n').length} files)`);

    const mine = listing.split('\n').find((f) => /Grace abounds\.md$/.test(f));
    ok(!!mine, `the page is in there under its own name (${mine || 'not found'})`);
    if (mine) {
      try { body = execFileSync('unzip', ['-p', zipPath, mine], { encoding: 'utf8' }); } catch { body = ''; }
      ok(/^---\r?\n/.test(body), 'the file opens with front matter');
      ok(/title: Grace abounds/.test(body), 'which names the page');
      ok(/tags:\r?\n\s+- Romans/.test(body), 'and carries the tag, where Obsidian reads tags');
      ok(/The grace of God appeared\./.test(body), 'and the writing itself came through as Markdown');
      ok(/!\[\[[^\]]+\.png\]\]/.test(body),
         'and the picture is embedded the way Obsidian resolves from any folder');
    }

    // THE PICTURE IS IN THE VAULT AS A FILE, and is the file it was.
    const asset = listing.split('\n').find((f) => /^assets\/.+\.png$/.test(f));
    ok(!!asset, `the picture is a file in the vault (${asset || 'not found'})`);
    if (asset) {
      let bytes = Buffer.alloc(0);
      try { bytes = execFileSync('unzip', ['-p', zipPath, asset], { encoding: 'buffer' }); } catch { /* reported below */ }
      ok(bytes.length > 0 && bytes[0] === 0x89 && bytes.toString('latin1', 1, 4) === 'PNG',
         `and it is a real PNG when it comes out (${bytes.length} bytes)`);
    }

    // ---- THE WHOLE CIRCLE: the vault we just made, brought back in --------
    const beforeCircle = await shelfRows(page).count();
    await page.setInputFiles('input[aria-label="Bring in Markdown or a zipped vault"]', zipPath);
    await page.waitForTimeout(12000);
    ok(await shelfRows(page).count() > beforeCircle,
       `the vault can be brought back in (${beforeCircle} -> ${await shelfRows(page).count()})`);

    // EVERY COPY, AND THE PICTURE HAS TO HAVE LOADED. Two things were wrong
    // with the first version of this and they hid each other.
    //
    // It opened `.last()` of the pages called "Grace abounds", and after an
    // import there are two -- the newest first, so `.last()` was the ORIGINAL
    // page, which of course still had its picture. And it asked only whether
    // an `affine-image` element existed. A picture whose bytes never arrived
    // is STILL an affine-image: BlockSuite renders its placeholder, which
    // reads "Image -1B" and contains no <img> at all.
    //
    // So: check them all, and ask the browser whether the picture actually
    // decoded. With the import deliberately broken, the imported copy reports
    // no <img> and this goes red, which the old version did not.
    const copies = page.locator('ul[aria-label^="Pages:"] li', { hasText: 'Grace abounds' });
    const howMany = await copies.count();
    ok(howMany >= 2, `both the original and the imported page are on the shelf (${howMany})`);
    for (let i = 0; i < howMany; i++) {
      await copies.nth(i).click();
      await page.waitForTimeout(4000);
      const shown = await page.evaluate(() => {
        const block = document.querySelector('affine-image');
        if (!block) return { block: false, loaded: false, says: '' };
        const img = block.querySelector('img') ?? block.shadowRoot?.querySelector('img');
        return {
          block: true,
          loaded: !!img && img.naturalWidth > 0,
          says: (block.innerText || '').trim().slice(0, 30),
        };
      });
      ok(shown.block, `page ${i + 1} of ${howMany} still holds a picture block`);
      ok(shown.loaded,
         `and its picture actually loaded${shown.loaded ? '' : ` (shows "${shown.says}" instead)`}`);
      await backToShelf(page);
      await page.waitForTimeout(800);
    }
  }

  // ---- 2. BRING ONE BACK IN ----------------------------------------------
  const mdPath = path.join(dir, 'Ang Biyaya.md');
  fs.writeFileSync(mdPath,
    '---\ntitle: Ang Biyaya\ntags:\n  - Grace\n  - Tagalog\n---\n\n'
    + '# Ang Biyaya\n\nAng biyaya ng Diyos ay sapat.\n\n- una\n- pangalawa\n');

  const before = await shelfRows(page).count();
  await page.setInputFiles('input[aria-label="Bring in Markdown or a zipped vault"]', mdPath);
  await page.waitForTimeout(6000);
  const after = await shelfRows(page).count();
  ok(after > before, `a Markdown file becomes a page on the shelf (${before} -> ${after})`);

  const row = page.locator('ul[aria-label^="Pages:"] li', { hasText: 'Ang Biyaya' }).first();
  ok(await row.count() > 0, 'under the title its front matter gave it');

  // The tags it arrived with should now be offered as ways to narrow the shelf.
  const shelfText = await page.locator('main, body').first().innerText();
  ok(/Tagalog/.test(shelfText), 'and the tags from its front matter came with it');

  // And the writing survived the trip in.
  if (await row.count()) {
    await row.click();
    await page.waitForTimeout(3000);
    const text = await page.evaluate(() => document.querySelector('editor-host')?.innerText || '');
    ok(/Ang biyaya ng Diyos ay sapat/.test(text), 'the words are on the page');
    ok(/una/.test(text) && /pangalawa/.test(text), 'and so is the list under them');
  }

  ok(errors.length === 0, `no page errors (${errors.slice(0, 2).join(' | ') || 'none'})`);

  await ctx.close();
  console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
