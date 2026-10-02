// Folders for the Office's own documents, as plain functions: a folder is a
// name on an item, and these group by it. components/Folders.tsx draws them.

/** Items grouped by folder: the ones in no folder first, then each folder by name. */
export function byFolder<T>(items: T[], folderOf: (item: T) => string): Array<{ folder: string; items: T[] }> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const f = folderOf(item).trim();
    groups.set(f, [...(groups.get(f) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b, undefined, { sensitivity: 'base' })))
    .map(([folder, list]) => ({ folder, items: list }));
}

/** The folder names in use, for suggesting. */
export function folderNames<T>(items: T[], folderOf: (item: T) => string): string[] {
  return [...new Set(items.map(folderOf).map((f) => f.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}
