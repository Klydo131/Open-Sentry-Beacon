'use client';

import Link from 'next/link';
import { useEffect, type ReactNode, type RefObject } from 'react';
import { Card } from '@/components/ui';
import { useUrlKey } from '@/lib/url-signal';

// -------------------------------------------------------------------------
// WRITING A POST: THE PARTS BOTH HALVES SHARE.
//
// The owner, 4 October 2026: "I would love writing the Blog to be simple
// (with advance settings too but that's optional) and can be easily
// accessible to Home page".
//
// The sample church (components/Blog.tsx) and a real church
// (components/LiveBlog.tsx) each have their own writing box, because they
// save to different places. Everything a person SEES of writing is the same
// in both, so it lives here, once:
//
//   1. The way in      WritePostPrompt, the row on Home's first screen, and
//                      useFocusOnWrite, which puts the cursor in Title.
//   2. The box         WritingBox, AdvancedSwitch and PostedNote.
//   3. The words       what the box says after Publish or Save as draft.
// -------------------------------------------------------------------------

// ---- 1. The way in ------------------------------------------------------

/** Home's Blog folder, asking the writing box to put the cursor in Title. */
export const WRITE_HREF = '/church?room=blogs&write=1';

/**
 * The row on Home's first screen. Only drawn for somebody who can write.
 *
 * The whole row is one link. A link rather than a button with a click
 * handler, so it also works opened in a new tab. (The first version was a
 * sentence beside a button; on a phone the question folded into four short
 * lines and the card stood 171px tall.)
 */
export function WritePostPrompt() {
  return (
    <Link
      href={WRITE_HREF}
      data-write-post
      className="tap flex items-center gap-4 rounded-2xl bg-white px-4 py-3 ring-1 ring-black/5 transition hover:ring-navy/30"
    >
      <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-navy text-xl">
        ✍️
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold text-navy">Write a post</span>
        <span className="block text-sm text-gray-600">Something to share with your church?</span>
      </span>
      <span aria-hidden className="shrink-0 text-2xl leading-none text-navy">›</span>
    </Link>
  );
}

/**
 * When the address says `write=1`, put the cursor in the title and bring the
 * box into view. Then take `write=1` back out of the address, so a reload or a
 * back-and-forth does not do it again.
 */
export function useFocusOnWrite(title: RefObject<HTMLInputElement | null>): void {
  const url = useUrlKey();
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('write') !== '1' || !title.current) return;

    title.current.focus({ preventScroll: true });
    title.current.scrollIntoView({ block: 'center', behavior: 'instant' as ScrollBehavior });

    params.delete('write');
    replaceSearch(params);
  }, [url, title]);
}

/** Change the address's `?...` part without adding a step to Back. */
function replaceSearch(params: URLSearchParams): void {
  const { pathname, hash } = window.location;
  const search = params.toString();
  window.history.replaceState(window.history.state, '', `${pathname}${search ? `?${search}` : ''}${hash}`);
}

// ---- 2. The box ---------------------------------------------------------

/**
 * The card the writing box sits in, with its heading and one line. Each half
 * puts its own form and its own list of posts inside.
 *
 * There is no Close button: the box used to carry a Close/Write switch as its
 * largest button, so the first thing the eye found on a writing screen was the
 * way to stop writing. Publish is the one strong button now.
 */
export function WritingBox({ children }: { children: ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy">✍️ Write a post</h2>
      <p className="text-sm text-gray-500">For your church to read, in their own time.</p>
      {children}
    </Card>
  );
}

/**
 * The switch for everything beyond a title, the post and Publish: who sees it,
 * and saving a draft. It is drawn BELOW Publish, so nobody has to read past it
 * to finish a post. What it opens appears above the buttons it changes.
 */
export function AdvancedSwitch({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="mt-4 flex flex-wrap items-center gap-x-2 text-sm font-semibold text-navy">
      <input type="checkbox" data-blog-advanced checked={on} onChange={(e) => onChange(e.target.checked)} />
      Advanced settings
      <span className="font-normal text-gray-500">(choose who sees it, or save as a draft)</span>
    </label>
  );
}

/** What just happened, said where the person is looking. */
export function PostedNote({ outcome }: { outcome: PostOutcome | null }) {
  if (!outcome) return null;
  return (
    <p role="status" data-blog-done className="mt-3 text-sm font-semibold text-green-800">
      {POSTED[outcome]}
    </p>
  );
}

// ---- 3. The words -------------------------------------------------------

/** How a post left the box. */
export type PostOutcome = 'church' | 'chosen' | 'draft';

const POSTED: Record<PostOutcome, string> = {
  church: 'Published. Everyone in the church can read it now.',
  chosen: 'Published, to the people you chose.',
  draft: 'Saved as a draft. Only you can see it, below.',
};

/** Which of those it was, in the words a post is saved with. */
export function postOutcome(
  visibility: 'published' | 'private',
  audience: 'church' | 'all' | 'selected',
): PostOutcome {
  if (visibility === 'private') return 'draft';
  return audience === 'church' ? 'church' : 'chosen';
}
