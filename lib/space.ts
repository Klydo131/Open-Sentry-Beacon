// How full the church is, in words a Director can act on.
//
// ---------------------------------------------------------------------------
// Supabase's free plan gives a church 500 MB of database and 1 GB of files,
// and a church that pays gets far more. Asked for on 18 November 2026: a church
// on the free plan must run well and know where it stands, and a church that
// pays must be told it is on the bigger allowance. The numbers come from
// public.church_space() (supabase/migrations/20261118120000), which only a
// church's leaders may call and which returns totals and nothing else.
//
// Pure functions only, so tests/the-plan-sets-the-allowance.mjs can hold
// every sentence without a browser or a database.
// ---------------------------------------------------------------------------

export type Plan = 'free' | 'paid';

export interface ChurchSpace {
  plan: Plan;
  database_bytes: number;
  file_bytes: number;
  database_limit: number;
  file_limit: number;
  person_limit: number;
}

export type Level = 'roomy' | 'watch' | 'act';

/** Whole numbers a person reads: "180 MB", "1.2 GB". */
export function size(bytes: number): string {
  const mb = Math.max(0, bytes) / (1024 * 1024);
  if (mb < 1) return 'under 1 MB';
  if (mb < 1024) return `${Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb < 10 ? gb.toFixed(1) : Math.round(gb)} GB`;
}

/** Percent of the limit used, 0 to 100, never more. */
export function share(used: number, limit: number): number {
  if (!(limit > 0)) return 0;
  return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

/** Under 70% is roomy, under 90% is worth watching, past that act now. */
export function level(percent: number): Level {
  if (percent >= 90) return 'act';
  if (percent >= 70) return 'watch';
  return 'roomy';
}

/** One sentence for one meter. */
export function advice(what: 'database' | 'files', percent: number, plan: Plan): string {
  const l = level(percent);
  if (l === 'roomy') return 'Plenty of room.';
  if (what === 'files') {
    if (l === 'watch') return 'Getting full. Ask people to remove old files and videos they no longer need.';
    return plan === 'free'
      ? 'Nearly full. New uploads may soon be refused. Remove old files, or move the church to a paid plan.'
      : 'Nearly full. Remove old files, or raise the plan in Supabase.';
  }
  if (l === 'watch') return 'Getting full. This grows slowly; check again next month.';
  return plan === 'free'
    ? 'Nearly full. Move the church to a paid plan before it stops taking new records.'
    : 'Nearly full. Raise the plan in Supabase.';
}

/** What the plan means, for the card's first line. */
export function planLine(space: ChurchSpace): string {
  if (space.plan === 'paid') {
    return `On a paid plan. Each person may keep up to ${size(space.person_limit)} of files.`;
  }
  return `On the free plan. Each person may keep up to ${size(space.person_limit)} of files, `
    + 'and the database is woken every day so it is never paused (on Vercel, by itself).';
}
