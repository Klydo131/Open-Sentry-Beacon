'use client';

// Church & Mission Updates on Home: what is new at the Adventist organisations
// a person follows, from each organisation's own news.
//
// The stories come from this app's server (app/api/updates), never from the
// phone to another site, and are drawn as plain text. An organisation whose
// feed gives nothing is still offered, as a link to its news page. In the
// tutorial nothing is fetched: the stories are samples and say so.

import { useEffect, useMemo, useState } from 'react';
import { ORGANISATIONS, WORLD_CHURCH, featured, organisation, type Organisation } from '@/lib/updates/organisations';
import type { Story } from '@/lib/updates/feed';
import { postedWhen } from '@/components/HomeBoard';

const FOLLOWING_KEY = 'hb-updates-following';
const KEPT_KEY = 'hb-updates-kept';
const SHOWN = 6;

type ByOrg = Record<string, Story[]>;

/** Invented for the tutorial. Each opens the organisation's real news page. */
const SAMPLE: ByOrg = {
  gc: [
    { title: 'Preparing for mission together', summary: 'A sample headline. In your church’s app, the General Conference’s latest stories appear here.', link: 'https://adventist.news/', date: null },
  ],
  ssd: [
    { title: 'New learning resources for church leaders', summary: 'A sample headline. In your church’s app, the Division’s latest stories appear here.', link: 'https://news.adventist.asia/all', date: null },
  ],
};

function readList(key: string): string[] | null {
  try {
    const kept = JSON.parse(localStorage.getItem(key) ?? 'null');
    const known = Array.isArray(kept) ? kept.filter((id) => typeof id === 'string' && organisation(id)) : [];
    return known.length ? known : null;
  } catch {
    return null;
  }
}

function Tile({ org }: { org: Organisation }) {
  return (
    <span
      aria-hidden
      className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-[11px] font-extrabold tracking-wide"
      style={{ background: org.colour, color: '#ffffff' }}
    >
      {org.short}
    </span>
  );
}

export function ChurchUpdates({ sample = false }: { sample?: boolean }) {
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

      <ul className="space-y-3">
        {cards.map(({ org, story }, at) => (
          <li key={story.link + story.title} className="home-rise" style={{ animationDelay: `${at * 60}ms` }}>
            <a href={story.link} target="_blank" rel="noopener noreferrer" data-update-card={org.id}
              className="lift-hover flex gap-4 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-navy/10">
              <Tile org={org} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold uppercase tracking-wide text-gray-600">
                  {org.short}{story.date ? ` · ${postedWhen(story.date)}` : ''}
                </span>
                <span className="mt-0.5 block text-lg font-bold leading-snug text-navy">{story.title}</span>
                {story.summary && <span className="mt-1 line-clamp-2 block text-sm text-gray-700">{story.summary}</span>}
                <span className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
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
              className="lift-hover flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-navy/10">
              <Tile org={org} />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-bold text-navy">See what is new at the {org.name}</span>
                <span className="block text-sm text-gray-600">Opens its own news page.</span>
              </span>
              <span aria-hidden className="text-xl text-navy">&rarr;</span>
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
