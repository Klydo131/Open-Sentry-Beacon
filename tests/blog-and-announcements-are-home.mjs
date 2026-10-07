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
// Home page". What a person sees of writing is the same on both halves, so it
// is built once, in components/WritePost.tsx, and each writing box uses it.
const shared = code('components/WritePost.tsx');
ok(/role="status" data-blog-done/.test(shared), 'the note after Publish is a status line, so a screen reader says it too');
ok(/data-blog-advanced/.test(shared) && /Advanced settings/.test(shared), 'there is one Advanced settings switch, shared by both');

// Each writing box: the function itself, not the feed below it in the same
// file, which keeps its own Hide and Show.
const DESKS = [['components/LiveBlog.tsx', 'LiveBlogDesk'], ['components/Blog.tsx', 'BlogDesk']];
const deskOf = (src, name) => {
  const start = src.indexOf(`export function ${name}(`);
  const end = src.indexOf('\nexport function ', start + 1);
  return start < 0 ? '' : src.slice(start, end < 0 ? undefined : end);
};
// True when every pattern is found, each after the one before it.
const inOrder = (text, patterns) => {
  const places = patterns.map((pattern) => text.search(pattern));
  return places.every((place, i) => place >= 0 && (i === 0 || place > places[i - 1]));
};

for (const [file, name] of DESKS) {
  const desk = deskOf(code(file), name);
  ok(desk.length > 0 && !/setOpen\b/.test(desk) && !/>\s*(Close|Hide)\s*</.test(desk),
     `${file}: the writing box is always open, with nothing to close it`);
  ok(/useFocusOnWrite\(titleRef\)/.test(desk) && /ref=\{titleRef\}/.test(desk),
     `${file}: Home's Write a post puts the cursor in Title`);
  ok(inOrder(desk, [/<WritingBox>/, />\s*Publish\s*</, /<PostedNote /, /<AdvancedSwitch /]),
     `${file}: the heading, then Publish, then what happened, then the Advanced switch`);
  ok(/\{advanced && \(\s*<>[\s\S]*?Who sees it[\s\S]*?<\/>\s*\)\}/.test(desk)
     && /\{advanced && \([\s\S]{0,200}Save as draft/.test(desk),
     `${file}: who sees it and saving a draft are under Advanced settings`);
}

// 4. A WAY TO WRITE ON HOME'S FIRST SCREEN
ok(/WRITE_HREF = '\/church\?room=blogs&write=1'/.test(shared) && /href=\{WRITE_HREF\}/.test(shared),
   'Write a post is a plain link to the Blog folder, asking for the cursor in Title');
ok(/room === 'notices' && <WritePostPrompt \/>/.test(liveHome), 'live Home: Write a post is on the screen Home opens on');
ok(/room === 'notices' && me\.role === 'dm' && <WritePostPrompt \/>/.test(sampleHome),
   'sample Home: the same, for the sample Guide, the one person there with a blog');

const notice = code('components/LiveWriteNotice.tsx');
ok(/data-notice-advanced/.test(notice) && /\{advanced && \(\s*<Field\s+label="When"/.test(notice),
   'the announcement asks for a title and the words; When is under Advanced settings');

// 5. HOME IS A BILLBOARD
//
// The owner, 7 October 2026: "It should look the Home Screen where people can
// see blogs and announcements right away please like a Bill board you can just
// see the image and photos right away and you can scroll on it." The sample
// half is walked in tests/e2e/home-is-a-billboard.js; the live half reads a
// database, so its wiring is held here.
const board = code('components/HomeBoard.tsx');
ok(!/@\/lib\/live\/data|useDemo|\bdb\(\)/.test(board), 'the billboard draws what it is handed and reads no database itself');
const liveBoard = code('components/LiveBillboard.tsx');
ok(/<HomeBoard\s+name="notices"/.test(liveBoard) && /<HomeBoard\s+name="posts"/.test(liveBoard) && !/<LiveAnnouncements/.test(liveBoard),
   'live Home: a row of announcements and a row of blog posts, in place of the old grid of notices');
ok(/live\.listAnnouncements\(\)/.test(liveBoard) && /live\.listBlogFeed\(12\)/.test(liveBoard) && /useKeepUp\(KEEP_UP_CHURCH, loadBoard\)/.test(liveBoard),
   'live Home: both rows come from the database the feed already uses, and keep up when somebody posts');
ok(/\.filter\(\(n\) => n\.is_pinned\)/.test(liveBoard), 'live Home: only notices that are up are on the board');
ok(/onOpen: \(\) => void live\.recordBlogView\(p\.id\)/.test(liveBoard), 'live Home: opening a post from the board counts as reading it');
ok(/leads \|\| n\.author_id === profile\?\.id\s*\?\s*\[[\s\S]{0,120}'Take down'[\s\S]{0,160}'Delete', danger: true/.test(liveBoard),
   'live Home: Take down and Delete, in the open notice, only for its writer and leadership; Delete in the small red style');
ok(/\{\s*n\.is_pinned \? 'Take down' : 'Put back up'\s*\}/.test(code('components/LiveWriteNotice.tsx')),
   'a notice that is down can be put back up from the Announcements folder, since it is no longer on Home');
const sampleBoard = code('components/ChurchBillboard.tsx');
ok(/postsVisibleTo\(db, me\.id\)/.test(sampleBoard) && /onOpen: \(\) => recordBlogView\(p\.id\)/.test(sampleBoard),
   'sample Home: the posts this person may read, by the same rule as the feed, and opening one is reading it');
for (const [file, src] of [['components/LiveBillboard.tsx', liveBoard], ['components/ChurchBillboard.tsx', sampleBoard]]) {
  const masthead = src.indexOf('<h1');
  const first = src.indexOf('<HomeBoard');
  const action = src.indexOf('For you to action');
  ok(masthead > 0 && first > masthead && first < action, `${file}: the board comes straight after the church's name, before anything else`);
}

// The sample posts' covers are drawn for this app, and an SVG is a document
// that can carry script: each one is plain shapes, with nothing that runs and
// nothing fetched from elsewhere.
const seed = fs.readFileSync(path.join(root, 'lib/demo/seed.ts'), 'utf8');
const covers = [...seed.matchAll(/src: '(\/home-board\/[a-z-]+\.svg)'/g)].map((m) => m[1]);
ok(covers.length >= 3, `the sample church has posts with pictures (${covers.length})`);
for (const cover of covers) {
  const file = path.join(root, 'public', cover);
  const svg = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  ok(svg.length > 0 && svg.length < 4000 && !/<script|\bon[a-z]+\s*=|href\s*=|url\(|<foreignObject|<image/i.test(svg),
     `${cover}: there, small, and only shapes: no script, no links, no outside pictures`);
}

console.log(bad ? `\nRESULT: ${bad} FAILURE(S)` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
