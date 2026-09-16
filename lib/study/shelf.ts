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
      tags: Array.isArray(m.tags) ? m.tags : [],
      trashed: typeof m.trashedAt === 'number',
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
