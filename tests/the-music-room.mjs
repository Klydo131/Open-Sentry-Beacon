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
const M = await bundle(['lib/music/notes', 'lib/music/beat', 'lib/music/musicxml', 'lib/music/zip', 'lib/music/page-scan', 'lib/music/play', 'lib/music/explain'], 'music');
const SP = await bundle(['lib/music/score-player'], 'score-player');
const PT = await bundle(['lib/music/pitch-tracker'], 'pitch-tracker');

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
// 1b. CONCERT PITCH: what a change does, said in words, and an A taken from
//     an instrument. Asked for on 4 October 2026: "I just put the Hertz and
//     nothing much is happening ... develop that where users can really feel it".
// ---------------------------------------------------------------------------
{
  ok(Math.abs(M.centsBetween(880, 440) - 1200) < 1e-9 && Math.round(M.centsBetween(442, 440)) === 8, 'cents: an octave is 1200, and 442 is 8 cents above 440');
  ok(M.pitchWords(440) === 'The standard most choirs, pianos and recordings use.', 'A 440 is called the standard');
  ok(/^2 Hz above the standard 440: every note sounds about 8 cents higher\.$/.test(M.pitchWords(442)), `A 442 is said as higher, in cents (${M.pitchWords(442)})`);
  ok(/below .* about 32 cents lower/.test(M.pitchWords(432)), `A 432 is said as lower (${M.pitchWords(432)})`);
  ok(/about a semitone lower/.test(M.pitchWords(415)) && /about 165 cents lower/.test(M.pitchWords(400)), 'baroque 415 is about a semitone; 400 is said in cents, not rounded to one');
  ok(M.CONCERT_PITCHES.map((p) => p.hz).join(',') === '415,432,440,442' && M.CONCERT_PITCHES.every((p) => M.clampA4(p.hz) === p.hz),
     'the common pitches are 415, 432, 440 and 442, all inside the range a tuner takes');
  ok(M.foldToA4(220) === 440 && M.foldToA4(880) === 440 && M.foldToA4(110.4) === 441.6, "an A in any octave folds to the A above middle C");
  ok(M.foldToA4(261.63) === null && M.foldToA4(329.63) === null && M.foldToA4(0) === null && M.foldToA4(NaN) === null, 'a C or an E is not taken for an A');
  const held = (hz, n = M.STEADY_READINGS) => Array(n).fill(hz);
  ok(M.heardA(held(441.6)) === 441.6, 'a held A is heard, to a tenth of a hertz');
  ok(M.heardA(held(441.6, M.STEADY_READINGS - 1)) === null, 'not before it has been held for a moment');
  ok(M.heardA([...held(440, M.STEADY_READINGS - 1), 470]) === null, 'not while it wavers');
  ok(M.heardA(held(261.63)) === null, 'not when the note held is not an A');
  ok(M.heardA(Array.from({ length: M.STEADY_READINGS }, (_, i) => (i % 2 ? 220.8 : 441.6))) === 441.6,
     'a tuner jumping an octave on a held A still hears one A');
  ok(M.heardA([...held(261.63, 20), ...held(442)]) === 442, 'only the latest readings count, so the A is heard once it starts');
}

// ---------------------------------------------------------------------------
// 1c. THE TUNER'S EAR (lib/music/pitch-tracker.ts), on made-up voices.
//
// Reworked on 6 October 2026: "It should be fast and perfectly accurate like a
// real perfect pitch tuner." These are the numbers it is held to, measured on
// sounds made here: a pure tone, a voice-like tone (six harmonics and noise),
// the same with a singer's vibrato, a change of note, a bass whose second
// harmonic is louder than its note, and a room with nobody singing. The tuner
// it replaced, on the same sounds, was as accurate (under a cent) but showed a
// new note after 152 ms, and its needle spread 4.1 cents on a vibrato.
// ---------------------------------------------------------------------------
{
  const SR = 48000;
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const gauss = () => { let t = 0; for (let i = 0; i < 6; i++) t += rand(); return (t - 3) / Math.sqrt(0.5); };
  const cents = (a, b) => 1200 * Math.log2(a / b);
  const note = (hz) => Math.round(69 + 12 * Math.log2(hz / 440));
  // A sound: [seconds, hz or null for silence] pieces, with harmonics, vibrato and noise.
  const render = (pieces, { vib = 0, harm = [1], noise = 0 } = {}) => {
    seed = 7; // every sound made the same way each time, whatever ran before it
    const x = new Float32Array(Math.round(pieces.reduce((t, p) => t + p[0], 0) * SR));
    const phases = harm.map(() => rand() * 6.28);
    let ph = 0, i = 0;
    for (const [sec, hz] of pieces) {
      for (let k = 0, m = Math.round(sec * SR); k < m; k++, i++) {
        let v = 0;
        if (hz) {
          ph += (2 * Math.PI * hz * 2 ** ((vib * Math.sin(2 * Math.PI * 5.5 * (i / SR))) / 1200)) / SR;
          harm.forEach((a, h) => { v += a * Math.sin((h + 1) * ph + phases[h]); });
          v *= 0.3;
        }
        x[i] = v + noise * gauss();
      }
    }
    return x;
  };
  // Fed as the tuner feeds it: the newest window, sixty times a second.
  const run = (x) => {
    const tracker = new PT.PitchTracker(SR);
    const out = [];
    for (let end = PT.LONG_WINDOW; end <= x.length; end += 800) {
      const r = tracker.push(x.subarray(end - PT.LONG_WINDOW, end), (end / SR) * 1000);
      out.push({ t: end / SR, hz: r ? r.hz : null, held: r ? r.held : false });
    }
    return out;
  };
  const voice = [1, 0.7, 0.5, 0.35, 0.25, 0.15];
  const freqs = [82.41, 98, 123.47, 146.83, 220, 329.63, 440, 523.25, 880, 1046.5];
  const worst = (opts) => Math.max(...freqs.map((f) => {
    const hz = f * 2 ** (7 / 1200);
    const got = run(render([[1.5, hz]], opts)).filter((o) => o.t > 0.3);
    if (got.some((o) => !o.hz)) return Infinity;
    return Math.abs(got.reduce((t, o) => t + cents(o.hz, hz), 0) / got.length);
  }));
  const pure = worst({});
  ok(pure < 1, `a pure tone is read within a cent, bass E2 to soprano C6 (worst ${pure.toFixed(2)})`);
  const sung = worst({ harm: voice, noise: 0.01, vib: 25 });
  ok(sung < 2, `a voice with harmonics, noise and vibrato is read within 2 cents, and never drops out (worst ${sung.toFixed(2)})`);
  {
    const got = run(render([[2, 220]], { harm: voice, noise: 0.01, vib: 25 })).filter((o) => o.t > 0.4 && o.hz).map((o) => cents(o.hz, 220));
    const mean = got.reduce((a, b) => a + b, 0) / got.length;
    const spread = Math.sqrt(got.reduce((t, v) => t + (v - mean) ** 2, 0) / got.length);
    ok(spread < 4.1, `the needle is steadier on a vibrato than the old tuner's 4.1 cents (${spread.toFixed(1)})`);
  }
  const onset = (f) => {
    const first = run(render([[0.3, null], [1, f]], { harm: voice, noise: 0.005 })).find((o) => o.t > 0.3 && o.hz && note(o.hz) === note(f));
    return first ? (first.t - 0.3) * 1000 : Infinity;
  };
  {
    const first = run(render([[0.3, null], [1, 440]])).find((o) => o.t > 0.3 && o.hz);
    const ms = first ? (first.t - 0.3) * 1000 : Infinity;
    ok(ms <= 20, `a clean, clear note shows on its very first reading, without waiting for a second (${Math.round(ms)} ms)`);
  }
  const onsets = [98, 220, 440, 880].map(onset);
  ok(Math.max(...onsets) <= 60, `a note sung after silence shows within 60 ms (${onsets.map((m) => Math.round(m)).join(', ')} ms)`);
  const change = (a, b) => {
    const after = run(render([[0.8, a], [1, b]], { harm: voice, noise: 0.005 })).filter((o) => o.t > 0.8);
    const k = after.findIndex((o, i) => after.slice(i).every((q) => q.hz && note(q.hz) === note(b)));
    return k < 0 ? Infinity : (after[k].t - 0.8) * 1000;
  };
  const changes = [[220, 329.63], [146.83, 110], [523.25, 587.33], [98, 130.81]].map(([a, b]) => change(a, b));
  ok(Math.max(...changes) <= 110, `a change of note shows within 110 ms, where the old tuner took 152 (${changes.map((m) => Math.round(m)).join(', ')} ms)`);
  {
    const got = run(render([[2, 98]], { harm: [0.6, 1.2, 0.5, 0.3], noise: 0.01, vib: 15 })).filter((o) => o.t > 0.2 && o.hz);
    ok(got.length > 50 && got.every((o) => Math.abs(note(o.hz) - note(98)) < 11), 'a bass whose second harmonic is louder than its note is never read an octave up');
  }
  ok(run(render([[2, null]], { noise: 0.05 })).every((o) => !o.hz), 'a room with nobody singing shows no note');
  {
    const out = run(render([[1, 330], [1, null]], { harm: voice, noise: 0.002 }));
    const held = out.filter((o) => o.t > 1 && o.held);
    const gone = out.find((o) => o.t > 1 && !o.hz);
    ok(held.length > 0 && gone && (gone.t - 1) * 1000 <= PT.HOLD_MS + (PT.LONG_WINDOW / SR) * 1000 + 40 && held.every((o) => note(o.hz) === note(330)),
       'when the singing stops, the last note is held for a moment, then cleared');
  }
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
// 3b. EXPLAINING A PIECE (lib/music/explain.ts), on a hymn written for it.
//
// Asked for on 6 October 2026: the choir and the conductor should "understand
// how the piece works already". What is checked is what the explanation
// claims: each of its sentences has to be true of the score it describes.
// ---------------------------------------------------------------------------
{
  const hymn = M.readScore(tree(read('tests/fixtures/music/hymn-in-g.musicxml')));
  ok(hymn.key?.fifths === 1 && hymn.key?.mode === 'major' && hymn.time?.beats === 3 && hymn.time?.beatType === 4,
     `the key and the time are read (${JSON.stringify(hymn.key)}, ${JSON.stringify(hymn.time)})`);
  ok(hymn.bars?.join(',') === '0,3,6,9,12,15,18,21', `every bar's start is read (${hymn.bars?.join(',')})`);
  ok((hymn.marks ?? []).map((m) => `${m.kind}:${m.text}@${m.at}`).join(' ') === 'tempo:Andante@0 tempo:quarter = 72@0 dynamic:p@0 hairpin:cresc.@6 dynamic:f@12 tempo:rit.@18 dynamic:pp@21',
     `the markings are read, in order (${(hymn.marks ?? []).map((m) => `${m.kind}:${m.text}@${m.at}`).join(' ')})`);
  const e = M.explain(hymn);
  ok(e.tempo === 'Andante, 72 a minute' && e.key === 'G major' && e.time === '3/4: three quarter-note beats in a bar' && e.bars === 8 && e.seconds === 20,
     `tempo, key, time and length are said (${e.tempo}; ${e.key}; ${e.time}; ${e.bars} bars, ${e.seconds} s)`);
  ok(e.conductor?.meter === 3 && e.conductor?.bpm === 72, 'the Conductor is set to beat three at 72');
  ok(e.journey.map((j) => `${j.where}: ${j.text}`).join(' | ') === 'bar 1: soft (p) | bar 3: getting louder (cresc.) | bar 5: loud (f) | bar 7: slowing down (rit.) | bar 8: very soft (pp)',
     `loud and soft, and the slowing, are told bar by bar (${e.journey.map((j) => `${j.where}: ${j.text}`).join(' | ')})`);
  ok(e.summary === 'Unhurried and bright: Andante, 72 a minute, in G major, for two voices. It begins soft (p), grows to loud (f) at bar 5, and ends very soft (pp). It slows down at bar 7 (rit.).',
     `the character is said from the markings, and only from them (${e.summary})`);
  const [sop, bass] = e.parts;
  ok(sop.range === 'D4 to D5, an octave' && sop.leap?.name === 'an octave' && sop.leap?.where === 'bar 5, beat 2' && sop.leap?.hard,
     `the soprano's range, and its octave leap in bar 5 marked as one to practise (${sop.range}; ${sop.leap?.name} at ${sop.leap?.where})`);
  ok(bass.range === 'G2 to E3, a major sixth' && bass.leap?.name === 'a fifth' && !bass.leap?.hard, `the bass's range and its widest leap, not marked hard (${bass.range}; ${bass.leap?.name})`);
  ok(e.words[0]?.text === 'Praise the Lord, all you Hallelujah! Sing out with one voice, Hallelujah!', `the words are joined back into words (${e.words[0]?.text})`);
  // With no mode written, the key is told by where the bass ends.
  const unmarked = M.readScore(tree(read('tests/fixtures/music/hymn-in-g.musicxml').replace('<mode>major</mode>', '')));
  ok(M.explain(unmarked).key === 'G major', 'with no mode written, the key is still told, from where the bass ends');
  ok(M.keyName({ ...unmarked, key: { fifths: -3 }, lines: [{ id: 'x', name: 'x', notes: [{ start: 0, length: 1, midi: 60 }] }] }) === 'C minor'
     && M.keyName({ ...unmarked, key: { fifths: 2 }, lines: [{ id: 'x', name: 'x', notes: [{ start: 0, length: 1, midi: 61 }] }] }) === 'two sharps',
     'three flats ending on C is C minor; a key that cannot be told is named by its sharps');
  // The four-part test piece has no key, no markings: the explanation says only what is there.
  const plain = M.explain(M.readScore(tree(read('tests/fixtures/music/four-parts.musicxml'))));
  ok(plain.key === null && plain.journey.length === 0 && /No loud or soft markings are written/.test(plain.summary) && plain.conductor?.meter === 4 && plain.conductor?.bpm === 96,
     `a score without markings is not given any (${plain.summary})`);
  ok(M.conductorFor({ ...hymn, time: { beats: 6, beatType: 8 }, tempo: 60 }).bpm === 120 && M.conductorFor({ ...hymn, time: { beats: 2, beatType: 2 }, tempo: 120 }).bpm === 60
     && M.conductorFor({ ...hymn, time: { beats: 12, beatType: 8 }, tempo: 90 }).meter === 4 && M.conductorFor({ ...hymn, time: { beats: 5, beatType: 4 } }) === null,
     '6/8 beats eighths, 2/2 halves, 12/8 four dotted quarters; a time with no pattern is said, not guessed');
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
  ok(/new PitchTracker\(audio\.sampleRate\)/.test(tuner) && /tracker\.push\(buffer, now\)/.test(tuner) && !/LISTEN_EVERY_MS/.test(tuner),
     'the tuner reads every frame through the pitch tracker, not every other frame');
  ok(/data-tuner-zone/.test(code('components/music/TunerPanel.tsx')) && /data-tuner-centre/.test(code('components/music/TunerPanel.tsx')),
     'the scale marks the in-tune zone and its centre line');
  ok(/!reading \|\| held\) return;/.test(code('components/music/TunerPanel.tsx')) && /reading=\{held \? null : reading\}/.test(code('components/music/TunerPanel.tsx')),
     'a note held after the singing stops is never taken as an A, nor drawn on the trail');
  ok(/turn\.current \+= 1/.test(tuner) && /if \(mine !== turn\.current\) \{[\s\S]*?getTracks\(\)\.forEach\(\(t\) => t\.stop\(\)\)/.test(tuner),
     'a microphone allowed after the tuner was left is let go at once, never left listening');
  const panel = code('components/music/TunerPanel.tsx');
  const calibrate = (panel.match(/const calibrate = [\s\S]*?\n  \};/) || [''])[0];
  ok(/tone\.play\(/.test(calibrate), 'every change of concert pitch plays the new A');
  ok(/data-pitch-words[\s\S]{0,40}pitchWords\(a4\)/.test(panel) && /Compare with 440/.test(panel) && /data-tuner-against/.test(panel) && /data-pipe-hz/.test(panel),
     'the card says what the change does, compares it with 440, and the tuner and the starting note show the pitch they follow');
  ok(!/getUserMedia/.test(panel) && /void listen\(\)/.test(panel), "Listen for the A uses the tuner's own microphone, not a second one");
  ok(/if \(openedMic\.current\) \{ openedMic\.current = false; stopListening\(\); \}/.test(panel),
     'and lets it go as soon as the A is heard, when it was the one that opened it');
  ok((panel.match(/disabled=\{matching/g) || []).length >= 4, 'nothing plays while it listens for the A, so it never hears its own speaker');
  ok(/Use \{clampA4\(match\.hz\)\} Hz/.test(panel) && /Keep \{a4\} Hz/.test(panel), "an instrument's A is offered, never set without asking");
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
// 6b. ADVANCED SETTINGS: asked for on 5 October 2026, "more dynamic but also
//     simple in Advance mode ... for users to play and be more creative".
//     Every folder stays as simple as it was; a tick box opens the rest.
// ---------------------------------------------------------------------------
{
  // The Conductor: clicks between beats, accents, the speed trainer, saved tempos.
  let st = { nextAt: 0, nextBeat: 0 };
  const halves = [];
  for (let t = 0; t < 2.05; t += 0.025) { const r = M.due(st, 120, 4, t + 0.12, 2); st = r.state; halves.push(...r.clicks); }
  const gaps = halves.slice(1).map((c, i) => c.at - halves[i].at);
  ok(gaps.every((g) => Math.abs(g - 0.25) < 1e-9), `two clicks to a beat at 120 is a click every quarter second (${halves.length} clicks)`);
  ok(halves.slice(0, 6).map((c) => `${c.beat}.${c.sub}`).join(' ') === '0.0 0.1 1.0 1.1 2.0 2.1', 'they alternate beat, between, beat, between');
  const triplets = M.due({ nextAt: 0, nextBeat: 0 }, 60, 3, 2.9, 3).clicks;
  ok(triplets.map((c) => c.sub).join('') === '012012012', 'three to a beat are triplets');
  const fewer = M.due({ nextAt: 0, nextBeat: 1, nextSub: 3 }, 60, 4, 0.5, 2).clicks;
  ok(fewer[0].beat === 2 && fewer[0].sub === 0, 'fewer clicks chosen part-way through a beat carries on from the next beat');
  ok(M.beatAt([{ at: 0, beat: 0, sub: 0 }, { at: 0.25, beat: 0, sub: 1 }], 120, 0.3).beat === 0
     && Math.abs(M.beatAt([{ at: 0, beat: 0, sub: 0 }, { at: 0.25, beat: 0, sub: 1 }], 120, 0.3).phase - 0.6) < 1e-9,
     'the hand follows the beats, not the clicks between them');
  ok(M.defaultAccents(3).join() === 'loud,normal,normal' && M.nextAccent('loud') === 'normal' && M.nextAccent('normal') === 'silent' && M.nextAccent('silent') === 'loud',
     'the first beat is loud; a tap goes loud, normal, silent and round');
  const trainer = { step: 2, every: 4, target: 90 };
  ok([0, 3, 4, 8, 19, 400].map((b) => M.trainerTempo(80, b, trainer)).join() === '80,80,82,84,88,90',
     'the speed trainer goes up by 2 every 4 bars and stops at its target');
  ok(M.trainerTempo(100, 50, trainer) === 100, 'a target below the start leaves the tempo alone: it only ever speeds up');
  const kept = M.cleanTempos([
    { name: 'Hymn 100', bpm: 88, meter: 3 },
    { name: '  Hymn\u0000 100 ', bpm: 92, meter: 3 },
    { name: 'Too fast', bpm: 900, meter: 4 },
    { name: 'Odd meter', bpm: 80, meter: 5 },
    { name: '', bpm: 80, meter: 4 },
    'nonsense', null,
  ]);
  ok(kept.length === 2 && kept[0].name === 'Hymn 100' && kept[0].bpm === 92 && kept[1].bpm === M.TEMPO_MAX,
     `saved tempos are cleaned when read: one per name, the latest kept, tempos in range, nonsense dropped (${JSON.stringify(kept)})`);
  ok(M.cleanTempos(Array.from({ length: 80 }, (_, i) => ({ name: `T${i}`, bpm: 80, meter: 4 }))).length === M.SAVED_TEMPOS_MAX && M.cleanTempos('x').length === 0,
     'and there are never more than 50');
  ok(M.cleanName('a\u202eb\u200bc') === 'abc' && M.cleanName('x'.repeat(200)).length === 60, 'a name loses hidden characters and is cut to 60');

  // The Tuner: transposing instruments and the trail.
  ok(M.midiName(M.writtenFor(69, 'Bb')) === 'B4' && M.midiName(M.writtenFor(69, 'Eb')) === 'F♯5' && M.midiName(M.writtenFor(69, 'F')) === 'E5' && M.writtenFor(69, 'C') === 69,
     'a concert A reads as B on a clarinet, F sharp on an alto sax, E on a horn');
  ok(Math.abs(M.toSemitones(440) - 69) < 1e-9 && Math.abs(M.toSemitones(466.16) - 70) < 0.01 && M.toSemitones(0) === null, 'the trail draws a frequency as its note number');
  const band = M.trailBand([69, 69.2]);
  ok(band[1] - band[0] === 12 && band[0] <= 69 && band[1] >= 70, `a held note gets an octave of room around it (${band})`);
  ok(M.trailBand([30, 100])[1] - M.trailBand([30, 100])[0] === 36 && M.trailBand([]).join() === '57,69', 'never more than three octaves, and a sensible band with nothing sung');

  // Play: chords in a key, the beat maker.
  ok(M.chordsInKey('C').map((c) => c.name).join(' ') === 'C Dm Em F G Am', 'the chords of C are C, Dm, Em, F, G and Am');
  ok(M.chordsInKey('G').map((c) => c.name).join(' ') === 'G Am Bm C D Em' && M.chordsInKey('F').map((c) => c.name).join(' ') === 'F Gm Am B♭ C Dm',
     'G and F have theirs, flats in a flat key');
  ok(M.chordsInKey('E')[5].name === 'C♯m' && M.SONG_KEYS.every((k) => M.chordsInKey(k.id).every((c) => c.midis.length === 3 && c.midis.every((m) => m >= 53 && m <= 79))),
     'every chord in every key is three notes near middle C');
  ok(M.chordsInKey('C')[0].midis.join() === '60,64,67' && M.chordsInKey('C')[1].midis.join() === '62,65,69', 'a major chord is root, major third, fifth; a minor one root, minor third, fifth');
  ok(M.cleanPatterns(M.STARTER_PATTERNS).length === M.STARTER_PATTERNS.length, 'the starting beats are all well formed');
  const pats = M.cleanPatterns([
    { name: 'Mine', bpm: 500, steps: { kick: Array(16).fill(true), snare: Array(16).fill(1), hat: Array(16).fill(false) } },
    { name: 'Short', bpm: 90, steps: { kick: [true], snare: [], hat: [] } },
    { name: 'No steps', bpm: 90 },
  ]);
  ok(pats.length === 1 && pats[0].bpm === M.BEAT_TEMPO_MAX && pats[0].steps.snare.every((v) => v === false),
     'saved beats are cleaned when read: sixteen steps a drum, true only when true, tempo in range');
  const sixteenths = M.stepsDue({ nextAt: 0, nextStep: 14 }, 120, 0.5).steps;
  ok(sixteenths.map((x) => x.step).join() === '14,15,0,1' && Math.abs(sixteenths[1].at - 0.125) < 1e-9, 'the beat maker steps a quarter of a beat at a time and goes round after sixteen');
  ok(M.octaveC(4) === 60 && M.clampOctave(9) === M.OCTAVE_MAX && M.clampOctave(-3) === M.OCTAVE_MIN, 'the keyboard starts at middle C and moves between C2 and C6');

  // Pieces: transpose and loop.
  ok(SP.clampTranspose(20) === 12 && SP.clampTranspose(-20) === -12 && SP.clampTranspose(NaN) === 0, 'transpose moves at most an octave either way');
  ok(JSON.stringify(SP.cleanLoop({ from: 8, to: 16 }, 32)) === '{"from":8,"to":16}' && JSON.stringify(SP.cleanLoop({ from: 30, to: 99 }, 32)) === '{"from":30,"to":32}'
     && JSON.stringify(SP.cleanLoop({ from: 5, to: 2 }, 32)) === '{"from":5,"to":6}' && SP.cleanLoop(null, 32) === null,
     'a loop stays inside the piece and is at least a beat long');
  ok(SP.loopPosition({ from: 8, to: 12 }, 0) === 8 && SP.loopPosition({ from: 8, to: 12 }, 5) === 9 && SP.loopPosition({ from: 8, to: 12 }, 12) === 8,
     'a loop goes round: four beats in, it is back at its start');

  // The screens: off until ticked, back as they were when unticked, silent when left.
  const adv = code('components/music/Advanced.tsx');
  ok(/useState\(false\)/.test(adv) && /=== '1'/.test(adv), 'Advanced is off until somebody ticks it, and remembered on this phone only');
  for (const [file, folder] of [['components/music/TunerPanel.tsx', 'tuner'], ['components/music/ConductorPanel.tsx', 'conductor'], ['components/music/ScoreView.tsx', 'pieces'], ['components/music/PlayPanel.tsx', 'play']]) {
    ok(new RegExp(`<AdvancedToggle[\\s\\S]{0,40}folder="${folder}"`).test(code(file)), `${folder}: has its own Advanced settings`);
  }
  const conductor = code('components/music/ConductorPanel.tsx');
  ok(/if \(!on\) \{[\s\S]*setSubdivision\(1\)[\s\S]*setAccents\(defaultAccents\(meter\)\)[\s\S]*setCountIn\(false\)[\s\S]*setTrainer\(null\)/.test(conductor),
     'turning the Conductor\'s Advanced off puts the metronome back as it was');
  const score = code('components/music/ScoreView.tsx');
  ok(/if \(!on\) \{[\s\S]*setTranspose\(0\)[\s\S]*setLoop\(null\)[\s\S]*setTimbre\('voice'\)/.test(score), 'and the score\'s, plays it as written again');
  for (const f of ['components/music/TunerAdvanced.tsx', 'components/music/PlayPanel.tsx']) {
    ok(/visibilitychange/.test(code(f)) && /closeAudio\(ctx\.current\)/.test(code(f)), `${f}: silent and closed when the folder is left or the phone locks`);
  }
  ok(/IDLE_MS = 30_000/.test(code('components/music/PlayPanel.tsx')) && /if \(holders\.current\.size === 0\) close\(\)/.test(code('components/music/PlayPanel.tsx')),
     'Play closes its audio after half a minute of quiet, unless the beat is playing');
  ok(/clock\.busy\('keys', true\)/.test(code('components/music/PlayPanel.tsx')) && /if \(held\.current\.size === 0\) clock\.busy\('keys', false\)/.test(code('components/music/PlayPanel.tsx')),
     'and a key held down keeps it open, until the last finger is lifted');
  ok(/cleanTempos\(JSON\.parse/.test(code('components/music/ConductorAdvanced.tsx')) && /cleanPatterns\(JSON\.parse/.test(code('components/music/PlayPanel.tsx')),
     'saved tempos and beats are cleaned every time they are read back from the phone');
  const metronome = code('lib/music/metronome.ts');
  ok(/accent === 'silent'/.test(metronome) && /inCount = !counting \|\| downbeats\.current <= 1/.test(metronome) && /trainerTempo\(startBpm\.current, played, training\)/.test(metronome),
     'the metronome sounds silent beats as silence, counts in one bar, and follows the trainer bar by bar');
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
  ok(['listen', 'tuner', 'conductor', 'pieces', 'play'].every((r) => new RegExp(`room === '${r}' && <`).test(room)),
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
  ok(['TunerPanel', 'ConductorPanel', 'PiecesPanel', 'PlayPanel'].every((p) => new RegExp(`import\\('@/components/music/${p}'\\)`).test(room)
     && !new RegExp(`^import \\{ ${p} \\}`, 'm').test(room)) && /requestIdleCallback/.test(room),
     'only Listen loads with the page; the other folders load when the phone is idle');
  ok(/'\/music'/.test(read('app/sw.js/route.ts')), 'the Music room is kept for opening with no signal');

  const conductor = code('components/music/ConductorPanel.tsx');
  ok(/wakeLock/.test(conductor) && /release\(\)/.test(conductor), 'the conductor keeps the screen on only while the baton moves');
}

/** A one-page PDF of plain words in Helvetica: no music font, as a bulletin or a scan's text layer. */
function wordsOnlyPdf(words) {
  const stream = `BT /F1 24 Tf 72 700 Td (${words}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = objects.map((o, i) => { const at = body.length; body += `${i + 1} 0 obj\n${o}\nendobj\n`; return at; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

// ---------------------------------------------------------------------------
// 10. MUSIC PDFs: chosen on 6 October 2026, "Read music PDFs on phone". The
//     two fixture PDFs are our own CC0 test scores, engraved by MuseScore 3.2
//     (its fonts are embedded under their font exceptions: MScore GPL-2 with
//     font exception, MScoreText and Bravura OFL-1.1, FreeSerif GPL-3 with
//     font exception). Read back, each must give exactly what its MusicXML
//     gives. Measured more widely while it was built: 220 Bach chorales from
//     the music21 corpus, kept out of this repository because of their terms.
// ---------------------------------------------------------------------------
{
  const PDF = await bundle(['lib/music/pdf-ink', 'lib/music/pdf-score'], 'pdf');
  const pdfjs = await import(pathToFileURL(path.join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs')).href);
  const fromPdf = async (file) => PDF.readPdfScore(await PDF.readPdfInk(pdfjs, new Uint8Array(fs.readFileSync(path.join(root, file)))));
  const fromXml = (file) => M.readScore(tree(read(file)));
  const notes = (line) => line.notes.map((n) => `${n.start}:${n.midi}/${n.length}${n.lyric ? `"${n.lyric}${n.joins ? '-' : ''}"` : ''}`).join(' ');

  for (const name of ['hymn-in-g', 'four-parts']) {
    const truth = fromXml(`tests/fixtures/music/${name}.musicxml`);
    const { score, report } = await fromPdf(`tests/fixtures/music/${name}.pdf`);
    ok(score.lines.length === truth.lines.length && truth.lines.every((l, i) => notes(score.lines[i]) === notes(l)),
       `${name}.pdf: every note of every part reads as the MusicXML has it: pitch, start, length and words (${truth.lines.reduce((n, l) => n + l.notes.length, 0)} notes)`);
    ok(score.lines.every((l, i) => l.name === truth.lines[i].name), `${name}.pdf: the parts keep their names (${score.lines.map((l) => l.name).join(', ')})`);
    ok(score.title === truth.title, `${name}.pdf: the title is read from the page ("${score.title}")`);
    ok(score.key?.fifths === (truth.key?.fifths ?? 0) && score.time?.beats === truth.time?.beats && score.time?.beatType === truth.time?.beatType && score.tempo === truth.tempo,
       `${name}.pdf: key, time and tempo read as written (${score.key?.fifths} fifths, ${score.time?.beats}/${score.time?.beatType}, ${score.tempo} a minute)`);
    ok(JSON.stringify(score.bars) === JSON.stringify(truth.bars) && score.length === truth.length && report.unevenBars === 0,
       `${name}.pdf: the bars fall where they do in the score, and every bar adds up`);
    // four-parts.musicxml declares no key; its page shows an empty key
    // signature, which is C, so that is what the two are compared with.
    const same = M.explain({ ...truth, key: truth.key ?? { fifths: 0 } }).summary;
    ok(M.explain(score).summary === same, `${name}.pdf: About this piece says the same as for the MusicXML (${M.explain(score).summary})`);
  }
  const hymn = (await fromPdf('tests/fixtures/music/hymn-in-g.pdf')).score;
  const truthMarks = fromXml('tests/fixtures/music/hymn-in-g.musicxml').marks ?? [];
  const markText = (marks) => marks.filter((m) => m.kind !== 'tempo').map((m) => `${m.at}:${m.kind}:${m.text}`).sort().join(' ');
  ok(markText(hymn.marks ?? []) === markText(truthMarks), `the hymn's loud and soft read where they are written (${markText(hymn.marks ?? [])})`);

  // Refusals, in sentences a person can act on.
  const refused = async (work) => { try { await work(); return ''; } catch (e) { return e instanceof Error ? e.message : String(e); } };
  ok(/could not be opened as a PDF/.test(await refused(() => PDF.readPdfInk(pdfjs, new TextEncoder().encode('<score-partwise/>')))),
     'a file that is not a PDF is refused as one');
  ok(/no music characters.*scan or a photo/.test(await refused(async () => PDF.readPdfScore(await PDF.readPdfInk(pdfjs, wordsOnlyPdf('Order of service'))))),
     'a PDF with words and no music (a scan, a photo, a bulletin) is told so');

  // Limits: a hostile file can make the room say no, never hang it.
  const fake = (numPages, ops) => ({
    OPS: pdfjs.OPS,
    getDocument: () => ({
      promise: Promise.resolve({
        numPages,
        getPage: async () => ({
          getViewport: () => ({ width: 600, height: 800 }),
          getTextContent: async () => ({ items: [] }),
          getOperatorList: async () => ops,
        }),
      }),
      destroy: async () => {},
    }),
  });
  ok(/more than 60 pages/.test(await refused(() => PDF.readPdfInk(fake(61, { fnArray: [], argsArray: [] }), new Uint8Array(8)))), 'a PDF of more than 60 pages is refused');
  const line = new Float32Array([0, 0, 0, 1, 10, 10]);
  const many = { fnArray: Array(PDF.PDF_LIMITS.perPage + 1).fill(pdfjs.OPS.constructPath), argsArray: Array(PDF.PDF_LIMITS.perPage + 1).fill([pdfjs.OPS.stroke, [line], null]) };
  ok(/more than the room can read/.test(await refused(() => PDF.readPdfInk(fake(1, many), new Uint8Array(8)))), `a page of more than ${PDF.PDF_LIMITS.perPage} marks is refused`);
  ok(/larger than/.test(await refused(() => PDF.readPdfInk(fake(1, { fnArray: [], argsArray: [] }), new Uint8Array(PDF.PDF_LIMITS.bytes + 1)))), 'a PDF larger than the room keeps is refused');

  // The promises that keep it safe and light.
  const ink = code('lib/music/pdf-ink.ts');
  ok(/useWasm: false/.test(ink) && /disableFontFace: true/.test(ink), 'pdf.js runs with no WebAssembly and puts no fonts into the page');
  // pdf.js 6 builds no code from strings; the security policy would refuse it,
  // inside its worker too, where a browser walk cannot see the refusal. Its
  // own files are read instead: the one Function() left is core-js's way of
  // finding the global object on a browser too old to have globalThis.
  const generated = ['pdf.mjs', 'pdf.worker.min.mjs'].flatMap((f) => [...read(`node_modules/pdfjs-dist/legacy/build/${f}`)
    .matchAll(/(?<![\w$.])(?:new\s+)?(?:Function|eval)\s*\([^)]{0,40}\)?/g)].map((m) => m[0]))
    .filter((m) => !/^Function\((['"])return this\1\)$/.test(m));
  ok(generated.length === 0, `pdf.js builds no code from strings${generated.length ? ` (found ${generated.join(', ')})` : ''}`);
  const scoreFile = code('lib/music/score-file.ts');
  const staticImports = ['app', 'components', 'lib'].flatMap((d) => fs.readdirSync(path.join(root, d), { recursive: true })
    .filter((f) => /\.(tsx?|mjs)$/.test(f)).map((f) => path.join(d, f)))
    .filter((f) => /^import [^;]*['"](pdfjs-dist[^'"]*|@\/lib\/music\/pdf-(read|ink|score))['"]/m.test(code(f)) && !/lib[\\/]music[\\/]pdf-/.test(f));
  ok(/await import\('@\/lib\/music\/pdf-read'\)/.test(scoreFile) && staticImports.length === 0,
     `pdf.js and the reader load only when somebody opens a PDF${staticImports.length ? ` (imported up front by ${staticImports.join(', ')})` : ''}`);
  ok(/new URL\('pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs', import\.meta\.url\)/.test(code('lib/music/pdf-read.ts')),
     "pdf.js's worker is a file of this site, which the security policy allows");
  ok(/"pdfjs-dist": "\d+\.\d+\.\d+"/.test(read('package.json')), 'pdf.js is pinned to one exact version');
  ok(/bytes\.slice\(\)/.test(scoreFile) && /new Blob\(\[file\]/.test(scoreFile),
     'the PDF kept on the phone is the file itself, not the bytes pdf.js takes over');
  ok(/piece\.kind === 'score' && piece\.mime === PDF_MIME\) \{[\s\S]{0,200}?scoreFromPdfBytes\(new Uint8Array\(await blob\.arrayBuffer\(\)\)/.test(code('components/music/PiecesPanel.tsx')),
     'a PDF kept on the phone is read again, and checked again, every time it is opened');
}

console.log(bad === 0 ? '\nRESULT: ALL OK' : `\nRESULT: ${bad} FAILURE(S)`);
process.exit(bad === 0 ? 0 : 1);
