// Remove the stored files whose rows are gone.
//
// ---------------------------------------------------------------------------
// WHY THIS EXISTS. The owner, 7 October 2026: "Make sure we have a system of
// in and out (exit) of data when it's deleted." When a row that points at a
// stored file is deleted -- a member removed, a conversation that went with
// them, a resource, a replaced profile picture -- the database writes the
// file's path to a list (migration 20261007150000). Postgres cannot remove a
// stored file itself; only the Storage API removes both the record and the
// bytes. This is the piece that does, once a day.
//
// WHO MAY CALL IT. Exactly as `notify`: the bearer token must equal the
// service role key this function already holds, a value that lives only in
// this function's environment and the church's own Vault. A signed-in member's
// token is not enough, and no browser can read either place.
//
// WHAT IT CAN REMOVE. Only paths the database has listed, and only in the
// buckets the list names. It takes no path from the request: a call can say
// "go", never "what". A path that fails to go stays on the list for tomorrow.
//
// Deploy: npx supabase functions deploy erase --project-ref <your-project-ref>
// ---------------------------------------------------------------------------

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

/** The only buckets this app stores personal files in. */
const BUCKETS = new Set(['pairing-media', 'post-media']);

const headers = { 'Content-Type': 'application/json' };
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

type Waiting = { bucket: string; path: string };

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!SERVICE_KEY || bearer !== SERVICE_KEY) {
    return reply(401, { error: 'This function is called by the database.' });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  let erased = 0;
  let kept = 0;
  // A few rounds of up to 500, so a large removal is finished in one run and
  // a run can never go on forever.
  for (let round = 0; round < 10; round++) {
    const { data, error } = await db.rpc('files_waiting_to_be_erased', { p_limit: 500 });
    if (error) return reply(500, { error: error.message, erased });
    const waiting = (data ?? []) as Waiting[];
    if (waiting.length === 0) break;

    const byBucket = new Map<string, string[]>();
    for (const file of waiting) {
      if (!BUCKETS.has(file.bucket)) { kept++; continue; }
      byBucket.set(file.bucket, [...(byBucket.get(file.bucket) ?? []), file.path]);
    }

    let progressed = false;
    for (const [bucket, paths] of byBucket) {
      // Removing a path that is already gone is not an error to the Storage
      // API, so a file deleted by hand earlier is crossed off like any other.
      const { error: removeError } = await db.storage.from(bucket).remove(paths);
      if (removeError) { kept += paths.length; continue; }
      const { data: crossed, error: crossError } = await db.rpc('files_erased', { p_bucket: bucket, p_paths: paths });
      if (crossError) { kept += paths.length; continue; }
      erased += Number(crossed ?? 0);
      progressed = true;
    }
    if (!progressed) break;
  }

  return reply(200, { erased, kept });
});
