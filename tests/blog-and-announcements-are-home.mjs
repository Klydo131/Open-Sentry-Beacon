// Blog and Announcements are Home's folders, and there is no Publish room.
//
// The owner, 3 October 2026: "will now be a sub room for home so people can
// write and publish in home page right away, make it simple with advance
// settings too", "take out publish in rooms since it is a sub room of home
// now", "Blog and announcement will be the sub rooms of home, so basically we
// will take out publish". The sample half is walked in tests/e2e/blog.js; the
// live half needs a database, so it is held here.
//
//   node tests/blog-and-announcements-are-home.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const code = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// 1. NO PUBLISH ROOM, AND THE OLD ADDRESS STILL LEADS SOMEWHERE
const rails = code('components/RoomRails.tsx');
ok(!/href: '\/publish'/.test(rails) && !/\bpublish,/.test(rails), 'no role has a Publish room in the sidebar or the Menu');
ok(/redirect\('\/church\?room=blogs'\)/.test(code('app/publish/page.tsx')), '/publish opens Home\'s Blog folder');
const linksToPublish = [];
for (const dir of ['components', 'app', 'lib']) {
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const rel = path.join(d, e.name);
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name) && rel !== path.join('app', 'publish', 'page.tsx') && /href=["{`']*\/publish\b/.test(code(rel))) linksToPublish.push(rel);
    }
  };
  walk(dir);
}
ok(linksToPublish.length === 0, `nothing links to /publish any more${linksToPublish.length ? `: ${linksToPublish.join(', ')}` : ''}`);
// Nor sends anybody there in words: the notice board when it is empty, and the
// line a Sabbath program or a series of meetings shows once posted.
const saysPublish = ['components/LiveAnnouncements.tsx', 'components/SabbathProgram.tsx', 'components/EvangelisticMeetings.tsx']
  .filter((f) => /in Publish\b|open Publish\b/.test(code(f)));
ok(saysPublish.length === 0, `no screen tells anybody to go to Publish${saysPublish.length ? `: ${saysPublish.join(', ')}` : ''}`);

// 2. HOME HAS THEM, ON BOTH HALVES
const liveHome = code('components/LiveChurchPages.tsx');
ok(/\{ id: 'blogs', label: '✍️ Blog' \}/.test(liveHome) && /room === 'blogs' && \([\s\S]*?<LiveBlogDesk \/>[\s\S]*?<LiveBlogFeed/.test(liveHome),
   'live Home: a Blog folder, the writing desk above what people wrote');
ok(/\.\.\.\(explorer \? \[\] : \[\{ id: 'announcements', label: '📣 Announcements' \}\]\)/.test(liveHome)
   && /room === 'announcements' && <LiveWriteNotice \/>/.test(liveHome),
   'live Home: an Announcements folder for those who pin notices, and none for an Explorer');
const sampleHome = code('app/church/page.tsx');
ok(/\{ id: 'blogs', label: '✍️ Blog' \}/.test(sampleHome) && /<BlogDesk userId=\{me\.id\} \/>/.test(sampleHome) && /<BlogFeed userId=\{me\.id\} \/>/.test(sampleHome),
   'sample Home: a Blog folder with the desk and the feed');
ok(!/id: 'write'/.test(code('app/dm/page.tsx')), 'and the sample Guide\'s old Write folder is gone: writing is in Home');

// 3. SIMPLE FIRST, ADVANCED WHEN WANTED
for (const f of ['components/LiveBlog.tsx', 'components/Blog.tsx']) {
  const desk = code(f);
  ok(/const \[open, setOpen\] = useState\(true\);/.test(desk), `${f}: the writing box is open on arrival`);
  ok(/data-blog-advanced/.test(desk) && /\{advanced && \(<>[\s\S]*?Who sees it[\s\S]*?<\/>\)\}/.test(desk)
     && /\{advanced && \([\s\S]{0,200}Save as draft/.test(desk),
     `${f}: who sees it and saving a draft are under Advanced settings`);
}
const notice = code('components/LiveWriteNotice.tsx');
ok(/data-notice-advanced/.test(notice) && /\{advanced && \(\s*<Field\s+label="When"/.test(notice),
   'the announcement asks for a title and the words; When is under Advanced settings');

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
