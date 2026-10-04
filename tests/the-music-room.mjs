// The Music room: a tuner, a conductor's metronome, a page scanner and a score
// to practise from, for music lovers and the choir.
//
// Asked for on 4 October 2026: "Can we create another room for music for music
// lovers and choir, Put the main Audio tools to it, take out the audio tools
// from the library (unless they want to check and test the audio in the
// library). I want a tuner, a piece scanner, and beat maker (where you can
// track the beat like a conductor) ... make sure the features are Stable ...
// safe and not exploitable".
//
// This runs the arithmetic every tool rests on, the score reader against a
// written-for-purpose piece, the zip reader against hostile archives, and the
// scanner's geometry, and reads the code for the promises that keep the room
// safe: the microphone is released, nothing is sent anywhere, nothing is
// evaluated. tests/e2e/the-music-room.js walks the room in a browser.
//
//   node tests/the-music-room.mjs

import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (p) => read(p).replace(/\{\/\*[\s\S]*?\*\/\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-music-'));
const bundle = async (entries, name) => {
  const file = path.join(out, `${name}.mjs`);
  await build({
    stdin: { contents: entries.map((e) => `export * from './${e}';`).join('\n'), resolveDir: root, loader: 'ts' },
    alias: { '@': root },
    outfile: file,
    bundle: true, format: 'esm', platform: 'node', target: 'es2022', logLevel: 'silent',
  });
  return import(pathToFileURL(file).href);
};
const M = await bundle(['lib/music/notes', 'lib/music/beat', 'lib/music/musicxml', 'lib/music/zip', 'lib/music/page-scan'], 'music');

// ---------------------------------------------------------------------------
// 1. NOTES: frequencies, names and cents
// ---------------------------------------------------------------------------
{
  const a = M.readFrequency(440);
  ok(a.name === 'A' && a.octave === 4 && a.cents === 0 && a.midi === 69, 'A 440 Hz reads as A4, in tune');
  const middleC = M.readFrequency(261.63);
  ok(middleC.name === 'C' && middleC.octave === 4 && Math.abs(middleC.cents) <= 1, 'middle C reads as C4');
  ok(M.readFrequency(445).cents > 15 && M.readFrequency(435).cents < -15, 'sharp reads positive, flat negative');
  ok(M.readFrequency(432, 432).cents === 0 && M.readFrequency(432, 432).name === 'A', 'a choir tuning to A 432 is in tune at 432');
  ok(M.readFrequency(0) === null && M.readFrequency(-5) === null && M.readFrequency(NaN) === null, 'no note for silence or nonsense');
  ok(Math.abs(M.midiToHz(60) - 261.626) < 0.01 && M.midiName(60) === 'C4' && M.midiName(70) === 'A♯4', 'MIDI numbers name and sound right');
  ok(M.clampA4(1000) === M.A4_MAX && M.clampA4(1) === M.A4_MIN && M.clampA4(NaN) === 440, 'a reference A outside 400 to 480 is not taken');
}

// ---------------------------------------------------------------------------
// 2. THE BEAT: drift-free scheduling, tap tempo, the baton
// ---------------------------------------------------------------------------
{
  let state = { nextAt: 10, nextBeat: 0 };
  const all = [];
  // A scheduler waking every 25 ms for 2.05 seconds at 120 bpm, 3 beats a bar.
  for (let t = 10; t < 12.05; t += 0.025) {
    const r = M.due(state, 120, 3, t + 0.12);
    state = r.state;
    all.push(...r.clicks);
  }
  const gaps = all.slice(1).map((c, i) => c.at - all[i].at);
  ok(all.length >= 4 && gaps.every((g) => Math.abs(g - 0.5) < 1e-9), `120 bpm is a click every half second, exactly (${all.length} clicks, no drift)`);
  ok(all.map((c) => c.beat).join('') === '012012012'.slice(0, all.length), 'the beats count 1, 2, 3 and round again');
  ok(new Set(all.map((c) => c.at)).size === all.length, 'no click is handed over twice');
  const changed = M.due({ nextAt: 0, nextBeat: 1 }, 60, 4, 3.5).clicks;
  ok(changed.map((c) => c.at).join() === '0,1,2,3' && changed[0].beat === 1, 'a new tempo carries on from the next beat, not from the bar');
  ok(M.clampTempo(500) === M.TEMPO_MAX && M.clampTempo(5) === M.TEMPO_MIN && M.clampTempo(NaN) === M.TEMPO_DEFAULT, 'the tempo stays between 30 and 240');

  const beat = M.beatAt([{ at: 1, beat: 0 }, { at: 1.5, beat: 1 }], 120, 1.75);
  ok(beat.beat === 1 && Math.abs(beat.phase - 0.5) < 1e-9 && M.beatAt([{ at: 5, beat: 0 }], 120, 4) === null, 'the hand is half way to the next beat, half way between clicks');

  let taps = [];
  let bpm = null;
  for (const t of [0, 600, 1200, 1800, 2400]) ({ taps, bpm } = M.tap(taps, t));
  ok(bpm === 100, `taps 600 ms apart are 100 bpm (${bpm})`);
  ({ taps, bpm } = M.tap(taps, 9000));
  ok(bpm === null && taps.length === 1, 'a long pause starts a new count');

  for (const meter of M.METERS) {
    const [, y0] = M.batonAt(meter, 0, 0);
    const [, yLast] = M.batonAt(meter, meter - 1, 0);
    ok(M.PATTERNS[meter].length === meter && y0 > 80 && yLast < 30, `${meter}: the first beat comes down, the last goes up`);
  }
  const [, mid] = M.batonAt(4, 0, 0.5);
  const [, ends] = M.batonAt(4, 0, 0);
  ok(mid < ends, 'between beats the hand lifts');
}

// ---------------------------------------------------------------------------
// 3. THE SCORE READER, on a piece written for this check
// ---------------------------------------------------------------------------

/** A small XML reader for this check's own fixtures. The room uses the browser's. */
function tree(xml) {
  const text = xml.replace(/<\?[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>/g, '');
  const rootNode = { name: '#root', attrs: {}, kids: [], text: '' };
  const stack = [rootNode];
  const re = /<\/([\w:-]+)\s*>|<([\w:-]+)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[1]) stack.pop();
    else if (m[2]) {
      const attrs = {};
      for (const a of m[3].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = a[2];
      const node = { name: m[2], attrs, kids: [], text: '' };
      stack[stack.length - 1].kids.push(node);
      if (!m[4]) stack.push(node);
    } else if (m[5]) for (const n of stack) n.text += m[5];
  }
  const adapt = (n) => ({ name: n.name, attr: (k) => n.attrs[k] ?? null, kids: n.kids.map(adapt), text: n.text });
  return adapt(rootNode.kids[0]);
}

{
  const score = M.readScore(tree(read('tests/fixtures/music/four-parts.musicxml')));
  ok(score.title === 'Sing, my soul (test piece)' && score.tempo === 96 && score.length === 8, `title, tempo and length are read (${score.title}, ${score.tempo}, ${score.length})`);
  ok(score.lines.map((l) => l.name).join(' | ') === 'Women · voice 1 | Women · voice 2 | Tenor | Bass',
     `two voices on one staff are two lines; one voice is called by its part (${score.lines.map((l) => l.name).join(' | ')})`);
  const [soprano, alto, tenor, bass] = score.lines;
  const show = (l) => l.notes.map((n) => `${n.midi}@${n.start}+${n.length}`).join(' ');
  ok(show(soprano) === '64@0+1 65@1+1 67@2+3 69@5+1 67@6+2', `a tie across the bar is one held note (${show(soprano)})`);
  ok(soprano.notes.map((n) => n.lyric ?? '').join(' ') === 'Sing, my soul, a- rise!', 'the lyrics come with their notes');
  ok(show(alto) === '60@0+1 62@1+1 64@2+2 60@4+2 59@6+2', `the second voice starts again from the bar (backup) (${show(alto)})`);
  ok(show(tenor) === '60@0+4 55@0+4 55@4+2', `a chord's notes start together, and a rest is silence (${show(tenor)})`);
  ok(show(bass) === '48@0+2 43@2+2 48@4+4', 'the bass is read in its own octave');
}
{
  const throws = (fn, match) => { try { fn(); return false; } catch (e) { return e instanceof M.ScoreError && match.test(e.message); } };
  ok(throws(() => M.refuseHostileText('<!DOCTYPE x [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;">]><score-partwise/>'), /entities/), 'a file that declares its own entities is refused before parsing (billion laughs)');
  ok(throws(() => M.readScore(tree('<html><body>hi</body></html>')), /not a MusicXML score/), 'a file that is not a score says so');
  ok(throws(() => M.readScore(tree('<score-timewise/>')), /timewise/), 'a timewise score says how to fix it');
  ok(throws(() => M.readScore(tree('<score-partwise><part id="P1"><measure/></part></score-partwise>')), /No notes/), 'a score with no notes says so');
  const many = '<score-partwise>' + Array.from({ length: 30 }, (_, i) => `<part id="P${i}"><measure><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part>`).join('') + '</score-partwise>';
  ok(throws(() => M.readScore(tree(many)), /more than 24 voices/), 'more voices than a choir has is refused');
  const name = M.readScore(tree('<score-partwise><part-list><score-part id="P1"><part-name><img src=x onerror=alert(1)>' + 'x'.repeat(500) + '</part-name></score-part></part-list><part id="P1"><measure><note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration></note></measure></part></score-partwise>')).lines[0].name;
  ok(name.length <= 80, 'a name is cut to 80 characters, and reaches the screen as text');
}

// ---------------------------------------------------------------------------
// 4. THE ZIP READER, against archives built to break it
// ---------------------------------------------------------------------------

/** A zip of the given files, deflated, with honest or lying sizes. */
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name);
    const raw = Buffer.from(f.data);
    const body = f.method === 0 ? raw : zlib.deflateRawSync(raw);
    const size = f.claimSize ?? raw.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(f.flags ?? 0, 6);
    local.writeUInt16LE(f.method ?? 8, 8); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(f.flags ?? 0, 8); central.writeUInt16LE(f.method ?? 8, 10);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(size, 24); central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, dir, end]));
}
{
  const score = read('tests/fixtures/music/four-parts.musicxml');
  const container = '<container><rootfiles><rootfile full-path="music/piece.musicxml"/></rootfiles></container>';
  const good = zip([{ name: 'META-INF/container.xml', data: container }, { name: 'music/piece.musicxml', data: score }]);
  ok((await M.scoreFromMxl(good)) === score, 'a .mxl opens to the score its container names');
  const rejects = async (bytes, match) => { try { await M.scoreFromMxl(bytes); return false; } catch (e) { return e instanceof M.ZipError && match.test(e.message); } };
  // A bomb: 40 MB of zeros, which deflate to about 40 KB.
  const bomb = zip([{ name: 'bomb.xml', data: Buffer.alloc(40 * 1024 * 1024) }]);
  ok(bomb.length < 100_000 && await rejects(bomb, /larger than a phone should open/), `a zip bomb (${Math.round(bomb.length / 1024)} KB inflating to 40 MB) is refused by its declared size`);
  const liar = zip([{ name: 'bomb.xml', data: Buffer.alloc(40 * 1024 * 1024), claimSize: 1000 }]);
  ok(await rejects(liar, /larger than it says/), 'a zip bomb that lies about its size is stopped while inflating, at the size it claimed');
  ok(await rejects(zip([{ name: 'a.xml', data: 'x', flags: 1 }]), /encrypted/), 'an encrypted archive is refused');
  ok(await rejects(zip([{ name: 'a.xml', data: 'x', method: 12 }]), /compressed in a way/), 'an unknown compression method is refused');
  ok(await rejects(zip(Array.from({ length: 201 }, (_, i) => ({ name: `f${i}.txt`, data: 'x' }))), /more files/), 'an archive with more entries than a score has is refused');
  ok(await rejects(new Uint8Array([1, 2, 3, 4, 5]), /not a zip/), 'a file that is not a zip says so');
  ok(await rejects(zip([{ name: 'readme.txt', data: 'hello' }]), /No score/), 'a zip with no score in it says so');
}

// ---------------------------------------------------------------------------
// 5. THE PAGE SCANNER's geometry and ink
// ---------------------------------------------------------------------------
{
  const corners = [[10, 20], [110, 15], [120, 160], [5, 150]];
  const map = M.pageToPhoto(100, 141, corners);
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
  ok(map && near(map(0, 0), corners[0]) && near(map(100, 0), corners[1]) && near(map(100, 141), corners[2]) && near(map(0, 141), corners[3]),
     'the page\'s four corners land exactly on the four corners chosen');
  ok(M.isPageShape(corners) && !M.isPageShape([[0, 0], [100, 0], [0, 100], [100, 100]]) && !M.isPageShape([[0, 0], [50, 0], [100, 0], [0, 100]]),
     'a crossed or flat set of corners is not a page');
  ok(M.warp({ width: 10, height: 10, data: new Uint8ClampedArray(400) }, [[0, 0], [9, 0], [0, 9], [9, 9]]) === null, 'and is refused, not drawn');

  // A grey photo with a dark stroke and a shadow across half of it.
  const w = 200;
  const h = 283;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const paper = x < 100 ? 210 : 120; // the right half in shadow
    const ink = y >= 140 && y < 143; // a stave line
    const v = ink ? paper * 0.35 : paper;
    const i = (y * w + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  const flat = M.warp({ width: w, height: h, data }, [[0, 0], [w, 0], [w, h], [0, h]], w);
  const page = M.clean(flat.grey, flat.width, flat.height);
  const at = (x, y) => page[(y * flat.width + x) * 4];
  ok(at(50, 60) === 255 && at(150, 60) === 255, 'paper is white, in the light and in the shadow');
  ok(at(50, 141) < 60 && at(150, 141) < 60, 'ink is black, in the light and in the shadow');
}

// ---------------------------------------------------------------------------
// 6. WHAT KEEPS THE ROOM SAFE, read from the code
// ---------------------------------------------------------------------------
{
  const music = fs.readdirSync(path.join(root, 'lib/music')).map((f) => `lib/music/${f}`);
  const room = fs.existsSync(path.join(root, 'components/music'))
    ? fs.readdirSync(path.join(root, 'components/music')).map((f) => `components/music/${f}`) : [];
  const all = [...music, ...room, 'app/music/page.tsx'].filter((f) => fs.existsSync(path.join(root, f)));
  const sent = all.filter((f) => /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|import\(\s*['"`]https?:/.test(code(f)));
  ok(sent.length === 0, `nothing in the Music room sends or fetches anything${sent.length ? `: ${sent.join(', ')}` : ''}`);
  const evaluated = all.filter((f) => /\beval\(|new Function\(|dangerouslySetInnerHTML|innerHTML\s*=/.test(code(f)));
  ok(evaluated.length === 0, `nothing in the Music room evaluates code or writes HTML${evaluated.length ? `: ${evaluated.join(', ')}` : ''}`);

  const tuner = code('lib/music/tuner.ts');
  ok(/getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/.test(tuner) && /visibilitychange/.test(tuner) && /pagehide/.test(tuner) && /return \(\) => \{[\s\S]*stop\(\);/.test(tuner),
     'the tuner releases the microphone on Stop, on leaving, and when the phone locks or switches app');
  ok(!/connect\(audio\.destination\)|connect\(ctx\.destination\)/.test(tuner) && !/MediaRecorder/.test(tuner),
     'what the microphone hears is measured, never played back or recorded');
  ok(/echoCancellation: false/.test(tuner) && /video: false/.test(tuner), 'it asks for sound only, as it is');
  ok(/turn\.current \+= 1/.test(tuner) && /if \(mine !== turn\.current\) \{[\s\S]*?getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/.test(tuner),
     'a microphone allowed after the tuner was left is let go at once, never left listening');
  for (const f of ['lib/music/metronome.ts', 'lib/music/score-player.ts']) {
    ok(/visibilitychange/.test(code(f)) && /return \(\) => \{[\s\S]*stop\(\);/.test(code(f)), `${f}: silent when the room is left or the phone locks`);
  }

  const headers = read('next.config.mjs');
  ok(/microphone=\(self\)/.test(headers) && /camera=\(\)/.test(headers), 'the site still allows only its own microphone, and no camera (the scanner uses the photo picker)');
  ok(!/wasm-unsafe-eval/.test(headers.replace(/\/\/[^\n]*/g, '')), 'the Music room needed no WebAssembly: the security policy is unchanged');

  const pkg = JSON.parse(read('package.json'));
  ok(pkg.dependencies.pitchy === '4.1.0', 'the one new library, pitchy (MIT), is pinned to an exact version');
  const lock = JSON.parse(read('package-lock.json')).packages;
  ok(['node_modules/pitchy', 'node_modules/fft.js'].every((k) => lock[k]?.license === 'MIT' && !lock[k]?.hasInstallScript && /^sha512-/.test(lock[k]?.integrity ?? '')),
     'it and its one dependency are MIT, run nothing on install, and are locked by hash');
}

// ---------------------------------------------------------------------------
// 7. THE ROOM IN THE APP: who reaches it, and what moved out of My Files
// ---------------------------------------------------------------------------
{
  ok(M.tempoName(60) === 'Largo' && M.tempoName(80) === 'Andante' && M.tempoName(112) === 'Moderato'
     && M.tempoName(140) === 'Allegro' && M.tempoName(200) === 'Presto', 'a tempo is named the way the music names it');

  // Every role's list of rooms carries Music: the rail function returns one
  // `links: [...]` per role, and each must name it.
  const rails = code('components/RoomRails.tsx');
  ok(/const music = \{ href: '\/music'/.test(rails), 'the Music room has its own address, /music');
  const fn = rails.slice(rails.indexOf('export function railGroupsFor'), rails.indexOf('export function RightRail'));
  const lists = [...fn.matchAll(/links: \[([\s\S]*?)\]/g)].map((m) => m[1]).filter((l) => /\bhome\b/.test(l));
  ok(lists.length === 3 && lists.every((l) => /\bmusic\b/.test(l)), `every role has it in their rooms (${lists.length} role lists read)`);

  const page = code('app/music/page.tsx');
  ok(/EVERYONE: Role\[\] = \['executive', 'admin', 'dm', 'ds'\]/.test(page)
     && /<LiveAppShell allow=\{EVERYONE\}>/.test(page) && /<AppShell allow=\{EVERYONE\}>/.test(page),
     'everybody may open it, on the live app and in the sample church alike');

  const room = code('components/music/MusicRoom.tsx');
  ok(['listen', 'tuner', 'conductor', 'pieces'].every((r) => new RegExp(`room === '${r}' && <`).test(room)),
     'one folder at a time, so leaving the Tuner unmounts it and that releases the microphone');

  const library = code('app/library/page.tsx');
  ok(!/<PlayerPanel|<Playlists/.test(library), 'the player and playlists are no longer drawn in My Files');
  ok(/href="\/music"/.test(library) && /onTogglePlayer/.test(library), 'My Files says where they went, and each file keeps its own Play');
  const listen = code('components/music/Listen.tsx');
  ok(/<PlayerPanel/.test(listen) && /<Playlists/.test(listen), 'the Music room\'s Listen folder draws them instead');

  const scanner = code('components/music/PageScanner.tsx');
  ok(!/capture=/.test(scanner) && /accept="image\/\*"/.test(scanner), 'the scanner uses the photo picker, never the camera directly');
  ok(/savePiece\('page', [^,]+, page\.blob\)/.test(scanner) && !/savePiece\([^)]*file/.test(scanner),
     'only the clean page is kept, never the photo (so nothing the camera wrote into it is kept either)');
  const store = code('lib/music/pieces.ts');
  ok(/blobs\.put\(stored, piece\.id\)/.test(store) && !/blobs\.put\(blob/.test(store) && /new Blob\(\[stored\.bytes\]/.test(store),
     'pieces are kept as bytes, not Blobs, which WebKit (Safari) refuses to store');
  const pieces = code('components/music/PiecesPanel.tsx');
  ok(/scoreFromText\(await blob\.text\(\)/.test(pieces), 'a score kept on the phone is checked again every time it is opened');

  // FAST: opening Music costs no more than another room. Only Listen is in the
  // page; the rest arrive in idle time and are kept for offline use.
  ok(['TunerPanel', 'ConductorPanel', 'PiecesPanel'].every((p) => new RegExp(`import\\('@/components/music/${p}'\\)`).test(room)
     && !new RegExp(`^import \\{ ${p} \\}`, 'm').test(room)) && /requestIdleCallback/.test(room),
     'only Listen loads with the page; the other folders load when the phone is idle');
  ok(/'\/music'/.test(read('app/sw.js/route.ts')), 'the Music room is kept for opening with no signal');

  const conductor = code('components/music/ConductorPanel.tsx');
  ok(/wakeLock/.test(conductor) && /release\(\)/.test(conductor), 'the conductor keeps the screen on only while the baton moves');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
