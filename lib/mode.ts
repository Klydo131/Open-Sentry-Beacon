// Demo, or real, decided by whether a database is configured.
//
// THIS IS THE HINGE OF THE WHOLE PROJECT. Clone the repo with nothing set up
// and it runs on sample data in the browser — that is what lets a church look
// at the thing before committing to anything. Set two environment variables
// and the same code talks to your own Supabase project, with your own people
// in it.
//
// Deliberately NOT a build-time flag or a hand-set MODE variable. Somebody
// eventually sets MODE=live while forgetting the keys, and the app breaks in a
// way that reads like a bug rather than a missing step. Asking "do I have what
// I need to reach a database?" cannot get out of step with reality, because it
// IS reality.
//
// Both variables are NEXT_PUBLIC_ because the browser makes the calls. The anon
// key is not a secret — see supabase/migrations/0001_core_schema.sql. What
// protects your congregation's data is row level security, not the obscurity of
// that string.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True when this deployment has a database behind it. */
export const IS_LIVE = Boolean(url && key);

/** True when it is running on sample data in the browser. */
export const IS_DEMO = !IS_LIVE;

