// Feedback on the sample side of the app: what was sent from this device, and
// what a reviewer here has done with it.
//
// The sample has no database. Feedback sent from it is kept on the device
// (lib/backend/feedback.ts, localFeedbackSink), so the sample's inbox reads it
// from there, and keeps each write-up and status beside it under a key of its
// own. That way somebody trying the walkthrough can send feedback as an
// Explorer, review it as a Director and see the result as the sender, with the
// same screen the live inbox uses (components/FeedbackReviewInbox.tsx).
//
// The same rules as the live table hold here because the same code builds what
// is handed on (lib/feedback/hand-on.ts): nothing leaves before a write-up, and
// the write-up never carries the sender's own words.

import { readLocalFeedback } from '@/lib/backend/feedback';
import { EMPTY_REVIEW, type FeedbackReview, type FeedbackStatus } from '@/lib/feedback/hand-on';

const REVIEW_KEY = 'hope-beacon.feedback.review';

interface KeptReview {
  status: FeedbackStatus;
  reply: string | null;
  fixedIn: string | null;
  review: FeedbackReview;
}

/** One piece of feedback sent from this device, with what became of it. */
export interface DeviceFeedback {
  id: string;
  category: string;
  message: string;
  contact: string | null;
  page: string | null;
  build: string | null;
  createdAt: string;
  status: FeedbackStatus;
  reply: string | null;
  fixedIn: string | null;
  review: FeedbackReview;
}

function readReviews(): Record<string, KeptReview> {
  try {
    const raw = localStorage.getItem(REVIEW_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed as Record<string, KeptReview> : {};
  } catch {
    return {};
  }
}

function writeReviews(all: Record<string, KeptReview>): void {
  try {
    localStorage.setItem(REVIEW_KEY, JSON.stringify(all));
  } catch {
    throw new Error('This browser would not keep that. Private browsing can stop it.');
  }
}

/** Everything sent from this device, newest first, with its status and write-up. */
export function readDeviceFeedback(): DeviceFeedback[] {
  const reviews = readReviews();
  return readLocalFeedback().map((m) => {
    const kept = reviews[m.id];
    return {
      id: m.id,
      category: m.category,
      message: m.message,
      contact: m.contact || null,
      page: m.page || null,
      build: m.build || null,
      createdAt: m.at,
      status: kept?.status ?? 'new',
      reply: kept?.reply ?? null,
      fixedIn: kept?.fixedIn ?? null,
      review: { ...EMPTY_REVIEW, ...kept?.review },
    };
  });
}

function update(id: string, change: (kept: KeptReview) => KeptReview): void {
  const all = readReviews();
  const kept = all[id] ?? { status: 'new', reply: null, fixedIn: null, review: EMPTY_REVIEW };
  all[id] = change(kept);
  writeReviews(all);
}

/** Keep a reviewer's write-up. */
export function saveDeviceReview(id: string, review: FeedbackReview): void {
  update(id, (kept) => ({ ...kept, review }));
}

/** Move feedback along, as the live table's status does. */
export function setDeviceStatus(id: string, status: FeedbackStatus, extra: { reply?: string | null; fixedIn?: string | null } = {}): void {
  update(id, (kept) => ({
    ...kept,
    status,
    reply: extra.reply !== undefined ? extra.reply : kept.reply,
    fixedIn: extra.fixedIn !== undefined ? extra.fixedIn : kept.fixedIn,
  }));
}
