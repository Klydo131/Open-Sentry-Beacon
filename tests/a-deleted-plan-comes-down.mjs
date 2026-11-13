// A deleted Sabbath program or evangelistic meeting comes off This Sabbath.
//
// Asked for on 12 November 2026: a program a leader deleted stayed on the
// Explorers' This Sabbath. Sharing posts a copy; deleting the plan never took
// that copy down. These hold the fix in place.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
let bad = 0;
const ok = (c, m) => { console.log(`${c ? 'OK  ' : 'FAIL'}  ${m}`); if (!c) bad++; };

const data = read('lib/live/data.ts');
const fn = data.slice(data.indexOf('export async function takeDownMySharedPosts'));
ok(/\.delete\(\)\.eq\('author_id', me\)\.in\('id', ids\)/.test(fn) && /\.delete\(\)\.eq\('author_id', me\)\.in\('title', titles\)/.test(fn),
   'taking down removes only the signed-in person\'s own posts, by id and by title');

for (const [file, kind] of [['components/SabbathProgram.tsx', 'program'], ['components/EvangelisticMeetings.tsx', 'meetings']]) {
  const src = read(file);
  const del = src.indexOf('onDelete={async () => {');
  const down = src.indexOf('await takeDown(open.shared', del);
  const gone = src.indexOf('sync.deleted(open.id)', del);
  ok(del > 0 && down > del && gone > down, `${kind}: deleting takes the shared copies down first, then deletes`);
  // 13 November 2026: a copy shared twice, or from another device, is not
  // among the ids the plan remembers; by id alone it stayed up.
  const call = src.slice(down, src.indexOf(';', down));
  ok(!/open\.shared \? \[\]/.test(call) && /shareTitle\(open\)|sharedTitles\(open\)/.test(call),
     `${kind}: deleting takes copies down by title as well as by id, always`);
  ok(/try \{ await onDelete\(\); \} catch \(cause\) \{ setDeleteWhy\(takeDownFailed\(cause\)\)/.test(src),
     `${kind}: if they cannot come down, nothing is deleted and the reason is shown`);
  ok(/if \(takeDown\) await takeDown\(/.test(src.slice(src.indexOf('const post = async'))),
     `${kind}: posting again takes the earlier copy down first`);
  ok(/data-take-down/.test(src), `${kind}: the share box offers Take it down`);
}

for (const [file, fn] of [['lib/sabbath-program.ts', 'tidyProgram'], ['lib/evangelistic-meeting.ts', 'tidyMeeting']]) {
  const src = read(file);
  ok(new RegExp(`export function ${fn}[\\s\\S]*?shared: sharedIds\\(r\\.shared\\)`).test(src),
     `${fn} keeps the posts a plan was shared as, through every sync`);
}

for (const page of ['app/office/page.tsx', 'app/sabbath/page.tsx']) {
  const src = read(page);
  ok(/\{\.\.\.liveSharing\}/.test(src) && /\{\.\.\.sampleSharing\}/.test(src),
     `${page}: both the church's app and the sample church can take a plan down`);
}

// Your own copy, taken down from where you read it: a copy whose plan is
// already gone had nowhere else to be removed from.
const sab = read('components/ThisSabbath.tsx');
ok(/program\.mine && takeDown && onGone/.test(sab) && /await takeDown\(\[id\], \[\]\)/.test(sab),
   'This Sabbath offers the sharer, and only the sharer, a take-down of that one post');
ok(/mine: p\.author_id === profile\.id/.test(read('app/sabbath/page.tsx')),
   'whether a post is mine comes from who wrote it, not from what it says');

// 13 November 2026. On Home a shared plan
// is one announcement card that opens This Sabbath, and never a blog card.
const plans = read('lib/home-plans.ts');
ok(/isSharedProgram\(title\) \|\| isSharedMeeting\(title\)/.test(plans) && (plans.match(/href: '\/sabbath'/g) ?? []).length === 2,
   'Home turns shared plans into at most two announcement cards, each opening This Sabbath');
for (const f of ['components/LiveBillboard.tsx', 'components/ChurchBillboard.tsx']) {
  const src = read(f);
  ok(/\.filter\(\(p\) => !isPlanPost\(p\.title\)\)/.test(src) && /planNotices\(/.test(src),
     `${f}: no shared plan under From the blog; it is an announcement instead`);
}
ok(/if \(item\.href\) \{ router\.push\(item\.href\); return; \}/.test(read('components/HomeBoard.tsx')),
   'a card with somewhere to go opens that page, not a sheet');

console.log(bad ? `RESULT: ${bad} FAILURE(S)` : 'RESULT: ALL OK');
process.exit(bad ? 1 : 0);
