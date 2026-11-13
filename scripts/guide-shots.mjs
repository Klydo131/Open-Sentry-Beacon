// Capture the pictures the setup guide walks you through.
//
// SEPARATE FROM scripts/screenshots.mjs ON PURPOSE. That one photographs the
// PRODUCT — a Guide's desk, a conversation — for the README, to answer "what is
// this?". These photograph the JOURNEY a person setting it up actually takes,
// to answer . Different audience, different moments,
// and mixing them would mean every README refresh silently rewrites the guide's
// illustrations too.
//
//   npm run build && node scripts/run-next.mjs start -p 4310
//   node scripts/guide-shots.mjs 4310
//
// Every shot is the real app running with its own sample people. Nothing is
// composed or retouched. If a screen changes, rerun this — a screenshot is the
// one kind of documentation that rots with nothing failing.

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'docs/screenshots/guide');
const PORT = process.argv[2] || '4310';
const BASE = `http://localhost:${PORT}`;

const { chromium } = require('playwright');
mkdirSync(OUT, { recursive: true });

const settle = (page, ms = 1200) => page.waitForTimeout(ms);

const SHOTS = [
  {
    file: 'front-door.png',
    what: 'The front door, before anything is set up',
    go: async (page) => {
      await page.goto(`${BASE}/?tutorial=0`, { waitUntil: 'networkidle' });
      await settle(page, 1600);
    },
  },
  {
    file: 'tutorial-home.png',
    what: 'The tutorial: plum, badged, and a way out along the top',
    go: async (page) => {
      await page.goto(`${BASE}/?tutorial=1`, { waitUntil: 'networkidle' });
      await settle(page, 1600);
    },
  },
  {
    file: 'tutorial-pick.png',
    what: 'Choosing someone to be, in the tutorial',
    go: async (page) => {
      await page.goto(`${BASE}/?tutorial=1`, { waitUntil: 'networkidle' });
      await settle(page, 800);
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await settle(page, 1400);
    },
  },
  {
    file: 'guide-desk.png',
    what: "A Guide's desk: who you walk with, and what needs you today",
    go: async (page) => {
      await page.goto(`${BASE}/?tutorial=1`, { waitUntil: 'networkidle' });
      await settle(page, 800);
      await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
      await settle(page, 1200);
      const who = page.getByText(/Maria/i).first();
      if (await who.count()) await who.click();
      await settle(page, 1800);
      for (const label of [/I understand|Continue|Got it/i, /Skip|Not now|Close|Later|End tour/i]) {
        const b = page.getByRole('button', { name: label });
        if (await b.count()) { await b.first().click().catch(() => {}); await settle(page, 700); }
      }
    },
  },
  {
    file: 'setup-page.png',
    what: 'The /setup page, which checks your work as you go',
    go: async (page) => {
      await page.goto(`${BASE}/setup`, { waitUntil: 'networkidle' });
      await settle(page, 1600);
    },
  },
];

// The environment already ships a Chromium (PLAYWRIGHT_BROWSERS_PATH), so use
// that rather than making every contributor download a second copy. Falls back
// to Playwright's own resolution when the variable is not set.
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

const browser = await chromium.launch(executablePath ? { executablePath } : {});
for (const shot of SHOTS) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  try {
    await shot.go(page);
    await page.screenshot({ path: join(OUT, shot.file) });
    console.log(`  ${shot.file}  ${shot.what}`);
  } catch (cause) {
    console.error(`  ! ${shot.file} failed: ${cause.message}`);
    process.exitCode = 1;
  }
  await context.close();
}
await browser.close();
