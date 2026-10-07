'use client';

// The billboard on Home: the church's announcements and blog posts as pictures
// you can see straight away and swipe through.
//
// ASKED FOR (7 October 2026): "It should look the Home Screen where people can
// see blogs and announcements right away please like a Bill board you can just
// see the image and photos right away and you can scroll on it."
//
// WHAT IT REPLACED. Home opened on a masthead and a grid of small text cards
// for the notices, with the blog a folder away. Nothing on it was a picture,
// and a post somebody had taken the trouble to write was two taps from where
// anybody would see it.
//
// A ROW EACH, SWIPED SIDEWAYS. Announcements in one, the blog in the next, the
// way a streaming app stacks its rows: both kinds are on the first screen, and
// a church with twelve posts does not push this Sabbath's notice twelve swipes
// out of sight, which one mixed row would. Each card is most of the screen's
// width, so the edge of the next one says there is more. A card is its picture
// first (a photo, a short clip, or a video link's player), then the words. Tap
// one and it opens whole, in a sheet over Home.
//
// BOTH HALVES OF THE APP use it: components/LiveBillboard.tsx and
// components/ChurchBillboard.tsx turn their own posts and notices into
// BoardItems and hand them here. Nothing in this file reads a database.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { videoEmbed } from '@/lib/video';
import { scrollMotion } from '@/lib/motion';
import { Linked } from '@/components/Linked';
import { CloseGlyph } from '@/components/Glyph';
import { Button } from '@/components/ui';
import { PostClip, PostGallery, PostPhoto } from '@/components/PostMedia';
import { shareItem } from '@/lib/share';
import { APP_NAME } from '@/lib/brand';
import type { PostMedia } from '@/lib/types';

export type BoardMedia = PostMedia;

export interface BoardItem {
  key: string;
  kind: 'post' | 'notice';
  title: string;
  /** Who and when, under the title: "Pastor Ramos · 4 hours ago". */
  byline: string;
  /** All the writing. The card shows its start; the sheet shows all of it. */
  text: string;
  /** A notice's own emoji, drawn on its card when it has no photo. */
  icon?: string;
  /** A post a Director holds at the front of the blog. */
  pinned?: boolean;
  /** Photos and a short clip, in the order they were added. */
  media?: BoardMedia[];
  /** Called when the card is opened: reading a post is a view of it. */
  onOpen?: () => void;
  /**
   * What the person looking may do to it, at the foot of the open sheet:
   * "Take down" for a notice's author or a Director. Beside the thing it acts
   * on, which is where somebody is when they decide it has served.
   */
  actions?: { label: string; run: () => void | Promise<void>; danger?: boolean }[];
}

/** The first YouTube or Facebook link in some writing, as a player. */
export function videoIn(text: string) {
  for (const m of text.matchAll(/https?:\/\/[^\s<>"')\]]+/g)) {
    const embed = videoEmbed(m[0]);
    if (embed) return embed;
  }
  return null;
}

/** What a card shows at the top: its first photo, its clip, its video link, or a drawn cover. */
function Cover({ item }: { item: BoardItem }) {
  const photo = item.media?.find((m) => m.kind === 'image');
  const clip = item.media?.find((m) => m.kind === 'video');
  const link = !photo && !clip ? videoIn(item.text) : null;
  if (photo) return <PostPhoto media={photo} lazy className="h-full w-full object-cover" />;
  // The clip's first frame, still and silent, until the card is opened.
  if (clip) return <PostClip media={clip} still className="h-full w-full object-cover" />;
  // A drawn cover, not a picture: navy for a post, the church's gold for a
  // notice. Its own colours, so every look shows it the same, and the writing
  // on it is chosen for that colour rather than for the look.
  const notice = item.kind === 'notice';
  return (
    <span
      className="grid h-full w-full place-items-center"
      style={{
        background: notice
          ? 'linear-gradient(135deg, #f6d27a 0%, #e8b84b 100%)'
          : 'linear-gradient(135deg, #1e2a4a 0%, #34508a 100%)',
        color: notice ? '#1e2a4a' : '#ffffff',
      }}
    >
      {link ? (
        <span className="flex flex-col items-center gap-2">
          <span aria-hidden className="grid h-14 w-14 place-items-center rounded-full bg-white/25 text-2xl">▶</span>
          <span className="text-sm font-bold">{link.label} video</span>
        </span>
      ) : (
        <span aria-hidden className="text-3xl">{item.icon || (notice ? '📌' : '✍️')}</span>
      )}
    </span>
  );
}

/** "4 hours ago", "yesterday", "3 days ago", then the date. */
export function postedWhen(iso: string, now = Date.now()): string {
  const mins = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

const kindLabel = (item: BoardItem) =>
  item.kind === 'notice' ? 'Announcement' : item.pinned ? 'Start here' : 'Blog';

/** The whole post or notice, over Home. */
function Reader({ item, onClose }: { item: BoardItem; onClose: () => void }) {
  const close = useRef<HTMLButtonElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');
  useEffect(() => {
    close.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    // The page under the sheet stays where it was rather than scrolling with it.
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', key);
      document.body.style.overflow = before;
    };
  }, [onClose]);
  const link = videoIn(item.text);
  const [shared, setShared] = useState('');
  const share = async () => {
    const url = `${window.location.origin}/church?room=notices#post-${encodeURIComponent(item.key)}`;
    const how = await shareItem({
      title: item.title,
      text: `${item.kind === 'notice' ? 'An announcement' : 'A post'} in ${APP_NAME}: ${item.title}`,
      url,
    });
    setShared(how === 'copied' ? 'Link copied. Only people in your church can open it.'
      : how === 'shared' ? 'Shared. Only people in your church can open it.'
      : how === 'cancelled' ? '' : `Copy this link to share it: ${url}`);
  };
  // An action that fails says so here, in the sheet it was pressed in. The
  // caller words the message; this only shows it.
  const act = async (run: () => void | Promise<void>) => {
    setBusy(true); setFailed('');
    try { await run(); onClose(); }
    catch (cause) { setFailed(cause instanceof Error && cause.message ? cause.message : 'That did not work.'); }
    finally { setBusy(false); }
  };
  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={onClose}
      data-board-reader
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        className="animate-drop overlay-sheet max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl solid-panel bg-white sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 bg-white px-5 pb-2 pt-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-600">
              {item.kind === 'notice' ? `${item.icon ?? '📌'} ` : ''}{kindLabel(item)}
            </p>
            <h2 className="mt-0.5 text-xl font-extrabold text-navy">{item.title}</h2>
            <p className="mt-0.5 text-sm text-gray-600">{item.byline}</p>
          </div>
          <button ref={close} type="button" onClick={onClose} className="tap-sm grid w-11 shrink-0 place-items-center rounded-full text-gray-600 hover:bg-gray-100" aria-label="Close">
            <CloseGlyph size={22} />
          </button>
        </div>
        <div className="space-y-3 px-5 pb-6">
          <PostGallery media={item.media} />
          {link && (
            <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: '16 / 9' }}>
              <iframe
                src={link.src}
                title={`${link.label} video: ${item.title}`}
                className="absolute inset-0 h-full w-full"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          )}
          {item.text && (
            <p dir="auto" className="whitespace-pre-wrap break-words text-[1rem] leading-relaxed text-gray-800">
              <Linked text={item.text} />
            </p>
          )}
          {/* SHARE: the title and a link, never the words or the photos.
              The link opens only for somebody signed in to this church who may
              read it, so passing it on cannot carry a member's post outside
              the church. */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => void share()}>Share</Button>
            {shared && <span className="break-all text-sm text-gray-600" role="status">{shared}</span>}
          </div>
          {item.actions && item.actions.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              {failed && <p role="alert" className="w-full text-sm font-semibold text-red-700">{failed}</p>}
              {item.actions.map((a) => (
                <Button key={a.label} variant={a.danger ? 'danger' : 'ghost'} disabled={busy} onClick={() => void act(a.run)}>
                  {a.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function HomeBoard({ items, heading, name, more, empty }: {
  items: BoardItem[];
  heading: string;
  /** Which row, for the walks: `data-home-board="notices"`. */
  name: string;
  /** A link to everything of this kind, beside the heading. */
  more?: React.ReactNode;
  /**
   * Said when the row has nothing in it. Left out, an empty row draws nothing
   * at all: "no posts yet" is furniture to somebody who cannot change that,
   * and useful only to somebody who can.
   */
  empty?: React.ReactNode;
}) {
  const [open, setOpen] = useState<BoardItem | null>(null);
  const strip = useRef<HTMLUListElement | null>(null);
  const headingId = useId();
  // One function for the life of the row, so the open sheet's keyboard and
  // scroll lock are set up once, not again on every redraw of Home.
  const shut = useCallback(() => setOpen(null), []);
  // A SHARED LINK OPENS THE POST it points at (#post-<key>), once, when the
  // row first has it.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || typeof window === 'undefined') return;
    const wanted = decodeURIComponent(window.location.hash.replace(/^#post-/, ''));
    const found = window.location.hash.startsWith('#post-') ? items.find((i) => i.key === wanted) : undefined;
    if (found) { opened.current = true; found.onOpen?.(); setOpen(found); }
  }, [items]);
  if (items.length === 0 && !empty) return null;

  // A ROW OF WORDS STAYS SHORT. Picture-sized covers are for pictures: in a
  // row where nothing has a photo, a clip or a video, each card is its words
  // with its emoji beside them, so three notices do not push the blog's
  // pictures off a phone's first screen. Decided for the row, not the card,
  // so the cards in a row stay one shape.
  const pictures = items.some((i) => (i.media?.length ?? 0) > 0 || videoIn(i.text) !== null);

  // ON A COMPUTER, TWO ARROWS, because a mouse has no sideways swipe and a
  // strip that only scrolls with shift and the wheel is one nobody finds.
  const move = (by: number) => {
    const el = strip.current;
    if (!el) return;
    const card = el.querySelector('li');
    el.scrollBy({ left: by * ((card?.getBoundingClientRect().width ?? 300) + 12), behavior: scrollMotion() });
  };

  return (
    <section aria-labelledby={headingId} data-home-board={name} data-pictures={pictures ? "yes" : "no"}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id={headingId} className="text-xl font-bold text-room">{heading}</h2>
        <div className="flex items-center gap-2">
          {more}
          {items.length > 1 && (
            <span className="hidden gap-2 md:flex">
              <button type="button" onClick={() => move(-1)} aria-label={`Back through ${heading}`} className="tap-sm grid w-11 place-items-center rounded-full bg-white text-xl text-navy ring-1 ring-navy/10 hover:bg-gray-50">‹</button>
              <button type="button" onClick={() => move(1)} aria-label={`On through ${heading}`} className="tap-sm grid w-11 place-items-center rounded-full bg-white text-xl text-navy ring-1 ring-navy/10 hover:bg-gray-50">›</button>
            </span>
          )}
        </div>
      </div>
      {items.length === 0 && empty}
      {items.length > 0 && <ul ref={strip} className="thin-scroll -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 md:mx-0 md:px-0">
        {items.map((item) => (
          <li key={item.key} data-key={item.key} className="w-[84%] max-w-[22rem] shrink-0 snap-start">
            <button
              type="button"
              onClick={() => { item.onOpen?.(); setOpen(item); }}
              className="flex h-full w-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-navy/10"
              data-board-card={item.kind}
            >
              {pictures ? (
                <span className="relative block w-full overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
                  <Cover item={item} />
                  {(item.media?.length ?? 0) > 1 && (
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/65 px-2 py-0.5 text-xs font-bold text-white">
                      +{item.media!.length - 1} more
                    </span>
                  )}
                </span>
              ) : null}
              <span className="flex flex-1 flex-col gap-0.5 px-4 pb-4 pt-3">
                <span className="flex items-center gap-2">
                  {!pictures && (
                    // The church's gold for a notice, navy's pale for a post:
                    // the two colours of a drawn cover, as a badge by the label.
                    <span
                      aria-hidden
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-base"
                      style={{ background: item.kind === 'notice' ? '#f6d27a' : '#dfe6f3' }}
                    >
                      {item.icon || (item.kind === 'notice' ? '📌' : '✍️')}
                    </span>
                  )}
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-600">{kindLabel(item)}</span>
                </span>
                <span className="line-clamp-2 text-lg font-bold leading-snug text-navy">{item.title}</span>
                <span className="truncate text-sm text-gray-600">{item.byline}</span>
                {/* Words where a picture would be: the start of what it says. */}
                {!pictures && item.text && <span className="mt-1 line-clamp-2 text-sm text-gray-700">{item.text}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>}
      {open && <Reader item={open} onClose={shut} />}
    </section>
  );
}
