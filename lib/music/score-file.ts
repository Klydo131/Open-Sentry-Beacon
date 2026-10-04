'use client';

// Opening a score file somebody chose: the one way into lib/music/musicxml.ts
// from a browser. Checks the kind and size first, unzips a .mxl
// (lib/music/zip.ts), parses with the browser's own XML parser, and hands the
// tree to readScore. Every refusal is a sentence a person can act on.

import { readScore, refuseHostileText, ScoreError, type Score, type XmlNode } from '@/lib/music/musicxml';
import { scoreFromMxl } from '@/lib/music/zip';

/** A score file on the phone. A hymn in MusicXML is about 100 KB; .mxl about 15 KB. */
export const MAX_SCORE_BYTES = 3 * 1024 * 1024;

export const SCORE_ACCEPT = '.musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml';

export function isScoreName(name: string): boolean {
  return /\.(musicxml|xml|mxl)$/i.test(name);
}

/** The browser's element, as the small shape the reader walks. */
function adapt(el: Element): XmlNode {
  return {
    name: el.localName,
    attr: (name) => el.getAttribute(name),
    kids: Array.from(el.children, adapt),
    text: el.textContent ?? '',
  };
}

/** Parse MusicXML text into a Score. */
export function scoreFromText(text: string, title: string): Score {
  refuseHostileText(text);
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) {
    throw new ScoreError('This file could not be read as MusicXML. Export it again from your notation program.');
  }
  return readScore(adapt(doc.documentElement), title);
}

/** Read a chosen file into a Score, or throw ScoreError. */
export async function readScoreFile(file: File): Promise<{ score: Score; text: string }> {
  if (!isScoreName(file.name)) {
    throw new ScoreError('Choose a MusicXML score: a file ending in .musicxml, .xml or .mxl.');
  }
  if (file.size > MAX_SCORE_BYTES) {
    throw new ScoreError('This score is larger than 3 MB, which is more than a choir score ever is. Check it is the right file.');
  }
  const title = file.name.replace(/\.(musicxml|xml|mxl)$/i, '').slice(0, 80) || 'Untitled piece';
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try {
    text = /\.mxl$/i.test(file.name) ? await scoreFromMxl(bytes) : new TextDecoder().decode(bytes);
  } catch (cause) {
    throw new ScoreError(cause instanceof Error ? cause.message : 'This file could not be opened.');
  }
  return { score: scoreFromText(text, title), text };
}
