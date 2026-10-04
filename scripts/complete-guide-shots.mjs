#!/usr/bin/env node
// Every screen of the sample church, for the two complete guides.
//
// THE LIST OF SCREENS IS READ FROM THE APP, NOT WRITTEN HERE. For each sample
// person it opens every room in their Menu and, inside each room, opens the
// folder list and visits every folder it finds. A room or folder added later is
// photographed the next time this runs, without anybody remembering to add it;
// one that is removed simply stops appearing. That is what keeps the guides
// honest about what the app shows today.
//
// Sample people only (lib/demo/seed.ts): nothing here can photograph a real
// member, because the app is started with no database.
//
//   npm run build && node scripts/run-next.mjs start -p 4321
//   node scripts/complete-guide-shots.mjs 4321            # everything
//   node scripts/complete-guide-shots.mjs 4321 phone      # one part: phone,
//                                                         # computer or extras
//
// The parts can run side by side against one server, which is three times
// faster; each writes its own manifest-<part>.json.
//
// Writes docs/screenshots/complete/*.jpg and manifest.json beside them, which
// docs/guides/build-guides.mjs reads to lay out the picture chapters.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'docs/screenshots/complete');
const PORT = process.argv[2] || '4321';
const PART = process.argv[3] || 'all';
const wants = (part) => PART === 'all' || PART === part;
const BASE = `http://localhost:${PORT}`;
const { browser: engine, launchOptions } = require('../tests/e2e/_playwright.js');

// Saved at the size the guides print them, not the size the browser drew
// them: a phone screen 640 pixels wide (printed about 50 mm), a computer 1280.
// That is sharp on paper and on screen, and keeps 250 pictures near 15 MB in
// the repository rather than 30.
const QUALITY = 72;
const WIDTH = { phone: 640, tablet: 900, computer: 1280 };
const sharp = require('sharp');

const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  tablet: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 1.5, isMobile: true, hasTouch: true },
  computer: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};

const PEOPLE = [
  { role: 'explorer', title: 'Explorer', name: 'John Reyes' },
  { role: 'guide', title: 'Guide', name: 'Maria Santos' },
  { role: 'director', title: 'Director', name: 'Pastor Ramos' },
  { role: 'executive', title: 'Executive Director', name: 'Bishop Alonzo' },
];

const settle = (page, ms = 1300) => page.waitForTimeout(ms);
const slug = (s) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 40);
const clean = (s) => s.replace(/\s+/g, ' ').replace(/\s\d+$/, '').trim();

const manifest = [];

async function shot(page, { file, device, role, room, folder, caption, group }) {
  const png = await page.screenshot({ type: 'png' });
  await sharp(png).resize({ width: WIDTH[device] || 1280, withoutEnlargement: true })
    .jpeg({ quality: QUALITY, mozjpeg: true }).toFile(join(OUT, file));
  manifest.push({ file: `screenshots/complete/${file}`, device, role, room, folder, caption, group });
  process.stdout.write(`  ${file}\n`);
}

async function quiet(page) {
  for (const label of [/I understand|Continue|Got it|Agree/i, /Skip|Not now|Later|End tour/i]) {
    const b = page.getByRole('button', { name: label });
    if (await b.count()) { await b.first().click().catch(() => {}); await settle(page, 500); }
  }
  await page.keyboard.press('Escape').catch(() => {});
}

async function signIn(page, who) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await settle(page, 1100);
  await page.getByText(who, { exact: true }).first().click();
  await settle(page, 1600);
  await quiet(page);
}

/** The rooms this person's Menu lists, as [label, href]. */
async function roomsOf(page) {
  await page.goto(`${BASE}/menu`, { waitUntil: 'networkidle' });
  await settle(page, 1000);
  const links = await page.locator('main a[href^="/"]').evaluateAll((as) => as.map((a) => [a.innerText, a.getAttribute('href')]));
  const seen = new Set();
  // A row's text is its icon on one line and its name on the next; the name is
  // the first line with a letter in it. The profile row leads with initials.
  const name = (text, href) => (href === '/profile' ? 'Profile'
    : (text.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).find((l) => /\p{L}/u.test(l)) || '').replace(/\s*\(still on beta\)$/, ''));
  return links
    .map(([label, href]) => [name(label, href), href])
    .filter(([label, href]) => href && !/^\/(menu|login)/.test(href) && label && !seen.has(href) && seen.add(href));
}

/** Visit a room, photograph it, then every folder its drop-down offers. */
async function walkRoom(page, { device, person, label, href, folders = true }) {
  await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle' });
  await settle(page, 1500);
  await quiet(page);
  const base = `${device}-${person.role}-${slug(label) || 'room'}`;
  const toggle = page.locator('[data-subroom-toggle]').first();
  const hasFolders = folders && (await toggle.count()) > 0 && (await toggle.isVisible().catch(() => false));
  if (!hasFolders) {
    await shot(page, { file: `${base}.jpg`, device, role: person.title, room: label, folder: '', caption: `${person.title} · ${label}`, group: 'rooms' });
    return;
  }
  await toggle.click();
  await settle(page, 400);
  const names = (await page.getByRole('option').allInnerTexts()).map(clean).filter(Boolean);
  await page.keyboard.press('Escape');
  await settle(page, 300);
  for (let i = 0; i < names.length; i += 1) {
    await toggle.click().catch(() => {});
    await settle(page, 350);
    const option = page.getByRole('option').nth(i);
    if (!(await option.count())) break;
    await option.click().catch(() => {});
    await settle(page, 1400);
    await quiet(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await settle(page, 300);
    const folder = names[i].replace(/^[^\p{L}\p{N}]+/u, '');
    await shot(page, {
      file: `${base}-${i + 1}-${slug(folder)}.jpg`, device, role: person.title, room: label, folder,
      caption: `${person.title} · ${label} · ${folder}`, group: 'rooms',
    });
  }
}

const browser = await engine.launch(launchOptions);
try {
  mkdirSync(OUT, { recursive: true });
  // Clear only what this run is about to take again.
  const mine = PART === 'all' ? () => true
    : PART === 'extras' ? (f) => /^(phone-(front-door|login)|tablet-|phone-look-|computer-look-)/.test(f)
      : (f) => f.startsWith(`${PART}-`) && !/-look-|-front-door|-login/.test(f);
  for (const f of readdirSync(OUT)) if (f.endsWith('.jpg') && mine(f)) rmSync(join(OUT, f));

  // 1. THE FRONT DOOR, before anybody signs in.
  if (wants('extras')) {
    const ctx = await browser.newContext(DEVICES.phone);
    await ctx.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch {} });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/?tutorial=0`, { waitUntil: 'networkidle' });
    await settle(page, 1500);
    await shot(page, { file: 'phone-front-door.jpg', device: 'phone', role: 'Visitor', room: 'Front door', folder: '', caption: 'The front door, before signing in', group: 'start' });
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    await settle(page, 1300);
    await shot(page, { file: 'phone-login.jpg', device: 'phone', role: 'Visitor', room: 'Sign in', folder: '', caption: 'Signing in to the sample church: choose who to be', group: 'start' });
    await ctx.close();
  }

  // 2. EVERY ROOM AND FOLDER, for every role, on a phone; the rooms again on a
  //    computer and a tablet, without opening each folder.
  for (const [device, full] of [['phone', true], ['computer', true], ['tablet', false]]) {
    if (!wants(device === 'tablet' ? 'extras' : device)) continue;
    for (const person of PEOPLE) {
      if (device === 'tablet' && person.role !== 'guide' && person.role !== 'explorer') continue;
      const ctx = await browser.newContext(DEVICES[device]);
      await ctx.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch {} });
      const page = await ctx.newPage();
      process.stdout.write(`${device} · ${person.title}\n`);
      await signIn(page, person.name);
      if (device === 'phone') {
        await page.goto(`${BASE}/menu`, { waitUntil: 'networkidle' });
        await settle(page, 1000);
        await shot(page, { file: `phone-${person.role}-menu.jpg`, device, role: person.title, room: 'Menu', folder: '', caption: `${person.title} · the Menu`, group: 'menu' });
      }
      const rooms = await roomsOf(page);
      for (const [label, href] of rooms) {
        await walkRoom(page, { device, person, label, href, folders: full }).catch((e) => process.stdout.write(`  ! ${label}: ${e.message.split('\n')[0]}\n`));
      }
      await ctx.close();
    }
  }

  // 3. EVERY LOOK, on the same screen, so the difference is the look alone.
  if (wants('extras')) {
    const looks = [
      ['classic', 'Classic'], ['beacon', 'Beacon'], ['study', 'Study'], ['focus', 'Focus'],
      ['aero-eco', 'Frutiger Eco'], ['aero-dark', 'Dark Aero'], ['aero-technozen', 'Technozen'],
      ['aero-dorfic', 'DORFic'], ['aero-colors', 'Four Colors'],
    ];
    for (const device of ['phone', 'computer']) {
      const ctx = await browser.newContext(DEVICES[device]);
      await ctx.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch {} });
      const page = await ctx.newPage();
      await signIn(page, 'Maria Santos');
      for (const [id, name] of looks) {
        await page.evaluate((look) => localStorage.setItem('beacon-ui-theme', look), id);
        await page.goto(`${BASE}/church`, { waitUntil: 'networkidle' });
        await settle(page, 1500);
        await quiet(page);
        await shot(page, { file: `${device}-look-${id}.jpg`, device, role: 'Guide', room: 'Home', folder: name, caption: `The ${name} look, ${device === 'phone' ? 'on a phone' : 'on a computer'}`, group: 'looks' });
      }
      await page.evaluate(() => localStorage.setItem('beacon-ui-theme', 'classic'));
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(join(OUT, `manifest-${PART}.json`), JSON.stringify(manifest, null, 1));
console.log(`\n${manifest.length} screenshots (${PART})`);
