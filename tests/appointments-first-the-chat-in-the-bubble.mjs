// Appointments first on the page; the conversation in the bubble, on both
// halves of the app and both sides of a pairing.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. Asked for on 30 September 2026, with a screenshot of a
// Guide's Talk tab: "I really think it's time to take out the chat in 'talk'
// room and rename talk to just appointments. Let's just improve talk to our
// bubble chat with smooth animations too and smooth UI design in our chat
// system (including the report system in the bubble chat). It's annoying for
// the users to scroll down for appointments usually." Then, asked: the same on
// an Explorer's home ("Yes, same everywhere"), Report visible in the bubble's
// header rather than in a menu, and the sample app a one-to-one copy.
//
// IT REPLACES tests/the-diary-sits-with-the-conversation.mjs, whose rule was
// "the meetings card sits beneath the thread". That rule is reversed by the
// owner's decision above, and deleting the old check without writing the new
// one down would have left the layout guarded by nothing. Its two parts that
// still hold are kept here: the card is never filed under Journey, the one tab
// the Explorer never sees, and both sides draw the one diary for the one
// pairing.
//
// And the rule that outranks a request (AGENTS.md): an Explorer's way to report
// belongs on the same screen as the conversation. The conversation moved, so
// the report moved with it, into the bubble's header, on both halves.
//
//   node tests/appointments-first-the-chat-in-the-bubble.mjs
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTs } from './_strip.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => stripTs(fs.readFileSync(path.join(root, p), 'utf8'));

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const liveGuide = read('components/live/GuidePages.tsx');
const sampleGuide = read('app/dm/[id]/page.tsx');
const liveHome = read('components/live/ExplorerPage.tsx');
const sampleHome = read('app/ds/page.tsx');

// ---------------------------------------------------------------------------
// 1. A GUIDE'S PAGE FOR ONE EXPLORER OPENS ON APPOINTMENTS
// ---------------------------------------------------------------------------
for (const [src, half, card] of [[liveGuide, 'live', '<LiveMeetings'], [sampleGuide, 'sample', '<Meetings']]) {
  ok(/useState<\w+>\('appointments'\)/.test(src), `${half}: the page opens on Appointments`);
  ok(/key: 'appointments', label: 'Appointments'/.test(src) && !/key: 'talk'/.test(src),
     `${half}: the tab is called Appointments, and there is no Talk tab`);
  const tab = src.slice(src.indexOf("tab === 'appointments'"), src.indexOf("tab === 'appointments'") + 700);
  ok(tab.includes(card), `${half}: the appointments card is in it`);
  const journey = src.indexOf("tab === 'journey'");
  const journeyTab = journey === -1 ? '' : src.slice(journey, journey + 4000).split(/tab === '/)[1] ?? '';
  ok(!journeyTab.includes(card), `${half}: and not under Journey, the one tab the Explorer never sees`);
  ok(!/<Conversation\b|<Chat\b/.test(src), `${half}: no conversation is drawn on the page`);
  ok(/<MessageButton\b/.test(src), `${half}: Message opens it in the bubble instead`);
  ok(!/data-conversation-screen/.test(src), `${half}: and the page keeps the bottom bar, because it is not a conversation`);
}

// ---------------------------------------------------------------------------
// 2. AN EXPLORER'S HOME: THE SAME, BY THE OWNER'S CHOICE
// ---------------------------------------------------------------------------
for (const [src, half, card] of [[liveHome, 'live', '<LiveMeetings'], [sampleHome, 'sample', '<Meetings']]) {
  ok(!/<Conversation\b|<Chat\b/.test(src), `${half}: an Explorer's home draws no conversation`);
  ok(/<MessageButton\b/.test(src) && src.includes(card), `${half}: it has Message, and the appointments`);
}

// ---------------------------------------------------------------------------
// 3. ONE DIARY, NOT TWO THAT CAN DISAGREE (kept from the check this replaces)
// ---------------------------------------------------------------------------
ok(/<LiveMeetings\s+pairingId=\{pairing\.id\}/.test(liveGuide) && /<LiveMeetings\s+pairingId=\{pairing\.id\}/.test(liveHome),
   'both live screens point the one meetings component at the same pairing');

// ---------------------------------------------------------------------------
// 4. THE BUBBLE: BOTH HALVES, OPENED AT A PERSON, REPORT IN THE HEADER
// ---------------------------------------------------------------------------
{
  const frame = read('components/talk/Dock.tsx');
  const live = read('components/live/TalkSurface.tsx');
  const sample = read('components/DemoTalkDock.tsx');
  const button = read('components/talk/MessageButton.tsx');
  const open = read('lib/talk-open.ts');

  ok(/<DemoTalkDock \/>/.test(read('components/AppShell.tsx')) && /<TalkDock \/>/.test(read('components/LiveAppShell.tsx')),
     'both shells draw a bubble');
  ok(/openTalk\(pairingId\)/.test(button) && /dispatchEvent/.test(open)
     && /addEventListener\(TALK_OPEN_EVENT/.test(frame),
     'Message opens the bubble at that person, through the one event both bubbles listen for');
  ok(/if \(target && threads\.some/.test(sample) && /openWith=\{target\}/.test(read('components/live/TalkDock.tsx')),
     'and both bubbles open at the conversation that was asked for');

  // REPORT: visible words in the header, never a menu, never beside Send.
  ok(/data-talk-report/.test(frame) && /\{reporting \? 'Back to chat' : 'Report'\}/.test(frame),
     'the header carries Report in words');
  ok(!/Kebab|menu/i.test(frame.slice(frame.indexOf('export function TalkHeader'), frame.indexOf('export interface TalkThread'))),
     'not behind a menu, which was offered and turned down');
  ok(/onReport=\{current \?/.test(live) && /<LiveReportForm/.test(live), 'live: the header opens the report form');
  ok(/onReport=\{current \?/.test(sample) && /<ReportDialog/.test(sample) && /reportPerson\(/.test(sample),
     'sample: the header opens the same report');
  const chat = read('components/Chat.tsx');
  const composer = chat.slice(chat.indexOf('data-quest="chat-send"'));
  ok(!/Report/.test(chat) && !/Report/.test(composer), 'and the sample chat has no second Report beside Send');
}

// ---------------------------------------------------------------------------
// 5. NOTHING FLOATS OVER THE CHAT'S OWN CONTROLS ON A PHONE
// ---------------------------------------------------------------------------
{
  const css = read('app/globals.css');
  ok(/body:has\(\[data-talk-sheet\]\) \[data-steps-aside-for-chat\]/.test(css),
     'the floaters layered above the chat step aside while it covers a phone');
  for (const f of ['components/InstallPrompt.tsx', 'components/BuildNotice.tsx', 'components/FeedbackNudge.tsx',
    'components/Quest.tsx', 'components/AutoUpdate.tsx']) {
    ok(/data-steps-aside-for-chat/.test(read(f)), `${f} is one of them`);
  }
  ok(/div\[data-talk-sheet\]\s*\{\s*top: var\(--beacon-chrome-top, 0px\);/.test(css),
     'and the sheet starts under the tutorial bar, so Report and close can be pressed');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
