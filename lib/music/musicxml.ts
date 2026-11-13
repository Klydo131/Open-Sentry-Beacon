// Reading a MusicXML score into lines a choir can practise: each voice of each
// part, as notes on a timeline, with its lyrics and the tempo.
//
// MusicXML is the score format every notation program exports (MuseScore,
// Finale, Sibelius, Dorico). Only the partwise form is read, which is what
// they all write by default. What is read is what practising a part needs:
// pitches, lengths, voices, ties, the first verse's lyrics, the tempo; and,
// since 6 October 2026, what explaining the piece needs (lib/music/explain.ts):
// the key, the time, where each bar starts, the tempo's words, and the loud
// and soft markings. Slurs and the rest of the engraving are not read.
//
// REPEATS ARE PLAYED ONCE, straight through. Following repeat signs, voltas and
// D.C. al Fine correctly is a project of its own; the room says so.
//
// A SCORE IS SOMETHING SOMEBODY SENT YOU, so it is untrusted input:
//   - it is parsed by the browser's own XML parser, which never fetches
//     anything a file points at (no external entities, no DTDs loaded);
//   - a file that declares its own entities is refused before parsing, the
//     shape of the "billion laughs" attack;
//   - the tree is walked with a hard ceiling on elements, notes, lines and
//     length, so a hostile file can make the room say no, never hang it.
// Nothing here writes HTML: names and lyrics reach the screen as text.

/** The part of an XML element the reader uses. lib/music/score-file.ts adapts the browser's. */
export interface XmlNode {
  name: string;
  attr(name: string): string | null;
  kids: XmlNode[];
  text: string;
}

export interface ScoreNote {
  /** Where it starts, in quarter notes from the beginning. */
  start: number;
  /** How long it lasts, in quarter notes. */
  length: number;
  /** MIDI number; middle C is 60. */
  midi: number;
  /** The first verse's syllable, if it has one. */
  lyric?: string;
  /** The syllable runs on into the next one ("Hal-" of "Hal-le-lu-jah"). */
  joins?: boolean;
}

/** A marking over the music: loud or soft, the tempo's words, anything else written. */
export interface ScoreMark {
  /** Where, in quarter notes from the beginning. */
  at: number;
  kind: 'dynamic' | 'hairpin' | 'tempo' | 'words';
  /** As written: "p", "mf", "cresc.", "Andante", "rit.". */
  text: string;
}

export interface ScoreLine {
  /** Stable within the file: the part's id and the voice. */
  id: string;
  /** What a singer calls it: "Soprano", or "Men · voice 2". */
  name: string;
  notes: ScoreNote[];
}

export interface Score {
  title: string;
  /** Quarter notes per minute. */
  tempo: number;
  lines: ScoreLine[];
  /** The whole piece, in quarter notes. */
  length: number;
  /** The key at the start: sharps (positive) or flats (negative), and the mode if the file says. */
  key?: { fifths: number; mode?: 'major' | 'minor' };
  /** The time signature at the start. */
  time?: { beats: number; beatType: number };
  /** Where each bar starts, in quarter notes. */
  bars?: number[];
  /** The markings, in order. */
  marks?: ScoreMark[];
}

export class ScoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScoreError';
  }
}

/** Ceilings no real choir score comes near. */
export const LIMITS = {
  /** Elements in the whole file. A four-part hymn is about 20,000. */
  elements: 400_000,
  notes: 40_000,
  lines: 24,
  /** Quarter notes: about two hours at 120. */
  length: 15_000,
  /** Characters of text kept for a name or a syllable. */
  text: 80,
  /** Markings and bars kept. */
  marks: 600,
  bars: 4_000,
} as const;

/** Every dynamic MusicXML names, softest to loudest where it has a place. */
const DYNAMICS = ['pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'ffff', 'sf', 'sfz', 'sfp', 'fp', 'rf', 'rfz', 'fz', 'sffz', 'pf'] as const;
/** Words that set a tempo, as a choir's music writes them. */
const TEMPO_WORDS = /^(grave|largo|larghetto|lento|adagio|adagietto|andante|andantino|moderato|allegretto|allegro|vivace|presto|prestissimo|maestoso|a tempo|tempo i|rit|ritard|ritardando|rall|rallentando|accel|accelerando|slowly|slow|gently|moderately|brightly|joyfully|quickly|fast|lively|steady|reverently|with movement|flowing)\b/i;

const STEPS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const child = (node: XmlNode, name: string) => node.kids.find((k) => k.name === name);
const children = (node: XmlNode, name: string) => node.kids.filter((k) => k.name === name);
const clean = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, LIMITS.text);
const number = (text: string | undefined) => {
  const n = Number(text);
  return Number.isFinite(n) ? n : NaN;
};

/** Refuse what a score never needs and an attack does. Run on the raw text, before parsing. */
export function refuseHostileText(text: string): void {
  if (/<!ENTITY/i.test(text)) throw new ScoreError('This file declares its own entities, which a score never needs. It was not opened.');
}

function countElements(root: XmlNode): number {
  let count = 0;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    count++;
    if (count > LIMITS.elements) return count;
    for (const kid of node.kids) stack.push(kid);
  }
  return count;
}

function midiOf(pitch: XmlNode): number | null {
  const step = STEPS[clean(child(pitch, 'step')?.text ?? '').toUpperCase()];
  const octave = number(child(pitch, 'octave')?.text);
  const alter = number(child(pitch, 'alter')?.text) || 0;
  if (step === undefined || !Number.isFinite(octave)) return null;
  const midi = 12 * (octave + 1) + step + Math.round(alter);
  return midi >= 0 && midi <= 127 ? midi : null;
}

function tempoOf(root: XmlNode): number {
  // The first <sound tempo="..."> anywhere: notation programs put it on a
  // direction at the start of the first measure.
  const stack = [root];
  while (stack.length) {
    const node = stack.shift()!;
    if (node.name === 'sound') {
      const t = number(node.attr('tempo') ?? undefined);
      if (t > 0) return Math.min(240, Math.max(30, Math.round(t)));
    }
    stack.push(...node.kids);
  }
  return 90;
}

function titleOf(root: XmlNode): string {
  const work = child(root, 'work');
  return clean(child(work ?? root, 'work-title')?.text ?? '')
    || clean(child(root, 'movement-title')?.text ?? '');
}

/** A direction's markings, at `at`. */
function marksOf(direction: XmlNode, at: number): ScoreMark[] {
  const out: ScoreMark[] = [];
  for (const type of children(direction, 'direction-type')) {
    for (const d of children(type, 'dynamics')) {
      for (const k of d.kids) {
        const name = k.name === 'other-dynamics' ? clean(k.text) : k.name;
        if ((DYNAMICS as readonly string[]).includes(name) || (k.name === 'other-dynamics' && name)) out.push({ at, kind: 'dynamic', text: name });
      }
    }
    for (const w of children(type, 'wedge')) {
      const t = w.attr('type');
      if (t === 'crescendo') out.push({ at, kind: 'hairpin', text: 'cresc.' });
      else if (t === 'diminuendo') out.push({ at, kind: 'hairpin', text: 'dim.' });
    }
    for (const w of children(type, 'words')) {
      const text = clean(w.text);
      if (!text) continue;
      if (/^(cresc|crescendo)\.?$/i.test(text)) out.push({ at, kind: 'hairpin', text: 'cresc.' });
      else if (/^(dim|dimin|diminuendo|decresc|decrescendo)\.?$/i.test(text)) out.push({ at, kind: 'hairpin', text: 'dim.' });
      else out.push({ at, kind: TEMPO_WORDS.test(text) ? 'tempo' : 'words', text });
    }
    for (const m of children(type, 'metronome')) {
      const per = number(child(m, 'per-minute')?.text);
      if (per > 0) out.push({ at, kind: 'tempo', text: `${clean(child(m, 'beat-unit')?.text ?? 'quarter')} = ${Math.round(per)}` });
    }
  }
  return out;
}

/** Read a parsed MusicXML document. Throws ScoreError with a sentence a person can act on. */
export function readScore(root: XmlNode, fallbackTitle = 'Untitled piece'): Score {
  if (root.name === 'score-timewise') {
    throw new ScoreError('This score is saved in the "timewise" form. Export it again from your notation program as ordinary MusicXML.');
  }
  if (root.name !== 'score-partwise') {
    throw new ScoreError('This is not a MusicXML score. Export it from your notation program as MusicXML (.musicxml or .mxl).');
  }
  if (countElements(root) > LIMITS.elements) {
    throw new ScoreError('This score is larger than the room can open on a phone.');
  }

  const names = new Map<string, string>();
  for (const sp of children(child(root, 'part-list') ?? root, 'score-part')) {
    const id = sp.attr('id');
    if (id) names.set(id, clean(child(sp, 'part-name')?.text ?? '') || id);
  }

  const lines = new Map<string, ScoreLine>();
  let notes = 0;
  let length = 0;
  let key: Score['key'];
  let time: Score['time'];
  const bars: number[] = [];
  const marks: ScoreMark[] = [];
  let firstPart = true;

  for (const part of children(root, 'part')) {
    const partId = part.attr('id') ?? `P${lines.size + 1}`;
    const partName = names.get(partId) ?? partId;
    let divisions = 1;
    let cursor = 0; // in divisions
    let lastStart = 0; // where the previous note began, for chords
    const voicesHere = new Set<string>();
    const open = new Map<string, ScoreNote>(); // tied notes waiting for their end, by voice and pitch

    for (const measure of children(part, 'measure')) {
      // The bars, and the key and time they start in, are read from the first part.
      if (firstPart && bars.length < LIMITS.bars) bars.push(cursor / divisions);
      for (const item of measure.kids) {
        if (item.name === 'attributes') {
          const d = number(child(item, 'divisions')?.text);
          if (d > 0) divisions = d;
          if (firstPart && bars.length === 1) {
            // (the divisions just read apply to this bar, which starts at 0)
            const k = child(item, 'key');
            const fifths = number(child(k ?? item, 'fifths')?.text);
            if (k && Number.isFinite(fifths) && Math.abs(fifths) <= 7 && !key) {
              const mode = clean(child(k, 'mode')?.text ?? '').toLowerCase();
              key = { fifths, ...(mode === 'major' || mode === 'minor' ? { mode } : {}) };
            }
            const t = child(item, 'time');
            const beats = number(child(t ?? item, 'beats')?.text);
            const beatType = number(child(t ?? item, 'beat-type')?.text);
            if (t && beats > 0 && beats <= 32 && [1, 2, 4, 8, 16, 32].includes(beatType) && !time) time = { beats, beatType };
          }
        } else if (item.name === 'direction') {
          for (const mark of marksOf(item, cursor / divisions)) {
            if (marks.length >= LIMITS.marks) break;
            // The same marking written in every part is one marking.
            if (!marks.some((m) => Math.abs(m.at - mark.at) < 1e-6 && m.text === mark.text)) marks.push(mark);
          }
        } else if (item.name === 'backup' || item.name === 'forward') {
          const d = number(child(item, 'duration')?.text);
          if (d > 0) cursor = Math.max(0, cursor + (item.name === 'backup' ? -d : d));
        } else if (item.name === 'note') {
          if (child(item, 'grace')) continue; // ornaments with no time of their own
          const duration = number(child(item, 'duration')?.text);
          if (!(duration >= 0)) continue;
          const chord = !!child(item, 'chord');
          const start = chord ? lastStart : cursor;
          if (!chord) {
            lastStart = cursor;
            cursor += duration;
          }
          const pitch = child(item, 'pitch');
          if (!pitch || child(item, 'rest')) continue;
          const midi = midiOf(pitch);
          if (midi === null) continue;

          const voice = clean(child(item, 'voice')?.text ?? '') || '1';
          voicesHere.add(voice);
          const key = `${partId}/${voice}`;
          if (!lines.has(key)) {
            if (lines.size >= LIMITS.lines) throw new ScoreError(`This score has more than ${LIMITS.lines} voices to practise.`);
            lines.set(key, { id: key, name: partName, notes: [] });
          }
          const at = start / divisions;
          const len = duration / divisions;
          const ties = children(item, 'tie').map((t) => t.attr('type'));
          const tiedKey = `${key}/${midi}`;

          // A note tied to the one before is one held note, not two.
          const held = ties.includes('stop') ? open.get(tiedKey) : undefined;
          let note: ScoreNote;
          if (held && Math.abs(held.start + held.length - at) < 1e-6) {
            held.length += len;
            note = held;
          } else {
            const verse = children(item, 'lyric')[0];
            const lyric = clean(child(verse ?? item, 'text')?.text ?? '');
            const syllabic = clean(child(verse ?? item, 'syllabic')?.text ?? '');
            const joins = !!lyric && (syllabic === 'begin' || syllabic === 'middle');
            note = { start: at, length: len, midi, ...(lyric ? { lyric } : {}), ...(joins ? { joins } : {}) };
            lines.get(key)!.notes.push(note);
            if (++notes > LIMITS.notes) throw new ScoreError('This score has more notes than the room can play on a phone.');
          }
          if (ties.includes('start')) open.set(tiedKey, note);
          else open.delete(tiedKey);
          length = Math.max(length, note.start + note.length);
          if (length > LIMITS.length) throw new ScoreError('This score is longer than the room can play.');
        }
      }
    }

    firstPart = false;
    // A part sung by one voice is called by the part's name. A part with two
    // (a women's staff with sopranos and altos) is called by both.
    if (voicesHere.size > 1) {
      for (const voice of voicesHere) {
        const line = lines.get(`${partId}/${voice}`);
        if (line) line.name = `${partName} · voice ${voice}`;
      }
    }
  }

  const found = [...lines.values()].filter((l) => l.notes.length > 0);
  if (!found.length) throw new ScoreError('No notes were found in this score.');
  for (const line of found) line.notes.sort((a, b) => a.start - b.start || b.midi - a.midi);

  marks.sort((a, b) => a.at - b.at);
  return {
    title: titleOf(root) || fallbackTitle,
    tempo: tempoOf(root),
    lines: found,
    length,
    ...(key ? { key } : {}),
    ...(time ? { time } : {}),
    ...(bars.length ? { bars } : {}),
    ...(marks.length ? { marks } : {}),
  };
}
