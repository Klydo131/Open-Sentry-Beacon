// Is the brand one drawing, or several that happen to look similar?
//
// Before the Hope Beacon rename there were three different candles in this
// repo: app/icon.svg drew a plain one, public/icons/icon.svg drew a different
// one with rays and extra detail, and components/ShellChrome.tsx drew a third in
// JSX. Nobody noticed, because nothing ever renders them side by side — you see
// the favicon in a tab, the installed icon on a home screen, and the header
// inside the app, hours apart.
//
// The mark is now defined once in components/SentryBeaconMark.tsx and the icon
// files are generated from the same path data by scripts/gen-icons.mjs. This
// check enforces that they have not drifted since — because generating a file
// and committing it is exactly the kind of step that gets skipped.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let bad = 0;
const ok = (m) => console.log(`OK   ${m}`);
const fail = (m) => {
  bad++;
  console.log(`FAIL ${m}`);
};

const read = (rel) => {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8');
  } catch {
    return '';
  }
};

const component = read('components/SentryBeaconMark.tsx');
if (!component) {
  fail('components/SentryBeaconMark.tsx is missing — there is no mark to check');
  console.log('\nRESULT: 1 BRAND PROBLEM');
  process.exit(1);
}

// The two path strings that ARE the logo.
const ring = /const RING =\s*\n?\s*'([^']+)'/.exec(component)?.[1];
const tail = /const TAIL =\s*\n?\s*'([^']+)'\s*\+\s*\n?\s*'([^']+)'/.exec(component);
const tailPath = tail ? tail[1] + tail[2] : null;

ring && tailPath
  ? ok('the mark defines a ring and a tail path')
  : fail('could not read the ring/tail paths out of SentryBeaconMark.tsx');

// Every generated icon must contain exactly those paths.
const iconFiles = [
  'app/icon.svg',
  'public/icons/icon.svg',
  'public/icons/icon-maskable.svg',
].filter((f) => fs.existsSync(path.join(root, f)));

if (iconFiles.length === 0) {
  fail('no icon files found');
} else {
  const stale = iconFiles.filter((f) => {
    const svg = read(f);
    return !(ring && svg.includes(ring)) || !(tailPath && svg.includes(tailPath));
  });
  stale.length
    ? fail(
        `icons drawn from different geometry than the component: ${stale.join(', ')} ` +
          '— run `node scripts/gen-icons.mjs` and commit the result',
      )
    : ok(`all ${iconFiles.length} icons use the same geometry as the header mark`);
}

// No icon may still be a candle. The rename is only real if the old art is gone.
const candles = [...iconFiles, 'components/SentryBeaconMark.tsx'].filter((f) =>
  /🕯|candle/i.test(read(f)),
);
candles.length
  ? fail(`old candle artwork still present in: ${candles.join(', ')}`)
  : ok('no candle artwork left in the mark or the icons');

// ---- Every icon the manifest names must exist, and be the current mark ----
//
// This is the check that was missing, and its absence cost a release. The
// manifest named one filename; the generator wrote a different one. Both files
// existed, nothing failed, and the app quietly kept serving the OLD icon to
// every home screen — which is exactly what "the logo didn't change on my
// phone" looks like from the outside.
const manifestSrc = read('app/manifest.ts');
if (manifestSrc) {
  const referenced = [...manifestSrc.matchAll(/src:\s*'(\/icons\/[^']+)'/g)].map((m) => m[1]);
  const missing = referenced.filter(
    (r) => !fs.existsSync(path.join(root, 'public' + r)),
  );
  missing.length
    ? fail(`the manifest names icons that do not exist: ${missing.join(', ')}`)
    : ok(`all ${referenced.length} icons named by the manifest exist`);

  const staleSvg = referenced.filter((r) => {
    if (!r.endsWith('.svg')) return false;
    const svg = read('public' + r);
    return !(ring && svg.includes(ring)) || !(tailPath && svg.includes(tailPath));
  });
  staleSvg.length
    ? fail(
        `icons the manifest serves are drawn from older geometry: ${staleSvg.join(', ')} ` +
          '— run `npm run icons` and commit the result',
      )
    : ok('every SVG the manifest serves uses the current mark');

  // A home-screen shortcut on iOS needs a PNG; SVG is not accepted there.
  /\.png'/.test(manifestSrc)
    ? ok('the manifest offers PNG icons, which installers and launchers can use')
    : fail(
        'the manifest offers no PNG icon — iOS will put a screenshot of the page ' +
          'on the home screen instead of the logo',
      );
}

// Android fills its icon shape with the maskable icon. Without one, or with
// one that has see-through parts, it shrinks the logo into a white box.
const maskable = /src:\s*'(\/icons\/[^']+\.png)',[^}]*purpose:\s*'maskable'/.exec(manifestSrc ?? '')?.[1];
const png = maskable && fs.existsSync(path.join(root, 'public' + maskable))
  ? fs.readFileSync(path.join(root, 'public' + maskable))
  : null;
// PNG header: width and height at bytes 16-23, colour type at 25 (2 = RGB, no alpha).
png && png.readUInt32BE(16) >= 512 && png.readUInt32BE(16) === png.readUInt32BE(20) && png[25] === 2
  ? ok(`the manifest's maskable PNG is square, at least 512px and solid (${maskable})`)
  : fail('the manifest needs a maskable PNG icon, square, at least 512px, with no transparency, ' +
      'or Android shows the logo small inside a white box');

// iOS reads apple-touch-icon and nothing else for a home-screen shortcut.
const appleIcon = path.join(root, 'app/apple-icon.png');
if (fs.existsSync(appleIcon)) {
  const bytes = fs.statSync(appleIcon).size;
  bytes > 500
    ? ok(`app/apple-icon.png present (${Math.round(bytes / 1024)} kB)`)
    : fail('app/apple-icon.png exists but looks empty');
} else {
  fail(
    'app/apple-icon.png is missing — an iPhone home-screen shortcut will show a ' +
      'screenshot of the page rather than the logo',
  );
}

// ---- The app's name is defined once, and read from there ----
//
// A fork renames this app. That has to be one edit, in lib/brand.ts, and it is
// only one edit while nothing else spells the name out. Every place a name got
// hardcoded is a place a rename leaves half-done: the tab says one thing, the
// home screen says another, and nobody notices until a screenshot.
const brand = read('lib/brand.ts');
const appName = /APP_NAME\s*=\s*'([^']+)'/.exec(brand)?.[1];
const shortName = /APP_SHORT_NAME\s*=\s*'([^']+)'/.exec(brand)?.[1];

appName && shortName
  ? ok(`lib/brand.ts names the app "${appName}" (short: "${shortName}")`)
  : fail('lib/brand.ts must export APP_NAME and APP_SHORT_NAME as plain strings');

// A comment may mention the name; a STRING LITERAL is the duplication that
// survives a rename, so that is what is looked for.
const literal = (name) =>
  new RegExp(`['"\`]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);

for (const f of ['app/layout.tsx', 'app/manifest.ts', 'components/SentryBeaconMark.tsx']) {
  const src = read(f);
  if (!src) continue;

  /APP_NAME|APP_SHORT_NAME/.test(src)
    ? ok(`${f} takes the name from lib/brand.ts`)
    : fail(`${f} does not read APP_NAME/APP_SHORT_NAME — a rename would miss it`);

  const copies = [appName, shortName].filter((n) => n && literal(n).test(src));
  copies.length
    ? fail(`${f} also spells ${copies.map((c) => `"${c}"`).join(' and ')} out as a string — a rename would leave it behind`)
    : ok(`${f} spells no product name of its own`);
}

// The manifest must keep a pinned id. Renaming an installed app is safe only
// because identity is the id, not the name — without it, every installed copy
// would be orphaned and reinstall beside the old one. That was a real incident
// on this project and it must not come back through a rename.
const manifest = read('app/manifest.ts');
if (manifest) {
  /id:\s*'\/'/.test(manifest)
    ? ok("manifest pins id to '/' so a rename relabels the installed app")
    : fail(
        "manifest no longer pins id — renaming the app would create a SECOND " +
          'installed copy beside the old one',
      );
}

// ---------------------------------------------------------------------------
// The retired vocabulary stays retired.
//
// The roles have been renamed three times, and each rename left words behind in
// places the previous sweep had filtered out as code: "pair missionaries with
// seekers" on the Director's dashboard, "A missionary will be connected with you
// soon" on an Explorer's waiting screen, "Your missionary can study these with
// you" on the study shelf. The last of those survived TWO deliberate sweeps and
// was found by screenshotting the app for a client deck.
//
// The reason it keeps happening is that the retired words are also legitimate
// code: `role === 'admin'`, `/admin`, `is_admin()`, a `missionaries` count
// variable, `seekerPriorities`. So a plain grep either misses the copy or
// drowns in identifiers, and a person scanning the output makes the wrong call
// on the boundary.
//
// This checks only what a person can READ: JSX text between tags, and quoted
// strings that contain a space (so `'admin'` is a value and "A Director will
// approve you" is a sentence). It is deliberately narrow — it would rather miss
// an exotic case than cry wolf and be switched off.
// ---------------------------------------------------------------------------
{
  console.log('\n─── the retired vocabulary stays retired ───────────────────');

  const RETIRED = [
    [/\bmissionar(y|ies)\b/i, 'missionary → Guide'],
    [/\bdigital seekers?\b/i, 'Digital Seeker → Explorer'],
    [/\bseekers?\b/i, 'seeker → Explorer'],
  ];

  const walkAll = (dir, out = []) => {
    const full = path.join(root, dir);
    if (!fs.existsSync(full)) return out;
    for (const e of fs.readdirSync(full, { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === '.next') continue;
        walkAll(rel, out);
      } else if (/\.tsx$/.test(e.name)) out.push(rel);
    }
    return out;
  };

  const hits = [];
  for (const file of walkAll('app').concat(walkAll('components'))) {
    let src = fs.readFileSync(path.join(root, file), 'utf8');

    // Comments are history and are ALLOWED to name what was retired — several
    // exist precisely to explain the rename. Strip them first.
    src = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^[ \t]*\/\/.*$/gm, ' ');

    // Whole-file, not line-by-line. The first version matched `>text<` on a
    // single line, so it never saw JSX text that wraps — which is most of it.
    // "Your missionary can study these with\n you." sailed through the negative
    // control untouched, and the check reported OK. A guard that cannot fail is
    // worth less than no guard, because it also stops anyone looking.
    const readable = [];

    // Quoted sentences: a quoted run containing a space, so `'admin'` stays a
    // value and "A Director will approve you" is prose.
    for (const m of src.matchAll(/'([^'\n]*\s[^'\n]*)'|"([^"\n]*\s[^"\n]*)"/g)) {
      const t = m[1] ?? m[2];
      // Same prose test as the JSX branch below: a quoted run holding an
      // expression is a value, not a sentence somebody reads.
      if (/[=;(){}]/.test(t)) continue;
      if (!/[A-Za-z]\s+[A-Za-z]/.test(t)) continue;
      readable.push(t);
    }

    // JSX text: a run between a '>' and the next '<' containing no braces and
    // no angle brackets. Applied to the WHOLE FILE, so text that wraps across
    // lines is one match — that was the bug in the first version.
    //
    // The second version stripped tags and braces and scanned the residue,
    // which is still JavaScript: `const missionaries = ...` and a variable
    // called `seekerPriorities` both matched, and a check that reports fifteen
    // problems when there are two is a check people learn to ignore. So this
    // matches JSX text positively rather than by elimination, and then throws
    // away anything that looks like code rather than prose.
    for (const m of src.matchAll(/>([^<>{}]{4,})</g)) {
      const t = m[1];
      if (/[=;()]/.test(t)) continue;        // an expression, not a sentence
      if (!/[A-Za-z]\s+[A-Za-z]/.test(t)) continue;  // needs two real words
      readable.push(t);
    }

    for (const text of readable) {
      for (const [re, fix] of RETIRED) {
        const m = text.match(re);
        if (m) {
          const at = text.indexOf(m[0]);
          hits.push(`${file} — ${fix} — “…${text.slice(Math.max(0, at - 34), at + 40).trim()}…”`);
          break;
        }
      }
    }
  }

  // This file's ok() takes only a message and never fails — the first version
  // of this check called ok(condition, message) and printed a cheerful "OK true"
  // while asserting nothing at all. Exactly the failure mode the rest of today
  // kept producing: a check that reports success because it was wired wrong.
  if (hits.length === 0) {
    ok('no retired role word appears in anything a person can read');
  } else {
    for (const h of hits) fail(`retired vocabulary on screen — ${h}`);
  }
}

console.log(
  bad === 0 ? '\nRESULT: one brand, one drawing ✓' : `\nRESULT: ${bad} BRAND PROBLEM(S)`,
);
process.exit(bad ? 1 : 0);
