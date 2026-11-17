'use client';

// Discover: a row of app cards on Home, on its own and never inside Church &
// Mission Updates (lib/discover.ts says where the apps come from and why no
// news is ever here). Each card opens its app, goes into the Pocket with one
// tap, or is skipped with × and stays skipped on this device.

import { useEffect, useState } from 'react';
import { discoverCards, discoverLinks, readSkipped, skip, type DiscoverCard } from '@/lib/discover';
import { addToLocalPocket, type PocketAdd } from '@/lib/pocket';

type Said = Record<string, string>;

function words(r: PocketAdd): string {
  if (r === 'added') return 'In your Pocket';
  if (r === 'have') return 'Already in your Pocket';
  if (r === 'full') return 'Your Pocket is full. Remove one first.';
  return r.refused;
}

/** The app's own logo, fetched by this app's server (app/api/app-icon), on its own colours. */
function Cover({ card }: { card: DiscoverCard }) {
  const [failed, setFailed] = useState(false);
  return (
    <span aria-hidden className="grid aspect-[16/9] w-full place-items-center"
      style={{ background: 'linear-gradient(135deg, #0f766e, #134e4a 60%, #0b1b33)' }}>
      {failed ? (
        <span className="text-4xl">📱</span>
      ) : (
        <img src={`/api/app-icon?url=${encodeURIComponent(card.url)}`} alt="" loading="lazy" decoding="async"
          onError={() => setFailed(true)} className="h-16 w-16 rounded-2xl bg-white object-contain p-2 shadow" />
      )}
    </span>
  );
}

export function DiscoverRow({ addToPocket = async (u, l) => addToLocalPocket(u, l) }: {
  /** Where a kept card goes. The live app passes its database; the sample keeps it in the browser. */
  addToPocket?: (url: string, label: string) => Promise<PocketAdd>;
}) {
  const [skipped, setSkipped] = useState<string[] | null>(null);
  const [said, setSaid] = useState<Said>({});
  useEffect(() => { setSkipped(readSkipped()); }, []);
  if (skipped === null) return null;

  const cards = discoverCards(discoverLinks(process.env.NEXT_PUBLIC_DISCOVER_LINKS), skipped);
  if (cards.length === 0) return null;

  const keep = async (c: DiscoverCard) => {
    setSaid((s) => ({ ...s, [c.key]: 'Adding…' }));
    try {
      const r = await addToPocket(c.url, c.title.slice(0, 40));
      setSaid((s) => ({ ...s, [c.key]: words(r) }));
    } catch {
      setSaid((s) => ({ ...s, [c.key]: 'That could not be added. Try again.' }));
    }
  };

  return (
    <section aria-labelledby="discover-apps" data-discover>
      <h2 id="discover-apps" className="mb-2 text-xl font-bold text-room">Discover apps</h2>
      <ul className="thin-scroll -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2">
        {cards.map((c) => {
          const note = said[c.key];
          const done = note === 'In your Pocket' || note === 'Already in your Pocket';
          return (
            <li key={c.key} data-discover-card="app"
              className="relative flex w-64 shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-navy/10">
              <Cover card={c} />
              <button type="button" onClick={() => setSkipped(skip(c.key))} data-discover-skip
                aria-label={`Skip ${c.title}`}
                className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full bg-white/90 text-xl leading-none text-gray-700 shadow">
                {'×'}
              </button>
              <span className="flex flex-1 flex-col p-4">
              <span className="text-xs font-bold uppercase tracking-wide text-teal-800">
                App
              </span>
              <span className="mt-0.5 line-clamp-2 text-base font-bold leading-snug text-navy">{c.title}</span>
              {c.about && <span className="mt-1 line-clamp-2 text-sm text-gray-700">{c.about}</span>}
              <span className="mt-auto flex flex-wrap gap-2 pt-3">
                <a href={c.url} target="_blank" rel="noopener noreferrer"
                  className="tap-sm inline-flex items-center rounded-full bg-navy px-4 text-sm font-semibold text-white">
                  Open
                </a>
                <button type="button" disabled={done || note === 'Adding…'} onClick={() => void keep(c)} data-discover-keep
                  className="tap-sm rounded-full bg-white px-4 text-sm font-semibold text-navy ring-1 ring-navy/15 disabled:opacity-60">
                  {done ? '✓ Kept' : 'Add to Pocket'}
                </button>
              </span>
              {note && <span role="status" className="mt-2 text-xs font-semibold text-gray-700" data-discover-said>{note}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
