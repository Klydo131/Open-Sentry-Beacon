'use client';

// The sample church's Guide commitments. The tutorial has no database, so a
// signature is kept in this browser under the sample person's id: the same
// rules as the live table (lib/guide-commitments.ts), and nothing leaves.

import { COMMITMENTS_VERSION } from '@/lib/guide-commitments';

const key = (userId: string) => `hb-demo-commitments:${COMMITMENTS_VERSION}:${userId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64)}`;

export function demoSignedAt(userId: string): string | null {
  try { return localStorage.getItem(key(userId)); } catch { return null; }
}

export function demoSign(userId: string): string {
  const at = new Date().toISOString();
  try { localStorage.setItem(key(userId), at); } catch { /* a private window: signed for this visit */ }
  return at;
}
