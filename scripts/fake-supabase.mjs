// A stand-in for Supabase, so the LIVE screens can be rendered and looked at.
//
// WHY THIS EXISTS. The live screens only render when the app is in live mode
// AND somebody is signed in AND their profile loads. Without all three they
// redirect to the sign-in page, so "it did not show the placeholder" was the
// most anyone could verify — and that is a long way from "the screen works".
// Four screens shipped a placeholder for weeks precisely because nobody could
// see them.
//
// This answers the handful of PostgREST and Auth calls those screens make, with
// obviously-fake data, so a browser can drive the real components end to end.
//
// It is a TEST FIXTURE and nothing else. It grants everything it is asked for,
// which is exactly right here and would be catastrophic anywhere near a real
// deployment — so it binds to localhost only and refuses to start unless
// NODE_ENV is undefined or 'test'.
//
//   node scripts/fake-supabase.mjs 4399
//
// Then build with NEXT_PUBLIC_SUPABASE_URL=http://localhost:4399 and any key.

import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import fs from 'node:fs';

if (process.env.NODE_ENV === 'production') {
  console.error('fake-supabase is a test fixture and will not run with NODE_ENV=production.');
  process.exit(1);
}

const PORT = Number(process.argv[2] || 4399);

const ME = '11111111-1111-4111-8111-111111111111';
const CHURCH = '22222222-2222-4222-8222-222222222222';

const profile = {
  id: ME,
  role: 'executive',
  full_name: 'Sample Director',
  church_id: CHURCH,
  is_approved: true,
  topics_of_interest: ['prayer', 'baptism'],
  preferred_language: 'en',
  preferred_contact: 'sample@example.test',
  city_of_residence: 'Manila',
  work_industry: 'Teaching',
  life_status: 'Married',
  birthday: '1980-04-01',
  consent_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
};

// What the profile says about the Terms of Use and the Privacy Notice
// (lib/legal.ts), so the agreement step can be seen:
//   FAKE_AGREED unset   the database has no such columns yet, as before
//                       20261028120000_what_was_agreed_is_recorded: nobody
//                       is asked, because the answer could not be saved
//   FAKE_AGREED=none    the columns exist and nothing is agreed yet
//   FAKE_AGREED=older   an agreement to an earlier version: asked again
if (process.env.FAKE_AGREED === 'none') {
  Object.assign(profile, { terms_version: null, privacy_version: null, terms_agreed_at: null });
} else if (process.env.FAKE_AGREED === 'older') {
  Object.assign(profile, { terms_version: '2026-01-01', privacy_version: '2026-01-01', terms_agreed_at: '2026-01-01T00:00:00Z' });
}

// One row-set per table the live screens read. Keyed by the first path segment
// after /rest/v1/, which is all PostgREST needs here.
const TABLES = {
  profiles: [profile],
  churches: [{ id: CHURCH, name: 'Sample Church' }],
  invites: [
    {
      id: 'i1', email: 'waiting@example.test', role: 'ds', full_name: 'Waiting Person',
      created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      redeemed_at: null, expires_at: new Date(Date.now() + 4 * 86400000).toISOString(),
    },
    {
      id: 'i2', email: 'joined@example.test', role: 'dm', full_name: 'Joined Person',
      created_at: new Date(Date.now() - 9 * 86400000).toISOString(),
      redeemed_at: new Date(Date.now() - 8 * 86400000).toISOString(),
      expires_at: new Date(Date.now() + 1 * 86400000).toISOString(),
    },
  ],
  pairings: [],
  prayer_requests: [],
  meetings: [],
  notifications: [],
  materials: [],
  material_shares: [],
  blog_posts: [],
  recommendations: [],
  lesson_series: [],
  lesson_assignments: [],
  lessons: [],
  seeker_notes: [],
  journey_events: [],
  messages: [],
};

const send = (res, status, body) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range',
  });
  res.end(JSON.stringify(body));
};

const handler = (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;

  // Auth. Whatever is asked for, the same sample person answers.
  if (path.startsWith('/auth/v1/')) {
    if (path.endsWith('/user')) return send(res, 200, { id: ME, email: 'director@example.test' });
    return send(res, 200, {
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: ME, email: 'director@example.test', user_metadata: { full_name: profile.full_name } },
    });
  }

  // Stored procedures the live screens call.
  if (path.startsWith('/rest/v1/rpc/')) {
    const fn = path.slice('/rest/v1/rpc/'.length);
    if (fn === 'church_member_contact') {
      return send(res, 200, [{ id: ME, email: 'director@example.test', joined_at: profile.created_at }]);
    }
    return send(res, 200, []);
  }

  // Your own profile, updated: kept, so a screen that saves and reads back
  // sees what it saved. The time of an agreement is stamped here, as the
  // database's trigger does.
  if (req.method === 'PATCH' && path === '/rest/v1/profiles') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      let patch = {};
      try { patch = JSON.parse(body || '{}'); } catch { /* not JSON: change nothing */ }
      Object.assign(profile, patch);
      if ('terms_version' in patch || 'privacy_version' in patch) profile.terms_agreed_at = new Date().toISOString();
      send(res, 204, {});
    });
    return;
  }

  if (path.startsWith('/rest/v1/')) {
    const table = path.slice('/rest/v1/'.length).split('?')[0];
    const rows = TABLES[table] ?? [];
    // PostgREST returns a bare object rather than an array when the client asks
    // for one, which supabase-js signals through Accept. maybeSingle()/single()
    // both go through this, and getting it wrong makes every profile read look
    // like a miss.
    const single = (req.headers.accept || '').includes('vnd.pgrst.object');
    if (single) return send(res, 200, rows[0] ?? null);
    return send(res, 200, rows);
  }

  send(res, 200, {});
};

// HTTPS when a cert is handed over, because next.config.mjs adds the backend to
// connect-src ONLY for an https: origin — plaintext is refused on purpose, and
// that refusal is correct. A fixture served over http is therefore blocked by
// the app's own Content-Security-Policy before a single request leaves, which
// is a confusing way to discover that the policy is working.
const key = process.env.FAKE_SUPABASE_KEY_FILE;
const cert = process.env.FAKE_SUPABASE_CERT_FILE;
if (key && cert) {
  createHttpsServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, handler)
    .listen(PORT, '127.0.0.1', () => {
      console.log(`fake-supabase listening on https://localhost:${PORT} (test fixture)`);
    });
} else {
  createHttpServer(handler).listen(PORT, '127.0.0.1', () => {
    console.log(`fake-supabase listening on http://localhost:${PORT} (test fixture)`);
  });
}
