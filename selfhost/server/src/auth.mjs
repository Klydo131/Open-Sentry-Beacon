// Sign-in: the part of Supabase's sign-in service (GoTrue) that Hope Beacon
// uses, answering the same addresses with the same shapes, so the app and
// supabase-js need no change at all.
//
//   POST /token?grant_type=password       e-mail and password
//   POST /token?grant_type=refresh_token  staying signed in
//   POST /verify                           an e-mailed link or six-digit code
//   POST /recover                          "forgot my password"
//   POST /signup                           closed unless ENABLE_SIGNUP is on
//   GET  /user, PUT /user                  who am I; change my password
//   POST /logout?scope=local|others|global
//   POST /factors, …/challenge, …/verify, DELETE /factors/:id   two-step codes
//   /admin/users, POST /invite             service key only (the invite function)
//
// WHERE IT IS STRICTER THAN THE ORIGINAL, deliberately:
//   * An e-mailed link carries 32 random bytes, and only a hash of them is
//     stored. The six-digit code beside it is a separate secret that dies
//     after five wrong tries.
//   * Refresh tokens and authenticator-app keys are stored as a hash and
//     encrypted respectively, so a copy of the database (a backup, a dump)
//     does not sign anybody in.
//   * Every address answers "if that address has an account…" the same way,
//     so nobody can use sign-in to list a church's members.

import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { sign, verify } from './jwt.mjs';
import { HttpError, readJson, send, clientIp, bearer } from './http.mjs';
import { Limiter } from './ratelimit.mjs';
import { newSecret, matchStep, otpauthUri } from './totp.mjs';

const REUSE_SECONDS = 10;           // two tabs refreshing together both succeed
const CHALLENGE_SECONDS = 300;
const MAX_UNVERIFIED_FACTORS = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Returned from a transaction to refuse AFTER committing what it changed. */
class Refusal {
  constructor(error) {
    this.error = error;
  }
}
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const nowIso = () => new Date().toISOString();

function cleanEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  return email.length <= 254 && EMAIL.test(email) ? email : '';
}

export function createAuth({ cfg, pool, mailer }) {
  const limits = {
    signInByIp: new Limiter({ limit: 60, windowMs: 5 * 60_000 }),
    signInByEmail: new Limiter({ limit: 10, windowMs: 5 * 60_000 }),
    refreshByIp: new Limiter({ limit: 600, windowMs: 5 * 60_000 }),
    verifyByIp: new Limiter({ limit: 30, windowMs: 5 * 60_000 }),
    codeByEmail: new Limiter({ limit: 5, windowMs: 15 * 60_000 }),
    mailByEmail: new Limiter({ limit: 1, windowMs: 60_000 }),
    mfaByUser: new Limiter({ limit: 10, windowMs: 5 * 60_000 }),
  };

  // Authenticator-app keys are kept encrypted with a key derived from
  // JWT_SECRET. A key copied from Supabase arrives as plain text and still
  // works; it is encrypted the next time it is used.
  const mfaKey = crypto.hkdfSync('sha256', cfg.jwtSecret, 'beacon', 'two-step keys', 32);
  const seal = (text) => {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(mfaKey), iv);
    const body = Buffer.concat([c.update(text, 'utf8'), c.final()]);
    return `enc1:${Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')}`;
  };
  const unseal = (stored) => {
    if (!String(stored).startsWith('enc1:')) return String(stored);
    const raw = Buffer.from(stored.slice(5), 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(mfaKey), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
  };

  const waitError = (seconds, code = 'over_request_rate_limit') =>
    new HttpError(429, `For security purposes, you can only request this after ${seconds} seconds.`, code);

  function limit(limiter, key, code) {
    const wait = limiter.take(key);
    if (wait) throw waitError(wait, code);
  }

  async function audit(client, action, actorId, ip, extra = {}) {
    await client.query(
      'insert into auth.audit_log_entries (id, payload, created_at, ip_address) values ($1, $2, now(), $3)',
      [crypto.randomUUID(), JSON.stringify({ action, actor_id: actorId || null, ...extra }), String(ip).slice(0, 64)],
    );
  }

  // ------------------------------------------------------------ users ----

  async function factorsOf(client, userId) {
    const { rows } = await client.query(
      `select id, friendly_name, factor_type, status, created_at, updated_at
         from auth.mfa_factors where user_id = $1 order by created_at`, [userId]);
    return rows;
  }

  async function userJson(client, row) {
    const factors = await factorsOf(client, row.id);
    const out = {
      id: row.id,
      aud: row.aud || 'authenticated',
      role: row.role || 'authenticated',
      email: row.email,
      email_confirmed_at: row.email_confirmed_at,
      phone: '',
      confirmed_at: row.confirmed_at,
      invited_at: row.invited_at ?? undefined,
      recovery_sent_at: row.recovery_sent_at ?? undefined,
      last_sign_in_at: row.last_sign_in_at,
      app_metadata: row.raw_app_meta_data || { provider: 'email', providers: ['email'] },
      user_metadata: row.raw_user_meta_data || {},
      identities: [{
        identity_id: row.id, id: row.id, user_id: row.id, provider: 'email',
        identity_data: { sub: row.id, email: row.email, email_verified: Boolean(row.email_confirmed_at) },
        created_at: row.created_at, updated_at: row.updated_at, email: row.email,
      }],
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_anonymous: false,
    };
    if (factors.length) out.factors = factors;
    return out;
  }

  async function findUser(client, { id, email }) {
    const { rows } = id
      ? await client.query('select * from auth.users where id = $1 and deleted_at is null', [id])
      : await client.query('select * from auth.users where lower(email) = $1 and deleted_at is null', [email]);
    return rows[0] ?? null;
  }

  const banned = (u) => u.banned_until && new Date(u.banned_until) > new Date();

  async function hashPassword(client, password) {
    const { rows } = await client.query(`select extensions.crypt($1, extensions.gen_salt('bf', 10)) as h`, [password]);
    return rows[0].h;
  }

  function checkPassword(password) {
    if (typeof password !== 'string' || password.length < cfg.passwordMinLength) {
      throw new HttpError(422, `Password should be at least ${cfg.passwordMinLength} characters.`, 'weak_password');
    }
    if (password.length > 72 && Buffer.byteLength(password) > 72) {
      // bcrypt reads 72 bytes and ignores the rest; say so instead of pretending.
      throw new HttpError(422, 'Password should be at most 72 characters.', 'weak_password');
    }
  }

  async function createUser(client, { email, password, confirmed, invited, userMetadata = {}, appMetadata }) {
    const id = crypto.randomUUID();
    const encrypted = password ? await hashPassword(client, password) : '';
    const { rows } = await client.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                               invited_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
                               created_at, updated_at, confirmation_token, recovery_token,
                               email_change_token_new, email_change)
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, $3,
               case when $4 then now() end, case when $5 then now() end, $6, $7, false, now(), now(), '', '', '', '')
       returning *`,
      [id, email, encrypted, Boolean(confirmed), Boolean(invited),
        JSON.stringify(appMetadata || { provider: 'email', providers: ['email'] }), JSON.stringify(userMetadata || {})],
    );
    await client.query(
      `insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
       values ($1, $2, $3, 'email', now(), now()) on conflict do nothing`,
      [id, id, JSON.stringify({ sub: id, email, email_verified: Boolean(confirmed) })],
    );
    return rows[0];
  }

  // --------------------------------------------------------- sessions ----

  async function amrOf(client, sessionId) {
    const { rows } = await client.query(
      // updated_at, as the Supabase sign-in service does: typing a code again in
      // the same session moves the totp time forward, which is how a check of a
      // fresh code knows it is fresh. created_at would keep the first.
      'select authentication_method as method, updated_at from auth.mfa_amr_claims where session_id = $1 order by updated_at desc',
      [sessionId]);
    return rows.map((r) => ({ method: r.method, timestamp: Math.floor(new Date(r.updated_at).getTime() / 1000) }));
  }

  function accessToken(user, session, amr) {
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + cfg.jwtExpiry;
    const token = sign({
      aud: 'authenticated',
      exp,
      iat,
      iss: `${cfg.publicUrl}/auth/v1`,
      sub: user.id,
      email: user.email,
      phone: '',
      app_metadata: user.raw_app_meta_data || { provider: 'email', providers: ['email'] },
      user_metadata: user.raw_user_meta_data || {},
      role: 'authenticated',
      aal: session.aal || 'aal1',
      amr,
      session_id: session.id,
      is_anonymous: false,
    }, cfg.jwtSecret);
    return { token, exp };
  }

  async function newRefreshToken(client, user, sessionId, parent = null) {
    const token = randomToken(32);
    await client.query(
      `insert into auth.refresh_tokens (instance_id, token, user_id, revoked, created_at, updated_at, parent, session_id)
       values ('00000000-0000-0000-0000-000000000000', $1, $2, false, now(), now(), $3, $4)`,
      [`sha256:${sha256(token)}`, user.id, parent, sessionId]);
    return token;
  }

  async function sessionResponse(client, user, session, refreshToken) {
    const amr = await amrOf(client, session.id);
    const { token, exp } = accessToken(user, session, amr);
    return {
      access_token: token,
      token_type: 'bearer',
      expires_in: cfg.jwtExpiry,
      expires_at: exp,
      refresh_token: refreshToken,
      user: await userJson(client, user),
    };
  }

  /** A new session for this person: aal1, signed in by `method`. */
  async function begin(client, user, method, req) {
    const id = crypto.randomUUID();
    const { rows } = await client.query(
      `insert into auth.sessions (id, user_id, created_at, updated_at, aal, refreshed_at, user_agent, ip)
       values ($1, $2, now(), now(), 'aal1', now() at time zone 'utc', $3, $4) returning *`,
      [id, user.id, String(req.headers['user-agent'] || '').slice(0, 500), clientIp(req, cfg.trustProxy) || null]);
    await client.query(
      `insert into auth.mfa_amr_claims (id, session_id, created_at, updated_at, authentication_method)
       values ($1, $2, now(), now(), $3)`, [crypto.randomUUID(), id, method]);
    const { rows: fresh } = await client.query(
      'update auth.users set last_sign_in_at = now(), updated_at = now() where id = $1 returning *', [user.id]);
    const refresh = await newRefreshToken(client, fresh[0], id);
    return sessionResponse(client, fresh[0], rows[0], refresh);
  }

  /** The person a user token belongs to, with their live session, or an error. */
  async function caller(client, req, { allowService = false } = {}) {
    const token = bearer(req);
    const claims = verify(token, cfg.jwtSecret);
    if (!claims) throw new HttpError(401, 'Invalid or expired token. Sign in again.', 'bad_jwt');
    if (claims.role === 'service_role' && allowService) return { claims, service: true };
    if (claims.role !== 'authenticated' || typeof claims.sub !== 'string') {
      throw new HttpError(401, 'This needs a signed-in person.', 'no_authorization');
    }
    const user = await findUser(client, { id: claims.sub });
    if (!user) throw new HttpError(403, 'User from sub claim in JWT does not exist', 'user_not_found');
    const { rows } = await client.query('select * from auth.sessions where id = $1 and user_id = $2',
      [claims.session_id || '00000000-0000-0000-0000-000000000000', user.id]);
    if (!rows[0]) throw new HttpError(403, 'Session from session_id claim in JWT does not exist', 'session_not_found');
    if (banned(user)) throw new HttpError(403, 'User is banned', 'user_banned');
    return { claims, user, session: rows[0] };
  }

  const isService = (req) => verify(bearer(req), cfg.jwtSecret)?.role === 'service_role';

  // ------------------------------------------------------- one-time links ----

  async function issueLink(client, user, kind) {
    const tokenType = kind === 'recovery' ? 'recovery_token' : 'confirmation_token';
    const codeType = kind === 'recovery' ? 'recovery_code' : 'confirmation_code';
    const link = crypto.randomBytes(32).toString('hex');
    const otp = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    for (const [type, hash] of [[tokenType, sha256(link)], [codeType, sha256(`${user.email}:${otp}`)]]) {
      await client.query(
        `insert into auth.one_time_tokens (id, user_id, token_type, token_hash, relates_to, created_at, updated_at, attempts)
         values ($1, $2, $3, $4, $5, now(), now(), 0)
         on conflict (user_id, token_type) do update
           set token_hash = excluded.token_hash, created_at = now(), updated_at = now(), attempts = 0`,
        [crypto.randomUUID(), user.id, type, hash, user.email]);
    }
    await client.query(
      kind === 'recovery'
        ? 'update auth.users set recovery_sent_at = now(), updated_at = now() where id = $1'
        : 'update auth.users set confirmation_sent_at = now(), updated_at = now() where id = $1',
      [user.id]);
    return { tokenHash: link, otp };
  }

  const expiryFor = (kind) => (kind === 'recovery' ? cfg.recoveryExpiry : cfg.inviteExpiry);

  // ------------------------------------------------------------ routes ----

  async function passwordGrant(req, res) {
    const body = await readJson(req);
    const email = cleanEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    const ip = clientIp(req, cfg.trustProxy);
    limit(limits.signInByIp, ip);
    if (email) limit(limits.signInByEmail, email);
    const invalid = new HttpError(400, 'Invalid login credentials', 'invalid_credentials');
    if (!email || !password || password.length > 1024) throw invalid;

    const answer = await withClient(async (client) => {
      const user = await findUser(client, { email });
      // The same work whether or not the address exists, so the time taken
      // does not say which.
      const { rows } = await client.query(
        `select coalesce(extensions.crypt($1, coalesce(nullif($2, ''), '$2a$10$abcdefghijklmnopqrstuu')) = $2, false) as ok`,
        [password, user?.encrypted_password || null]);
      if (!user || !rows[0].ok) {
        await audit(client, 'login_failed', user?.id, ip);
        return new Refusal(invalid);
      }
      if (banned(user)) throw new HttpError(400, 'User is banned', 'user_banned');
      if (!user.email_confirmed_at && !cfg.autoconfirm) {
        throw new HttpError(400, 'Email not confirmed', 'email_not_confirmed');
      }
      await audit(client, 'login', user.id, ip);
      return begin(client, user, 'password', req);
    });
    send(res, 200, answer);
  }

  async function refreshGrant(req, res) {
    const body = await readJson(req);
    const token = typeof body.refresh_token === 'string' ? body.refresh_token : '';
    limit(limits.refreshByIp, clientIp(req, cfg.trustProxy));
    if (!token || token.length > 255) {
      throw new HttpError(400, 'Invalid Refresh Token: Refresh Token Not Found', 'refresh_token_not_found');
    }
    const answer = await withClient(async (client) => {
      const { rows } = await client.query(
        `select * from auth.refresh_tokens where token = $1 or token = $2 for update`,
        [`sha256:${sha256(token)}`, token]);
      const row = rows[0];
      if (!row) throw new HttpError(400, 'Invalid Refresh Token: Refresh Token Not Found', 'refresh_token_not_found');
      const { rows: s } = await client.query('select * from auth.sessions where id = $1', [row.session_id]);
      const session = s[0];
      if (!session) throw new HttpError(400, 'Invalid Refresh Token: Refresh Token Not Found', 'refresh_token_not_found');
      const user = await findUser(client, { id: session.user_id });
      if (!user) throw new HttpError(400, 'Invalid Refresh Token: Refresh Token Not Found', 'refresh_token_not_found');
      if (banned(user)) throw new HttpError(400, 'Invalid Refresh Token: User is banned', 'user_banned');

      if (row.revoked) {
        // A token spent a moment ago by another tab is answered with that
        // tab's result. Spent longer ago, it is a stolen copy being replayed:
        // the whole session ends, for the thief and the owner alike.
        const age = (Date.now() - new Date(row.updated_at).getTime()) / 1000;
        const { rows: child } = await client.query(
          `select * from auth.refresh_tokens where session_id = $1 and revoked = false order by id desc limit 1`,
          [session.id]);
        if (age <= REUSE_SECONDS && child[0]) {
          // The newest token is handed out again by issuing its successor,
          // since only its hash is kept.
          await client.query('update auth.refresh_tokens set revoked = true, updated_at = now() where id = $1', [child[0].id]);
          const next = await newRefreshToken(client, user, session.id, child[0].token);
          return sessionResponse(client, user, session, next);
        }
        await client.query('delete from auth.sessions where id = $1', [session.id]);
        await audit(client, 'token_reuse_detected', user.id, clientIp(req, cfg.trustProxy));
        return new Refusal(new HttpError(400, 'Invalid Refresh Token: Already Used', 'refresh_token_already_used'));
      }

      await client.query('update auth.refresh_tokens set revoked = true, updated_at = now() where id = $1', [row.id]);
      await client.query(`update auth.sessions set refreshed_at = now() at time zone 'utc', updated_at = now() where id = $1`, [session.id]);
      const next = await newRefreshToken(client, user, session.id, row.token);
      return sessionResponse(client, user, session, next);
    });
    send(res, 200, answer);
  }

  async function verifyLink(req, res) {
    const body = await readJson(req);
    const type = String(body.type || '');
    const kind = type === 'recovery' ? 'recovery' : ['invite', 'signup', 'email', 'magiclink'].includes(type) ? 'invite' : '';
    if (!kind) throw new HttpError(400, 'Verify requires a verification type', 'validation_failed');
    limit(limits.verifyByIp, clientIp(req, cfg.trustProxy));
    const expired = new HttpError(403, 'Email link is invalid or has expired', 'otp_expired');

    const answer = await withClient(async (client) => {
      let row;
      if (typeof body.token_hash === 'string' && body.token_hash) {
        const { rows } = await client.query(
          `select * from auth.one_time_tokens where token_hash = $1 and token_type = $2 for update`,
          [sha256(body.token_hash), kind === 'recovery' ? 'recovery_token' : 'confirmation_token']);
        row = rows[0];
      } else {
        const email = cleanEmail(body.email);
        const code = String(body.token || '').replace(/\s+/g, '');
        if (!email || !/^\d{6}$/.test(code)) throw expired;
        limit(limits.codeByEmail, email);
        const codeType = kind === 'recovery' ? 'recovery_code' : 'confirmation_code';
        const { rows } = await client.query(
          `select t.* from auth.one_time_tokens t join auth.users u on u.id = t.user_id
            where lower(u.email) = $1 and t.token_type = $2 for update of t`, [email, codeType]);
        const candidate = rows[0];
        if (!candidate) throw expired;
        const given = Buffer.from(sha256(`${email}:${code}`));
        if (!crypto.timingSafeEqual(given, Buffer.from(candidate.token_hash))) {
          // Five wrong codes and the code is gone; the link still works.
          await client.query('update auth.one_time_tokens set attempts = attempts + 1 where id = $1', [candidate.id]);
          await client.query('delete from auth.one_time_tokens where id = $1 and attempts >= 5', [candidate.id]);
          return new Refusal(expired);
        }
        row = candidate;
      }
      if (!row) throw expired;
      if (Date.now() - new Date(row.created_at).getTime() > expiryFor(kind) * 1000) {
        await client.query('delete from auth.one_time_tokens where id = $1', [row.id]);
        return new Refusal(expired);
      }
      // Spent: the link and its code go together.
      await client.query(
        `delete from auth.one_time_tokens where user_id = $1 and token_type = any($2)`,
        [row.user_id, kind === 'recovery' ? ['recovery_token', 'recovery_code'] : ['confirmation_token', 'confirmation_code']]);
      const { rows: u } = await client.query(
        `update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
          where id = $1 and deleted_at is null returning *`, [row.user_id]);
      if (!u[0]) throw expired;
      if (banned(u[0])) throw new HttpError(403, 'User is banned', 'user_banned');
      await audit(client, kind === 'recovery' ? 'user_recovered' : 'user_confirmed', u[0].id, clientIp(req, cfg.trustProxy));
      return begin(client, u[0], kind === 'recovery' ? 'otp' : 'invite', req);
    });
    send(res, 200, answer);
  }

  async function recover(req, res) {
    const body = await readJson(req);
    const email = cleanEmail(body.email);
    if (!email) throw new HttpError(400, 'Unable to validate email address: invalid format', 'validation_failed');
    limit(limits.mailByEmail, email, 'over_email_send_rate_limit');
    const sent = await withClient(async (client) => {
      const user = await findUser(client, { email });
      if (!user || banned(user)) return null;
      const link = await issueLink(client, user, 'recovery');
      await audit(client, 'user_recovery_requested', user.id, clientIp(req, cfg.trustProxy));
      return { email: user.email, ...link };
    });
    // Sent after the transaction, so a slow mail server holds no locks.
    if (sent) await mailer.sendLink({ kind: 'recovery', to: sent.email, tokenHash: sent.tokenHash, otp: sent.otp });
    send(res, 200, {});
  }

  async function signup(req, res) {
    if (!cfg.signupEnabled) throw new HttpError(422, 'Signups not allowed for this instance', 'signup_disabled');
    const body = await readJson(req);
    const email = cleanEmail(body.email);
    if (!email) throw new HttpError(400, 'Unable to validate email address: invalid format', 'validation_failed');
    checkPassword(body.password);
    limit(limits.mailByEmail, email, 'over_email_send_rate_limit');
    const data = body.data && typeof body.data === 'object' ? body.data : {};
    const result = await withClient(async (client) => {
      const existing = await findUser(client, { email });
      if (existing) {
        // The same answer as a new account, so sign-up says nothing about
        // who is already here.
        return { fake: { id: crypto.randomUUID(), aud: 'authenticated', role: '', email, phone: '',
          app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [],
          created_at: nowIso(), updated_at: nowIso(), is_anonymous: false } };
      }
      const user = await createUser(client, { email, password: body.password, confirmed: cfg.autoconfirm, userMetadata: data });
      if (cfg.autoconfirm) return { session: await begin(client, user, 'password', req) };
      const link = await issueLink(client, user, 'invite');
      return { user: await userJson(client, user), link };
    });
    if (result.fake) return send(res, 200, result.fake);
    if (result.session) return send(res, 200, result.session);
    await mailer.sendLink({ kind: 'invite', to: email, tokenHash: result.link.tokenHash, otp: result.link.otp });
    send(res, 200, result.user);
  }

  async function getUser(req, res) {
    const answer = await withClient(async (client) => {
      const { user } = await caller(client, req);
      return userJson(client, user);
    });
    send(res, 200, answer);
  }

  async function updateUser(req, res) {
    const body = await readJson(req);
    const answer = await withClient(async (client) => {
      const { user, claims } = await caller(client, req);
      if (body.email !== undefined && cleanEmail(body.email) !== user.email) {
        throw new HttpError(422, 'Changing the e-mail address is not available on this server.', 'email_change_unavailable');
      }
      let row = user;
      if (body.password !== undefined) {
        checkPassword(body.password);
        const factors = await factorsOf(client, user.id);
        if (factors.some((f) => f.status === 'verified') && claims.aal !== 'aal2') {
          throw new HttpError(401, 'AAL2 session is required to update password', 'insufficient_aal');
        }
        const { rows: same } = await client.query(
          `select coalesce(encrypted_password, '') <> '' and encrypted_password = extensions.crypt($1, encrypted_password) as same
             from auth.users where id = $2`, [body.password, user.id]);
        if (same[0]?.same) {
          throw new HttpError(422, 'New password should be different from the old password.', 'same_password');
        }
        const hash = await hashPassword(client, body.password);
        ({ rows: [row] } = await client.query(
          'update auth.users set encrypted_password = $1, updated_at = now() where id = $2 returning *', [hash, user.id]));
        await audit(client, 'user_updated_password', user.id, clientIp(req, cfg.trustProxy));
      }
      if (body.data && typeof body.data === 'object') {
        ({ rows: [row] } = await client.query(
          `update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || $1::jsonb, updated_at = now()
            where id = $2 returning *`, [JSON.stringify(body.data), user.id]));
      }
      return userJson(client, row);
    });
    send(res, 200, answer);
  }

  async function logout(req, res, url) {
    const scope = url.searchParams.get('scope') || 'global';
    await withClient(async (client) => {
      const { user, session } = await caller(client, req);
      if (scope === 'local') {
        await client.query('delete from auth.sessions where id = $1', [session.id]);
      } else if (scope === 'others') {
        await client.query('delete from auth.sessions where user_id = $1 and id <> $2', [user.id, session.id]);
      } else {
        await client.query('delete from auth.sessions where user_id = $1', [user.id]);
      }
      await audit(client, 'logout', user.id, clientIp(req, cfg.trustProxy), { scope });
    });
    send(res, 204);
  }

  // ------------------------------------------------------------ two-step ----

  async function enroll(req, res) {
    const body = await readJson(req);
    if (body.factor_type !== 'totp') {
      throw new HttpError(422, 'Only authenticator apps (totp) are available on this server.', 'mfa_factor_type_unsupported');
    }
    const answer = await withClient(async (client) => {
      const { user, claims } = await caller(client, req);
      limit(limits.mfaByUser, `enroll:${user.id}`);
      const factors = await factorsOf(client, user.id);
      if (factors.some((f) => f.status === 'verified') && claims.aal !== 'aal2') {
        throw new HttpError(401, 'AAL2 required to enroll a new factor', 'insufficient_aal');
      }
      if (factors.filter((f) => f.status !== 'verified').length >= MAX_UNVERIFIED_FACTORS) {
        throw new HttpError(422, 'Maximum number of unverified factors reached, unenroll to continue', 'too_many_enrolled_mfa_factors');
      }
      const issuer = String(body.issuer || 'Hope Beacon').slice(0, 64);
      const secret = newSecret();
      const uri = otpauthUri({ issuer, account: user.email, secret });
      const id = crypto.randomUUID();
      const friendly = typeof body.friendly_name === 'string' ? body.friendly_name.slice(0, 64) : '';
      await client.query(
        `insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
         values ($1, $2, $3, 'totp', 'unverified', now(), now(), $4)`, [id, user.id, friendly, seal(secret)]);
      const qr = await QRCode.toString(uri, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
      return { id, type: 'totp', friendly_name: friendly, totp: { qr_code: qr, secret, uri } };
    });
    send(res, 200, answer);
  }

  async function factorOf(client, user, factorId) {
    if (!/^[0-9a-f-]{36}$/i.test(factorId)) throw new HttpError(404, 'Factor not found', 'mfa_factor_not_found');
    const { rows } = await client.query('select * from auth.mfa_factors where id = $1 and user_id = $2 for update', [factorId, user.id]);
    if (!rows[0]) throw new HttpError(404, 'Factor not found', 'mfa_factor_not_found');
    return rows[0];
  }

  async function challenge(req, res, factorId) {
    const answer = await withClient(async (client) => {
      const { user } = await caller(client, req);
      limit(limits.mfaByUser, `challenge:${user.id}`);
      const factor = await factorOf(client, user, factorId);
      const id = crypto.randomUUID();
      await client.query(
        `insert into auth.mfa_challenges (id, factor_id, created_at, ip_address) values ($1, $2, now(), $3)`,
        [id, factor.id, clientIp(req, cfg.trustProxy) || '0.0.0.0']);
      await client.query('update auth.mfa_factors set last_challenged_at = now() where id = $1', [factor.id]);
      return { id, type: 'totp', expires_at: Math.floor(Date.now() / 1000) + CHALLENGE_SECONDS };
    });
    send(res, 200, answer);
  }

  async function verifyFactor(req, res, factorId) {
    const body = await readJson(req);
    const answer = await withClient(async (client) => {
      const { user, session } = await caller(client, req);
      limit(limits.mfaByUser, `verify:${factorId}`);
      const factor = await factorOf(client, user, factorId);
      const { rows: c } = await client.query(
        'select * from auth.mfa_challenges where id = $1 and factor_id = $2 for update', [String(body.challenge_id || ''), factor.id]);
      const ch = c[0];
      if (!ch || ch.verified_at) throw new HttpError(422, 'Challenge not found', 'mfa_challenge_expired');
      if (Date.now() - new Date(ch.created_at).getTime() > CHALLENGE_SECONDS * 1000) {
        throw new HttpError(422, 'MFA challenge has expired, verify against another challenge or create a new challenge.', 'mfa_challenge_expired');
      }
      const code = String(body.code || '').replace(/\s+/g, '');
      const step = matchStep(unseal(factor.secret), code);
      // A code already used once does not work again, even inside its 30 seconds.
      const { rows: used } = await client.query(
        `select coalesce(max(otp_code::bigint), -1) as last from auth.mfa_challenges
          where factor_id = $1 and verified_at is not null and otp_code ~ '^[0-9]+$'`, [factor.id]);
      if (step < 0 || step <= Number(used[0].last)) {
        throw new HttpError(422, 'Invalid TOTP code entered', 'mfa_verification_failed');
      }
      await client.query('update auth.mfa_challenges set verified_at = now(), otp_code = $2 where id = $1', [ch.id, String(step)]);
      const firstTime = factor.status !== 'verified';
      await client.query(
        `update auth.mfa_factors set status = 'verified', updated_at = now(),
                secret = case when secret like 'enc1:%' then secret else $2 end where id = $1`,
        [factor.id, seal(unseal(factor.secret))]);
      // This session is now password AND code.
      const { rows: s } = await client.query(
        `update auth.sessions set aal = 'aal2', factor_id = $2, updated_at = now() where id = $1 returning *`, [session.id, factor.id]);
      await client.query(
        `insert into auth.mfa_amr_claims (id, session_id, created_at, updated_at, authentication_method)
         values ($1, $2, now(), now(), 'totp')
         on conflict (session_id, authentication_method) do update set updated_at = now()`, [crypto.randomUUID(), session.id]);
      if (firstTime) {
        // A new authenticator app ends every other password-only session:
        // whoever else knew the password is signed out by setting it up.
        await client.query(`delete from auth.sessions where user_id = $1 and id <> $2 and coalesce(aal, 'aal1') <> 'aal2'`, [user.id, session.id]);
      }
      await client.query('update auth.refresh_tokens set revoked = true, updated_at = now() where session_id = $1 and revoked = false', [session.id]);
      const refresh = await newRefreshToken(client, user, session.id);
      await audit(client, 'mfa_verified', user.id, clientIp(req, cfg.trustProxy));
      return sessionResponse(client, user, s[0], refresh);
    });
    send(res, 200, answer);
  }

  async function unenroll(req, res, factorId) {
    const answer = await withClient(async (client) => {
      const { user, claims } = await caller(client, req);
      const factor = await factorOf(client, user, factorId);
      if (factor.status === 'verified' && claims.aal !== 'aal2') {
        throw new HttpError(401, 'AAL2 required to unenroll verified factor', 'insufficient_aal');
      }
      await client.query('delete from auth.mfa_factors where id = $1', [factor.id]);
      await client.query(`update auth.sessions set aal = 'aal1', factor_id = null where factor_id = $1`, [factor.id]);
      await audit(client, 'mfa_unenrolled', user.id, clientIp(req, cfg.trustProxy));
      return { id: factor.id };
    });
    send(res, 200, answer);
  }

  // ------------------------------------------------------------- admin ----

  function needService(req) {
    if (!isService(req)) throw new HttpError(403, 'User not allowed', 'not_admin');
  }

  function banUntil(duration) {
    if (duration === undefined) return undefined;
    if (duration === 'none') return null;
    const m = /^(\d+)h$/.exec(String(duration));
    if (!m) throw new HttpError(400, 'ban_duration must be "none" or hours such as "876000h".', 'validation_failed');
    return new Date(Date.now() + Number(m[1]) * 3_600_000).toISOString();
  }

  async function adminCreate(req, res) {
    needService(req);
    const body = await readJson(req);
    const email = cleanEmail(body.email);
    if (!email) throw new HttpError(400, 'Unable to validate email address: invalid format', 'validation_failed');
    if (body.password !== undefined) checkPassword(body.password);
    const answer = await withClient(async (client) => {
      if (await findUser(client, { email })) {
        throw new HttpError(422, 'A user with this email address has already been registered', 'email_exists');
      }
      const user = await createUser(client, {
        email, password: body.password, confirmed: Boolean(body.email_confirm),
        userMetadata: body.user_metadata, appMetadata: body.app_metadata,
      });
      const until = banUntil(body.ban_duration);
      if (until !== undefined) await client.query('update auth.users set banned_until = $2 where id = $1', [user.id, until]);
      await audit(client, 'user_signedup', user.id, clientIp(req, cfg.trustProxy), { by: 'service' });
      return userJson(client, (await findUser(client, { id: user.id })));
    });
    send(res, 200, answer);
  }

  async function adminUpdate(req, res, id) {
    needService(req);
    const body = await readJson(req);
    if (body.password !== undefined) checkPassword(body.password);
    const answer = await withClient(async (client) => {
      const user = await findUser(client, { id });
      if (!user) throw new HttpError(404, 'User not found', 'user_not_found');
      if (body.password !== undefined) {
        const hash = await hashPassword(client, body.password);
        await client.query('update auth.users set encrypted_password = $2, updated_at = now() where id = $1', [id, hash]);
      }
      if (body.email_confirm === true) {
        await client.query('update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1', [id]);
      }
      if (body.user_metadata && typeof body.user_metadata === 'object') {
        await client.query(`update auth.users set raw_user_meta_data = coalesce(raw_user_meta_data, '{}') || $2::jsonb where id = $1`,
          [id, JSON.stringify(body.user_metadata)]);
      }
      if (body.app_metadata && typeof body.app_metadata === 'object') {
        await client.query(`update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}') || $2::jsonb where id = $1`,
          [id, JSON.stringify(body.app_metadata)]);
      }
      const until = banUntil(body.ban_duration);
      if (until !== undefined) await client.query('update auth.users set banned_until = $2 where id = $1', [id, until]);
      if (body.email !== undefined && cleanEmail(body.email) !== user.email) {
        throw new HttpError(422, 'Changing the e-mail address is not available on this server.', 'email_change_unavailable');
      }
      await client.query('update auth.users set updated_at = now() where id = $1', [id]);
      return userJson(client, await findUser(client, { id }));
    });
    send(res, 200, answer);
  }

  async function adminGet(req, res, id) {
    needService(req);
    const answer = await withClient(async (client) => {
      const user = await findUser(client, { id });
      if (!user) throw new HttpError(404, 'User not found', 'user_not_found');
      return userJson(client, user);
    });
    send(res, 200, answer);
  }

  async function adminDelete(req, res, id) {
    needService(req);
    await withClient(async (client) => {
      const { rowCount } = await client.query('delete from auth.users where id = $1', [id]);
      if (!rowCount) throw new HttpError(404, 'User not found', 'user_not_found');
    });
    send(res, 200, {});
  }

  async function invite(req, res) {
    needService(req);
    const body = await readJson(req);
    const email = cleanEmail(body.email);
    if (!email) throw new HttpError(400, 'Unable to validate email address: invalid format', 'validation_failed');
    const made = await withClient(async (client) => {
      let user = await findUser(client, { email });
      if (user?.email_confirmed_at) {
        throw new HttpError(422, 'A user with this email address has already been registered', 'email_exists');
      }
      // Counted only when a message will go: the refusal above sends nothing,
      // and the invite function follows it with a password-reset e-mail.
      limit(limits.mailByEmail, email, 'over_email_send_rate_limit');
      if (!user) user = await createUser(client, { email, invited: true, userMetadata: body.data });
      const link = await issueLink(client, user, 'invite');
      await client.query('update auth.users set invited_at = now() where id = $1', [user.id]);
      await audit(client, 'user_invited', user.id, clientIp(req, cfg.trustProxy));
      return { user: await userJson(client, user), link };
    });
    await mailer.sendLink({ kind: 'invite', to: email, tokenHash: made.link.tokenHash, otp: made.link.otp });
    send(res, 200, made.user);
  }

  async function withClient(work) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      const out = await work(client);
      await client.query('commit');
      // A refusal whose consequences must stand (a stolen token's session
      // ended, a wrong code counted) is thrown only after they are saved.
      if (out instanceof Refusal) throw out.error;
      return out;
    } catch (err) {
      await client.query('rollback').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------- dispatch ----

  async function handle(req, res, sub, url) {
    const m = req.method;
    let match;
    if (sub === '/health' && m === 'GET') return send(res, 200, { name: 'Beacon', description: 'Hope Beacon sign-in (Postgres edition)' });
    if (sub === '/settings' && m === 'GET') {
      return send(res, 200, {
        external: { email: true, phone: false }, disable_signup: !cfg.signupEnabled,
        mailer_autoconfirm: cfg.autoconfirm, phone_autoconfirm: false, sms_provider: '', saml_enabled: false,
      });
    }
    if (sub === '/token' && m === 'POST') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') return passwordGrant(req, res);
      if (grant === 'refresh_token') return refreshGrant(req, res);
      throw new HttpError(400, 'This server signs in with a password or an e-mailed link only.', 'unsupported_grant_type');
    }
    if (sub === '/verify' && m === 'POST') return verifyLink(req, res);
    if (sub === '/verify' && m === 'GET') {
      // The old-style link that a mail scanner spends by opening it. Refused,
      // so that no template can bring that failure back.
      throw new HttpError(400, 'Open the link from your e-mail in the app instead.', 'validation_failed');
    }
    if (sub === '/recover' && m === 'POST') return recover(req, res);
    if (sub === '/signup' && m === 'POST') return signup(req, res);
    if (sub === '/user' && m === 'GET') return getUser(req, res);
    if (sub === '/user' && m === 'PUT') return updateUser(req, res);
    if (sub === '/logout' && m === 'POST') return logout(req, res, url);
    if (sub === '/factors' && m === 'POST') return enroll(req, res);
    if ((match = /^\/factors\/([^/]+)\/challenge$/.exec(sub)) && m === 'POST') return challenge(req, res, match[1]);
    if ((match = /^\/factors\/([^/]+)\/verify$/.exec(sub)) && m === 'POST') return verifyFactor(req, res, match[1]);
    if ((match = /^\/factors\/([^/]+)$/.exec(sub)) && m === 'DELETE') return unenroll(req, res, match[1]);
    if (sub === '/invite' && m === 'POST') return invite(req, res);
    if (sub === '/admin/users' && m === 'POST') return adminCreate(req, res);
    if ((match = /^\/admin\/users\/([0-9a-f-]{36})$/i.exec(sub))) {
      if (m === 'GET') return adminGet(req, res, match[1]);
      if (m === 'PUT') return adminUpdate(req, res, match[1]);
      if (m === 'DELETE') return adminDelete(req, res, match[1]);
    }
    throw new HttpError(404, 'Not found', 'not_found');
  }

  /** The claims of a token, if it is a live person's or the service key, for the other services. */
  async function claimsFor(token) {
    const claims = verify(token, cfg.jwtSecret);
    return claims && typeof claims.role === 'string' ? claims : null;
  }

  return { handle, claimsFor };
}
