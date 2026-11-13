// Removes stored files whose database rows are gone. Called by the database.
//
// Deploy: npx supabase functions deploy erase --project-ref <your-project-ref>

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

/** The only buckets this app stores personal files in. */
const BUCKETS = new Set(['pairing-media', 'post-media']);

const headers = { 'Content-Type': 'application/json' };
const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers });

type Waiting = { bucket: string; path: string };

// Constant time: a wrong key takes as long to refuse as a nearly right one.
async function sameKey(a: string, b: string): Promise<boolean> {
  const hash = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [x, y] = (await Promise.all([hash(a), hash(b)])).map((d) => new Uint8Array(d));
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!SERVICE_KEY || !(await sameKey(bearer, SERVICE_KEY))) {
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
