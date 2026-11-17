'use client';

// Church & Mission Updates on Home: what is new at the Adventist organisations
// a person follows, from each organisation's own news.
//
// The stories come from this app's server (app/api/updates), never from the
// phone to another site, and are drawn as plain text. An organisation whose
// feed gives nothing is still offered, as a link to its news page. In the
// tutorial nothing is fetched: the stories are samples and say so.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ORGANISATIONS, WORLD_CHURCH, featured, organisation, type Organisation } from '@/lib/updates/organisations';
import type { Story } from '@/lib/updates/feed';
import { postedWhen } from '@/components/HomeBoard';
import { scrollMotion } from '@/lib/motion';
import { DiscoverRow } from '@/components/DiscoverRow';
import type { PocketAdd } from '@/lib/pocket';

const FOLLOWING_KEY = 'hb-updates-following';
const KEPT_KEY = 'hb-updates-kept';
const SHOWN = 6;

type ByOrg = Record<string, Story[]>;

/**
 * Invented for the tutorial, with original drawings (public/updates) in place
 * of a church's photos. Each opens the organisation's real news page.
 */
const SAMPLE: ByOrg = {
  gc: [
    { title: 'Preparing for mission together', summary: 'A sample headline. In your church’s app, the General Conference’s latest stories and their photos appear here.', link: 'https://adventist.news/', date: null, image: '/updates/sample-sunrise.svg' },
    { title: 'Bible study groups grow in every region', summary: 'A sample headline. Each story shows the picture from the organisation’s own site.', link: 'https://adventist.news/', date: null, image: '/updates/sample-book.svg' },
  ],
  ssd: [
    { title: 'New learning resources for church leaders', summary: 'A sample headline. In your church’s app, the Division’s latest stories appear here.', link: 'https://news.adventist.asia/all', date: null, image: '/updates/sample-community.svg' },
    { title: 'Youth camp meets in the highlands', summary: 'A sample headline. Tap a story to read it on the organisation’s own site.', link: 'https://news.adventist.asia/all', date: null, image: '/updates/sample-mountains.svg' },
  ],
};

/**
 * A picture only from this app: the picture route, or the tutorial's own
 * drawings. Anything else a response carried is ignored, so the content policy
 * (`img-src 'self'`) is never the only thing standing in the way.
 */
export function ownPicture(src: string | undefined): string | null {
  if (!src) return null;
  if (/^\/api\/updates\/picture\?org=[a-z]{2,12}&n=\d{1,2}$/.test(src)) return src;
  if (/^\/updates\/sample-[a-z]+\.svg$/.test(src)) return src;
  return null;
}

/** The story's photo, or the organisation's colours when it has none or it fails. */
function Picture({ src, org, className = '', onMissing }: {
  src: string | null; org: Organisation; className?: string; onMissing?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span aria-hidden className={`grid place-items-center ${className}`}
        style={{ background: `linear-gradient(135deg, ${org.colour}, ${org.colour}cc 55%, #0b1b33)` }}>
        <span className="text-3xl font-extrabold tracking-wider text-white/90">{org.short}</span>
      </span>
    );
  }
  return (
    <img src={src} alt="" loading="lazy" decoding="async" className={`object-cover ${className}`}
      onError={() => { setFailed(true); onMissing?.(); }} />
  );
}

/**
 * GOOD NEWS: the newest stories with photos, big, one at a time. It moves on
 * by itself every few seconds unless the device asked for less motion or the
 * person has touched it, and every slide is a link to the story.
 */
function GoodNews({ slides }: { slides: { org: Organisation; story: Story; src: string }[] }) {
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [at, setAt] = useState(0);
  const [held, setHeld] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const shown = slides.filter((s) => !gone.has(s.src)).slice(0, 5);

  useEffect(() => {
    if (held || shown.length < 2) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => setAt((i) => (i + 1) % shown.length), 6000);
    return () => window.clearInterval(timer);
  }, [held, shown.length]);

  useEffect(() => {
    const el = track.current;
    if (el) el.scrollTo({ left: el.clientWidth * at, behavior: scrollMotion() });
  }, [at]);

  if (shown.length === 0) return null;
  return (
    <div className="mb-4" data-good-news onPointerDown={() => setHeld(true)} onFocus={() => setHeld(true)}>
      <div ref={track} className="flex snap-x snap-mandatory overflow-x-auto rounded-3xl shadow-md [scrollbar-width:none]"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth) setAt(Math.round(el.scrollLeft / el.clientWidth));
        }}>
        {shown.map(({ org, story, src }) => (
          <a key={src} href={story.link} target="_blank" rel="noopener noreferrer" data-good-news-slide={org.id}
            className="relative block aspect-[16/10] w-full shrink-0 snap-start overflow-hidden bg-navy sm:aspect-[16/7]">
            <Picture src={src} org={org} className="absolute inset-0 h-full w-full"
              onMissing={() => setGone((g) => new Set(g).add(src))} />
            <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
            <span className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
              <span className="inline-block rounded-full bg-white/90 px-2.5 py-0.5 text-xs font-bold text-navy">
                {org.short}{story.date ? ` · ${postedWhen(story.date)}` : ''}
              </span>
              <span className="mt-2 line-clamp-2 block text-xl font-bold leading-snug text-white sm:text-2xl">{story.title}</span>
            </span>
          </a>
        ))}
      </div>
      {shown.length > 1 && (
        <div className="mt-2 flex justify-center gap-1" role="group" aria-label="Choose a story">
          {shown.map((s, i) => (
            <button key={s.src} type="button" aria-label={`Story ${i + 1} of ${shown.length}`} aria-current={i === at ? true : undefined} data-good-news-dot
              onClick={() => { setHeld(true); setAt(i); }}
              className="grid h-8 w-8 place-items-center">
              <span className={`block h-2 rounded-full transition-all ${i === at ? 'w-6 bg-teal-700' : 'w-2 bg-gray-400'}`} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function readList(key: string): string[] | null {
  try {
    const kept = JSON.parse(localStorage.getItem(key) ?? 'null');
    const known = Array.isArray(kept) ? kept.filter((id) => typeof id === 'string' && organisation(id)) : [];
    return known.length ? known : null;
  } catch {
    return null;
  }
}

export function ChurchUpdates({ sample = false, addToPocket }: {
  sample?: boolean;
  /** Where a Discover card goes when kept. Left out, the browser's Pocket (the sample). */
  addToPocket?: (url: string, label: string) => Promise<PocketAdd>;
}) {
  const [following, setFollowing] = useState<string[]>(() => featured(process.env.NEXT_PUBLIC_UPDATES_FEATURED));
  const [show, setShow] = useState('all');
  const [choosing, setChoosing] = useState(false);
  const [stories, setStories] = useState<ByOrg | null>(sample ? SAMPLE : null);

  // What this device chose, read after the first draw so server and browser agree.
  useEffect(() => {
    const chosen = readList(FOLLOWING_KEY);
    if (chosen) setFollowing(chosen);
  }, []);

  const wanted = following.join(',');
  useEffect(() => {
    if (sample) return;
    let alive = true;
    let kept: ByOrg = {};
    try { kept = JSON.parse(localStorage.getItem(KEPT_KEY) ?? '{}') as ByOrg; } catch { /* nothing kept */ }
    void Promise.all(wanted.split(',').filter(Boolean).map(async (id) => {
      try {
        const answer = await fetch(`/api/updates?org=${encodeURIComponent(id)}`);
        const body = answer.ok ? await answer.json() as { stories?: Story[] } : null;
        return [id, Array.isArray(body?.stories) ? body.stories : kept[id] ?? []] as const;
      } catch {
        // No signal: what was read last time, if anything.
        return [id, kept[id] ?? []] as const;
      }
    })).then((pairs) => {
      if (!alive) return;
      const next = Object.fromEntries(pairs);
      setStories(next);
      try { localStorage.setItem(KEPT_KEY, JSON.stringify(next)); } catch { /* storage refused */ }
    });
    return () => { alive = false; };
  }, [wanted, sample]);

  const orgs = useMemo(
    () => following.map((id) => organisation(id)).filter((o): o is Organisation => !!o),
    [following],
  );
  const inView = show === 'all' ? orgs : orgs.filter((o) => o.id === show);
  const cards = inView
    .flatMap((org) => (stories?.[org.id] ?? []).map((story) => ({ org, story })))
    .sort((a, b) => (b.story.date ?? '').localeCompare(a.story.date ?? ''))
    .slice(0, SHOWN);
  // An organisation with nothing to list is still one tap from its own news.
  const quiet = stories ? inView.filter((org) => (stories[org.id] ?? []).length === 0) : [];

  const follow = (id: string, on: boolean) => {
    const next = on ? [...following, id] : following.filter((f) => f !== id);
    if (next.length === 0) return;
    setFollowing(next);
    if (!next.includes(show)) setShow('all');
    try { localStorage.setItem(FOLLOWING_KEY, JSON.stringify(next)); } catch { /* storage refused */ }
  };

  const chip = (on: boolean) => `tap-sm shrink-0 rounded-full px-4 text-sm font-semibold ring-1 ${
    on ? 'bg-teal-700 text-white ring-teal-700' : 'bg-white text-gray-700 ring-gray-300'}`;

  return (
    <section aria-labelledby="church-updates" data-church-updates>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="church-updates" className="text-xl font-bold text-room">Church &amp; Mission Updates</h2>
        {sample && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Sample</span>
        )}
      </div>

      <div className="thin-scroll -mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
        <button type="button" aria-pressed={show === 'all'} onClick={() => setShow('all')} className={chip(show === 'all')}>All</button>
        {orgs.map((org) => (
          <button key={org.id} type="button" title={org.name} aria-pressed={show === org.id}
            onClick={() => setShow(show === org.id ? 'all' : org.id)} className={chip(show === org.id)}>
            {org.short}
          </button>
        ))}
        <button type="button" aria-expanded={choosing} onClick={() => setChoosing((v) => !v)}
          className="tap-sm shrink-0 rounded-full px-3 text-sm font-semibold text-navy underline underline-offset-2">
          {choosing ? 'Done' : 'Choose'}
        </button>
      </div>

      {choosing && (
        <div className="mb-3 rounded-2xl bg-white p-4 ring-1 ring-navy/10" data-updates-chooser>
          <p className="text-sm font-semibold text-navy">Whose updates do you want on Home?</p>
          <ul className="mt-2 space-y-1">
            {ORGANISATIONS.map((org) => {
              const on = following.includes(org.id);
              return (
                <li key={org.id}>
                  <label className="tap-sm flex cursor-pointer items-center gap-3 rounded-xl px-2 text-base text-gray-800">
                    <input type="checkbox" className="h-5 w-5" checked={on}
                      disabled={on && following.length === 1}
                      onChange={(e) => follow(org.id, e.target.checked)} />
                    <span><strong className="text-navy">{org.short}</strong> · {org.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-sm text-gray-600">
            Looking for another division or union?{' '}
            <a href={WORLD_CHURCH} target="_blank" rel="noopener noreferrer" className="font-semibold text-navy underline">
              The world church lists them all
            </a>. More are added here as each one&rsquo;s own news address is confirmed.
          </p>
        </div>
      )}


      {stories === null && <p className="text-sm text-gray-600" role="status">Looking for what is new&hellip;</p>}

      <GoodNews slides={cards.flatMap(({ org, story }) => {
        const src = ownPicture(story.image);
        return src ? [{ org, story, src }] : [];
      })} />

      {stories && (
        <DiscoverRow
          addToPocket={addToPocket}
          stories={orgs.flatMap((org) => (stories[org.id] ?? []).map((st) => ({
            title: st.title, link: st.link, summary: st.summary ?? undefined, date: st.date,
            image: ownPicture(st.image) ?? undefined, colour: org.colour,
            source: `${org.short}${st.date ? ` · ${postedWhen(st.date)}` : ''}`,
          }))).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))}
        />
      )}

      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map(({ org, story }, at) => (
          <li key={story.link + story.title} className="home-rise" style={{ animationDelay: `${at * 60}ms` }}>
            <a href={story.link} target="_blank" rel="noopener noreferrer" data-update-card={org.id}
              className="lift-hover flex h-full flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-navy/10">
              <Picture src={ownPicture(story.image)} org={org} className="aspect-[16/9] w-full" />
              <span className="flex min-w-0 flex-1 flex-col p-4">
                <span className="block text-xs font-bold uppercase tracking-wide text-gray-600">
                  {org.short}{story.date ? ` · ${postedWhen(story.date)}` : ''}
                </span>
                <span className="mt-0.5 block text-lg font-bold leading-snug text-navy">{story.title}</span>
                {story.summary && <span className="mt-1 line-clamp-2 block text-sm text-gray-700">{story.summary}</span>}
                <span className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2 text-sm">
                  <span className="italic text-gray-600">Source: {org.name}</span>
                  <span className="font-semibold text-navy underline underline-offset-2">Read update &rarr;</span>
                </span>
              </span>
            </a>
          </li>
        ))}
        {quiet.map((org) => (
          <li key={org.id}>
            <a href={org.news} target="_blank" rel="noopener noreferrer" data-update-link={org.id}
              className="lift-hover flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-navy/10">
              <Picture src={null} org={org} className="aspect-[16/6] w-full" />
              <span className="flex items-center gap-3 p-4">
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-navy">See what is new at the {org.name}</span>
                  <span className="block text-sm text-gray-600">Opens its own news page.</span>
                </span>
                <span aria-hidden className="text-xl text-navy">&rarr;</span>
              </span>
            </a>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-gray-600">
        Official-source updates, opened on each organisation&rsquo;s own site. Your church&rsquo;s announcements stay private.
      </p>
    </section>
  );
}
