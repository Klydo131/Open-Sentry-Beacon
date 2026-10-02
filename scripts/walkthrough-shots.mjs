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
];

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
