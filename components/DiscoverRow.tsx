'use client';

// Discover: a row of app cards on Home, on its own and never inside Church &
// Mission Updates (lib/discover.ts says where the apps come from and why no
// news is ever here). Each card opens its app, goes into the Pocket with one
// tap, or is skipped with × and stays skipped on this device.

import { useCallback, useEffect, useState } from 'react';
import { checkNewApp, discoverCards, discoverLinks, readSkipped, skip, type DiscoverCard, type DiscoverLink } from '@/lib/discover';
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

/** Where the church's own apps are kept: the database in the live app, this browser in the tutorial. */
export interface AppShelf {
  list: () => Promise<DiscoverLink[]>;
  add: (link: DiscoverLink) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function DiscoverRow({ addToPocket = async (u, l) => addToLocalPocket(u, l), shelf, canManage = false }: {
  /** Where a kept card goes. The live app passes its database; the sample keeps it in the browser. */
  addToPocket?: (url: string, label: string) => Promise<PocketAdd>;
  /** The church's own apps. */
  shelf?: AppShelf;
  /** Admins and Executive Directors add and remove the church's apps. */
  canManage?: boolean;
}) {
  const [skipped, setSkipped] = useState<string[] | null>(null);
  const [said, setSaid] = useState<Said>({});
  const [own, setOwn] = useState<DiscoverLink[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ title: '', url: '', about: '' });
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!shelf) return;
    try { setOwn(await shelf.list()); } catch { /* no apps yet */ }
  }, [shelf]);
  useEffect(() => { setSkipped(readSkipped()); void load(); }, [load]);
  if (skipped === null) return null;

  const cards = discoverCards([...discoverLinks(process.env.NEXT_PUBLIC_DISCOVER_LINKS), ...own], skipped);
  if (cards.length === 0 && !canManage) return null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shelf) return;
    const checked = checkNewApp(form.title, form.url);
    if ('refused' in checked) { setProblem(checked.refused); return; }
    setBusy(true);
    try {
      await shelf.add({ ...checked.link, about: form.about.trim().slice(0, 120) });
      setForm({ title: '', url: '', about: '' });
      setAdding(false);
      setProblem('');
      await load();
    } catch (cause) {
      setProblem(cause instanceof Error ? cause.message : 'That could not be added.');
    } finally { setBusy(false); }
  };

  const takeOff = async (id: string) => {
    if (!shelf) return;
    setBusy(true);
    try { await shelf.remove(id); await load(); }
    catch (cause) { setProblem(cause instanceof Error ? cause.message : 'That could not be removed.'); }
    finally { setBusy(false); }
  };

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
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="discover-apps" className="text-xl font-bold text-room">Discover apps</h2>
        {canManage && shelf && (
          <button type="button" onClick={() => { setAdding((a) => !a); setProblem(''); }} aria-expanded={adding}
            data-discover-add className="tap-sm rounded-full bg-navy px-4 text-sm font-semibold text-white">
            {adding ? 'Close' : '+ Add an app'}
          </button>
        )}
      </div>
      {canManage && cards.length === 0 && !adding && (
        <p className="mb-2 text-sm text-gray-600">Add the apps and study sites your church recommends. Everybody in the church sees them here.</p>
      )}
      {adding && (
        <form onSubmit={save} className="mb-3 grid gap-2 rounded-2xl bg-white p-4 ring-1 ring-navy/10" data-discover-form>
          <label className="grid gap-1 text-sm font-semibold text-navy">Name
            <input value={form.title} maxLength={60} onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="rounded-xl px-3 py-2 text-base font-normal ring-1 ring-navy/15" placeholder="For example, Hope Study" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-navy">Web address
            <input value={form.url} inputMode="url" onChange={(e) => setForm({ ...form, url: e.target.value })}
              className="rounded-xl px-3 py-2 text-base font-normal ring-1 ring-navy/15" placeholder="https://" />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-navy">One line about it (optional)
            <input value={form.about} maxLength={120} onChange={(e) => setForm({ ...form, about: e.target.value })}
              className="rounded-xl px-3 py-2 text-base font-normal ring-1 ring-navy/15" />
          </label>
          {problem && <p role="alert" className="text-sm font-semibold text-red-700">{problem}</p>}
          <button type="submit" disabled={busy} className="tap rounded-xl bg-navy py-2 text-sm font-bold text-white disabled:opacity-50">
            Add to Discover
          </button>
        </form>
      )}
      {problem && !adding && <p role="alert" className="mb-2 text-sm font-semibold text-red-700">{problem}</p>}
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
              {canManage && c.id && (
                <button type="button" disabled={busy} onClick={() => void takeOff(c.id as string)} data-discover-remove
                  className="mt-2 self-start text-sm text-gray-600 underline underline-offset-2 disabled:opacity-40">
                  Take off Discover for everybody
                </button>
              )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
