// A v4 UUID that works everywhere the app runs.
//
// WHY THIS FILE EXISTS. `crypto.randomUUID()` is a SECURE-CONTEXT api. It is
// undefined over plain `http://` on a LAN address — which is exactly how a
// church tries the app on its own machine or office network first — and it is
// absent in Safari before 15.4. Unguarded it does not degrade, it throws, so
// whatever the caller was doing fails outright: no attachment, no feedback, no
// error anybody can act on.
//
// `crypto.getRandomValues()` has no such restriction. It is available on plain
// http, in every browser that matters, and it is what the fallback uses. So the
// result is a real random v4 UUID on every platform, not a weaker id on the
// older ones — which matters because the previous fallback here was
// `Math.random()`, and a value that merely looks like an id is the kind of thing
// somebody later treats as one.
//
// This mirrors lib/uuid.ts in the private application repositories. Keep the two
// identical; they exist separately only because these projects share no code.
export function uuid(): string {
  const c = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  if (!c || typeof c.getRandomValues !== 'function') {
    // No Web Crypto at all. Nothing here is a secret or a permission — these ids
    // name a row in the caller's own storage — so a weak id is survivable and a
    // thrown ReferenceError is not.
    const weak = `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`.padEnd(32, '0');
    return format(weak.slice(0, 32));
  }
  const bytes = c.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  return format([...bytes].map((n) => n.toString(16).padStart(2, '0')).join(''));
}

function format(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
