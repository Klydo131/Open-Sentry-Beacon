'use client';

// The pocket, on the desk. See lib/pocket.ts for why the marks are drawn
// rather than fetched, and why this lives in the browser rather than a table.

import { useCallback, useEffect, useState } from 'react';
import {
  type Pocket as Item, POCKET_LIMIT, labelFor, markFor, readPocket, tidyUrl, writePocket,
} from '@/lib/pocket';

type Theme = { panel: string; line: string; ink: string; inkSoft: string };

export function Pocket({ theme, className = '' }: { theme: Theme; className?: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  // Which tiles have no logo to show. Kept per render rather than stored:
  // a site that was down once should get another chance tomorrow.
  const [failed, setFailed] = useState<Set<string>>(new Set());

  // Read after mount, never during render: the server has no localStorage, so
  // reading it while rendering makes the first paint disagree with the second.
  useEffect(() => { setItems(readPocket()); }, []);

  const save = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const tidy = tidyUrl(url);
    if (!tidy) {
      setError('That does not look like a web address. Try pasting the whole thing.');
      return;
    }
    if (items.some((i) => i.url === tidy)) {
      setError('That one is already in your pocket.');
      return;
    }
    if (items.length >= POCKET_LIMIT) {
      setError(`The pocket holds ${POCKET_LIMIT}. Remove one to add another.`);
      return;
    }
    const next = [...items, { id: `${Date.now()}`, url: tidy, label: labelFor(tidy) }];
    setItems(next);
    writePocket(next);
    setUrl('');
    setError('');
    setAdding(false);
  }, [items, url]);

  const remove = useCallback((id: string) => {
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    writePocket(next);
  }, [items]);

  return (
    <div
      className={`rounded-2xl p-4 ${className}`}
      style={{ backgroundColor: theme.panel, border: `1px solid ${theme.line}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: theme.inkSoft }}
        >
          Pocket
        </p>
        <button
          type="button"
          onClick={() => { setAdding((a) => !a); setError(''); }}
          aria-expanded={adding}
          className="grid h-7 w-7 place-items-center rounded-lg text-lg leading-none"
          style={{ color: theme.inkSoft }}
          aria-label={adding ? 'Close the address box' : 'Add a web app to your pocket'}
        >
          {adding ? '\u00d7' : '+'}
        </button>
      </div>

      {items.length === 0 && !adding && (
        <p className="mt-1 text-sm" style={{ color: theme.inkSoft }}>
          Paste a web address and it waits here. Tap it to go straight there.
        </p>
      )}

      {items.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {items.map((i) => {
            const mark = markFor(i.url);
            return (
              <div key={i.id} className="group relative">
                <a
                  href={i.url}
                  target="_blank"
                  // noreferrer as well as noopener: the new tab must not be
                  // handed a window it can navigate, and the site being opened
                  // has no business knowing which page sent the person.
                  rel="noopener noreferrer"
                  title={i.label}
                  className="tap flex flex-col items-center gap-1"
                >
                  {/* THE REAL LOGO, FETCHED BY THIS APP'S OWN SERVER.
                      Asked for: "I wanted to see the logo of the web app please
                      if there is a logo." The src is our own origin, so the
                      content policy stays `img-src 'self' data: blob:` with
                      nothing widened, and a member's phone never contacts
                      Spotify or Facebook to draw a tile. See
                      app/api/app-icon/route.ts for why the server does it.

                      The drawn mark stays underneath and shows through whenever
                      a site has no logo, or the fetch fails, or the person is
                      offline -- so this can only ever add, never regress. */}
                  <span
                    aria-hidden
                    className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-xl text-lg font-bold text-white"
                    style={{ backgroundColor: mark.color }}
                  >
                    {!failed.has(i.id) && (
                      <img
                        src={`/api/app-icon?url=${encodeURIComponent(i.url)}`}
                        alt=""
                        loading="lazy"
                        onError={() => setFailed((f) => new Set(f).add(i.id))}
                        className="absolute inset-0 h-full w-full bg-white object-contain p-1.5"
                      />
                    )}
                    {mark.glyph}
                  </span>
                  <span className="w-full truncate text-center text-[10px]" style={{ color: theme.ink }}>
                    {i.label}
                  </span>
                </a>
                <button
                  type="button"
                  onClick={() => remove(i.id)}
                  aria-label={`Remove ${i.label} from your pocket`}
                  // Always reachable, not hover-only: a phone has no hover, and
                  // a control that only exists on a mouse is not a control.
                  className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-gray-200 text-xs leading-none text-gray-600"
                >
                  {'\u00d7'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <form onSubmit={save} className="mt-3 space-y-2">
          <input
            type="text"
            inputMode="url"
            autoFocus
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(''); }}
            placeholder="Paste a web address"
            aria-label="Web address"
            className="w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gold"
            style={{ backgroundColor: theme.line, color: theme.ink }}
          />
          {error && <p className="text-xs font-semibold text-red-600">{error}</p>}
          <button
            type="submit"
            className="tap w-full rounded-xl py-2 text-sm font-bold text-white"
            style={{ backgroundColor: '#1E2A4A' }}
          >
            Save
          </button>
        </form>
      )}
    </div>
  );
}
