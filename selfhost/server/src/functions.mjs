// The app's server-side functions (supabase/functions/*), run inside this
// server instead of on Supabase's edge. The SAME FILES, unchanged: each one
// calls Deno.serve(handler) when it loads, and the small Deno stand-in below
// keeps that handler, so /functions/v1/<name> reaches it.
//
// Each function talks to the database through supabase-js with the service
// key, exactly as it does on Supabase; here that client calls this server
// (sign-in, files, data), so it obeys the same rules a Supabase project would
// apply to it.

import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './config.mjs';
import { HttpError, readBody } from './http.mjs';

const NAME = /^[a-z][a-z0-9-]{0,40}$/;
const TIMEOUT_MS = 60_000;

export async function loadFunctions({ cfg, internalUrl }) {
  const handlers = new Map();
  const dir = path.join(REPO_ROOT, 'supabase/functions');
  const env = {
    SUPABASE_URL: internalUrl,
    SUPABASE_ANON_KEY: cfg.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: cfg.serviceKey,
  };
  let loading = '';
  globalThis.Deno = {
    env: {
      get: (name) => (Object.hasOwn(env, name) ? env[name] : cfg.env[name]),
      toObject: () => ({ ...cfg.env, ...env }),
    },
    serve(options, maybeHandler) {
      const handler = typeof options === 'function' ? options : maybeHandler;
      if (loading && typeof handler === 'function') handlers.set(loading, handler);
      return { finished: Promise.resolve(), shutdown: async () => {} };
    },
  };
  register(new URL('./functions-loader.mjs', import.meta.url));

  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
    const entry = path.join(dir, name, 'index.ts');
    if (!NAME.test(name) || !fs.existsSync(entry)) continue;
    loading = name;
    try {
      await import(pathToFileURL(entry).href);
    } catch (err) {
      console.error(JSON.stringify({ at: 'functions', function: name, error: `did not load: ${err.message}` }));
    }
    loading = '';
  }

  async function invoke(name, request) {
    const handler = handlers.get(name);
    if (!handler) throw new HttpError(404, `There is no function called ${name}.`, 'not_found');
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new HttpError(504, `The ${name} function took too long.`, 'timeout')), TIMEOUT_MS);
    });
    try {
      return await Promise.race([Promise.resolve(handler(request)), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Answer an HTTP request with the function's own Response. */
  async function handle(req, res, name, url) {
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req, 6 * 1024 * 1024);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value);
    }
    const request = new Request(`${internalUrl}/functions/v1/${name}${url.search}`, { method: req.method, headers, body });
    const response = await invoke(name, request);
    const outHeaders = {};
    response.headers.forEach((value, key) => { outHeaders[key] = value; });
    res.writeHead(response.status, outHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
  }

  return { names: [...handlers.keys()], invoke, handle };
}
