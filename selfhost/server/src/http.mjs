// Small pieces every route uses: reading a body with a ceiling, answering in
// JSON, and the cross-site rules.

export class HttpError extends Error {
  constructor(status, message, code = '', extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

/** The whole body, refused once it passes `limit` bytes. */
export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      req.resume();
      reject(new HttpError(413, 'That is larger than this server accepts.', 'payload_too_large'));
      return;
    }
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        req.removeAllListeners('data');
        req.resume();
        reject(new HttpError(413, 'That is larger than this server accepts.', 'payload_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function readJson(req, limit = 64 * 1024) {
  const raw = await readBody(req, limit);
  if (raw.length === 0) return {};
  try {
    const value = JSON.parse(raw.toString('utf8'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON.', 'bad_json');
  }
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
};

export function send(res, status, body, headers = {}) {
  if (res.headersSent) return;
  const payload = body === undefined || status === 204 ? '' : JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    ...(payload ? { 'Content-Type': 'application/json; charset=utf-8' } : {}),
    ...headers,
  });
  res.end(payload);
}

/** Supabase's error shape, which supabase-js reads: msg, code, error_code. */
export function sendError(res, err) {
  if (err instanceof HttpError) {
    send(res, err.status, {
      code: err.status,
      error_code: err.code || undefined,
      msg: err.message,
      message: err.message,
      error: err.code || 'error',
      error_description: err.message,
      ...err.extra,
    });
    return;
  }
  console.error(JSON.stringify({ at: 'http', error: String(err?.stack || err).slice(0, 2000) }));
  send(res, 500, { code: 500, msg: 'Something went wrong on the server.', message: 'Something went wrong on the server.' });
}

/**
 * Cross-site rules. The app is on another address, so the browser asks first.
 * Only the app's own addresses are answered; the tokens travel in headers,
 * never in cookies, so nothing here relies on the browser's cookie rules.
 */
export function cors(req, res, allowedOrigins) {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || allowedOrigins.includes('*'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] || 'authorization, apikey, content-type, x-client-info, x-upsert, prefer, range, accept-profile, content-profile, cache-control, x-supabase-api-version');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Location, ETag, Location, X-Supabase-Api-Version');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return true;
  }
  return false;
}

/** The caller's address: the socket's, or the proxy's report of it when one is trusted. */
export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || '';
}

export function bearer(req) {
  const value = String(req.headers.authorization || '');
  return /^Bearer\s+/i.test(value) ? value.replace(/^Bearer\s+/i, '').trim() : '';
}
