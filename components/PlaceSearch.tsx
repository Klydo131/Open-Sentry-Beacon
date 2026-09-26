'use client';

// Where to meet: type part of a name, see the places it could be, tap one.
//
// ASKED FOR, 26 September 2026: "I can't see my destination if it's really
// going to be that destination unless I already input the destination. I need
// to see the destination name, like auto name in google search, then just
// click or tap it to secure the location."
//
// So the box does three things a plain text box did not:
//
//   1. It SUGGESTS as you type -- places you have met before first, then places
//      from the map -- each with its street, barangay, city and province, so
//      the right branch of a restaurant with five branches can be told apart.
//   2. Tapping one SECURES it: what is saved is that place's name and address
//      plus a map link to its exact spot (lib/live/place-pin.ts), so the other
//      person opens the place that was chosen, not a guess from the words.
//   3. It SHOWS what was chosen, with a way to check it on the map before
//      anybody is asked to go there, and a way to change it.
//
// Typing an address by hand, or pasting a map link, still works exactly as it
// did. A suggestion is an offer, not a gate: the search can be down, the place
// can be too small to be on any map, and neither may stop two people meeting.
//
// One component for both halves of the app. The live app passes a search that
// asks the church's own server; the sample app passes a list of sample places,
// because the sample app talks to nothing (tests/no-backend.js).

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { hasLink, placeUrl, wordsBesideLink } from '@/lib/live/meeting-link';
import { matchedParts, pinOf, pinFor, type PlaceSuggestion } from '@/lib/live/place-pin';
import {
  CheckGlyph, ClockGlyph, CloseGlyph, ExternalGlyph, PencilGlyph, PinGlyph, SearchGlyph,
} from '@/components/Glyph';

/** Wait for a pause in the typing before asking, rather than asking per key. */
const PAUSE_MS = 350;

type Option =
  | { kind: 'before'; value: string; words: string }
  | { kind: 'place'; place: PlaceSuggestion };

/** The typed letters in bold, the rest of the name in the row's own weight. */
function Matched({ text, typed }: { text: string; typed: string }) {
  const parts = matchedParts(text, typed);
  if (!parts.some((p) => p.hit)) return <span className="font-semibold">{text}</span>;
  return (
    <>
      {parts.map((p, i) => p.hit
        ? <span key={i} data-match="" className="font-extrabold">{p.text}</span>
        : <span key={i} className="font-medium">{p.text}</span>)}
    </>
  );
}

/** The round mark at the start of every row: a pin, a clock, a pencil. */
function Mark({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600">
      {children}
    </span>
  );
}

export function PlaceSearch({
  value,
  onChange,
  search,
  history = [],
  source,
  label = 'Where you are meeting',
  hint,
}: {
  /** The appointment's place, as it will be saved. */
  value: string;
  onChange: (value: string) => void;
  /** Suggestions for what has been typed. Throws with a readable sentence when it cannot answer. */
  search: (q: string) => Promise<PlaceSuggestion[]>;
  /** Places this pair used before, most recent first, as they were saved. */
  history?: string[];
  /** Who the suggestions come from, said under them: OpenStreetMap asks to be credited. */
  source: 'openstreetmap' | 'sample';
  label?: string;
  /** A line under the box saying how to use it. Hidden while the list is open, when it would only be in the way. */
  hint?: ReactNode;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [places, setPlaces] = useState<PlaceSuggestion[]>([]);
  const [looking, setLooking] = useState(false);
  const [asked, setAsked] = useState('');
  const [failed, setFailed] = useState('');
  const [active, setActive] = useState(-1);
  // The same words asked twice are answered from here, not asked again.
  const answers = useRef(new Map<string, PlaceSuggestion[]>());
  const latest = useRef('');
  // Held in a ref, so a parent that hands over a new function on every render
  // does not restart the pause before every search.
  const searchRef = useRef(search);
  searchRef.current = search;

  const pinned = pinOf(value) !== null;
  const typed = value.trim();
  // A pasted link is a place already; there is nothing to look up.
  const searchable = !pinned && !hasLink(typed) && typed.length >= 3;

  useEffect(() => {
    if (!open || !searchable) { setLooking(false); return; }
    const q = typed.toLowerCase();
    const known = answers.current.get(q);
    if (known) { setPlaces(known); setAsked(typed); setFailed(''); return; }
    latest.current = q;
    setLooking(true);
    const timer = setTimeout(() => {
      searchRef.current(typed)
        .then((found) => {
          answers.current.set(q, found);
          // Only the answer to what is in the box NOW is drawn: a slow answer to
          // an earlier half-word must not replace a quicker one to the whole word.
          if (latest.current !== q) return;
          setPlaces(found); setAsked(typed); setFailed(''); setActive(-1);
        })
        .catch((cause) => {
          if (latest.current !== q) return;
          setPlaces([]); setAsked(typed);
          setFailed(cause instanceof Error && cause.message ? cause.message : 'Place search is not available right now.');
        })
        .finally(() => { if (latest.current === q) setLooking(false); });
    }, PAUSE_MS);
    return () => clearTimeout(timer);
  }, [typed, open, searchable]);

  // PLACES YOU HAVE MET BEFORE COME FIRST: the likeliest answer is the place
  // used last time, and it costs nobody a search.
  const before = useMemo(() => {
    const q = typed.toLowerCase();
    return history
      .map((v) => ({ value: v, words: hasLink(v) ? wordsBesideLink(v) || v : v }))
      .filter((h) => h.value !== value && (!q || pinned || h.words.toLowerCase().includes(q)))
      .slice(0, 3);
  }, [history, typed, value, pinned]);

  // A place already offered as "met here before" is not offered again below
  // it: the same spot twice reads as two places.
  const spot = (lat: number, lon: number) => `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const beforeSpots = new Set(before.map((h) => pinOf(h.value)).flatMap((p) => (p ? [spot(p.lat, p.lon)] : [])));
  const fresh = places.filter((p) => !beforeSpots.has(spot(p.lat, p.lon)));

  const options: Option[] = [
    ...before.map((h) => ({ kind: 'before' as const, ...h })),
    ...(searchable && asked === typed ? fresh : []).map((place) => ({ kind: 'place' as const, place })),
  ];
  const showList = open && !pinned && (options.length > 0 || looking || !!failed || (searchable && asked === typed));

  const pick = (o: Option) => {
    onChange(o.kind === 'before' ? o.value : pinFor(o.place));
    setOpen(false);
    setActive(-1);
  };

  // ---------------------------------------------------------------------------
  // CHOSEN: say where, let it be checked, let it be changed.
  //
  // It reads as settled -- a tick, the name large, the address under it -- so
  // nobody wonders whether the tap took. The map button is quiet on purpose:
  // the one gold button on this form is the one that sends it.
  // ---------------------------------------------------------------------------
  if (pinned) {
    const words = wordsBesideLink(value);
    const [name, ...rest] = words.split(', ');
    const map = placeUrl('in_person', value);
    return (
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-teal-700/25" data-place-chosen="">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm font-bold text-teal-800">
            <CheckGlyph size={18} /> Meeting here
          </p>
          <button
            type="button"
            onClick={() => { onChange(name || ''); setOpen(true); }}
            className="tap-sm -mr-2 px-3 text-sm font-semibold text-navy underline underline-offset-2"
          >
            Change
          </button>
        </div>
        <div className="mt-1 flex items-start gap-3">
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-teal-50 text-teal-700">
            <PinGlyph size={20} />
          </span>
          <div className="min-w-0 pt-1">
            <p className="break-words text-lg font-bold leading-snug text-navy">{name || 'The pinned place'}</p>
            {rest.length > 0 && <p className="mt-0.5 break-words text-sm leading-snug text-gray-600">{rest.join(', ')}</p>}
          </div>
        </div>
        {map && (
          <a
            href={map}
            target="_blank"
            rel="noopener noreferrer"
            className="tap-sm mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-navy ring-1 ring-navy/15 hover:bg-slate-50"
          >
            Check it on the map <ExternalGlyph size={16} />
          </a>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // TYPING: the box, and what it could be.
  // ---------------------------------------------------------------------------
  // Top-aligned, so the mark sits beside the name and not halfway down a
  // three-line address.
  const rowClass = 'flex min-h-0 w-full items-start gap-3 border-t border-black/5 px-3 py-3 text-left first:border-t-0';
  return (
    <div>
      <div className="relative">
        <SearchGlyph size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          // Closed a moment later, so a tap on a suggestion lands before it goes.
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!showList || options.length === 0) { if (e.key === 'Escape') setOpen(false); return; }
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % options.length); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a <= 0 ? options.length - 1 : a - 1)); }
            else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(options[active]); }
            else if (e.key === 'Escape') setOpen(false);
          }}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label={label}
          autoComplete="off"
          enterKeyHint="search"
          // Short enough to be read whole on a phone: the example lives in the
          // hint under the box, where it has room.
          placeholder="Search for a place"
          className={`tap w-full rounded-xl bg-white pl-12 text-base ring-1 ring-navy/10 outline-none focus:ring-2 focus:ring-teal-600 ${value ? 'pr-12' : 'pr-4'}`}
        />
        {value && (
          <button
            type="button"
            aria-label="Clear the place"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { onChange(''); setOpen(true); setActive(-1); }}
            className="tap-sm absolute right-1 top-1/2 grid w-11 -translate-y-1/2 place-items-center rounded-full text-gray-500 hover:text-navy"
          >
            <CloseGlyph size={18} />
          </button>
        )}
      </div>

      {showList ? (
        <div className="mt-2 overflow-hidden rounded-2xl bg-white shadow-lg shadow-navy/10 ring-1 ring-navy/10" data-place-suggestions="">
          <ul id={listId} role="listbox" aria-label="Places">
            {options.map((o, i) => {
              const title = o.kind === 'before' ? o.words.split(', ')[0] : o.place.name;
              const under = o.kind === 'before'
                ? o.words.split(', ').slice(1).join(', ')
                : o.place.detail;
              // What sort of place it is, in front of where it is: "Fast food ·
              // Aguinaldo Highway, Imus". On the name's own line it pushed long
              // names onto a second line of their own.
              const lead = o.kind === 'before' ? 'Met here before' : o.place.kind;
              return (
                <li key={o.kind === 'before' ? `b-${o.value}` : `p-${o.place.lat}-${o.place.lon}-${o.place.name}`}>
                  <button
                    type="button"
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={active === i}
                    // Keeps the box focused, so the tap is not lost to the blur.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(o)}
                    className={`${rowClass} ${active === i ? 'bg-navy/[0.06]' : 'hover:bg-slate-50'}`}
                  >
                    <Mark>{o.kind === 'before' ? <ClockGlyph size={18} /> : <PinGlyph size={18} />}</Mark>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words leading-snug text-navy">
                        <Matched text={title} typed={pinned ? '' : typed} />
                      </span>
                      {(lead || under) && (
                        <span className="mt-0.5 block break-words text-sm leading-snug text-gray-600">
                          {lead && <span className="font-medium text-gray-700">{lead}</span>}
                          {lead && under && ' · '}
                          {under}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {looking && (
            <p className="flex items-center gap-3 border-t border-black/5 px-4 py-3 text-sm text-gray-600 first:border-t-0">
              <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border-2 border-slate-300 border-t-navy motion-safe:animate-spin" />
              Looking for places…
            </p>
          )}
          {!looking && failed && (
            <p className="border-t border-black/5 px-4 py-3 text-sm text-gray-600 first:border-t-0">
              {failed} You can still type the address, or paste a map link.
            </p>
          )}
          {!looking && !failed && searchable && asked === typed && places.length === 0 && (
            <p className="border-t border-black/5 px-4 py-3 text-sm text-gray-600 first:border-t-0">
              Nothing found for &ldquo;{typed}&rdquo;. Try adding the town, or use what you typed.
            </p>
          )}
          {searchable && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setOpen(false)}
              className={`${rowClass} hover:bg-slate-50`}
            >
              <Mark><PencilGlyph size={18} /></Mark>
              <span className="min-w-0 flex-1">
                <span className="block break-words font-semibold leading-snug text-navy">Use &ldquo;{typed}&rdquo; as typed</span>
                <span className="mt-0.5 block text-sm leading-snug text-gray-600">Without a pin on the map</span>
              </span>
            </button>
          )}
          <p className="border-t border-black/5 bg-slate-50 px-4 py-2 text-xs text-gray-500">
            {/* OpenStreetMap's own short form of the credit, which fits one line. */}
            {source === 'openstreetmap' ? '© OpenStreetMap contributors' : 'Sample places, for trying the app'}
          </p>
        </div>
      ) : hint ? (
        <p className="mt-1.5 text-sm leading-snug text-gray-600">{hint}</p>
      ) : null}
    </div>
  );
}
