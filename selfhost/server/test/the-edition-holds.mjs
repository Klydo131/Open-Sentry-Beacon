// The Postgres edition, driven the way the app drives it: supabase-js against
// this server, PostgREST behind it, and a real Postgres under both.
//
//   node test/the-edition-holds.mjs
//
// Needs, and refuses to run without: DATABASE_URL pointing at a THROWAWAY
// database on this machine, PostgREST running against it with the same
// JWT_SECRET (POSTGREST_URL), and JWT_SECRET, ANON_KEY and SERVICE_ROLE_KEY.
// .github/workflows/postgres-edition.yml sets all of that up; docs/POSTGRES.md
// says how to do it by hand. It invents its own church and people, and the
// database is thrown away afterwards.

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { startServer } from '../src/main.mjs';
import { codeFor, stepAt } from '../src/totp.mjs';
import { sign } from '../src/jwt.mjs';
import webpush from 'web-push';

const env = process.env;
const host = (() => { try { return new URL(env.DATABASE_URL).hostname; } catch { return ''; } })();
if (!['127.0.0.1', 'localhost', '::1', 'db', 'postgres'].includes(host)) {
  console.error('Refusing: DATABASE_URL must be a throwaway database on this machine.');
  process.exit(2);
}

const results = [];
const check = (ok, label, detail = '') => {
  results.push({ ok: Boolean(ok), label });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${!ok && detail ? ` (${detail})` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(100);
  }
  return false;
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'beacon-edition-'));
const vapid = webpush.generateVAPIDKeys();
const port = 18000 + Math.floor(Math.random() * 2000);
const base = `http://127.0.0.1:${port}`;
const running = await startServer({
  ...env,
  PORT: String(port),
  HOST: '127.0.0.1',
  PUBLIC_URL: base,
  SITE_URL: 'http://localhost:3999',
  DATA_DIR: dataDir,
  RUN_JOBS: 'true',
  BEACON_ALLOWED_ORIGINS: 'http://localhost:3999',
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
});
const owner = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2 });
const anon = () => createClient(base, env.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const as = (token) => createClient(base, env.ANON_KEY, {
  accessToken: async () => token,
  auth: { persistSession: false, autoRefreshToken: false },
});
const admin = createClient(base, env.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const claimsOf = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
const authFetch = (p, { method = 'GET', token, body } = {}) => fetch(`${base}/auth/v1${p}`, {
  method,
  headers: { apikey: env.ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
  body: body ? JSON.stringify(body) : undefined,
});
const outbox = () => (fs.existsSync(path.join(dataDir, 'outbox')) ? fs.readdirSync(path.join(dataDir, 'outbox')).sort() : []);
const lastMail = () => fs.readFileSync(path.join(dataDir, 'outbox', outbox().at(-1)), 'utf8');

const run = crypto.randomBytes(3).toString('hex');
const PASSWORD = 'a long enough password 1';
const C1 = crypto.randomUUID();
const C2 = crypto.randomUUID();
const people = {};

try {
  // ------------------------------------------------------------ fixtures ----
  await owner.query('insert into public.churches (id, name) values ($1, $2), ($3, $4)', [C1, `Test Chapel ${run}`, C2, `Other Chapel ${run}`]);
  for (const [key, role, church] of [['a', 'dm', C1], ['b', 'ds', C1], ['c', 'admin', C1], ['d', 'dm', C2], ['s', 'ds', C1], ['m', 'ds', C1], ['r', 'ds', C1]]) {
    const email = `${key}.${run}@example.test`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `Person ${key}` } });
    if (error) throw new Error(`fixture ${key}: ${error.message}`);
    people[key] = { id: data.user.id, email };
    await owner.query('update public.profiles set is_approved = true, church_id = $2, role = $3::user_role, full_name = $4 where id = $1',
      [data.user.id, church, role, `Person ${key}`]);
  }
  await owner.query('update public.profiles set suspended_at = now() where id = $1', [people.s.id]);
  const pairing = crypto.randomUUID();
  await owner.query('insert into public.pairings (id, dm_id, ds_id) values ($1, $2, $3)', [pairing, people.a.id, people.b.id]);
  const post = crypto.randomUUID();
  await owner.query(`insert into public.blog_posts (id, author_id, church_id, title, body, visibility, audience)
                     values ($1, $2, $3, 'For the church', 'Hello', 'published', 'church')`, [post, people.a.id, C1]);
  check(Object.keys(people).length === 7, 'the admin API made seven invented people, and their profiles followed');

  // ------------------------------------------------------------- gateway ----
  check((await fetch(`${base}/rest/v1/profiles`)).status === 401, 'no API key: refused at the door');
  check((await fetch(`${base}/rest/v1/profiles`, { headers: { apikey: 'not-the-key' } })).status === 401, 'a wrong API key: refused');
  const { error: anonRead } = await anon().from('profiles').select('id').limit(1);
  check(anonRead?.code === '42501', 'signed out, the data API answers "permission denied", as on Supabase', anonRead?.message);

  // ------------------------------------------------------------- sign-in ----
  const wrong = await anon().auth.signInWithPassword({ email: people.a.email, password: 'not the password at all' });
  const nobody = await anon().auth.signInWithPassword({ email: `nobody.${run}@example.test`, password: 'not the password at all' });
  check(wrong.error?.status === 400 && wrong.error?.message === 'Invalid login credentials', 'a wrong password is refused');
  check(nobody.error?.status === wrong.error?.status && nobody.error?.message === wrong.error?.message,
    'an unknown address gets exactly the same answer, so sign-in lists nobody');

  const signIn = async (email, password = PASSWORD) => {
    const { data, error } = await anon().auth.signInWithPassword({ email, password });
    if (error) throw new Error(`sign-in ${email}: ${error.message}`);
    return data.session;
  };
  const sa = await signIn(people.a.email);
  const ca = claimsOf(sa.access_token);
  check(ca.role === 'authenticated' && ca.aal === 'aal1' && /^[0-9a-f-]{36}$/.test(ca.session_id) && ca.sub === people.a.id,
    'a right password gives a token with the person, the session and aal1 in it');
  const { data: mine, error: mineErr } = await as(sa.access_token).from('profiles').select('id, role').eq('id', people.a.id).single();
  check(mine?.role === 'dm', 'PostgREST believes the token: a Guide reads their own profile', mineErr?.message);
  const { rows: stored } = await owner.query('select token from auth.refresh_tokens where session_id = $1', [ca.session_id]);
  check(stored.length === 1 && stored[0].token.startsWith('sha256:') && !stored[0].token.includes(sa.refresh_token),
    'the refresh token is kept as a hash, so a copy of the database signs nobody in');

  // ------------------------------------------------------- staying signed in ----
  const refresh = (token) => authFetch('/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: token } });
  const r1 = await refresh(sa.refresh_token);
  const s1 = await r1.json();
  check(r1.ok && s1.refresh_token && s1.refresh_token !== sa.refresh_token, 'a refresh gives a new refresh token');
  const r2 = await refresh(sa.refresh_token);
  check(r2.ok, 'the old one spent a moment ago still works: two tabs refreshing together both stay signed in');
  await owner.query(`update auth.refresh_tokens set updated_at = now() - interval '1 minute' where session_id = $1 and revoked`, [ca.session_id]);
  const r3 = await refresh(sa.refresh_token);
  const r3body = await r3.json();
  check(r3.status === 400 && r3body.error_code === 'refresh_token_already_used', 'replayed later, it is a stolen copy and is refused');
  const { rowCount: sessionLeft } = await owner.query('select 1 from auth.sessions where id = $1', [ca.session_id]);
  check(sessionLeft === 0, 'and the whole session ends, for the thief and the owner alike');
  const { error: afterTheft } = await as(s1.access_token).from('profiles').select('id').eq('id', people.a.id);
  check(Boolean(afterTheft), 'the access token from that session stops working at once (the database checks the session)', 'it still worked');

  // ------------------------------------------------------------- sign out ----
  const sb = await signIn(people.b.email);
  const out = await authFetch('/logout?scope=local', { method: 'POST', token: sb.access_token });
  check(out.status === 204, 'signing out ends the session on the server');
  check((await refresh(sb.refresh_token)).status === 400, 'its refresh token is refused afterwards');
  const { error: afterOut } = await as(sb.access_token).from('profiles').select('id').eq('id', people.b.id);
  check(Boolean(afterOut), 'and so is its access token, before its hour is up');

  // ------------------------------------------------------------- two-step ----
  let sc = await signIn(people.c.email);
  const enrolled = await (await authFetch('/factors', { method: 'POST', token: sc.access_token, body: { factor_type: 'totp', issuer: 'Hope Beacon' } })).json();
  check(enrolled.totp?.qr_code?.startsWith('<svg') && /^[A-Z2-7]{32}$/.test(enrolled.totp?.secret ?? ''),
    'setting up an authenticator app gives a picture code and a key, as the sign-in service does');
  const { rows: fac } = await owner.query('select secret from auth.mfa_factors where id = $1', [enrolled.id]);
  check(fac[0]?.secret?.startsWith('enc1:') && !fac[0].secret.includes(enrolled.totp.secret), 'the key is stored encrypted');
  const prove = async (token, factorId, code) => {
    const ch = await (await authFetch(`/factors/${factorId}/challenge`, { method: 'POST', token, body: {} })).json();
    return authFetch(`/factors/${factorId}/verify`, { method: 'POST', token, body: { challenge_id: ch.id, code } });
  };
  const bad = await prove(sc.access_token, enrolled.id, '000000' === codeFor(enrolled.totp.secret, stepAt()) ? '111111' : '000000');
  check(bad.status === 422 && (await bad.json()).error_code === 'mfa_verification_failed', 'a wrong code is refused');
  const code = codeFor(enrolled.totp.secret, stepAt());
  const good = await prove(sc.access_token, enrolled.id, code);
  const sc2 = await good.json();
  check(good.ok && claimsOf(sc2.access_token).aal === 'aal2', 'the right code turns the session into aal2');
  const replay = await prove(sc2.access_token, enrolled.id, code);
  check(replay.status === 422, 'the same code does not work twice, even within its 30 seconds');
  const pwOnly = await signIn(people.c.email);
  check(claimsOf(pwOnly.access_token).aal === 'aal1' && pwOnly.user.factors?.some((f) => f.status === 'verified'),
    'a password alone now gives aal1, and the account says a second step is set up');
  const { error: refused } = await as(pwOnly.access_token).from('profiles').select('id').eq('id', people.c.id);
  check(refused?.code === 'PT403', 'and the database refuses that token until the code is entered', refused?.code);
  const unenrollAal1 = await authFetch(`/factors/${enrolled.id}`, { method: 'DELETE', token: pwOnly.access_token });
  check(unenrollAal1.status === 401, 'a password alone cannot take the authenticator app off');
  const pwChange = await authFetch('/user', { method: 'PUT', token: pwOnly.access_token, body: { password: 'another long password 9' } });
  check(pwChange.status === 401, 'nor change the password');
  await sleep(31_000 - (Date.now() % 30_000));
  const later = await prove(pwOnly.access_token, enrolled.id, codeFor(enrolled.totp.secret, stepAt()));
  const sc3 = await later.json();
  const { data: cProfile } = await as(sc3.access_token).from('profiles').select('id').eq('id', people.c.id).single();
  check(later.ok && cProfile?.id === people.c.id, 'with the next code, the same person reads their profile');
  // Typing a code again in the same session moves the code's time forward, as
  // Supabase's sign-in service does. The court room's door reads that time.
  const totpAt = (token) => (claimsOf(token).amr ?? []).find((a) => a.method === 'totp')?.timestamp ?? 0;
  await sleep(31_000 - (Date.now() % 30_000));
  const sc4 = await (await prove(sc3.access_token, enrolled.id, codeFor(enrolled.totp.secret, stepAt()))).json();
  check(totpAt(sc4.access_token) > totpAt(sc3.access_token),
    'a second code in the same session moves its time forward, which the court room\'s door reads');
  sc = sc4;

  // ------------------------------------------------------------- recovery ----
  const before = outbox().length;
  const rec = await authFetch('/recover', { method: 'POST', body: { email: people.m.email } });
  const recNobody = await authFetch('/recover', { method: 'POST', body: { email: `nobody.${run}@example.test` } });
  check(rec.status === 200 && recNobody.status === 200 && outbox().length === before + 1,
    '"forgot my password" answers the same for anybody, and mails only a real account');
  const again = await authFetch('/recover', { method: 'POST', body: { email: people.m.email } });
  const againBody = await again.json();
  check(again.status === 429 && /after \d+ seconds/.test(againBody.msg), 'a second request inside a minute is told to wait, in the words the invite function reads');
  const mail = lastMail();
  const hash = /token_hash=([0-9a-f]{64})&type=recovery/.exec(mail)?.[1];
  check(Boolean(hash) && !mail.includes('ConfirmationURL'), 'the e-mail carries a link to the app with a long token, never the spend-on-open kind');
  const { data: recovered, error: recErr } = await anon().auth.verifyOtp({ token_hash: hash, type: 'recovery' });
  check(recovered?.session?.user?.id === people.m.id, 'the link signs the person in to choose a password', recErr?.message);
  const { error: twice } = await anon().auth.verifyOtp({ token_hash: hash, type: 'recovery' });
  check(/expired/i.test(twice?.message ?? ''), 'and works once only, with the words the join page looks for');
  const sameAgain = await authFetch('/user', { method: 'PUT', token: recovered.session.access_token, body: { password: PASSWORD } });
  check(sameAgain.status === 422 && (await sameAgain.json()).error_code === 'same_password', 'the old password cannot be chosen as the new one');
  const changed = await authFetch('/user', { method: 'PUT', token: recovered.session.access_token, body: { password: 'a brand new password 2' } });
  check(changed.ok && !(await anon().auth.signInWithPassword({ email: people.m.email, password: PASSWORD })).data.session
    && Boolean(await signIn(people.m.email, 'a brand new password 2')), 'after the change only the new password works');

  await authFetch('/recover', { method: 'POST', body: { email: people.r.email } });
  const otp = /code on the page instead: (\d{6})/.exec(lastMail())?.[1];
  for (let i = 0; i < 5; i += 1) {
    await anon().auth.verifyOtp({ email: people.r.email, token: otp === '000000' ? '111111' : '000000', type: 'recovery' });
  }
  const { rows: codeLeft } = await owner.query(
    `select 1 from auth.one_time_tokens where user_id = $1 and token_type = 'recovery_code'`, [people.r.id]);
  check(codeLeft.length === 0, 'five wrong six-digit codes and the code is gone from the database');
  const { data: tooLate } = await anon().auth.verifyOtp({ email: people.r.email, token: otp, type: 'recovery' });
  check(!tooLate?.session, 'so even the right code no longer works: it cannot be guessed');

  // --------------------------------------------------------------- files ----
  const sa2 = await signIn(people.a.email);
  const asA = as(sa2.access_token);
  const name = `${C1}/${post}/${crypto.randomUUID()}.jpg`;
  const bytes = crypto.randomBytes(2048);
  const up = await asA.storage.from('post-media').upload(name, new Blob([bytes], { type: 'image/jpeg' }), { contentType: 'image/jpeg', upsert: false });
  check(!up.error, 'a Guide uploads a photo for their own post, as attachPostMedia does', up.error?.message);
  const { error: rowErr } = await asA.from('post_media').insert({
    church_id: C1, post_id: post, owner_id: people.a.id, kind: 'image', mime: 'image/jpeg', size: bytes.length, path: name, alt: '', position: 0,
  });
  check(!rowErr, 'and records it', rowErr?.message);
  const { rows: objRows } = await owner.query('select id from storage.objects where bucket_id = $1 and name = $2', ['post-media', name]);
  check(fs.existsSync(path.join(dataDir, 'files', 'post-media', objRows[0]?.id ?? 'none')), 'the file is on disk under its row id, not its name');
  const sb2 = await signIn(people.b.email);
  // Some uploads may be written and not read back: a member's report evidence,
  // a court exhibit before it is entered. An upload must need INSERT alone.
  const evidence = `reports/${people.b.id}/${crypto.randomUUID()}.jpg`;
  const ev = await as(sb2.access_token).storage.from('pairing-media')
    .upload(evidence, new Blob([bytes], { type: 'image/jpeg' }), { contentType: 'image/jpeg', upsert: false });
  check(!ev.error, 'an Explorer uploads evidence for a report, a file they may write and not read back', ev.error?.message);
  const { data: signed, error: signErr } = await as(sb2.access_token).storage.from('post-media').createSignedUrl(name, 60);
  check(Boolean(signed?.signedUrl), 'an Explorer in the same church may open it', signErr?.message);
  const got = signed?.signedUrl ? Buffer.from(await (await fetch(signed.signedUrl)).arrayBuffer()) : Buffer.alloc(0);
  check(got.equals(bytes), 'and the link gives back exactly the bytes uploaded');
  const opened = signed?.signedUrl ? await fetch(signed.signedUrl) : null;
  check(/sandbox/.test(opened?.headers.get('content-security-policy') ?? '') && opened?.headers.get('x-content-type-options') === 'nosniff',
    'a file is served so it can never run as a page');
  const tampered = signed?.signedUrl?.replace(/token=([^.]+)\.([^.]+)\./, (m, h, b) => `token=${h}.${Buffer.from(JSON.stringify({ url: `post-media/${C2}/x.jpg`, exp: 9999999999 })).toString('base64url')}.`);
  check(tampered && (await fetch(tampered)).status === 400, 'a link edited to point elsewhere is refused');
  const sd = await signIn(people.d.email);
  const { error: otherErr } = await as(sd.access_token).storage.from('post-media').createSignedUrl(name, 60);
  check(Boolean(otherErr), 'a Guide from another church cannot open it');
  const { data: dl } = await as(sd.access_token).storage.from('post-media').download(name);
  check(!dl, 'nor download it directly');
  const trav = await fetch(`${base}/storage/v1/object/post-media/${C1}/..%2F..%2Fsecret`, {
    method: 'POST', headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${sa2.access_token}`, 'content-type': 'image/jpeg' }, body: 'x',
  });
  check(trav.status === 400, 'a name that climbs out of its folder is refused');
  const txt = await asA.storage.from('post-media').upload(`${C1}/${post}/${crypto.randomUUID()}.txt`, new Blob(['hello'], { type: 'text/plain' }));
  check(Boolean(txt.error), 'a type the bucket does not take is refused');
  const { data: listed } = await asA.storage.from('post-media').list(C1);
  check(listed?.some((e) => e.name === post && e.id === null), 'listing a folder shows its sub-folders, as Supabase does');
  const { data: bRemoved } = await as(sb2.access_token).storage.from('post-media').remove([name]);
  check(Array.isArray(bRemoved) && bRemoved.length === 0 && fs.existsSync(path.join(dataDir, 'files', 'post-media', objRows[0].id)),
    'an Explorer cannot remove the Guide\'s file');
  const ss = await signIn(people.s.email);
  const sup = await as(ss.access_token).storage.from('post-media').upload(`${C1}/${post}/${crypto.randomUUID()}.jpg`, new Blob([bytes], { type: 'image/jpeg' }));
  check(Boolean(sup.error), 'a suspended account uploads nothing');

  // ------------------------------------------------------ leave to answer ----
  // The data API's check before every request lets a suspended account make
  // the court room's own calls while a judge's leave lasts, and nothing else.
  // Which call it is comes from the address PostgREST was asked, so this is
  // proved through PostgREST itself, not only in SQL.
  const asC = as(sc.access_token);
  const asS = as(ss.access_token);
  const { data: trial, error: openErr } = await asC.rpc('open_trial', { p_subject: people.s.id, p_summary: 'Invented case', p_report: null, p_other: null });
  check(Boolean(trial) && !openErr, 'a Director with a fresh code opens a case about a suspended Explorer', openErr?.message);
  const noLeave = await asS.rpc('court_door');
  check(noLeave.error?.code === '42501', 'without leave, the suspended account is refused even the court room\'s door', noLeave.error?.message);
  const { data: granted } = await asC.rpc('court_grant_leave', { p_trial: trial, p_person: people.s.id, p_hours: 1 });
  check(granted === 'ok', 'the judge gives them an hour\'s leave to answer', String(granted));
  const onLeave = await asS.rpc('court_door');
  check(onLeave.data?.open === true && onLeave.data?.leave?.case === trial,
    'on leave, the same account opens the court room\'s door, for that case', onLeave.error?.message);
  const { data: theirCase } = await asS.rpc('court_case', { p_trial: trial });
  check(theirCase?.case?.my_place === 'accused', 'and reads the case it is about');
  const { error: profileShut } = await asS.from('profiles').select('id').limit(1);
  const { error: callShut } = await asS.rpc('court_summon', { p_trial: trial, p_person: people.b.id });
  check(profileShut?.code === '42501' && callShut?.code === '42501',
    'but every other table and call is still refused');
  const { data: ended } = await asC.rpc('court_end_leave', { p_trial: trial, p_person: people.s.id });
  const afterLeave = await asS.rpc('court_door');
  check(ended === 'ok' && Boolean(afterLeave.error), 'when the judge ends it, the court room shuts again at once', afterLeave.error?.message);
  const { data: bannedNow } = await anon().auth.signInWithPassword({ email: people.s.email, password: PASSWORD });
  check(!bannedNow?.session, 'and the account cannot sign in again');

  // ------------------------------------------------------------ live data ----
  const heard = { b: 0, d: 0, bMsg: 0, dMsg: 0 };
  const rb = as(sb2.access_token);
  const rd = as(sd.access_token);
  // As in the app, the token is in hand before any screen starts watching.
  await rb.realtime.setAuth();
  await rd.realtime.setAuth();
  const subscribed = (ch) => new Promise((resolve) => ch.subscribe((status) => { if (status === 'SUBSCRIBED') resolve(true); }));
  const chB = rb.channel(`t-b-${run}`).on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => { heard.b += 1; });
  const chD = rd.channel(`t-d-${run}`).on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => { heard.d += 1; });
  const chBm = rb.channel(`t-bm-${run}`).on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `pairing_id=eq.${pairing}` }, () => { heard.bMsg += 1; });
  const chDm = rd.channel(`t-dm-${run}`).on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `pairing_id=eq.${pairing}` }, () => { heard.dMsg += 1; });
  const joined = await Promise.race([Promise.all([chB, chD, chBm, chDm].map(subscribed)), sleep(5000).then(() => false)]);
  check(Boolean(joined), 'supabase-js joins live channels on this server');
  await owner.query(`insert into public.announcements (church_id, author_id, title) values ($1, $2, 'Lunch')`, [C1, people.c.id]);
  check(await waitFor(() => heard.b > 0), 'a new notice reaches an Explorer in that church');
  const { error: msgErr } = await asA.from('messages').insert({ pairing_id: pairing, sender_id: people.a.id, body: 'Hello' });
  check(!msgErr && await waitFor(() => heard.bMsg > 0), 'a message reaches the other person in the conversation', msgErr?.message);
  await sleep(800);
  check(heard.d === 0, 'the notice does not reach a Guide in another church');
  check(heard.dMsg === 0, 'and a stranger who knows the conversation\'s id hears nothing from it');
  for (const ch of [chB, chD, chBm, chDm]) await ch.unsubscribe();

  // ------------------------------------------------------------ functions ----
  const inviteEmail = `invited.${run}@example.test`;
  const mailsBefore = outbox().length;
  const inv = await fetch(`${base}/functions/v1/invite`, {
    method: 'POST',
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${(await signIn(people.c.email)).access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: inviteEmail, role: 'ds', full_name: 'Invited Person' }),
  });
  const invBody = await inv.json();
  check(invBody.error === 'Finish two-step sign-in first.', 'the invite function, run unchanged, refuses a Director who has not entered their code');
  const inv2 = await fetch(`${base}/functions/v1/invite`, {
    method: 'POST',
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${sc.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: inviteEmail, role: 'ds', full_name: 'Invited Person' }),
  });
  const inv2Body = await inv2.json();
  check(inv2Body.ok === true && typeof inv2Body.tempPassword === 'string', 'with the code entered, it invites', JSON.stringify(inv2Body).slice(0, 200));
  check(outbox().length === mailsBefore + 1, 'and the invitation e-mail goes out through this server');
  const invited = inv2Body.tempPassword ? await anon().auth.signInWithPassword({ email: inviteEmail, password: inv2Body.tempPassword }) : { data: {} };
  check(Boolean(invited.data.session), 'the invited person signs in with the password the Director was shown');
  const byExplorer = await fetch(`${base}/functions/v1/invite`, {
    method: 'POST',
    headers: { apikey: env.ANON_KEY, Authorization: `Bearer ${sb2.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `x.${run}@example.test`, role: 'ds' }),
  });
  check(byExplorer.status === 403, 'an Explorer cannot invite anybody');

  // ----------------------------------------------------- outgoing requests ----
  const { rows: vault } = await owner.query(`select name, decrypted_secret from vault.decrypted_secrets order by name`);
  check(vault.some((v) => v.name === 'notify_service_key' && v.decrypted_secret === 'beacon-internal')
    && !vault.some((v) => v.decrypted_secret === env.SERVICE_ROLE_KEY), 'the database holds no real key: only an address and a placeholder');
  await owner.query(`insert into public.notifications (user_id, type, title, body) values ($1, 'test', 'Hello', 'A test')`, [people.b.id]);

  const drained = await waitFor(async () => (await owner.query('select count(*)::int as n from net.http_request_queue')).rows[0].n === 0, 5000);
  check(drained, 'a notification\'s push request is queued by the database and sent by the server');

  // -------------------------------------------------------------- schedule ----
  const { rows: jobs } = await owner.query('select jobname from cron.job order by jobname');
  check(jobs.map((j) => j.jobname).join(',') === 'court-leave-runs-out,erase-deleted-files,invitation-passwords-run-out,link-record-runs-out',
    'the four jobs the migrations schedule are on the schedule');
  await running.jobs.runDue(new Date(Date.UTC(2026, 0, 1, 5, 17)));
  const { rows: ran } = await owner.query(`select status from cron.job_run_details d join cron.job j using (jobid)
                                           where j.jobname = 'invitation-passwords-run-out' order by runid desc limit 1`);
  check(ran[0]?.status === 'succeeded', 'and at seventeen minutes past, the hourly one runs and is recorded');

  // ------------------------------------------------------------- forgeries ----
  const none = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ ...ca, exp: 9999999999 })).toString('base64url')}.`;
  check((await authFetch('/user', { token: none })).status === 401, 'a token with no signature is refused');
  const otherSecret = sign({ ...ca, exp: 9999999999 }, crypto.randomBytes(32).toString('hex'));
  check((await authFetch('/user', { token: otherSecret })).status === 401, 'a token signed with another secret is refused');
  const { error: forgedData } = await as(otherSecret).from('profiles').select('id').limit(1);
  check(Boolean(forgedData), 'and the data API refuses it too');
  const expired = sign({ ...ca, iat: 1, exp: 2 }, env.JWT_SECRET);
  check((await authFetch('/user', { token: expired })).status === 401, 'an expired token is refused');
  const serviceViaUser = await authFetch('/admin/users', { method: 'POST', token: sa2.access_token, body: { email: `z.${run}@example.test` } });
  check(serviceViaUser.status === 403, 'the admin API answers only the service key');
  const signupClosed = await anon().auth.signUp({ email: `self.${run}@example.test`, password: 'a long enough password 3' });
  check(signupClosed.error?.status === 422, 'signing yourself up is closed: people arrive by invitation');
} catch (err) {
  check(false, 'the walk ran to the end', err.stack || err.message);
} finally {
  await running.stop();
  await owner.end();
  fs.rmSync(dataDir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks hold.`);
console.log(failed.length ? 'RESULT: FAILED' : 'RESULT: ALL OK');
process.exit(failed.length ? 1 : 0);
