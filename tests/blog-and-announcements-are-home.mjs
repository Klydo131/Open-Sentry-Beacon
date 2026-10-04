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
//
// The owner, 4 October 2026: "I would love writing the Blog to be simple (with
// advance settings too but that's optional) and can be easily accessible to
// Home page". The box is always open (there is nothing to close it with), a
// Write link on Home's first screen lands the cursor in Title, and the
// Advanced switch sits after Publish so the first thing read is the writing.
// The writing box alone: the feed below it keeps its own Hide and Show.
const deskOf = (src, name) => {
  const at = src.indexOf(`export function ${name}(`);
  const end = src.indexOf('\nexport function ', at + 1);
  return at < 0 ? '' : src.slice(at, end < 0 ? undefined : end);
};
for (const [f, name] of [['components/LiveBlog.tsx', 'LiveBlogDesk'], ['components/Blog.tsx', 'BlogDesk']]) {
  const desk = code(f);
  const box = deskOf(desk, name);
  ok(box.length > 0 && !/setOpen\b/.test(box) && !/>\s*(Close|Hide)\s*</.test(box),
     `${f}: the writing box is always open, with nothing to close it`);
  ok(/useFocusOnWrite\(titleRef\)/.test(desk) && /ref=\{titleRef\}/.test(desk), `${f}: Home's Write link puts the cursor in Title`);
  ok(/>\s*Publish\s*</.test(box) && box.search(/>\s*Publish\s*</) < box.search(/data-blog-advanced/),
     `${f}: Publish comes before the Advanced switch`);
  ok(/role="status"[^>]*data-blog-done|data-blog-done[^>]*role="status"/.test(box), `${f}: publishing says, out loud, that it worked`);
  ok(/data-blog-advanced/.test(desk) && /\{advanced && \(<>[\s\S]*?Who sees it[\s\S]*?<\/>\)\}/.test(desk)
     && /\{advanced && \([\s\S]{0,200}Save as draft/.test(desk),
     `${f}: who sees it and saving a draft are under Advanced settings`);
}

// 4. A WAY TO WRITE ON HOME'S FIRST SCREEN
const prompt = code('components/WritePost.tsx');
ok(/WRITE_HREF = '\/church\?room=blogs&write=1'/.test(prompt) && /href=\{WRITE_HREF\}/.test(prompt),
   'the Write a post button is a plain link to the Blog folder, asking for the cursor in Title');
ok(/room === 'notices' && <WritePostPrompt \/>/.test(liveHome), 'live Home: the Write a post button is on the screen Home opens on');
ok(/room === 'notices' && me\.role === 'dm' && <WritePostPrompt \/>/.test(sampleHome),
   'sample Home: the same, for the sample Guide, the one person there with a blog');

const notice = code('components/LiveWriteNotice.tsx');
ok(/data-notice-advanced/.test(notice) && /\{advanced && \(\s*<Field\s+label="When"/.test(notice),
   'the announcement asks for a title and the words; When is under Advanced settings');

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
