// Generate every icon this app serves, from the one definition of the mark.
//
//   npm run icons
//
// Run this after changing the logo (components/SentryBeaconMark.tsx) or the brand
// colours (lib/brand.ts), and commit what it writes. tests/brand-consistency.mjs
// fails if you forget, which is the whole reason it exists —  was a real bug, and the cause was a regenerated component
// with stale icon files still committed beside it.
//
// Two things this has to get right, both learned the hard way:
//
// 1. It writes the filenames the manifest ACTUALLY references. The first
//    version wrote icon.svg and icon-maskable.svg into the beta repo, whose
//    manifest points at icon-beta.svg — so the app kept serving the old
//    lighthouse and the home screen never changed. The manifest is now read and
//    every filename it names gets written.
//
// 2. It emits real PNGs. A home-screen shortcut on iOS uses apple-touch-icon,
//    and iOS does not accept SVG there at all — without a PNG it puts a
//    screenshot of the page on the home screen. Several Android launchers and
//    the Windows/macOS shortcut paths also prefer PNG. SVG alone is why the
//    installed icon looked unchanged.
//
// PNG rasterisation needs a browser. Playwright is not a dependency of this
// project, so when it is absent the SVGs are still written and the PNG step
// says plainly that it was skipped, rather than failing the whole run.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Colours are read out of lib/brand.ts rather than repeated here. A .mjs script
// cannot import a .ts module without a build step, and a second copy of the
// palette is a second thing to forget: change the brand, regenerate, and get
// icons in the OLD colours with nothing complaining.
const brandSrc = fs.readFileSync(path.join(root, 'lib/brand.ts'), 'utf8');
const brandColor = (name, fallback) =>
  new RegExp(`${name}\\s*=\\s*'(#[0-9a-fA-F]{3,8})'`).exec(brandSrc)?.[1] ?? fallback;

const FROM = brandColor('BRAND_FROM', '#2F80ED');
const TO = brandColor('BRAND_TO', '#3EB489');
const NAVY = brandColor('NAVY', '#1E2A4A');

// Kept identical to components/SentryBeaconMark.tsx; tests/brand-consistency.mjs
// fails if these two ever stop matching.
const STROKE = 12.5;
const RING = 'M 29.4 72.7 A 34 34 0 1 1 60.6 81.8';
const TAIL =
  'M 29.4 68.6 C 38 66.7 47 65.7 53.5 65.6 C 56.5 65.6 56.8 68 53.5 68.6 ' +
  'C 45.5 70.2 40.5 75.5 36.2 84 C 30.8 81.4 24.4 78.6 20.1 76.9 Z';

function svg({ from, to, scale, translate, radius = 22 }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <defs>
    <linearGradient id="g" x1="12" y1="18" x2="88" y2="82" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
  </defs>
  <rect width="100" height="100" rx="${radius}" fill="${NAVY}"/>
  <g transform="translate(${translate} ${translate}) scale(${scale})">
    <path d="${RING}" fill="none" stroke="url(#g)" stroke-width="${STROKE}" stroke-linecap="butt"/>
    <circle cx="60.6" cy="81.8" r="${STROKE / 2}" fill="url(#g)"/>
    <path d="${TAIL}" fill="url(#g)"/>
  </g>
</svg>
`;
}

// `any` sits comfortably in the square. `maskable` must survive a launcher
// cropping it to a circle, so the mark shrinks into the 80% safe zone and the
// navy runs to the edges.
const ANY = { scale: 0.82, translate: 9 };
const MASKABLE = { scale: 0.62, translate: 19 };

// Which SVG files to write. Read from the manifest so a repo that names its
// icons differently still gets them regenerated.
const manifestSrc = (() => {
  for (const p of ['app/manifest.ts', 'app/manifest.js']) {
    const full = path.join(root, p);
    if (fs.existsSync(full)) return fs.readFileSync(full, 'utf8');
  }
  return '';
})();

const referenced = [...manifestSrc.matchAll(/src:\s*'(\/icons\/[^']+)'/g)].map((m) => m[1]);
const wanted = new Set(['/icons/icon.svg', '/icons/icon-maskable.svg', ...referenced]);

const written = [];
for (const ref of wanted) {
  if (!ref.endsWith('.svg')) continue;
  const maskable = /maskable/.test(ref);
  const contents = svg({
    from: FROM,
    to: TO,
    ...(maskable ? MASKABLE : ANY),
  });
  const rel = `public${ref}`;
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), contents);
  written.push(rel);
}

// The browser tab icon, served by Next from app/.
fs.writeFileSync(path.join(root, 'app/icon.svg'), svg({ from: FROM, to: TO, ...ANY }));
written.push('app/icon.svg');

for (const w of written) console.log(`wrote ${w}`);

// ---------------------------------------------------------------- PNGs ----
//
// apple-icon.png is the one that decides what a person sees after "Add to Home
// Screen" on an iPhone. Next serves app/apple-icon.png at /apple-icon.png and
// emits the <link rel="apple-touch-icon"> for it automatically.
const PNGS = [
  // iOS home screen. 180 is the largest size iOS asks for; no transparency,
  // because iOS composites onto white and a transparent mark would look wrong.
  { out: 'app/apple-icon.png', size: 180, ...ANY, radius: 0 },
  { out: 'public/icons/icon-192.png', size: 192, ...ANY },
  { out: 'public/icons/icon-512.png', size: 512, ...ANY },
  { out: 'public/icons/icon-512-maskable.png', size: 512, ...MASKABLE, radius: 0 },
];

async function rasterise() {
  let chromium, launchOptions;
  try {
    ({ chromium, launchOptions } = await import(
      pathToFileUrl(path.join(root, 'tests/e2e/_playwright.js'))
    ));
  } catch {
    try {
      ({ chromium } = await import('playwright'));
      launchOptions = {};
    } catch {
      console.log(
        '\nPNG icons SKIPPED — Playwright is not installed, so nothing can\n' +
          'rasterise the SVG. The committed PNGs are unchanged. Install it and\n' +
          're-run if the mark itself changed:  npm i -D playwright',
      );
      return;
    }
  }

  const browser = await chromium.launch(launchOptions);
  for (const { out, size, scale, translate, radius } of PNGS) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    const body = svg({
      from: FROM,
      to: TO,
      scale,
      translate,
      radius: radius ?? 22,
    }).replace('width="100" height="100"', `width="${size}" height="${size}"`);
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;padding:0;background:${NAVY}}</style>${body}`,
    );
    await page.waitForTimeout(60);
    const full = path.join(root, out);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    await page.screenshot({ path: full, omitBackground: false });
    await page.close();
    console.log(`wrote ${out}  (${size}×${size})`);
  }
  await browser.close();
}

function pathToFileUrl(p) {
  return `file://${p}`;
}

await rasterise();
