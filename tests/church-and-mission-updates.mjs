// Church & Mission Updates on Home: official news, read safely.
//
// Asked for on 12 November 2026.. The founder chose official feeds, read automatically.
//
// WHAT HAS TO STAY TRUE:
//   * a member's phone asks this app's own server and nothing else;
//   * the server fetches only the addresses written in the code, never one a
//     caller names, and says who it is honestly;
//   * a story is plain text and a link on the organisation's own site;
//   * a feed that refuses (both official sites answered an automatic reader
//     with a security checkpoint on the day this was written) is "no stories",
//     and Home still offers that organisation's news page;
//   * the tutorial fetches nothing.
//
//   node tests/church-and-mission-updates.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAX_STORIES, hostsOf, mentioning, ownLink, parseFeed, plain } from '../lib/updates/feed.ts';
import { ORGANISATIONS, WORLD_CHURCH, featured, organisation } from '../lib/updates/organisations.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// ---- 1. Reading a feed ----
const hosts = hostsOf(['https://news.adventist.asia/feed', 'https://news.adventist.asia/all']);
const item = (title, link, body = '') =>
  `<item><title>${title}</title><link>${link}</link><description>${body}</description><pubDate>Tue, 03 Nov 2026 08:00:00 GMT</pubDate></item>`;
const rss = (items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>News</title>${items.join('')}</channel></rss>`;
{
  const [story] = parseFeed(rss([
    item('<![CDATA[Leaders &amp; learners in Southern Luzon]]>', 'https://news.adventist.asia/all/one',
      '<![CDATA[<p>New <b>resources</b>&nbsp;for leaders.</p><script>alert(1)</script>]]>'),
  ]), hosts);
  ok(story?.title === 'Leaders & learners in Southern Luzon', 'a title is read as words: markup out, entities read');
  ok(story?.summary === 'New resources for leaders.', `a summary is plain text, and a script in it leaves nothing behind ("${story?.summary}")`);
  ok(story?.date === '2026-11-03T08:00:00.000Z', 'its date is read');

  const escaped = parseFeed(rss([item('T', 'https://news.adventist.asia/all/two',
    '&lt;p&gt;Fine.&lt;/p&gt;&lt;script&gt;steal()&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;')]), hosts);
  ok(escaped[0]?.summary === 'Fine.', `markup hidden as entities is removed too ("${escaped[0]?.summary}")`);

  const strays = parseFeed(rss([
    item('Elsewhere', 'https://evil.example/x'),
    item('Script', 'javascript:alert(1)'),
    item('Plain http', 'http://news.adventist.asia/all/three'),
    item('Lookalike', 'https://news.adventist.asia.evil.example/x'),
    // Joined here so this file holds nothing shaped like an address with a login.
    item('With a login', ['https://user:pass', 'news.adventist.asia/all/four'].join('@')),
    item('', 'https://news.adventist.asia/all/five'),
    item('Kept', 'https://adventist.asia/news/six'),
  ]), hosts);
  ok(strays.length === 1 && strays[0].title === 'Kept',
     `only an https link on the organisation's own site is kept (${strays.map((s) => s.title).join(', ')})`);

  const atom = parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom</title>'
    + '<link rel="alternate" href="https://adventist.news/news/a"/><summary>S</summary><updated>2026-11-01T00:00:00Z</updated></entry></feed>',
    ['adventist.news']);
  ok(atom.length === 1 && atom[0].link === 'https://adventist.news/news/a', 'an Atom feed is read as well as RSS');

  const many = parseFeed(rss(Array.from({ length: 30 }, (_, i) => item(`Story ${i}`, `https://adventist.asia/n/${i}`))), hosts);
  ok(many.length === MAX_STORIES, `no more than ${MAX_STORIES} stories are taken from one feed`);

  // What both official sites sent an automatic reader on 12 November 2026.
  ok(parseFeed('<!DOCTYPE html><html><head><title>Vercel Security Checkpoint</title></head><body></body></html>', hosts).length === 0
     && parseFeed('', hosts).length === 0 && parseFeed(null, hosts).length === 0,
     'a page that is not a feed is no stories, never an error');

  ok(plain('x'.repeat(500), 220).length <= 221, 'a long summary is cut');
  ok(ownLink('https://ADVENTIST.asia/a', hosts) !== '' && ownLink('ftp://adventist.asia/a', hosts) === '', 'only https is a link');

  const about = mentioning(parseFeed(rss([
    item('Mission in Southern Luzon', 'https://adventist.asia/n/1'),
    item('News from Thailand', 'https://adventist.asia/n/2', 'SLPUM leaders visited.'),
    item('News from Vietnam', 'https://adventist.asia/n/3'),
  ]), hosts), ['Southern Luzon', 'SLPUM']);
  ok(about.length === 2, 'a union published by its division is the stories that name it, in the title or the summary');
}

// ---- 2. The organisations ----
{
  ok(ORGANISATIONS.every((o) => /^[a-z]{2,12}$/.test(o.id)) && new Set(ORGANISATIONS.map((o) => o.id)).size === ORGANISATIONS.length,
     'every organisation has its own id');
  ok(ORGANISATIONS.every((o) => o.news.startsWith('https://') && (!o.feed || o.feed.startsWith('https://'))) && WORLD_CHURCH.startsWith('https://'),
     'every address is https');
  ok(ORGANISATIONS.every((o) => !o.from || (organisation(o.from)?.feed && o.mentions?.length)),
     'an organisation published by another names one that has a feed, and the words to look for');
  // White initials on the tile: 4.5:1 at least.
  const lum = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
  const faint = ORGANISATIONS.filter((o) => 1.05 / (lum(o.colour) + 0.05) < 4.5).map((o) => o.id);
  ok(faint.length === 0, `white initials can be read on every tile${faint.length ? ` (not on: ${faint.join(', ')})` : ''}`);
  ok(featured(undefined).length >= 1 && featured('slpum, ssd,nope,SSD').join() === 'slpum,ssd' && featured('nope').length >= 1,
     'a deployment may name the organisations Home starts with; unknown names are dropped, and the list is never empty');
}

// ---- 3. The server asks only what the code names, and says who it is ----
{
  const route = read('app/api/updates/route.ts');
  ok(/organisation\(new URL\(request\.url\)\.searchParams\.get\('org'\)/.test(route) && !/searchParams\.get\('(url|feed|src)'\)/.test(route),
     'the caller names an organisation, never an address');
  ok(/fetch\(source\.feed,/.test(route) && (route.match(/fetch\(/g) ?? []).length === 1,
     'the one thing fetched is that organisation\'s own feed');
  ok(/'User-Agent': CALLER/.test(route) && /const CALLER = 'OpenSentryBeacon\//.test(route) && !/Mozilla|Chrome|Safari/.test(route),
     'it says who it is, and never calls itself a browser');
  ok(/AbortSignal\.timeout\(/.test(route) && /revalidate: AN_HOUR/.test(route) && /s-maxage=/.test(route),
     'it does not wait for ever, and asks an organisation at most once an hour');
  ok(/status: 404/.test(route), 'an organisation the app does not have is refused');
}

// ---- 4. Home: one tap to every organisation, nothing fetched in the tutorial ----
{
  const ui = read('components/ChurchUpdates.tsx');
  ok(/fetch\(`\/api\/updates\?org=\$\{encodeURIComponent\(id\)\}`\)/.test(ui) && (ui.match(/fetch\(/g) ?? []).length === 1,
     'the screen asks this app\'s own server and nothing else');
  ok(/if \(sample\) return;/.test(ui) && /useState<ByOrg \| null>\(sample \? SAMPLE : null\)/.test(ui) && />Sample</.test(ui),
     'the tutorial fetches nothing: its stories are samples, and say so');
  ok(!/dangerouslySetInnerHTML/.test(ui), 'a story is never drawn as HTML');
  ok((ui.match(/target="_blank" rel="noopener noreferrer"/g) ?? []).length >= 3, 'every link out opens apart from the app, telling the other site nothing about it');
  ok(/data-update-link=\{org\.id\}/.test(ui) && /href=\{org\.news\}/.test(ui),
     'an organisation with no stories to list is still one tap from its own news page');
  ok(/ORGANISATIONS\.map/.test(ui) && /if \(next\.length === 0\) return;/.test(ui) && /WORLD_CHURCH/.test(ui),
     'a person chooses which organisations Home shows, never none, and is pointed to the rest');
  ok(/localStorage\.setItem\(KEPT_KEY/.test(ui) && /kept\[id\] \?\? \[\]/.test(ui), 'with no signal, Home shows what it read last');
  for (const half of ['components/LiveBillboard.tsx', 'components/ChurchBillboard.tsx']) {
    const src = read(half);
    ok(/<ChurchUpdates/.test(src) && src.indexOf('<ChurchUpdates') > src.indexOf('name="posts"'),
       `${half}: the updates are on Home, under the church's own announcements and blog`);
  }
  ok(/<ChurchUpdates sample \/>/.test(read('components/ChurchBillboard.tsx')), 'and the tutorial\'s Home is the sample one');
  ok(/\.home-rise\s*\{[^}]*animation:\s*none/.test(read('app/home.css').split('prefers-reduced-motion: reduce')[1] ?? ''),
     'the cards hold still for somebody who asked their device for less motion');
}

console.log(bad === 0 ? '\nAll Church & Mission Updates checks passed.' : `\n${bad} problem(s).`);
process.exit(bad === 0 ? 0 : 1);
