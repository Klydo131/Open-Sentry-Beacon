// Discover cards on Home: what they show, what they refuse, what a skip does.
//
// A study site is a church's recommendation, so the code ships no list: a
// deployment names its own in NEXT_PUBLIC_DISCOVER_LINKS, and every address
// passes the Pocket's gate (tidyUrl, pocketRefusal). This holds those rules,
// and that keeping a card goes through the same checks as the Pocket's form.
//
//   node --experimental-strip-types tests/discover-cards-skip-and-keep.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let d, p;
try {
  d = await import(pathToFileURL(path.join(root, 'lib/discover.ts')).href);
  p = await import(pathToFileURL(path.join(root, 'lib/pocket.ts')).href);
} catch (e) {
  if (process.env.DISCOVER_RETRY) throw e;
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)], { stdio: 'inherit', env: { ...process.env, DISCOVER_RETRY: '1' } });
  process.exit(r.status ?? 1);
}

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); };

// THE SETTING: well-formed entries in, everything else out.
const links = d.discoverLinks([
  'Bible lessons | https://lessons.example.org | Free studies by post or online',
  'Bad scheme | javascript:alert(1) | no',
  'Plain http | http://insecure.example.org | no',
  'Feed | https://www.facebook.com/somepage | social feeds are refused',
  ' | https://no-title.example.org | no',
  'Twice | https://lessons.example.org | duplicate',
].join(';'));
ok(links.length === 1 && links[0].title === 'Bible lessons', `only the good entry survives (${links.map((l) => l.title).join(', ')})`);
ok(d.discoverLinks(undefined).length === 0 && d.discoverLinks('').length === 0, 'unset, the project recommends nothing');
ok(d.discoverLinks('A | https://a.example.org\nB | https://b.example.org').length === 2, 'one per line works as well as semicolons');

// THE CARDS: the deployment's apps, minus anything skipped. NEVER NEWS: news
// belongs to Church & Mission Updates alone (the founder, 17 November 2026).
const cards = d.discoverCards(links, []);
ok(cards.length === 1 && cards[0].url === links[0].url, 'the cards are the deployment\'s apps');
ok(d.discoverCards.length === 2, 'and nothing else can be handed in: no stories, no news');
const after = d.discoverCards(links, [cards[0].key]);
ok(after.length === 0, 'a skipped card does not come back');
const lib = fs.readFileSync(path.join(root, 'lib/discover.ts'), 'utf8');
ok(!/stories|NEWS_SHOWN|kind: 'news'/.test(lib.replace(/^\s*\/\/.*$/gm, '')), 'the Discover code has no news in it');
const updates = fs.readFileSync(path.join(root, 'components/ChurchUpdates.tsx'), 'utf8');
ok(!/DiscoverRow/.test(updates), 'Church & Mission Updates does not hold Discover');

// KEEPING A CARD: the Pocket's own checks, in the same order.
ok(p.checkPocketAdd('https://a.example.org', []) === null, 'a new site may go in');
ok(p.checkPocketAdd('https://a.example.org', [{ url: 'https://a.example.org/' }, { url: 'https://a.example.org' }]) === 'have', 'one already there is not added twice');
ok(p.checkPocketAdd('https://z.example.org', Array.from({ length: p.POCKET_LIMIT }, (_, i) => ({ url: `https://${i}.example.org` }))) === 'full', 'a full Pocket says so');
ok(typeof p.checkPocketAdd('https://www.facebook.com/x', [])?.refused === 'string', 'a social feed is refused with a reason');

// WIRED: the row is on Home in both halves, and an open Pocket hears about it.
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
for (const half of ['components/LiveBillboard.tsx', 'components/ChurchBillboard.tsx']) {
  const src = read(half);
  ok(/<DiscoverRow/.test(src) && src.indexOf('<DiscoverRow') < src.indexOf('<ChurchUpdates'), `${half}: Discover is its own section on Home, before the updates`);
}
ok(/addToPocket=\{addDiscoveredToPocket\}/.test(read('components/LiveBillboard.tsx')) && /checkPocketAdd/.test(read('components/LiveBillboard.tsx')), 'the live Home keeps cards through the database, with the same checks');
ok(/POCKET_CHANGED/.test(read('components/Pocket.tsx')), 'the Pocket reloads when a card is kept');
ok(/NEXT_PUBLIC_DISCOVER_LINKS=/.test(read('.env.example')), '.env.example documents the setting');
ok(/data-discover-skip/.test(read('components/DiscoverRow.tsx')) && /h-10 w-10/.test(read('components/DiscoverRow.tsx')), 'the × is a full-size tap target');

console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
process.exit(bad ? 1 : 0);
