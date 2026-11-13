// Capture the README screenshots from the running app.
//
//   npm run build && node scripts/run-next.mjs start -p 4300
//   node scripts/screenshots.mjs 4300                 (every picture)
//   node scripts/screenshots.mjs 4300 conversation    (just the named ones)
//
// WHY THIS IS A SCRIPT AND NOT A FOLDER OF SAVED IMAGES. A screenshot is a
// claim about what the app looks like today, and it is the one kind of
// documentation that rots without anyone noticing — nothing fails, the picture
// just quietly stops being true. Regenerating is one command, so when a screen
// changes there is no excuse.
//
// It did rot: from 16 September to 3 October 2026 the README showed the left
// column and the header strip that the bottom bar replaced, a conversation
// that now opens in its bubble, and none of the Office. Nothing failed.
//
// Every shot is the real app with its own built-in sample people. Nothing here
// is composed, retouched, or assembled from parts that never appeared together.
// What is typed into the Office shots is typed by this script, with the sample
// church's invented names, exactly as a person would type it.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'docs/screenshots');
const PORT = process.argv[2] || '4300';
const ONLY = process.argv.slice(3);
const BASE = `http://localhost:${PORT}`;

// The browser walks' own helpers: they already know where Playwright and its
// Chromium are, and how to open a room's drop-down and a person's conversation
// bubble. Using their copies means the README opens things the way the tested
// walks do, and moves with them when a screen changes shape.
const { chromium, launchOptions, openChat } = require('../tests/e2e/_playwright.js');

mkdirSync(OUT, { recursive: true });

const settle = (page, ms = 1500) => page.waitForTimeout(ms);

// Palette-reduce in place with Pillow, if it is around. Optional on purpose:
// somebody regenerating these on a laptop without Python still gets correct
// images, just larger ones.
async function shrink(file) {
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(
    'python3',
    [
      '-c',
      'import sys;from PIL import Image;f=sys.argv[1];' +
        'Image.open(f).convert("RGB").quantize(colors=256, method=Image.MEDIANCUT).save(f, optimize=True)',
      file,
    ],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) console.warn('  (not shrunk — Pillow unavailable)');
}

/** Sign in as one of the sample people and clear anything that covers the screen. */
async function signIn(page, name) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await settle(page, 1000);
  const who = page.getByText(name).first();
  if (await who.count()) await who.click();
  await settle(page, 1600);
  // The guided walk is genuinely useful and genuinely covers the screen. Close
  // it so the screenshots show the app rather than the tutorial over the app.
  for (const label of [/I understand|Continue|Got it|Agree/i, /Skip|Not now|Close|Later|End tour/i]) {
    const b = page.getByRole('button', { name: label });
    if (await b.count()) { await b.first().click().catch(() => {}); await settle(page, 600); }
  }
  // The consent notice can arrive a moment after sign-in, on the first page of
  // the app, and it covers everything. Accepted once and remembered.
  const consent = page.getByRole('button', { name: /I understand, continue/i }).first();
  try {
    await consent.waitFor({ state: 'visible', timeout: 3000 });
    await consent.click();
    await settle(page, 600);
  } catch {
    // Not shown to this person, or already accepted.
  }
}

// Dismiss the "DEMO · sample data" badge before capturing.
//
// It is a real and deliberate part of the app — an installed app has no address
// bar, so something has to say which window is the demo — but it floats over
// whatever has scrolled beneath it. In a screenshot that reads as a broken
// layout rather than as the transient notice it is. The README says in words
// that these are the built-in sample people, which is the same information
// without the overlap.
async function dismissBadge(page) {
  const badge = page.getByRole('button', { name: /sample data/i });
  if (await badge.count()) {
    await badge.first().click().catch(() => {});
    await page.waitForTimeout(400);
  }
}

// Opening a conversation can scroll the PAGE as well as the thread, so a
// capture taken straight afterwards starts halfway down and misses the header.
// Scrolling once is not enough: cards finish laying out after the scroll and
// push the page back down. Insist, and confirm rather than assume.
async function toTop(page) {
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(350);
    if ((await page.evaluate(() => window.scrollY)) === 0) break;
  }
  const y = await page.evaluate(() => window.scrollY);
  if (y !== 0) console.warn(`  ! page would not stay at the top (y=${y})`);
}

/** Put one element at the top of the screen, instantly: a smooth scroll still moving lands somewhere else. */
async function bringUp(page, locator, gap = 20) {
  await locator.first().evaluate((el) => el.scrollIntoView({ block: 'start', behavior: 'instant' }));
  await page.evaluate((top) => window.scrollBy({ top: -top, behavior: 'instant' }), gap);
  await settle(page, 600);
}

// ---------------------------------------------------------------------------
// THE OFFICE, typed the way a Guide would type it
// ---------------------------------------------------------------------------

/** Maria's Sabbath program: the standard day, a theme, and who leads the first lines. */
async function sabbathProgram(p) {
  await signIn(p, /Maria Santos/i);
  await p.goto(`${BASE}/office?room=sabbath`, { waitUntil: 'networkidle' });
  await settle(p, 1400);
  await p.getByRole('button', { name: 'New program' }).click();
  await settle(p, 600);
  await p.getByLabel('Theme or sermon title (optional)').fill('Rest for the weary');
  await p.getByLabel('Time of Sabbath School').fill('9:00 AM');
  // No hymn number: the number is the church's own hymnal's.
  await p.getByLabel('Details for Opening hymn').first().fill('Holy, Holy, Holy');
  await p.getByLabel('Who leads Song service').first().fill('David Cruz');
  await p.getByLabel('Who leads Opening hymn').first().fill('Maria Santos');
  await p.getByLabel('Who leads Opening prayer').first().fill('John Reyes');
  await p.getByLabel('Who leads Welcome').first().fill('Grace Lim');
}

/** Maria's three nights of meetings, from the plan: the night as the church runs it. */
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
  const night = p.locator('[data-night]').first();
  await night.getByLabel('Topic of night 1').fill('The Blessed Hope');
  const kids = "Children's time, 5:30 to 6:30 PM";
  for (const [line, who] of [[1, 'David Cruz'], [2, 'Grace Lim'], [3, 'Anna Yu']]) {
    await night.getByLabel(`Who, line ${line} of ${kids}`).fill(who);
  }
  await night.getByLabel('Who, line 1 of Health time, 6:30 to 7:30 PM').fill('Pastor Ramos');
}

// ---------------------------------------------------------------------------
// THE PICTURES
// ---------------------------------------------------------------------------

// Desk work is photographed on a desk; 2x so it is readable when GitHub scales
// it down. 412 wide for the phone, because that is what the people using this
// actually hold, and it is the width every layout test in this repo runs at.
const DESK = { viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 };
const PHONE = { viewport: { width: 412, height: 880 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const SHOTS = [
  { name: 'guide-people', size: DESK, what: "A Guide's desk",
    go: async (p) => {
      await signIn(p, /Maria Santos/i);
      await p.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
      await settle(p, 1800);
      await toTop(p);
    } },

  // One person's page, with their conversation open in its bubble: since
  // 30 September the conversation is not a tab but something that travels
  // with you, and this is where it is opened from. Maria answers John's
  // latest message the way the conversation allows since 1 October: a
  // reaction on it, and a reply that quotes it.
  //
  // The note that the conversation is private is put away first, as anybody
  // who has read it does. On a desk the bubble is a fixed 32rem, and with the
  // note up the reply and the message it quotes do not fit under it: the
  // "Today" chip floats over John's words instead. The README says what the
  // note says, in words.
  { name: 'conversation', size: DESK, what: 'One person, and the conversation',
    go: async (p) => {
      await signIn(p, /Maria Santos/i);
      await p.goto(`${BASE}/dm/pair-john`, { waitUntil: 'networkidle' });
      await settle(p, 1400);
      await openChat(p);
      await settle(p, 1200);
      const note = p.getByRole('button', { name: 'Hide the note about this being private' });
      if (await note.count()) { await note.first().click(); await settle(p, 500); }
      const theirLatest = p.locator('[data-chat-entry="message"]:not([data-mine]) [data-bubble]').last();
      await theirLatest.click();
      await p.locator('[data-react="Praying"]').click();
      await settle(p, 700);
      await theirLatest.click();
      await p.locator('[data-menu-action="reply"]').click();
      await settle(p, 500);
      await p.locator('[data-quest="chat-send"] textarea').first().fill('Yes. Thursday evening works, and I will bring the reading on rest.');
      await p.locator('[data-composer-action]').click();
      await settle(p, 1300);
      await toTop(p);
    } },

  { name: 'church-overview', size: DESK, what: 'The church, as a leader sees it',
    go: async (p) => {
      await signIn(p, /Pastor Ramos/i);
      await p.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
      await settle(p, 1800);
      await toTop(p);
    } },

  { name: 'phone-explorer', size: PHONE, what: "An Explorer's home on a phone",
    go: async (p) => {
      await signIn(p, /John Reyes/i);
      await p.goto(`${BASE}/ds`, { waitUntil: 'networkidle' });
      await settle(p, 1900);
      await toTop(p);
    } },

  { name: 'phone-guide', size: PHONE, what: "A Guide's home on a phone",
    go: async (p) => {
      await signIn(p, /Maria Santos/i);
      await p.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
      await settle(p, 1900);
      await toTop(p);
    } },

  // THE OFFICE, 2 October 2026: the week's work, on the phone it is done on.
  { name: 'office-sabbath', size: PHONE, what: 'The Sabbath program',
    go: async (p) => {
      await sabbathProgram(p);
      await bringUp(p, p.getByLabel('Name of this part'), 150);
    } },

  { name: 'office-meetings', size: PHONE, what: 'Evangelistic meetings, night 1',
    go: async (p) => {
      await meetingSeries(p);
      await bringUp(p, p.locator('[data-night]').first().locator('[data-kind="list"]'), 150);
    } },

  { name: 'office-progress', size: PHONE, what: 'The progress report',
    go: async (p) => {
      await signIn(p, /Maria Santos/i);
      await p.goto(`${BASE}/office?room=reports`, { waitUntil: 'networkidle' });
      await settle(p, 1400);
      await bringUp(p, p.locator('[data-explorers]'));
    } },
];

(async () => {
  const chosen = ONLY.length ? SHOTS.filter((s) => ONLY.includes(s.name)) : SHOTS;
  if (!chosen.length) {
    console.log(`No picture is called ${ONLY.join(', ')}. They are: ${SHOTS.map((s) => s.name).join(', ')}.`);
    process.exit(1);
  }
  const browser = await chromium.launch(launchOptions);
  let failed = 0;
  for (const shot of chosen) {
    const context = await browser.newContext(shot.size);
    // The install invitation is real and useful, and it is not what these
    // pictures are of: put it off, the way a person who said "later" has.
    await context.addInitScript(() => {
      try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 3650 * 24 * 60 * 60 * 1000)); } catch { /* fine */ }
    });
    const page = await context.newPage();
    try {
      await shot.go(page);
      await dismissBadge(page);
      const file = join(OUT, `${shot.name}.png`);
      await page.screenshot({ path: file });
      // These are flat-colour interface screens, not photographs, so a
      // 256-colour palette is visually indistinguishable and about a third of
      // the bytes. A README that costs 2 MB to clone is a README nobody thanks
      // you for.
      await shrink(file);
      console.log(`  wrote docs/screenshots/${shot.name}.png  ${shot.what}`);
    } catch (cause) {
      failed += 1;
      console.log(`  SKIPPED ${shot.name}: ${String(cause?.message ?? cause).split('\n')[0]}`);
    }
    await context.close();
  }
  await browser.close();
  // A missing picture is a broken image on the front page of the project, so
  // say so loudly.
  console.log(failed ? `\n${failed} picture(s) did not capture.` : '\nDone. Check every image before committing it.');
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
