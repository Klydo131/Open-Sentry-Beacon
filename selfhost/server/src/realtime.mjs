// Live data: the screens that keep up by themselves (lib/live/keep-up.ts,
// subscribeToMessages in lib/live/data.ts). The same websocket protocol as
// Supabase Realtime, so supabase-js connects here unchanged.
//
// WHAT A SCREEN IS TOLD, AND WHEN. The app only ever uses a change as a cue to
// read again ("something in announcements changed"), never the row itself, so
// this server sends the cue and no row: `record` and `old_record` are always
// empty. The screen's own read then goes through the row rules like any other.
//
// WHO IS TOLD. A table announces a change with the row's key and nothing else
// (selfhost/sql/platform.sql, beacon_platform.announce). Before passing it on,
// this server asks the database, AS EACH PERSON WATCHING, whether they can see
// that row: the same rules, the same suspended-account and ended-session
// checks as every other request. Somebody who could not read the row is not
// even told that it changed. A deleted row cannot be read again, so a deletion
// reaches whoever watches that table with a matching filter, which is what
// Supabase does too.

import crypto from 'node:crypto';
import pg from 'pg';
import { WebSocketServer } from 'ws';
import { verify } from './jwt.mjs';
import { asPerson } from './db.mjs';

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const OPS = { eq: '=', neq: '<>', lt: '<', lte: '<=', gt: '>', gte: '>=' };
const MAX_CHANNELS = 100;
const IDLE_MS = 90_000;

/** "pairing_id=eq.<uuid>" as { column, op, value }, or null if it is not a filter this server can apply. */
export function parseFilter(text) {
  if (!text) return { none: true };
  const m = /^([a-z_][a-z0-9_]{0,62})=(eq|neq|lt|lte|gt|gte|in)\.(.*)$/.exec(String(text));
  if (!m) return null;
  if (m[2] === 'in') {
    const inner = /^\((.*)\)$/.exec(m[3]);
    if (!inner) return null;
    return { column: m[1], op: 'in', value: inner[1].split(',').map((v) => v.trim()).slice(0, 100) };
  }
  return { column: m[1], op: m[2], value: m[3] };
}

/** Whether a deleted row's remembered values pass the filter. */
export function oldRowMatches(filter, old) {
  if (filter.none) return true;
  if (!old || !(filter.column in old)) return false;
  const have = old[filter.column];
  const text = have === null ? 'null' : String(have);
  if (filter.op === 'in') return filter.value.includes(text);
  if (filter.op === 'eq') return text === filter.value;
  if (filter.op === 'neq') return text !== filter.value;
  const a = Number(have);
  const b = Number(filter.value);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return { lt: a < b, lte: a <= b, gt: a > b, gte: a >= b }[filter.op];
}

export function createRealtime({ cfg, pool, preRequest, keys }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });
  const sockets = new Set();
  let listener = null;
  let stopping = false;

  const sameKey = (a, b) => {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };

  function encode(ws, msg) {
    return ws.vsn === '2.0.0'
      ? JSON.stringify([msg.join_ref ?? null, msg.ref ?? null, msg.topic, msg.event, msg.payload])
      : JSON.stringify(msg);
  }

  function decode(ws, raw) {
    const value = JSON.parse(raw);
    if (ws.vsn === '2.0.0') {
      if (!Array.isArray(value)) throw new Error('expected an array');
      const [join_ref, ref, topic, event, payload] = value;
      return { join_ref, ref, topic, event, payload };
    }
    return value;
  }

  const out = (ws, msg) => {
    if (ws.readyState === ws.OPEN) ws.send(encode(ws, msg));
  };
  const reply = (ws, msg, status, response = {}) =>
    out(ws, { join_ref: msg.join_ref, ref: msg.ref, topic: msg.topic, event: 'phx_reply', payload: { status, response } });

  function claimsFrom(token, ws) {
    if (token) {
      const c = verify(token, cfg.jwtSecret);
      return c && typeof c.role === 'string' ? c : null;
    }
    return ws.keyClaims;
  }

  function join(ws, msg) {
    if (ws.channels.size >= MAX_CHANNELS && !ws.channels.has(msg.topic)) {
      return reply(ws, msg, 'error', { reason: 'Too many channels on one connection.' });
    }
    const payload = msg.payload || {};
    const claims = claimsFrom(payload.access_token, ws);
    if (!claims) return reply(ws, msg, 'error', { reason: 'Invalid token' });
    const requested = Array.isArray(payload.config?.postgres_changes) ? payload.config.postgres_changes : [];
    const bindings = [];
    for (const b of requested.slice(0, 20)) {
      const schema = b?.schema ?? 'public';
      const table = b?.table;
      const event = String(b?.event ?? '*').toUpperCase();
      const filter = parseFilter(b?.filter);
      if (schema !== 'public' || !IDENT.test(String(table || '')) || !['*', 'INSERT', 'UPDATE', 'DELETE'].includes(event) || !filter) {
        return reply(ws, msg, 'error', { reason: `Unable to watch ${schema}.${table}${b?.filter ? ` with ${b.filter}` : ''}.` });
      }
      bindings.push({
        id: crypto.randomInt(1, 2 ** 31),
        event: b.event ?? '*', schema, table, filter: b.filter, parsed: filter,
      });
    }
    ws.channels.set(msg.topic, { joinRef: msg.join_ref, claims, bindings });
    reply(ws, msg, 'ok', {
      postgres_changes: bindings.map(({ id, event, schema, table, filter }) => ({ id, event, schema, table, filter })),
    });
  }

  function onMessage(ws, raw) {
    ws.lastSeen = Date.now();
    if (++ws.recent > 200) return ws.close(1008, 'Too many messages');
    let msg;
    try {
      msg = decode(ws, raw.toString());
    } catch {
      return ws.close(1003, 'Unreadable message');
    }
    if (typeof msg?.topic !== 'string' || typeof msg?.event !== 'string') return undefined;
    if (msg.topic === 'phoenix' && msg.event === 'heartbeat') return reply(ws, msg, 'ok');
    if (msg.event === 'phx_join') return join(ws, msg);
    if (msg.event === 'phx_leave') {
      ws.channels.delete(msg.topic);
      return reply(ws, msg, 'ok');
    }
    if (msg.event === 'access_token') {
      const channel = ws.channels.get(msg.topic);
      const claims = claimsFrom(msg.payload?.access_token, ws);
      if (channel && claims) channel.claims = claims;
      else if (channel) {
        ws.channels.delete(msg.topic);
        out(ws, { join_ref: channel.joinRef, ref: null, topic: msg.topic, event: 'phx_close', payload: {} });
      }
      return undefined;
    }
    // Broadcast and presence are not used by the app, and not offered.
    if (msg.ref) reply(ws, msg, 'ok');
    return undefined;
  }

  /** Whether this person can see this row now, by the database's own rules. */
  async function canSee(claims, change, binding) {
    const keyCols = Object.keys(change.k || {});
    if (keyCols.length === 0 || !keyCols.every((c) => IDENT.test(c))) return false;
    const where = [];
    const params = [];
    for (const col of keyCols) {
      params.push(change.k[col] === null ? null : String(change.k[col]));
      where.push(`"${col}" = $${params.length}`);
    }
    const f = binding.parsed;
    if (!f.none) {
      if (f.op === 'in') {
        params.push(f.value);
        where.push(`"${f.column}" = any($${params.length})`);
      } else {
        params.push(f.value);
        where.push(`"${f.column}" ${OPS[f.op]} $${params.length}`);
      }
    }
    try {
      return await asPerson(pool, claims, async (client) => {
        const { rowCount } = await client.query(
          `select 1 from "${change.s}"."${change.t}" where ${where.join(' and ')} limit 1`, params);
        return rowCount > 0;
      }, { preRequest });
    } catch {
      // Refused (no rights, suspended, session ended) or unreadable: not told.
      return false;
    }
  }

  async function deliver(change) {
    if (!IDENT.test(change.t) || !IDENT.test(change.s)) return;
    const now = Math.floor(Date.now() / 1000);
    const commit = new Date().toISOString();
    const tasks = [];
    for (const ws of sockets) {
      for (const [topic, channel] of ws.channels) {
        if (typeof channel.claims.exp === 'number' && channel.claims.exp < now) continue;
        const candidates = channel.bindings.filter((b) => b.schema === change.s && b.table === change.t
          && (b.event === '*' || String(b.event).toUpperCase() === change.op));
        if (candidates.length === 0) continue;
        tasks.push((async () => {
          const ids = [];
          for (const b of candidates) {
            const ok = change.op === 'DELETE' ? oldRowMatches(b.parsed, change.o) : await canSee(channel.claims, change, b);
            if (ok) ids.push(b.id);
          }
          if (ids.length === 0) return;
          out(ws, {
            join_ref: channel.joinRef, ref: null, topic, event: 'postgres_changes',
            payload: {
              ids,
              data: {
                schema: change.s, table: change.t, commit_timestamp: commit, type: change.op,
                columns: [], record: {}, old_record: {}, errors: null,
              },
            },
          });
        })());
      }
    }
    await Promise.allSettled(tasks);
  }

  // One change at a time, in the order the database committed them.
  let chain = Promise.resolve();
  const enqueue = (change) => {
    chain = chain.then(() => deliver(change)).catch((err) =>
      console.error(JSON.stringify({ at: 'realtime', error: err.message })));
  };

  async function listen(attempt = 0) {
    if (stopping) return;
    const client = new pg.Client({ connectionString: cfg.databaseUrl, application_name: 'beacon-realtime' });
    client.on('notification', (n) => {
      if (n.channel !== 'beacon_realtime' || !n.payload) return;
      try {
        enqueue(JSON.parse(n.payload));
      } catch { /* not ours */ }
    });
    client.on('error', () => {});
    client.on('end', () => {
      listener = null;
      if (!stopping) setTimeout(() => listen(attempt + 1), Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)));
    });
    try {
      await client.connect();
      await client.query('listen beacon_realtime');
      listener = client;
      attempt = 0;
    } catch (err) {
      console.error(JSON.stringify({ at: 'realtime', error: `could not listen: ${err.message}` }));
      client.end().catch(() => {});
    }
  }

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const ws of sockets) {
      ws.recent = 0;
      if (now - ws.lastSeen > IDLE_MS) ws.terminate();
    }
  }, 10_000);
  sweep.unref();

  function upgrade(req, socket, head, url) {
    const apikey = url.searchParams.get('apikey') || String(req.headers.apikey || '');
    const keyRole = sameKey(apikey, keys.anon) ? 'anon' : sameKey(apikey, keys.service) ? 'service_role' : '';
    if (!keyRole) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.vsn = url.searchParams.get('vsn') === '2.0.0' ? '2.0.0' : '1.0.0';
      ws.keyClaims = verify(apikey, cfg.jwtSecret) || { role: keyRole };
      ws.channels = new Map();
      ws.lastSeen = Date.now();
      ws.recent = 0;
      sockets.add(ws);
      ws.on('message', (raw) => onMessage(ws, raw));
      ws.on('close', () => sockets.delete(ws));
      ws.on('error', () => sockets.delete(ws));
    });
  }

  return {
    start: () => listen(),
    upgrade,
    async stop() {
      stopping = true;
      clearInterval(sweep);
      for (const ws of sockets) ws.terminate();
      if (listener) await listener.end().catch(() => {});
    },
    get size() { return sockets.size; },
  };
}
