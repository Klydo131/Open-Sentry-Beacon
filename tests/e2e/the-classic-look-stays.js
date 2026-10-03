// Classic, in a browser: Settings names it and has it chosen, and the app
// still draws exactly the colours it drew on the day it was named.
//
// Asked for on 3 October 2026: "I want the current UI to be called "classic"
// in the settings right now, ChatGPT or Codex will introduce new theme UI that
// users can pick, but make sure the classic UI remains the same please."
//
// THE FINGERPRINT BELOW IS CLASSIC, measured on 3 October 2026 from the app as
// it was before this walk existed. If a change makes this walk fail, the
// change has altered Classic: make it a look of its own instead (see
// lib/ui-themes.ts). Change these numbers only when the owner has decided that
// Classic itself should change, and say so in the commit.
//
//   npm run build && node scripts/run-next.mjs start -p 4414
//   node tests/e2e/the-classic-look-stays.js 4414

const { chromium, launchOptions } = require('./_playwright');

const PORT = process.argv[2] || '4414';
const BASE = `http://localhost:${PORT}`;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

const CLASSIC = {
  ground: 'rgb(244, 246, 251)',
  ink: 'rgb(26, 34, 51)',
  header: 'rgb(30, 42, 74)',
  bar: 'rgba(255, 255, 255, 0.96)',
  folder: 'rgb(30, 42, 74)',
  folderRadius: '18px',
  heading: 'rgb(30, 42, 74)',
  rootSize: '18px',
};

async function signInAs(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1100);
  const pick = page.getByText(who).first();
  if (await pick.count()) await pick.click();
  await page.waitForTimeout(1500);
  const consent = page.getByRole('button', { name: /I understand, continue/i }).first();
  try {
    await consent.waitFor({ state: 'visible', timeout: 3000 });
    await consent.click();
    await page.waitForTimeout(600);
  } catch {
    // Not shown, or already accepted.
  }
}

/** What Classic looks like on a Guide's home: the colours a person would notice changing. */
const fingerprint = (page) => page.evaluate(() => {
  const style = (selector) => {
    const el = document.querySelector(selector);
    return el ? getComputedStyle(el) : null;
  };
  const body = style('body');
  const folder = style('[data-subroom-toggle]');
  return {
    ground: body?.backgroundColor,
    ink: body?.color,
    header: style('header')?.backgroundColor,
    bar: style('nav[aria-label="Main"]')?.backgroundColor,
    folder: folder?.backgroundColor,
    folderRadius: folder?.borderRadius,
    heading: style('h1')?.color,
    rootSize: getComputedStyle(document.documentElement).fontSize,
    font: body?.fontFamily,
  };
});

const lookOf = (page) => page.evaluate(() => document.documentElement.getAttribute('data-ui-theme'));
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

(async () => {
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await context.addInitScript(() => {
    try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 3650 * 24 * 60 * 60 * 1000)); } catch { /* fine */ }
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // 1. CLASSIC, AS IT IS. On a phone nothing chosen means Desktop, the default
  // on computers since the owner asked for it, and on a phone Desktop IS
  // Classic: the fingerprint below is taken before anybody chooses anything.
  await signInAs(page, 'Maria Santos');
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  ok((await lookOf(page)) === 'desktop', 'before anybody chooses, the page is on the default look, Desktop');
  const before = await fingerprint(page);
  ok(before.ground === CLASSIC.ground && before.ink === CLASSIC.ink,
     `Classic's ground and ink are the same pale blue-grey and dark ink (${before.ground}, ${before.ink})`);
  ok(before.header === CLASSIC.header, `the same navy header (${before.header})`);
  ok(before.bar === CLASSIC.bar, `the same white bar along the bottom (${before.bar})`);
  ok(before.folder === CLASSIC.folder && before.folderRadius === CLASSIC.folderRadius,
     `the same navy folder button, rounded the same (${before.folder}, ${before.folderRadius})`);
  ok(before.heading === CLASSIC.heading && before.rootSize === CLASSIC.rootSize && /system-ui/.test(before.font ?? ''),
     `the same navy headings in the same system font at the same size (${before.heading}, ${before.rootSize})`);

  // 2. SETTINGS NAMES IT
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1300);
  const card = page.locator('[data-panel="look-settings"]');
  ok((await card.count()) === 1, 'Settings, General, has the Look card');
  const radios = card.getByRole('radio');
  ok((await radios.count()) >= 1 && /^Classic/.test((await radios.first().innerText()).trim()),
     'its first look is Classic');
  const classic = card.locator('[data-ui-theme-choice="classic"]');
  const desktop = card.locator('[data-ui-theme-choice="desktop"]');
  ok((await desktop.getAttribute('aria-checked')) === 'true' && /Chosen/.test(await desktop.innerText())
     && (await classic.getAttribute('aria-checked')) === 'false',
     'and Desktop, the default, is the one chosen, said in words as well as colour');
  await classic.scrollIntoViewIfNeeded();
  ok((await sideways(page)) <= 1, 'the card does not push a phone sideways');
  await classic.click();
  await page.waitForTimeout(400);
  ok((await page.evaluate(() => localStorage.getItem('beacon-ui-theme'))) === 'classic' && (await lookOf(page)) === 'classic'
     && (await classic.getAttribute('aria-checked')) === 'true' && /Chosen/.test(await classic.innerText()),
     'choosing Classic chooses it, says so, and this device remembers it');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok((await lookOf(page)) === 'classic', 'and keeps it after a reload: a person who chose Classic is not moved by the default');

  // 3. NOTHING ELSE CAN BE SMUGGLED IN
  await page.evaluate(() => localStorage.setItem('beacon-ui-theme', 'nonsense"><b'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  ok((await lookOf(page)) === 'desktop' && (await page.locator('[data-ui-theme-choice="desktop"]').getAttribute('aria-checked')) === 'true',
     'a stored value the app does not know is the default, and nothing else');
  await page.locator('[data-ui-theme-choice="classic"]').click();
  await page.waitForTimeout(400);

  // 4. AND CLASSIC IS STILL CLASSIC
  await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  const after = await fingerprint(page);
  ok((await lookOf(page)) === 'classic' && JSON.stringify(after) === JSON.stringify(before),
     'Classic, chosen, draws exactly what the phone drew before anybody chose: nothing has changed colour or size');

  ok(errors.length === 0, `no errors in the page${errors.length ? `: ${errors[0]}` : ''}`);
  await browser.close();
  console.log(bad ? `RESULT: ${bad} BAD` : 'RESULT: ALL OK');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
