'use client';

// The pocket, on the desk. See lib/pocket.ts for why the marks are drawn
// rather than fetched, and why this lives in the browser rather than a table.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useIsLive } from '@/lib/tutorial';
import { useKeepUp, KEEP_UP_POCKET } from '@/lib/live/keep-up';
import * as live from '@/lib/live/data';
import {
  type Pocket as Item, POCKET_LIMIT, labelFor, markFor, pocketRefusal, readPocket,
  tidyUrl, writePocket,
} from '@/lib/pocket';
import { humanError } from '@/lib/live/errors';

type Theme = { panel: string; line: string; ink: string; inkSoft: string };

export function Pocket({ theme, className = '' }: { theme: Theme; className?: string }) {
  // WHERE THE TILES LIVE DEPENDS ON WHO IS ASKING.
  //
  // Signed in, they are rows in pocket_apps and follow the person to any
  // device, which is what was asked for. In the tutorial there is no account to
  // own a row, so the browser keeps them exactly as before -- somebody trying
  // the app out should not be told to sign in before they can pin a shortcut.
  const isLive = useIsLive();
  const [items, setItems] = useState<Item[]>([]);
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  // Which tiles have no logo to show. Kept per render rather than stored:
  // a site that was down once should get another chance tomorrow.
  const [failed, setFailed] = useState<Set<string>>(new Set());

  // Read after mount, never during render: the server has no localStorage, so
  // reading it while rendering makes the first paint disagree with the second.
  const adopted = useRef(false);

  const load = useCallback(async () => {
    if (!isLive) { setItems(readPocket()); return; }
    try {
      const rows = await live.myPocket();

      // NOTHING SAVED BEFORE TODAY IS LOST. Anybody who used the pocket while
      // it lived in the browser has tiles there and no rows at all, and a
      // straight switch would have shown them an empty pocket and looked like
      // the feature had eaten their shortcuts. Their existing tiles go up once,
      // the first time they open it signed in, and the local copy is left
      // alone so a failure halfway through costs nothing.
      if (rows.length === 0 && !adopted.current) {
        adopted.current = true;
        const local = readPocket();
        if (local.length > 0) {
          for (const item of local) {
            try { await live.addPocketApp(item.url, item.label); } catch { /* keep going */ }
          }
          setItems(await live.myPocket());
          return;
        }
      }
      setItems(rows.map((r) => ({ id: r.id, url: r.url, label: r.label })));
    } catch (cause) {
      setError(humanError(cause, 'Your pocket could not be loaded.'));
    }
  }, [isLive]);

  useEffect(() => { void load(); }, [load]);
  // A tile saved on a phone lands on the laptop without a reload, which is the
  // whole reason these are rows rather than browser storage.
  useKeepUp(KEEP_UP_POCKET, load);

  const save = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const tidy = tidyUrl(url);
    if (!tidy) {
      setError('That does not look like a web address. Try pasting the whole thing.');
      return;
    }
    // THE POLICY, AFTER THE SAFETY CHECK AND BEFORE ANYTHING IS SAVED. It
    // refuses with a reason, because a tile that simply fails to appear reads
    // as a broken app rather than a decision the church made.
    const refused = pocketRefusal(tidy);
    if (refused) {
      setError(refused);
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
    const label = labelFor(tidy);
    setUrl('');
    setError('');
    setAdding(false);
    if (isLive) {
      void live.addPocketApp(tidy, label)
        .then(load)
        .catch((cause) => setError(humanError(cause, 'That could not be saved.')));
      return;
    }
    const next = [...items, { id: `${Date.now()}`, url: tidy, label }];
    setItems(next);
    writePocket(next);
  }, [items, url, isLive, load]);

  const remove = useCallback((id: string) => {
    if (isLive) {
      void live.removePocketApp(id)
        .then(load)
        .catch((cause) => setError(humanError(cause, 'That could not be removed.')));
      return;
    }
    const next = items.filter((i) => i.id !== id);
    setItems(next);
    writePocket(next);
  }, [items, isLive, load]);

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

      {/* SAID TO EVERYBODY, BEFORE THEY TRY. "with a disclosure of course to
          every user" was the request, and a rule somebody only meets as a
          refusal is a rule they experience as the app being broken. It sits
          under the tiles whether or not anybody has one. */}
      <p className="mt-2 text-[11px] leading-snug" style={{ color: theme.inkSoft }}>
        Social feeds are not kept here, so they are not one tap from a study.
        YouTube is the exception.
      </p>

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

      {error && !adding && (
        <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>
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
