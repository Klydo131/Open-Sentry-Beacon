// The Hope Beacon walk-through in plain JavaScript: Node 18 or newer, no
// framework, no packages. The same calls run in a browser, Deno or Bun.
//
//   HB_URL=... HB_KEY=... HB_EMAIL=... HB_PASSWORD=... node walk.mjs
//   HB_SEND='Hello' node walk.mjs     # also sends one message
//
// examples/rest/walk.sh is the same walk with curl, one request at a time.

const { HB_URL, HB_KEY, HB_EMAIL, HB_PASSWORD, HB_SEND } = process.env;
for (const [name, value] of Object.entries({ HB_URL, HB_KEY, HB_EMAIL, HB_PASSWORD })) {
  if (!value) {
    console.error(`Set ${name}.`);
    process.exit(1);
  }
}

const ROLES = { ds: 'Explorer', dm: 'Guide', admin: 'Director', executive: 'Executive Director' };
let token = HB_KEY;

/** One request; the server's own words on failure. */
async function call(method, path, body) {
  const res = await fetch(HB_URL + path, {
    method,
    headers: {
      apikey: HB_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (data?.code === 'PT403') {
      console.error('This account uses two-step sign-in. See docs/IN-ANY-LANGUAGE.md, "Two-step sign-in".');
      process.exit(2);
    }
    console.error(`Request failed (${res.status}): ${data?.message ?? data?.msg ?? res.statusText}`);
    process.exit(1);
  }
  return data;
}

// 1. Sign in.
const signin = await call('POST', '/auth/v1/token?grant_type=password', { email: HB_EMAIL, password: HB_PASSWORD });
token = signin.access_token;
const me = signin.user.id;

// 2. Who am I. The database decides what each person may read.
const [profile] = await call('GET', `/rest/v1/profiles?id=eq.${me}&select=full_name,role`);
console.log(`Signed in as ${profile.full_name} (${ROLES[profile.role] ?? profile.role}).`);

// 3. The conversations you are in. The rules do the filtering.
const pairings = await call('GET', '/rest/v1/pairings?select=id,journey_stage&order=created_at.asc');
console.log(`Conversations you can see: ${pairings.length}`);
if (pairings.length === 0) {
  console.log('No conversation yet.');
  process.exit(0);
}
const [pairing] = pairings;

// 4. Its five newest messages, shown oldest first.
const messages = await call('GET', `/rest/v1/messages?pairing_id=eq.${pairing.id}&select=sender_id,body&order=created_at.desc&limit=5`);
console.log(`Latest messages (journey stage: ${pairing.journey_stage}):`);
for (const m of messages.reverse()) console.log(`  ${m.sender_id === me ? 'You: ' : 'Them:'} ${m.body}`);

// 5. Only when asked: send one message as yourself.
if (HB_SEND) {
  await call('POST', '/rest/v1/messages', { pairing_id: pairing.id, sender_id: me, body: HB_SEND });
  console.log(`Sent: ${HB_SEND}`);
}
