// Six-digit codes from an authenticator app (RFC 6238: SHA-1, 30 seconds, six
// digits), which is what Google Authenticator, Microsoft Authenticator,
// 1Password and Aegis all speak.

import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('not base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(crypto.randomBytes(20));

export const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / 30);

export function codeFor(secret, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const bin = ((mac[offset] & 127) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/**
 * The step this code belongs to, or -1. One step either side is accepted,
 * because a phone's clock and a person's typing are both a little late.
 */
export function matchStep(secret, code, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return -1;
  const here = stepAt(now);
  let found = -1;
  for (const step of [here - 1, here, here + 1]) {
    const expected = Buffer.from(codeFor(secret, step));
    // Every candidate is compared, in constant time, whichever matches.
    if (crypto.timingSafeEqual(expected, Buffer.from(code)) && found < 0) found = step;
  }
  return found;
}

export function otpauthUri({ issuer, account, secret }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
