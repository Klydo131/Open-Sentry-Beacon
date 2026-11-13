'use client';

// The search box in the header: find a room, a setting, a look or a help
// answer by any word in it (lib/app-search.ts). On a phone it is a magnifier
// that opens a box across the header; wider, the box is always there.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { search, type Findable } from '@/lib/app-search';
import { SearchGlyph } from '@/components/Glyph';

/**
 * `header`: a magnifier on a phone, a box on a tablet; gone from 1280px, where
 * the box sits in the left menu instead, under the app's name (`sidebar`).
 * Asked for on 13 November 2026..
 */
export function AppSearch({ place = 'header' }: { place?: 'header' | 'sidebar' }) {
  const side = place === 'sidebar';
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLInputElement>(null);
  // In the left menu, which scrolls, the list is pinned to the screen under the
  // box, so the menu's edge does not cut it off.
  const [under, setUnder] = useState<{ top: number; left: number } | null>(null);
  const measure = () => {
    const r = box.current?.parentElement?.getBoundingClientRect();
    if (r) setUnder({ top: r.bottom + 8, left: r.left });
  };
  const results = useMemo(() => search(q), [q]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => { if (phoneOpen) box.current?.focus(); }, [phoneOpen]);

  const go = (f: Findable | undefined) => {
    if (!f) return;
    setQ(''); setOpen(false); setPhoneOpen(false);
    router.push(f.href);
  };

  return (
    <div className={side ? 'relative' : 'relative xl:hidden'} data-app-search={place}>
      <button
        type="button"
        onClick={() => setPhoneOpen(true)}
        aria-label="Search the app"
        className={`tap-sm grid w-11 place-items-center rounded-full bg-white/15 hover:bg-white/25 sm:hidden ${side ? '!hidden' : ''}`}
        data-app-search-open
      >
        <SearchGlyph />
      </button>
      <div
        style={phoneOpen ? { top: 'calc(var(--beacon-chrome-top, 0px) + 8px)' } : undefined}
        className={side
          ? 'flex items-center gap-2 rounded-full bg-white/10 px-3 ring-1 ring-white/15'
          : `${phoneOpen ? 'fixed inset-x-2 z-[60] flex' : 'hidden'} items-center gap-2 rounded-full bg-white px-3 text-navy shadow-lg sm:static sm:z-auto sm:flex sm:bg-white/15 sm:text-inherit sm:shadow-none sm:ring-1 sm:ring-white/25`}
      >
        <span aria-hidden className="opacity-70"><SearchGlyph /></span>
        <input
          ref={box}
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); if (side) measure(); }}
          onFocus={() => { setOpen(true); if (side) measure(); }}
          onBlur={() => setTimeout(() => { setOpen(false); if (!q) setPhoneOpen(false); }, 150)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
            if (e.key === 'Escape') { setQ(''); setOpen(false); setPhoneOpen(false); }
          }}
          placeholder="Search the app"
          aria-label="Search the app"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="app-search-results"
          aria-activedescendant={results[active] ? `app-search-${active}` : undefined}
          className={`tap-sm w-full min-w-0 bg-transparent text-base outline-none placeholder:text-current placeholder:opacity-60 ${side ? '' : 'sm:w-36 lg:w-56'}`}
          data-app-search-box
        />
        {phoneOpen && (
          <button type="button" onClick={() => { setQ(''); setPhoneOpen(false); }}
            className="tap-sm shrink-0 px-2 text-sm font-semibold sm:hidden">
            Close
          </button>
        )}
      </div>
      {open && q.trim() && (
        <ul
          id="app-search-results"
          role="listbox"
          // Never wider than the screen, wherever it is anchored.
          style={side
            ? { top: under?.top ?? 0, left: under?.left ?? 0, maxWidth: 'calc(100vw - 1rem)', width: 'min(24rem, calc(100vw - 1rem))' }
            : { top: 'calc(var(--beacon-chrome-top, 0px) + 64px)', maxWidth: 'calc(100vw - 1rem)', width: 'min(24rem, calc(100vw - 1rem))' }}
          className={side
            ? 'fixed z-[60] max-h-[70vh] max-h-[70dvh] overflow-y-auto rounded-2xl bg-white p-1 text-navy shadow-xl ring-1 ring-black/10'
            : 'fixed inset-x-2 z-[60] max-h-[70vh] max-h-[70dvh] overflow-y-auto rounded-2xl bg-white p-1 text-navy shadow-xl ring-1 ring-black/10 sm:absolute sm:inset-x-auto sm:right-0 sm:!top-full sm:mt-2'}
          data-app-search-results
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-gray-600">
              Nothing found for &ldquo;{q.trim()}&rdquo;. Try another word, or open Help.
            </li>
          ) : results.map((f, i) => (
            <li key={`${f.href}-${f.title}`} id={`app-search-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(f)}
                onMouseEnter={() => setActive(i)}
                className={`flex min-h-[48px] w-full flex-col items-start rounded-xl px-3 py-2 text-left ${i === active ? 'bg-slate-100' : ''}`}
              >
                <span className="font-semibold">{f.title}</span>
                <span className="text-sm text-gray-600">{f.where}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
