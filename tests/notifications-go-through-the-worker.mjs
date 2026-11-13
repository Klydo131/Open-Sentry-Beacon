// A notification a phone will actually show.
//
// WHY THIS EXISTS. Alerts were turned on from a real Android phone, the screen
// said "✓ On", and nothing ever appeared. Chrome on Android refuses the
// `Notification` constructor outright — it throws `Illegal constructor` and
// permits only `ServiceWorkerRegistration.showNotification()`. The live
// settings screen called the constructor directly, so the confirmation threw
// and the person was left with a screen claiming success and a silent phone.
//
// It worked on a desktop, which is exactly how it survived review, and the
// demo settings screen next door had always done it correctly. One copy of two
// reached for the raw API.
//
// So: `lib/push.ts` is the only file allowed to name the constructor, and only
// as the guarded last-resort fallback underneath the service worker path.
// Everything else goes through showLocalNotification.
//
//   node tests/notifications-go-through-the-worker.mjs
//
// Plain Node, no dependencies. Reads the source; needs no browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

/** Every source file that could raise a notification. */
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const files = [...walk('components'), ...walk('app'), ...walk('lib')];
ok(files.length > 50, `there are sources to read (${files.length})`);

// `lib/push.ts` owns the fallback. Nothing else may construct one.
const ALLOWED = 'lib/push.ts';
const offenders = [];
for (const file of files) {
  if (file === ALLOWED) continue;
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  // Strip comments, so the explanation above a fix is not read as the bug.
  const code = src.replace(/\/\/[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (/\bnew\s+Notification\s*\(/.test(code)) offenders.push(file);
}
ok(
  offenders.length === 0,
  offenders.length
    ? `these call the constructor Android refuses: ${offenders.join(', ')}`
    : 'no file outside lib/push.ts constructs a Notification directly',
);

// And the owner still puts the service worker first, or the rule above would
// be pointing every caller at the same broken path.
const push = fs.readFileSync(path.join(root, ALLOWED), 'utf8');
const viaWorker = push.indexOf('showNotification');
const viaConstructor = push.indexOf('new Notification(');
ok(viaWorker !== -1, 'lib/push.ts raises alerts through the service worker');
ok(
  viaConstructor === -1 || viaWorker < viaConstructor,
  'and the registration is tried BEFORE the constructor, not after',
);

// The screen a person turns alerts on from must use the safe path.
const settings = fs.readFileSync(path.join(root, 'components/LiveAccountPages.tsx'), 'utf8');
ok(
  /showLocalNotification\(/.test(settings),
  'the live settings screen confirms through the service worker',
);

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
