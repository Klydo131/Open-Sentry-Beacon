// The Beacon server: the one address the app talks to on plain Postgres.
//
//   /rest/v1/*         the data API, passed to PostgREST
//   /auth/v1/*         sign-in (src/auth.mjs)
//   /storage/v1/*      files (src/storage.mjs)
//   /functions/v1/*    the app's own functions (src/functions.mjs)
//   /realtime/v1/websocket   live data (src/realtime.mjs)
//
// The same addresses as a Supabase project, so the app is pointed here by
// NEXT_PUBLIC_SUPABASE_URL and changes nothing else. Like Supabase's gateway,
// every request must carry the project's API key (ANON_KEY or
// SERVICE_ROLE_KEY); a signed file link is the one exception, because an
// <img> cannot send one.

import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { readConfig } from './config.mjs';
import { createPool, readPreRequest } from './db.mjs';
import { migrate } from './migrate.mjs';
import { verify } from './jwt.mjs';
import { createMailer } from './mail.mjs';
import { createAuth } from './auth.mjs';
import { createStorage } from './storage.mjs';
import { createRealtime } from './realtime.mjs';
import { loadFunctions } from './functions.mjs';
import { createJobs } from './jobs.mjs';
import { HttpError, cors, send, sendError, bearer } from './http.mjs';

const sameKey = (a, b) => {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};

/** Pass a data request to PostgREST and its answer back, streamed both ways. */
function proxy(req, res, target, apikey) {
  return new Promise((resolve) => {
    const headers = { ...req.headers };
    delete headers.host;
    delete headers.connection;
    delete headers.apikey;
    if (!headers.authorization) headers.authorization = `Bearer ${apikey}`;
    const upstream = http.request(target, { method: req.method, headers }, (answer) => {
      const out = { ...answer.headers };
      delete out.connection;
      res.writeHead(answer.statusCode || 502, out);
      answer.pipe(res);
      answer.on('end', resolve);
    });
    upstream.on('error', () => {
      if (!res.headersSent) send(res, 503, { message: 'The data API is not answering. Is PostgREST running?' });
      resolve();
    });
    req.pipe(upstream);
  });
}

export async function startServer(env = process.env) {
  const cfg = readConfig(env);
  for (const [name, token, role] of [['ANON_KEY', cfg.anonKey, 'anon'], ['SERVICE_ROLE_KEY', cfg.serviceKey, 'service_role']]) {
    if (verify(token, cfg.jwtSecret)?.role !== role) {
      throw new Error(`${name} was not made from this JWT_SECRET (or is not the ${role} key). Run \`npm run keys\` again and use all three together.`);
    }
  }
  fs.mkdirSync(cfg.dataDir, { recursive: true, mode: 0o700 });

  if (!/^(0|false|no)$/i.test(env.MIGRATE_ON_START || '')) {
    await migrate({
      databaseUrl: cfg.databaseUrl,
      authenticatorPassword: env.AUTHENTICATOR_PASSWORD || '',
      pushConfigured: Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
      log: (line) => { if (!line.startsWith('applied ')) console.log(JSON.stringify({ at: 'migrate', note: line })); },
    });
  }

  const pool = createPool(cfg.databaseUrl, Number(env.DB_POOL) || 10);
  const preRequest = await readPreRequest(pool);
  const internalUrl = `http://127.0.0.1:${cfg.port}`;
  const mailer = createMailer(cfg);
  const auth = createAuth({ cfg, pool, mailer });
  const storage = createStorage({ cfg, pool, preRequest });
  const realtime = createRealtime({ cfg, pool, preRequest, keys: { anon: cfg.anonKey, service: cfg.serviceKey } });
  const functions = await loadFunctions({ cfg, internalUrl });
  const jobs = createJobs({ cfg, pool, functions });

  const server = http.createServer(async (req, res) => {
    const started = Date.now();
    let url;
    try {
      url = new URL(req.url || '/', 'http://beacon.local');
    } catch {
      return send(res, 400, { message: 'Bad address.' });
    }
    res.on('finish', () => {
      if (url.pathname !== '/health') {
        console.log(JSON.stringify({ at: 'http', method: req.method, path: url.pathname.replace(/\/[0-9a-f-]{36}/gi, '/:id').slice(0, 120), status: res.statusCode, ms: Date.now() - started }));
      }
    });
    try {
      if (cors(req, res, cfg.allowedOrigins)) return undefined;
      const p = url.pathname;
      if (p === '/health' || p === '/') return send(res, 200, { ok: true, functions: functions.names, realtime: realtime.size });

      const apikey = String(req.headers.apikey || url.searchParams.get('apikey') || '');
      const keyOk = sameKey(apikey, cfg.anonKey) || sameKey(apikey, cfg.serviceKey);

      if (p.startsWith('/storage/v1/')) {
        const sub = p.slice('/storage/v1'.length);
        if (!keyOk && !storage.isOpenRoute(sub, req.method)) throw new HttpError(401, 'No API key found in request', 'no_api_key');
        return await storage.handle(req, res, sub, url);
      }
      if (!keyOk) throw new HttpError(401, 'No API key found in request', 'no_api_key');

      if (p.startsWith('/rest/v1/') || p === '/rest/v1') {
        return await proxy(req, res, `${cfg.postgrestUrl}${p.slice('/rest/v1'.length) || '/'}${url.search}`, apikey);
      }
      if (p.startsWith('/auth/v1/')) return await auth.handle(req, res, p.slice('/auth/v1'.length), url);
      const fn = /^\/functions\/v1\/([a-z][a-z0-9-]{0,40})\/?$/.exec(p);
      if (fn) {
        // Like Supabase's gateway, a function is reached with a token this
        // project signed (the anon key will do); what it then allows is the
        // function's own decision.
        if (!verify(bearer(req), cfg.jwtSecret)) throw new HttpError(401, 'Invalid JWT', 'invalid_jwt');
        return await functions.handle(req, res, fn[1], url);
      }
      throw new HttpError(404, 'Not found', 'not_found');
    } catch (err) {
      return sendError(res, err);
    }
  });

  server.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url || '/', 'http://beacon.local');
    } catch {
      socket.destroy();
      return;
    }
    if (url.pathname === '/realtime/v1/websocket') realtime.upgrade(req, socket, head, url);
    else socket.destroy();
  });

  server.requestTimeout = 120_000;
  server.headersTimeout = 30_000;
  await new Promise((resolve) => server.listen(cfg.port, cfg.host, resolve));
  await realtime.start();
  if (cfg.jobs) await jobs.start();
  console.log(JSON.stringify({
    at: 'start', port: cfg.port, functions: functions.names, mail: mailer.configured ? 'smtp' : 'outbox (no SMTP set)',
    signup: cfg.signupEnabled ? 'open' : 'closed', jobs: cfg.jobs,
  }));

  async function stop() {
    await jobs.stop();
    await realtime.stop();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  }
  return { server, stop, cfg, jobs, pool };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const running = await startServer();
    const shutdown = () => { running.stop().finally(() => process.exit(0)); };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}
