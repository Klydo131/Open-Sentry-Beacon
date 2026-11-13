// Beacon's own notification sound, and every alert making a sound.
// Runs the real code: the sound, page/worker tag parity, notification options,
// when it plays, and the service worker's push handler in a sandbox.
// Browser half: tests/e2e/beacon-has-its-own-sound.js.
//
//   node tests/beacon-has-its-own-sound.mjs

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

// Node before 23 needs --experimental-strip-types; re-run with it.
let sound, noise;
try {
  sound = await import(pathToFileURL(path.join(root, 'lib/alert-sound.ts')).href);
  noise = await import(pathToFileURL(path.join(root, 'lib/noise.ts')).href);
} catch (err) {
  const strippable = /Unknown file extension|ERR_UNKNOWN_FILE_EXTENSION/.test(String(err && (err.code || err.message)));
  if (!strippable || process.env.SOUND_RETRY === '1') {
    console.error(`BAD could not load lib/alert-sound.ts on ${process.version}: ${err && err.message}`);
    process.exit(1);
  }
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)],
    { stdio: 'inherit', env: { ...process.env, SOUND_RETRY: '1' } });
  process.exit(r.status ?? 1);
}

const { BEACON_NOTES, PARTIALS, LEVEL, BURST_MS, scheduleBeaconSound, tagFor, alertOptions } = sound;

function recorder() {
  const oscs = [];
  const gains = [];
  const node = () => ({ connect() {} });
  return {
    oscs, gains, currentTime: 0, state: 'running',
    destination: node(),
    createGain() {
      const ramps = [];
      const g = { ...node(), gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime: (v, t) => ramps.push([v, t]) }, ramps };
      gains.push(g);
      return g;
    },
    createOscillator() {
      const o = { ...node(), type: '', frequency: { value: 0 }, start(t) { o.at = t; }, stop(t) { o.until = t; } };
      oscs.push(o);
      return o;
    },
  };
}

const rec = recorder();
const end = scheduleBeaconSound(rec, rec.destination, 0);
const pitches = BEACON_NOTES.map((n) => n.hz);
const chimeNotes = noise.VOICES.filter((v) => v.engine === 'chime').flatMap((v) => v.notes ?? []);
const near = (a, b) => Math.abs(1200 * Math.log2(a / b)) < 20; // cents

ok(BEACON_NOTES.length >= 3, `a figure of ${BEACON_NOTES.length} notes, not a single beep`);
ok(new Set(pitches).size >= 2, 'with more than one pitch in it');
ok(end > 0.3 && end < 1.0, `over in under a second (${end.toFixed(2)} s)`);
ok(rec.oscs.length === BEACON_NOTES.length * PARTIALS.length,
  `every note sounds every partial (${rec.oscs.length} oscillators)`);
ok(rec.oscs.every((o) => typeof o.at === 'number' && o.until > o.at && o.until <= end + 1e-9),
  'every oscillator is started and stopped, none left running');
ok(PARTIALS.every(([ratio]) => Number.isInteger(ratio)),
  'whole-number partials only: glass, not the wind chimes\' out-of-tune metal');
ok(rec.oscs.every((o) => o.type === 'sine'), 'built from sines, so nothing is harsh on a phone speaker');
const held = BEACON_NOTES.reduce((a, b) => (b.len > a.len ? b : a));
ok(!chimeNotes.some((c) => near(c, held.hz)),
  `it settles on a note no wind chime strikes (${held.hz} Hz)`);
ok(pitches.some((p) => !chimeNotes.some((c) => near(c, p))),
  'at least one of its notes is not a chime note at all');
ok(pitches.every((p) => p >= 500 && p <= 2500),
  'it sits where a phone speaker is loud and the ear is sharp (500 Hz to 2.5 kHz)');
const loudest = Math.max(...BEACON_NOTES.map((n) => n.level)) * LEVEL * PARTIALS.reduce((s, [, share]) => s + share, 0);
ok(loudest < 1, `cannot clip: the loudest moment of one note is ${loudest.toFixed(2)} of full scale`);

const routeSrc = fs.readFileSync(path.join(root, 'app/sw.js/route.ts'), 'utf8');
const worker = JSON.parse(routeSrc.match(/^const SOURCE = (".*");$/m)[1]);
const tagSrc = worker.match(/const tagFor = \(title, body\) => \{[\s\S]*?\n\};/);
ok(Boolean(tagSrc), 'the service worker has its own tagFor');
const workerTagFor = tagSrc ? vm.runInNewContext(`(${tagSrc[0].replace(/^const tagFor = /, '').replace(/;$/, '')})`) : () => '';

const long = 'Pray for the family moving house this week. '.repeat(12);
const samples = [
  ['Somebody is praying for you', 'Maria prayed for your request.'],
  ['  A new appointment  ', 'Sunday at 3 in the fellowship hall'],
  ['Salamat sa Diyos', 'Ipinagdarasal ka ni Ana 🙏 ngayong gabi'],
  ['A report needs you', null],
  ['A report needs you', undefined],
  ['A report needs you', ''],
  ['Long', long],
  ['مرحبا', 'رسالة جديدة'],
];
for (const [title, body] of samples) {
  ok(tagFor(title, body) === workerTagFor(title, body),
    `page and worker give "${String(title).trim().slice(0, 20)}" the same tag`);
}
// `notify` trims the title and cuts the body at 300; the page has the whole row.
ok(tagFor(' Long ', long) === workerTagFor('Long', long.slice(0, 300)),
  'a push (trimmed title, body cut at 300) matches the page\'s whole row');
const distinct = new Set(samples.slice(0, 4).map(([t, b]) => tagFor(t, b)).concat(tagFor('Long', long)));
ok(distinct.size === 5, 'different things get different tags, so each one sounds');
ok(/^beacon:[0-9a-z]+$/.test(tagFor('x', 'y')), 'tags are short and plain');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}
const sharing = [...walk('app'), ...walk('components'), ...walk('lib')].filter((f) => {
  const src = f === 'app/sw.js/route.ts' ? worker : fs.readFileSync(path.join(root, f), 'utf8');
  return /tag:\s*['"]beacon['"]/.test(src);
});
ok(sharing.length === 0, sharing.length ? `still sharing one tag: ${sharing.join(', ')}` : 'no alert shares the one tag any more');

const dock = fs.readFileSync(path.join(root, 'components/live/TalkDock.tsx'), 'utf8');
ok(/tag:\s*`beacon-talk:\$\{t\.pairing_id\}`,\s*renotify:\s*true/.test(dock),
  'a conversation has its own tag, and each new message in it sounds again');
const dockCode = dock.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
ok(!/last_preview/.test(dockCode) && /sent you a message`/.test(dockCode),
  'a message alert names who sent it, never the words, because it can show on a locked phone');

const base = { body: 'b', url: '/x', tag: 'beacon:abc' };
const ALL = { silent: true, renotify: true };
const o1 = alertOptions({ ...base, heard: true }, ALL);
ok(o1.silent === true, 'heard Beacon\'s sound, so the notification is silent: one sound, not two');
const o2 = alertOptions({ ...base, heard: false }, ALL);
ok(!('silent' in o2), 'not heard, so the device\'s own sound plays');
const o3 = alertOptions({ ...base, heard: true }, { silent: false, renotify: true });
ok(!('silent' in o3), 'a browser that cannot be silent (an iPhone) is never asked to be');
const o4 = alertOptions({ ...base, heard: false, renotify: true }, ALL);
ok(o4.renotify === true && o4.tag === base.tag, 'a stream sounds again on replacement where it can');
const o5 = alertOptions({ ...base, heard: false, renotify: true }, { silent: true, renotify: false });
ok(!('renotify' in o5) && o5.tag !== base.tag && o5.tag.startsWith(base.tag),
  'where a replacement cannot sound (Firefox, Safari), a stream gets a tag of its own instead');
const o6 = alertOptions({ ...base, heard: false }, ALL);
ok(!('renotify' in o6) && o6.tag === base.tag, 'one item keeps its tag, so a push and the app showing it are one');
ok(![o1, o2, o3, o4, o5, o6].some((o) => 'vibrate' in o),
  'never `vibrate` (a TypeError beside `silent`, and ignored on Android 8 and later anyway)');
ok(o2.data.url === '/x' && o2.icon && o2.badge, 'it still opens the right screen and shows the icon');

const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) };
const listeners = {};
let made = 0;
class FakeContext {
  constructor() {
    made++;
    Object.assign(this, recorder());
    this.state = 'suspended';
    FakeContext.last = this;
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}
globalThis.window = {
  AudioContext: FakeContext,
  addEventListener: (t, fn) => { listeners[t] = fn; },
  removeEventListener: (t) => { delete listeners[t]; },
};
globalThis.document = { visibilityState: 'visible' };

ok((await sound.playBeaconSound()) === false, 'before the first tap of a visit: no sound, the device\'s instead');
const undo = sound.armBeaconSound();
ok(['pointerdown', 'keydown', 'touchend'].every((t) => typeof listeners[t] === 'function'),
  'it waits for a tap or a key anywhere');
listeners.pointerdown();
await new Promise((r) => setTimeout(r, 20));
ok(made === 1 && !listeners.pointerdown, 'the first tap opens the audio, once, and stops listening');

const before = FakeContext.last.oscs.length;
ok((await sound.playBeaconSound()) === true, 'after it, with Beacon on screen: Beacon\'s sound plays');
const played = FakeContext.last.oscs.length - before;
ok(played === BEACON_NOTES.length * PARTIALS.length, `the whole sound, once (${played} oscillators)`);
ok((await sound.playBeaconSound()) === true && FakeContext.last.oscs.length - before === played,
  `a second alert within ${BURST_MS} ms counts as heard and makes no second sound`);

await new Promise((r) => setTimeout(r, BURST_MS + 50));
globalThis.document.visibilityState = 'hidden';
ok((await sound.playBeaconSound()) === false, 'with Beacon off the screen: no sound of ours, the ringer decides');
globalThis.document.visibilityState = 'visible';
sound.setSoundOn(false);
ok(store.get('hb-sound') === 'off' && (await sound.playBeaconSound()) === false,
  'switched off: no sound of ours, and it is remembered on the device');
const beforePreview = FakeContext.last.oscs.length;
ok((await sound.previewBeaconSound()) === true && FakeContext.last.oscs.length > beforePreview,
  'Hear it plays even when switched off: somebody asked for it');
sound.setSoundOn(true);
undo();

async function push({ clients = [], showing = [] }, payload) {
  const handlers = {};
  const shown = [];
  const sandbox = {
    self: {
      addEventListener: (t, fn) => { handlers[t] = fn; },
      registration: {
        showNotification: async (title, options) => { shown.push({ title, options }); },
        getNotifications: async ({ tag }) => showing.filter((n) => n.tag === tag),
      },
      clients: { matchAll: async () => clients },
      location: { origin: 'https://church.example' },
    },
    MessageChannel, setTimeout, clearTimeout, URL, console,
  };
  vm.runInNewContext(worker, sandbox);
  const waits = [];
  handlers.push({ data: { json: () => payload, text: () => '' }, waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  return shown;
}

const page = (visibilityState, answer, focused = true) => {
  const asked = [];
  return {
    visibilityState, focused, asked,
    postMessage(msg, ports) {
      asked.push(msg);
      if (answer === undefined) { ports[0].close(); return; } // never answers
      setTimeout(() => { ports[0].postMessage(answer); ports[0].close(); }, 10);
    },
  };
};

const P = { title: 'Somebody is praying for you', body: 'Maria prayed for your request.', url: '/ds#prayer' };
const expected = tagFor(P.title, P.body);

let r = await push({}, P);
ok(r.length === 1 && r[0].options.tag === expected, 'a push is shown with the item\'s own tag');
ok(!('silent' in r[0].options), 'with no Beacon window open, the device\'s own sound plays');

const yes = page('visible', true);
r = await push({ clients: [yes] }, P);
ok(yes.asked.some((m) => m.type === 'BEACON_SOUND'), 'with Beacon on the screen, the worker asks it to make the sound');
ok(r[0].options.silent === true, 'and on its yes, the notification is silent: one sound, Beacon\'s');

const no = page('visible', false);
r = await push({ clients: [no] }, P);
ok(!('silent' in r[0].options), 'on its no (switch off, an iPhone, not yet tapped), the device\'s sound plays');

const mute = page('visible', undefined);
const t0 = Date.now();
r = await push({ clients: [mute] }, P);
ok(!('silent' in r[0].options) && Date.now() - t0 < 2000, 'no answer in time, and the device\'s sound plays, promptly');

const hidden = page('hidden', true);
r = await push({ clients: [hidden] }, P);
ok(hidden.asked.length === 0 && !('silent' in r[0].options), 'a Beacon tab in the background is not asked');

const again = page('visible', true);
r = await push({ clients: [again], showing: [{ tag: expected }] }, P);
ok(again.asked.length === 0 && !('silent' in r[0].options),
  'the app already showed this one: replaced quietly, no second sound asked for');

r = await push({}, { title: 'Pinagdarasal ka', body: 'Isang bagong panalangin' });
ok(r[0].options.tag !== expected, 'a different push gets a different tag, so it sounds too');

const swPage = fs.readFileSync(path.join(root, 'components/ServiceWorker.tsx'), 'utf8');
ok(/d\?\.type === 'BEACON_SOUND'/.test(swPage) && /silentSupported\(\)\s*&&\s*\(await playBeaconSound\(\)\)/.test(swPage)
  && /ports\?\.\[0\]/.test(swPage), 'the page plays the sound for a push and answers on the port it was given');
const pushSrc = fs.readFileSync(path.join(root, 'lib/push.ts'), 'utf8');
ok(/silentSupported\(\)\s*&&\s*\(await playBeaconSound\(\)\)/.test(pushSrc),
  'the app plays its sound only where the notification can then be silent');

console.log(bad ? `\n${bad} FAILED` : '\nAll OK');
process.exit(bad ? 1 : 0);
