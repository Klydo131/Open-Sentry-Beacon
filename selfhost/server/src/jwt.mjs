// Signed tokens (HS256), the kind Supabase and PostgREST use. One secret signs
// every token, and PostgREST checks the same secret, so a token this server
// issues is a token the data API believes, and nothing else is.

import crypto from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const HEADER = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));

export function sign(claims, secret) {
  const body = b64url(JSON.stringify(claims));
  const mac = crypto.createHmac('sha256', secret).update(`${HEADER}.${body}`).digest();
  return `${HEADER}.${body}.${b64url(mac)}`;
}

/**
 * The claims, or null. Null for anything that is not exactly a token this
 * secret signed with HS256 and that has not expired: a different algorithm
 * ("none" included) is refused before its signature is even read.
 */
export function verify(token, secret, { now = Math.floor(Date.now() / 1000), leeway = 30 } = {}) {
  if (typeof token !== 'string' || token.length > 8192) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (header?.alg !== 'HS256' || typeof claims !== 'object' || claims === null) return null;
  const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
  let given;
  try {
    given = Buffer.from(parts[2], 'base64url');
  } catch {
    return null;
  }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  if (typeof claims.exp === 'number' && claims.exp + leeway < now) return null;
  if (typeof claims.nbf === 'number' && claims.nbf - leeway > now) return null;
  return claims;
}
