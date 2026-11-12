// The ambient sounds are pleasant, and the harsh ones are labelled as such.
//
// WHAT WAS REPORTED. "Some users didn't like the white noise because some of it
// are not pleasing." Three separate things were true, and a flat list of three
// buttons hid all of them:
//
//   * Every option was noise, and one was raw white noise -- flat all the way
//     up, the harshest sound a speaker can make. It sat in the same
//     undifferentiated list as the gentle ones.
//   * Nothing moved. A two-second buffer looped forever at one level is a wall,
//     and a wall is tiring within minutes however well its colour was chosen.
//   * Every entry had a one-line description of what it sounded like, written
//     the day the file was, and NO SCREEN HAD EVER DRAWN ONE. The information
//     that would have let somebody avoid the harsh one was in the source.
//
//   node tests/the-ambience-is-pleasant.mjs
//
// Runs the generators for real with a stand-in AudioContext, then reads the
// graph and the two screens. Needs no browser and no speakers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VOICES, KINDS, voiceFor, noiseBuffer } from '../lib/noise.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let bad = 0;
const ok = (c, m) => {
  if (!c) bad++;
  console.log(`${c ? 'OK ' : 'BAD'} ${m}`);
};

// ---------------------------------------------------------------------------
// 1. Nothing clips
// ---------------------------------------------------------------------------
//
// The most avoidable kind of harshness, and the easiest to introduce: a sample
// past ±1 is not made quieter by the volume slider, it is squared off by the
// hardware and heard as a crackle. The brown generator carries a hand-tuned
// `* 3.5` and the pink one a `* 0.11`, and both are exactly the sort of
// constant somebody adjusts by ear on one laptop and ships.
//
// Run with a stand-in context, because a real AudioContext needs a browser and
// the arithmetic under test does not.
{
  const ctx = {
    sampleRate: 8000,   // enough samples to be representative, fast to fill
    createBuffer(_channels, length) {
      const data = new Float32Array(length);
      return { getChannelData: () => data };
    },
  };

  const levels = {};
  for (const colour of ['white', 'pink', 'brown']) {
    const data = noiseBuffer(ctx, colour).getChannelData(0);
    let peak = 0;
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      const v = Math.abs(data[i]);
      if (v > peak) peak = v;
      sum += data[i] * data[i];
    }
    const rms = Math.sqrt(sum / data.length);
    levels[colour] = rms;
    ok(peak <= 1, `${colour} never clips (peak ${peak.toFixed(3)})`);
    // A generator that returns near-silence is a bug that presents as "the
    // button does nothing", which nobody reports as a sound problem.
    ok(rms > 0.01, `${colour} is actually audible (rms ${rms.toFixed(3)})`);
  }

  // A RARE LONG WANDER STILL FITS. Random input reaches a peak past 1 about
  // once in 120 starts at 48 kHz, so chance cannot be the test: a burst in
  // near-silence, the worst shape for a level set by average loudness.
  {
    const random = Math.random;
    let n = 0;
    Math.random = () => { n += 1; return n % 4000 < 60 ? 1 : 0.5; };
    try {
      const data = noiseBuffer(ctx, 'brown').getChannelData(0);
      const peak = data.reduce((most, v) => Math.max(most, Math.abs(v)), 0);
      ok(peak <= 1, `a burst in near-silence still does not clip (peak ${peak.toFixed(3)})`);
    } finally {
      Math.random = random;
    }
  }

  // -------------------------------------------------------------------------
  // AND THEY ARRIVE AT THE SAME LOUDNESS
  // -------------------------------------------------------------------------
  //
  // THE MEASUREMENT THAT EXPLAINED THE COMPLAINT. Before this, the three
  // generators came out at 0.58, 0.20 and 0.20: the white one was nearly three
  // times as loud as the others from the same slider position. Tapping it
  // after listening to rain was not a change of character, it was a jump in
  // volume -- and a jump in volume is most of what "not pleasing" feels like
  // from the other side of a phone speaker.
  //
  // Nobody would ever report that as a level bug. They would report that the
  // sound is horrible, which is exactly what was reported.
  {
    const all = Object.values(levels);
    const spread = Math.max(...all) / Math.min(...all);
    ok(spread < 1.15,
       `every colour arrives at the same loudness (widest gap ${spread.toFixed(2)}×, `
       + `was 2.84× and heard as harshness)`);
  }
}

// ---------------------------------------------------------------------------
// 2. The white noise is its own category
// ---------------------------------------------------------------------------
//
// The literal ask. Calm and masking are different errands: one is chosen to sit
// with for an hour, the other to cover the people talking next door, and it is
// brighter and harder ON PURPOSE. In one list the second kept being picked by
// people who wanted the first.
{
  const kinds = new Set(VOICES.map((v) => v.kind));
  ok(kinds.has('calm') && kinds.has('masking'),
     'there are both calm sounds and masking ones');
  ok(KINDS.some((k) => k.kind === 'masking' && /white noise/i.test(k.heading)),
     'and the masking group is headed "White noise", in those words');

  // A heading with nothing under it, or a sound under no heading, is how a
  // grouped list quietly loses an entry.
  for (const v of VOICES) {
    ok(KINDS.some((k) => k.kind === v.kind), `“${v.label}” belongs to a group that exists`);
  }
  for (const k of KINDS) {
    ok(VOICES.some((v) => v.kind === k.kind), `the “${k.heading}” group has something in it`);
  }

  // The note under the heading is what makes the category a warning rather
  // than a filing decision.
  const masking = KINDS.find((k) => k.kind === 'masking');
  ok(masking && masking.note.trim().length > 0,
     'and the group says what it is for, so nobody has to guess from the name');
}

// ---------------------------------------------------------------------------
// 3. Nobody meets the harshest sound by accident
// ---------------------------------------------------------------------------
//
// The play button on the bar starts the first sound in the list without asking.
// If that is the flat one, the app's default answer to "play something" is its
// worst sound.
ok(VOICES[0].kind !== 'masking', 'the first sound in the list is never a masking one');
ok(VOICES[0].cutoff || VOICES[0].sway || VOICES[0].engine,
   'and it is shaped or played rather than raw, so the default is the gentlest thing here');
{
  // The groups must not interleave, or a heading would appear twice.
  const order = VOICES.map((v) => v.kind);
  const seen = [];
  for (const k of order) if (seen[seen.length - 1] !== k) seen.push(k);
  ok(seen.length === new Set(seen).size,
     `each kind appears in one run rather than scattered (${seen.join(' \u2192 ')})`);
  ok(order.lastIndexOf('calm') < order.indexOf('masking'),
     'and the masking ones come last, furthest from where a thumb starts');
}

// ---------------------------------------------------------------------------
// 3b. NOTES, NOT ONLY NOISE
// ---------------------------------------------------------------------------
//
// "These are all White noises, and most of it sounds static with flavor that I
// would feel like I am really outside or in nature. Can you add some very soft
// music and some chimes?"
//
// A fair verdict, and one that filtering cannot answer: shaping a hiss makes a
// nicer hiss. These voices do not loop a buffer at all -- they schedule struck
// notes or hold a drifting chord -- so there is nothing to repeat and nothing
// for the ear to lock onto.
{
  const gentle = VOICES.filter((v) => v.kind === 'gentle');
  ok(gentle.length >= 2, `there are sounds made of notes rather than noise (${gentle.length})`);
  ok(gentle.some((v) => v.engine === 'chime'), 'at least one is chimes');
  ok(gentle.some((v) => v.engine === 'pad'), 'and at least one is soft music');
  ok(KINDS.some((k) => k.kind === 'gentle' && /music|chime/i.test(k.heading)),
     'and they have a heading of their own, apart from the white noise');

  for (const v of gentle) {
    ok(Array.isArray(v.notes) && v.notes.length >= 4,
       `\u201c${v.label}\u201d has notes to play (${v.notes?.length ?? 0})`);
    // EVERY INTERVAL MUST BE CONSONANT. A pentatonic set has no semitone steps,
    // which is what lets a chime pick at random and never sound sour. A minor
    // second is roughly a 1.059 ratio; nothing here may come that close.
    const hz = [...(v.notes ?? [])].sort((a, b) => a - b);
    let tightest = Infinity;
    for (let i = 1; i < hz.length; i += 1) {
      // Fold into one octave so notes an octave apart are not counted as close.
      let lo = hz[i - 1]; let high = hz[i];
      while (high / lo >= 2) high /= 2;
      if (high < lo) { const t = lo; lo = high; high = t; }
      tightest = Math.min(tightest, high / lo);
    }
    ok(tightest > 1.09,
       `and no two of them are a semitone apart (closest ratio ${tightest.toFixed(3)})`);
  }
}

// ---------------------------------------------------------------------------
// 4. Every sound says what it sounds like, and a screen draws it
// ---------------------------------------------------------------------------
//
// The blurbs existed and were dead text for the life of the feature. A test
// that only checked they existed would have passed the whole time.
for (const v of VOICES) {
  ok(typeof v.blurb === 'string' && v.blurb.trim().length > 0,
     `“${v.label}” says what it sounds like`);
  ok(typeof v.icon === 'string' && v.icon.length > 0, `and has an icon`);
}
// The harsh one is honest about being harsh. This is the sentence that answers
// the complaint: somebody who reads it and taps anyway has chosen it.
{
  const white = voiceFor('white');
  ok(!!white, 'the flat one is still available for whoever wants it');
  ok(white && /harsh/i.test(white.blurb),
     'and its own description warns that it is the harsh one');
}
{
  const ui = read('components/PlayerBar.tsx');
  ok((ui.match(/track\.blurb/g) || []).length >= 2,
     'both places the player is drawn show the description');
  ok((ui.match(/AMBIENCE_GROUPS\.map/g) || []).length >= 2,
     'and both draw the sounds in their groups rather than as one list');
  ok((ui.match(/group\.heading/g) || []).length >= 2, 'with the heading visible in each');
}

// ---------------------------------------------------------------------------
// 5. The sounds breathe, and the swell is not inside the loop
// ---------------------------------------------------------------------------
//
// THE TRAP THIS PINS. The obvious way to make a sound swell is to multiply the
// buffer by a slow sine while filling it. That buffer is two seconds long and
// loops, so the swell would repeat every two seconds and be heard as a pulse
// -- which is the exact artefact the buffer is two seconds long to avoid. It
// belongs in the audio graph, on its own oscillator, where it never lines up
// with the loop.
{
  const src = read('lib/noise.ts');
  const fn = src.slice(src.indexOf('export function noiseBuffer'));
  ok(!/Math\.sin|Math\.cos/.test(fn),
     'no swell is baked into the looping buffer, where it would become a pulse');

  const player = read('lib/player.tsx');
  ok(/createOscillator\(\)/.test(player), 'the swell runs on its own oscillator');
  ok(/createBiquadFilter\(\)/.test(player), 'and the hiss is taken off with a low-pass');
  ok(/lowpass/.test(player), 'a low-pass specifically, not some other shape');

  // A biquad at the default Q lifts the response right at the corner: a faint
  // whistle exactly where the sound is meant to go quiet. Below 0.707 there is
  // no peak at all.
  const q = player.match(/filter\.Q\.value = ([\d.]+)/);
  ok(!!q && Number(q[1]) < 0.708,
     'with a gentle knee, so the filter does not whistle at its own corner');

  // AN OSCILLATOR IS A SECOND SOURCE and does not stop when the noise does.
  // Left running it holds the AudioContext awake and one more accumulates
  // every time somebody changes sound.
  const stop = player.slice(player.indexOf('const stopNoise'), player.indexOf('const startNoise'));
  ok(/lfo\?\.stop\(\)/.test(stop), 'and it is stopped when the sound stops');
  ok(/disconnect\(\)/.test(stop), 'and every node it built is disconnected');

  // The swell rides on top of the chosen level. Centring it instead would make
  // the peak louder than the volume slider says.
  ok(/swell\.gain\.value = 1 - voice\.sway\.depth/.test(player),
     'the swell only ever makes the sound quieter than the slider, never louder');
}
for (const v of VOICES.filter((x) => x.kind === 'calm')) {
  ok(!!v.sway, `“${v.label}” rises and falls rather than sitting flat`);
  ok(!!v.cutoff, `and has the hiss taken off it`);
  ok(v.sway.hz > 0 && v.sway.hz < 0.5,
     `and swells slowly (${v.sway.hz}Hz), not fast enough to read as a wobble`);
  ok(v.sway.depth > 0 && v.sway.depth < 0.8,
     `and does not drop away to nothing at the bottom of the swell`);
}

// ---------------------------------------------------------------------------
// 5b. The filter's loss is given back
// ---------------------------------------------------------------------------
//
// A low-pass removes real energy and a heavy one removes most of it. Cutting
// white noise at 2.6kHz throws away the majority of its power, because a flat
// spectrum carries most of its energy in the top octaves -- so without a lift
// afterwards, choosing the gentler option would read as "the volume broke",
// and the person would go back to the harsh one.
{
  const player = read('lib/player.tsx');
  // NOT just `/voice.trim/`. That matched the comment and the assignment while
  // the whole branch sat behind `if (false)`, and the check reported green on
  // a lift that never ran. Assert the node is built, decided by the voice, and
  // wired in -- three facts a disabled branch cannot satisfy.
  ok(/if \(voice\.trim && voice\.trim !== 1\)/.test(player),
     'the graph gives back what the filter took, when the voice asks for it');
  ok(/lift\.gain\.value = voice\.trim;/.test(player), 'by the amount the voice names');
  ok(/tail\.connect\(lift\)/.test(player), 'and it is actually in the chain');
  ok(/made\.push\(lift\)/.test(player), 'and torn down with everything else');
  // The lift belongs AFTER the filter. Before it, it would just push more
  // signal into the thing about to remove it.
  const start = player.slice(player.indexOf('const startNoise'));
  ok(start.indexOf('createBiquadFilter') < start.indexOf('voice.trim'),
     'and does it after the filter, not before');

  for (const v of VOICES) {
    if (!v.trim) continue;
    ok(v.cutoff, `“${v.label}” only lifts because something was filtered away`);
    // A lift big enough to be a fright is worse than one that is too small: a
    // quiet sound is a slider away from fixed.
    ok(v.trim > 1 && v.trim <= 3, `and lifts by ${v.trim}×, which is a correction and not a boost`);
  }
  // Nothing unfiltered is lifted -- that would just be one sound louder than
  // the rest, which is the bug this whole section exists to have fixed.
  for (const v of VOICES) {
    ok(!(v.trim && !v.cutoff), `“${v.label}” is not simply turned up above the others`);
  }
}

// ---------------------------------------------------------------------------
// 5c. THE PLAYED VOICES ARE BUILT AND TORN DOWN PROPERLY
// ---------------------------------------------------------------------------
//
// A chime is a chain of timeouts and a pad is a set of oscillators that run
// forever. Both keep going after the sound is meant to have stopped unless
// something cancels them, and the failure is invisible: the audio graph is
// disconnected, so you hear nothing while the timers keep firing and a new set
// accumulates every time somebody changes sound.
{
  const player = read('lib/player.tsx');

  ok(/engine === 'chime'/.test(player), 'the player knows how to strike a chime');
  ok(/engine === 'pad'/.test(player), 'and how to hold a chord');

  // A FIXED INTERVAL WOULD BE A METRONOME, which is the one thing a wind chime
  // never is. Each wait has to be its own length.
  ok(/setTimeout\(/.test(player) && /0\.45 \+ Math\.random\(\)/.test(player),
     'and the gap between strikes is randomised rather than fixed');
  ok(!/setInterval\(/.test(player), 'so nothing beats in time');

  // NOT `indexOf('const strike')`. `striker` is declared above stopNoise and
  // starts with the same eleven characters, so that finds the REF and slices
  // backwards to an empty string -- three assertions passing on nothing. The
  // same prefix trap as addLesson/addLessonSeries earlier today; include
  // enough of the declaration to be unambiguous.
  const stop = player.slice(
    player.indexOf('const stopNoise'),
    player.indexOf('const strike = useCallback'),
  );
  ok(stop.length > 100, `the teardown block was actually found (${stop.length} chars)`);
  ok(/clearTimeout\(striker\.current\)/.test(stop), 'the striker is cancelled when the sound stops');
  ok(/for \(const osc of held\.current\)/.test(stop), 'and every held oscillator is stopped');
  ok(/held\.current = \[\]/.test(stop), 'and the list is emptied, so they cannot be stopped twice');

  // exponentialRampToValueAtTime is undefined at zero. Ramping to 0 throws and
  // the note never sounds.
  ok(!/exponentialRampToValueAtTime\(0,/.test(player),
     'no envelope ramps to exactly zero, which is undefined and throws');
  ok(/0\.0001/.test(player), 'they aim just above silence instead');

  // A struck bell needs an inharmonic partial or it is a test tone.
  ok(/2\.76/.test(player), 'a chime has an inharmonic partial, so it reads as metal not as a flute');
}

// ---------------------------------------------------------------------------
// 6. A key is a promise to every saved playlist
// ---------------------------------------------------------------------------
//
// A playlist stores `ambience-<key>`. Rename one and the entry stays in
// somebody's list and never plays again -- no error, no missing row, just a
// button that does nothing. These three shipped and are in people's playlists
// now; they are not renameable.
for (const key of ['pink', 'brown', 'white']) {
  ok(!!voiceFor(key), `the key "${key}" still exists, so playlists holding it still play`);
}
ok(new Set(VOICES.map((v) => v.key)).size === VOICES.length, 'and no two sounds share a key');
{
  // An unknown key has to play SOMETHING. A playlist saved against a key that
  // later went away should not be a button that silently does nothing.
  const player = read('lib/player.tsx');
  ok(/voiceFor\(key\) \?\? VOICES\[0\]/.test(player),
     'and an unknown key falls back to a real sound rather than silence');
}

// ---------------------------------------------------------------------------
// IT ACTUALLY REACHES A SPEAKER
// ---------------------------------------------------------------------------
//
// REPORTED: "Ambience music are not playing, can you fix that? There's no
// audio at all." Two separate faults, and the graph was innocent of both --
// rendering every voice through an OfflineAudioContext showed real signal
// coming out of all eight. What was wrong was the level it came out at, and
// which output it was asked to leave by.
{
  const player = read('lib/player.tsx');

  // ONE. THE NEW VOICES WERE INAUDIBLE, MEASURABLY SO. Rendered offline, the
  // noise voices sat at 0.09-0.12 RMS and the chimes at 0.018 -- about six
  // times quieter -- with several seconds of deliberate silence between
  // strikes. "Very soft music" was the ask and this overshot it into nothing.
  // These numbers are pinned because they were arrived at by measuring, and a
  // later nudge "just to soften it" would put it straight back.
  ok(/const level = 0\.34;/.test(player), 'a struck chime is loud enough to hear on a phone speaker');
  ok(/const depth = 0\.10;/.test(player), 'and the held chord is too');
  ok(!/const level = 0\.16;/.test(player), 'not the level that was reported as silence');
  ok(!/const depth = 0\.055;/.test(player), 'nor the chord depth that went with it');

  // A phone speaker moves almost no air below about 500Hz, so a low chord
  // behind a 900Hz lid has nearly nothing left to reproduce.
  ok(/soft\.frequency\.value = 1400;/.test(player), 'the chord is not filtered down into inaudibility');

  // AND THE GAPS. A chime that can be silent for nearly five seconds, or bells
  // for nearly ten, is indistinguishable from one that is broken.
  ok(/'chapel-bells' \? 4200 : 1900/.test(player),
     'and the silence between strikes is short enough not to read as broken');

  // TWO. THE OUTPUT. On iOS the hardware ring/silent switch mutes the Web Audio
  // API and does NOT mute a media element -- so with the switch on silent, the
  // generated ambience was dead while ordinary media still played. Nothing in
  // the graph can fix that; only the choice of output can.
  ok(/createMediaStreamDestination/.test(player),
     'the generated sound leaves through a media stream, which iOS does not mute with the ring switch');
  ok(/el\.srcObject = out\.stream/.test(player), 'attached to the player’s own element');

  // THE FALLBACK IS THE PART THAT MATTERS. A device that works today must not
  // be made worse by this, which is the only basis on which an audio path is
  // worth changing days before a demo nobody can re-run.
  ok(/master\.connect\(c\.destination\)/.test(player),
     'and it still falls straight back to the speakers if that route is missing');
  ok(/onRefused/.test(player), 'including when the element refuses to start');

  // THE ELEMENT DOES NOT STAY PUT, which is what made the first attempt at
  // this wrong: it is paused when ambience starts, and detached when a real
  // track is chosen. Wiring it once was not enough.
  ok(/el\.srcObject !== sink\.current\.stream/.test(player),
     'the stream is re-attached when it has been taken away, rather than assumed');
  ok(!/sink\.current = null;/.test(player),
     'and the sink is never thrown away while the graph is still wired to it');
}

console.log(bad ? `\n${bad} problem(s).` : '\nRESULT: ALL OK');
process.exit(bad ? 1 : 0);
