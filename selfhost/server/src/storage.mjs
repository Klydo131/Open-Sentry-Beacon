// Files: the part of Supabase's file store (Storage) that Hope Beacon uses,
// answering the same addresses, so supabase-js's storage calls work unchanged.
//
//   POST|PUT /object/:bucket/*path        upload (x-upsert to replace)
//   GET|HEAD /object[/authenticated]/:bucket/*path
//   POST     /object/sign/:bucket/*path   a link that works for a while
//   POST     /object/sign/:bucket         many of them at once
//   GET      /object/sign/:bucket/*path?token=…   what such a link opens
//   POST     /object/list/:bucket         a folder's contents
//   DELETE   /object/:bucket              remove (body: { prefixes: [...] })
//   GET      /object/public/:bucket/*path only for a bucket marked public
//
// WHO MAY DO WHAT is not decided here. Each of these runs as the person asking
// (src/db.mjs, asPerson), so the row rules the migrations put on
// storage.objects decide, as they do on Supabase. A signed link is the one
// exception: it was made by somebody the rules allowed, and its signature is
// the permission, for as long as it lasts.
//
// THE FILES are on disk under DATA_DIR/files/<bucket>/<row id>. Never under
// the name somebody chose, so no name can reach outside that folder.

import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { sign, verify } from './jwt.mjs';
import { HttpError, readBody, readJson, send, bearer } from './http.mjs';
import { asPerson } from './db.mjs';

const MAX_UPLOAD = 50 * 1024 * 1024;   // the largest bucket's limit
const MAX_SIGN_SECONDS = 365 * 24 * 3600;
const BUCKET = /^[a-z0-9][a-z0-9_.-]{0,62}$/i;

/** A name from the address, decoded, then checked. */
function cleanName(raw) {
  try {
    return checkName(decodeURIComponent(raw));
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'The file name is not valid.', 'InvalidKey');
  }
}

/** The names Supabase allows, and nothing that could mean "up a folder". */
function checkName(name) {
  if (typeof name !== 'string' || !name || name.length > 1024 || name.startsWith('/') || /[\u0000-\u001f\u007f\\]/.test(name)) {
    throw new HttpError(400, 'The file name is not valid.', 'InvalidKey');
  }
  if (name.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new HttpError(400, 'The file name is not valid.', 'InvalidKey');
  }
  return name;
}

function storageError(res, status, error, message) {
  send(res, status, { statusCode: String(status), error, message });
}

function mimeAllowed(allowed, mime) {
  if (!allowed || allowed.length === 0) return true;
  const type = String(mime || '').split(';')[0].trim().toLowerCase();
  return allowed.some((rule) => {
    const r = String(rule).toLowerCase();
    return r === type || (r.endsWith('/*') && type.startsWith(r.slice(0, -1)));
  });
}

export function createStorage({ cfg, pool, preRequest }) {
  const root = path.join(cfg.dataDir, 'files');

  const fileOf = (bucket, id) => path.join(root, bucket, id);

  function claimsOf(req) {
    const token = bearer(req) || String(req.headers.apikey || '');
    const claims = verify(token, cfg.jwtSecret);
    if (!claims || typeof claims.role !== 'string') {
      throw new HttpError(400, 'Invalid JWT', 'InvalidJWT');
    }
    return claims;
  }

  const person = (claims, work) => asPerson(pool, claims, work, { preRequest });

  async function bucketRow(id) {
    if (!BUCKET.test(id)) throw new HttpError(400, 'Bucket not found', 'Bucket not found');
    const { rows } = await pool.query('select * from storage.buckets where id = $1', [id]);
    if (!rows[0]) throw new HttpError(404, 'Bucket not found', 'Bucket not found');
    return rows[0];
  }

  async function readUpload(req, limit) {
    const type = String(req.headers['content-type'] || '');
    const raw = await readBody(req, limit + 64 * 1024);
    if (/^multipart\/form-data/i.test(type)) {
      // The platform's own multipart reader, the same one fetch() uses.
      const form = await new Request('http://upload.local/', {
        method: 'POST', headers: { 'content-type': type }, body: raw,
      }).formData();
      let file = null;
      for (const [, value] of form.entries()) {
        if (typeof value === 'object' && value && 'arrayBuffer' in value) { file = value; break; }
      }
      if (!file) throw new HttpError(400, 'No file was sent.', 'InvalidRequest');
      const cache = form.get('cacheControl');
      return {
        bytes: Buffer.from(await file.arrayBuffer()),
        mime: file.type || 'application/octet-stream',
        cacheControl: typeof cache === 'string' && /^\d+$/.test(cache) ? `max-age=${cache}` : 'max-age=3600',
      };
    }
    return {
      bytes: raw,
      mime: type.split(';')[0].trim() || 'application/octet-stream',
      cacheControl: String(req.headers['cache-control'] || 'max-age=3600').slice(0, 100),
    };
  }

  async function upload(req, res, bucketId, rawName, method) {
    const claims = claimsOf(req);
    const name = cleanName(rawName);
    const bucket = await bucketRow(bucketId);
    const limit = Math.min(MAX_UPLOAD, Number(bucket.file_size_limit) || MAX_UPLOAD);
    let body;
    try {
      body = await readUpload(req, limit);
    } catch (err) {
      if (err.status === 413) {
        return storageError(res, 413, 'Payload too large', 'The object exceeded the maximum allowed size');
      }
      throw err;
    }
    if (body.bytes.length > limit) {
      return storageError(res, 413, 'Payload too large', 'The object exceeded the maximum allowed size');
    }
    if (!mimeAllowed(bucket.allowed_mime_types, body.mime)) {
      return storageError(res, 415, 'invalid_mime_type', `mime type ${body.mime} is not supported`);
    }
    const upsert = method === 'PUT' || String(req.headers['x-upsert'] || '') === 'true';
    const sub = typeof claims.sub === 'string' ? claims.sub : null;
    const version = crypto.randomUUID();
    const metadata = {
      eTag: `"${crypto.createHash('md5').update(body.bytes).digest('hex')}"`,
      size: body.bytes.length,
      mimetype: body.mime,
      cacheControl: body.cacheControl,
      lastModified: new Date().toISOString(),
      contentLength: body.bytes.length,
      httpStatusCode: 200,
    };
    await fsp.mkdir(path.join(root, bucket.id), { recursive: true, mode: 0o700 });
    const temp = path.join(root, bucket.id, `.upload-${version}`);
    await fsp.writeFile(temp, body.bytes, { mode: 0o600 });
    try {
      const row = await person(claims, async (client) => {
        const sql = method === 'PUT'
          ? `update storage.objects set metadata = $3, version = $4, updated_at = now(), last_accessed_at = now()
              where bucket_id = $1 and name = $2 returning id`
          : upsert
            ? `insert into storage.objects (bucket_id, name, owner, owner_id, metadata, version)
               values ($1, $2, $3, $6, $4, $5)
               on conflict (bucket_id, name) do update
                 set metadata = excluded.metadata, version = excluded.version, owner = excluded.owner,
                     owner_id = excluded.owner_id, updated_at = now(), last_accessed_at = now()
               returning id`
            : `insert into storage.objects (bucket_id, name, owner, owner_id, metadata, version)
               values ($1, $2, $3, $6, $4, $5) returning id`;
        const params = method === 'PUT'
          ? [bucket.id, name, JSON.stringify(metadata), version]
          : [bucket.id, name, sub, JSON.stringify(metadata), version, sub];
        const { rows } = await client.query(sql, params);
        if (!rows[0]) throw new HttpError(404, 'Object not found', 'not_found');
        // In place before the row is committed: a committed row always has its file.
        await fsp.rename(temp, fileOf(bucket.id, rows[0].id));
        return rows[0];
      });
      send(res, 200, { Id: row.id, Key: `${bucket.id}/${name}` });
    } catch (err) {
      await fsp.rm(temp, { force: true });
      if (err.code === '23505') return storageError(res, 409, 'Duplicate', 'The resource already exists');
      if (err.code === '42501') {
        return storageError(res, 403, 'Unauthorized', 'new row violates row-level security policy');
      }
      throw err;
    }
  }

  async function serve(req, res, bucketId, row, { download } = {}) {
    const file = fileOf(bucketId, row.id);
    let stat;
    try {
      stat = await fsp.stat(file);
    } catch {
      return storageError(res, 404, 'not_found', 'Object not found');
    }
    const meta = row.metadata || {};
    const etag = meta.eTag || `"${row.id}"`;
    const headers = {
      'Content-Type': String(meta.mimetype || 'application/octet-stream'),
      'Content-Length': String(stat.size),
      ETag: etag,
      'Last-Modified': new Date(row.updated_at || stat.mtime).toUTCString(),
      'Cache-Control': `private, ${/^max-age=\d+$/.test(meta.cacheControl || '') ? meta.cacheControl : 'max-age=3600'}`,
      // A file somebody uploaded is never a page that can run on this address.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    };
    if (download !== undefined && download !== null) {
      const fallback = path.basename(row.name || 'file');
      const chosen = download || fallback;
      headers['Content-Disposition'] = `attachment; filename*=UTF-8''${encodeURIComponent(chosen)}`;
    }
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag });
      return res.end();
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    await pipeline(fs.createReadStream(file), res);
  }

  async function read(req, res, bucketId, rawName) {
    const claims = claimsOf(req);
    const name = cleanName(rawName);
    await bucketRow(bucketId);
    const row = await person(claims, async (client) => {
      const { rows } = await client.query(
        'select id, name, metadata, updated_at from storage.objects where bucket_id = $1 and name = $2', [bucketId, name]);
      return rows[0];
    });
    if (!row) return storageError(res, 400, 'not_found', 'Object not found');
    return serve(req, res, bucketId, row);
  }

  const signedPath = (bucket, name, expiresIn) => {
    const iat = Math.floor(Date.now() / 1000);
    const token = sign({ url: `${bucket}/${name}`, iat, exp: iat + expiresIn }, cfg.jwtSecret);
    return `/object/sign/${bucket}/${name.split('/').map(encodeURIComponent).join('/')}?token=${token}`;
  };

  function expiry(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) throw new HttpError(400, 'expiresIn must be a number of seconds.', 'InvalidRequest');
    return Math.min(Math.floor(n), MAX_SIGN_SECONDS);
  }

  async function signOne(req, res, bucketId, rawName) {
    const claims = claimsOf(req);
    const name = cleanName(rawName);
    const body = await readJson(req);
    const seconds = expiry(body.expiresIn);
    await bucketRow(bucketId);
    const found = await person(claims, async (client) => {
      const { rowCount } = await client.query(
        'select 1 from storage.objects where bucket_id = $1 and name = $2', [bucketId, name]);
      return rowCount > 0;
    });
    if (!found) return storageError(res, 400, 'not_found', 'Object not found');
    send(res, 200, { signedURL: signedPath(bucketId, name, seconds) });
  }

  async function signMany(req, res, bucketId) {
    const claims = claimsOf(req);
    const body = await readJson(req, 1024 * 1024);
    const seconds = expiry(body.expiresIn);
    const paths = Array.isArray(body.paths) ? body.paths.slice(0, 1000).map(String) : [];
    await bucketRow(bucketId);
    const names = paths.map((p) => {
      try { return checkName(p); } catch { return null; }
    });
    const visible = await person(claims, async (client) => {
      const { rows } = await client.query(
        'select name from storage.objects where bucket_id = $1 and name = any($2)', [bucketId, names.filter(Boolean)]);
      return new Set(rows.map((r) => r.name));
    });
    send(res, 200, paths.map((p, i) => (names[i] && visible.has(names[i])
      ? { path: p, signedURL: signedPath(bucketId, names[i], seconds), error: null }
      : { path: p, signedURL: null, error: 'Either the object does not exist or you do not have access to it' })));
  }

  async function openSigned(req, res, bucketId, rawName, url) {
    const name = cleanName(rawName);
    const claims = verify(url.searchParams.get('token') || '', cfg.jwtSecret, { leeway: 0 });
    if (!claims || claims.url !== `${bucketId}/${name}` || typeof claims.exp !== 'number') {
      return storageError(res, 400, 'InvalidSignature', 'The signature is not valid, or the link has expired.');
    }
    const { rows } = await pool.query(
      'select id, name, metadata, updated_at from storage.objects where bucket_id = $1 and name = $2', [bucketId, name]);
    if (!rows[0]) return storageError(res, 400, 'not_found', 'Object not found');
    return serve(req, res, bucketId, rows[0], { download: url.searchParams.has('download') ? url.searchParams.get('download') : undefined });
  }

  async function openPublic(req, res, bucketId, rawName) {
    const name = cleanName(rawName);
    const bucket = await bucketRow(bucketId);
    if (!bucket.public) return storageError(res, 400, 'not_found', 'Object not found');
    const { rows } = await pool.query(
      'select id, name, metadata, updated_at from storage.objects where bucket_id = $1 and name = $2', [bucketId, name]);
    if (!rows[0]) return storageError(res, 400, 'not_found', 'Object not found');
    return serve(req, res, bucketId, rows[0]);
  }

  async function list(req, res, bucketId) {
    const claims = claimsOf(req);
    const body = await readJson(req);
    await bucketRow(bucketId);
    let prefix = typeof body.prefix === 'string' ? body.prefix : '';
    if (prefix && !prefix.endsWith('/')) prefix += '/';
    if (prefix.startsWith('/') || prefix.includes('..')) throw new HttpError(400, 'The folder name is not valid.', 'InvalidKey');
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 1000);
    const offset = Math.max(Number(body.offset) || 0, 0);
    const search = typeof body.search === 'string' ? body.search.toLowerCase() : '';
    const order = body.sortBy?.order === 'desc' ? -1 : 1;
    const column = ['name', 'updated_at', 'created_at', 'last_accessed_at'].includes(body.sortBy?.column) ? body.sortBy.column : 'name';

    const rows = await person(claims, async (client) => {
      const like = `${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const { rows: found } = await client.query(
        `select id, name, updated_at, created_at, last_accessed_at, metadata from storage.objects
          where bucket_id = $1 and name like $2 order by name limit 10000`, [bucketId, like]);
      return found;
    });
    const entries = new Map();
    for (const r of rows) {
      const rest = r.name.slice(prefix.length);
      const slash = rest.indexOf('/');
      if (slash >= 0) {
        const folder = rest.slice(0, slash);
        if (!entries.has(`d:${folder}`)) {
          entries.set(`d:${folder}`, { name: folder, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null });
        }
      } else {
        entries.set(`f:${rest}`, { ...r, name: rest });
      }
    }
    let out = [...entries.values()];
    if (search) out = out.filter((e) => e.name.toLowerCase().includes(search));
    out.sort((a, b) => {
      const x = a[column] ?? '';
      const y = b[column] ?? '';
      return (x < y ? -1 : x > y ? 1 : 0) * order;
    });
    send(res, 200, out.slice(offset, offset + limit));
  }

  async function remove(req, res, bucketId, singleName) {
    const claims = claimsOf(req);
    let names;
    if (singleName !== undefined) {
      names = [cleanName(singleName)];
    } else {
      const body = await readJson(req, 1024 * 1024);
      names = (Array.isArray(body.prefixes) ? body.prefixes : []).slice(0, 1000).map(String)
        .map((p) => { try { return checkName(p); } catch { return null; } })
        .filter(Boolean);
    }
    await bucketRow(bucketId);
    const gone = await person(claims, async (client) => {
      const { rows } = await client.query(
        `delete from storage.objects where bucket_id = $1 and name = any($2)
         returning id, name, bucket_id, owner, updated_at, created_at, last_accessed_at, metadata`, [bucketId, names]);
      return rows;
    });
    // Only after the rows are gone for good. A file whose row survived (the
    // rules refused) stays.
    await Promise.all(gone.map((r) => fsp.rm(fileOf(bucketId, r.id), { force: true })));
    send(res, 200, gone);
  }

  async function handle(req, res, sub, url) {
    const m = req.method;
    let match;
    if ((match = /^\/object\/sign\/([^/]+)\/(.+)$/.exec(sub))) {
      if (m === 'GET' || m === 'HEAD') return openSigned(req, res, match[1], match[2], url);
      if (m === 'POST') return signOne(req, res, match[1], match[2]);
    }
    if ((match = /^\/object\/sign\/([^/]+)$/.exec(sub)) && m === 'POST') return signMany(req, res, match[1]);
    if ((match = /^\/object\/list\/([^/]+)$/.exec(sub)) && m === 'POST') return list(req, res, match[1]);
    if ((match = /^\/object\/public\/([^/]+)\/(.+)$/.exec(sub)) && (m === 'GET' || m === 'HEAD')) {
      return openPublic(req, res, match[1], match[2]);
    }
    if ((match = /^\/object\/authenticated\/([^/]+)\/(.+)$/.exec(sub)) && (m === 'GET' || m === 'HEAD')) {
      return read(req, res, match[1], match[2]);
    }
    if ((match = /^\/object\/([^/]+)$/.exec(sub)) && m === 'DELETE') return remove(req, res, match[1]);
    if ((match = /^\/object\/([^/]+)\/(.+)$/.exec(sub))) {
      if (m === 'POST' || m === 'PUT') return upload(req, res, match[1], match[2], m);
      if (m === 'GET' || m === 'HEAD') return read(req, res, match[1], match[2]);
      if (m === 'DELETE') return remove(req, res, match[1], match[2]);
    }
    throw new HttpError(404, 'Not found', 'not_found');
  }

  /** Signed links open without an API key, as on Supabase: an <img> cannot send one. */
  const isOpenRoute = (sub, method) =>
    (method === 'GET' || method === 'HEAD') && /^\/object\/(sign|public)\//.test(sub);

  return { handle, isOpenRoute };
}
