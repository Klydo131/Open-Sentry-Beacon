'use client';

// The Pieces folder: the choir's music, kept on this phone. Two kinds:
//
//   a clean page, made from a photo by the scanner (components/music/PageScanner)
//   a score, opened to see and hear every part (ScoreView): a MusicXML file,
//   or a PDF from a notation program, read on the phone (lib/music/pdf-read.ts)
//
// Kept in the room's own store (lib/music/pieces.ts), apart from My Files.
// A saved score is checked again every time it is opened, exactly as when it
// was first chosen: what is on the phone is trusted no more than a new file.
// A PDF is kept as itself and read again each time.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, EmptyState } from '@/components/ui';
import { PageScanner } from '@/components/music/PageScanner';
import type { ConductSet } from '@/components/music/PieceExplained';
import { ScoreView } from '@/components/music/ScoreView';
import { deletePiece, listPieces, pieceBlob, savePiece, type Piece } from '@/lib/music/pieces';
import { PDF_MIME, SCORE_ACCEPT, readScoreFile, scoreFromPdfBytes, scoreFromText } from '@/lib/music/score-file';
import { humanSize } from '@/lib/localMedia';
import { downloadBlob } from '@/lib/pdf';
import type { Score } from '@/lib/music/musicxml';

type Open =
  | { kind: 'page'; piece: Piece; blob: Blob; url: string }
  | { kind: 'score'; piece: Piece; score: Score; note?: string };

/** What a person should know about notes read from a PDF's print. */
function pdfNote(uneven: number): string {
  const check = uneven === 0
    ? 'Check it against the page before the choir learns from it.'
    : `${uneven} ${uneven === 1 ? 'bar did' : 'bars did'} not add up to the time signature: check ${uneven === 1 ? 'it' : 'them'} against the page.`;
  return `Read from the PDF’s printed notes, on this phone. ${check}`;
}

const KIND_LABEL: Record<Piece['kind'], string> = { page: 'Clean page', score: 'Score' };

export function PiecesPanel({ onConduct }: { onConduct?: (set: ConductSet) => void } = {}) {
  const scoreRef = useRef<HTMLInputElement>(null);
  const [pieces, setPieces] = useState<Piece[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [open, setOpen] = useState<Open | null>(null);
  const [confirming, setConfirming] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setPieces(await listPieces());
    } catch {
      setPieces([]);
      setError('This phone would not open the room’s saved pieces. Private browsing can block it.');
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  // An open page's address is let go when it closes.
  useEffect(() => () => { if (open?.kind === 'page') URL.revokeObjectURL(open.url); }, [open]);

  const chooseScore = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setError('');
    if (!file) return;
    const pdf = /\.pdf$/i.test(file.name);
    setBusy(pdf ? 'Reading the PDF…' : 'Opening the score…');
    try {
      const { score, keep, uneven } = await readScoreFile(file);
      const piece = await savePiece('score', score.title, keep);
      await refresh();
      setOpen({ kind: 'score', piece, score: { ...score, title: piece.title }, note: pdf ? pdfNote(uneven) : undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This score could not be opened.');
    } finally {
      setBusy('');
      event.target.value = '';
    }
  };

  const openPiece = async (piece: Piece) => {
    setError('');
    try {
      const blob = await pieceBlob(piece.id);
      if (!blob) throw new Error('This piece is no longer on this phone.');
      if (piece.kind === 'score' && piece.mime === PDF_MIME) {
        setBusy('Reading the PDF…');
        const { score, uneven } = await scoreFromPdfBytes(new Uint8Array(await blob.arrayBuffer()), piece.title);
        setOpen({ kind: 'score', piece, score: { ...score, title: piece.title }, note: pdfNote(uneven) });
      } else if (piece.kind === 'score') {
        setOpen({ kind: 'score', piece, score: scoreFromText(await blob.text(), piece.title) });
      } else {
        setOpen({ kind: 'page', piece, blob, url: URL.createObjectURL(blob) });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This piece could not be opened.');
    } finally {
      setBusy('');
    }
  };

  const remove = async (piece: Piece) => {
    if (confirming !== piece.id) { setConfirming(piece.id); return; }
    setConfirming('');
    try {
      await deletePiece(piece.id);
      if (open?.piece.id === piece.id) setOpen(null);
      await refresh();
    } catch {
      setError('This phone would not delete it. Try again.');
    }
  };

  if (scanning) {
    return (
      <PageScanner
        onCancel={() => setScanning(false)}
        onSaved={(piece) => { setScanning(false); void refresh().then(() => openPiece(piece)); }}
      />
    );
  }

  if (open?.kind === 'score') return <ScoreView score={open.score} note={open.note} onClose={() => setOpen(null)} onConduct={onConduct} />;

  if (open?.kind === 'page') {
    return (
      <Card className="p-5" data-panel="piece-page">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-xl font-bold text-navy">{open.piece.title}</h2>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => downloadBlob(open.blob, `${open.piece.title}.png`)}>Download</Button>
            <Button variant="ghost" onClick={() => setOpen(null)}>Close</Button>
          </div>
        </div>
        <img src={open.url} alt={open.piece.title} className="mx-auto mt-4 w-full max-w-3xl rounded-xl ring-1 ring-navy/10" />
      </Card>
    );
  }

  return (
    <div className="space-y-5" data-music-pieces>
      <Card className="p-5">
        <h2 className="text-xl font-bold text-navy">Pieces</h2>
        <p className="mt-1 text-sm text-gray-600">
          Your choir&rsquo;s music on this phone. Scan a printed page to read it clean, or open a score file or a
          music PDF to hear every part and learn yours.
        </p>
        <input
          ref={scoreRef}
          type="file"
          accept={SCORE_ACCEPT}
          onChange={chooseScore}
          className="hidden"
          tabIndex={-1}
          aria-hidden
          data-score-input
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="gold" onClick={() => setScanning(true)}>📷 Scan a page</Button>
          <Button onClick={() => scoreRef.current?.click()} disabled={!!busy}>🎼 Open a score or PDF</Button>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          A score file is MusicXML (.musicxml, .xml or .mxl); MuseScore, Sibelius, Finale and Dorico can all save one.
          A PDF that MuseScore or Dorico made is read note by note on this phone. A scanned page, or a PDF of a scan,
          is a picture to read from; it does not play.
        </p>
        {busy && <p role="status" className="mt-3 text-sm font-semibold text-navy">{busy}</p>}
        {error && <p role="alert" className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">{error}</p>}
      </Card>

      {pieces === null ? null : pieces.length === 0 ? (
        <EmptyState title="No pieces yet" hint="Scan a page or open a score file, and it is kept here on this phone." />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" data-piece-list>
          {pieces.map((piece) => (
            <li key={piece.id}>
              <Card className="flex flex-wrap items-center gap-3 p-4">
                <span className="text-2xl" aria-hidden>{piece.kind === 'score' ? '🎼' : '📄'}</span>
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-semibold text-navy">{piece.title}</p>
                  <p className="text-sm text-gray-500">{piece.mime === PDF_MIME ? 'Score from a PDF' : KIND_LABEL[piece.kind]} · {humanSize(piece.size)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" className="px-4" onClick={() => void openPiece(piece)} disabled={!!busy}>Open</Button>
                  <button
                    type="button"
                    onClick={() => void remove(piece)}
                    className="rounded-xl px-3 py-2 text-sm font-bold text-red-700 underline"
                  >
                    {confirming === piece.id ? 'Tap again to delete' : 'Delete'}
                  </button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
