// What a score says about itself, in words a choir can use: how fast and in
// what time, which key, where it is loud and where soft, how high and low each
// part goes and where its hardest leap is, the words it sings, and one or two
// sentences on the piece's character.
//
// Asked for on 6 October 2026: "the choir singers and conductors understand
// how the piece works already". Everything here is read from the score's own
// markings, on the phone. The character sentence is put together from those
// markings (tempo, key, loud and soft), not from listening to the music or
// from any service: it says what the composer wrote, in plain words, and no
// more than that.
//
// Pure: a Score in, an Explanation out. tests/the-music-room.mjs holds it.

import { tempoName, type Meter } from '@/lib/music/beat';
import { midiName } from '@/lib/music/notes';
import type { Score, ScoreLine, ScoreMark } from '@/lib/music/musicxml';

export interface Leap {
  semitones: number;
  /** "a sixth", "an octave". */
  name: string;
  from: string;
  to: string;
  /** "bar 7, beat 3". */
  where: string;
  /** Wide enough, or awkward enough (a tritone), to practise on its own. */
  hard: boolean;
}

export interface PartSummary {
  id: string;
  name: string;
  low: string;
  high: string;
  /** "E3 to A4, an octave and a fourth". */
  range: string;
  leap: Leap | null;
}

export interface Explanation {
  /** One or two sentences: the piece's character, from its markings. */
  summary: string;
  /** "Andante, 96 a minute". */
  tempo: string;
  /** What the Conductor needs to beat it, or null for a time it has no pattern for. */
  conductor: { meter: Meter; bpm: number; how: string } | null;
  /** "4/4: four beats in a bar". */
  time: string | null;
  /** "G major", or "one sharp" when the mode cannot be told. */
  key: string | null;
  bars: number | null;
  seconds: number;
  /** Loud and soft, and changes of speed, in order: "bar 9: loud (f)". */
  journey: { where: string; text: string }[];
  parts: PartSummary[];
  /** Each line's words, joined into words. */
  words: { id: string; name: string; text: string }[];
}

// ---- KEYS -------------------------------------------------------------------

const MAJOR = ['C♭', 'G♭', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯'];
const MINOR = ['A♭', 'E♭', 'B♭', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯'];
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const pcOf = (name: string) => (PC[name[0]] + (name.includes('♯') ? 1 : name.includes('♭') ? -1 : 0) + 12) % 12;
const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'];

/**
 * The key, by name. The mode comes from the file when it says; otherwise from
 * where the lowest part ends, which is the key's home note in nearly every
 * hymn and anthem; otherwise only the sharps or flats are named.
 */
export function keyName(score: Score): string | null {
  if (!score.key) return null;
  const { fifths } = score.key;
  const i = fifths + 7;
  if (i < 0 || i >= MAJOR.length) return null;
  let mode = score.key.mode;
  if (!mode) {
    const lowest = [...score.lines].sort((a, b) => average(a) - average(b))[0];
    const last = lowest?.notes[lowest.notes.length - 1];
    if (last) {
      const pc = ((last.midi % 12) + 12) % 12;
      if (pc === pcOf(MAJOR[i])) mode = 'major';
      else if (pc === pcOf(MINOR[i])) mode = 'minor';
    }
  }
  if (mode === 'major') return `${MAJOR[i]} major`;
  if (mode === 'minor') return `${MINOR[i]} minor`;
  if (fifths === 0) return 'no sharps or flats';
  return `${COUNT[Math.abs(fifths)]} ${fifths > 0 ? 'sharp' : 'flat'}${Math.abs(fifths) > 1 ? 's' : ''}`;
}

const average = (line: ScoreLine) => line.notes.reduce((t, n) => t + n.midi, 0) / Math.max(1, line.notes.length);

// ---- TIME AND THE CONDUCTOR -------------------------------------------------

const BEATS_WORD = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

export function timeName(score: Score): string | null {
  if (!score.time) return null;
  const { beats, beatType } = score.time;
  const unit: Record<number, string> = { 2: 'half-note', 4: 'quarter-note', 8: 'eighth-note' };
  return `${beats}/${beatType}: ${BEATS_WORD[beats] ?? beats} ${unit[beatType] ?? ''} beat${beats === 1 ? '' : 's'} in a bar`.replace('  ', ' ');
}

const clampBpm = (bpm: number) => Math.max(30, Math.min(240, Math.round(bpm)));

/**
 * How the Conductor beats this time, and how fast: its own patterns are 2, 3,
 * 4 and 6. The score's tempo is in quarter notes; a half-note or eighth-note
 * beat, or a compound time beaten in dotted quarters, is converted.
 */
export function conductorFor(score: Score): Explanation['conductor'] {
  const t = score.time ?? { beats: 4, beatType: 4 };
  const q = score.tempo;
  const of = (meter: Meter, bpm: number, how: string) => ({ meter, bpm: clampBpm(bpm), how });
  if (t.beatType === 4 && [2, 3, 4, 6].includes(t.beats)) return of(t.beats as Meter, q, `${t.beats} quarter-note beats`);
  if (t.beatType === 2 && [2, 3, 4].includes(t.beats)) return of(t.beats as Meter, q / 2, `${t.beats} half-note beats`);
  if (t.beatType === 8 && (t.beats === 6 || t.beats === 3)) return of(t.beats as Meter, q * 2, `${t.beats} eighth-note beats`);
  if (t.beatType === 8 && t.beats === 9) return of(3, (q * 2) / 3, 'three dotted-quarter beats');
  if (t.beatType === 8 && t.beats === 12) return of(4, (q * 2) / 3, 'four dotted-quarter beats');
  return null;
}

// ---- WHERE ------------------------------------------------------------------

/** "bar 7, beat 3" for a place in quarter notes. */
export function whereIs(score: Score, at: number): string {
  const beatLen = score.time ? 4 / score.time.beatType : 1;
  const barLen = score.time ? score.time.beats * beatLen : 4;
  const bars = score.bars?.length ? score.bars : null;
  let bar: number;
  let from: number;
  if (bars) {
    let i = 0;
    while (i + 1 < bars.length && bars[i + 1] <= at + 1e-6) i++;
    bar = i + 1;
    from = bars[i];
  } else {
    bar = Math.floor(at / barLen + 1e-6) + 1;
    from = (bar - 1) * barLen;
  }
  const beat = Math.floor((at - from) / beatLen + 1e-6) + 1;
  return beat > 1 ? `bar ${bar}, beat ${beat}` : `bar ${bar}`;
}

// ---- LOUD AND SOFT ----------------------------------------------------------

const LEVEL: Record<string, number> = { pppp: 0, ppp: 1, pp: 2, p: 3, mp: 4, mf: 5, f: 6, ff: 7, fff: 8, ffff: 9 };
const LEVEL_WORDS = ['as soft as can be', 'extremely soft', 'very soft', 'soft', 'moderately soft', 'moderately loud', 'loud', 'very loud', 'extremely loud', 'as loud as can be'];

export function dynamicWords(text: string): string | null {
  return text in LEVEL ? LEVEL_WORDS[LEVEL[text]] : null;
}

function journeyOf(score: Score): Explanation['journey'] {
  return (score.marks ?? [])
    .filter((m) => (m.kind === 'dynamic' && m.text in LEVEL) || m.kind === 'hairpin' || (m.kind === 'tempo' && m.at > 0))
    .slice(0, 40)
    .map((m) => ({ where: whereIs(score, m.at), text: describeMark(m) }));
}

function describeMark(m: ScoreMark): string {
  if (m.kind === 'dynamic') return `${dynamicWords(m.text)} (${m.text})`;
  if (m.kind === 'hairpin') return m.text === 'cresc.' ? 'getting louder (cresc.)' : 'getting softer (dim.)';
  if (/^(rit|ritard|ritardando|rall|rallentando)\b/i.test(m.text)) return `slowing down (${m.text})`;
  if (/^accel/i.test(m.text)) return `speeding up (${m.text})`;
  if (/^a tempo|^tempo i/i.test(m.text)) return `back to the first speed (${m.text})`;
  return `the speed changes (${m.text})`;
}

// ---- PARTS ------------------------------------------------------------------

const INTERVALS = ['a unison', 'a semitone', 'a tone', 'a minor third', 'a major third', 'a fourth', 'a tritone', 'a fifth', 'a minor sixth', 'a major sixth', 'a minor seventh', 'a major seventh', 'an octave'];

export function intervalName(semitones: number): string {
  const s = Math.abs(Math.round(semitones));
  if (s <= 12) return INTERVALS[s];
  return `${INTERVALS[12]} and ${INTERVALS[s - 12] ?? `${s - 12} semitones`}`.replace('and a unison', '').trim();
}

function partOf(score: Score, line: ScoreLine): PartSummary {
  const midis = line.notes.map((n) => n.midi);
  const lo = Math.min(...midis);
  const hi = Math.max(...midis);
  // One note per moment (the top one of a chord), in order.
  const melody: typeof line.notes = [];
  for (const n of line.notes) {
    const last = melody[melody.length - 1];
    if (last && Math.abs(last.start - n.start) < 1e-6) { if (n.midi > last.midi) melody[melody.length - 1] = n; } else melody.push(n);
  }
  let leap: Leap | null = null;
  for (let i = 1; i < melody.length; i++) {
    const d = melody[i].midi - melody[i - 1].midi;
    if (!leap || Math.abs(d) > leap.semitones) {
      leap = {
        semitones: Math.abs(d),
        name: intervalName(d),
        from: midiName(melody[i - 1].midi),
        to: midiName(melody[i].midi),
        where: whereIs(score, melody[i].start),
        hard: Math.abs(d) >= 8 || Math.abs(d) === 6,
      };
    }
  }
  return {
    id: line.id,
    name: line.name,
    low: midiName(lo),
    high: midiName(hi),
    range: `${midiName(lo)} to ${midiName(hi)}, ${intervalName(hi - lo)}`,
    leap: leap && leap.semitones > 0 ? leap : null,
  };
}

/** A line's words, the syllables joined: "Sing, my soul, a-rise!" becomes "Sing, my soul, arise!". */
export function wordsOf(line: ScoreLine): string {
  let out = '';
  for (const n of line.notes) {
    if (!n.lyric) continue;
    out += n.lyric.replace(/-$/, '') + (n.joins ? '' : ' ');
  }
  return out.replace(/\s+/g, ' ').trim();
}

// ---- THE CHARACTER ----------------------------------------------------------

function paceOf(bpm: number): string {
  if (bpm < 60) return 'slow';
  if (bpm < 80) return 'unhurried';
  if (bpm < 108) return 'at a walking pace';
  if (bpm < 132) return 'lively';
  return 'fast';
}

export function explain(score: Score): Explanation {
  const conductor = conductorFor(score);
  const beatBpm = conductor?.bpm ?? score.tempo;
  const key = keyName(score);
  const tempoWords = (score.marks ?? []).find((m) => m.kind === 'tempo' && m.at < 1e-6 && !/=/.test(m.text))?.text;
  const italian = tempoName(score.tempo);
  const tempo = `${tempoWords ?? italian}, ${score.tempo} a minute`;
  const seconds = Math.round((score.length / score.tempo) * 60);
  const bars = score.bars?.length ?? null;
  const voices = score.lines.length;

  const levels = (score.marks ?? []).filter((m) => m.kind === 'dynamic' && m.text in LEVEL);
  let shape: string;
  if (!levels.length) {
    shape = 'No loud or soft markings are written, so the choir decides.';
  } else {
    const first = levels[0];
    const last = levels[levels.length - 1];
    const peak = levels.reduce((a, b) => (LEVEL[b.text] > LEVEL[a.text] ? b : a));
    const word = (m: ScoreMark) => `${dynamicWords(m.text)} (${m.text})`;
    if (levels.every((m) => m.text === first.text)) shape = `It stays ${word(first)} throughout.`;
    else if (peak !== first && peak !== last) shape = `It begins ${word(first)}, grows to ${word(peak)} at ${whereIs(score, peak.at)}, and ends ${word(last)}.`;
    else if (peak === first) shape = `It begins ${word(first)} and ends ${word(last)}.`;
    else shape = `It begins ${word(first)} and builds to ${word(last)} at the end.`;
  }
  const mood = key?.endsWith('major') ? 'bright' : key?.endsWith('minor') ? 'darker and more reflective' : '';
  const slows = (score.marks ?? []).find((m) => m.kind === 'tempo' && m.at > 0 && /^(rit|rall)/i.test(m.text));
  const count = ['', 'one voice', 'two voices', 'three voices', 'four voices', 'five voices', 'six voices', 'seven voices', 'eight voices'][voices] ?? `${voices} voices`;
  const summary = [
    `${paceOf(beatBpm)[0].toUpperCase()}${paceOf(beatBpm).slice(1)}${mood ? ` and ${mood}` : ''}: ${tempo}${key ? `, in ${key}` : ''}, for ${count}.`,
    shape,
    slows ? `It slows down at ${whereIs(score, slows.at)} (${slows.text}).` : '',
  ].filter(Boolean).join(' ');

  return {
    summary,
    tempo,
    conductor,
    time: timeName(score),
    key,
    bars,
    seconds,
    journey: journeyOf(score),
    parts: score.lines.map((l) => partOf(score, l)),
    words: score.lines.map((l) => ({ id: l.id, name: l.name, text: wordsOf(l) })).filter((w) => w.text),
  };
}
