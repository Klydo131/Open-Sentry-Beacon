// Photograph the app the way a member actually meets it, for the illustrated guide.
//
// THREE SHOT SCRIPTS, AND THEY ARE NOT INTERCHANGEABLE.
//
//   scripts/screenshots.mjs      the PRODUCT, for the README: "what is this?"
//   scripts/guide-shots.mjs      the SETUP JOURNEY: "am I in the right place?"
//   this one                     the MEMBER'S JOURNEY: "how do I use it?"
//
// Mixing them would mean a README refresh silently rewrote the member's guide.
//
// PHONE-SHAPED ON PURPOSE. Every one of these is taken at 390x844, because that
// is what the congregation is holding. A guide illustrated with desktop windows
// teaches people to look for things where they are not. The two Director screens
// are the exception and say so: approving members is desk work.
//
//   npm run build && node scripts/run-next.mjs start -p 4310
//   node scripts/walkthrough-shots.mjs 4310          # every shot
//   node scripts/walkthrough-shots.mjs 4310 11 24    # only 11-... and 24-...
//
// Retake only what changed. Every run photographs the sample church as it is
// that minute (the date on the desk, the time on a message), so retaking an
// unchanged screen still rewrites its file, and a commit full of pictures
// nobody meant to change hides the one that did.
//
// Every shot is the real app running on its own sample people. Nothing is
// composed or retouched. A screenshot is the one kind of documentation that
// rots with nothing failing, so rerun this whenever a screen changes.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'docs/screenshots/walkthrough');
const PORT = process.argv[2] || '4310';
const ONLY = process.argv.slice(3);
const BASE = `http://localhost:${PORT}`;

const { chromium } = require('playwright');
// The browser walks' own helpers for the two things that changed shape on
// 30 September 2026: a room's subrooms are a drop-down now, not a row of tabs,
// and the conversation is the Talk bubble, not a page. Using the walks' copies
// means the photographs open things exactly the way the tested walks do.
const { openRoom, openChat } = require('../tests/e2e/_playwright.js');
mkdirSync(OUT, { recursive: true });

const settle = (page, ms = 1300) => page.waitForTimeout(ms);

/** Sign in as one of the sample people and clear anything that covers the screen. */
async function signIn(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await settle(page, 1200);
  const pick = page.getByText(who).first();
  if (await pick.count()) await pick.click();
  await settle(page, 1600);
  for (const label of [/I understand|Continue|Got it|Agree/i, /Skip|Not now|Close|Later|End tour/i]) {
    const b = page.getByRole('button', { name: label });
    if (await b.count()) { await b.first().click().catch(() => {}); await settle(page, 600); }
  }
  // THE CONSENT NOTICE can arrive a moment after the sign-in has finished, on
  // the first page of the app rather than on the sign-in page, and it covers
  // everything. It is accepted once per person and remembered, so waiting for
  // it here means no photograph has it over the screen being shown.
  const consent = page.getByRole('button', { name: /I understand, continue/i }).first();
  try {
    await consent.waitFor({ state: 'visible', timeout: 3000 });
    await consent.click();
    await settle(page, 600);
  } catch {
    // Not shown to this person, or already accepted.
  }
}

/** Choose a room or subroom by its visible label. */
async function room(page, label) {
  await openRoom(page, label);
  await settle(page, 900);
}

/** Open Maria's conversation with John, the sample pairing with the most said in it. */
async function conversation(page) {
  await signIn(page, /Maria Santos/i);
  await page.goto(`${BASE}/dm/pair-john`, { waitUntil: 'networkidle' });
  await settle(page, 1200);
  await openChat(page);
  await settle(page, 900);
}

/** John's latest message in that conversation: the bubble a Guide would answer. */
const theirLatest = (page) => page.locator('[data-chat-entry="message"]:not([data-mine]) [data-bubble]').last();

const PHONE = { width: 390, height: 844 };
const DESK = { width: 1280, height: 900 };

const SHOTS = [
  { file: '01-front-door.png', what: 'The front door', size: PHONE,
    go: async (p) => { await p.goto(`${BASE}/?tutorial=0`, { waitUntil: 'networkidle' }); await settle(p, 1600); } },

  { file: '02-who-are-you.png', what: 'Choosing who you are', size: PHONE,
    go: async (p) => { await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' }); await settle(p, 1500); } },

  { file: '03-explorer-guide.png', what: 'An Explorer: My Guide', size: PHONE,
    go: async (p) => { await signIn(p, /John/i); await p.goto(`${BASE}/ds`, { waitUntil: 'networkidle' }); await settle(p, 1600); } },

  { file: '04-explorer-study.png', what: 'An Explorer: Study', size: PHONE,
    go: async (p) => { await signIn(p, /John/i); await p.goto(`${BASE}/ds`, { waitUntil: 'networkidle' }); await settle(p); await room(p, /Study/i); } },

  { file: '05-explorer-church.png', what: 'An Explorer: Church', size: PHONE,
    go: async (p) => { await signIn(p, /John/i); await p.goto(`${BASE}/ds`, { waitUntil: 'networkidle' }); await settle(p); await room(p, /Church/i); } },

  { file: '06-explorer-prayer.png', what: 'An Explorer: Prayer', size: PHONE,
    go: async (p) => { await signIn(p, /John/i); await p.goto(`${BASE}/ds`, { waitUntil: 'networkidle' }); await settle(p); await room(p, /Prayer/i); } },

  { file: '07-explorer-library.png', what: "An Explorer's shelf: eight resources, Jesus first", size: PHONE,
    go: async (p) => {
      await signIn(p, /John/i);
      await p.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
      await settle(p, 1700);
      // Past the welcome card to the shelf itself. A picture of the heading
      // above an empty fold teaches nothing about what is on the shelf.
      const first = p.getByText(/The Bible, free/i).first();
      if (await first.count()) await first.scrollIntoViewIfNeeded().catch(() => {});
      await settle(p, 900);
    } },

  { file: '08-guide-desk.png', what: "A Guide's desk", size: PHONE,
    go: async (p) => { await signIn(p, /Maria Santos/i); await p.goto(`${BASE}/dm`, { waitUntil: 'networkidle' }); await settle(p, 1600); } },

  { file: '09-conversation.png', what: 'A conversation, private between two people', size: PHONE,
    go: async (p) => { await conversation(p); } },

  { file: '10-journey.png', what: 'Moving somebody along their journey', size: PHONE,
    go: async (p) => { await signIn(p, /Maria Santos/i); await p.goto(`${BASE}/dm/pair-john`, { waitUntil: 'networkidle' }); await settle(p); await room(p, /Journey/i); } },

  { file: '11-office.png', what: 'The Office, and its subrooms', size: PHONE,
    go: async (p) => { await signIn(p, /Maria Santos/i); await p.goto(`${BASE}/office`, { waitUntil: 'networkidle' }); await settle(p, 1600); } },

  { file: '12-tutorial.png', what: 'The guided walk, pointing at the next thing to tap', size: PHONE,
    go: async (p) => {
      await p.goto(`${BASE}/`, { waitUntil: 'networkidle' }); await settle(p, 1200);
      const chip = p.locator('[data-quest-track="ds"]').first();
      if (await chip.count()) await chip.click();
      await settle(p, 2200);
      const c = p.getByRole('button', { name: /I understand|Continue|Got it/i });
      if (await c.count()) { await c.first().click().catch(() => {}); await settle(p, 900); }
    } },

  { file: '13-settings.png', what: 'Settings, where installing lives', size: PHONE,
    go: async (p) => { await signIn(p, /John/i); await p.goto(`${BASE}/settings`, { waitUntil: 'networkidle' }); await settle(p, 1600); } },

  // Desk work, and photographed as such.
  { file: '14-approvals.png', what: 'A Director: who is waiting to be let in', size: DESK,
    go: async (p) => { await signIn(p, /Pastor Ramos/i); await p.goto(`${BASE}/admin`, { waitUntil: 'networkidle' }); await settle(p, 1700); } },

  { file: '15-church.png', what: 'The church home: notices, prayer wall, the numbers', size: DESK,
    go: async (p) => { await signIn(p, /Pastor Ramos/i); await p.goto(`${BASE}/church`, { waitUntil: 'networkidle' }); await settle(p, 1700); } },

  // THE CONVERSATION, 1 OCTOBER 2026: reply, react and speak.
  { file: '16-message-menu.png', what: 'Tap a message: six reactions, then Reply, Copy and more', size: PHONE,
    go: async (p) => {
      await conversation(p);
      await theirLatest(p).click();
      await p.locator('[data-message-menu]').waitFor({ timeout: 5000 });
      await settle(p, 700);
    } },

  { file: '17-reply-and-reaction.png', what: 'A reply carries a quote; a reaction sits on the bubble', size: PHONE,
    go: async (p) => {
      await conversation(p);
      await theirLatest(p).click();
      await p.locator('[data-react="Praying"]').click();
      await settle(p, 700);
      await theirLatest(p).click();
      await p.locator('[data-menu-action="reply"]').click();
      await settle(p, 500);
      await p.locator('[data-quest="chat-send"] textarea').first().fill('Yes. Thursday evening works, and I will bring the reading on rest.');
      await p.locator('[data-composer-action]').click();
      await settle(p, 1300);
    } },

  { file: '18-voice-message.png', what: 'Recording a voice message: Cancel or Send, never sent on its own', size: PHONE, microphone: true,
    go: async (p) => {
      await conversation(p);
      await p.locator('[data-composer-action]').click();
      await p.locator('[data-voice-recorder]').waitFor({ timeout: 8000 });
      await settle(p, 2600);
    } },

  // GETTING AROUND, 30 September 2026.
  { file: '19-menu.png', what: 'Menu: every room, written out', size: PHONE,
    go: async (p) => { await signIn(p, /Maria Santos/i); await p.goto(`${BASE}/menu`, { waitUntil: 'networkidle' }); await settle(p, 1400); } },

  { file: '20-subrooms.png', what: "A room's subrooms, one drop-down", size: PHONE,
    go: async (p) => {
      await signIn(p, /John/i);
      await p.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
      await settle(p, 1400);
      const toggle = p.locator('[data-subroom-toggle]').first();
      await toggle.click();
      await settle(p, 700);
    } },

  { file: '21-desk-drawer.png', what: 'The desk, as a drawer on a phone', size: PHONE,
    go: async (p) => {
      await signIn(p, /Maria Santos/i);
      await p.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
      await settle(p, 1400);
      await p.locator('[data-desk-tab]').first().click();
      await settle(p, 900);
    } },

  { file: '22-text-size-large.png', what: 'The conversation at the largest text size', size: PHONE, scale: 1.3,
    go: async (p) => { await conversation(p); } },

  { file: '23-source-and-licences.png', what: 'Settings: the source code, and other projects\' licences', size: PHONE,
    go: async (p) => {
      await signIn(p, /John/i);
      await p.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
      await settle(p, 1200);
      // On Settings' first room, General, at the foot: "This app is free software".
      const link = p.locator('[data-third-party-notices]').first();
      await link.scrollIntoViewIfNeeded();
      await p.evaluate(() => window.scrollBy(0, 160));
      await settle(p, 700);
    } },
  // The Sabbath program, asked for on 2 October 2026: a Guide's own order of
  // service, typed into the Office and downloaded as a Word file. The hymn is
  // named without a number on purpose: the number is the church's own hymnal's.
  { file: '24-sabbath-program.png', what: 'The Sabbath program, in the Office', size: PHONE,
    go: async (p) => {
      await signIn(p, /Maria Santos/i);
      await p.goto(`${BASE}/office?room=sabbath`, { waitUntil: 'networkidle' });
      await settle(p, 1400);
      await p.getByRole('button', { name: 'New program' }).click();
      await settle(p, 600);
      await p.getByLabel('Theme or sermon title (optional)').fill('Rest for the weary');
      await p.getByLabel('Time of Sabbath School').fill('9:00 AM');
      await p.getByLabel('Details for Opening hymn').first().fill('Holy, Holy, Holy');
      await p.getByLabel('Who leads Opening hymn').first().fill('Maria Santos');
      await p.getByLabel('Who leads Opening prayer').first().fill('John Reyes');
      // Centred on the part being filled, instantly: the app scrolls smoothly,
      // and a smooth scroll still moving when the picture is taken lands
      // somewhere else.
      await p.getByLabel('Name of this part').first().evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await p.evaluate(() => window.scrollBy({ top: -150, behavior: 'instant' }));
      await settle(p, 600);
    } },
  // Advanced settings, the same day: minutes, the start time each line gets
  // from them, and a note only the platform's copy carries.
  { file: '25-sabbath-advanced.png', what: 'The Sabbath program with Advanced settings', size: PHONE,
    go: async (p) => {
      await advancedProgram(p);
      await p.locator('[data-program-line]').nth(1).evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await p.evaluate(() => window.scrollBy({ top: -40, behavior: 'instant' }));
      await settle(p, 600);
    } },
  // A detail of the church's own, for what the standard boxes do not cover.
  { file: '26-sabbath-own-details.png', what: 'The Sabbath program: details of your own', size: PHONE,
    go: async (p) => {
      await advancedProgram(p);
      await p.locator('[data-extras]').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await p.evaluate(() => window.scrollBy({ top: -20, behavior: 'instant' }));
      await settle(p, 600);
    } },
  // What an Explorer sees once their Guide has pressed Post it: This Sabbath,
  // in the Menu, kept on the phone for a Sabbath with no signal.
  { file: '27-this-sabbath.png', what: 'This Sabbath, as an Explorer sees it', size: PHONE,
    go: async (p) => {
      await advancedProgram(p);
      await p.getByRole('button', { name: 'Post it' }).click();
      await settle(p, 800);
      await signIn(p, /John Reyes/i);
      await p.goto(`${BASE}/sabbath`, { waitUntil: 'networkidle' });
      await settle(p, 1400);
    } },
  // Evangelistic meetings, the same day: shaped the church's own way. A night's
  // program with a column Maria added herself.
  { file: '28-evangelistic-meetings.png', what: 'Evangelistic meetings: children\'s time, with a column of your own', size: PHONE,
    go: async (p) => {
      await meetingSeries(p);
      await p.locator('[data-night]').first().locator('[data-kind="list"]').first()
        .evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await p.evaluate(() => window.scrollBy({ top: -150, behavior: 'instant' }));
      await settle(p, 600);
    } },
  // Its own look: a colour, a heading face, and where the name sits.
  { file: '29-meeting-look.png', what: 'Evangelistic meetings: its own look', size: PHONE,
    go: async (p) => {
      await meetingSeries(p);
      await p.locator('[data-look] summary').click();
      await p.locator('[data-look]').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await p.evaluate(() => window.scrollBy({ top: -20, behavior: 'instant' }));
      await settle(p, 600);
    } },
  // What an Explorer reads once the first night is posted.
  { file: '30-this-sabbath-meeting.png', what: 'This Sabbath with a night of meetings, as an Explorer sees it', size: PHONE,
    go: async (p) => {
      await meetingSeries(p);
      await p.getByLabel('What to take away').selectOption({ index: 1 });
      await p.locator('[data-meeting-share]').getByRole('button', { name: 'Post it' }).click();
      await settle(p, 800);
      await signIn(p, /John Reyes/i);
      await p.goto(`${BASE}/sabbath`, { waitUntil: 'networkidle' });
      await settle(p, 1400);
      await p.locator('[data-panel="shared-meetings"]').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await p.evaluate(() => window.scrollBy({ top: -20, behavior: 'instant' }));
      await settle(p, 600);
    } },
  // The progress report, the same day: a Guide's own Explorers, in the shape
  // an Adventist teacher's report has.
  { file: '31-progress-report.png', what: 'The progress report, as a Guide sees it', size: PHONE,
    go: async (p) => {
      await signIn(p, /Maria Santos/i);
      await p.goto(`${BASE}/office?room=reports`, { waitUntil: 'networkidle' });
      await settle(p, 1400);
      await p.locator('[data-panel="progress-report"]').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await p.evaluate(() => window.scrollBy({ top: -20, behavior: 'instant' }));
      await settle(p, 600);
    } },
  { file: '32-progress-explorers.png', what: 'The progress report: each Explorer, and who needs attention', size: PHONE,
    go: async (p) => {
      await signIn(p, /Maria Santos/i);
      await p.goto(`${BASE}/office?room=reports`, { waitUntil: 'networkidle' });
      await settle(p, 1400);
      await p.locator('[data-explorers]').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await p.evaluate(() => window.scrollBy({ top: -20, behavior: 'instant' }));
      await settle(p, 600);
    } },
  // A series in a folder, and on the calendar.
  { file: '33-meeting-calendar.png', what: 'Evangelistic meetings: Add to calendar', size: PHONE,
    go: async (p) => {
      await meetingSeries(p);
      await p.getByLabel('Folder', { exact: true }).fill('Youth Week');
      await p.getByLabel('What to take away').selectOption({ index: 1 });
      await p.getByRole('button', { name: 'Add to calendar' }).evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await settle(p, 600);
    } },
  // Home's Blog folder, 3 October 2026: "Blog and announcement will be the sub
  // rooms of home". Reached the way a person reaches it since 4 October, by
  // Write a post on Home's first screen, so the cursor is in Title. Nothing
  // typed, so the picture shows what somebody meets.
  { file: '34-home-blog.png', what: "Write a post: a title, the post and Publish", size: PHONE,
    go: async (p) => {
      await signIn(p, /Maria Santos/i);
      await p.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
      await settle(p, 1200);
      await p.locator('[data-write-post]').click();
      await settle(p, 1400);
      // Title to Advanced settings, with Advanced clear of the DEMO badge and
      // Talk button that float in the bottom 200px of a phone. The heading
      // does not fit as well; shot 38 shows the way in, by name.
      const FLOATING_BADGES_PX = 200;
      await p.locator('[data-blog-advanced]').first().evaluate((el, clearance) => {
        window.scrollBy(0, el.getBoundingClientRect().bottom - (window.innerHeight - clearance));
      }, FLOATING_BADGES_PX);
      await settle(p, 600);
    } },
  // Text size, tried first, 3 October 2026: "text size should be tested and
  // see first before applying, there should be an apply button".
  { file: '35-text-size-apply.png', what: 'Text size: tried in the preview, then Apply', size: PHONE,
    go: async (p) => {
      await signIn(p, /Maria Santos/i);
      await p.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
      await settle(p, 1200);
      const card = p.locator('[data-panel="text-size"]');
      await card.locator('[data-text-size="large"]').click();
      // Apply in the middle of the screen, clear of the badges that float at the bottom.
      await card.locator('[data-text-size-apply]').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await settle(p, 600);
    } },
  // The four looks, 4 October 2026. The Look card in Settings with all four
  // offered; Focus chosen, so the picture also shows a look other than Classic.
  { file: '36-looks.png', what: 'Settings: four looks, Classic, Beacon, Study and Focus', size: PHONE,
    go: async (p) => {
      await signIn(p, /Maria Santos/i);
      await p.evaluate(() => localStorage.setItem('beacon-ui-theme', 'focus'));
      await p.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
      await settle(p, 1200);
      // Beacon, Study and Focus in the middle, clear of the badges at the bottom.
      await p.locator('[data-ui-theme-choice="study"]').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await settle(p, 600);
    } },
  // The desk's colours in a look other than Classic, 4 October 2026: "This
  // colors doesnt work for other Themes in settings, please integrate it too".
  // Focus with Warm Office: the warm dark that palette is in Focus's light.
  { file: '37-desk-colours.png', what: "The desk's colours under Focus: Warm Office, in Focus's dark", size: PHONE,
    go: async (p) => {
      await signIn(p, /Maria Santos/i);
      await p.evaluate(() => localStorage.setItem('beacon-ui-theme', 'focus'));
      await p.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
      await settle(p, 1200);
      await p.locator('[data-desk-tab]').first().click();
      await settle(p, 900);
      await p.locator('[data-desk-drawer] [data-room-palette="study"]').click();
      await settle(p, 900);
    } },
  // Writing from Home, 4 October 2026: "I would love writing the Blog to be
  // simple (with advance settings too but that's optional) and can be easily
  // accessible to Home page". The screen Home opens on, Write a post near the top.
  { file: '38-home-write.png', what: 'Home opens with Write a post near the top', size: PHONE,
    go: async (p) => {
      await signIn(p, /Maria Santos/i);
      await p.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
      await settle(p, 1400);
    } },
  // Frutiger Aero, 4 October 2026: "as sub file for 'look' so people can see
  // the difference ... with drop down on it (with description)". Frutiger Eco
  // chosen, so the row is open and the page is in it.
  { file: '39-frutiger-aero.png', what: 'Settings: Frutiger Aero opened, five looks with their pictures', size: PHONE,
    go: async (p) => {
      await signIn(p, /Maria Santos/i);
      await p.evaluate(() => localStorage.setItem('beacon-ui-theme', 'aero-eco'));
      await p.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
      await settle(p, 1200);
      // The row and the first looks in it, clear of the badges at the bottom.
      await p.locator('[data-look-family="aero"]').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await p.evaluate(() => window.scrollBy(0, -90));
      await settle(p, 600);
    } },
  // The Music room, 4 October 2026: "another room for music for music lovers
  // and choir". The Conductor, with the baton drawn at rest on beat one.
  { file: '40-music-room.png', what: 'The Music room: the Conductor folder, the baton pattern and the tempo', size: PHONE,
    go: async (p) => {
      await signIn(p, /John Reyes/i);
      await p.goto(`${BASE}/music?room=conductor`, { waitUntil: 'networkidle' });
      await settle(p, 1200);
      // The baton and the tempo under it, clear of the bar along the bottom.
      await p.locator('[data-baton]').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await p.evaluate(() => window.scrollBy(0, -24));
      await settle(p, 600);
    } },
  // A music PDF read on the phone, 6 October 2026: the owner chose "Read music
  // PDFs on phone". The test hymn's PDF (CC0, tests/fixtures/music), its note
  // that it was read from the print, and About this piece below it.
  { file: '41-music-pdf.png', what: 'Pieces: a choir PDF read on the phone, with About this piece', size: PHONE,
    go: async (p) => {
      await signIn(p, /John Reyes/i);
      await p.goto(`${BASE}/music?room=pieces`, { waitUntil: 'networkidle' });
      await settle(p, 1200);
      await p.locator('[data-score-input]').setInputFiles(new URL('../tests/fixtures/music/hymn-in-g.pdf', import.meta.url).pathname);
      await p.locator('[data-piece-explained]').waitFor({ timeout: 20000 });
      await settle(p, 800);
      // The title, the note under it and the start of About this piece.
      await p.locator('[data-score-title]').evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
      await p.evaluate(() => window.scrollBy(0, -90));
      await settle(p, 600);
    } },
  // Concert pitch you can hear, 5 October 2026: "I just put the Hertz and
  // nothing much is happening". The Tuner's concert pitch card, A = 440.
  { file: '42-tuner-pitch.png', what: 'The Tuner: concert pitch, one tap for each common A, and Compare with 440', size: PHONE,
    go: async (p) => {
      await signIn(p, /John Reyes/i);
      await p.goto(`${BASE}/music?room=tuner`, { waitUntil: 'networkidle' });
      await settle(p, 1200);
      await p.locator('[data-tuner-a4]').evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }));
      await settle(p, 600);
    } },
  // My Files on a phone, 6 October 2026: "The Library (My files) are not UI
  // friendly for Mobile and Pad users". On this device: adding first, at one
  // width, then the files, then the note about Music.
  { file: '43-my-files-device.png', what: 'My Files on a phone: On this device, Upload files and Add a link first', size: PHONE,
    go: async (p) => {
      await signIn(p, /John Reyes/i);
      await p.goto(`${BASE}/library?room=mine`, { waitUntil: 'networkidle' });
      await settle(p, 1400);
    } },
];

/** Maria plans three nights of meetings for shots 28 to 30: invented names only. */
async function meetingSeries(p) {
  await signIn(p, /Maria Santos/i);
  await p.goto(`${BASE}/office?room=evangelism`, { waitUntil: 'networkidle' });
  await settle(p, 1400);
  await p.getByRole('button', { name: 'New meetings' }).click();
  await p.getByLabel('First night', { exact: true }).fill('2026-10-04');
  await p.getByLabel('How many nights', { exact: true }).fill('3');
  await p.getByRole('button', { name: 'Start with a plan' }).click();
  await settle(p, 500);
  await p.getByLabel('Name of the meetings').fill('Hope for Today');
  await p.getByLabel('Place', { exact: true }).fill('Riverside Hall');
  await p.getByLabel('A line under the name').fill('Every night from 5:30 PM. All are welcome.');
  await p.locator('[data-look] summary').click();
  await p.locator('[data-look] label[title="Forest"]').click();
  await p.getByRole('radio', { name: 'Clean' }).check();
  await p.locator('[data-look] summary').click();
  const night = p.locator('[data-night]').first();
  await night.getByLabel('Topic of night 1').fill('The Blessed Hope');
  const kids = "Children's time, 5:30 to 6:30 PM";
  await night.locator('[data-columns] summary').first().click();
  await night.getByRole('button', { name: 'Add a column' }).first().click();
  await night.getByLabel(`Column 3 of ${kids}`).fill('Materials');
  await night.locator('[data-columns] summary').first().click();
  for (const [line, who, what] of [[1, 'David Cruz', 'Song sheets'], [2, 'Grace Lim', ''], [3, 'Anna Yu', 'Paper and crayons']]) {
    await night.getByLabel(`Who, line ${line} of ${kids}`).fill(who);
    if (what) await night.getByLabel(`Materials, line ${line} of ${kids}`).fill(what);
  }
  await night.getByLabel('Who, line 1 of Health time, 6:30 to 7:30 PM').fill('Pastor Ramos');
}

/** Maria, Advanced on, filling a program the way a Guide might for shots 25 to 27: invented names only. */
async function advancedProgram(p) {
  await signIn(p, /Maria Santos/i);
  await p.goto(`${BASE}/office?room=sabbath`, { waitUntil: 'networkidle' });
  await settle(p, 1400);
  await p.locator('[data-advanced-switch]').check();
  await p.getByRole('button', { name: 'New program' }).click();
  await settle(p, 600);
  await p.getByLabel('Theme or sermon title (optional)').fill('Rest for the weary');
  await p.getByRole('button', { name: 'Add a detail' }).click();
  await p.getByLabel('Name of this detail').fill('Deacons on duty');
  await p.getByLabel('What Deacons on duty says').fill('Anna Yu and Peter Tan');
  await p.getByLabel('Time of Sabbath School').fill('9:00 AM');
  for (const [part, minutes] of [['Song service', '15'], ['Opening hymn', '5'], ['Opening prayer', '3'], ['Welcome', '5']]) {
    await p.getByLabel(`Minutes for ${part}`).first().fill(minutes);
  }
  await p.getByLabel('Details for Opening hymn').first().fill('Holy, Holy, Holy');
  await p.getByLabel('Who leads Song service').first().fill('David Cruz');
  await p.getByLabel('Who leads Opening hymn').first().fill('Maria Santos');
  await p.getByLabel('Note for Opening hymn').first().fill('Pianist plays the first verse through');
  await p.getByLabel('Who leads Opening prayer').first().fill('John Reyes');
  await p.getByLabel('Who leads Welcome').first().fill('Grace Lim');
}

const executablePath = (() => {
  const fs = require('node:fs');
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (explicit && fs.existsSync(explicit)) return explicit;
  const rootDir = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!rootDir || !fs.existsSync(rootDir)) return undefined;
  for (const entry of fs.readdirSync(rootDir)) {
    if (!entry.startsWith('chromium-')) continue;
    for (const rel of [
      ['chrome-linux', 'chrome'],
      ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
    ]) {
      const candidate = join(rootDir, entry, ...rel);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
})();

// A pretend microphone, so the voice-message shot shows the recorder without
// anybody's real one; the browser is told yes without asking.
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
let failed = 0;
const chosen = ONLY.length ? SHOTS.filter((s) => ONLY.some((n) => s.file.startsWith(`${n.padStart(2, '0')}-`))) : SHOTS;
if (!chosen.length) {
  console.log(`No shot is numbered ${ONLY.join(', ')}.`);
  process.exit(1);
}
for (const shot of chosen) {
  const context = await browser.newContext({
    viewport: shot.size,
    deviceScaleFactor: 2,
    ...(shot.size === PHONE ? { isMobile: true, hasTouch: true } : {}),
    ...(shot.microphone ? { permissions: ['microphone'] } : {}),
  });
  // Settings -> Text size, set the way the app stores it, before the first page.
  if (shot.scale) {
    await context.addInitScript((value) => { try { localStorage.setItem('beacon-scale', String(value)); } catch {} }, shot.scale);
  }
  const page = await context.newPage();
  try {
    await shot.go(page);
    await page.screenshot({ path: join(OUT, shot.file) });
    console.log(`  ${shot.file}  ${shot.what}`);
  } catch (cause) {
    failed += 1;
    console.log(`  SKIPPED ${shot.file}: ${String(cause?.message ?? cause).split('\n')[0]}`);
  }
  await context.close();
}
await browser.close();

// A missing picture is a hole in the guide, so say so loudly rather than
// leaving somebody to find a broken image in a printed PDF.
console.log(failed ? `\n${failed} shot(s) did not capture.` : `\nAll ${chosen.length} shots captured.`);
process.exit(failed ? 1 : 0);
