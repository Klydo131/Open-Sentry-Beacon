'use client';

// Reading a music PDF on the phone: the one way into lib/music/pdf-ink.ts and
// lib/music/pdf-score.ts from a browser. lib/music/score-file.ts imports this
// module only when somebody opens a PDF, so pdf.js (Mozilla, Apache-2.0) and
// the reader are a separate download that nobody else ever fetches.
//
// pdf.js reads the file in a worker. The build gives the worker its own file
// on this site, and the security policy allows workers from 'self'; nothing
// is fetched from anywhere else, and nothing about the PDF leaves the phone.

import { readPdfInk, type PdfJs } from '@/lib/music/pdf-ink';
import { readPdfScore, type PdfReadReport } from '@/lib/music/pdf-score';
import type { Score } from '@/lib/music/musicxml';

let loading: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  loading ??= import('pdfjs-dist/legacy/build/pdf.mjs')
    .then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
      return pdfjs as unknown as PdfJs;
    })
    .catch((cause) => {
      // A dropped connection must not leave the room unable to try again.
      loading = null;
      throw cause;
    });
  return loading;
}

/** Read a music PDF's bytes into a Score. Throws with a sentence a person can act on. */
export async function scoreFromPdf(bytes: Uint8Array, title: string): Promise<{ score: Score; report: PdfReadReport }> {
  let pdfjs: PdfJs;
  try {
    pdfjs = await loadPdfJs();
  } catch {
    throw new Error('The PDF reader did not load. Check the connection and try again.');
  }
  return readPdfScore(await readPdfInk(pdfjs, bytes), title);
}
