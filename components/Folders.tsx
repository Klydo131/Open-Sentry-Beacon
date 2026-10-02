'use client';

// Folders for the Office's own documents: Sabbath programs and evangelistic
// meetings.
//
// Asked for on 2 October 2026: "Both Sabbath school and evangelistic meetings
// can have multiple storage files place in the sub-room to be organize". The
// owner chose folders: a program or a series is put in a folder by naming
// one, and the list shows each folder as a group that opens and shuts.
//
// A FOLDER IS A NAME, NOT A THING THAT HAS TO EXIST FIRST. Typing a new name
// makes the folder; moving the last item out of it makes it go. Nothing to
// create, rename or empty, and nothing to get out of step.

import { useId, type ReactNode } from 'react';
import { FIELD } from '@/components/SabbathProgram';
import { byFolder } from '@/lib/folders';

export { byFolder, folderNames } from '@/lib/folders';

/** A list drawn in its folders. With no folders in use, it is just the list. */
export function FolderedList<T>({ items, folderOf, label, render }: {
  items: T[];
  folderOf: (item: T) => string;
  /** What the list holds, for screen readers: "Your Sabbath programs". */
  label: string;
  render: (item: T) => ReactNode;
}) {
  const groups = byFolder(items, folderOf);
  if (groups.length === 1 && groups[0].folder === '') {
    return <ul className="mt-4 space-y-2" aria-label={label}>{groups[0].items.map(render)}</ul>;
  }
  return (
    <div className="mt-4 space-y-3" aria-label={label} role="group">
      {groups.map((g) => (g.folder === '' ? (
        <ul key="" className="space-y-2" aria-label="Not in a folder">{g.items.map(render)}</ul>
      ) : (
        <details key={g.folder} open className="rounded-xl bg-navy/[0.03] p-2" data-folder={g.folder}>
          <summary className="tap-sm flex cursor-pointer items-center gap-2 px-2 font-bold text-navy">
            <span aria-hidden>📁</span>
            <span className="min-w-0 flex-1 truncate">{g.folder}</span>
            <span className="text-sm font-semibold text-gray-600">{g.items.length}</span>
          </summary>
          <ul className="mt-1 space-y-2">{g.items.map(render)}</ul>
        </details>
      )))}
    </div>
  );
}

/** The box that puts an item in a folder: type a new name, or pick one already used. */
export function FolderField({ value, folders, max, onChange }: {
  value: string;
  folders: string[];
  max: number;
  onChange: (folder: string) => void;
}) {
  const listId = useId();
  return (
    <label className="block">
      <span className="text-sm font-semibold text-navy">Folder</span>
      <input
        aria-label="Folder"
        value={value}
        maxLength={max}
        list={listId}
        placeholder="No folder. Type one, e.g. Youth Week"
        onChange={(e) => onChange(e.target.value.replace(/[\r\n\t]+/g, ' ').slice(0, max))}
        className={`tap-sm ${FIELD}`}
      />
      <datalist id={listId}>
        {folders.map((f) => <option key={f} value={f} />)}
      </datalist>
    </label>
  );
}
