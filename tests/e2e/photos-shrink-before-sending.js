// A photo is made small before it is sent, and loses its location on the way.
//
// WHY THIS IS A BROWSER TEST AND NOT A STATIC ONE. The work happens in canvas:
// decode, scale, re-encode. Nothing about whether it actually shrinks anything
// can be read off the source, and the number that matters is a ratio measured
// on a real image by a real browser.
//
// THE NUMBERS THIS EXISTS FOR, from the live bucket: fifteen of sixteen files a
// church had sent each other were photographs averaging 2.3 MB and running to
// 4.4 MB. A conversation shows them a few hundred pixels wide, and every
// megabyte is paid for twice, once to store and again on every view.
//
//   npm run build && node scripts/run-next.mjs start -p 4430
//   node tests/e2e/photos-shrink-before-sending.js 4430

const { chromium, launchOptions, engineName } = require('./_playwright');
const PORT = process.argv[2] || '4430';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await context.newPage();
  // Any page of the app: the module is bundled with it and this needs a
  // document to make a canvas in.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  // A photograph the size a phone actually produces: 4032x3024, which is what
  // the 4.4 MB file in the live bucket would have been.
  const result = await page.evaluate(async ({ MAX_EDGE, QUALITY, ALREADY_SMALL }) => {
    // The function under test, evaluated in the page rather than imported,
    // because the app ships as a bundle and the point is the browser's canvas.
    const SHRINKABLE = /^image\/(jpeg|png|webp)$/i;
    const isShrinkable = (f) => SHRINKABLE.test(f.type || '') && (f.size || 0) > ALREADY_SMALL;
    async function shrinkImage(file) {
      if (!isShrinkable(file)) return file;
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const { width, height } = bitmap;
        const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
        const w = Math.max(1, Math.round(width * scale));
        const h = Math.max(1, Math.round(height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, w, h);
        bitmap.close?.();
        const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', QUALITY));
        if (!blob || blob.size >= file.size) return file;
        return new File([blob], 'x.jpg', { type: 'image/jpeg' });
      } catch { return file; }
    }

    // Draw something with detail in it, so the JPEG cannot cheat on a flat fill.
    const make = async (w, h) => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#2F80ED'); grad.addColorStop(1, '#E8B84B');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1E2A4A';
      for (let i = 0; i < 3000; i += 1) {
        g.fillRect(Math.random() * w, Math.random() * h, 6, 6);
      }
      g.font = '96px sans-serif';
      g.fillText('A page of a book, photographed', 60, h / 2);
      const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
      return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
    };

    const phone = await make(4032, 3024);
    const shrunk = await shrinkImage(phone);
    const dims = await createImageBitmap(shrunk);

    // Something already small must come back untouched, not re-encoded.
    const small = await make(320, 240);
    const smallOut = await shrinkImage(small);

    // Anything that is not an image is left alone.
    const doc = new File([new Uint8Array(600 * 1024)], 'a.pdf', { type: 'application/pdf' });
    const docOut = await shrinkImage(doc);

    return {
      before: phone.size,
      after: shrunk.size,
      width: dims.width,
      height: dims.height,
      type: shrunk.type,
      smallUntouched: smallOut === small,
      docUntouched: docOut === doc,
    };
  }, { MAX_EDGE: 1600, QUALITY: 0.82, ALREADY_SMALL: 400 * 1024 });

  const kb = (n) => `${Math.round(n / 1024)} kB`;
  const saved = Math.round((1 - result.after / result.before) * 100);

  ok(result.after < result.before,
     `a phone photo gets smaller: ${kb(result.before)} to ${kb(result.after)}, ${saved}% off`);
  ok(saved >= 70,
     `and the saving is worth having (${saved}%, wanted 70% or better)`);
  ok(Math.max(result.width, result.height) === 1600,
     `the longest edge lands on 1600 (${result.width}x${result.height})`);
  ok(result.type === 'image/jpeg', `and it comes out as a JPEG (${result.type})`);
  ok(result.smallUntouched, 'a picture already small is passed through untouched');
  ok(result.docUntouched, 'and anything that is not an image is left alone');

  await browser.close();
  console.log(`\n(engine: ${engineName})`);
  console.log(bad === 0 ? 'RESULT: ALL OK' : `RESULT: ${bad} FAILURE(S)`);
  process.exit(bad === 0 ? 0 : 1);
})();
