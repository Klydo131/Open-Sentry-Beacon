'use client';

// The Office's plans as a file manager: folders you open, and plans you move
// and share without opening them.
//
// Asked for on 13 November 2026.
//
// WHAT IT ADDS TO THE FOLDERS THAT WERE THERE (components/Folders.tsx). A folder
// was a heading in one long list, and the only way to move a plan was to open
// it and retype its folder's name. Here the folders are tiles you open, with a
// path back to All plans; every plan's row says who can see it (Only you,
// Guides, Explorers, Everyone) and carries Move to, a single menu. Sharing
// itself stays inside the plan, where its copy is checked before anyone sees
// it; the row only says how it stands, and opens it in one tap.
//
// A folder is still a name on a plan (lib/folders.ts): New folder… asks for a
// name and moves the plan into it, and a folder with nothing left in it goes.

import { useState, type ReactNode } from 'react';
import { byFolder, folderNames } from '@/lib/folders';
import type { PlanAudience } from '@/components/SabbathProgram';
import { ChevronGlyph } from '@/components/Glyph';

/** A short word for who sees a plan, for its row. */
function audienceWord(to: PlanAudience | undefined): string {
  return to === 'guides' ? 'Guides' : to === 'all' ? 'Explorers' : to === 'church' ? 'Everyone' : 'Only you';
}

const NEW = '\u0000new';
const OUT = '\u0000out';

export function PlanShelf<T>({ items, idOf, folderOf, title, detail, sharedTo, onOpen, onMove, label, max, rowMark }: {
  items: T[];
  idOf: (item: T) => string;
  folderOf: (item: T) => string;
  title: (item: T) => string;
  detail: (item: T) => string;
  sharedTo: (item: T) => PlanAudience | undefined;
  onOpen: (id: string) => void;
  onMove: (id: string, folder: string) => void;
  /** What the shelf holds, for screen readers: "Your Sabbath programs". */
  label: string;
  /** The longest folder name a plan keeps. */
  max: number;
  /** The row's marker for the walks: `data-program-row`. */
  rowMark: string;
}) {
  const [inside, setInside] = useState<string | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const groups = byFolder(items, folderOf);
  const folders = folderNames(items, folderOf);
  // The folder that was open can empty out under it (its last plan moved).
  const here = inside !== null && folders.includes(inside) ? inside : null;
  const loose = groups.find((g) => g.folder === '')?.items ?? [];
  const shown = here === null ? loose : groups.find((g) => g.folder === here)?.items ?? [];

  const move = (id: string, value: string) => {
    if (value === NEW) { setNaming(id); setNewName(''); return; }
    onMove(id, value === OUT ? '' : value);
  };
  const keepNew = (id: string) => {
    const name = newName.trim().slice(0, max);
    if (name) onMove(id, name);
    setNaming(null);
  };

  const row = (item: T): ReactNode => {
    const id = idOf(item);
    const to = sharedTo(item);
    return (
      <li key={id} className="rounded-xl bg-white ring-1 ring-navy/10" data-shelf-item>
        <div className="flex items-center gap-2 pr-2">
          <button
            type="button"
            onClick={() => onOpen(id)}
            {...{ [rowMark]: '' }}
            className="tap flex min-w-0 flex-1 items-center gap-3 rounded-xl px-4 py-2 text-left transition hover:bg-navy/5"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-navy">{title(item)}</span>
              <span className="flex min-w-0 items-center gap-2 text-sm text-gray-600">
                <span
                  className={`shrink-0 rounded-md px-1.5 text-xs font-bold leading-5 ${to ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-gray-600'}`}
                  title={to ? `Shared with ${audienceWord(to)}` : 'Not shared'}
                  data-shelf-who={to ?? 'me'}
                >
                  {audienceWord(to)}
                </span>
                <span className="truncate">{detail(item)}</span>
              </span>
            </span>
            <ChevronGlyph />
          </button>
          {/* A small folder button over the browser's own list: one tap opens
              Move to, with nothing to read past and no width taken from the name. */}
          <label className="relative grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg bg-navy/5 text-navy hover:bg-navy/10" title="Move to a folder">
            <span aria-hidden className="text-lg">📂</span>
            <span className="sr-only">Move {title(item)} to a folder</span>
            <select
              value=""
              onChange={(e) => move(id, e.target.value)}
              data-shelf-move
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            >
              <option value="" disabled>Move to…</option>
              {folderOf(item).trim() !== '' && <option value={OUT}>Out of the folder</option>}
              {folders.filter((f) => f !== folderOf(item).trim()).map((f) => <option key={f} value={f}>📁 {f}</option>)}
              <option value={NEW}>New folder…</option>
            </select>
          </label>
        </div>
        {naming === id && (
          <form
            className="flex items-center gap-2 px-3 pb-3"
            onSubmit={(e) => { e.preventDefault(); keepNew(id); }}
            data-shelf-new-folder
          >
            <input
              autoFocus
              value={newName}
              maxLength={max}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Folder name"
              aria-label="New folder name"
              className="tap-sm min-w-0 flex-1 rounded-lg px-3 ring-1 ring-navy/20"
            />
            <button type="submit" className="tap-sm rounded-lg bg-navy px-3 text-sm font-bold text-white">Move here</button>
            <button type="button" onClick={() => setNaming(null)} className="tap-sm rounded-lg px-2 text-sm text-gray-600">Cancel</button>
          </form>
        )}
      </li>
    );
  };

  return (
    <div className="mt-4" aria-label={label} role="group" data-plan-shelf>
      {/* Where you are: All plans, or All plans › a folder. */}
      <nav aria-label="Where you are" className="mb-3 flex flex-wrap items-center gap-1 text-sm font-semibold">
        <button
          type="button"
          onClick={() => setInside(null)}
          aria-current={here === null ? 'page' : undefined}
          className={`tap-sm rounded-lg px-2 ${here === null ? 'text-navy' : 'text-gray-600 underline underline-offset-2'}`}
          data-shelf-all
        >
          All plans
        </button>
        {here !== null && (
          <>
            <span aria-hidden className="text-gray-400">›</span>
            <span className="px-2 text-navy" aria-current="page">📁 {here}</span>
          </>
        )}
      </nav>

      {here === null && folders.length > 0 && (
        <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Folders">
          {groups.filter((g) => g.folder !== '').map((g) => (
            <li key={g.folder}>
              <button
                type="button"
                onClick={() => setInside(g.folder)}
                className="tap flex w-full items-center gap-2 rounded-xl bg-navy/[0.04] px-3 py-2 text-left ring-1 ring-navy/10 transition hover:bg-navy/10"
                data-shelf-folder={g.folder}
              >
                <span aria-hidden className="text-xl">📁</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-navy">{g.folder}</span>
                  <span className="block text-xs text-gray-600">
                    {g.items.length} {g.items.length === 1 ? 'plan' : 'plans'}
                    {g.items.some((x) => sharedTo(x)) ? ` · ${g.items.filter((x) => sharedTo(x)).length} shared` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {shown.length > 0 ? (
        <ul className="space-y-2" aria-label={here === null ? 'Not in a folder' : `In ${here}`}>{shown.map(row)}</ul>
      ) : here === null && folders.length > 0 ? null : (
        <p className="text-sm text-gray-600">Nothing here yet.</p>
      )}
    </div>
  );
}
