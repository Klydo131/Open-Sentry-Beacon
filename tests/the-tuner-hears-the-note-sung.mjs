// The tuner hears the note that is sung: its ear, and the judge of Sing the
// note, measured on made-up voices and on real singing.
//
// WHY THIS EXISTS. Asked for on 14 October 2026: "MAKE SURE the tuner for
// voice is extremely accurate with 1 to 1 on voice to notes", then "the
// accuracy of notes from voice to notes needs to be 99% accurate and fast".
// So this holds the tuner to numbers, every run, and fails if one slips:
//
//   1. THE EAR, on every note the five voice parts sing (bass E2 to soprano C6,
//      121 notes), a vowel each in turn, from a breath, under four conditions:
//      an ordinary voice, a wide vibrato, a breathy voice in a noisy room and a
//      room's echo. Then on EVERY VOWEL of every note, 605 sung notes, under
//      the two that went wrong only on one vowel: a phone that hears nothing
//      below 250 Hz ("oo" on a low note), and a singer who does not open the
//      mouth onto a high note ("ee" at the top). A reading is right when it
//      names the note sung, in the right octave.
//   2. A ROUGH VOICE, beyond what counts as a healthy one: held to a lower bar,
//      and still never an octave out.
//   3. THE JUDGE, on every one of those notes sung six ways, graded as the
//      card grades them (15 October 2026: "detect if I hit a perfect note or
//      close enough"): in tune is Perfect; 18 cents sharp or flat is Close,
//      and says which way to go; 40 cents sharp, a semitone off and an octave
//      low are Try again, each named for what it was.
//   4. ONE TRY AFTER ANOTHER: held on, a note graded is not graded again
//      until the voice has left it; and notes sung one into the next, with no
//      breath, are each heard as themselves.
//   5. THE APP'S OWN SOUND IS NEVER JUDGED.
//   6. REAL SINGING: tests/fixtures/voice (vocadito, CC BY 4.0), with the pitch
//      marked by people. The tuner's readings against theirs.
//
// The made-up voices are tests/e2e/_made-up-voice.js; what it does and does
// not claim to be is written there. What this found, and the numbers before
// and after each fix, are in docs/MUSIC-RESEARCH.md ("How exact the tuner is").
// tests/e2e/a-sung-note-is-heard-as-itself.js sings to the practice in a
// browser.
//
//   node tests/the-tuner-hears-the-note-sung.mjs
//
// About a minute and a half: it listens to about twenty-five minutes of singing.

import { build } from 'esbuild';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const V = require('./e2e/_made-up-voice.js');

let bad = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${msg}`);
  if (!cond) bad++;
};

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-ear-'));
const file = path.join(out, 'ear.mjs');
await build({
  stdin: {
    contents: "export * from './lib/music/pitch-tracker'; export * from './lib/music/sing-the-note'; export { midiName } from './lib/music/notes';",
    resolveDir: root,
    loader: 'ts',
  },
  alias: { '@': root },
  outfile: file,
  bundle: true, format: 'esm', platform: 'node', target: 'es2022', logLevel: 'silent',
});
const M = await import(pathToFileURL(file).href);

const SR = 48000;
const HOP = 800; // sixty windows a second, as a phone's screen asks for them
const semis = (hz) => 69 + 12 * Math.log2(hz / 440);
const pct = (a, b) => `${((100 * a) / b).toFixed(2)}%`;
/** A grade as the card shows it, with the cents behind it. */
const said = (v) => `${M.gradeOf(v)}, ${M.gradeHint(v).words}, ${v.cents} cents`;

/** Every note each voice part sings, on every vowel. */
const EVERY_VOWEL = Object.entries(V.VOICES).flatMap(([part, v]) =>
  Array.from({ length: v.high - v.low + 1 }, (_, i) => Object.keys(V.VOWELS).map((vowel) => ({ part, sex: v.sex, midi: v.low + i, vowel }))).flat());
/** And with a vowel each in turn, one sung note each. */
const NOTES = EVERY_VOWEL.filter((n) => Object.keys(V.VOWELS)[n.midi % 5] === n.vowel);

/** The tuner's readings of a sound, sixty a second. */
function listen(x) {
  const tracker = new M.PitchTracker(SR);
  const frames = [];
  for (let end = M.LONG_WINDOW; end <= x.length; end += HOP) {
    const r = tracker.push(x.subarray(end - M.LONG_WINDOW, end), (end / SR) * 1000);
    frames.push({ t: end / SR, raw: r ? r.raw : null, shown: r && !r.held ? r.hz : null });
  }
  return frames;
}

/**
 * Every note sung for 1.4 s after a breath; the readings of its middle second,
 * scored. `every` 2 takes every other note, to keep this check to about a
 * minute; the conditions that most often go wrong are run on all of them.
 */
function ear(opts, every = 1, notes = NOTES) {
  let frames = 0, right = 0, octave = 0, none = 0;
  for (const n of notes.filter((_, i) => i % every === 0)) {
    const x = V.sing([[0.2, null], [1.4, n.midi]], { vowel: n.vowel, sex: n.sex, seed: n.midi * 7 + n.vowel.length, ...opts });
    for (const f of listen(x).filter((f) => f.t > 0.55 && f.t < 1.55)) {
      frames++;
      // What the screen shows is what is scored. (Scoring the readings behind
      // it hid a wrong note left on screen while every right reading was
      // being dropped as a slip.)
      if (!f.shown) { none++; continue; }
      const heard = Math.round(semis(f.shown));
      if (heard === n.midi) right++;
      else if (Math.abs(heard - n.midi) % 12 === 0) octave++;
    }
  }
  return { frames, right, octave, none, heard: frames - none };
}

// ---------------------------------------------------------------------------
// 1. THE EAR
// ---------------------------------------------------------------------------
for (const [what, opts, every, notes] of [
  ['an ordinary voice (vibrato 35 cents, breath, a phone\'s microphone)', {}, 1],
  ['a wide vibrato, 60 cents either side, six and a half a second', { vibrato: 60, vibratoRate: 6.5 }, 1],
  ['a breathy voice in a noisy room', { breath: 0.1, noise: 0.01 }, 2],
  ['a room\'s echo', { echo: 0.35 }, 2],
  // Before 14 October an "oo" from a man's C3 to D♯3 here was read an octave
  // up for the whole note: its first reading landed on the overtone and every
  // right one after it was thrown away as a slip.
  ['a phone that hears nothing below 250 Hz, every vowel', { mic: 250 }, 1, EVERY_VOWEL],
  // The mouth's first resonance left where speech has it: on "ee" above A5 a
  // harmonic sits on it, far louder than the note, and was read as the note.
  ['a singer who does not open the mouth onto a high note, every vowel from C4 up', { tune: false }, 1, EVERY_VOWEL.filter((n) => n.midi >= 60)],
]) {
  const r = ear(opts, every, notes);
  ok(r.right === r.heard && r.octave === 0 && r.none / r.frames < 0.02,
    `${what}: ${pct(r.right, r.heard)} of ${r.heard} readings name the note sung, ${r.octave} an octave out, ${pct(r.none, r.frames)} with no reading`);
}

// ---------------------------------------------------------------------------
// 2. A ROUGH VOICE: each cycle 1.5 per cent longer or shorter than the last,
//    where above about 1 per cent is counted unhealthy. Held to 99.5 per cent.
// ---------------------------------------------------------------------------
{
  const r = ear({ jitter: 0.015, shimmer: 0.1 }, 2);
  ok(r.right / r.heard >= 0.995 && r.octave === 0,
    `a rough voice: ${pct(r.right, r.heard)} of ${r.heard} readings name the note, ${r.octave} an octave out`);
}

// ---------------------------------------------------------------------------
// 3. THE JUDGE
// ---------------------------------------------------------------------------
function judge(target, sung, opts, tolerance = 25) {
  const x = V.sing([[0.2, null], [1.3, sung]], opts);
  const tracker = new M.PitchTracker(SR);
  const j = new M.NoteJudge(target, 440, tolerance);
  for (let end = M.LONG_WINDOW; end <= x.length; end += HOP) {
    const now = (end / SR) * 1000;
    const r = tracker.push(x.subarray(end - M.LONG_WINDOW, end), now);
    const said = j.push(r ? r.raw : null, now);
    if (said.state === 'judged') return { ...said.verdict, after: now - 200 };
  }
  return null;
}
{
  const ways = [
    ['in tune', 0, (v, m) => M.gradeOf(v) === 'perfect' && v.hit && Math.round(v.sung) === m],
    ['18 cents sharp', 0.18, (v) => M.gradeOf(v) === 'close' && v.hit && M.gradeHint(v).words === 'A little sharp' && M.gradeHint(v).go === 'down'],
    ['18 cents flat', -0.18, (v) => M.gradeOf(v) === 'close' && v.hit && M.gradeHint(v).words === 'A little flat' && M.gradeHint(v).go === 'up'],
    ['40 cents sharp', 0.4, (v) => M.gradeOf(v) === 'off' && !v.hit && M.gradeHint(v).words === 'Too sharp'],
    ['a semitone sharp', 1, (v, m) => M.gradeOf(v) === 'off' && M.gradeHint(v).words === `You sang ${M.midiName(m + 1)}` && M.gradeHint(v).go === 'down'],
    ['an octave low', -12, (v, m) => M.gradeOf(v) === 'off' && M.gradeHint(v).words === `You sang ${M.midiName(m - 12)}` && M.gradeHint(v).go === 'up'],
  ];
  for (const [how, shift, right] of ways) {
    let n = 0, good = 0, slowest = 0;
    const wrong = [];
    // In tune on every note; the other five ways on every other one.
    for (const note of NOTES.filter((_, i) => shift === 0 || i % 2 === 1)) {
      if (note.midi + shift < 36) continue; // below any voice
      n++;
      const v = judge(note.midi, note.midi + shift, { vowel: note.vowel, sex: note.sex, seed: note.midi * 7 + note.vowel.length });
      if (v && right(v, note.midi)) good++;
      else if (wrong.length < 3) wrong.push(`${note.part} ${M.midiName(note.midi)}: ${v ? said(v) : 'never judged'}`);
      if (v) slowest = Math.max(slowest, v.after);
    }
    ok(good === n, `sung ${how}: ${good} of ${n} graded right${how === 'in tune' ? `, each Perfect within ${Math.round(slowest)} ms of the voice starting` : ''}${wrong.length ? ` (${wrong.join('; ')})` : ''}`);
    if (how === 'in tune') ok(slowest <= 800, `a note held is judged within 0.8 s (${Math.round(slowest)} ms)`);
  }
}

// ---------------------------------------------------------------------------
// 4. ONE TRY AFTER ANOTHER, as the card listens: each note graded, the grade
//    shown for 1.4 s, then the next judge waits for the voice to leave the
//    note just graded. Sung without a breath between notes.
// ---------------------------------------------------------------------------
function run(targets, sung, gap = 0, hold = 1.8) {
  const parts = [[0.2, null]];
  for (const s of sung) { parts.push([hold, s]); if (gap) parts.push([gap, null]); }
  const x = V.sing(parts, { vowel: 'ah', sex: 'm', seed: 5 });
  const tracker = new M.PitchTracker(SR);
  const verdicts = [];
  // As the card does it: every reading to the judge, and after a grade a new
  // judge that hears the next 1.4 seconds but shows nothing until they pass.
  let j = new M.NoteJudge(targets[0], 440, 25);
  for (let end = M.LONG_WINDOW; end <= x.length && verdicts.length < targets.length; end += HOP) {
    const now = (end / SR) * 1000;
    const r = tracker.push(x.subarray(end - M.LONG_WINDOW, end), now);
    const said = j.push(r ? r.raw : null, now);
    if (said.state === 'judged') {
      verdicts.push(said.verdict);
      if (verdicts.length < targets.length) {
        j = new M.NoteJudge(targets[verdicts.length], 440, 25, said.verdict.sung, { from: now, until: now + 1400 });
      }
    }
  }
  return verdicts;
}
{
  const legato = run([60, 62, 64, 65, 67], [60, 62, 64, 65, 67]);
  ok(legato.length === 5 && legato.every((v) => v.hit),
    `five notes sung one into the next, no breath: ${legato.filter((v) => v.hit).length} of 5 hit (${legato.map((v) => said(v)).join('; ')})`);
  const steps = run([60, 61, 62, 61, 60], [60, 61, 62, 61, 60]);
  ok(steps.length === 5 && steps.every((v) => v.hit), `and in semitones (${steps.map((v) => said(v)).join('; ')})`);
  // The same note twice: still holding the first is not singing the second.
  const held = run([60, 60], [60]);
  ok(held.length === 1, `one C4 held on is not two C4s: the second waits for a breath (${held.length} judged)`);
  const twice = run([60, 60], [60, 60], 0.3);
  ok(twice.length === 2 && twice.every((v) => v.hit), 'sung again after a breath, it is');
  // "It even bugs out after using, the voice no longer accurate after using it
  // one time" (15 October 2026). Short notes, each breath taken while the last
  // grade still shows: before that day the breath went unheard and the next
  // C4 was taken for the last one held on, so only every other try was graded.
  const quick = run([60, 60, 60], [60, 60, 60], 0.4, 1.0);
  ok(quick.length === 3 && quick.every((v) => v.hit),
    `three short C4s, each breath taken while the last grade shows: ${quick.length} of 3 graded (${quick.map((v) => said(v)).join('; ')})`);
}

// ---------------------------------------------------------------------------
// 5. NEVER ITS OWN SOUND. While Hear it plays, the card tells the judge to
//    start again every frame; a note heard only then is never judged.
// ---------------------------------------------------------------------------
{
  const x = V.sing([[0.2, null], [1.5, 69]], { vowel: 'ah', sex: 'f', seed: 3 });
  const tracker = new M.PitchTracker(SR);
  const j = new M.NoteJudge(69, 440, 25);
  let judged = false;
  for (let end = M.LONG_WINDOW; end <= x.length; end += HOP) {
    const now = (end / SR) * 1000;
    const r = tracker.push(x.subarray(end - M.LONG_WINDOW, end), now);
    j.restart();
    if (j.push(r ? r.raw : null, now).state === 'judged') judged = true;
  }
  ok(!judged, 'a note heard only while the app plays it is never judged');
  const card = fs.readFileSync(path.join(root, 'components/music/SingTheNote.tsx'), 'utf8');
  ok(/if \(t < quietUntil\.current\) \{ j\.restart\(\); return; \}/.test(card) && /quietUntil\.current = performance\.now\(\) \+/.test(card)
    && /window\.dispatchEvent\(new Event\(QUIET_EVENT\)\)/.test(card)
    && /window\.addEventListener\(QUIET_EVENT, stop\)/.test(fs.readFileSync(path.join(root, 'components/music/TunerAdvanced.tsx'), 'utf8')),
    'and the card does that while Hear it plays, and stops the drone when a practice starts');
}

// ---------------------------------------------------------------------------
// 6. REAL SINGING: vocadito, track 1 (CC BY 4.0; tests/fixtures/voice/README.md).
// ---------------------------------------------------------------------------
{
  const dir = path.join(root, 'tests/fixtures/voice');
  const b = zlib.gunzipSync(fs.readFileSync(path.join(dir, 'vocadito_1.wav.gz')));
  let o = 12, rate = 0, data = null;
  while (o < b.length) {
    const tag = b.toString('ascii', o, o + 4), size = b.readUInt32LE(o + 4);
    if (tag === 'fmt ') rate = b.readUInt32LE(o + 12);
    if (tag === 'data') data = b.subarray(o + 8, o + 8 + size);
    o += 8 + size + (size % 2);
  }
  const x = new Float32Array(data.length / 2);
  for (let i = 0; i < x.length; i++) x[i] = data.readInt16LE(i * 2) / 32768;
  const label = zlib.gunzipSync(fs.readFileSync(path.join(dir, 'vocadito_1_f0.csv.gz'))).toString('utf8').trim().split('\n').map((l) => l.split(',').map(Number));
  const step = label[1][0] - label[0][0];
  const at = (t) => { const i = Math.round(t / step); return i >= 0 && i < label.length ? label[i][1] : 0; };
  const notes = (who) => fs.readFileSync(path.join(dir, `vocadito_1_notes${who}.csv`), 'utf8').trim().split('\n').map((l) => l.split(',').map(Number));

  const tracker = new M.PitchTracker(rate);
  const hop = Math.round(rate / 60);
  const frames = [];
  for (let end = M.LONG_WINDOW; end <= x.length; end += hop) {
    const r = tracker.push(x.subarray(end - M.LONG_WINDOW, end), (end / rate) * 1000);
    frames.push({ t: end / rate, raw: r ? r.raw : null, shown: r && !r.held ? r.hz : null });
  }
  // A reading describes the sound a little before it: the delay that agrees best.
  const delay = (key) => {
    let best = { d: 0, score: -1 };
    for (let d = 0; d <= 0.15; d += 0.002) {
      let agree = 0, n = 0;
      for (const f of frames) { const h = at(f.t - d); if (h > 0 && f[key]) { n++; if (Math.abs(semis(f[key]) - semis(h)) <= 0.5) agree++; } }
      if (agree / n > best.score) best = { d, score: agree / n };
    }
    return best.d;
  };
  const d = delay('raw');
  const dNeedle = delay('shown');
  const A1 = notes('A1');
  const held = (t) => A1.some(([on, , dur]) => t >= on + dur * 0.2 && t <= on + dur * 0.8);
  let sung = 0, read = 0, within = 0, octave = 0, needleN = 0, needleOk = 0;
  for (const f of frames) {
    const h = at(f.t - d);
    if (held(f.t - d) && h > 0) {
      sung++;
      if (f.raw) {
        read++;
        const off = Math.abs(semis(f.raw) - semis(h)) * 100;
        if (off <= 50) within++;
        if (off > 600) octave++;
      }
    }
    const hn = at(f.t - dNeedle);
    if (held(f.t - dNeedle) && hn > 0 && f.shown) { needleN++; if (Math.abs(semis(f.shown) - semis(hn)) <= 0.5) needleOk++; }
  }
  ok(read / sung >= 0.99, `real singing: ${pct(read, sung)} of ${sung} moments in held notes are given a reading`);
  ok(within / read >= 0.99 && octave === 0,
    `${pct(within, read)} of those are within 50 cents of the pitch people marked, ${octave} an octave out (readings ${Math.round(d * 1000)} ms behind the voice)`);
  ok(needleOk / needleN >= 0.975, `the needle shows the note marked ${pct(needleOk, needleN)} of the time (${Math.round(dNeedle * 1000)} ms behind)`);
  for (const [who, least] of [['A1', 0.98], ['A2', 0.98]]) {
    let n = 0, near = 0;
    for (const [on, hz, dur] of notes(who)) {
      const inside = frames.filter((f) => f.raw && f.t - d >= on + dur * 0.2 && f.t - d <= on + dur * 0.8).map((f) => semis(f.raw)).sort((a, b) => a - b);
      if (!inside.length) continue;
      n++;
      if (Math.abs(inside[inside.length >> 1] - semis(hz)) * 100 <= 50) near++;
    }
    ok(n >= notes(who).length - 1 && near / n >= least, `annotator ${who}'s ${notes(who).length} notes: ${near} of ${n} named within 50 cents of their mark`);
  }
}

fs.rmSync(out, { recursive: true, force: true });
console.log(bad ? `\n${bad} FAILED` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
