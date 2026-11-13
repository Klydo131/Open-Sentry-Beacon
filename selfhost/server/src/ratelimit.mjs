// Counting attempts, so a password or a six-digit code cannot be guessed by
// trying. Kept in memory: one server is the expected size of a church, and a
// restart forgetting the counts costs an attacker nothing they could not get
// by waiting. Run two servers behind one address and each keeps its own count.

export class Limiter {
  constructor({ limit, windowMs }) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }

  /** Seconds to wait, or 0 when this attempt may go ahead (and is counted). */
  take(key, now = Date.now()) {
    const kept = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (kept.length >= this.limit) {
      this.hits.set(key, kept);
      return Math.max(1, Math.ceil((kept[0] + this.windowMs - now) / 1000));
    }
    kept.push(now);
    this.hits.set(key, kept);
    if (this.hits.size > 50_000) this.sweep(now);
    return 0;
  }

  sweep(now = Date.now()) {
    for (const [key, times] of this.hits) {
      if (!times.some((t) => now - t < this.windowMs)) this.hits.delete(key);
    }
  }
}
