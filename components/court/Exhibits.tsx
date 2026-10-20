'use client';

// The clerk's table: exhibits, how they are entered, and how they are examined.
//
// ENTERING. A file's fingerprint (SHA-256) is taken on this device first and
// written on the case's record by the database before the file is uploaded,
// so the record holds the fingerprint of what was chosen, not of whatever
// arrived. Its first bytes are read to see what it really is; something that
// would run (a program, a web page, an SVG) is refused and described instead.
//
// EXAMINING. Opening an exhibit downloads it through the same rules as
// everything else, takes its fingerprint again here, and compares. The answer
// goes on the record either way ("matches" or "DOES NOT MATCH"), and a
// mismatch is told to the judge at once. Pictures show what they say about
// themselves (when, which camera, which program); where a picture was taken is
// shown to the bench only.
//
// NOTHING IS CHANGED. An exhibit is kept byte for byte as it was entered: no
// shrinking, no stripping, nothing re-encoded. That is the opposite of the
// rest of the app, which shrinks photos and removes their location, and it is
// deliberate: evidence that has been "cleaned" is no longer the evidence.

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { ExhibitTag } from '@/components/court/CourtFurniture';
import {
  EXHIBIT_LIMIT, fullFingerprint, pictureDetails, sha256Hex, shortFingerprint, showAs, sniff,
  typeFinding, type PictureDetails,
} from '@/lib/court/forensics';
import {
  courtEnterFile, courtEnterWriting, courtExhibitBytes, courtExhibitHandled, type CourtExhibit,
} from '@/lib/live/court';
import { humanError } from '@/lib/live/errors';
import { downloadBlob } from '@/lib/pdf';

const bytesInWords = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  if (v >= 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
  if (v >= 1024) return `${Math.round(v / 1024)} KB`;
  return `${v} bytes`;
};
const day = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

// ------------------------------------------------------------ the table ----

export function ClerksTable({
  trialId, exhibits, mayPresent, onBench, advanced, onChanged,
}: {
  trialId: string;
  exhibits: CourtExhibit[];
  mayPresent: boolean;
  onBench: boolean;
  advanced: boolean;
  onChanged: () => void | Promise<void>;
}) {
  const [adding, setAdding] = useState<'' | 'file' | 'writing'>('');
  const [open, setOpen] = useState<CourtExhibit | null>(null);

  return (
    <div className="ct-table" data-court-exhibits>
      <h3 className="ct-section-title">The clerk&rsquo;s table &middot; exhibits</h3>
      {exhibits.length === 0 ? (
        <p className="text-sm text-[#f0dfbd]">No exhibits yet.</p>
      ) : (
        <ul className="ct-exhibits">
          {exhibits.map((e) => (
            <li key={e.id}>
              <button type="button" className="ct-exhibit" onClick={() => setOpen(e)} data-court-exhibit={e.label}>
                <ExhibitTag label={e.label} className="ct-tag" />
                <span className="min-w-0">
                  <span className="ct-exhibit-title">
                    {e.title}
                    {e.shown_to === 'bench' && <span className="ct-bench-only">Bench only</span>}
                  </span>
                  <span className="ct-exhibit-meta block">
                    {e.kind === 'file' ? `${e.file_name} · ${bytesInWords(e.size_bytes)}` : 'Written'}
                    {' · '}{e.entered_name}, {day(e.entered_at)}
                  </span>
                  <span className="ct-print block">SHA-256 {shortFingerprint(e.sha256)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {mayPresent && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="gold" onClick={() => setAdding(adding === 'file' ? '' : 'file')}>
            {adding === 'file' ? 'Cancel' : 'Add a photo or file'}
          </Button>
          <Button variant="ghost" onClick={() => setAdding(adding === 'writing' ? '' : 'writing')}>
            {adding === 'writing' ? 'Cancel' : 'Add something written'}
          </Button>
        </div>
      )}
      {adding && (
        <AddExhibit
          trialId={trialId}
          kind={adding}
          advanced={advanced}
          onDone={async () => { setAdding(''); await onChanged(); }}
        />
      )}

      {open && <ExhibitViewer exhibit={open} onBench={onBench} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ----------------------------------------------------------- entering ----

function AddExhibit({ trialId, kind, advanced, onDone }: {
  trialId: string;
  kind: 'file' | 'writing';
  advanced: boolean;
  onDone: () => void | Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [print, setPrint] = useState('');
  const [finding, setFinding] = useState<ReturnType<typeof typeFinding> | null>(null);
  const [title, setTitle] = useState('');
  const [writing, setWriting] = useState('');
  const [note, setNote] = useState('');
  const [benchOnly, setBenchOnly] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const choose = async (picked: File | null) => {
    setError('');
    setFile(null);
    setPrint('');
    setFinding(null);
    if (!picked) return;
    if (picked.size > EXHIBIT_LIMIT) {
      setError('An exhibit can be up to 25 MB. Describe a larger file in writing instead.');
      return;
    }
    setBusy('Taking its fingerprint');
    try {
      const bytes = new Uint8Array(await picked.arrayBuffer());
      setPrint(await sha256Hex(bytes));
      setFinding(typeFinding(picked.name, picked.type, sniff(bytes)));
      setFile(picked);
      if (!title) setTitle(picked.name.replace(/\.[^.]+$/, '').slice(0, 200));
    } catch {
      setError('That file could not be read on this device.');
    } finally {
      setBusy('');
    }
  };

  const enter = async () => {
    setError('');
    if (!title.trim()) { setError('Give it a short title.'); return; }
    setBusy('Entering it');
    try {
      let letter: string;
      if (kind === 'file') {
        if (!file || !print || !finding?.storeAs) { setError('Choose a file the court room can keep.'); return; }
        letter = await courtEnterFile({
          trialId, file, fileName: file.name, mime: finding.storeAs, sha256: print,
          title, note, benchOnly,
        });
      } else {
        if (!writing.trim()) { setError('Write it out first.'); return; }
        letter = await courtEnterWriting({ trialId, title, writing, note, benchOnly });
      }
      setBusy(`Entered as Exhibit ${letter}`);
      await onDone();
    } catch (cause) {
      setError(humanError(cause, 'That could not be entered.'));
      setBusy('');
    }
  };

  return (
    <div className="mt-3 rounded-xl bg-[#fbf6ea] p-3 text-[#1b2442]" data-court-add={kind}>
      {kind === 'file' ? (
        <label className="ct-field">
          <span>The photo, recording, video, PDF or text file</span>
          <input
            type="file"
            data-court-file
            accept="image/*,application/pdf,audio/*,video/*,text/plain"
            onChange={(e) => void choose(e.target.files?.[0] ?? null)}
          />
          <p className="ct-hint">
            Kept exactly as it is, up to 25 MB. Nothing about it is changed, including where a photo was taken.
          </p>
        </label>
      ) : (
        <label className="ct-field">
          <span>What it says</span>
          <textarea
            rows={5}
            value={writing}
            onChange={(e) => setWriting(e.target.value)}
            placeholder="Copy out the message, word for word, or describe what you saw."
          />
        </label>
      )}

      {print && (
        <p className="ct-finding ct-finding-note">
          Fingerprint taken on this device: <span className="ct-print">{fullFingerprint(print)}</span>
        </p>
      )}
      {finding && (
        <p className={`ct-finding ${finding.storeAs && finding.agrees ? 'ct-finding-good' : finding.storeAs ? 'ct-finding-note' : 'ct-finding-bad'}`}>
          {finding.says}
        </p>
      )}

      <label className="ct-field">
        <span>A short title</span>
        <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Screenshot of the message" />
      </label>

      {advanced && (
        <>
          <label className="ct-field">
            <span>A note for the court <span className="font-normal">(optional)</span></span>
            <input value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} placeholder="Where it came from, and when" />
          </label>
          <label className="mt-2 flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={benchOnly} onChange={(e) => setBenchOnly(e.target.checked)} />
            <span>
              <strong>Bench only.</strong> Shown to the judge and the gallery, not to the other people called.
              For something that would put somebody at risk if it were seen.
            </span>
          </label>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="gold"
          disabled={Boolean(busy) || (kind === 'file' ? !file || !finding?.storeAs : !writing.trim())}
          onClick={() => void enter()}
        >
          Enter it as an exhibit
        </Button>
        {busy && <span className="text-sm text-[#4a4f63]">{busy}</span>}
      </div>
      {error && <p className="ct-finding ct-finding-bad" role="alert">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------- examining ----

type Examined = {
  url: string | null;
  text: string | null;
  computed: string;
  matches: boolean;
  sniffed: ReturnType<typeof typeFinding> | null;
  picture: PictureDetails | null;
  blob: Blob | null;
};

export function ExhibitViewer({ exhibit, onBench, onClose }: {
  exhibit: CourtExhibit;
  onBench: boolean;
  onClose: () => void;
}) {
  const [seen, setSeen] = useState<Examined | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [showPlace, setShowPlace] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let url: string | null = null;
    let gone = false;
    closeRef.current?.focus();
    (async () => {
      try {
        await courtExhibitHandled(exhibit.id, 'viewed').catch(() => undefined);
        if (exhibit.kind === 'writing') {
          const computed = await sha256Hex(exhibit.writing ?? '');
          const matches = computed === exhibit.sha256;
          await courtExhibitHandled(exhibit.id, matches ? 'matched' : 'differed').catch(() => undefined);
          if (!gone) setSeen({ url: null, text: exhibit.writing, computed, matches, sniffed: null, picture: null, blob: null });
          return;
        }
        const blob = await courtExhibitBytes(exhibit.path ?? '');
        const bytes = new Uint8Array(await blob.arrayBuffer());
        const computed = await sha256Hex(bytes);
        const matches = computed === exhibit.sha256;
        await courtExhibitHandled(exhibit.id, matches ? 'matched' : 'differed').catch(() => undefined);
        const as = showAs(exhibit.mime);
        // A typed copy, so the browser shows it as what the record says it is
        // and never sniffs it into something that runs.
        const typed = new Blob([bytes], { type: as === 'save' ? 'application/octet-stream' : exhibit.mime ?? 'application/octet-stream' });
        if (as === 'image' || as === 'audio' || as === 'video') url = URL.createObjectURL(typed);
        const text = as === 'text' ? new TextDecoder().decode(bytes.subarray(0, 200_000)) : null;
        if (!gone) {
          setSeen({
            url, text, computed, matches,
            sniffed: typeFinding(exhibit.file_name ?? '', exhibit.mime ?? '', sniff(bytes)),
            picture: pictureDetails(bytes),
            blob: typed,
          });
        }
      } catch (cause) {
        if (!gone) setError(humanError(cause, 'This exhibit could not be opened.'));
      }
    })();
    return () => {
      gone = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [exhibit]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);

  const as = exhibit.kind === 'writing' ? 'writing' : showAs(exhibit.mime);

  return (
    <div className="ct-viewer-backdrop" role="dialog" aria-modal="true" aria-label={`Exhibit ${exhibit.label}`}
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ct-viewer ct-room" data-court-viewer={exhibit.label}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2">
            <ExhibitTag label={exhibit.label} className="ct-tag" />
            <div className="min-w-0">
              <h3 className="text-lg font-bold" style={{ fontFamily: 'Georgia, serif' }}>{exhibit.title}</h3>
              {exhibit.note && <p className="text-sm text-[#4a4f63]">{exhibit.note}</p>}
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={onClose}
                  className="tap shrink-0 rounded-xl bg-white px-4 font-semibold text-navy ring-1 ring-navy/20">
            Close
          </button>
        </div>

        {error ? (
          <p className="ct-finding ct-finding-bad">{error}</p>
        ) : !seen ? (
          <p className="text-sm text-[#4a4f63]">Opening it and checking its fingerprint&hellip;</p>
        ) : (
          <div className="ct-viewer-grid">
            <div>
              {as === 'image' && seen.url && (
                <>
                  <div className="ct-stage">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={seen.url} alt={exhibit.title} style={{ width: `${zoom * 100}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {[1, 2, 4].map((z) => (
                      <Button key={z} variant={zoom === z ? 'gold' : 'ghost'} onClick={() => setZoom(z)}>
                        {z === 1 ? 'Whole picture' : `${z}× closer`}
                      </Button>
                    ))}
                  </div>
                </>
              )}
              {as === 'audio' && seen.url && <div className="ct-stage"><audio controls src={seen.url} /></div>}
              {as === 'video' && seen.url && <div className="ct-stage"><video controls playsInline src={seen.url} /></div>}
              {(as === 'writing' || as === 'text') && <div className="ct-writing">{seen.text}</div>}
              {as === 'save' && (
                <p className="ct-finding ct-finding-note">
                  This kind of file is not shown inside the app. Save a copy to open it with the program it belongs to.
                </p>
              )}
              {exhibit.kind === 'file' && seen.blob && (
                <div className="mt-2">
                  <Button variant="ghost" onClick={() => downloadBlob(seen.blob as Blob, exhibit.file_name ?? `exhibit-${exhibit.label}`)}>
                    Save a copy
                  </Button>
                </div>
              )}
            </div>

            <div>
              <p className={`ct-finding ${seen.matches ? 'ct-finding-good' : 'ct-finding-bad'}`} data-court-print={seen.matches ? 'matches' : 'differs'}>
                {seen.matches
                  ? 'Its fingerprint matches the one recorded when it was entered: this is the same file, byte for byte.'
                  : 'Its fingerprint does NOT match the one recorded when it was entered. The judge has been told. Do not rely on this copy.'}
              </p>
              <dl className="ct-facts mt-3">
                <dt>Recorded</dt><dd className="ct-print">{fullFingerprint(exhibit.sha256)}</dd>
                <dt>On this device</dt><dd className="ct-print">{fullFingerprint(seen.computed)}</dd>
                <dt>Entered</dt><dd>{day(exhibit.entered_at)} by {exhibit.entered_name}</dd>
                {exhibit.kind === 'file' && (<>
                  <dt>File</dt><dd>{exhibit.file_name}, {bytesInWords(exhibit.size_bytes)}</dd>
                </>)}
                {seen.sniffed && (<>
                  <dt>What it is</dt><dd>{seen.sniffed.says}</dd>
                </>)}
                {seen.picture && (<>
                  {seen.picture.taken && (<><dt>Taken</dt><dd>{seen.picture.taken}</dd></>)}
                  {(seen.picture.make || seen.picture.model) && (<><dt>Camera</dt><dd>{[seen.picture.make, seen.picture.model].filter(Boolean).join(' ')}</dd></>)}
                  {seen.picture.software && (<><dt>Last saved by</dt><dd>{seen.picture.software}</dd></>)}
                  {seen.picture.saved && seen.picture.saved !== seen.picture.taken && (<><dt>Saved</dt><dd>{seen.picture.saved}</dd></>)}
                  {seen.picture.width && seen.picture.height && (<><dt>Size</dt><dd>{seen.picture.width} × {seen.picture.height}</dd></>)}
                  <dt>Location</dt>
                  <dd>
                    {!seen.picture.hasLocation ? 'None recorded in the picture'
                      : !onBench ? 'Recorded in the picture (shown to the bench only)'
                      : showPlace ? `${seen.picture.latitude}, ${seen.picture.longitude}`
                      : <button type="button" className="ct-plain-button" onClick={() => setShowPlace(true)}>Recorded. Show it</button>}
                  </dd>
                </>)}
                {exhibit.kind === 'file' && !seen.picture && showAs(exhibit.mime) === 'image' && (
                  <><dt>Picture details</dt><dd>None found in the file</dd></>
                )}
              </dl>
              <p className="ct-hint mt-3">
                Opening this and checking it are written on the case&rsquo;s record.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------ the same file? ----

/**
 * Is a file on this device the same as an exhibit? Its fingerprint is taken
 * here and compared with every exhibit's. Nothing is uploaded.
 */
export function SameFileCheck({ exhibits }: { exhibits: CourtExhibit[] }) {
  const [answer, setAnswer] = useState<{ good: boolean; says: string } | null>(null);
  const check = async (file: File | null) => {
    setAnswer(null);
    if (!file) return;
    try {
      const print = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
      const same = exhibits.filter((e) => e.sha256 === print);
      setAnswer(same.length
        ? { good: true, says: `Identical, byte for byte, to Exhibit ${same.map((e) => e.label).join(' and ')}.` }
        : { good: false, says: `Not identical to any exhibit in this case. Its fingerprint is ${shortFingerprint(print)}.` });
    } catch {
      setAnswer({ good: false, says: 'That file could not be read on this device.' });
    }
  };
  return (
    <div data-court-same-file>
      <label className="ct-field">
        <span>Is this the same file?</span>
        <input type="file" onChange={(e) => void check(e.target.files?.[0] ?? null)} />
        <p className="ct-hint">Choose a copy somebody brought. It is compared here, on this device, and not uploaded.</p>
      </label>
      {answer && <p className={`ct-finding ${answer.good ? 'ct-finding-good' : 'ct-finding-note'}`}>{answer.says}</p>}
    </div>
  );
}
