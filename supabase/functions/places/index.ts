// Suggest places as somebody types where to meet.
//
// WHY A SERVER FUNCTION AND NOT A CALL FROM THE BROWSER. Three things, each of
// which a browser call would have given away:
//
//   * the member's internet address, which a search service would receive
//     alongside every half-typed place;
//   * the Content-Security-Policy, which allows the browser to talk to this
//     church's own backend and nothing else, and stays that way;
//   * the ability to say no: only a signed-in, approved, unsuspended member can
//     ask, and no more often than a person typing could.
//
// WHAT IT KEEPS: nothing. Not the words, not who asked, not the answer. It does
// not log the query, and it holds no key -- it checks the caller with their own
// sign-in rather than with the service role, because it needs nothing more.
//
// NO BACKSLASHES in this directory; see photon.ts.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cleanQuery, nearFrom, photonUrl, shape } from './photon.ts';

// Who may read the reply from a browser. The same setting, and the same
// fallback, as the invite function: see its comment for why a wildcard is only
// the default until BEACON_ALLOWED_ORIGINS is set.
const ALLOWED = (Deno.env.get('BEACON_ALLOWED_ORIGINS') || '')
  .split(',').map((o) => o.trim()).filter(Boolean);

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || '';
  const allow = ALLOWED.length === 0 ? '*' : ALLOWED.includes(origin) ? origin : ALLOWED[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra },
  });

// AS OFTEN AS A PERSON TYPING, AND NO MORE. The app waits for a pause in the
// typing before it asks, so forty a minute is generous for a person and a wall
// for a script. Held per running copy of the function, so it is a brake rather
// than an exact count -- which is all it needs to be.
const WINDOW_MS = 60_000;
const PER_WINDOW = 40;
const recent = new Map<string, number[]>();

function tooMany(who: string): boolean {
  const now = Date.now();
  const mine = (recent.get(who) ?? []).filter((t) => now - t < WINDOW_MS);
  mine.push(now);
  recent.set(who, mine);
  if (recent.size > 5000) recent.clear();
  return mine.length > PER_WINDOW;
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anon) return json({ error: 'Place search is not set up.' }, 500);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer /i, '').trim();
  if (!token) return json({ error: 'Sign in first.' }, 401);

  // The caller's own sign-in, and their own row: the same thing the app itself
  // is allowed to read, and nothing more.
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
  const { data: who } = await asCaller.auth.getUser(token);
  if (!who?.user) return json({ error: 'Sign in first.' }, 401);

  const { data: me } = await asCaller
    .from('profiles').select('is_approved, suspended_at').eq('id', who.user.id).maybeSingle();
  // The same three questions, in the same words, as the invite function, so
  // tests/a-suspension-is-immediate.mjs can see the suspension one asked.
  if (!me) return json({ error: 'Your account cannot search for places.' }, 403);
  if (me.suspended_at) return json({ error: 'This account is suspended.' }, 403);
  if (!me.is_approved) return json({ error: 'Your account is waiting to be approved.' }, 403);

  if (tooMany(who.user.id)) return json({ error: 'Slow down a little, then try again.' }, 429);

  const body = await req.json().catch(() => null) as { q?: unknown; near?: unknown } | null;
  const q = cleanQuery(body?.q);
  if (!q) return json({ places: [] });
  const near = nearFrom(body?.near) ?? nearFrom(Deno.env.get('PLACES_NEAR') ?? '');

  let answer: Response;
  try {
    answer = await fetch(photonUrl(q, near), {
      headers: {
        'Accept': 'application/json',
        // The service asks callers to say who they are.
        'User-Agent': 'OpenSentryBeacon/1 (church app; place suggestions)',
      },
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    return json({ error: 'Place search is not available right now.' }, 502);
  }
  if (!answer.ok) return json({ error: 'Place search is not available right now.' }, 502);

  const places = shape(await answer.json().catch(() => null));
  // Not cached here: an answer is about what one person typed, and nothing
  // about it is kept. The app remembers its own recent answers instead.
  return json({ places }, 200, { 'Cache-Control': 'no-store' });
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const res = await handle(req);
  for (const [key, value] of Object.entries(cors)) res.headers.set(key, value);
  return res;
});
