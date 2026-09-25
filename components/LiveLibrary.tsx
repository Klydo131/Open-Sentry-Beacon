'use client';

// The church library, against a real database. See migration 0008.
//
// A resource is a title and a LINK, or a FILE kept in the church's own storage
// (20260925100000). What it must never be is a file held in one person's
// browser: that was a bug the sibling deployment shipped -- a Guide "shared" a
// file from IndexedDB, an Explorer received a title with nothing behind it, and
// the player sat at 0:00. A link opens on any device, and so does a file the
// church keeps; a file in IndexedDB opens on one.
//
// The Explorer's view is not a filtered copy of the Guide's. Both call the same
// function and the database returns different rows, because the policy already
// knows who is asking. A filter here would protect nobody.

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

/**
 * What each kind is called when it is a control rather than a badge.
 *
 * Plural, because a filter names a group and not one thing: somebody scanning a
 * row of chips is choosing between piles, and "Video" beside "Links" reads as
 * an odd one out.
 */
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
 * Hand a resource to somebody who is not in the app.
 *
 * A LINK needs no upload and no hosting: it passes the address to the phone's
 * own share sheet -- WhatsApp, Messenger, a text, another device -- and where
 * there is no share sheet (most desktops) it copies the address and says so.
 *
 * A FILE is handed over as the file itself, so the person at the other end gets
 * the PDF and not a link to a private shelf they cannot open. Where the device
 * cannot share files it is saved to this computer instead, to attach wherever
 * the person likes. Either way they are TOLD what happened: a button that
 * silently did nothing is the failure lib/share.ts exists to have fixed once.
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
 * The whole of "share outside the app", for a link or a file, as the sentence
 * to show afterwards. One function for both cards, so the shelf and "Shared
 * with you" cannot drift into saying different things about the same button.
 *
 * `ready` is the file already fetched, when the caller had the chance: a phone
 * only opens its share sheet while the tap is fresh, and a download in between
 * can outlast that. Without it the file is fetched here, and if the sheet then
 * refuses, the file is saved instead of lost.
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

/**
 * Where a link goes, in the words a person uses for it: "youtube.com", not
 * "https://www.youtube.com/watch?v=…". The whole address was drawn under every
 * title, which is where somebody deciding whether to tap a link looks -- and a
 * row of grey query strings is the most technical thing on a screen meant for
 * people who are not. The site answers "where does this go"; the rest of the
 * address answers nothing they are asking. It is still searched in full.
 */
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
  // A FILE IS OPENED BY ASKING FOR A FRESH ADDRESS, never one kept from
  // earlier: a signed address expires, and a stored one becomes a dead link
  // with nothing to explain it. The same rule as every other file in the app.
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
              /* min-h-0: every button is 56px tall by default, which put a
                 blank line under a file's title that a link's title does not
                 have. It reads as the title, the same as a link. */
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
          {/* Where it goes, in plain sight -- as a site, see siteOf, or as the
              file somebody added. */}
          <p className="mt-0.5 truncate text-xs text-gray-400">{whereItIs(m)}</p>
          {failed && <p className="mt-1 text-xs font-semibold text-red-700">{failed}</p>}
        </div>
      </div>
      {children && <div className="mt-2 flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The library, with sharing. For everybody, not only a Guide.
// ---------------------------------------------------------------------------
//
// AN EXPLORER MAY ADD AND SHARE, and until today they could not. The rule was
// that the library is "what the church offers, not a place anybody can post
// into", which is a defensible position and is not the one the owner wants: a
// Guide and an Explorer share links with each other freely, without asking
// anybody. What makes that safe is the record afterwards and the ability to
// stop somebody, not a gate in front of every share. See
// components/LiveLibraryRecord.tsx.
//
// The component keeps its old name because a dozen call sites use it and
// renaming them would be a large diff to settle a comment.
export function LiveLibraryForGuide({ pairings, sharesShownFor, heading, intro }: {
  pairings: { id: string; ds_name: string }[];
  /**
   * What this card is for ON THIS SCREEN. The same shelf is the church's
   * Resources in the Office, "Send John something" on John's page and "Your
   * links" on an Explorer's own; one heading for all three described none of
   * them.
   */
  heading?: string;
  intro?: string;
  /**
   * WHICH SHARES ARE DRAWN IN THE CARD NEXT TO THIS SHELF, if any.
   *
   * The shelf subtracts rows somebody else handed over, because those belong in
   * the "Shared with you" card and not here. That subtraction has to be scoped
   * the same way the card is or something disappears from both: a Guide's
   * per-Explorer screen shows one relationship, so a resource a DIFFERENT
   * Explorer shared must stay on the shelf, where it is an ordinary church
   * library row, rather than vanish because a card on another tab has it.
   *
   * Left out on the Explorer's screen, where the card shows everything.
   */
  sharesShownFor?: string;
}) {
  const [items, setItems] = useState<live.Material[] | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  // WHAT IT IS FOR, WHICH THE FORM NEVER ASKED FOR. `addMaterial` has taken a
  // description since the day it was written, `updateMaterial` takes one, and
  // the row draws one -- and no screen ever offered a box to type it in. So
  // every resource added by a real person since launch is a bare title over a
  // grey address, and the only items on the shelf with a line explaining
  // themselves are the ones that were seeded.
  //
  // That matters more here than on most screens. A link handed to somebody
  // hesitant, with nothing saying why it is worth their time, is a link nobody
  // taps. The field existed; the question was missing.
  const [note, setNote] = useState('');
  // NO "KIND" QUESTION WHEN ADDING. The form asked Link, Video, Audio, PDF or
  // Picture from a dropdown, which is a filing question somebody pasting a
  // link has no reason to answer -- and the address already answers it:
  // kindFromUrl reads youtube, .mp3, .pdf and the rest. Anything it is not sure
  // about is a link, which is always true. A file's kind is read from the file.
  // The choice is still there under Edit -> More options for the rare person
  // who wants a YouTube talk filed as audio.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  // Which row has been asked to go. Removing a resource cannot be undone and
  // the shelf is a dense list, so the first tap asks and the second does it —
  // rather than a browser confirm() dialog, which a phone renders as a system
  // box nobody reads and iOS sometimes suppresses entirely.
  const [confirming, setConfirming] = useState('');
  // FILES BEING ADDED, one line each, so somebody who dropped five sees five
  // names go from "Adding" to done -- or which one was refused, and why --
  // rather than one spinner that says nothing about which.
  const [uploads, setUploads] = useState<{ name: string; state: 'adding' | 'done' | 'failed'; why?: string }[]>([]);
  const uploading = uploads.some((u) => u.state === 'adding');
  // A FILE BEING DRAGGED OVER THE CARD. The whole card takes a drop, not only
  // the box inside "+ Add": on a computer, dragging a file at the shelf it is
  // meant for is the most obvious thing a person can do with it.
  const [dropping, setDropping] = useState(false);
  // THE FILE, FETCHED WHILE THE SEND PANEL IS OPEN. A phone opens its share
  // sheet only while the tap that asked is fresh, and a download in between can
  // outlast that; fetched ahead, the file is in hand when "Share outside the
  // app" is pressed. See sendOutMaterial.
  const ready = useRef(new Map<string, File>());
  // Which row is open for correction, and the fields while it is. Editing in
  // place rather than in a dialog: the shelf is the context, and a dialog on a
  // phone covers the thing being described.
  const [editing, setEditing] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editKind, setEditKind] = useState<live.MaterialKind>('link');
  // WHICH ROW IS OFFERING TO SHARE. Every row used to draw one button per
  // person you walk with -- five Explorers meant five buttons, plus share
  // outside, plus edit, plus remove: EIGHT controls under every single item.
  // On a phone the thing somebody came to read was buried under the things
  // they might do with it, and it got worse as the church grew. One control
  // that opens the list is the same number of taps to share and four fewer
  // things to read when you are not sharing.
  const [sharing, setSharing] = useState('');
  // WHY YOU ARE SENDING IT, WHICH IS THE PART THAT WAS MISSING.
  //
  // `material_shares.note` has existed since migration 0008, `shareMaterial`
  // has taken a note since it was written, and the Explorer's card RENDERS one
  // in quotation marks under the title. The Guide's screen never passed it. So
  // every share ever written carried an empty note -- not because Guides
  // skipped it, but because there was no box, and the receiving half of the
  // feature had been drawing a field that could not be filled.
  //
  // That is the difference between a Guide and a bookmark. "Here is a link" and
  // "watch the first ten minutes before Thursday, it is the bit we got stuck
  // on" are the same row in the database and not remotely the same thing to
  // receive.
  //
  // ONE NOTE FOR THE WHOLE PICKER, NOT ONE PER PERSON. A Guide sending the same
  // resource to three Explorers almost always has the same reason, so it is
  // typed once and rides along with whoever is tapped afterwards. Per-person
  // notes would mean opening and closing the picker three times to say three
  // things, which is a worse version of the bug that made the picker stay open.
  //
  // OPTIONAL, AND NOT IN THE WAY. The rule the add form already states: making
  // it required would stop somebody sharing a link they are in a hurry about,
  // and a link with no note still beats no link. Type nothing and sharing is
  // exactly the two taps it was before this existed.
  const [shareNote, setShareNote] = useState('');
  // SEARCH, ONCE THE SHELF IS LONGER THAN A SCREEN. Below a handful of rows a
  // box is one more thing to read on the way to the row you can already see.
  // The same rule and the same threshold as Approved accounts.
  const [find, setFind] = useState('');
  // WHICH PILE, or '' for all of them. Separate from the search box rather than
  // folded into it: "video" typed into a search reads the WORD video in a title
  // and a description, which is a different question from "show me the videos"
  // and answers it wrong in both directions.
  // Named for the shelf, not just `kind`: `kind` is what a resource IS, and
  // this is what somebody is looking FOR.
  const [shelfKind, setShelfKind] = useState<live.MaterialKind | ''>('');
  // What this person has taken off their own shelf, and whether they are
  // looking at it. A hide with no way back is a trap, and an undo that lives
  // only in the seconds after the tap is barely an undo at all.
  const [putAway, setPutAway] = useState<live.Material[]>([]);
  const [showPutAway, setShowPutAway] = useState(false);
  const { profile } = useLiveSession();

  // WHICH RESOURCES SOMEBODY ELSE HANDED TO ME, and which pairings already
  // have each one. Two different jobs, one query.
  const [alreadyShared, setAlreadyShared] = useState<Map<string, Set<string>>>(new Map());

  const load = useCallback(async () => {
    try {
      const [shelf, off, given] = await Promise.all([
        live.listMaterials(),
        live.listHiddenMaterials(),
        // Soft: the shelf is still a shelf without this, so a failure here
        // must not empty the room.
        live.listSharedWithMe(sharesShownFor).catch(() => [] as live.SharedWithMe[]),
      ]);

      // THE SHELF AND "SHARED WITH YOU" MUST NOT BE THE SAME LIST.
      //
      // listMaterials() returns everything the caller may READ, and the policy
      // makes that, for an Explorer, their own additions plus whatever was
      // shared into their pairings. So on the Explorer's screen this card and
      // the card underneath it drew the identical rows, under two headings that
      // promised different things. Reported as "the shared sources for Explorer
      // also appears in its shared sources location which is weird to look and
      // not helpful".
      //
      // A row I added is mine and belongs on my shelf even after I have shared
      // it. A row whose only claim on me is that SOMEBODY ELSE handed it over
      // belongs in the other card and nowhere else.
      const mine = new Set(given.filter((g) => g.material.added_by !== profile?.id)
        .map((g) => g.material.id));
      setItems(shelf.filter((m) => !mine.has(m.id)));
      setPutAway(off);
      setError('');
    }
    catch (cause) { setItems([]); setError(message(cause)); }
  }, [profile?.id, sharesShownFor]);

  // WHO ALREADY HAS EACH RESOURCE, so the picker can say so instead of letting
  // somebody tap a name and be told "That is already shared with them."
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
    } catch { /* the picker still works without it */ }
  }, [pairings]);
  useEffect(() => { void loadShared(); }, [loadShared]);
  // AND KEEP IT UP TO DATE. This map is what puts "has it" on a name, and it
  // was read once and never again -- so a resource shared from another device,
  // or by the Explorer at the other end, left the picker offering a tap that
  // the unique index would refuse. Found by tightening the check that every
  // loader on a live screen is re-run, rather than by anybody hitting it.
  useKeepUp(KEEP_UP_LIBRARY, loadShared);
  useEffect(() => { void load(); }, [load]);
  // The screen keeps up when somebody else changes something.
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
   * Put files on the shelf: dropped on the card, dropped in the box, or chosen.
   *
   * ONE AT A TIME, IN ORDER, so the list underneath fills in the order the
   * files were given and one refusal cannot take the others down with it. A
   * file too big for the church's storage is refused here, by name, before any
   * of it is sent: finding out after a slow upload on a phone is the worst
   * time to find out.
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
    // Everything went: the list has said what it had to, and the form closes.
    // Anything refused stays on screen with its reason.
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
    // A file has no link to correct, so only a link's box has to be filled.
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
      // SAY WHICH OF THE TWO HAPPENED. One took it from everybody and the other
      // took it from one shelf, and whoever pressed the button is the person
      // who most needs to know which.
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

  /** Send it out of the app: WhatsApp, Messenger, a text, another device. See sendOutMaterial. */
  const sendOut = async (m: live.Material) => {
    setError(''); setFlash('');
    const said = await sendOutMaterial(m, ready.current.get(m.id));
    setFlash(said.flash ?? '');
    setError(said.error ?? '');
  };

  /** Open the send panel, and start fetching a file so it is in hand for the share sheet. */
  const openSend = (m: live.Material) => {
    if (m.file_path && !ready.current.has(m.id)) {
      live.materialFileForSharing(m)
        .then((f) => { ready.current.set(m.id, f); })
        .catch(() => { /* fetched again when pressed, and saved if the sheet refuses */ });
    }
  };

  // WHOSE RESOURCE IT IS. A convenience, not a control: `materials_edit` and
  // `materials_drop` both let the person who added it and anybody who manages
  // the church act on it, and the database refuses everybody else whatever this
  // draws. One rule for both buttons, because the two policies are the same
  // sentence and a screen that split them would drift from the database the
  // first time one of them changed.
  // WHAT THE SEARCH ACTUALLY MATCHES. The title, the description and the
  // address (or a file's name), because all three are things a person remembers a resource by --
  // "the one about baptism", "the Ellen White one", "that youtube video". A
  // search that only read titles would miss the two-thirds of those.
  const needle = find.trim().toLowerCase();
  const matchesText = (m: live.Material) => !needle
    || m.title.toLowerCase().includes(needle)
    || (m.description ?? '').toLowerCase().includes(needle)
    // A file has no address; its own name is what somebody remembers it by.
    || (m.external_url ?? m.file_name ?? '').toLowerCase().includes(needle);
  // BOTH, NOT EITHER. A person who has typed a word and then tapped Videos is
  // narrowing twice on purpose; an OR would widen the list at the moment they
  // asked for less of it.
  const shown = (items ?? []).filter((m) => matchesText(m) && (!shelfKind || m.kind === shelfKind));

  // ONLY THE PILES THAT EXIST, and how big each one is.
  //
  // A chip for a kind nothing on the shelf has is a control that can only ever
  // empty the screen, and this church's shelf has three of the five kinds. The
  // counts ignore the search box: a chip that changed its number as somebody
  // typed would be measuring the search rather than the shelf, and the point of
  // it is to say what is THERE.
  const kindCounts = (items ?? []).reduce((acc, m) => {
    acc[m.kind] = (acc[m.kind] ?? 0) + 1;
    return acc;
  }, {} as Partial<Record<live.MaterialKind, number>>);
  const kindsPresent = (Object.keys(kindCounts) as live.MaterialKind[])
    .sort((a, b) => (kindCounts[b] ?? 0) - (kindCounts[a] ?? 0));

  const canManage = (m: live.Material) =>
    !!profile && (m.added_by === profile.id || profile.role === 'admin' || profile.role === 'executive');

  // PUTTING SOMETHING IN FRONT OF THE WHOLE CHURCH IS A DIFFERENT ACT from
  // correcting a typo on it, so it is a different test. Leadership only, and
  // the database refuses everybody else whatever this draws -- see the trigger
  // in migration 20260908120000. Drawing it for a Guide would only produce a
  // button that fails.
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
      // Trimmed to undefined rather than sent as an empty string: the column is
      // nullable and a row of whitespace would draw empty quotation marks on
      // the Explorer's card.
      const say = shareNote.trim();
      await live.shareMaterial(materialId, pairingId, say || undefined);
      setFlash(say ? `Shared with ${who}, with your note.` : `Shared with ${who}.`);
      // So the name turns into "has it" straight away rather than after a
      // reload, and a second tap cannot reach the duplicate refusal.
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
      {/* THE WHOLE CARD TAKES A DROP. Dragging a file from the desktop onto the
          shelf is the most obvious thing a person can do with it, so the box
          inside "+ Add" is not the only place that works. Only files: a link or
          a piece of text dragged across is left alone. */}
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
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-teal-800/10 bg-gradient-to-r from-teal-50 via-white to-sky-50 p-5 sm:p-6">
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
          {/* A FILE OR A LINK, IN ONE PLACE. The file box first, because
              "I cannot even upload files in the resources" is why this form
              changed: drag them in or choose them, and each one goes on the
              shelf named after itself -- nothing to fill in. A better name, or
              a line saying why, can be given afterwards under Edit. */}
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

          <p className="my-4 text-center text-xs font-bold uppercase tracking-wide text-gray-400">or</p>

          {/* THE ADDRESS FIRST, because it is the thing in somebody's hand: they
              have just copied it. The name and the reason appear once there is
              a link to name -- until then they are two boxes in the way of
              somebody who came to add a file. The kind is read from the
              address. */}
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
              {/* OPTIONAL, AND WORTH ASKING FOR ANYWAY. Making it required would
                  stop somebody adding a link they are in a hurry about, and a
                  link with no note still beats no link. The placeholder shows
                  the shape of a useful answer rather than describing one. */}
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

      {/* SEARCH, ONCE THERE IS SOMETHING TO SEARCH. Below six rows a box is one
          more thing to read on the way to the row already on screen; at forty
          it is the only way to reach one without scrolling past thirty-nine.
          Same threshold and same wording as Approved accounts. */}
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

      {/* THE PILES, ONLY ON A SHELF LONG ENOUGH TO NEED THEM. Chips on a shelf
          of four were a row of controls to read past to reach four things you
          could already see; they arrive with the search box, at the same size,
          for the same reason. And only for kinds the shelf actually holds. */}
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

      {/* WHAT THE TWO CONTROLS DID, TOGETHER. When it comes to nothing it says
          which of the two emptied the shelf, and offers the way back -- an
          empty list with no explanation reads as a broken library. */}
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
            {/* WHO ALREADY HAS IT, ON THE ROW. Built from this person's OWN
                shares, pairing by pairing (`listShares` reads through the
                `shares_read` policy, so it only ever holds pairings they are
                in) -- which is why this is safe where a church-wide "shared 7
                times" count is not. Silent at zero: a "not shared yet" badge on
                a fresh shelf says nothing anybody cannot already see. */}
            {(() => {
              const haveIt = pairings.filter((p) => alreadyShared.get(m.id)?.has(p.id) ?? false);
              if (haveIt.length === 0) return null;

              const first = (n: { ds_name: string }) => n.ds_name.split(' ')[0];
              // NAMES WHILE THEY FIT, A COUNT WHEN THEY DO NOT.
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
            {/* WHO CAN SEE THIS BESIDES THE PEOPLE YOU GAVE IT TO, said only on
                the rows where it is true -- as a line of text, not a lozenge that
                looked like one more button. */}
            {m.is_published && (
              <span className="w-full text-xs font-semibold text-sky-800">On the church shelf</span>
            )}

            {sharing === m.id ? (
              /* THE SEND PANEL. Everything about sending, and nothing else:
                 why (optional), who, or somewhere outside the app. It stays open
                 while names are tapped, so several people can be given it, and
                 somebody who already has it is shown as having it rather than
                 offered a tap the database would refuse. */
              <div className="w-full rounded-xl bg-white p-3 ring-1 ring-teal-700/20">
                {/* THE NOTE, ABOVE THE NAMES ON PURPOSE: below them it is a box
                    you notice after the share has already gone. */}
                <label className="block text-xs font-semibold text-gray-600" htmlFor={`share-note-${m.id}`}>
                  Say why, if you like
                </label>
                <input
                  id={`share-note-${m.id}`}
                  value={shareNote}
                  onChange={(e) => setShareNote(e.target.value)}
                  /* The column's own limit, so a long note is stopped by the box
                     rather than by an error after the tap. */
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
                  {/* OUT OF THE APP: a mother, a neighbour, a group chat -- the
                      people an Explorer actually wants to send a good link to,
                      none of whom have accounts. */}
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
              /* EDIT: the name and why it helps, and for a link the link. The
                 rare settings -- how it is filed, and the church shelf -- are
                 folded under "More options", so correcting a typo is three
                 boxes and a Save, not a settings page. */
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
                {/* A file has no link to correct: it IS the thing. */}
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
                      /* Putting something in front of the whole church is
                         leadership's, and the database refuses anybody else. */
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
                  /* Nobody in the app to hand it to yet, so the one way to send
                     it is the one that works: the phone's own share sheet. */
                  <SendOut onSend={() => void sendOut(m)} />
                ) : (
                  <button
                    /* The note is cleared when the panel OPENS, not only when it
                       closes: leaving it would carry the reason for one resource
                       onto the next, which is a wrong sentence on somebody
                       else's link. */
                    onClick={() => { setSharing(m.id); setConfirming(''); setShareNote(''); openSend(m); }}
                    className="tap-sm rounded-full bg-teal-700 px-4 text-sm font-bold text-white"
                  >
                    {/* The name when there is one person: "Send to John" says
                        who, where "Send" alone does not. With several it is
                        "Send", and the panel names them -- "Send to 2 people"
                        was too wide to share a phone's row with Edit and
                        Delete, and pushed Delete onto a line of its own. The
                        button is only drawn when there is somebody to send to. */}
                    {pairings.length === 1 ? `Send to ${pairings[0].ds_name.split(' ')[0]}` : 'Send'}
                  </button>
                )}
                {/* EVERY CONTROL SAYS WHAT IT DOES, ON THE ROW. They sat behind
                    one "More" button, and "easy to add, easy to delete" is not
                    a button that has to be found first. Three at most: Send,
                    Edit, and the red one last, so the control that cannot be
                    undone is never the first a thumb finds. */}
                {canManage(m) && (
                  <button
                    type="button"
                    onClick={() => startEdit(m)}
                    className="tap-sm px-2 text-sm font-semibold text-navy underline underline-offset-2"
                  >
                    Edit
                  </button>
                )}
                {/* DELETE, OR HIDE: the same button does two different things.
                    Leadership and whoever added it delete the row; anybody else
                    takes it off their OWN shelf and leaves it on everybody's.
                    deleteMaterial asks the database which it may do, and the
                    sentence below says which BEFORE the tap. */}
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

      {/* THE WAY BACK. Only drawn when there is something to come back to, so
          nobody who has never hidden anything is asked to think about it. */}
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

// ---------------------------------------------------------------------------
// What somebody has been handed. BOTH WAYS.
// ---------------------------------------------------------------------------
//
// Reported by a Guide, looking at one Explorer's Resources tab: "As a guide I
// can't see what source or resource shared by the Explorer here."
//
// Nothing was wrong in the database. `shares_create` has let either end of a
// pairing share since the library was opened up, `shares_read` is
// `in_pairing(pairing_id)` so both ends may read what was shared into it, and
// the rows were being written. This card -- the only thing in the app that
// draws a share -- was mounted on the Explorer's screen alone.
//
// It was worse than merely absent. The shelf beside it SUBTRACTS rows somebody
// else handed over, so that they appear here instead. On a Guide's screen the
// subtraction ran and nothing drew the result: what an Explorer shared was
// taken off the Guide's shelf and shown nowhere at all. That subtraction came
// in yesterday with the fix for the Explorer's duplicate card, so a share from
// an Explorer went from indistinguishable to invisible.
// ---------------------------------------------------------------------------
export function LiveSharedWithMe({ pairingId, heading, intro }: {
  /** One relationship only. Left out on the Explorer's screen, which has one. */
  pairingId?: string;
  heading?: string;
  intro?: string;
} = {}) {
  const [items, setItems] = useState<live.SharedWithMe[] | null>(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  // AN EXPLORER WITH NO GUIDE YET SEES ONLY THIS CARD -- the shelf above it is
  // drawn beside a pairing and there is not one. So the way to hand a link to
  // somebody outside the app has to be here too, or the person the church has
  // not paired yet is the one person who cannot pass anything on.
  const sendOut = async (m: live.Material) => {
    setError(''); setFlash('');
    const said = await sendOutMaterial(m);
    setFlash(said.flash ?? '');
    setError(said.error ?? '');
  };

  useEffect(() => {
    let alive = true;
    // WHAT SOMEBODY HANDED YOU, not everything you are allowed to read.
    // This card used to call listMaterials(), which for an Explorer is their
    // own additions PLUS what was shared with them -- so it showed them their
    // own resources under a heading saying their Guide had sent them, and it
    // showed exactly the same rows as the shelf card directly above it.
    live.listSharedWithMe(pairingId)
      .then((r) => { if (alive) { setItems(r); setError(''); } })
      .catch((cause) => { if (alive) { setItems([]); setError(message(cause)); } });
    return () => { alive = false; };
  }, [pairingId]);

  if (items === null) return null;
  if (items.length === 0 && !error) return null;

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-blue-800/10 bg-gradient-to-r from-sky-50 via-white to-teal-50 p-5 sm:p-6">
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
            {/* WHO GAVE IT TO YOU. The card claimed "from your Guide" for
                everything, including an Explorer's own rows. Now it says who,
                per row, because with two Guides or a Director in the picture
                the answer is not always the same person. */}
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
