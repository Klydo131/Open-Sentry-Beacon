'use client';

// What the study room knows about each page, beyond the writing on it.
//
// ---------------------------------------------------------------------------
// ASKED FOR, WITH A SCREENSHOT OF AFFiNE'S OWN APP: "what I meant for a special
// room like the library page is, I want the whole Affine features like this but
// with Hope Beacon brand please."
//
// The screenshot is a workspace, not an editor: a list of documents with a
// preview line and a date, a star on each, tags, a trash, a search, and a view
// somebody browses before they open anything. That is a different shape from a
// strip of tabs above a page, and it is the shape the library already has in
// this app, which is exactly why it was asked for in those words.
//
// WHERE THIS LIVES. BlockSuite's own DocMeta already carries `title`, `tags`,
// `createDate`, `updatedDate` and `favorite` -- AFFiNE's list is built on the
// same fields. Two more are needed for the rest of that screen and are added
// here rather than invented elsewhere: a short `preview` so a list can show
// what a page is about without loading every page, and `trashedAt` so deleting
// is something a person can undo.
//
// They ride in the same workspace document as the rest of the page list, so
// they sync, they survive a reinstall, and they cost one row in `study_docs`
// rather than a table of their own.
// ---------------------------------------------------------------------------

import type { DocMeta, WorkspaceMeta } from '@blocksuite/store';

/** DocMeta plus the two things a browsable shelf needs and BlockSuite has not. */
export type ShelfMeta = DocMeta & {
  /**
   * The first line or so of the page, kept so the list can be useful.
   *
   * WHY IT IS STORED RATHER THAN READ. Every page is a separate Yjs document
   * that has to be pulled from the database before a word of it can be read.
   * A shelf of twenty pages would be twenty round trips before it could draw a
   * single preview line, on a phone, before the person has opened anything.
   */
  preview?: string;
  /** When it was put in the trash. Absent means it is not in the trash. */
  trashedAt?: number;
  /**
   * `YYYY-MM-DD` when this page is the journal entry for that day.
   *
   * WHY A DAY AND NOT A TITLE. The journal has to reopen the same page every
   * time somebody taps Today, and a title is a thing people rename. Matching on
   * the date it stands for means renaming "Thursday, 17 September" to "Prayer
   * meeting" keeps it as that day's page rather than quietly starting a second
   * one the next time the button is pressed.
   */
  journalDate?: string;
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
    };
  });
}

/**
 * WHEN SOMETHING WAS LAST WRITTEN, IN WORDS RATHER THAN A DATE.
 *
 * A study room is somewhere people come back to, and "3 days ago" answers the
 * question they are actually asking -- is this the one I was working on? -- in
 * a way that "14/09/2026" does not. Past a week the date is the more useful
 * answer, so it switches.
 */
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

/**
 * The heading a page sits under in the list.
 *
 * GROUPED BY WHEN, NOT BY NAME, because that is how somebody looks for a page
 * they were writing on Tuesday. Alphabetical order is useful when you know what
 * a thing is called; a study room is full of pages people have not named.
 */
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

/**
 * Cut a page's text down to a line worth showing.
 *
 * NO NEWLINES AND NO RUNAWAY. A preview is one line in a list; a heading
 * followed by three paragraphs would push every other page off a phone screen,
 * and the whole point of the shelf is seeing several at once.
 */
export function previewFrom(text: string, limit = 140): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat.length <= limit) return flat;
  return `${flat.slice(0, limit).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// TAGS
//
// ASKED FOR, IN THE SAME SCREENSHOT AS THE SHELF: AFFiNE's All docs carries a
// tag on each row and a list of tags down the side. BlockSuite's own DocMeta
// already has the field; nothing had ever written to it or drawn it.
//
// WHY TAGS RATHER THAN FOLDERS FIRST. A page about Romans 8 belongs to the
// sermon it came from AND to the book it is in AND to the study group it was
// written for, and a folder makes somebody pick one. Tags are also the thing
// that survives a phone: a tree needs somewhere to show the tree, and a chip
// fits on any screen. Folders are still worth having; they are not the first
// thing to build.
// ---------------------------------------------------------------------------

/** The longest a tag can be. A tag is a label, not a sentence. */
export const TAG_LIMIT = 24;

/**
 * A tag as it will be stored, or an empty string when there is nothing to store.
 *
 * TIDIED RATHER THAN REFUSED. Somebody typing "  romans 8 " means the same
 * thing as "Romans 8", and a study room that rejected the first would be
 * teaching people to type carefully instead of taking notes. A leading `#` goes
 * the same way: it is how people write tags everywhere else, and it is not part
 * of the word.
 */
export function cleanTag(raw: string): string {
  // TRIMMED BEFORE THE HASH IS LOOKED FOR, and a test caught the other order.
  // " #daniel " has a space in front of the hash, so a `^#+` against the raw
  // string matches nothing and the hash is stored as part of the tag -- which
  // then sorts apart from "daniel" and counts as a second tag forever.
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim()
    .slice(0, TAG_LIMIT).trim();
}

/** Add a tag to a list without letting the same one in twice. */
export function withTag(tags: string[], raw: string): string[] {
  const tag = cleanTag(raw);
  if (!tag) return tags;
  // CASE-INSENSITIVE, because "romans" and "Romans" are one tag to a person and
  // two tags in a list is how a tag list stops being useful. The spelling
  // already in the room wins, so a room does not slowly acquire both.
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

// ---------------------------------------------------------------------------
// THE JOURNAL
//
// AFFiNE gives every day a page of its own, reached by one button. It is the
// feature that fits a church best of everything in that screenshot: morning
// devotion, a sermon on Sabbath, what somebody prayed about on Tuesday. Nobody
// names those pages, and nobody should have to.
// ---------------------------------------------------------------------------

/**
 * The day a moment falls on, as `YYYY-MM-DD`, in the reader's own timezone.
 *
 * LOCAL, NOT UTC, and it matters here more than it usually does. Manila is
 * UTC+8, so anything written before eight in the morning would be filed under
 * the previous day if this used UTC -- which is most of the morning devotions
 * this is for.
 */
export function dayKey(at: number | Date = Date.now()): string {
  const d = at instanceof Date ? at : new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A day key as somebody would say it: "Thursday, 17 September 2026".
 *
 * BUILT FROM THE PARTS, NOT PARSED. `new Date('2026-09-17')` is read as
 * midnight UTC and then shown in local time, which in Manila is the 17th at
 * eight in the morning and in Los Angeles is the 16th at five in the evening.
 * A journal that names the wrong day is worse than one with no name at all.
 */
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
