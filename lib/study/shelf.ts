'use client';

// What the study room knows about each page beyond its writing: BlockSuite's
// DocMeta (title, tags, dates, favourite) plus a stored preview line and a
// trash date. They live in the workspace document, so they sync with it.

import type { DocMeta, WorkspaceMeta } from '@blocksuite/store';

/** DocMeta plus the two things a browsable shelf needs and BlockSuite has not. */
export type ShelfMeta = DocMeta & {
  /** The page's first line or so, stored so the list never has to load every page. */
  preview?: string;
  /** When it was put in the trash. Absent means it is not in the trash. */
  trashedAt?: number;
  /** `YYYY-MM-DD` when this is that day's journal page (matched by date, so a rename keeps it). */
  journalDate?: string;
  /** The page's folder, by name; one folder per page (tags cover the rest). Absent means none. */
  folder?: string;
};

/** A saved view of the shelf (tags and words). Pages match it; they are never put in it. */
export type Collection = {
  id: string;
  name: string;
  /** Tags a page must carry. Empty means the tags do not narrow it. */
  tags: string[];
  /** Words that must appear in the title, the preview or a tag. */
  words: string;
};

/** One page as the shelf draws it. */
export type ShelfEntry = {
  id: string;
  /** What to show. Never blank: an unnamed page is named by its position. */
  title: string;
  /** Whether somebody actually named it, as opposed to "Page 3". */
  named: boolean;
  preview: string;
  updated: number;
  created: number;
  favorite: boolean;
  tags: string[];
  trashed: boolean;
  /** `YYYY-MM-DD` if this page is a journal entry, otherwise empty. */
  journalDate: string;
  /** The folder it is filed in, or empty for filed nowhere. */
  folder: string;
};

export function readShelf(meta: WorkspaceMeta): ShelfEntry[] {
  return meta.docMetas.map((raw, i) => {
    const m = raw as ShelfMeta;
    const named = Boolean((m.title || '').trim());
    return {
      id: m.id,
      title: named ? m.title.trim() : `Page ${i + 1}`,
      named,
      preview: (m.preview || '').trim(),
      updated: m.updatedDate ?? m.createDate ?? 0,
      created: m.createDate ?? 0,
      favorite: Boolean(m.favorite),
      tags: Array.isArray(m.tags) ? m.tags.filter((t) => typeof t === 'string') : [],
      trashed: typeof m.trashedAt === 'number',
      journalDate: typeof m.journalDate === 'string' ? m.journalDate : '',
      folder: typeof m.folder === 'string' ? m.folder : '',
    };
  });
}

/** When something was last written, in words ("3 days ago"); a date after a week. */
export function whenWritten(at: number, now = Date.now()): string {
  if (!at) return 'Not written in yet';
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 90) return 'Just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? 'An hour ago' : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(at).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/** The list heading a page sits under, grouped by when it was written. */
export function groupFor(at: number, now = Date.now()): string {
  if (!at) return 'Not written in yet';
  const day = 24 * 60 * 60 * 1000;
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (at >= startOfToday) return 'Today';
  if (at >= startOfToday - day) return 'Yesterday';
  if (at >= startOfToday - 7 * day) return 'Earlier this week';
  if (at >= startOfToday - 30 * day) return 'This month';
  return 'Older';
}

/** The order groups appear in, which is not the order their names sort in. */
export const GROUP_ORDER = [
  'Today',
  'Yesterday',
  'Earlier this week',
  'This month',
  'Older',
  'Not written in yet',
];

/** A page's text cut to one line for the list. */
export function previewFrom(text: string, limit = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit).trimEnd()}…`;
}

// --- Tags ---

/** The longest a tag can be. A tag is a label, not a sentence. */
export const TAG_LIMIT = 24;

/** A tag as stored: trimmed, single-spaced, without a leading `#`; '' when empty. */
export function cleanTag(raw: string): string {
  // Trim before removing the hash, or " #daniel" keeps it.
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim()
    .slice(0, TAG_LIMIT).trim();
}

/** Add a tag to a list without letting the same one in twice. */
export function withTag(tags: string[], raw: string): string[] {
  const tag = cleanTag(raw);
  if (!tag) return tags;
  // Case-insensitive; the spelling already in the room wins.
  const already = tags.find((t) => t.toLowerCase() === tag.toLowerCase());
  return already ? tags : [...tags, tag];
}

/** Every tag in the room, commonest first, with how many pages carry it. */
export function tagsAcross(entries: ShelfEntry[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const entry of entries) {
    if (entry.trashed) continue;
    for (const tag of entry.tags) {
      const key = tag.toLowerCase();
      const seen = counts.get(key);
      if (seen) seen.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort(
    (a, b) => b.count - a.count || a.tag.localeCompare(b.tag),
  );
}

/** Whether a page carries a tag, however either of them is capitalised. */
export function hasTag(entry: ShelfEntry, tag: string): boolean {
  const needle = tag.toLowerCase();
  return entry.tags.some((t) => t.toLowerCase() === needle);
}

// --- The journal: one page per day ---

/** The day as `YYYY-MM-DD` in local time (UTC would misfile Manila mornings). */
export function dayKey(at: number | Date = Date.now()): string {
  const d = at instanceof Date ? at : new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** A day key in words, built from its parts (parsing it would shift the day by timezone). */
export function dayInWords(key: string): string {
  const [y, m, d] = key.split('-').map((part) => Number(part));
  if (!y || !m || !d) return key;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/** The journal entry for a day, if the room has one that is not in the bin. */
export function journalFor(entries: ShelfEntry[], key: string): ShelfEntry | undefined {
  return entries.find((e) => e.journalDate === key && !e.trashed);
}

// --- Folders and collections ---

/** Every folder in the room, with how many pages are filed in each. */
export function foldersAcross(entries: ShelfEntry[]): Array<{ folder: string; count: number }> {
  const counts = new Map<string, { folder: string; count: number }>();
  for (const entry of entries) {
    if (entry.trashed || !entry.folder) continue;
    const key = entry.folder.toLowerCase();
    const seen = counts.get(key);
    if (seen) seen.count += 1;
    else counts.set(key, { folder: entry.folder, count: 1 });
  }
  return [...counts.values()].sort((a, b) => a.folder.localeCompare(b.folder));
}

/** A folder name as it will be stored, or empty for "filed nowhere". */
export function cleanFolder(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 40).trim();
}

/** Whether a page matches a collection: every tag, not any. */
export function matchesCollection(entry: ShelfEntry, collection: Collection): boolean {
  if (entry.trashed) return false;
  for (const tag of collection.tags) {
    if (!hasTag(entry, tag)) return false;
  }
  const needle = collection.words.trim().toLowerCase();
  if (!needle) return true;
  return entry.title.toLowerCase().includes(needle)
    || entry.preview.toLowerCase().includes(needle)
    || entry.tags.some((t) => t.toLowerCase().includes(needle));
}

/** A name for a collection built from what is currently being looked at. */
export function nameForView(tags: string[], words: string): string {
  const said = words.trim();
  if (tags.length && said) return `${tags.join(', ')} · ${said}`;
  if (tags.length) return tags.join(', ');
  return said || 'Everything';
}
