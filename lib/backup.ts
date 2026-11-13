// Data export / backup for a church.
//
// The whole point: the church owns its data. It can take a full copy out
// whenever it wants (a real safety net), and put a copy back (restore). Kept
// dependency-free — a backup is just JSON, a roster is just CSV, both readable
// with tools every church already has (Notepad, Excel, Google Sheets).

import type { DB, Stage } from './types';
import { stageInfo } from './brand';

export const BACKUP_VERSION = 1;

// The on-disk shape of a backup file. `data` is the entire demo DB; the wrapper
// records what/when so a restore can sanity-check before replacing anything.
export interface BackupFile {
  app: 'beacon';
  version: number;
  exported_at: string;
  church_name: string;
  data: DB;
}

// Every array collection on the DB. Used to validate and forward-fill on import
// (older backups may predate newer collections).
const COLLECTIONS: (keyof DB)[] = [
  'profiles',
  'pairings',
  'messages',
  'materials',
  'material_shares',
  'journey_events',
  'notifications',
  'analytics',
  'seeker_media',
  'prayer_requests',
  'lesson_assignments',
  'meetings',
  'invites',
];

// Turn the live DB into a backup file (pretty-printed for human inspection).
export function serializeBackup(db: DB): string {
  const file: BackupFile = {
    app: 'beacon',
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    church_name: db.church_name || 'Our Church',
    data: db,
  };
  return JSON.stringify(file, null, 2);
}

// A short filename-safe slug of the church name.
export function backupSlug(churchName: string): string {
  const base =
    (churchName || 'church')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'church';
  const date = new Date().toISOString().slice(0, 10);
  return `beacon-backup-${base}-${date}`;
}

export type ParseResult =
  | { ok: true; db: DB; meta: { church_name: string; exported_at: string; profiles: number; pairings: number } }
  | { ok: false; error: string };

// Read a backup file's text and validate it enough to safely restore. Missing
// newer collections are forward-filled with []; a missing church_name defaults.
// Anything that isn't a Beacon backup is rejected with a friendly message.
export function parseBackup(text: string): ParseResult {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file isn’t readable. Choose a Beacon backup file (.json).' };
  }
  if (!root || typeof root !== 'object') {
    return { ok: false, error: 'That file isn’t a Beacon backup.' };
  }
  const obj = root as Record<string, unknown>;
  if (obj.app !== 'beacon') {
    return { ok: false, error: 'That file isn’t a Beacon backup.' };
  }
  const data = obj.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'This backup is missing its data.' };
  }
  // Every present collection must be an array; missing ones are filled in.
  const clean = { ...data } as Record<string, unknown>;
  for (const key of COLLECTIONS) {
    const v = clean[key];
    if (v === undefined) clean[key] = [];
    else if (!Array.isArray(v)) {
      return { ok: false, error: 'This backup looks damaged and can’t be restored.' };
    }
  }
  if (typeof clean.church_name !== 'string' || !clean.church_name) {
    clean.church_name = (typeof obj.church_name === 'string' && obj.church_name) || 'Our Church';
  }
  const db = clean as unknown as DB;
  return {
    ok: true,
    db,
    meta: {
      church_name: db.church_name,
      exported_at: typeof obj.exported_at === 'string' ? obj.exported_at : '',
      profiles: db.profiles.length,
      pairings: db.pairings.length,
    },
  };
}

// A plain, spreadsheet-friendly roster of seekers and where they are on the
// journey — the kind of record a church secretary can keep. Detailed (names +
// stage), so this is an admin export, matching the local/global data split.
export function rosterCsv(db: DB): string {
  const nameById = new Map(db.profiles.map((p) => [p.id, p.full_name]));
  const rows: string[][] = [
    ['Explorer', 'City', 'Journey stage', 'Track', 'Guide', 'Started'],
  ];
  for (const pr of db.pairings) {
    const seeker = nameById.get(pr.ds_id) ?? 'Unknown';
    const guide = nameById.get(pr.dm_id) ?? 'Unassigned';
    const seekerProfile = db.profiles.find((p) => p.id === pr.ds_id);
    rows.push([
      seeker,
      seekerProfile?.city_of_residence ?? '',
      stageInfo(pr.journey_stage as Stage).label,
      pr.track === 'digital' ? 'Digital' : 'Traditional',
      guide,
      pr.created_at ? new Date(pr.created_at).toLocaleDateString() : '',
    ]);
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

// Quote a CSV cell if it contains a comma, quote, or newline; double inner quotes.
function csvCell(s: string): string {
  const v = String(s ?? '');
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}
