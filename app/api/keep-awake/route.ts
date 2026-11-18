// The daily wake-up: one tiny read of the church's own database, so a project
// on Supabase's Free plan is never paused for being quiet.
//
// ---------------------------------------------------------------------------
// WHY IT IS IN THE APP. Supabase pauses a Free-plan project after about a week
// without activity, and a paused project takes the whole app down. A church
// that meets on the Sabbath can easily go a quiet week. The GitHub job
// (.github/workflows/keep-awake.yml) needs secrets set by hand, and on a copy
// that never had them it never ran. This needs nothing: vercel.json asks
// Vercel to call it once a day (Vercel's free Hobby plan allows that), and the
// database address it reads is the one the app was built with. Any other host
// can call it from its own scheduler, or keep the GitHub job.
//
// WHAT IT CAN DO: one read of one row, with the publishable key every browser
// already holds, against the database this deployment was built for and no
// other. It takes no input. It answers only whether the database answered;
// it never returns data, the address or the key.
//
// WHO MAY CALL IT: anybody, when CRON_SECRET is not set (the read is the same
// one an anonymous visitor's page makes, and the database's rules give an
// anonymous caller nothing). When CRON_SECRET is set, only a request carrying
// it, which is what Vercel's scheduler sends.
// ---------------------------------------------------------------------------

export const dynamic = 'force-dynamic';
export const maxDuration = 20;

type Answer = { awake: boolean; reason: string };

const reply = (body: Answer, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return reply({ awake: false, reason: 'not allowed' }, 401);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // The tutorial has no database, so there is nothing to keep awake.
  if (!url || !key) return reply({ awake: false, reason: 'no database configured' });

  let base: URL;
  try { base = new URL(url); } catch { return reply({ awake: false, reason: 'database address is not a URL' }, 500); }
  if (base.protocol !== 'https:') return reply({ awake: false, reason: 'database address is not https' }, 500);

  try {
    const answer = await fetch(new URL('/rest/v1/churches?select=id&limit=1', base), {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    // A refusal still means the request reached the database, which is what
    // counts as activity.
    if (answer.status === 200 || answer.status === 401 || answer.status === 403) {
      return reply({ awake: true, reason: `database answered (${answer.status})` });
    }
    return reply({ awake: false, reason: `database answered ${answer.status}` }, 502);
  } catch {
    return reply({ awake: false, reason: 'no answer from the database (it may be paused)' }, 504);
  }
}
