// The words can be read, in every look.
//
// Asked for on 6 October 2026: "Make sure the aesthetic for all theme UI is
// good and organize, we have sensitive users when it comes to design so please
// be careful."
//
// What was wrong. Every look was photographed on every room one person can
// reach, on a phone, a pad and a computer, and every piece of writing was
// measured against the pixels actually behind it. Some of what was found:
//
//   - the Featured card in My Files kept a pale blue wash under a dark look,
//     so the look's pale writing sat on pale blue (about 1.2:1);
//   - the Guide's request on an Explorer's Prayer page was a teal card the
//     dark looks did not repaint, the same pale-on-pale;
//   - the bell's count, the profile banners and the numbers bar set their
//     ground inline and left the ink to the look, so a look could make them
//     white on gold or white on lime (under 2:1);
//   - Classic's faint grey (text-gray-400, 2.5:1 on white) on dates, hints and
//     counts in fifty-seven files.
//
// Every one of those was fixed, and this walk measures the same screens in
// every look so that none can come back without somebody seeing it.
//
// HOW IT MEASURES, which is the point: not by reading CSS. A look repaints
// classes, an inline style escapes it, a gradient sits under a transparent
// card; computing colours from the stylesheet missed exactly the problems
// above. So the screen is photographed twice, once as it is and once with
// every letter made invisible, and each piece of writing is measured against
// 24 points of the second photograph behind it. The middle value decides, so
// one busy pixel does not. Only writing that is on top where it is drawn is
// measured (words under a panel are not what anybody reads there), and
// writing with no letters or digits (an emoji, a glyph) is skipped, because
// it is drawn in its own colours, not in the text colour.
//
// THE FLOOR IS 3:1. The guideline for ordinary text is 4.5:1, and most of the
// app now meets it. 3:1 is the line under which writing stops being merely
// light and becomes hard to read at all; it is what every problem above was
// under, and what a look can be held to without failing on a deliberate light
// grey. It is not a claim that everything here meets 4.5.
//
// Walked on a phone (390 by 844), where most of what was found was, as an
// Explorer, a Guide and a Director, in every look Settings offers: a new look
// is measured the day it is added, without editing this file.
//
//   node tests/e2e/the-words-can-be-read-in-every-look.js [port] [look,look]
//
// Name looks after the port to walk only those, while fixing one.

const { browser: engine, launchOptions } = require('./_playwright');
const zlib = require('node:zlib');
const { signIn } = require('./_looks');

const BASE = `http://localhost:${process.argv[2] || '4415'}`;
const ONLY = process.argv[3]?.split(',');
const FLOOR = 3;
let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// Every piece of writing on the screen that a person can see: its box, its
// colour and how faded it is.
const WRITING = () => {
  const out = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    // All of the element's own words: "{name} asked you to pray" is two
    // pieces of text in one line, and is measured as the line.
    const words = [...el.childNodes].filter((c) => c.nodeType === Node.TEXT_NODE).map((c) => c.nodeValue).join('').replace(/\s+/g, ' ').trim();
    if (!/[\p{L}\p{N}]/u.test(words)) continue;
    if (el.closest('svg,[disabled],[aria-disabled="true"],[aria-hidden="true"],script,style,noscript')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility !== 'visible' || cs.display === 'none') continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width < 3 || r.height < 6) continue;
    if (r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) continue;
    const top = document.elementFromPoint(
      Math.min(innerWidth - 1, Math.max(0, (r.left + r.right) / 2)),
      Math.min(innerHeight - 1, Math.max(0, (r.top + r.bottom) / 2)),
    );
    if (!top || !(top === el || el.contains(top) || top.contains(el))) continue;
    let opacity = 1;
    for (let at = el; at; at = at.parentElement) opacity *= Number(getComputedStyle(at).opacity);
    if (opacity < 0.05) continue;
    // Gradient writing paints its fill, not its colour.
    const fill = cs.webkitTextFillColor;
    const color = fill && fill !== 'rgba(0, 0, 0, 0)' && fill !== cs.color ? fill : cs.color;
    out.push({
      words: words.slice(0, 50),
      box: [Math.max(0, r.left), Math.max(0, r.top), Math.min(innerWidth, r.right), Math.min(innerHeight, r.bottom)],
      color, opacity, cls: typeof el.className === 'string' ? el.className.slice(0, 70) : '',
    });
  }
  return out;
};

/**
 * A browser's screenshot, read back as pixels: 8 bits a channel, RGB or RGBA,
 * not interlaced, which is what Chromium and WebKit both write. Read here
 * rather than by a second page drawing it on a canvas, because a second page
 * puts the app's page in the background, where its entrance animation never
 * finishes and the room's writing stays invisible.
 */
function pixels(png) {
  let width = 0, height = 0, channels = 0;
  const data = [];
  for (let at = 8; at < png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.toString('ascii', at + 4, at + 8);
    const body = png.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      channels = { 2: 3, 6: 4 }[body[9]];
      if (body[8] !== 8 || !channels || body[12]) throw new Error('a screenshot in a PNG format this walk does not read');
    } else if (type === 'IDAT') data.push(body);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  const raw = zlib.inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? out[y * stride + x - channels] : 0;
      const up = y ? out[(y - 1) * stride + x] : 0;
      const corner = x >= channels && y ? out[(y - 1) * stride + x - channels] : 0;
      let v = raw[y * (stride + 1) + 1 + x];
      if (filter === 1) v += left;
      else if (filter === 2) v += up;
      else if (filter === 3) v += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - corner;
        const [pa, pb, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - corner)];
        v += pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
      }
      out[y * stride + x] = v & 255;
    }
  }
  return {
    width,
    height,
    at: (x, y) => {
      const i = (Math.round(Math.min(height - 1, y)) * width + Math.round(Math.min(width - 1, x))) * channels;
      return [out[i], out[i + 1], out[i + 2]];
    },
  };
}

const rgba = (v) => {
  const n = (v.match(/[\d.]+/g) || []).map(Number);
  const k = /^color\(srgb\b/.test(v) ? 255 : 1;
  return [(n[0] ?? 0) * k, (n[1] ?? 0) * k, (n[2] ?? 0) * k, n[3] ?? 1];
};
const lum = (c) => c.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; })
  .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/** Each piece of writing's middle contrast against 24 points of what is behind it. */
function contrast(behind, writing) {
  return writing.map((t) => {
    const [x0, y0, x1, y1] = t.box;
    const c = rgba(t.color);
    const a = c[3] * t.opacity;
    const all = [];
    for (let gy = 0; gy < 4; gy += 1) for (let gx = 0; gx < 6; gx += 1) {
      const bg = behind.at(x0 + ((x1 - x0) * (gx + 0.5)) / 6, y0 + ((y1 - y0) * (gy + 0.5)) / 4);
      all.push(ratio(bg.map((v, i) => c[i] * a + v * (1 - a)), bg));
    }
    all.sort((p, q) => p - q);
    return { ...t, ratio: all[Math.floor(all.length / 2)] };
  });
}

/**
 * Wait until nothing that moves in is still moving: a notice dropping in from
 * the top is measured where it ends. Some arrive a moment after the page does,
 * so the screen has to be still twice in a row, not once. Spinners go round
 * forever and are not waited for.
 */
async function settled(page) {
  let still = 0;
  for (let i = 0; i < 30 && still < 2; i += 1) {
    const moving = await page.evaluate(() => document.getAnimations()
      .filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations !== Infinity).length);
    still = moving ? 0 : still + 1;
    await page.waitForTimeout(100);
  }
}

/** Every piece of writing on the screen as it is now that falls under the floor. */
async function faint(page) {
  const writing = await page.evaluate(WRITING);
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.id = '__words_hidden';
    s.textContent = '*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}';
    document.head.appendChild(s);
  });
  await page.waitForTimeout(120);
  const behind = pixels(await page.screenshot({ type: 'png' }));
  await page.evaluate(() => document.getElementById('__words_hidden')?.remove());
  // Writing that moved while it was photographed is not judged against a
  // picture of somewhere else.
  const after = await page.evaluate(WRITING);
  const stayed = writing.filter((t) => after.some((u) => u.words === t.words && u.box.every((v, i) => Math.abs(v - t.box[i]) <= 1)));
  const measured = contrast(behind, stayed);
  return { measured, under: measured.filter((t) => t.ratio < FLOOR) };
}

const say = (t) => `"${t.words}" ${t.ratio.toFixed(2)}:1 (${t.color}${t.cls ? `, ${t.cls}` : ''})`;

// The screens, by who reaches them, each with the writing that was fixed
// there. `at` is scrolled to the middle of the screen before measuring, and
// `must` has to be among what was measured: a screen that failed to load, or
// a fix hidden under a panel, would otherwise pass with nothing measured.
const SCREENS = {
  'John Reyes': [
    { label: 'My Files, Featured', href: '/library?room=featured', at: '.wash-featured', must: /^The Bible, free/ },
    { label: 'My Files, On this device', href: '/library?room=mine', at: '[data-library-title]', must: /^Add to this device$/ },
    { label: 'Prayer, what the Guide asked', href: '/ds?room=prayer', at: '[data-asked-by-guide]', must: /asked you to pray for them$/ },
    { label: 'Profile', href: '/profile', at: 'h1', must: /^Exploring faith/ },
  ],
  'Maria Santos': [
    { label: 'Profile', href: '/profile', at: 'h1', must: /^Guide\. Walks with people/ },
    { label: 'Office, Lesson studies', href: '/office?room=studies', at: 'button[aria-expanded] .text-amber-700', must: / lessons$/ },
  ],
  'Pastor Ramos': [
    { label: 'Home, The numbers', href: '/church?room=numbers', at: 'text=Cultivate', must: /^Cultivate$/ },
  ],
};

(async () => {
  const browser = await engine.launch({ ...launchOptions });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    // The install invitation is its own walk's business, not this one's.
    await context.addInitScript(() => { try { localStorage.setItem('beacon-install-snoozed-until', String(Date.now() + 864e6)); } catch { /* about:blank */ } });
    const page = await context.newPage();

    // The looks Settings offers, read from Settings itself.
    await signIn(page, BASE, 'John Reyes');
    await page.goto(`${BASE}/settings?room=general`, { waitUntil: 'networkidle' });
    const looks = await page.locator('[data-ui-theme-choice]').evaluateAll((els) => els.map((el) => el.getAttribute('data-ui-theme-choice')));
    ok(looks.length >= 9 && looks.includes('classic'), `Settings offers ${looks.length} looks, Classic among them (${looks.join(', ')})`);
    if (ONLY) looks.splice(0, looks.length, ...looks.filter((l) => ONLY.includes(l)));

    // The Guide asks the Explorer to pray, so the Explorer's Prayer page has
    // the card that was pale on pale.
    await signIn(page, BASE, 'Maria Santos');
    await page.goto(`${BASE}/dm`, { waitUntil: 'networkidle' });
    await page.locator('[data-quest="seeker-card"]', { hasText: 'John' }).first().click();
    await page.waitForURL(/\/dm\/.+/);
    await page.locator('[data-subroom-toggle]').first().click();
    await page.getByRole('option', { name: /Care/ }).click();
    await page.getByLabel(/What would you like John to pray for/i).fill('Please pray for my father, his surgery is on Friday.');
    await page.getByRole('button', { name: /^Ask John$/ }).click();
    await page.locator('[data-my-ask]').first().waitFor({ timeout: 5000 });

    for (const [person, screens] of Object.entries(SCREENS)) {
      await signIn(page, BASE, person);
      for (const look of looks) {
        await page.evaluate((l) => localStorage.setItem('beacon-ui-theme', l), look);
        for (const { label, href, at, must } of screens) {
          await page.goto(`${BASE}${href}`, { waitUntil: 'networkidle' });
          const there = page.locator(at).first();
          const shown = await there.waitFor({ timeout: 10000 }).then(() => true, () => false);
          const worn = await page.evaluate(() => document.documentElement.dataset.uiTheme || 'classic');
          if (shown) await there.evaluate((el) => el.scrollIntoView({ block: 'center' }));
          await settled(page);
          const { measured, under } = await faint(page);
          const found = measured.some((t) => must.test(t.words));
          ok(shown && found && worn === look && under.length === 0,
             `${look}: ${person.split(' ')[0]}'s ${label}, ${measured.length} pieces of writing, none under ${FLOOR}:1`
             + (!shown ? ` (BUT ${at} never appeared)` : !found ? ` (BUT ${must} was not measured: hidden, or not there; measured ${measured.slice(0, 12).map((t) => JSON.stringify(t.words)).join(' ')})` : '')
             + (worn !== look ? ` (BUT the page wore ${worn})` : '')
             + (under.length ? `\n      ${under.slice(0, 6).map(say).join('\n      ')}${under.length > 6 ? `\n      and ${under.length - 6} more` : ''}` : ''));
        }
      }
    }
    await context.close();
  } finally {
    await browser.close();
  }
  console.log(bad ? `\n${bad} check(s) failed` : '\nAll checks passed');
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
