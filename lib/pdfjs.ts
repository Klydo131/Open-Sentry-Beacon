'use client';

// pdf.js (Mozilla, Apache-2.0), loaded the first time somebody opens a PDF and
// never before. The worker is a file on this site (the policy allows workers
// from 'self'), so nothing is fetched from anywhere else and no part of a PDF
// leaves the phone. Shared by the Music room and the Library's reader.

let loading: Promise<unknown> | null = null;

export function loadPdfJs<T>(): Promise<T> {
  loading ??= import('pdfjs-dist/legacy/build/pdf.mjs')
    .then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
      return pdfjs;
    })
    .catch((cause) => {
      // A dropped connection must not leave the reader unable to try again.
      loading = null;
      throw cause;
    });
  return loading as Promise<T>;
}
