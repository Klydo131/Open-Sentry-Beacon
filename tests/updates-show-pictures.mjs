// Church & Mission Updates show each story's own photo, safely.
//
// Members found Home's updates all words and no pictures. Two things had to be
// fixed: the two original sources answer an automatic reader with a security
// checkpoint (so there were no stories at all), and a story's photo was never
// read. Feeds that answer from a server were added, and each story's picture is
// fetched by this app's server and handed to the phone as this app's own image.
//
// WHAT HAS TO STAY TRUE:
//   * a phone loads pictures only from this app (the content policy stays
//     img-src 'self'), and the screen refuses any other address;
//   * the picture route is asked for an organisation and a story number,
//     never an address, and fetches only https on that organisation's host;
//   * it follows no redirect, passes only raster images (never SVG), caps the
//     size, and runs nothing;
//   * logos, avatars and thumbnails a feed carries are not taken for photos;
//   * the tutorial shows original drawings, never a church's photos.
//
//   node --experimental-strip-types tests/updates-show-pictures.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let f, o;
try {
  f = await import(pathToFileURL(path.join(root, 'lib/updates/feed.ts')).href);
  o = await import(pathToFileURL(path.join(root, 'lib/updates/organisations.ts')).href);
} catch (e) {
  if (process.env.PICTURES_RETRY) throw e;
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)], { stdio: 'inherit', env: { ...process.env, PICTURES_RETRY: '1' } });
  process.exit(r.status ?? 1);
}

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); };

// ---- 1. Finding a story's photo in a feed ----
const hosts = f.hostsOf(['https://www.example-church.org/feed/', 'https://example-church.org/']);
const rss = (items) => `<?xml version="1.0"?><rss version="2.0"><channel>${items.join('')}</channel></rss>`;
const item = (inner) => `<item><title>A story</title><link>https://example-church.org/a</link>${inner}</item>`;
const one = (inner) => f.parseFeed(rss([item(inner)]), hosts)[0]?.picture ?? '';

ok(one('<media:content url="https://example-church.org/wp-content/uploads/camp.jpg" medium="image"/>') === 'https://example-church.org/wp-content/uploads/camp.jpg',
   'a media:content photo is read');
ok(one('<enclosure url="https://example-church.org/up/b.jpg" type="image/jpeg" length="1"/>') === 'https://example-church.org/up/b.jpg',
   'an image enclosure is read');
ok(one('<content:encoded><![CDATA[<p>Hi</p><img src="https://example-church.org/up/c.webp" />]]></content:encoded>') === 'https://example-church.org/up/c.webp',
   'the first photo in the story text is read');
ok(one('<description>&lt;img src=&quot;https://example-church.org/up/d.png&quot;&gt;</description>') === 'https://example-church.org/up/d.png',
   'a photo in escaped story text is read');
ok(one('<content:encoded><![CDATA[<img src="https://cdn.elsewhere.net/x.jpg"><img src="https://example-church.org/up/e.jpg">]]></content:encoded>') === 'https://example-church.org/up/e.jpg',
   'a photo on another host is passed over for one on the organisation\'s own');
ok(one('<media:content url="http://example-church.org/up/f.jpg"/>') === '', 'only https');
ok(one('<content:encoded><![CDATA[<img src="https://example-church.org/up/cropped-mark-32x32.png"><img src="https://example-church.org/up/site-logo.png"><img src="https://example-church.org/up/g-150x150.jpg"><img src="https://example-church.org/up/x.svg">]]></content:encoded>') === '',
   'logos, site marks, small thumbnails and SVG are not taken for photos');
ok(f.sharedPictureOf('<head><meta property="og:image" content="https://example-church.org/up/share.jpg"></head>', hosts) === 'https://example-church.org/up/share.jpg'
   && f.sharedPictureOf('<meta property="og:image" content="https://tracker.example/x.jpg">', hosts) === '',
   'a story page\'s sharing picture is read, on the organisation\'s own host only');

// ---- 2. Every organisation listed with a feed, and one that does not depend on another ----
ok(o.ORGANISATIONS.filter((x) => x.feed).length >= 6, 'at least six organisations with their own feed');
ok(o.organisation('slpum')?.feed?.startsWith('https://') && !o.organisation('slpum')?.from, 'the Union reads its own feed, not the Division\'s');
ok(o.featured(undefined).some((id) => ['spd', 'iad'].includes(id)), 'a fresh copy follows at least one organisation whose feed carries photos');

// ---- 3. The routes ----
const api = read('app/api/updates/route.ts');
ok(/image: `\/api\/updates\/picture\?org=\$\{org\.id\}&n=\$\{n\}`/.test(api) && /picture: _src/.test(api),
   'a phone is given this app\'s picture address, never the other site\'s');
const pic = read('app/api/updates/picture/route.ts');
ok(/searchParams/.test(pic) && /asked\.get\('org'\)/.test(pic) && /asked\.get\('n'\)/.test(pic) && !/asked\.get\('(url|src|link|image)'\)/.test(pic),
   'the picture route is asked for an organisation and a number, never an address');
ok(/redirect: 'manual'/.test(pic), 'it follows no redirect');
ok(/\^image\\\/\(jpeg\|png\|webp\|gif\|avif\)\$/.test(pic) && !/svg/i.test(pic.split('const PICTURE')[1]?.split('\n')[0] ?? 'svg'),
   'only raster images pass, never SVG');
ok(/MOST_BYTES = 4 \* 1024 \* 1024/.test(pic) && /total > cap/.test(pic), 'the size is capped while reading');
ok(/'X-Content-Type-Options': 'nosniff'/.test(pic) && /default-src 'none'; sandbox/.test(pic), 'what it hands back runs nothing');
ok(/sharedPictureOf\(/.test(pic) && /hostsFor\(org\)/.test(pic), 'a page\'s sharing picture is taken only on the organisation\'s own host');

// ---- 4. The screen ----
const ui = read('components/ChurchUpdates.tsx');
ok(/export function ownPicture/.test(ui) && /\^\\\/api\\\/updates\\\/picture/.test(ui) && /\^\\\/updates\\\/sample-/.test(ui),
   'the screen draws a picture only from this app\'s own addresses');
ok(/data-good-news/.test(ui) && /prefers-reduced-motion: reduce/.test(ui), 'Good News leads with photos and holds still for less motion');
ok(/onError=\{\(\) => \{ setFailed\(true\)/.test(ui), 'a picture that fails falls back to the organisation\'s colours');
const csp = read('next.config.mjs');
ok(!/img-src[^;"]*adventist/.test(csp), 'the content policy was not widened to any church site');
for (const name of ['sunrise', 'community', 'mountains', 'book']) {
  const svg = read(`public/updates/sample-${name}.svg`);
  ok(!/<script|on\w+=|href=/i.test(svg), `the tutorial drawing ${name} is a plain drawing`);
}
ok(/\/updates\/sample-/.test(ui) && /SAMPLE: ByOrg/.test(ui), 'the tutorial shows original drawings');

console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
