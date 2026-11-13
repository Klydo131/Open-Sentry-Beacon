const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));
const localMedia = read('lib/localMedia.ts');
const player = read('components/MediaPlayer.tsx');

let failures = 0;
function check(condition, message) {
  console.log(`${condition ? 'OK  ' : 'BAD '} ${message}`);
  if (!condition) failures++;
}

const dependencyNames = Object.keys({
  ...pkg.dependencies,
  ...pkg.devDependencies,
}).join(' ').toLowerCase();

check(
  !/tkvideoplayer|pyav|pillow|ffmpeg/.test(dependencyNames),
  'video playback adds no desktop/transcoding dependency',
);
check(
  !/\bfetch\s*\(/.test(localMedia),
  'on-device media storage makes no network request',
);
// THE PROPERTY, NOT THE SPELLING. This used to match the literal text
// `db.transaction(blob ? [META, BLOBS] : [META]`, so renaming a local variable
// read as losing atomicity. What matters is that one transaction covers both
// stores, so a row can never exist without its bytes.
const putBody = (() => {
  const at = localMedia.indexOf('export async function putMedia');
  return at === -1 ? '' : localMedia.slice(at, localMedia.indexOf('\nexport ', at + 10));
})();
check(putBody.length > 0, 'putMedia is where this check can see it');
check(
  (putBody.match(/db\.transaction\(/g) || []).length === 1,
  'putMedia opens exactly one transaction',
);
check(
  /db\.transaction\([^)]*META[^)]*BLOBS[^)]*\]/.test(putBody.replace(/\s+/g, ' ')),
  'that transaction spans both the metadata and the bytes',
);
check(
  /objectStore\(META\)\.put/.test(putBody) && /objectStore\(BLOBS\)\.put/.test(putBody),
  'media metadata and bytes use one atomic transaction',
);
check(
  localMedia.includes('db.transaction([META, BLOBS], \'readwrite\')'),
  'media deletion removes metadata and bytes atomically',
);
check(
  localMedia.includes('navigator.storage.estimate()') &&
    localMedia.includes('inspectPlayableMedia'),
  'uploads preflight storage and playback support',
);
check(
  player.includes('<video') && player.includes('video.videoWidth'),
  'video uses native playback and reports the decoded resolution',
);
// The claim moved with the player it described. It used to live in the media
// page's own prose; that section went when the private player was removed from
// this repository, so the only place Beacon still promises anything about 4K is
// the release notes — and that is where the promise now has to stay honest.
check(
  read('lib/release-notes.ts').includes('depends on the file format, browser, device and display'),
  'the 4K/60 claim stays conditional wherever it is made',
);

// EVERY STORE ON THE DEVICE, NOT ONLY THIS ONE. The attachments store learned
// in September that WebKit will not keep a Blob in IndexedDB, and that a write
// is not kept until its transaction completes. The post photo store, written in
// October, repeated both: Safari showed an empty grey square and no message.
// So every file that opens IndexedDB is held to the same two rules.
{
  const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(rel);
    return /\.(ts|tsx)$/.test(e.name) ? [rel] : [];
  });
  const stores = ['lib', 'components', 'app'].flatMap(walk).filter((f) => /indexedDB\.open\(/.test(read(f)));
  check(stores.length >= 3 && stores.includes('lib/post-media.ts'),
    `found every on-device store (${stores.join(', ')})`);
  for (const f of stores) {
    const src = read(f).replace(/\/\/[^\n]*/g, '');
    check(/\.oncomplete\s*=/.test(src), `${f}: a write counts only once its transaction completes`);
    check(!/\.put\(\s*(file|blob|new Blob|new File)\b/i.test(src),
      `${f}: puts bytes, never a Blob or File, which WebKit will not keep`);
  }
  const posts = read('lib/post-media.ts');
  check(/bytes:\s*await\s+file\.arrayBuffer\(\)/.test(posts) && /stored instanceof Blob/.test(posts),
    'a post photo is kept as bytes, and one kept earlier as a Blob still reads');
}

console.log(
  failures === 0
    ? '\nRESULT: media boundary intact'
    : `\nRESULT: ${failures} MEDIA VIOLATION(S)`,
);
process.exit(failures === 0 ? 0 : 1);
