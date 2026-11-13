// Does each live screen actually mount its own component?
//
// WHY A BROWSER AND NOT A GREP. The live-or-tutorial choice is made at runtime,
// per visitor, in lib/tutorial.tsx. Reading the source tells you a branch
// exists; only a browser tells you which way it went. Four screens spent weeks
// showing AppShell's "This live screen is being connected" placeholder while
// their source looked perfectly reasonable.
//
//   npm run build && node scripts/run-next.mjs start -p 4320
//   node scripts/live-screens-check.mjs 4320
//
// Needs NEXT_PUBLIC_SUPABASE_URL and _ANON_KEY set at BUILD time, because that
// is what puts the app in live mode. It does not need the database to answer:
// a screen that renders its own loading state has proved the point, and a
// screen showing the placeholder has proved the opposite.

import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const PORT = process.argv[2] || '4320';
const BASE = `http://localhost:${PORT}`;
const PLACEHOLDER = /This live screen is being connected/;

// Each screen and a phrase only IT can produce. Deliberately matched against
// the loading state as well as the loaded one — the check is "did the right
// component mount", not "did the database answer".
const SCREENS = [
  ['/profile', /Loading your profile|Profile details/i],
  ['/settings', /Notifications|Loading/i],
  ['/mail', /Invitations|Hope Beacon sends real email|Loading/i],
  ['/church', /Our church|Loading/i],
];

function findChrome() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    for (const entry of fs.readdirSync(root)) {
      if (!entry.startsWith('chromium-')) continue;
      const candidate = `${root}/${entry}/chrome-linux/chrome`;
      if (fs.existsSync(candidate)) return candidate;
    }
  } catch { /* fall through to Playwright's own copy */ }
  return undefined;
}

const executablePath = findChrome();
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const context = await browser.newContext({ viewport: { width: 1100, height: 800 } });
const page = await context.newPage();

let failures = 0;
for (const [path, expected] of SCREENS) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500);
  const text = await page.evaluate(() => document.body.innerText);
  const placeholder = PLACEHOLDER.test(text);
  const own = expected.test(text);
  const verdict = placeholder ? 'PLACEHOLDER' : own ? 'ok' : 'UNRECOGNISED';
  if (verdict !== 'ok') failures += 1;
  console.log(`${path.padEnd(10)} ${verdict.padEnd(12)} ${text.slice(0, 60).replace(/\s+/g, ' ')}`);
}

await browser.close();
console.log(
  failures === 0
    ? '\nOK  every live screen mounts its own component'
    : `\nFAIL  ${failures} screen(s) did not`,
);
process.exit(failures === 0 ? 0 : 1);
