// Does a source that cannot reach the database say so?
//
// ---------------------------------------------------------------------------
// Run by tests/a-room-that-already-exists-still-opens.mjs. DocEngine swallows
// whatever a DocSource throws and retries on its own schedule, so the only way
// a failing save ever reaches a person is if the source reports it upward. This
// checks that it does -- on failure, and again on the recovery, because a
// warning that never clears is its own bug.
// ---------------------------------------------------------------------------

import { SupabaseDocSource } from '@/lib/study/doc-source';
import type { SupabaseClient } from '@supabase/supabase-js';

/** The smallest thing shaped like the query this source builds. */
function clientThatFails(message: string) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = async () => ({ data: null, error: { message } });
  chain.insert = async () => ({ error: { message } });
  return { from: () => chain } as unknown as SupabaseClient;
}

function clientThatWorks() {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = async () => ({ data: null, error: null });
  chain.insert = async () => ({ error: null });
  return { from: () => chain } as unknown as SupabaseClient;
}

(async () => {
  const seen: Array<string | null> = [];
  const record = (cause: unknown | null) =>
    seen.push(cause === null ? null : String((cause as Error)?.message ?? cause));

  const failing = new SupabaseDocSource(clientThatFails('network is unreachable'), 'owner', 'study-room');
  failing.onTrouble = record;
  await failing.pull('page-1', new Uint8Array()).catch(() => {});
  const reportedOnPull = seen.length > 0 && seen[0] !== null;

  seen.length = 0;
  await failing.push('page-1', new Uint8Array([0])).catch(() => {});
  const reportedOnPush = seen.length > 0 && seen[0] !== null;

  seen.length = 0;
  const working = new SupabaseDocSource(clientThatWorks(), 'owner', 'study-room');
  working.onTrouble = record;
  await working.push('page-1', new Uint8Array([0])).catch(() => {});
  const clearedOnSuccess = seen.length > 0 && seen[seen.length - 1] === null;

  console.log(JSON.stringify({ reportedOnPull, reportedOnPush, clearedOnSuccess }));
  process.exit(0);
})().catch((cause) => {
  console.log(JSON.stringify({ threw: String(cause).slice(0, 200) }));
  process.exit(0);
});
