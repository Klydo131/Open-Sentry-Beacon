// The names of the study rooms kept on this device, and how to delete them all.
//
// Its own file, with no imports, because lib/live/kept.ts calls it at sign-out
// from every screen in the app, and the study room's own sources bring the
// editor's libraries with them (lib/study/local-source.ts).

const PREFIX = 'beacon-study';
/** The names made on this device, so signing out can find every one. */
const REGISTRY = 'beacon.study-local';

export function localRoomName(ownerId: string, workspaceId: string): string {
  return `${PREFIX}:${ownerId}:${workspaceId}`;
}

export function rememberLocalRoom(name: string) {
  try {
    const list = JSON.parse(localStorage.getItem(REGISTRY) || '[]') as string[];
    if (!list.includes(name)) localStorage.setItem(REGISTRY, JSON.stringify([...list, name]));
  } catch {
    // Storage refused: the database is still found by its prefix where the
    // browser can list databases.
  }
}

/** Delete every study room this device holds. Called when somebody signs out. */
export async function forgetEveryLocalRoom(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const names = new Set<string>();
  try {
    for (const n of JSON.parse(localStorage.getItem(REGISTRY) || '[]') as string[]) names.add(n);
  } catch { /* nothing remembered */ }
  try {
    const listed = await (indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> }).databases?.();
    for (const d of listed ?? []) if (d.name?.startsWith(`${PREFIX}:`)) names.add(d.name);
  } catch { /* this browser cannot list them; the registry above is what there is */ }
  await Promise.all([...names].map((name) => new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  })));
  try { localStorage.removeItem(REGISTRY); } catch { /* nothing to clear */ }
}

/**
 * A different person is using this device: the last person's rooms go, as
 * their kept screens do (lib/live/kept.ts), even if they never signed out.
 */
export async function forgetOtherPeoplesRooms(ownerId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const mine = `${PREFIX}:${ownerId}:`;
  const names = new Set<string>();
  try {
    for (const n of JSON.parse(localStorage.getItem(REGISTRY) || '[]') as string[]) names.add(n);
  } catch { /* nothing remembered */ }
  try {
    const listed = await (indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> }).databases?.();
    for (const d of listed ?? []) if (d.name?.startsWith(`${PREFIX}:`)) names.add(d.name);
  } catch { /* cannot list: the registry is what there is */ }
  const theirs = [...names].filter((n) => !n.startsWith(mine) && !n.endsWith(':probe:probe'));
  await Promise.all(theirs.map((name) => new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(name);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  })));
  try {
    localStorage.setItem(REGISTRY, JSON.stringify([...names].filter((n) => n.startsWith(mine))));
  } catch { /* tried again next time */ }
}
