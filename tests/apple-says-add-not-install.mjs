// An Apple device is told the words that are on its own menu.
//
// THE ASK.
//
// It was misleading in a specific, expensive way. No Apple menu contains the
// word Install anywhere. An iPhone and an iPad say Add to Home Screen, in a
// Share sheet; a Mac says Add to Dock, under File in the menu bar. Somebody
// told to press Install opens the Share sheet, reads every entry, does not find
// it, and concludes the app is broken rather than that the instruction was for
// a different make of computer. The code already knew this and said so in a
// comment -- "Apple has no programmatic install, so Install now cannot install"
// -- above a button labelled Install now.
//
// AND THE THREE ARE NOT ONE. An iPhone and an iPad shared a single set of steps
// with one variable sentence. The Share button is at the BOTTOM of Safari on an
// iPhone and at the TOP, in the toolbar, on an iPad, and a Mac has no Share
// step at all, so two thirds of that entry was written for somebody else's
// device whichever device was reading it.
//
//   node tests/apple-says-add-not-install.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

// The module is TypeScript and imports the brand name, so it is loaded the same
// way tests/errors-are-human.mjs loads its translator.
let mod;
try {
  mod = await import(pathToFileURL(path.join(root, 'lib/apple-install.ts')).href);
} catch (err) {
  const strippable = /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION|ERR_UNSUPPORTED_NODE_MODULE|Cannot find module/
    .test(String(err && (err.code || err.message)));
  if (!strippable || process.env.APPLE_RETRY === '1') {
    console.error('BAD could not load lib/apple-install.ts\n    ' + String(err && err.message));
    process.exit(1);
  }
  const r = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)],
    { stdio: 'inherit', env: { ...process.env, APPLE_RETRY: '1' } },
  );
  process.exit(r.status ?? 1);
}
const { appleKindFrom, addLabel, addChip, addTitle, sharePlace } = mod;

let bad = 0;
const ok = (c, m) => { if (!c) bad++; console.log(`${c ? 'OK ' : 'BAD'} ${m}`); };

// ---- Telling the three apart, against real user agents --------------------
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPAD_OLD = 'Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1';
// THE ONE THAT CATCHES PEOPLE OUT. iPadOS 13 and later report a Macintosh, and
// the ONLY thing that gives an iPad away is that it reports touch points. Read
// it as a Mac and every iPad is sent to a menu bar it does not have.
const IPAD_MODERN = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const MAC = IPAD_MODERN;
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

ok(appleKindFrom(IPHONE, 5) === 'iphone', 'an iPhone is an iPhone');
ok(appleKindFrom(IPAD_OLD, 5) === 'ipad', 'an older iPad is an iPad');
ok(appleKindFrom(IPAD_MODERN, 5) === 'ipad',
   'an iPad that claims to be a Macintosh is still an iPad, by its touch points');
ok(appleKindFrom(MAC, 0) === 'mac', 'a Mac with no touch screen is a Mac');
ok(appleKindFrom(ANDROID, 5) === null, 'an Android phone is not an Apple device');
ok(appleKindFrom(WINDOWS, 0) === null, 'nor is a Windows computer');

// ---- The words ------------------------------------------------------------
for (const kind of ['iphone', 'ipad', 'mac']) {
  for (const words of [addLabel(kind), addChip(kind), addTitle(kind, 'Hope Beacon'), sharePlace(kind)]) {
    ok(!/install/i.test(words), `nothing shown to a ${kind} says "install" (${words})`);
  }
}
ok(addLabel('iphone') === 'Add to Home Screen', 'an iPhone is told Add to Home Screen');
ok(addLabel('ipad') === 'Add to Home Screen', 'an iPad is told Add to Home Screen');
ok(addLabel('mac') === 'Add to Dock', 'a Mac is told Add to Dock, which is a different menu');
ok(addLabel(null) === 'Install', 'and everybody else is still told Install, which is their word');

// The Share button is in a different place on each, and that is the single most
// reported reason somebody gives up half way.
ok(/bottom/.test(sharePlace('iphone')), 'an iPhone is sent to the bottom of Safari');
ok(/top/.test(sharePlace('ipad')), 'an iPad is sent to the top of Safari');

// ---- The screens use it ---------------------------------------------------
const prompt = read('components/InstallPrompt.tsx');
const card = read('components/InstallCard.tsx');
const settings = read('components/LiveAccountPages.tsx');
const steps = read('components/InstallSteps.tsx');

const code = (src) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\/\/[^\n]*/g, ' ');

for (const [name, src] of [['the prompt', prompt], ['the settings card', card], ['settings', settings]]) {
  ok(/apple-install/.test(src), `${name} asks which Apple device this is`);
}
// No hard-coded Install left anywhere a person can read on those screens. The
// one exception is the real Chrome install button, which fires an actual
// install and is reached only where beforeinstallprompt exists.
ok(!/Install now/.test(code(prompt)), 'the prompt no longer offers "Install now" to Apple');
ok(!/Install now/.test(code(card)), 'nor does the settings card');
ok(!/'📱 Install'/.test(code(settings)), 'and the settings chip is not hard-coded to Install');

// ---- Three entries, with three sets of steps ------------------------------
ok(/key: 'safari-iphone'/.test(steps) && /key: 'safari-ipad'/.test(steps) && /key: 'safari-mac'/.test(steps),
   'there are three Apple entries, not one');
const iphone = steps.slice(steps.indexOf("key: 'safari-iphone'"), steps.indexOf("key: 'safari-ipad'"));
const ipad = steps.slice(steps.indexOf("key: 'safari-ipad'"), steps.indexOf("key: 'safari-mac'"));
const mac = steps.slice(steps.indexOf("key: 'safari-mac'"));
ok(/at the bottom/.test(iphone), 'the iPhone steps say the Share button is at the bottom');
ok(/at the top/.test(ipad), 'the iPad steps say it is at the top');
ok(/menu bar/.test(mac) && /<strong>File<\/strong>/.test(mac),
   'the Mac steps use the File menu in the menu bar');
ok(!/Tap the <strong>Share<\/strong>/.test(mac),
   'and never tell a Mac to tap a Share button, which its steps do not involve');
ok(/'auto' \| 'iphone' \| 'ipad' \| 'mac' \| 'other'/.test(steps),
   'the platform type names all three, so none can be quietly folded back together');

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
