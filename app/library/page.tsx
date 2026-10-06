'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, EmptyState } from '@/components/ui';
import { SentryBeaconWordmark } from '@/components/SentryBeaconMark';
import { NAVY, APP_SHORT_NAME } from '@/lib/brand';
import { downloadBlob } from '@/lib/pdf';
import { safeExternalUrl } from '@/lib/url';
import { videoEmbed } from '@/lib/video';
import {
  listMedia,
  putMedia,
  getBlob,
  deleteMedia,
  humanSize,
  newMediaId,
  resolutionLabel,
  type MediaMeta,
} from '@/lib/localMedia';
import { shareItem, blobToFile } from '@/lib/share';
import { ShareButton } from '@/components/ShareSheet';
import { MediaPlayer } from '@/components/MediaPlayer';
import { HeartGlyph, SearchGlyph } from '@/components/Glyph';
// TWO DIFFERENT HOOKS ARE CALLED useRoom IN THIS CODEBASE, and this file is
// the only one that needs both: `lib/room-theme` gives a room its colours,
// `components/Rooms` gives a room its subrooms. Aliased rather than renamed,
// because renaming either would touch every screen to settle an argument this
// comment settles.
import { RoomTabs, useRoom as useSubroom, type Room } from '@/components/Rooms';
import { useRoom } from '@/lib/room-theme';
import { saveFilesFromInput, savedMessage } from '@/lib/save-media';
import { useDemo } from '@/lib/demo/store';
import { homeFor, useLiveSession } from '@/lib/live/session';
import { TabBar } from '@/components/TabBar';
import { useIsLive } from '@/lib/tutorial';
import { STARTER_KIT, starterKitFor } from '@/lib/starter-kit';
import type { Material } from '@/lib/types';
import { MusicGlyph, PlayGlyph } from '@/components/Glyph';
import Link from 'next/link';

const ICON: Record<string, string> = {
  pdf: '📄',
  video: '🎬',
  audio: '🎧',
  image: '🖼️',
  link: '🔗',
};

const DEMO_HOME: Record<string, string> = {
  executive: '/admin', admin: '/admin', dm: '/dm', ds: '/ds',
};

const FAVORITES_KEY = 'hope-beacon:library-favorites:v1';

type LibraryFilter = 'all' | 'study' | 'devotion' | 'church' | 'downloads' | 'saved';

const LIBRARY_FILTERS: Array<{
  key: LibraryFilter;
  label: string;
  /** The chip's word on a phone or pad, where the six sit in one row. */
  short: string;
  description: string;
  icon: string;
}> = [
  { key: 'all', label: 'All resources', short: 'All', description: 'Everything in the collection', icon: '📚' },
  { key: 'study', label: 'Bible study', short: 'Bible study', description: 'Bible and Sabbath School', icon: '📖' },
  { key: 'devotion', label: 'Reading & devotion', short: 'Devotion', description: 'Faith-building reading', icon: '🌿' },
  { key: 'church', label: 'Church basics', short: 'Church basics', description: 'Beliefs and new believer guides', icon: '⛪' },
  { key: 'downloads', label: 'Downloads', short: 'Downloads', description: 'Printable PDF resources', icon: '⬇️' },
  { key: 'saved', label: 'Favorites', short: 'Favorites', description: 'Resources you saved on this device', icon: '♥️' },
];

function matchesFilter(item: Material, filter: LibraryFilter, favoriteIds: string[]) {
  if (filter === 'all') return true;
  if (filter === 'saved') return favoriteIds.includes(item.id);
  if (filter === 'downloads') return item.type === 'pdf';
  if (filter === 'study') return item.topics.some((topic) =>
    ['Bible', 'Bible study', 'Sabbath School'].includes(topic),
  );
  if (filter === 'devotion') return item.topics.some((topic) =>
    ['Devotional', 'Ellen G. White'].includes(topic),
  );
  return item.topics.some((topic) => ['Beliefs', 'Church', 'New believer'].includes(topic));
}

function ResourceCard({
  item,
  saved,
  onToggleSaved,
  featured = false,
}: {
  item: Material;
  saved: boolean;
  onToggleSaved: (id: string) => void;
  featured?: boolean;
}) {
  const url = safeExternalUrl(item.external_url);
  return (
    <article
      className={`flex h-full flex-col rounded-2xl bg-white p-4 shadow-sm ring-1 ring-navy/10 ${
        featured ? 'bg-gradient-to-br from-white to-sky-50/80' : ''
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-50 text-2xl"
        >
          {ICON[item.type] ?? ICON.link}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--music-accent)]">
            {item.topics.slice(0, 2).join(' · ') || 'Resource'}
          </p>
          <h3 className="mt-0.5 font-bold leading-snug text-navy">{item.title}</h3>
        </div>
        <button
          type="button"
          onClick={() => onToggleSaved(item.id)}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${item.title} from favorites` : `Save ${item.title} to favorites`}
          className={`tap-sm grid h-10 w-10 shrink-0 place-items-center rounded-full text-lg transition ${
            saved ? 'bg-rose-50 text-rose-600' : 'bg-gray-50 text-navy hover:bg-sky-50'
          }`}
        >
          <HeartGlyph filled={saved} size={18} />
        </button>
      </div>
      <div className="mt-3 flex-1">
        <p className="line-clamp-3 text-sm leading-relaxed text-gray-600 xl:line-clamp-none">{item.description}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-navy/10 pt-3">
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-sm inline-flex items-center rounded-xl bg-navy px-4 text-sm font-bold text-white"
          >
            Open resource
          </a>
        )}
        {url && (
          <ShareButton
            compact
            payload={{ title: item.title, text: item.description, url }}
            className="py-2 text-sm"
          />
        )}
      </div>
    </article>
  );
}

function DeviceMediaCard({
  item,
  playing,
  theme,
  onTogglePlayer,
  onShare,
  onDownload,
  onRemove,
}: {
  item: MediaMeta;
  playing: boolean;
  theme: ReturnType<typeof useRoom>['theme'];
  onTogglePlayer: () => void;
  onShare: () => void;
  onDownload: () => void;
  onRemove: () => void;
}) {
  const url = safeExternalUrl(item.external_url);
  // ONE TAP USED TO DELETE A FILE, with nothing to bring it back: the file
  // lived only on this device. On a phone the button sits under a thumb that
  // is scrolling past it. The first tap now asks; the second deletes.
  const [sure, setSure] = useState(false);
  const playable =
    item.type === 'audio' ||
    item.type === 'video' ||
    item.type === 'image' ||
    (item.type === 'link' && !!videoEmbed(item.external_url));

  return (
    <Card className="flex flex-wrap items-center gap-3 p-4" data-panel="device-file">
      <span className="text-2xl" aria-hidden>{ICON[item.type] ?? ICON.link}</span>
      <div className="min-w-0 flex-1 basis-40 xl:basis-0">
        <p className="truncate font-semibold text-navy">{item.title}</p>
        <p className="truncate text-sm text-gray-500">
          {item.type === 'link' ? 'Link' : item.type.toUpperCase()}
          {item.size ? ` · ${humanSize(item.size)}` : ''}
          {item.type === 'video' && resolutionLabel(item.width, item.height)
            ? ` · ${resolutionLabel(item.width, item.height)}`
            : ''}
          {item.note ? ` · ${item.note}` : ''}
        </p>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 xl:w-auto">
        {playable && (
          <Button variant="ghost" className="px-4 text-base" onClick={onTogglePlayer}>
            {playing ? 'Close' : <><PlayGlyph size={14} className="mr-1" />Play</>}
          </Button>
        )}
        <Button variant="gold" className="px-4 text-base" onClick={onShare}>Share</Button>
        {item.type === 'link' ? (
          url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl px-3 py-2 text-sm font-semibold text-navy underline"
            >
              Open
            </a>
          )
        ) : (
          <button
            type="button"
            onClick={onDownload}
            className="rounded-xl px-3 py-2 text-sm font-semibold text-navy underline"
          >
            Download
          </button>
        )}
        <button
          type="button"
          onClick={() => (sure ? onRemove() : setSure(true))}
          className="ml-auto rounded-xl px-3 py-2 text-sm font-bold text-red-700 underline xl:ml-0"
        >
          {sure ? 'Tap again to delete' : 'Delete'}
        </button>
      </div>
      {playing && (
        <div className="w-full basis-full">
          <MediaPlayer item={item} theme={theme} />
        </div>
      )}
    </Card>
  );
}

// A personal, on-device media library. Everything is saved locally (IndexedDB)
// and shared straight from the device — Beacon never hosts the files.
export default function LibraryPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const { currentUser } = useDemo();
  const { theme } = useRoom(currentUser?.id ?? null, currentUser?.role ?? 'ds');
  const { profile } = useLiveSession();
  const backHome = profile ? homeFor(profile.role) : currentUser ? DEMO_HOME[currentUser.role] : '/';
  // The bar's role comes from the half that is actually running. On the live
  // app a sample person left in this browser from an old tutorial is not who
  // is here, and neither is anybody while the sign-in is still loading.
  const live = useIsLive();
  const barRole = live ? profile?.role : currentUser?.role;

  // What this person's shelf opens with. An Explorer gets a short, Jesus-first
  // list; everybody else gets the whole kit. Works on both halves, because the
  // live session and the demo store answer the same question about who is here.
  const kit = starterKitFor(profile?.role ?? currentUser?.role);

  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<MediaMeta[]>([]);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [note, setNote] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoritesLoaded, setFavoritesLoaded] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);

  const refresh = () => listMedia().then(setItems);

  useEffect(() => {
    listMedia().then(setItems).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]');
      if (Array.isArray(stored)) {
        setFavoriteIds(stored.filter((id): id is string =>
          typeof id === 'string' && STARTER_KIT.some((item) => item.id === id),
        ));
      }
    } catch {
      // Favorites are a convenience. The public library remains fully usable
      // if a browser has disabled or cleared local storage.
    } finally {
      setFavoritesLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!favoritesLoaded) return;
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favoriteIds)); } catch { /* device preference only */ }
  }, [favoriteIds, favoritesLoaded]);

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(''), 2200);
  };

  const toggleFavorite = (id: string) => {
    setFavoriteIds((current) =>
      current.includes(id) ? current.filter((saved) => saved !== id) : [...current, id],
    );
  };

  const onFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    setBusy(true);
    const result = await saveFilesFromInput(event.target, note);
    setBusy(false);
    if (result.saved > 0) {
      setNote('');
      await refresh();
    }
    const said = savedMessage(result);
    if (said) flash(said);
  };

  const addLink = async () => {
    const url = safeExternalUrl(linkUrl);
    if (!linkTitle.trim() || !url) {
      flash('Add a title and a valid https:// link.');
      return;
    }
    await putMedia({
      id: newMediaId(),
      title: linkTitle.trim(),
      type: 'link',
      note: note || undefined,
      external_url: url,
      size: 0,
      created_at: new Date().toISOString(),
    });
    setLinkTitle('');
    setLinkUrl('');
    setNote('');
    await refresh();
    flash('Link added to this device');
  };

  const download = async (item: MediaMeta) => {
    const blob = await getBlob(item.id);
    if (!blob) {
      flash('This item has no file to download.');
      return;
    }
    downloadBlob(blob, item.title);
  };

  const share = async (item: MediaMeta) => {
    if (item.type === 'link' && item.external_url) {
      const result = await shareItem({ title: item.title, url: item.external_url });
      flash(result === 'copied' ? 'Link copied' : result === 'shared' ? 'Shared' : 'Nothing to share');
      return;
    }
    const blob = await getBlob(item.id);
    if (!blob) {
      flash('This item has no file to share.');
      return;
    }
    const result = await shareItem({
      title: item.title,
      text: item.title,
      file: blobToFile(blob, item.title, item.mime),
    });
    if (result === 'download') {
      downloadBlob(blob, item.title);
      flash('Sharing is not available here, so it downloaded instead.');
    } else {
      flash(result === 'shared' ? 'Shared' : result === 'cancelled' ? '' : 'Downloaded instead');
    }
  };

  const remove = async (item: MediaMeta) => {
    await deleteMedia(item.id);
    await refresh();
    flash('Removed from this device');
  };

  const term = query.trim().toLowerCase();
  const resources = kit.filter((item) =>
    matchesFilter(item, filter, favoriteIds) &&
    (!term || [item.title, item.description, ...item.topics].join(' ').toLowerCase().includes(term)),
  );
  const featured = resources.slice(0, 3);

  // THREE FOLDERS, AND THIS ROOM NEEDED THEM MOST. Measured on a 390px phone:
  // eleven screens of scrolling, the longest page in the app by a factor of
  // two. The church's shelf and the files on your own device are two different
  // things that happened to share a page, and the second was at the bottom of
  // the first.
  const rooms: Room[] = [
    { id: 'browse', label: '🔎 Browse' },
    { id: 'featured', label: '⭐ Featured' },
    { id: 'mine', label: '📱 On this device' },
  ];
  const [room, chooseRoom] = useSubroom(rooms, 'beacon:library-room', {
    'your-device-library': 'mine',
  });

  return (
    <div className="min-h-screen bg-slate-50 text-navy">
      <header className="border-b border-navy/10 bg-white">
        {/* BACK ON THE LEFT, AND IT WAS MOVED TO THE RIGHT BY MISTAKE.
            Reported: "It's not good for the muscle memory for users to swap
            and click the lost back button if my eyes will go to another
            direction."

            That is the whole argument and it is correct. Back is top-LEFT on
            every phone anybody owns -- iOS, Android, and the browser's own
            control -- and a way out that moves is worse than one that is
            slightly harder to find, because a person who has learned where it
            is stops looking and starts reaching. Moving it costs them the tap
            AND the certainty.

            The arrow already points left, which is the giveaway: an arrow
            pointing away from the thing it belongs beside. */}
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => router.push(backHome)}
            className="tap-sm shrink-0 rounded-xl bg-slate-50 px-3 text-sm font-bold text-navy ring-1 ring-navy/10 hover:bg-sky-50"
          >
            ← Back to app
          </button>
          {/* On a phone the tagline ran off the right-hand edge and was cut
              in half ("Live church. Real conne"); the name alone fits. */}
          <span className="sm:hidden"><SentryBeaconWordmark size={30} nameClass="text-base" /></span>
          <span className="hidden sm:block"><SentryBeaconWordmark size={36} subtitle="Live church. Real connections." nameClass="text-lg" /></span>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 pb-10 pt-5 sm:px-6 lg:px-8 xl:space-y-8 xl:pt-7">
        {/* PHONES AND PADS GET A TITLE, NOT A BANNER (6 October 2026: "not UI
            friendly for Mobile and Pad users ... make it more aesthetic and
            simple"). The banner below filled a 390px phone's whole first
            screen with a welcome and two numbers before anything could be
            opened. Below 1280px, where the bar along the bottom is, this is
            what shows; a computer keeps the banner exactly as it was. */}
        <div className="xl:hidden" data-library-title>
          <h1 className="text-2xl font-extrabold tracking-tight text-navy sm:text-3xl">My Files</h1>
          <p className="mt-1 text-sm text-gray-600">Church resources to read and share, and your own files kept on this device.</p>
        </div>

        <section className="hidden gap-6 rounded-3xl xl:!mt-0 xl:grid bg-gradient-to-br from-navy via-[#173d77] to-[#056e81] p-6 text-white shadow-sm md:grid-cols-[1.3fr_0.7fr] md:p-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-teal-200">{APP_SHORT_NAME} Library</p>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Learn, grow, and come back anytime.</h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-white/80">
              Trusted Bible, devotional, and church resources in one clear place. Save favorites on this device, share a resource, or build your own offline shelf below.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 self-end">
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-2xl font-extrabold">{kit.length}</p>
              <p className="mt-1 text-sm text-white/75">Published resources</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm">
              <p className="text-2xl font-extrabold">{favoriteIds.length}</p>
              <p className="mt-1 text-sm text-white/75">Saved favorites</p>
            </div>
          </div>
        </section>

        <RoomTabs rooms={rooms} room={room} onChoose={chooseRoom} />

        {room === 'browse' && <section aria-labelledby="browse-library" className="space-y-4">
          <div className="hidden flex-wrap items-end justify-between gap-3 xl:flex">
            <div>
              <h2 id="browse-library" className="text-2xl font-extrabold text-navy">Browse the library</h2>
              <p className="mt-1 text-sm text-gray-600">Open a resource in its official publisher&rsquo;s site, then share it with someone you walk with.</p>
            </div>
            <p className="rounded-full bg-white px-3 py-1.5 text-sm font-bold text-navy ring-1 ring-navy/10">{resources.length} shown</p>
          </div>

          <label className="relative block">
            <span className="sr-only">Search library resources</span>
            <SearchGlyph size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Search resources, subjects, or topics"
              aria-label="Search library resources"
              className="tap w-full rounded-2xl bg-white py-3 pl-11 pr-4 text-base text-navy shadow-sm ring-1 ring-navy/10 outline-none placeholder:text-gray-400 focus:ring-2 focus:ring-teal-600"
            />
          </label>

          {/* SIX CARDS, EACH 112 PIXELS TALL, were a whole phone screen of
              buttons between the search box and the first resource. As chips
              they are one row that scrolls sideways inside itself (never the
              page), with the count on each. */}
          <div className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:hidden [&::-webkit-scrollbar]:hidden" data-library-chips>
            <div className="flex w-max gap-2 md:w-auto md:flex-wrap" role="group" aria-label="Show">
              {LIBRARY_FILTERS.map((option) => {
                const active = option.key === filter;
                const count = kit.filter((item) => matchesFilter(item, option.key, favoriteIds)).length;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setFilter(option.key)}
                    aria-pressed={active}
                    aria-label={`${option.label}, ${count}`}
                    className={`tap-sm inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold ring-1 transition ${
                      active ? 'bg-navy text-white ring-navy' : 'bg-white text-navy ring-navy/10'
                    }`}
                  >
                    <span aria-hidden>{option.icon}</span>
                    <span>{option.short}</span>
                    <span aria-hidden className="opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="hidden gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid">
            {LIBRARY_FILTERS.map((option) => {
              const active = option.key === filter;
              const count = kit.filter((item) => matchesFilter(item, option.key, favoriteIds)).length;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setFilter(option.key)}
                  aria-pressed={active}
                  className={`min-h-28 rounded-2xl p-4 text-left transition ring-1 ${
                    active
                      ? 'bg-teal-700 text-white ring-teal-700 shadow-sm'
                      : 'bg-white text-navy ring-navy/10 hover:bg-sky-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span aria-hidden className={`grid h-10 w-10 place-items-center rounded-xl text-xl ${active ? 'bg-white/15' : 'bg-sky-50'}`}>{option.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2 font-bold">
                        <span>{option.label}</span><span className={active ? 'text-teal-100' : 'text-teal-700'}>{count}</span>
                      </span>
                      <span className={`mt-1 block text-sm ${active ? 'text-white/75' : 'text-gray-500'}`}>{option.description}</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>}

        {room === 'featured' && featured.length > 0 && (
          <section aria-labelledby="featured-resources">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 xl:mb-4">
              <div>
                <h2 id="featured-resources" className="text-lg font-extrabold text-navy xl:text-2xl">Featured resources</h2>
                <p className="mt-1 text-sm text-gray-600">A helpful place to begin from this selection.</p>
              </div>
              {filter !== 'all' && (
                <button type="button" onClick={() => setFilter('all')} className="text-sm font-bold text-teal-700 underline underline-offset-2">
                  Show all resources
                </button>
              )}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 xl:gap-4">
              {featured.map((item) => (
                <ResourceCard
                  key={item.id}
                  item={item}
                  saved={favoriteIds.includes(item.id)}
                  onToggleSaved={toggleFavorite}
                  featured
                />
              ))}
            </div>
          </section>
        )}

        {room === 'browse' && <section aria-labelledby="all-library-resources">
          <div className="mb-3 xl:mb-4">
            <h2 id="all-library-resources" className="text-lg font-extrabold text-navy xl:text-2xl">
              <span className="xl:hidden">{(LIBRARY_FILTERS.find((f) => f.key === filter) ?? LIBRARY_FILTERS[0]).label} · {resources.length}</span>
              <span className="hidden xl:inline">All resources</span>
            </h2>
            <p className="mt-1 hidden text-sm text-gray-600 xl:block">Every public resource in this part of the library.</p>
          </div>
          {resources.length === 0 ? (
            <EmptyState title="No resources match that search" hint="Try a different word, or choose All resources." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 xl:gap-4">
              {resources.map((item) => (
                <ResourceCard
                  key={item.id}
                  item={item}
                  saved={favoriteIds.includes(item.id)}
                  onToggleSaved={toggleFavorite}
                />
              ))}
            </div>
          )}
        </section>}

        {room === 'mine' && <section id="your-device-library" aria-labelledby="your-device-library-heading" className="flex flex-col gap-4 xl:block xl:border-t xl:border-navy/10 xl:pt-8">
          <div className="hidden max-w-3xl xl:block">
            <p className="text-sm font-bold uppercase tracking-[0.15em] text-teal-700">Your device library</p>
            <h2 id="your-device-library-heading" className="mt-1 text-2xl font-extrabold text-navy">Keep your own media close.</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-600">Files and links below are stored only on this device. {APP_SHORT_NAME} does not upload them to a server.</p>
          </div>

          {/* THE PLAYER MOVED TO THE MUSIC ROOM on 4 October 2026 ("take out the
              audio tools from the library"): the full player, both kinds of
              playlist and the calming sounds. The files did not move, and each
              one here keeps its own Play button for a quick listen. */}
          <div className="contents xl:mt-5 xl:grid xl:grid-cols-[1.1fr_0.9fr] xl:gap-5">
            <Card className="order-4 p-4 xl:order-none xl:p-5" data-panel="music-moved">
              <h3 className="flex items-center gap-2 text-base font-bold text-navy xl:text-xl"><MusicGlyph size={22} /> Music has its own room</h3>
              <p className="mt-1 text-sm text-gray-600 xl:hidden">The player, playlists and calming sounds are in Music now.</p>
              <p className="mt-1 hidden text-sm text-gray-600 xl:block">
                The media player, playlists and calming sounds are in the Music room now, with a tuner and a
                conductor&rsquo;s beat for the choir. Your music is still here, and each file still plays on its own.
              </p>
              <Link
                href="/music"
                className="tap-sm mt-3 inline-flex items-center rounded-xl bg-navy px-4 text-sm font-bold text-white xl:mt-4"
              >
                Open the Music room
              </Link>
            </Card>

            <Card className="order-1 p-4 xl:order-none xl:p-5">
              <h3 className="text-base font-bold text-navy xl:text-xl">Add to this device</h3>
              <p className="mt-1 text-sm text-gray-500 xl:hidden" data-device-note>
                A book, video, music, a picture or a link. Kept only on this device; {APP_SHORT_NAME} never uploads it.
              </p>
              <p className="mt-1 hidden text-sm text-gray-500 xl:block">Upload a book, video, music, or image. You can also add a safe https:// link.</p>
              <input ref={fileRef} type="file" multiple onChange={onFiles} className="hidden" />
              <div className="mt-3 flex flex-wrap gap-2 xl:mt-4">
                <Button variant="gold" className="max-xl:px-4 max-xl:text-base" disabled={busy} onClick={() => fileRef.current?.click()}>
                  {busy ? 'Saving…' : '⬆️ Upload files'}
                </Button>
                {/* The link form is three boxes and a button: on a phone it
                    waits behind this until somebody wants it. */}
                <Button variant="ghost" className="max-xl:px-4 max-xl:text-base xl:hidden" aria-expanded={linkOpen} onClick={() => setLinkOpen((o) => !o)}>
                  🔗 {linkOpen ? 'Close' : 'Add a link'}
                </Button>
              </div>
              <div className={`mt-4 gap-2 rounded-2xl bg-slate-50 p-3 ${linkOpen ? 'grid' : 'hidden xl:grid'}`} data-link-form>
                <label className="text-sm font-bold text-navy" htmlFor="library-link-title">Add a link</label>
                <input
                  id="library-link-title"
                  value={linkTitle}
                  onChange={(event) => setLinkTitle(event.target.value)}
                  placeholder="Title (for example, Sabbath School video)"
                  className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-black/5"
                />
                <input
                  value={linkUrl}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  placeholder="https://…"
                  inputMode="url"
                  className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-black/5"
                />
                <input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="A short note (optional)"
                  className="tap w-full min-w-0 rounded-xl bg-white px-4 text-base ring-1 ring-black/5"
                />
                <div><Button variant="ghost" onClick={addLink}>➕ Add link</Button></div>
              </div>
            </Card>
          </div>

          {toast && <p role="status" className="order-2 rounded-xl bg-navy px-4 py-3 text-center font-semibold text-white xl:mt-4">{toast}</p>}

          <div className="order-3 xl:mt-5">
            {!ready ? (
              <p className="text-center text-gray-400">Loading your device library…</p>
            ) : items.length === 0 ? (
              <EmptyState title="Your device library is empty" hint="Upload a file or add a link to get started." />
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {items.map((item) => (
                  <DeviceMediaCard
                    key={item.id}
                    item={item}
                    playing={playing === item.id}
                    theme={theme}
                    onTogglePlayer={() => setPlaying(playing === item.id ? null : item.id)}
                    onShare={() => void share(item)}
                    onDownload={() => void download(item)}
                    onRemove={() => void remove(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>}
      </main>

      {/* MY FILES IS A TAB, SO THE BAR IS HERE TOO. This page runs outside
          both shells on purpose (its own header and its own way back), which
          would have made it the one screen where the bar vanished -- tapping
          My Files and losing Menu and People with it. Whoever is signed in,
          on either half; nobody signed in, no bar. */}
      {barRole && <TabBar role={barRole} />}
    </div>
  );
}
