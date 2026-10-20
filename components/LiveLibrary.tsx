'use client';

// The church library, against a real database. A resource is a link or a file
// kept in the church's own storage, never a file in one browser. The database
// decides who sees which rows; nothing here filters for access.

import { useCallback, useEffect, useRef, useState } from 'react';
import { kindFromUrl } from '@/lib/live/kind-from-url';
import * as live from '@/lib/live/data';
import { Button, Card } from '@/components/ui';
import { BeaconSpinner } from '@/components/BeaconLoader';
import { humanError } from '@/lib/live/errors';
import { useKeepUp, KEEP_UP_LIBRARY } from '@/lib/live/keep-up';
import { useLiveSession } from '@/lib/live/session';
import { canShareFiles, shareItem } from '@/lib/share';
import { FileDrop, draggingFiles } from '@/components/FileDrop';

const message = (cause: unknown) =>
  humanError(cause, 'Something went wrong.');

const KIND_ICON: Record<live.MaterialKind, string> = {
  link: '🔗', video: '🎬', audio: '🎧', pdf: '📄', image: '🖼️', file: '📎',
};

/** Plural labels for the filter chips. */
const KIND_LABEL: Record<live.MaterialKind, string> = {
  link: 'Links', video: 'Videos', audio: 'Audio', pdf: 'PDFs', image: 'Pictures', file: 'Documents',
};

function Err({ msg }: { msg: string }) {
  if (!msg) return null;
  return (
    <p className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
      {msg}
    </p>
  );
}

/**
 * Hand a resource to somebody outside the app: the phone's share sheet, or
 * copy (link) / save (file) where there is none. The person is always told
 * what happened.
 */
function SendOut({ onSend }: { onSend: () => void }) {
  return (
    <button
      onClick={onSend}
      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-navy ring-1 ring-black/10"
    >
      Share outside the app
    </button>
  );
}

/** Save a file to this computer. An address signed to download, not open. */
async function saveFile(m: live.Material) {
  const url = await live.materialFileUrl(m.file_path!, m.file_name || m.title);
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * "Share outside the app" for a link or a file, returning the message to show.
 * `ready` is the file fetched ahead of time: a phone opens its share sheet
 * only while the tap is fresh. If the sheet refuses, the file is saved.
 */
async function sendOutMaterial(m: live.Material, ready?: File): Promise<{ flash?: string; error?: string }> {
  if (!m.file_path) {
    const result = await shareItem({
      title: m.title,
      text: m.description || m.title,
      url: m.external_url ?? undefined,
    });
    if (result === 'shared') return { flash: `Sent \u201c${m.title}\u201d.` };
    if (result === 'copied') return { flash: 'The address is copied. Paste it wherever you like.' };
    if (result === 'cancelled') return {};
    return { error: 'This browser cannot share for you. Tap the title to open it, then share from there.' };
  }

  try {
    const file = ready ?? await live.materialFileForSharing(m);
    if (canShareFiles(file)) {
      const result = await shareItem({ title: m.title, text: m.description || m.title, file });
      if (result === 'shared') return { flash: `Sent \u201c${m.title}\u201d.` };
      if (result === 'cancelled') return {};
    }
    await saveFile(m);
    return { flash: `Saved \u201c${m.file_name || m.title}\u201d to this device. Attach it wherever you like.` };
  } catch (cause) {
    return { error: message(cause) };
  }
}

/** Where a link goes, as a site name ("youtube.com"). The full address is still searched. */
function siteOf(address: string): string {
  try {
    return new URL(address).hostname.replace(/^www\./, '');
  } catch {
    return address;
  }
}

function sizeOf(bytes?: number | null): string {
  if (!bytes) return '';
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** What is under the title: the site for a link, the file's name and size for a file. */
function whereItIs(m: live.Material): string {
  if (m.file_path) return [m.file_name, sizeOf(m.file_size)].filter(Boolean).join(' · ');
  return m.external_url ? siteOf(m.external_url) : '';
}

function Item({ m, children }: { m: live.Material; children?: React.ReactNode }) {
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState('');
  // Ask for a fresh signed address each time; stored ones expire.
  const openFile = async () => {
    setOpening(true); setFailed('');
    try {
      const url = await live.materialFileUrl(m.file_path!);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (cause) { setFailed(message(cause)); }
    finally { setOpening(false); }
  };
  return (
    <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-xl shadow-sm">{KIND_ICON[m.kind] ?? KIND_ICON.file}</span>
        <div className="min-w-0 flex-1">
          {m.file_path ? (
            <button
              type="button"
              onClick={() => void openFile()}
              disabled={opening}
              /* min-h-0 removes the default button height, so a file title lines up with a link title. */
              className="min-h-0 text-left font-bold text-navy underline underline-offset-2"
            >
              {m.title}
            </button>
          ) : (
            <a
              href={m.external_url ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-navy underline underline-offset-2"
            >
              {m.title}
            </a>
          )}
          {m.description && <p className="mt-0.5 text-sm text-gray-600">{m.description}</p>}
          <p className="mt-0.5 truncate text-xs text-gray-500">{whereItIs(m)}</p>
          {failed && <p className="mt-1 text-xs font-semibold text-red-700">{failed}</p>}
        </div>
      </div>
      {children && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

// --- The library with sharing, for everybody ---
// Guides and Explorers add and share freely; the activity record and the
// ability to stop somebody keep it safe (components/LiveLibraryRecord.tsx).
export function LiveLibraryForGuide({ pairings, sharesShownFor, heading, intro }: {
  pairings: { id: string; ds_name: string }[];
  /** The card's heading on this screen. */
  heading?: string;
  intro?: string;
  /**
   * The pairing whose shares the neighbouring card draws. Only those are left
   * off this shelf. Omitted on the Explorer's screen, where the card shows all.
   */
  sharesShownFor?: string;
}) {
  const [items, setItems] = useState<live.Material[] | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  // What the resource is for: optional, shown under its title.
  const [note, setNote] = useState('');
  // No "kind" question when adding: it is read from the address or the file
  // (anything unsure is a link). It can be changed under Edit, More options.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  // The row asked to be removed: the first tap asks, the second does it.
  const [confirming, setConfirming] = useState('');
  // One line per file being added, so each one's progress or refusal shows.
  const [uploads, setUploads] = useState<{ name: string; state: 'adding' | 'done' | 'failed'; why?: string }[]>([]);
  const uploading = uploads.some((u) => u.state === 'adding');
  // A file dragged over the card: the whole card accepts the drop.
  const [dropping, setDropping] = useState(false);
  // Files fetched while the send panel is open, ready for the share sheet.
  const ready = useRef(new Map<string, File>());
  // The row being edited in place.
  const [editing, setEditing] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editKind, setEditKind] = useState<live.MaterialKind>('link');
  // The row whose send panel is open.
  const [sharing, setSharing] = useState('');
  // One optional note for the send panel, sent with every share from it.
  const [shareNote, setShareNote] = useState('');
  // Search, shown once the shelf is longer than a screen.
  const [find, setFind] = useState('');
  // The kind filter ('' for all), kept apart from the text search.
  const [shelfKind, setShelfKind] = useState<live.MaterialKind | ''>('');
  // What this person has hidden from their shelf, so it can be put back.
  const [putAway, setPutAway] = useState<live.Material[]>([]);
  const [showPutAway, setShowPutAway] = useState(false);
  const { profile } = useLiveSession();

  // Which resources were handed to me, and which pairings already have each one.
  const [alreadyShared, setAlreadyShared] = useState<Map<string, Set<string>>>(new Map());

  const load = useCallback(async () => {
    try {
      const [shelf, off, given] = await Promise.all([
        live.listMaterials(),
        live.listHiddenMaterials(),
        // Best effort: the shelf still works without this.
        live.listSharedWithMe(sharesShownFor).catch(() => [] as live.SharedWithMe[]),
      ]);

      // Leave off the shelf what someone else handed over; it belongs in "Shared with you".
      const mine = new Set(given.filter((g) => g.material.added_by !== profile?.id)
        .map((g) => g.material.id));
      setItems(shelf.filter((m) => !mine.has(m.id)));
      setPutAway(off);
      setError('');
    }
    catch (cause) { setItems([]); setError(message(cause)); }
  }, [profile?.id, sharesShownFor]);

  // Who already has each resource, so the picker can say so.
  const loadShared = useCallback(async () => {
    if (!pairings.length) return;
    try {
      const lists = await Promise.all(pairings.map((p) => live.listShares(p.id)));
      const map = new Map<string, Set<string>>();
      pairings.forEach((p, i) => {
        for (const share of lists[i]) {
          if (!map.has(share.material_id)) map.set(share.material_id, new Set());
          map.get(share.material_id)!.add(p.id);
        }
      });
      setAlreadyShared(map);
    } catch { }
  }, [pairings]);
  useEffect(() => { void loadShared(); }, [loadShared]);
  // Keep it current, or a share made elsewhere would be offered again.
  useKeepUp(KEEP_UP_LIBRARY, loadShared);
  useEffect(() => { void load(); }, [load]);
  useKeepUp(KEEP_UP_LIBRARY, load);

  const add = async () => {
    if (!title.trim() || !url.trim() || busy) return;
    setBusy(true); setError(''); setFlash('');
    try {
      await live.addMaterial({ title, url, kind: kindFromUrl(url) ?? 'link', description: note });
      setTitle(''); setUrl(''); setNote(''); setOpen(false);
      setFlash(`Added \u201c${title.trim()}\u201d. Tap Send to share it.`);
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  /**
   * Add files one at a time, in order, so one refusal cannot stop the rest.
   * Files over the storage limit are refused by name before any upload.
   */
  const addFiles = async (files: File[]) => {
    if (!files.length || uploading) return;
    setError(''); setFlash('');
    setUploads(files.map((f) => ({ name: f.name, state: 'adding' })));
    const added: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      let outcome: { state: 'done' | 'failed'; why?: string };
      if (f.size > live.MAX_RESOURCE_FILE) {
        outcome = { state: 'failed', why: 'Over 10 MB. Share a link to it instead.' };
      } else {
        try {
          await live.addMaterialFile(f);
          outcome = { state: 'done' };
          added.push(f.name);
        } catch (cause) {
          outcome = { state: 'failed', why: message(cause) };
        }
      }
      setUploads((was) => was.map((u, at) => (at === i ? { ...u, ...outcome } : u)));
    }
    if (added.length > 0) {
      setFlash(added.length === 1
        ? `Added \u201c${added[0]}\u201d. Tap Send to share it.`
        : `Added ${added.length} files. Tap Send on any of them to share it.`);
      await load();
    }
    // All added: clear the list and close. Refused files stay with their reason.
    if (added.length === files.length) { setUploads([]); setOpen(false); }
  };

  const startEdit = (m: live.Material) => {
    setEditing(m.id);
    setSharing('');
    setConfirming('');
    setEditTitle(m.title);
    setEditUrl(m.external_url ?? '');
    setEditNote(m.description ?? '');
    setEditKind(m.kind);
    setError(''); setFlash('');
  };

  const saveEdit = async (m: live.Material) => {
    // A file has no link, so only a link's box must be filled.
    const isFile = !!m.file_path;
    if (!editTitle.trim() || (!isFile && !editUrl.trim()) || busy) return;
    setBusy(true); setError(''); setFlash('');
    try {
      await live.updateMaterial(m.id, {
        title: editTitle, url: isFile ? undefined : editUrl, kind: editKind, description: editNote,
      });
      setEditing('');
      setFlash(`Saved the changes to \u201c${editTitle.trim()}\u201d.`);
      await load();
    } catch (cause) { setError(message(cause)); }
    finally { setBusy(false); }
  };

  const remove = async (m: live.Material) => {
    setError(''); setFlash('');
    try {
      const what = await live.deleteMaterial(m.id);
      setConfirming('');
      // Say whether it was deleted for everyone or only hidden from this shelf.
      setFlash(what === 'deleted'
        ? `Deleted \u201c${m.title}\u201d from the church library.`
        : `Took \u201c${m.title}\u201d off your shelf. It is still there for everybody else.`);
      await load();
    } catch (cause) { setError(message(cause)); }
  };

  /** Put back something taken off this person's own shelf. */
  const putBack = async (m: live.Material) => {
    setError(''); setFlash('');
    try {
      await live.restoreMaterial(m.id);
      setFlash(`Put \u201c${m.title}\u201d back on your shelf.`);
      await load();
    } catch (cause) { setError(message(cause)); }
  };

  const sendOut = async (m: live.Material) => {
    setError(''); setFlash('');
    const said = await sendOutMaterial(m, ready.current.get(m.id));
    setFlash(said.flash ?? '');
    setError(said.error ?? '');
  };

  const openSend = (m: live.Material) => {
    if (m.file_path && !ready.current.has(m.id)) {
      live.materialFileForSharing(m)
        .then((f) => { ready.current.set(m.id, f); })
        .catch(() => { });
    }
  };

  // Who may edit or remove a resource. A convenience, not a control: the
  // database enforces it either way.
  // The search matches the title, description and address (or file name).
  const needle = find.trim().toLowerCase();
  const matchesText = (m: live.Material) => !needle
    || m.title.toLowerCase().includes(needle)
    || (m.description ?? '').toLowerCase().includes(needle)
    // A file is remembered by its name.
    || (m.external_url ?? m.file_name ?? '').toLowerCase().includes(needle);
  // Search and kind filter both apply.
  const shown = (items ?? []).filter((m) => matchesText(m) && (!shelfKind || m.kind === shelfKind));

  // Chips only for kinds on the shelf, counted without the search.
  const kindCounts = (items ?? []).reduce((acc, m) => {
    acc[m.kind] = (acc[m.kind] ?? 0) + 1;
    return acc;
  }, {} as Partial<Record<live.MaterialKind, number>>);
  const kindsPresent = (Object.keys(kindCounts) as live.MaterialKind[])
    .sort((a, b) => (kindCounts[b] ?? 0) - (kindCounts[a] ?? 0));

  const canManage = (m: live.Material) =>
    !!profile && (m.added_by === profile.id || profile.role === 'admin' || profile.role === 'executive');

  // Publishing to the whole church is leadership's; the database refuses anyone else.
  const canPublish = profile?.role === 'admin' || profile?.role === 'executive';

  const publish = async (m: live.Material, next: boolean) => {
    setError(''); setFlash('');
    try {
      await live.setMaterialPublished(m.id, next);
      setFlash(next
        ? `\u201c${m.title}\u201d is on the church shelf. Everyone in the church can find it.`
        : `Took \u201c${m.title}\u201d off the church shelf. Whoever you shared it with still has it.`);
      await load();
    } catch (cause) { setError(message(cause)); }
  };

  const share = async (materialId: string, pairingId: string, who: string) => {
    setError(''); setFlash('');
    try {
      // An empty note is sent as undefined, not as an empty string.
      const say = shareNote.trim();
      await live.shareMaterial(materialId, pairingId, say || undefined);
      setFlash(say ? `Shared with ${who}, with your note.` : `Shared with ${who}.`);
      // Mark the name "has it" at once, so a second tap cannot reach the duplicate refusal.
      setAlreadyShared((was) => {
        const next = new Map(was);
        const to = new Set(next.get(materialId) ?? []);
        to.add(pairingId);
        next.set(materialId, to);
        return next;
      });
    } catch (cause) { setError(message(cause)); }
  };

  return (
    <Card className="overflow-hidden p-0">
      {/* The whole card accepts dropped files (not dragged links or text). */}
      <div
        className="relative"
        onDragEnter={(e) => { if (draggingFiles(e)) { e.preventDefault(); setDropping(true); } }}
        onDragOver={(e) => { if (draggingFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={(e) => {
          if (!draggingFiles(e)) return;
          e.preventDefault();
          setDropping(false);
          setOpen(true);
          void addFiles(Array.from(e.dataTransfer.files ?? []));
        }}
      >
      {dropping && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-2 z-10 grid place-items-center rounded-2xl border-2 border-dashed border-teal-600 bg-teal-50/90"
        >
          <p className="text-lg font-extrabold text-teal-800">Drop to add to the shelf</p>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-teal-800/10 wash-teal-sky p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-700 text-xl shadow-sm">📚</span>
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold text-navy">{heading ?? 'Resources'}</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-gray-600">
              {intro ?? 'Videos, readings, music and files to send to the people you walk with.'}
            </p>
          </div>
        </div>
        <Button onClick={() => setOpen((v) => !v)}>{open ? 'Close' : '+ Add'}</Button>
      </div>
      <div className="p-5 sm:p-6">

      <Err msg={error} />
      {flash && <p className="mb-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">{flash}</p>}

      {open && (
        <div className="mb-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
          {/* A file or a link, in one place. Files need nothing filled in; a name or note
             can be added later under Edit. */}
          <FileDrop id="mat-files" onFiles={(files) => void addFiles(files)} busy={uploading} />
          {uploads.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm" aria-live="polite">
              {uploads.map((u, i) => (
                <li key={`${u.name}-${i}`} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="min-w-0 truncate font-semibold text-navy">{u.name}</span>
                  <span className={u.state === 'failed' ? 'font-semibold text-red-700' : u.state === 'done' ? 'font-semibold text-green-800' : 'text-gray-500'}>
                    {u.state === 'adding' ? 'Adding…' : u.state === 'done' ? '✓ Added' : u.why}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="my-4 text-center text-xs font-bold uppercase tracking-wide text-gray-500">or</p>

          {/* The address first; the name and note boxes appear once there is a link. */}
          <label className="block text-sm font-semibold text-navy" htmlFor="mat-url">Paste a link</label>
          <input id="mat-url" value={url}
            onChange={(e) => setUrl(e.target.value)}
            inputMode="url"
            placeholder="https://…"
            className="tap mt-1 w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600" />

          {url.trim() && (
            <>
              <label className="mt-3 block text-sm font-semibold text-navy" htmlFor="mat-title">What is it called</label>
              <input id="mat-title" value={title} onChange={(e) => setTitle(e.target.value)}
                className="tap mt-1 w-full rounded-xl bg-white px-4 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600" />

              <label className="mt-3 block text-sm font-semibold text-navy" htmlFor="mat-note">
                Why it helps <span className="font-normal text-gray-500">(optional)</span>
              </label>
              <textarea id="mat-note" value={note} onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="One line. Who is it for, or why it helps."
                className="tap mt-1 w-full rounded-xl bg-white px-4 py-2 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600" />

              <div className="mt-4">
                <Button onClick={add} disabled={!title.trim() || !url.trim() || busy}>Add the link</Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Search appears above six rows. */}
      {(items?.length ?? 0) > 6 && (
        <div className="mb-3">
          <input
            value={find}
            onChange={(e) => setFind(e.target.value)}
            type="search"
            inputMode="search"
            placeholder="Search the shelf"
            aria-label="Search the library by name or description"
            className="tap w-full rounded-xl bg-gray-100 px-4 text-base outline-none focus:ring-2 focus:ring-teal-600"
          />
        </div>
      )}

      {/* Kind chips appear with the search, and only for kinds the shelf holds. */}
      {kindsPresent.length > 1 && (items?.length ?? 0) > 6 && (
        <div className="thin-scroll -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
          <button
            type="button"
            onClick={() => setShelfKind('')}
            aria-pressed={shelfKind === ''}
            className={`tap-sm shrink-0 rounded-full px-3 text-sm font-semibold ring-1 ${
              shelfKind === ''
                ? 'bg-teal-700 text-white ring-teal-700'
                : 'bg-white text-gray-600 ring-gray-300'
            }`}
          >
            Everything {items?.length ?? 0}
          </button>
          {kindsPresent.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setShelfKind(shelfKind === k ? '' : k)}
              aria-pressed={shelfKind === k}
              className={`tap-sm shrink-0 rounded-full px-3 text-sm font-semibold ring-1 ${
                shelfKind === k
                  ? 'bg-teal-700 text-white ring-teal-700'
                  : 'bg-white text-gray-600 ring-gray-300'
              }`}
            >
              <span aria-hidden>{KIND_ICON[k]}</span> {KIND_LABEL[k]} {kindCounts[k]}
            </button>
          ))}
        </div>
      )}

      {/* When filters empty the list, say which one did it and offer the way back. */}
      {(needle || shelfKind) && (
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-sm text-gray-500">
            {shown.length} of {items?.length ?? 0}
            {shelfKind && ` · ${KIND_LABEL[shelfKind].toLowerCase()}`}
            {needle && ` · matching “${find.trim()}”`}
          </p>
          {shown.length === 0 && (
            <button
              type="button"
              onClick={() => { setFind(''); setShelfKind(''); }}
              className="tap-sm px-1 text-sm font-semibold text-teal-700 underline underline-offset-2"
            >
              Show everything again
            </button>
          )}
        </div>
      )}

      <div className="space-y-2">
        {items === null && <BeaconSpinner inline label="Loading the shelf" className="mt-2" />}
        {items?.length === 0 && !error && (
          <p className="text-sm text-gray-500">
            Nothing here yet. Tap <strong>+ Add</strong>, or drag a file onto this card, to put the first one on.
          </p>
        )}
        {shown.map((m) => (
          <Item key={m.id} m={m}>
            {/* Who already has it, from this person's own shares only. Nothing shown at zero. */}
            {(() => {
              const haveIt = pairings.filter((p) => alreadyShared.get(m.id)?.has(p.id) ?? false);
              if (haveIt.length === 0) return null;

              const first = (n: { ds_name: string }) => n.ds_name.split(' ')[0];
              // Names while they fit, a count when they do not.
              const said =
                haveIt.length === pairings.length
                  ? (pairings.length === 1
                      ? `${first(haveIt[0])} has this`
                      : `All ${pairings.length} have this`)
                  : haveIt.length === 1
                    ? `${first(haveIt[0])} has this`
                    : haveIt.length === 2
                      ? `${first(haveIt[0])} and ${first(haveIt[1])} have this`
                      : `${haveIt.length} of ${pairings.length} have this`;

              return (
                <span className="w-full text-xs font-semibold text-green-800">
                  &#10003; {said}
                </span>
              );
            })()}
            {/* Say when the whole church can see it too. */}
            {m.is_published && (
              <span className="w-full text-xs font-semibold text-sky-800">On the church shelf</span>
            )}

            {sharing === m.id ? (
              /* The send panel: an optional note, the people to send to (it stays open for
                 several), and sending outside the app. */
              <div className="w-full rounded-xl bg-white p-3 ring-1 ring-teal-700/20">
                {/* The note sits above the names, so it is seen before sending. */}
                <label className="block text-xs font-semibold text-gray-600" htmlFor={`share-note-${m.id}`}>
                  Say why, if you like
                </label>
                <input
                  id={`share-note-${m.id}`}
                  value={shareNote}
                  onChange={(e) => setShareNote(e.target.value)}
                  /* The column's own limit. */
                  maxLength={1000}
                  placeholder="They will see it."
                  className="tap mt-1 w-full rounded-xl bg-slate-50 px-3 text-sm ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
                />
                <p className="mt-3 text-xs font-semibold text-gray-600">Send to</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {pairings.map((p) => {
                    const has = alreadyShared.get(m.id)?.has(p.id) ?? false;
                    return (
                      <button
                        key={p.id}
                        disabled={has}
                        onClick={() => void share(m.id, p.id, p.ds_name)}
                        className={has
                          ? 'tap-sm rounded-full bg-green-50 px-3 text-sm font-semibold text-green-800 ring-1 ring-green-200'
                          : 'tap-sm rounded-full bg-teal-700 px-4 text-sm font-bold text-white'}
                      >
                        {has ? `✓ ${p.ds_name.split(' ')[0]} has it` : p.ds_name.split(' ')[0]}
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-black/5 pt-3">
                  <SendOut onSend={() => void sendOut(m)} />
                  <button
                    onClick={() => { setSharing(''); setShareNote(''); }}
                    className="tap-sm ml-auto px-3 text-sm font-semibold text-gray-600 underline"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : editing === m.id ? (
              /* Edit: name, note and (for a link) the address; rarer settings under "More options". */
              <div className="mt-1 w-full rounded-xl bg-white p-3 ring-1 ring-navy/10">
                <label className="block text-xs font-semibold text-navy" htmlFor={`edit-title-${m.id}`}>
                  What it is called
                </label>
                <input
                  id={`edit-title-${m.id}`}
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="tap mt-1 w-full rounded-xl bg-slate-50 px-3 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
                />
                {!m.file_path && (
                  <>
                    <label className="mt-2 block text-xs font-semibold text-navy" htmlFor={`edit-url-${m.id}`}>
                      Link
                    </label>
                    <input
                      id={`edit-url-${m.id}`}
                      value={editUrl}
                      onChange={(e) => setEditUrl(e.target.value)}
                      inputMode="url"
                      placeholder="https://…"
                      className="tap mt-1 w-full rounded-xl bg-slate-50 px-3 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
                    />
                  </>
                )}
                <label className="mt-2 block text-xs font-semibold text-navy" htmlFor={`edit-note-${m.id}`}>
                  Why it helps <span className="font-normal text-gray-500">(optional)</span>
                </label>
                <textarea
                  id={`edit-note-${m.id}`}
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  rows={2}
                  placeholder="One line. Who is it for, or why it helps."
                  className="tap mt-1 w-full rounded-xl bg-slate-50 px-3 py-2 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
                />
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-navy underline underline-offset-2">
                    More options
                  </summary>
                  <div className="mt-2 space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-navy" htmlFor={`edit-kind-${m.id}`}>
                        Show it as
                      </label>
                      <select
                        id={`edit-kind-${m.id}`}
                        value={editKind}
                        onChange={(e) => setEditKind(e.target.value as live.MaterialKind)}
                        className="tap mt-1 w-full rounded-xl bg-slate-50 px-3 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600"
                      >
                        <option value="link">Link</option>
                        <option value="video">Video</option>
                        <option value="audio">Audio or music</option>
                        <option value="pdf">PDF</option>
                        <option value="image">Picture</option>
                        {m.file_path && <option value="file">Document</option>}
                      </select>
                    </div>
                    {canPublish && (
                      /* Publishing to the whole church is leadership's. */
                      <button
                        type="button"
                        onClick={() => void publish(m, !m.is_published)}
                        className="tap-sm text-sm font-semibold text-navy underline"
                      >
                        {m.is_published ? 'Take it off the church shelf' : 'Put it on the church shelf'}
                      </button>
                    )}
                  </div>
                </details>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button onClick={() => void saveEdit(m)} disabled={!editTitle.trim() || (!m.file_path && !editUrl.trim()) || busy}>
                    {busy ? 'Saving…' : 'Save'}
                  </Button>
                  <Button variant="ghost" onClick={() => setEditing('')}>Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                {pairings.length === 0 ? (
                  /* With nobody in the app to send to, offer the phone's share sheet. */
                  <SendOut onSend={() => void sendOut(m)} />
                ) : (
                  <button
                    /* Clear the note when the panel opens, so it never carries over to another resource. */
                    onClick={() => { setSharing(m.id); setConfirming(''); setShareNote(''); openSend(m); }}
                    className="tap-sm rounded-full bg-teal-700 px-4 text-sm font-bold text-white"
                  >
                    {/* "Send to John" with one person; "Send" with several. */}
                    {pairings.length === 1 ? `Send to ${pairings[0].ds_name.split(' ')[0]}` : 'Send'}
                  </button>
                )}
                {/* Send, Edit and Delete on the row, with the irreversible one last. */}
                {canManage(m) && (
                  <button
                    type="button"
                    onClick={() => startEdit(m)}
                    className="tap-sm px-2 text-sm font-semibold text-navy underline underline-offset-2"
                  >
                    Edit
                  </button>
                )}
                {/* Delete for the owner and leaders; for anyone else it hides from their own
                   shelf. The sentence below says which before the tap. */}
                {confirming === m.id ? (
                  <div className="flex w-full flex-wrap items-center gap-2 rounded-xl bg-white p-3 ring-1 ring-red-200">
                    <p className="w-full text-sm font-semibold text-gray-700">
                      {canManage(m)
                        ? `This takes it out of the church library, for everybody${m.file_path ? ', and deletes the file' : ''}.`
                        : 'This takes it off your shelf only. Everybody else keeps it, and you can put it back.'}
                    </p>
                    <button
                      onClick={() => void remove(m)}
                      className="tap-sm rounded-full bg-white px-3 text-sm font-bold text-red-700 ring-1 ring-red-200"
                    >
                      {canManage(m) ? 'Yes, delete it' : 'Yes, hide it'}
                    </button>
                    <button
                      onClick={() => setConfirming('')}
                      className="tap-sm px-2 text-sm font-semibold text-gray-600 underline"
                    >
                      Keep it
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setConfirming(m.id); setSharing(''); }}
                    className="tap-sm px-2 text-sm font-semibold text-red-700 underline underline-offset-2"
                  >
                    {canManage(m) ? 'Delete' : 'Hide'}
                  </button>
                )}
              </>
            )}
          </Item>
        ))}
      </div>

      {/* The way back, shown only when something is hidden. */}
      {putAway.length > 0 && (
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-navy/5">
          <button
            onClick={() => setShowPutAway((v) => !v)}
            className="text-sm font-semibold text-navy underline underline-offset-2"
          >
            {showPutAway
              ? 'Hide these again'
              : `You have hidden ${putAway.length} from your shelf. Show ${putAway.length === 1 ? 'it' : 'them'}.`}
          </button>
          {showPutAway && (
            <div className="mt-3 space-y-2">
              {putAway.map((m) => (
                <Item key={m.id} m={m}>
                  <button
                    onClick={() => void putBack(m)}
                    className="rounded-full bg-white px-3 py-1 text-xs font-bold text-navy ring-1 ring-black/10"
                  >
                    Put it back
                  </button>
                </Item>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
      </div>
    </Card>
  );
}

// --- What somebody has been handed, by either side of a pairing ---
export function LiveSharedWithMe({ pairingId, heading, intro }: {
  /** One relationship only. Left out on the Explorer's screen, which has one. */
  pairingId?: string;
  heading?: string;
  intro?: string;
} = {}) {
  const [items, setItems] = useState<live.SharedWithMe[] | null>(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  // An Explorer without a Guide sees only this card, so sharing outside the app is here too.
  const sendOut = async (m: live.Material) => {
    setError(''); setFlash('');
    const said = await sendOutMaterial(m);
    setFlash(said.flash ?? '');
    setError(said.error ?? '');
  };

  useEffect(() => {
    let alive = true;
    // Only what somebody else handed you, not everything you can read.
    live.listSharedWithMe(pairingId)
      .then((r) => { if (alive) { setItems(r); setError(''); } })
      .catch((cause) => { if (alive) { setItems([]); setError(message(cause)); } });
    return () => { alive = false; };
  }, [pairingId]);

  if (items === null) return null;
  if (items.length === 0 && !error) return null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-blue-800/10 wash-sky-teal p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-700 text-xl shadow-sm">🎁</span>
          <div>
            <h2 className="text-xl font-extrabold text-navy">{heading ?? 'Shared with you'}</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-gray-600">
              {intro ?? 'Handed to you by somebody walking with you, for whenever you want it.'}
            </p>
          </div>
        </div>
      </div>
      <div className="p-5 sm:p-6">
      <Err msg={error} />
      {flash && <p className="mt-3 rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">{flash}</p>}
      <div className="mt-3 space-y-2">
        {items.map((s) => (
          <Item key={s.share_id} m={s.material}>
            {/* Who gave it, per row. */}
            <span className="text-xs font-semibold text-blue-700">
              from {s.shared_by_name.split(' ')[0]}
            </span>
            {s.note && <span className="text-xs text-gray-600">&ldquo;{s.note}&rdquo;</span>}
            <SendOut onSend={() => void sendOut(s.material)} />
          </Item>
        ))}
      </div>
      </div>
    </Card>
  );
}
