'use client';

// Opening a score file somebody chose: the one way into lib/music/musicxml.ts
// from a browser. Checks the kind and size first, unzips a .mxl
// (lib/music/zip.ts), parses with the browser's own XML parser, and hands the
// tree to readScore. A PDF goes to lib/music/pdf-read.ts, loaded only then.
// Every refusal is a sentence a person can act on.

import { readScore, refuseHostileText, ScoreError, type Score, type XmlNode } from '@/lib/music/musicxml';
import { scoreFromMxl } from '@/lib/music/zip';

/** A score file on the phone. A hymn in MusicXML is about 100 KB; .mxl about 15 KB. */
export const MAX_SCORE_BYTES = 3 * 1024 * 1024;
/** A music PDF: a hymn is about 50 KB, a cantata's full score a few MB. */
export const MAX_PDF_BYTES = 12 * 1024 * 1024;

export const SCORE_ACCEPT = '.musicxml,.xml,.mxl,.pdf,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml,application/pdf';

export const PDF_MIME = 'application/pdf';

export function isScoreName(name: string): boolean {
  return /\.(musicxml|xml|mxl|pdf)$/i.test(name);
}

const isPdfName = (name: string) => /\.pdf$/i.test(name);

/** Read a music PDF. Its bytes are handed over to pdf.js, so a copy goes. */
export async function scoreFromPdfBytes(bytes: Uint8Array, title: string): Promise<{ score: Score; uneven: number }> {
  const { scoreFromPdf } = await import('@/lib/music/pdf-read');
  const { score, report } = await scoreFromPdf(bytes.slice(), title);
  return { score, uneven: report.unevenBars };
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

/**
 * Read a chosen file into a Score, or throw ScoreError. `keep` is what the
 * room stores: a MusicXML score's text, or the PDF itself, read again each
 * time it is opened.
 */
export async function readScoreFile(file: File): Promise<{ score: Score; keep: Blob; uneven: number }> {
  if (!isScoreName(file.name)) {
    throw new ScoreError('Choose a score: a MusicXML file (.musicxml, .xml or .mxl) or a PDF from a notation program.');
  }
  const title = file.name.replace(/\.(musicxml|xml|mxl|pdf)$/i, '').slice(0, 80) || 'Untitled piece';
  if (isPdfName(file.name)) {
    if (file.size > MAX_PDF_BYTES) {
      throw new ScoreError('This PDF is larger than 12 MB, which is more than the room reads on a phone. Check it is the right file.');
    }
    try {
      const { score, uneven } = await scoreFromPdfBytes(new Uint8Array(await file.arrayBuffer()), title);
      return { score, keep: new Blob([file], { type: PDF_MIME }), uneven };
    } catch (cause) {
      throw new ScoreError(cause instanceof Error ? cause.message : 'This PDF could not be read.');
    }
  }
  if (file.size > MAX_SCORE_BYTES) {
    throw new ScoreError('This score is larger than 3 MB, which is more than a choir score ever is. Check it is the right file.');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try {
    text = /\.mxl$/i.test(file.name) ? await scoreFromMxl(bytes) : new TextDecoder().decode(bytes);
  } catch (cause) {
    throw new ScoreError(cause instanceof Error ? cause.message : 'This file could not be opened.');
  }
  return { score: scoreFromText(text, title), keep: new Blob([text], { type: 'text/xml' }), uneven: 0 };
}
